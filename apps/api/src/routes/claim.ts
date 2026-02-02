/**
 * POST /claim — backend builds claim_and_transfer(shirt, recipient), signs as shirt owner (sponsor), executes.
 * The Shirt is owned by the sponsor wallet (from mint_shirts), so the sponsor must be the transaction sender.
 */

import type { Request, Response } from "express";
import { toBase64 } from "@mysten/bcs";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { isAllowedShirt } from "../allowlist.js";
import { config } from "../config.js";
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

  if (!isAllowedShirt(shirtId)) {
    res.status(400).json({ error: "Shirt objectId is not in the allowlist" });
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
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::onchaindrips::claim_and_transfer`,
      arguments: [
        tx.object(shirtId),
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

    res.json({ digest: result.digest });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Failed to claim", details: message });
  }
}
