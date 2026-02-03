/**
 * Admin routes: create drop (onchain + Supabase), mint shirts (onchain + Supabase), list drops.
 * Protected by ADMIN_ADDRESS: request must send X-Admin-Address header matching env.
 */

import type { Request, Response } from "express";
import { toBase64 } from "@mysten/bcs";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { config } from "../config.js";
import { loadSponsorKeypair } from "../keypair.js";
import { getSupabase } from "../supabase.js";

const PACKAGE_ID = config.packageId;

function getAdminAddress(req: Request): string | null {
  const raw =
    (req.headers["x-admin-address"] as string) ??
    (req.body?.adminAddress as string) ??
    (req.query?.adminAddress as string);
  if (!raw?.trim()) return null;
  return normalizeSuiAddress(raw.trim());
}

function isAdmin(req: Request): boolean {
  const admin = config.adminAddress;
  if (!admin) return false;
  const addr = getAdminAddress(req);
  return addr !== null && normalizeSuiAddress(admin) === addr;
}

export function adminMiddleware(req: Request, res: Response, next: () => void): void {
  if (!isAdmin(req)) {
    res.status(403).json({ error: "Forbidden: admin only" });
    return;
  }
  next();
}

/** Hex string (with or without 0x) to byte array for Move vector<u8>. */
function hexToBytes(hex: string): number[] {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const match = h.match(/.{1,2}/g);
  if (!match) return [];
  return match.map((b) => parseInt(b, 16));
}

/**
 * GET /admin/drops — list drops from Supabase (newest first).
 */
export async function listDropsHandler(req: Request, res: Response): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    res.status(503).json({ error: "Supabase not configured" });
    return;
  }
  try {
    const { data, error } = await supabase
      .from("drops")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      res.status(500).json({ error: "Failed to list drops", details: error.message });
      return;
    }
    res.json(data ?? []);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Failed to list drops", details: message });
  }
}

/**
 * POST /admin/drops — create drop onchain, then insert into Supabase.
 * Body: name, company_name, event_name, total_supply, description? (offchain).
 */
