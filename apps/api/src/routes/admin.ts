/**
 * Admin routes: create drop (onchain + Supabase), mint shirts (onchain + Supabase), list drops.
 * Protected by ADMIN_ADDRESS: request must send X-Admin-Address header matching env.
 */

import type { Request, Response } from "express";
import { toBase64 } from "@mysten/bcs";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { insertClaimUrlTokens, lookupClaimUrlToken } from "../claimUrlTokens.js";
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

/** Blob ID string (base64url or hex) to bytes for Move vector<u8>. We store base64url in Supabase; chain stores raw bytes. */
function blobIdStringToBytes(s: string): number[] {
  const trimmed = s.trim();
  if (!trimmed) return [];
  const hexMatch = trimmed.match(/^[0-9a-fA-F]+$/);
  if (hexMatch && trimmed.length % 2 === 0 && !trimmed.includes("-") && !trimmed.includes("_")) {
    return hexToBytes(trimmed);
  }
  try {
    let b64 = trimmed.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    if (pad) b64 += "=".repeat(4 - pad);
    const buf = Buffer.from(b64, "base64");
    return Array.from(buf);
  } catch {
    return [];
  }
}

/** Bytes to base64url (no padding). Use when writing to Supabase so we store base64url only. */
function bytesToBase64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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
    const { data: drops, error } = await supabase
      .from("drops")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      res.status(500).json({ error: "Failed to list drops", details: error.message });
      return;
    }
    const list = drops ?? [];
    if (list.length === 0) {
      res.json([]);
      return;
    }
    const dropIds = list.map((d: { object_id: string }) => d.object_id);
    const { data: shirts } = await supabase
      .from("shirts")
      .select("drop_object_id, serial, walrus_blob_id_image")
      .in("drop_object_id", dropIds)
      .order("serial", { ascending: true });
    const imageByDrop: Record<string, string> = {};
    for (const s of shirts ?? []) {
      const dropId = s.drop_object_id as string;
      if (!imageByDrop[dropId] && (s.walrus_blob_id_image as string)?.trim()) {
        imageByDrop[dropId] = (s.walrus_blob_id_image as string).trim();
      }
    }
    // Enrich minted_count from chain (source of truth); Supabase may be stale after claims.
    const mintedCountByDropId: Record<string, number> = {};
    try {
      const suiClient = new SuiClient({ url: config.rpcUrl });
      const normalizedDropIds = dropIds.map((id: string) => normalizeSuiAddress(id));
      const objects = await suiClient.multiGetObjects({
        ids: normalizedDropIds,
        options: { showContent: true },
      });
      for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        const content = obj.data?.content;
        if (content?.dataType !== "moveObject") continue;
        const type = String((content as { type?: string }).type ?? "");
        if (!type.includes("::onchaindrips::Drop")) continue;
        const fields = (content as { fields?: Record<string, unknown> }).fields;
        const raw = fields?.minted_count;
        const count =
          typeof raw === "number"
            ? raw
            : typeof raw === "string"
              ? Number(raw)
              : Number(raw);
        if (!Number.isNaN(count)) {
          mintedCountByDropId[normalizedDropIds[i]] = count;
        }
      }
    } catch (_e) {
      // RPC failed; keep DB minted_count (may be 0)
    }
    const enriched = list.map((d: Record<string, unknown> & { object_id: string }) => {
      const dropIdNorm = normalizeSuiAddress(d.object_id);
      const chainMinted = mintedCountByDropId[dropIdNorm];
      const minted_count =
        chainMinted !== undefined ? chainMinted : Number(d.minted_count ?? 0);
      return {
        ...d,
        image_blob_id: imageByDrop[d.object_id] ?? null,
        minted_count,
      };
    });
    res.json(enriched);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Failed to list drops", details: message });
  }
}

