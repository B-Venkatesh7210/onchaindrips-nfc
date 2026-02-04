/**
 * Shirt routes.
 *
 * - GET /shirt/:objectId — fetch Shirt object from Sui RPC and return fields + owner.
 *   If Supabase is configured and shirt is minted, includes claim_tx_digest from claims table.
 * - GET /shirt/:objectId/profile — fetch offchain owner profile (from Supabase shirts.offchain_attributes.profile).
 * - POST /shirt/:objectId/profile — upsert offchain owner profile (only current owner may write).
 */

import type { Request, Response } from "express";
import { SuiClient } from "@mysten/sui/client";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import type { SuiClient as SuiClientType } from "@mysten/sui/client";
import { getSupabase } from "../supabase.js";
import { config } from "../config.js";

type ShirtProfile = {
  ens_name?: string | null;
  ens_locked?: boolean;
  fields?: Record<string, unknown>;
};

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

      let claimTxDigest: string | null = null;
      try {
        const supabase = getSupabase();
        if (supabase && isMinted) {
          const { data: claim } = await supabase
            .from("claims")
            .select("tx_digest")
            .eq("shirt_object_id", normalizedId)
            .order("claimed_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          claimTxDigest = claim?.tx_digest ?? null;
        }
      } catch {
        // ignore
      }

      res.json({
        objectId: normalizedId,
        is_minted: isMinted,
        serial: Number.isNaN(serial) ? null : serial,
        drop_id: dropId ?? null,
        minted_at_ms:
          typeof mintedAtMs === "number"
            ? mintedAtMs
            : typeof mintedAtMs === "string"
              ? Number(mintedAtMs)
              : null,
        walrus_blob_id_image: Array.isArray(walrusBlobIdImage) ? walrusBlobIdImage : walrusBlobIdImage ?? null,
        walrus_blob_id_metadata: Array.isArray(walrusBlobIdMetadata) ? walrusBlobIdMetadata : walrusBlobIdMetadata ?? null,
        owner: ownerAddress ?? null,
        claim_tx_digest: claimTxDigest,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: "Failed to fetch Shirt", details: message });
    }
  };
}

/**
 * GET /shirt/:objectId/profile — return offchain profile JSON for this shirt.
 */
export async function getShirtProfileHandler(req: Request, res: Response): Promise<void> {
  const objectId = req.params.objectId;
  if (!objectId?.trim()) {
    res.status(400).json({ error: "objectId is required" });
    return;
  }
  const supabase = getSupabase();
  if (!supabase) {
    res.status(503).json({ error: "Supabase is not configured" });
    return;
  }

  const normalizedId = normalizeSuiAddress(objectId);
  const { data, error } = await supabase
    .from("shirts")
    .select("offchain_attributes")
    .eq("object_id", normalizedId)
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: "Failed to load profile", details: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Shirt not found" });
    return;
  }

  const attrs = (data.offchain_attributes ?? {}) as { profile?: ShirtProfile };
  const profile = attrs.profile ?? null;
  res.json({ profile });
}

/**
 * POST /shirt/:objectId/profile — upsert offchain profile JSON for this shirt.
 * Body: { ownerAddress: string, profile: ShirtProfile }
 * Only allowed if ownerAddress matches shirts.current_owner_address (normalized).
 */
export async function upsertShirtProfileHandler(req: Request, res: Response): Promise<void> {
  const objectId = req.params.objectId;
  if (!objectId?.trim()) {
    res.status(400).json({ error: "objectId is required" });
    return;
  }

  const { ownerAddress, profile } = req.body as { ownerAddress?: string; profile?: ShirtProfile };
  if (!ownerAddress || typeof ownerAddress !== "string") {
    res.status(400).json({ error: "ownerAddress is required" });
    return;
  }
  if (!profile || typeof profile !== "object") {
    res.status(400).json({ error: "profile is required" });
    return;
  }

  const supabase = getSupabase();
  if (!supabase) {
    res.status(503).json({ error: "Supabase is not configured" });
    return;
  }

  const normalizedId = normalizeSuiAddress(objectId);
  const normalizedOwner = normalizeSuiAddress(ownerAddress);

  const { data, error } = await supabase
    .from("shirts")
    .select("offchain_attributes, current_owner_address")
    .eq("object_id", normalizedId)
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: "Failed to load shirt", details: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Shirt not found" });
    return;
  }

  let currentOwner = data.current_owner_address ? normalizeSuiAddress(data.current_owner_address) : null;

  // If Supabase doesn't have a current owner or it's stale, fall back to onchain owner.
  if (!currentOwner || currentOwner !== normalizedOwner) {
    try {
      const client = new SuiClient({ url: config.rpcUrl });
      const obj = await client.getObject({
        id: normalizedId,
        options: { showOwner: true },
      });
      const ownerField = obj.data?.owner;
      let onchainOwner: string | null = null;
      if (ownerField && typeof ownerField === "object" && "AddressOwner" in ownerField) {
        onchainOwner = (ownerField as { AddressOwner: string }).AddressOwner;
      } else if (ownerField && typeof ownerField === "object" && "ObjectOwner" in ownerField) {
        onchainOwner = (ownerField as { ObjectOwner: string }).ObjectOwner;
      }
      if (onchainOwner) {
        const normalizedOnchain = normalizeSuiAddress(onchainOwner);
        currentOwner = normalizedOnchain;
        // Optionally sync Supabase if it was missing or stale.
        if (!data.current_owner_address || normalizeSuiAddress(data.current_owner_address) !== normalizedOnchain) {
          await supabase
            .from("shirts")
            .update({ current_owner_address: normalizedOnchain })
            .eq("object_id", normalizedId);
        }
      }
    } catch {
      // If onchain lookup fails, we fall back to DB-only check below.
    }
  }
  if (!currentOwner || currentOwner !== normalizedOwner) {
    res.status(403).json({ error: "Only the current owner can update the profile" });
    return;
  }

  const attrs = (data.offchain_attributes ?? {}) as { profile?: ShirtProfile; [key: string]: unknown };
  const nextAttrs = { ...attrs, profile } as Record<string, unknown>;

  const { error: updateError } = await supabase
    .from("shirts")
    .update({ offchain_attributes: nextAttrs })
    .eq("object_id", normalizedId);

  if (updateError) {
    res.status(500).json({ error: "Failed to save profile", details: updateError.message });
    return;
  }

  res.json({ profile });
}
