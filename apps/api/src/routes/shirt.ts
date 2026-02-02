/**
 * GET /shirt/:objectId — fetch Shirt object from Sui RPC and return fields + owner.
 */

import type { Request, Response } from "express";
import { SuiClient } from "@mysten/sui/client";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import type { SuiClient as SuiClientType } from "@mysten/sui/client";

export function createShirtRouter(client: SuiClientType) {
  return async function shirtHandler(req: Request, res: Response): Promise<void> {
    const objectId = req.params.objectId;
    if (!objectId?.trim()) {
      res.status(400).json({ error: "objectId is required" });
      return;
    }

    const normalizedId = normalizeSuiAddress(objectId);

    try {
      const obj = await client.getObject({
        id: normalizedId,
        options: { showContent: true, showOwner: true },
      });

      if (obj.data?.content?.dataType !== "moveObject") {
        res.status(404).json({ error: "Object not found or not a Move object" });
        return;
      }

      const content = obj.data.content as {
        type: string;
        fields?: Record<string, unknown>;
      };
      const owner = obj.data.owner;

      // Expect type like "0x...::onchaindrips::Shirt"
      if (!content.type?.includes("::onchaindrips::Shirt")) {
        res.status(400).json({ error: "Object is not a Shirt" });
        return;
      }

      const fields = content.fields ?? {};
      const serial = typeof fields.serial === "string" ? Number(fields.serial) : fields.serial;
      const isMinted = Boolean(fields.is_minted);
      const mintedAtMs = typeof fields.minted_at_ms === "string" ? Number(fields.minted_at_ms) : fields.minted_at_ms;
      const dropId = fields.drop_id;
      const walrusBlobIdImage = fields.walrus_blob_id_image;
      const walrusBlobIdMetadata = fields.walrus_blob_id_metadata;

      let ownerAddress: string | null = null;
      if (owner && typeof owner === "object" && "AddressOwner" in owner) {
        ownerAddress = (owner as { AddressOwner: string }).AddressOwner;
      } else if (owner && typeof owner === "object" && "ObjectOwner" in owner) {
        ownerAddress = (owner as { ObjectOwner: string }).ObjectOwner;
      }

      res.json({
        objectId: normalizedId,
        is_minted: isMinted,
        serial: Number.isNaN(serial) ? null : serial,
        drop_id: dropId ?? null,
        minted_at_ms: typeof mintedAtMs === "number" ? mintedAtMs : typeof mintedAtMs === "string" ? Number(mintedAtMs) : null,
        walrus_blob_id_image: Array.isArray(walrusBlobIdImage) ? walrusBlobIdImage : walrusBlobIdImage ?? null,
        walrus_blob_id_metadata: Array.isArray(walrusBlobIdMetadata) ? walrusBlobIdMetadata : walrusBlobIdMetadata ?? null,
        owner: ownerAddress ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: "Failed to fetch Shirt", details: message });
    }
  };
}