/**
 * GET /admin/drops/:dropId/bids/summary — admin-only preview of winners/losers.
 *
 * This DOES NOT mutate any state; it simply:
 * - loads the drop + its reservation config
 * - loads all bids for the drop
 * - computes what the winners list would be if we closed bidding now
 *
 * The response is designed to be consumed by the admin UI before calling
 * the actual close-bids endpoint and before triggering Yellow settlement.
 */
export async function getDropBidsSummaryHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const dropId = req.params.dropId;
  if (!dropId?.trim()) {
    res.status(400).json({ error: "dropId is required" });
    return;
  }
  const supabase = getSupabase();
  if (!supabase) {
    res.status(503).json({ error: "Supabase not configured" });
    return;
  }

  try {
    const { data: drop, error: dropErr } = await supabase
      .from("drops")
      .select(
        "object_id, name, reservation_slots, reservation_evm_recipient, bidding_closed, bidding_ends_at",
      )
      .eq("object_id", dropId)
      .maybeSingle();
    if (dropErr) {
      res
        .status(500)
        .json({ error: "Failed to load drop", details: dropErr.message });
      return;
    }
    if (!drop) {
      res.status(404).json({ error: "Drop not found" });
      return;
    }

    const slots = Number(
      (drop as { reservation_slots?: number }).reservation_slots ?? 0,
    );
    if (!slots || slots <= 0) {
      res
        .status(400)
        .json({ error: "This drop does not support reservations" });
      return;
    }

    const { data: bids, error: bidsErr } = await supabase
      .from("reservations")
      .select("evm_address, bid_amount_usd, created_at, size_preference")
      .eq("drop_object_id", dropId)
      .order("bid_amount_usd", { ascending: false })
      .order("created_at", { ascending: true });
    if (bidsErr) {
      res
        .status(500)
        .json({ error: "Failed to load bids", details: bidsErr.message });
      return;
    }

    const list = bids ?? [];
    const winners = list.slice(0, slots);
    const losers = list.slice(slots);

    res.json({
      drop: {
        object_id: drop.object_id,
        name: drop.name,
        reservation_slots: slots,
        reservation_evm_recipient: (drop as {
          reservation_evm_recipient?: string | null;
        }).reservation_evm_recipient,
        bidding_closed: (drop as { bidding_closed?: boolean }).bidding_closed,
        bidding_ends_at: (drop as {
          bidding_ends_at?: string | null;
        }).bidding_ends_at,
      },
      winners: winners.map((w, idx) => ({
        evm_address: w.evm_address,
        bid_amount_usd: Number(w.bid_amount_usd),
        rank: idx + 1,
        size:
          (w as { size_preference?: string | null }).size_preference ?? null,
      })),
      losers: losers.map((l) => ({
        evm_address: l.evm_address,
        bid_amount_usd: Number(l.bid_amount_usd),
        size:
          (l as { size_preference?: string | null }).size_preference ?? null,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res
      .status(500)
      .json({ error: "Failed to load bids summary", details: message });
  }
}

/**
 * GET /drops/:dropId/bids — list bids for a drop (public).
 * Returns bids ordered by amount desc, then created_at asc.
 */
export async function getDropBidsHandler(req: Request, res: Response): Promise<void> {
  const dropId = req.params.dropId;
  if (!dropId?.trim()) {
    res.status(400).json({ error: "dropId is required" });
    return;
  }
  const supabase = getSupabase();
  if (!supabase) {
    res.status(503).json({ error: "Supabase not configured" });
    return;
  }
  try {
    const { data, error } = await supabase
      .from("reservations")
      .select(
        "evm_address, bid_amount_usd, rank, status, created_at, size_preference",
      )
      .eq("drop_object_id", dropId)
      .order("bid_amount_usd", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) {
      res
        .status(500)
        .json({ error: "Failed to list bids", details: error.message });
      return;
    }
    const bids = (data ?? []).map((r, idx) => ({
      evm_address: r.evm_address,
      bid_amount_usd: Number(r.bid_amount_usd),
      rank: (r as { rank?: number | null }).rank ?? idx + 1,
      status: (r as { status?: string | null }).status ?? "pending",
      created_at: r.created_at,
      size:
        (r as { size_preference?: string | null }).size_preference ?? null,
    }));
    res.json({ bids });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Failed to list bids", details: message });
  }
}

/**
 * POST /drops/:dropId/bids — place or update a bid for a drop (public).
 * Body: { evm_address: string, bid_amount_usd: number, size: "S" | "M" | "L" | "XL" | "XXL" }
 */
export async function placeBidHandler(req: Request, res: Response): Promise<void> {
  const dropId = req.params.dropId;
  if (!dropId?.trim()) {
    res.status(400).json({ error: "dropId is required" });
    return;
  }
  const supabase = getSupabase();
  if (!supabase) {
    res.status(503).json({ error: "Supabase not configured" });
    return;
  }

  const body = req.body as {
    evm_address?: string;
    bid_amount_usd?: number;
    size?: string;
  };
  const evmAddress = body.evm_address?.trim();
  const rawAmount = body.bid_amount_usd;
  const rawSize = body.size?.trim().toUpperCase();

  if (!evmAddress) {
    res.status(400).json({ error: "evm_address is required" });
    return;
  }
  if (typeof rawAmount !== "number" || !Number.isFinite(rawAmount) || rawAmount <= 0) {
    res.status(400).json({ error: "bid_amount_usd must be a positive number" });
    return;
  }
  const validSizes = ["S", "M", "L", "XL", "XXL"];
  if (!rawSize || !validSizes.includes(rawSize)) {
    res
      .status(400)
      .json({ error: "size must be one of S, M, L, XL, XXL" });
    return;
  }
  // Round to 6 decimal places to match numeric(18,6)
  const bidAmount = Math.round(rawAmount * 1_000_000) / 1_000_000;

  try {
    // Validate drop exists and bidding is open.
    const { data: drop, error: dropErr } = await supabase
      .from("drops")
      .select("object_id, reservation_slots, bidding_closed, bidding_ends_at")
      .eq("object_id", dropId)
      .maybeSingle();
    if (dropErr) {
      res.status(500).json({ error: "Failed to load drop", details: dropErr.message });
      return;
    }
    if (!drop) {
      res.status(404).json({ error: "Drop not found" });
      return;
    }
    const slots = Number((drop as { reservation_slots?: number }).reservation_slots ?? 0);
    if (!slots || slots <= 0) {
      res.status(400).json({ error: "This drop does not support reservations" });
      return;
    }
    if ((drop as { bidding_closed?: boolean }).bidding_closed) {
      res.status(400).json({ error: "Bidding is closed for this drop" });
      return;
    }
    const endsAt = (drop as { bidding_ends_at?: string | null }).bidding_ends_at;
    if (endsAt) {
      const endTime = new Date(endsAt).getTime();
      if (!Number.isNaN(endTime) && Date.now() > endTime) {
        res.status(400).json({ error: "Bidding period has ended for this drop" });
        return;
      }
    }

    // Upsert reservation: one bid per (drop, address). If user bids again, overwrite amount & timestamp.
    const { error: upsertErr } = await supabase.from("reservations").upsert(
      {
        drop_object_id: dropId,
        evm_address: evmAddress,
        bid_amount_usd: bidAmount,
        status: "pending",
        size_preference: rawSize,
      },
      { onConflict: "drop_object_id,evm_address" },
    );
    if (upsertErr) {
      res.status(500).json({ error: "Failed to place bid", details: upsertErr.message });
      return;
    }

    // Reload all bids to compute current rank for this address.
    const { data: allBids, error: listErr } = await supabase
      .from("reservations")
      .select("evm_address, bid_amount_usd, created_at")
      .eq("drop_object_id", dropId)
      .order("bid_amount_usd", { ascending: false })
      .order("created_at", { ascending: true });
    if (listErr) {
      res.status(500).json({ error: "Bid placed but failed to compute rank", details: listErr.message });
      return;
    }
    let rank = null as number | null;
    const bidsList = allBids ?? [];
    for (let i = 0; i < bidsList.length; i++) {
      const b = bidsList[i];
      if ((b.evm_address as string).toLowerCase().trim() === evmAddress.toLowerCase()) {
        rank = i + 1;
        break;
      }
    }

    res.json({
      evm_address: evmAddress,
      bid_amount_usd: bidAmount,
      rank,
      total_bids: bidsList.length,
      reservation_slots: slots,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Failed to place bid", details: message });
  }
}

/**
 * POST /admin/drops/:dropId/bids/close — admin-only: close bidding and mark winners/losers.
 */
export async function closeBidsHandler(req: Request, res: Response): Promise<void> {
  const dropId = req.params.dropId;
  if (!dropId?.trim()) {
    res.status(400).json({ error: "dropId is required" });
    return;
  }
  const supabase = getSupabase();
  if (!supabase) {
    res.status(503).json({ error: "Supabase not configured" });
    return;
  }

  try {
    const { data: drop, error: dropErr } = await supabase
      .from("drops")
      .select("object_id, reservation_slots, bidding_closed, reservation_evm_recipient")
      .eq("object_id", dropId)
      .maybeSingle();
    if (dropErr) {
      res.status(500).json({ error: "Failed to load drop", details: dropErr.message });
      return;
    }
    if (!drop) {
      res.status(404).json({ error: "Drop not found" });
      return;
    }
    if ((drop as { bidding_closed?: boolean }).bidding_closed) {
      res.status(400).json({ error: "Bidding already closed for this drop" });
      return;
    }
    const slots = Number((drop as { reservation_slots?: number }).reservation_slots ?? 0);
    if (!slots || slots <= 0) {
      res.status(400).json({ error: "This drop does not support reservations" });
      return;
    }

    // Load all bids for this drop.
    const { data: bids, error: bidsErr } = await supabase
      .from("reservations")
      .select("id, evm_address, bid_amount_usd, created_at")
      .eq("drop_object_id", dropId)
      .order("bid_amount_usd", { ascending: false })
      .order("created_at", { ascending: true });
    if (bidsErr) {
      res.status(500).json({ error: "Failed to load bids", details: bidsErr.message });
      return;
    }
    const list = bids ?? [];
    if (list.length === 0) {
      // No bids; just mark bidding_closed.
      const { error: updateDropErr } = await supabase
        .from("drops")
        .update({ bidding_closed: true, updated_at: new Date().toISOString() })
        .eq("object_id", dropId);
      if (updateDropErr) {
        res.status(500).json({ error: "Failed to close bidding", details: updateDropErr.message });
        return;
      }
      res.json({ winners: [], losers: [] });
      return;
    }

    // Determine winners (top reservation_slots by amount/time).
    const winners = list.slice(0, slots);
    const losers = list.slice(slots);

    // Settlement: Yellow channel close is done client-side by winners.
    // Admin only updates DB here.

    // Update reservations: set rank and status, settled_at (one update per row; upsert with partial rows can fail).
    const nowIso = new Date().toISOString();
    for (let idx = 0; idx < list.length; idx++) {
      const b = list[idx];
      const { error: updErr } = await supabase
        .from("reservations")
        .update({
          rank: idx + 1,
          status: winners.includes(b) ? "won" : "lost",
          settled_at: nowIso,
        })
        .eq("id", b.id);
      if (updErr) {
        res.status(500).json({ error: "Failed to update reservations", details: updErr.message });
        return;
      }
    }

    // Mark drop as bidding_closed.
    const { error: updateDropErr2 } = await supabase
      .from("drops")
      .update({ bidding_closed: true, updated_at: nowIso })
      .eq("object_id", dropId);
    if (updateDropErr2) {
      res.status(500).json({ error: "Failed to close bidding", details: updateDropErr2.message });
      return;
    }

    res.json({
      winners: winners.map((w, idx) => ({
        evm_address: w.evm_address,
        bid_amount_usd: Number(w.bid_amount_usd),
        rank: idx + 1,
      })),
      losers: losers.map((l) => ({
        evm_address: l.evm_address,
        bid_amount_usd: Number(l.bid_amount_usd),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Failed to close bidding", details: message });
  }
}

/**
 * POST /admin/drops — create drop onchain, then insert into Supabase.
 * Body: name, company_name, event_name, total_supply, description?, release_date? (YYYY-MM-DD; offchain).
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
    release_date?: string;
    // Optional bidding / reservation config
    reservation_slots?: number;
    bidding_ends_at?: string;
    reservation_evm_recipient?: string;
    // Optional per-size inventory
    size_s_total?: number;
    size_m_total?: number;
    size_l_total?: number;
    size_xl_total?: number;
    size_xxl_total?: number;
  };
  const name = body.name?.trim();
  const company_name = (body.company_name ?? "").trim();
  const event_name = (body.event_name ?? "").trim();
  const total_supply = Number(body.total_supply);
  const description = body.description?.trim();
  const releaseDateRaw = body.release_date?.trim();
  const release_date =
    releaseDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(releaseDateRaw) && !Number.isNaN(Date.parse(releaseDateRaw))
      ? releaseDateRaw
      : null;

  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (Number.isNaN(total_supply) || total_supply < 1) {
    res.status(400).json({ error: "total_supply must be a positive number" });
    return;
  }

  // Optional bidding / reservation config
  const reservation_slots = Number(body.reservation_slots ?? 0);
  const biddingEndsRaw = body.bidding_ends_at?.trim();
  const bidding_ends_at =
    biddingEndsRaw && !Number.isNaN(Date.parse(biddingEndsRaw))
      ? new Date(biddingEndsRaw).toISOString()
      : null;
  const reservation_evm_recipient =
    body.reservation_evm_recipient?.trim() || null;

  // Optional per-size inventory (informational)
  const size_s_total = Number(body.size_s_total ?? 0);
  const size_m_total = Number(body.size_m_total ?? 0);
  const size_l_total = Number(body.size_l_total ?? 0);
  const size_xl_total = Number(body.size_xl_total ?? 0);
  const size_xxl_total = Number(body.size_xxl_total ?? 0);

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
        description: description || null,
        release_date: release_date,
        // Bidding / reservations
        reservation_slots:
          Number.isNaN(reservation_slots) || reservation_slots < 0
            ? 0
            : reservation_slots,
        bidding_ends_at,
        reservation_evm_recipient,
        // Size inventory
        size_s_total:
          Number.isNaN(size_s_total) || size_s_total < 0 ? 0 : size_s_total,
        size_m_total:
          Number.isNaN(size_m_total) || size_m_total < 0 ? 0 : size_m_total,
        size_l_total:
          Number.isNaN(size_l_total) || size_l_total < 0 ? 0 : size_l_total,
        size_xl_total:
          Number.isNaN(size_xl_total) || size_xl_total < 0 ? 0 : size_xl_total,
        size_xxl_total:
          Number.isNaN(size_xxl_total) || size_xxl_total < 0
            ? 0
            : size_xxl_total,
        offchain_attributes: {},
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
 * Body: walrusBlobIdImage, walrusBlobIdMetadata (base64url from Walrus, or hex); stored in Supabase as-is (use base64url).
 *       count? (default total_supply from drop). Offchain: gifUrl?, imageUrls? (array).
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
    imageUrls?: string[];
  };
  const walrusBlobIdImage = (body.walrusBlobIdImage ?? "").trim();
  const walrusBlobIdMetadata = (body.walrusBlobIdMetadata ?? "").trim();
  let count = Number(body.count);
  const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls.filter((u) => typeof u === "string" && u.trim()) : [];
  const uploadedBlobId1 = imageUrls[0]?.trim() ?? null;
  const uploadedBlobId2 = imageUrls[1]?.trim() ?? null;

  if (!walrusBlobIdImage || !walrusBlobIdMetadata) {
    res.status(400).json({ error: "walrusBlobIdImage and walrusBlobIdMetadata are required" });
    return;
  }

  const client = new SuiClient({ url: config.rpcUrl });
  const keypair = loadSponsorKeypair();
  const sender = keypair.toSuiAddress();

  // Fetch drop from chain to get total_supply and next_serial (required for EExceedsTotalSupply validation)
  const dropObj = await client.getObject({ id: normalizedDropId, options: { showContent: true } });
  if (!dropObj.data?.content) {
    res.status(404).json({ error: "Drop not found", details: "Drop object does not exist or is not accessible." });
    return;
  }
  const content = dropObj.data.content;
  const fields = typeof content === "object" && content !== null && "fields" in content ? (content as { fields?: Record<string, unknown> }).fields : undefined;
  const totalSupply = typeof fields?.total_supply === "string" ? Number(fields.total_supply) : Number(fields?.total_supply ?? NaN);
  const nextSerial = typeof fields?.next_serial === "string" ? Number(fields.next_serial) : Number(fields?.next_serial ?? 0);

  if (Number.isNaN(count) || count < 1) {
    if (Number.isNaN(totalSupply) || totalSupply < 1) {
      res.status(400).json({ error: "count is required or drop has no total_supply" });
      return;
    }
    count = totalSupply;
  }

  const available = Math.max(0, totalSupply - nextSerial);
  if (available < 1) {
    res.status(400).json({
      error: "Nothing left to mint",
      details: `Drop has total_supply=${totalSupply}, next_serial=${nextSerial}. All shirts already minted.`,
    });
    return;
  }
  if (count > available) {
    res.status(400).json({
      error: "Mint count exceeds available supply",
      details: `Requested ${count} shirts, but only ${available} remain (total_supply=${totalSupply}, next_serial=${nextSerial}).`,
    });
    return;
  }

  const imageBytes = blobIdStringToBytes(walrusBlobIdImage);
  const metadataBytes = blobIdStringToBytes(walrusBlobIdMetadata);
  if (imageBytes.length === 0 || metadataBytes.length === 0) {
    res.status(400).json({ error: "walrusBlobIdImage and walrusBlobIdMetadata must be valid base64url or hex" });
    return;
  }

  // Sui limits transaction inputs/outputs; mint in batches of 50 to avoid "Input exceeds limit of 50"
  const MINT_BATCH_SIZE = 50;

  try {
    const coins = await client.getCoins({
      owner: sender,
      coinType: "0x2::sui::SUI",
    });
    if (!coins.data.length) {
      res.status(503).json({ error: "Sponsor has no SUI for gas" });
      return;
    }

    const allShirtObjectIds: string[] = [];
    let remaining = count;
    let lastDigest = "";

    while (remaining > 0) {
      const batchCount = Math.min(remaining, MINT_BATCH_SIZE);
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::onchaindrips::mint_shirts`,
        arguments: [
          tx.object(adminCapId),
          tx.object(normalizedDropId),
          tx.pure.u64(BigInt(batchCount)),
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

      lastDigest = result.digest;
      const changes = result.objectChanges ?? [];
      const createdIds: string[] = [];
      for (const c of changes) {
        const rec = c as Record<string, unknown>;
        if (String(rec.type).toLowerCase() !== "created") continue;
        const id = rec.objectId ?? (rec.reference as { objectId?: string })?.objectId;
        if (typeof id === "string") createdIds.push(id);
      }

      if (createdIds.length > 0) {
        const beforeCount = allShirtObjectIds.length;
        const objects = await client.multiGetObjects({
          ids: createdIds,
          options: { showContent: true, showType: true },
        });
        for (const obj of objects) {
          const type = obj.data?.type;
          if (type && String(type).includes("::onchaindrips::Shirt") && obj.data?.objectId) {
            allShirtObjectIds.push(obj.data.objectId);
          }
        }
        if (allShirtObjectIds.length - beforeCount < createdIds.length) {
          for (const id of createdIds) {
            if (!allShirtObjectIds.includes(id)) allShirtObjectIds.push(id);
          }
        }
      }

      remaining -= batchCount;
      if (remaining > 0) {
        // Refresh gas coin for next batch
        const refreshed = await client.getCoins({
          owner: sender,
          coinType: "0x2::sui::SUI",
        });
        if (refreshed.data.length > 0) {
          coins.data[0] = refreshed.data[0];
        }
      }
    }

    const shirtObjectIds = allShirtObjectIds;

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
        offchain_attributes: { imageUrls: imageUrls.length ? imageUrls : undefined },
      });
    }
    rows.sort((a, b) => a.serial - b.serial);

    // If we couldn't parse serials from chain (e.g. RPC content shape), still build rows so Supabase gets populated
    if (rows.length === 0 && shirtObjectIds.length > 0) {
      for (let i = 0; i < shirtObjectIds.length; i++) {
        rows.push({
          object_id: shirtObjectIds[i],
          drop_object_id: normalizedDropId,
          serial: i,
          is_minted: false,
          walrus_blob_id_image: walrusBlobIdImage,
          walrus_blob_id_metadata: walrusBlobIdMetadata,
          offchain_attributes: { imageUrls: imageUrls.length ? imageUrls : undefined },
        });
      }
    }

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
      if ((uploadedBlobId1 || uploadedBlobId2) != null) {
        const updatePayload: Record<string, string | null> = {};
        if (uploadedBlobId1) updatePayload.uploaded_image_1 = uploadedBlobId1;
        if (uploadedBlobId2) updatePayload.uploaded_image_2 = uploadedBlobId2;
        if (Object.keys(updatePayload).length > 0) {
          await supabase.from("drops").update(updatePayload).eq("object_id", normalizedDropId);
        }
      }
    }

    let claimTokens: { shirtObjectId: string; token: string }[] | undefined;
    if (supabase && shirtObjectIds.length > 0) {
      try {
        claimTokens = await insertClaimUrlTokens(supabase, normalizedDropId, shirtObjectIds);
      } catch (e) {
        console.error("Claim URL tokens insert error:", e);
        res.status(500).json({
          error: "Shirts minted but claim URL tokens failed",
          details: e instanceof Error ? e.message : String(e),
          shirtObjectIds,
        });
        return;
      }
    }

    res.status(201).json({
      dropObjectId: normalizedDropId,
      digest: lastDigest,
      count: rows.length,
      shirtObjectIds,
      claimTokens,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Failed to mint shirts", details: message });
  }
}

/**
 * GET /drops/:dropId/resolve?token=... — look up short claim token and return shirtObjectId (public).
 * Token is ≤14 chars, stored in claim_url_tokens (Supabase). NFC URL format: /{dropId}/{token}.
 */
export async function resolveClaimTokenHandler(req: Request, res: Response): Promise<void> {
  const dropId = (req.params.dropId ?? "").trim();
  const token =
    (typeof req.query.token === "string" ? req.query.token : req.params.token ?? "").trim();
  if (!dropId || !token) {
    res.status(400).json({ error: "dropId and token are required" });
    return;
  }
  const supabase = getSupabase();
  if (!supabase) {
    res.status(503).json({ error: "Claim URL resolution not available" });
    return;
  }
  const row = await lookupClaimUrlToken(supabase, token);
  if (!row) {
    res.status(404).json({ error: "Invalid or expired token" });
    return;
  }
  const normalizedDropId = normalizeSuiAddress(dropId);
  if (normalizeSuiAddress(row.drop_object_id) !== normalizedDropId) {
    res.status(404).json({ error: "Token does not match drop" });
    return;
  }
  res.json({ shirtObjectId: row.shirt_object_id });
}

/**
 * POST /admin/drops/:dropObjectId/backfill-shirts
 * Fetches Shirt objects owned by the sponsor for this drop from chain and inserts into Supabase.
 * Use this when shirts were minted onchain but the shirts table is empty (e.g. after a bug fix).
 */
export async function backfillShirtsHandler(req: Request, res: Response): Promise<void> {
  const dropObjectId = (req.params.dropObjectId ?? "").trim();
  if (!dropObjectId) {
    res.status(400).json({ error: "dropObjectId is required" });
    return;
  }
  const normalizedDropId = normalizeSuiAddress(dropObjectId);

  const supabase = getSupabase();
  if (!supabase) {
    res.status(503).json({ error: "Supabase not configured" });
    return;
  }

  const client = new SuiClient({ url: config.rpcUrl });
  const keypair = loadSponsorKeypair();
  const sponsorAddress = keypair.toSuiAddress();

  try {
    const packageId = config.packageId;
    const typeFilter = `${packageId}::onchaindrips::Shirt`;
    const page = await client.getOwnedObjects({
      owner: sponsorAddress,
      filter: { StructType: typeFilter },
      options: { showContent: true, showType: true },
    });

    type Row = {
      object_id: string;
      drop_object_id: string;
      serial: number;
      is_minted: boolean;
      walrus_blob_id_image: string;
      walrus_blob_id_metadata: string;
      offchain_attributes: Record<string, unknown>;
    };
    const rows: Row[] = [];

    for (const item of page.data) {
      const objId = item.data?.objectId;
      if (!objId) continue;
      const content = item.data?.content;
      if (content?.dataType !== "moveObject") continue;
      const fields = (content as { fields?: Record<string, unknown> }).fields as Record<string, unknown> | undefined;
      if (!fields) continue;
      const dropId = fields.drop_id as string | undefined;
      if (dropId && normalizeSuiAddress(dropId) !== normalizedDropId) continue;
      const serial = typeof fields.serial === "string" ? Number(fields.serial) : Number(fields.serial ?? NaN);
      const isMinted = Boolean(fields.is_minted);
      const blobImage = fields.walrus_blob_id_image;
      const blobMetadata = fields.walrus_blob_id_metadata;
      const blobImageStr = Array.isArray(blobImage)
        ? bytesToBase64url(Buffer.from(blobImage as number[]))
        : typeof blobImage === "string"
          ? blobImage
          : "";
      const blobMetadataStr = Array.isArray(blobMetadata)
        ? bytesToBase64url(Buffer.from(blobMetadata as number[]))
        : typeof blobMetadata === "string"
          ? blobMetadata
          : "";
      rows.push({
        object_id: objId,
        drop_object_id: normalizedDropId,
        serial: Number.isNaN(serial) ? rows.length : serial,
        is_minted: isMinted,
        walrus_blob_id_image: blobImageStr,
        walrus_blob_id_metadata: blobMetadataStr,
        offchain_attributes: {},
      });
    }

    if (rows.length === 0) {
      res.status(200).json({ message: "No shirts found onchain for this drop (or none owned by sponsor)", inserted: 0 });
      return;
    }

    const { data: existing } = await supabase.from("shirts").select("object_id").eq("drop_object_id", normalizedDropId);
    const existingIds = new Set((existing ?? []).map((r: { object_id: string }) => r.object_id));
    const toInsert = rows.filter((r) => !existingIds.has(r.object_id));

    if (toInsert.length === 0) {
      res.status(200).json({ message: "All shirts for this drop already in Supabase", inserted: 0 });
      return;
    }

    const { error } = await supabase.from("shirts").insert(
      toInsert.map((r) => ({
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
      console.error("Supabase backfill shirts error:", error);
      res.status(500).json({ error: "Backfill insert failed", details: error.message });
      return;
    }

    res.status(200).json({ message: "Backfill complete", inserted: toInsert.length, shirtObjectIds: toInsert.map((r) => r.object_id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Backfill failed", details: message });
  }
}
