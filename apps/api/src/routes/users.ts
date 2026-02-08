/**
 * User registration / upsert on zkLogin sign-in.
 * Upserts into Supabase users table with address, auth_provider, auth_sub, and optional profile fields.
 */

import type { Request, Response } from "express";
import { getSupabase } from "../supabase.js";
import { normalizeSuiAddress } from "@mysten/sui/utils";

/**
 * POST /users/upsert — upsert user record after zkLogin sign-in (public).
 * Body: { address: string, auth_provider: string, auth_sub: string, email?: string, name?: string }
 */
export async function upsertUserHandler(req: Request, res: Response): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    res.status(503).json({ error: "User registration not available (Supabase not configured)" });
    return;
  }

  const body = req.body as {
    address?: string;
    auth_provider?: string;
    auth_sub?: string;
    email?: string;
    name?: string;
  };

  const rawAddress = body.address?.trim();
  const authProvider = body.auth_provider?.trim() || "google";
  const authSub = body.auth_sub?.trim();
  const email = body.email?.trim();
  const name = body.name?.trim();

  if (!rawAddress) {
    res.status(400).json({ error: "address is required" });
    return;
  }
  if (!authSub) {
    res.status(400).json({ error: "auth_sub is required" });
    return;
  }

  const address = normalizeSuiAddress(rawAddress);

  const offchainAttributes: Record<string, string> = {};
  if (email) offchainAttributes.email = email;
  if (name) offchainAttributes.name = name;

  try {
    const { error } = await supabase.from("users").upsert(
      {
        address,
        auth_provider: authProvider,
        auth_sub: authSub,
        updated_at: new Date().toISOString(),
        offchain_attributes: offchainAttributes,
      },
      {
        onConflict: "address",
        ignoreDuplicates: false,
      }
    );

    if (error) {
      res.status(500).json({ error: "Failed to upsert user", details: error.message });
      return;
    }

    res.status(200).json({ ok: true, address });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Failed to upsert user", details: message });
  }
}
