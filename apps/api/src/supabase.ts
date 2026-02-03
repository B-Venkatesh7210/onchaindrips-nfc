/**
 * Supabase client for drops, shirts, claims. Only created when SUPABASE_URL and key are set.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
