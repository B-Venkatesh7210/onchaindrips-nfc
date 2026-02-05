/**
 * Short claim URL tokens (≤14 chars) for NFC. Stored in Supabase claim_url_tokens table.
 * Token is a random key; resolve looks up token → (drop_object_id, shirt_object_id).
 */

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const SHORT_TOKEN_LENGTH = 14;

const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function generateShortToken(length: number = SHORT_TOKEN_LENGTH): string {
  const bytes = randomBytes(length);
  let s = "";
  for (let i = 0; i < length; i++) {
    s += ALPHANUMERIC[bytes[i]! % ALPHANUMERIC.length];
  }
  return s;
}

/**
 * Insert one short token per shirt for the drop. Returns array of { shirtObjectId, token }.
 * On unique constraint violation, retries with a new token for that row.
 */
export async function insertClaimUrlTokens(
  supabase: SupabaseClient,
  dropObjectId: string,
  shirtObjectIds: string[]
): Promise<{ shirtObjectId: string; token: string }[]> {
  const result: { shirtObjectId: string; token: string }[] = [];
  const maxRetries = 5;
  for (const shirtObjectId of shirtObjectIds) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const token = generateShortToken();
      const { error } = await supabase.from("claim_url_tokens").insert({
        token,
        drop_object_id: dropObjectId,
        shirt_object_id: shirtObjectId,
      });
      if (!error) {
        result.push({ shirtObjectId, token });
        break;
      }
      if (error.code === "23505") {
        continue;
      }
      throw error;
    }
  }
  return result;
}

/**
 * Look up a short token. Returns { drop_object_id, shirt_object_id } or null.
 */
export async function lookupClaimUrlToken(
  supabase: SupabaseClient,
  token: string
): Promise<{ drop_object_id: string; shirt_object_id: string } | null> {
  const t = (token ?? "").trim();
  if (!t) return null;
  const { data, error } = await supabase
    .from("claim_url_tokens")
    .select("drop_object_id, shirt_object_id")
    .eq("token", t)
    .maybeSingle();
  if (error || !data) return null;
  return {
    drop_object_id: data.drop_object_id as string,
    shirt_object_id: data.shirt_object_id as string,
  };
}
