/**
 * POST /claim — backend builds claim_and_transfer(shirt, recipient), signs as shirt owner (sponsor), executes.
 * The Shirt is owned by the sponsor wallet (from mint_shirts), so the sponsor must be the transaction sender.
 */

import type { Request, Response } from "express";
import { toBase64 } from "@mysten/bcs";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { config } from "../config.js";
import { getSupabase, isShirtClaimable } from "../supabase.js";
import { loadSponsorKeypair } from "../keypair.js";

const PACKAGE_ID = config.packageId;

export async function claimHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as { shirtObjectId?: string; recipientAddress?: string };
  const shirtObjectId = body?.shirtObjectId;
  const recipientAddress = body?.recipientAddress;

  if (!shirtObjectId || typeof shirtObjectId !== "string" || !shirtObjectId.trim()) {
    res.status(400).json({ error: "shirtObjectId is required" });
    return;
  }
  if (!recipientAddress || typeof recipientAddress !== "string" || !recipientAddress.trim()) {
    res.status(400).json({ error: "recipientAddress is required" });
    return;
  }

  const shirtId = normalizeSuiAddress(shirtObjectId);
  const recipient = normalizeSuiAddress(recipientAddress);

  let claimable: boolean;
  try {
    const supabase = getSupabase();
    if (!supabase) {
      res.status(503).json({ error: "Claim service unavailable (Supabase not configured)" });
      return;
    }
    claimable = await isShirtClaimable(shirtId);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[claim] Supabase check failed:", message);
    res.status(503).json({ error: "Claim check failed", details: message });
    return;
  }
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
    const shirtObj = await client.getObject({ id: shirtId, options: { showContent: true } });
    const content = shirtObj.data?.content;
    if (content?.dataType !== "moveObject") {
      res.status(400).json({ error: "Shirt object not found or invalid" });
      return;
    }
    const fields = (content as { fields?: Record<string, unknown> }).fields;
    const dropId = typeof fields?.drop_id === "string" ? normalizeSuiAddress(fields.drop_id) : null;
    if (!dropId) {
      res.status(400).json({ error: "Could not read drop_id from shirt" });
      return;
    }

    const coins = await client.getCoins({
      owner: sponsorAddress,
      coinType: "0x2::sui::SUI",
    });

    if (!coins.data.length) {
      res.status(503).json({ error: "Sponsor has no SUI for gas" });
      return;
    }

    const gasCoin = coins.data[0];
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::onchaindrips::claim_and_transfer`,
      arguments: [
        tx.object(shirtId),
        tx.object(dropId),
        tx.pure.address(recipient),
        tx.object("0x6"), // Clock
      ],
    });
    tx.setSender(sponsorAddress);
    tx.setGasPayment([
      {
        objectId: gasCoin.coinObjectId,
        version: gasCoin.version,
        digest: gasCoin.digest,
      },
    ]);

    const builtBytes = await tx.build({ client });
    const { signature } = await sponsorKeypair.signTransaction(builtBytes);
    const signatureBase64 = typeof signature === "string" ? signature : toBase64(signature);

    const result = await client.executeTransactionBlock({
      transactionBlock: builtBytes,
      signature: signatureBase64,
      options: { showEffects: true },
    });

    if (result.effects?.status?.status !== "success") {
      const err = result.effects?.status?.error ?? result.effects?.status?.status;
      res.status(500).json({ error: "Transaction failed", details: String(err) });
      return;
    }

    const digest = result.digest;
    const supabase = getSupabase();
    if (supabase && digest) {
      await supabase.from("claims").insert({
        shirt_object_id: shirtId,
        drop_object_id: dropId,
        recipient_address: recipient,
        tx_digest: digest,
      });
      await supabase
        .from("shirts")
        .update({
          is_minted: true,
          minted_at_ms: Date.now(),
          current_owner_address: recipient,
          updated_at: new Date().toISOString(),
        })
        .eq("object_id", shirtId);
      // Sync drop.minted_count from chain so DB stays in sync
      try {
        const dropObj = await client.getObject({ id: dropId, options: { showContent: true } });
        const content = dropObj.data?.content;
        if (content?.dataType === "moveObject") {
          const fields = (content as { fields?: Record<string, unknown> }).fields;
          const raw = fields?.minted_count;
          const count =
            typeof raw === "number"
              ? raw
              : typeof raw === "string"
                ? Number(raw)
                : Number(raw);
          if (!Number.isNaN(count)) {
            await supabase.from("drops").update({ minted_count: count }).eq("object_id", dropId);
          }
        }
      } catch {
        // ignore; list endpoint will still use chain for minted_count
      }
    }

    res.json({ digest });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Failed to claim", details: message });
  }
}
