/**
 * In-memory allowlist of Shirt object IDs. Loaded from data/allowlist.json at startup.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSuiAddress } from "@mysten/sui/utils";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ALLOWLIST_PATH = join(__dirname, "..", "data", "allowlist.json");

let allowlist: Set<string> = loadAllowlist();

function loadAllowlist(): Set<string> {
  try {
    const raw = readFileSync(ALLOWLIST_PATH, "utf-8");
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(
      arr
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        .map((id) => normalizeSuiAddress(id)),
    );
  } catch {
    return new Set();
  }
}

/** Check if a Shirt object ID is in the allowlist (normalized comparison). */
export function isAllowedShirt(objectId: string): boolean {
  return allowlist.has(normalizeSuiAddress(objectId));
}

/** Reload allowlist from disk (e.g. after updating the JSON file). */
export function reloadAllowlist(): void {
  allowlist = loadAllowlist();
}
