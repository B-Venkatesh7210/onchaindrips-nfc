/**
 * POST /sponsor — validate tx (claim_and_transfer, shirt claimable in DB), attach sponsor gas, sign, return bytes + sponsor signature.
 */

import type { Request, Response } from "express";
import { fromBase64, toBase64 } from "@mysten/bcs";
import { SuiClient } from "@mysten/sui/client";
import { parseSerializedSignature } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { config } from "../config.js";
import { getSupabase, isShirtClaimable } from "../supabase.js";
import { loadSponsorKeypair } from "../keypair.js";

const PACKAGE_ID = config.packageId;

/** Resolve an input index to an object ID from the transaction's inputs. */
function getObjectIdFromInput(inputs: unknown[], arg: { Input?: number; [k: string]: unknown }): string | null {
  const idx = arg.Input;
  if (typeof idx !== "number" || idx < 0 || idx >= inputs.length) return null;
  const input = inputs[idx] as Record<string, unknown>;
  const obj = input?.Object as Record<string, { objectId?: string }> | undefined;
  const id =
    obj?.ImmOrOwnedObject?.objectId ?? obj?.SharedObject?.objectId ?? obj?.objectId ?? (input as { objectId?: string }).objectId;
  return typeof id === "string" ? id : null;
}

/** Check if the transaction kind is a single MoveCall to our claim_and_transfer and return the Shirt object ID. */
function getShirtIdFromClaimTx(
  commands: { $kind?: string; MoveCall?: { package: string; module: string; function: string; arguments: unknown[] } }[],
  inputs: unknown[],
): { ok: true; shirtObjectId: string } | { ok: false; error: string } {
  if (!commands || commands.length !== 1) {
    return { ok: false, error: "Transaction must contain exactly one command" };
  }

  const cmd = commands[0];
  const moveCall = cmd?.MoveCall ?? (cmd as Record<string, unknown>).MoveCall;
  if (!moveCall || typeof moveCall !== "object") {
    return { ok: false, error: "Transaction must be a MoveCall" };
  }
  const mc = moveCall as { package: string; module: string; function: string; arguments: unknown[] };

  const pkg = normalizeSuiAddress(mc.package);
  const ourPkg = normalizeSuiAddress(PACKAGE_ID);
  if (pkg !== ourPkg || mc.module !== "onchaindrips" || mc.function !== "claim_and_transfer") {
    return { ok: false, error: "Transaction must call claim_and_transfer on our package" };
  }

  const args = mc.arguments ?? [];
  const shirtArg = args[0];
  if (!shirtArg || typeof shirtArg !== "object") {
    return { ok: false, error: "Missing Shirt argument" };
  }

  const shirtObjectId = getObjectIdFromInput(inputs, shirtArg as { Input?: number });
  if (!shirtObjectId) {
    return { ok: false, error: "Could not resolve Shirt object ID from transaction" };
  }

  return { ok: true, shirtObjectId };
}

export async function sponsorHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as { txBytesBase64?: string; userSignatureBase64?: string; senderAddress?: string };
  const txBytesBase64 = body?.txBytesBase64;
  const userSignatureBase64 = body?.userSignatureBase64;
  const senderAddressFromClient = body?.senderAddress;

  if (!txBytesBase64 || typeof txBytesBase64 !== "string") {
    res.status(400).json({ error: "txBytesBase64 is required" });
    return;
  }
  if (!userSignatureBase64 || typeof userSignatureBase64 !== "string") {
    res.status(400).json({ error: "userSignatureBase64 is required" });
    return;
  }

  let kindBytes: Uint8Array;
  try {
    kindBytes = fromBase64(txBytesBase64);
  } catch {
    res.status(400).json({ error: "txBytesBase64 is invalid base64" });
    return;
  }

  let sender: string;
  if (typeof senderAddressFromClient === "string" && senderAddressFromClient.length > 0) {
    // zkLogin: client sends sender address (signature format doesn't expose public key)
    sender = normalizeSuiAddress(senderAddressFromClient);
  } else {
    try {
      const parsed = parseSerializedSignature(userSignatureBase64);
      if (!("publicKey" in parsed) || !parsed.publicKey) {
        res.status(400).json({ error: "userSignatureBase64 could not be parsed to get sender" });
        return;
      }
      sender = parsed.publicKey.toSuiAddress();
    } catch {
      res.status(400).json({ error: "userSignatureBase64 is invalid" });
      return;
    }
  }

  let tx: Transaction;
  try {
    tx = Transaction.fromKind(kindBytes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: "Invalid transaction kind bytes", details: msg });
    return;
  }

  const data = tx.getData();
  const commands = (data as { commands?: unknown[] }).commands ?? [];
  const inputs = (data as { inputs?: unknown[] }).inputs ?? [];
  const validation = getShirtIdFromClaimTx(
    commands as { MoveCall?: { package: string; module: string; function: string; arguments: unknown[] } }[],
    inputs,
  );

  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const supabase = getSupabase();
  if (!supabase) {
    res.status(503).json({ error: "Sponsor service unavailable (Supabase not configured)" });
    return;
  }
  const claimable = await isShirtClaimable(validation.shirtObjectId);
  if (!claimable) {
    res.status(400).json({
      error: "Shirt is not claimable (not in database or already minted)",
    });
    return;
  }

  const client = new SuiClient({ url: config.rpcUrl });
  const sponsorKeypair = loadSponsorKeypair();
  const sponsorAddress = sponsorKeypair.toSuiAddress();

  try {
    const coins = await client.getCoins({
      owner: sponsorAddress,
      coinType: "0x2::sui::SUI",
    });

    if (!coins.data.length) {
      res.status(503).json({ error: "Sponsor has no SUI for gas" });
      return;
    }

    const gasCoin = coins.data[0];
    tx.setSender(sender);
    tx.setGasOwner(sponsorAddress);
    tx.setGasPayment([
      {
        objectId: gasCoin.coinObjectId,
        version: gasCoin.version,
        digest: gasCoin.digest,
      },
    ]);

    const builtBytes = await tx.build({ client });
    const { signature } = await sponsorKeypair.signTransaction(builtBytes);
    const sponsorSignatureBase64 = typeof signature === "string" ? signature : toBase64(signature);

    res.json({
      sponsoredTxBytesBase64: toBase64(builtBytes),
      sponsorSignatureBase64,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Failed to sponsor transaction", details: message });
  }
}
