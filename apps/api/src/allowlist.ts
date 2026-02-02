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
    const ids: string[] = [];
    for (const item of arr) {
      if (typeof item === "string" && item.length > 0) {
        ids.push(normalizeSuiAddress(item));
      } else if (item && typeof item === "object" && "objectId" in item && typeof (item as { objectId: string }).objectId === "string") {
        ids.push(normalizeSuiAddress((item as { objectId: string }).objectId));
      }
    }
    return new Set(ids);
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
