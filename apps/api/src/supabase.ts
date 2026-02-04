/**
 * Supabase client for drops, shirts, claims. Only created when SUPABASE_URL and key are set.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { config } from "./config.js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  if (config.supabaseUrl && config.supabaseServiceRoleKey) {
    client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);
    return client;
  }
  return null;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);
}

/**
 * Check if a shirt is claimable: exists in shirts table and is_minted = false.
 * Replaces allowlist.json. Returns false if Supabase is not configured or shirt not found / already minted.
 */
export async function isShirtClaimable(objectId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const id = normalizeSuiAddress(objectId);
  const { data, error } = await supabase
    .from("shirts")
    .select("object_id, is_minted")
    .eq("object_id", id)
    .maybeSingle();
  if (error || !data) return false;
  return data.is_minted === false;
}