export async function createDropHandler(req: Request, res: Response): Promise<void> {
  const adminCapId = config.adminCapObjectId;
  if (!adminCapId?.trim()) {
    res.status(503).json({ error: "ADMIN_CAP_OBJECT_ID not set" });
    return;
  }

  const body = req.body as {
    name?: string;
    company_name?: string;
    event_name?: string;
    total_supply?: number;
    description?: string;
  };
  const name = body.name?.trim();
  const company_name = (body.company_name ?? "").trim();
  const event_name = (body.event_name ?? "").trim();
  const total_supply = Number(body.total_supply);
  const description = body.description?.trim();

  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (Number.isNaN(total_supply) || total_supply < 1) {
    res.status(400).json({ error: "total_supply must be a positive number" });
    return;
  }

  const client = new SuiClient({ url: config.rpcUrl });
  const keypair = loadSponsorKeypair();
  const sender = keypair.toSuiAddress();

  try {
    const coins = await client.getCoins({
      owner: sender,
      coinType: "0x2::sui::SUI",
    });
    if (!coins.data.length) {
      res.status(503).json({ error: "Sponsor has no SUI for gas" });
      return;
    }

    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::onchaindrips::create_drop`,
      arguments: [
        tx.object(adminCapId),
        tx.pure.string(name),
        tx.pure.string(company_name),
        tx.pure.string(event_name),
        tx.pure.u64(BigInt(total_supply)),
        tx.object("0x6"), // Clock
      ],
    });
    tx.setSender(sender);
    tx.setGasPayment([
      {
        objectId: coins.data[0].coinObjectId,
        version: coins.data[0].version,
        digest: coins.data[0].digest,
      },
    ]);

    const builtBytes = await tx.build({ client });
    const { signature } = await keypair.signTransaction(builtBytes);
    const signatureBase64 = typeof signature === "string" ? signature : toBase64(signature);

    const result = await client.executeTransactionBlock({
      transactionBlock: builtBytes,
      signature: signatureBase64,
      options: { showObjectChanges: true, showEffects: true },
    });

    if (result.effects?.status?.status !== "success") {
      const err = result.effects?.status?.error ?? result.effects?.status?.status;
      res.status(500).json({ error: "Transaction failed", details: String(err) });
      return;
    }

    const changes = result.objectChanges ?? [];
    const created = changes.find(
      (c) =>
        (c as { type?: string }).type === "created" &&
        String((c as { objectType?: string }).objectType ?? "").includes("::onchaindrips::Drop")
    ) as { objectId: string; objectType?: string } | undefined;
    const dropObjectId = created?.objectId;
    if (!dropObjectId) {
      res.status(500).json({ error: "Drop created but objectId not found in tx result" });
      return;
    }

    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase.from("drops").insert({
        object_id: dropObjectId,
        name,
        company_name,
        event_name,
        total_supply: total_supply,
        next_serial: 0,
        minted_count: 0,
        created_at_ms: Date.now(),
        offchain_attributes: description ? { description } : {},
      });
      if (error) {
        console.error("Supabase insert drop error:", error);
        res.status(500).json({
          error: "Drop created onchain but Supabase insert failed",
          details: error.message,
          dropObjectId,
        });
        return;
      }
    }

    res.status(201).json({
      dropObjectId,
      digest: result.digest,
      name,
      company_name,
      event_name,
      total_supply,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Failed to create drop", details: message });
  }
}

/**
 * POST /admin/drops/:dropObjectId/mint — mint shirts onchain, then insert into Supabase.
 * Body: walrusBlobIdImage (hex string), walrusBlobIdMetadata (hex string), count? (default total_supply from drop).
 *       Offchain for shirts: gifUrl?, imageUrls? (array).
 */
export async function mintShirtsHandler(req: Request, res: Response): Promise<void> {
  const adminCapId = config.adminCapObjectId;
  if (!adminCapId?.trim()) {
    res.status(503).json({ error: "ADMIN_CAP_OBJECT_ID not set" });
    return;
  }

  const dropObjectId = (req.params.dropObjectId ?? "").trim();
  if (!dropObjectId) {
    res.status(400).json({ error: "dropObjectId is required" });
    return;
  }
  const normalizedDropId = normalizeSuiAddress(dropObjectId);

  const body = req.body as {
    walrusBlobIdImage?: string;
    walrusBlobIdMetadata?: string;
    count?: number;
    gifUrl?: string;
    imageUrls?: string[];
  };
  const walrusBlobIdImage = (body.walrusBlobIdImage ?? "").trim();
  const walrusBlobIdMetadata = (body.walrusBlobIdMetadata ?? "").trim();
  let count = Number(body.count);
  const gifUrl = body.gifUrl?.trim();
  const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls.filter((u) => typeof u === "string") : [];

  if (!walrusBlobIdImage || !walrusBlobIdMetadata) {
    res.status(400).json({ error: "walrusBlobIdImage and walrusBlobIdMetadata are required" });
    return;
  }

  const client = new SuiClient({ url: config.rpcUrl });
  const keypair = loadSponsorKeypair();
  const sender = keypair.toSuiAddress();

  if (Number.isNaN(count) || count < 1) {
    const dropObj = await client.getObject({ id: normalizedDropId, options: { showContent: true } });
    const content = dropObj.data?.content;
    const fields = content && typeof content === "object" && "fields" in content ? (content as { fields?: Record<string, unknown> }).fields : undefined;
    const totalSupply = typeof fields?.total_supply === "string" ? Number(fields.total_supply) : Number(fields?.total_supply);
    if (Number.isNaN(totalSupply) || totalSupply < 1) {
      res.status(400).json({ error: "count is required or drop has no total_supply" });
      return;
    }
    count = totalSupply;
  }

  const imageBytes = hexToBytes(walrusBlobIdImage);
  const metadataBytes = hexToBytes(walrusBlobIdMetadata);

  try {
    const coins = await client.getCoins({
      owner: sender,
      coinType: "0x2::sui::SUI",
    });
    if (!coins.data.length) {
      res.status(503).json({ error: "Sponsor has no SUI for gas" });
      return;
    }

    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::onchaindrips::mint_shirts`,
      arguments: [
        tx.object(adminCapId),
        tx.object(normalizedDropId),
        tx.pure.u64(BigInt(count)),
        tx.pure.vector("u8", imageBytes),
        tx.pure.vector("u8", metadataBytes),
      ],
    });
    tx.setSender(sender);
    tx.setGasPayment([
      {
        objectId: coins.data[0].coinObjectId,
        version: coins.data[0].version,
        digest: coins.data[0].digest,
      },
    ]);

    const builtBytes = await tx.build({ client });
    const { signature } = await keypair.signTransaction(builtBytes);
    const signatureBase64 = typeof signature === "string" ? signature : toBase64(signature);

    const result = await client.executeTransactionBlock({
      transactionBlock: builtBytes,
      signature: signatureBase64,
      options: { showObjectChanges: true, showEffects: true },
    });

    if (result.effects?.status?.status !== "success") {
      const err = result.effects?.status?.error ?? result.effects?.status?.status;
      res.status(500).json({ error: "Transaction failed", details: String(err) });
      return;
    }

    const changes = result.objectChanges ?? [];
    const createdIds: string[] = [];
    for (const c of changes) {
      const rec = c as Record<string, unknown>;
      if (String(rec.type).toLowerCase() !== "created") continue;
      const id = rec.objectId ?? (rec.reference as { objectId?: string })?.objectId;
      if (typeof id === "string") createdIds.push(id);
    }

    let shirtObjectIds: string[] = [];
    if (createdIds.length > 0) {
      const objects = await client.multiGetObjects({
        ids: createdIds,
        options: { showContent: true, showType: true },
      });
      for (const obj of objects) {
        const type = obj.data?.type;
        if (type && String(type).includes("::onchaindrips::Shirt") && obj.data?.objectId) {
          shirtObjectIds.push(obj.data.objectId);
        }
      }
    }
    if (shirtObjectIds.length === 0 && createdIds.length > 0) shirtObjectIds = createdIds;

    const objects = await client.multiGetObjects({
      ids: shirtObjectIds,
      options: { showContent: true },
    });
    type Row = { object_id: string; drop_object_id: string; serial: number; is_minted: boolean; walrus_blob_id_image: string; walrus_blob_id_metadata: string; offchain_attributes: Record<string, unknown> };
    const rows: Row[] = [];
    for (const obj of objects) {
      if (obj.data?.content?.dataType !== "moveObject") continue;
      const fields = (obj.data.content as { fields?: Record<string, unknown> }).fields as Record<string, unknown> | undefined;
      const serial = typeof fields?.serial === "string" ? Number(fields.serial) : Number(fields?.serial ?? NaN);
      if (Number.isNaN(serial)) continue;
      rows.push({
        object_id: obj.data.objectId,
        drop_object_id: normalizedDropId,
        serial,
        is_minted: false,
        walrus_blob_id_image: walrusBlobIdImage,
        walrus_blob_id_metadata: walrusBlobIdMetadata,
        offchain_attributes: { gifUrl: gifUrl || undefined, imageUrls: imageUrls.length ? imageUrls : undefined },
      });
    }
    rows.sort((a, b) => a.serial - b.serial);

    const supabase = getSupabase();
    if (supabase && rows.length > 0) {
      const { error } = await supabase.from("shirts").insert(
        rows.map((r) => ({
          object_id: r.object_id,
          drop_object_id: r.drop_object_id,
          serial: r.serial,
          is_minted: r.is_minted,
          walrus_blob_id_image: r.walrus_blob_id_image,
          walrus_blob_id_metadata: r.walrus_blob_id_metadata,
          offchain_attributes: r.offchain_attributes,
        }))
      );
      if (error) {
        console.error("Supabase insert shirts error:", error);
        res.status(500).json({
          error: "Shirts minted onchain but Supabase insert failed",
          details: error.message,
          shirtObjectIds,
        });
        return;
      }
    }

    res.status(201).json({
      dropObjectId: normalizedDropId,
      digest: result.digest,
      count: rows.length,
      shirtObjectIds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Failed to mint shirts", details: message });
  }
}
