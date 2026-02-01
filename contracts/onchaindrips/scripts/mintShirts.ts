/**
 * Calls mint_shirts to create N shirts and prints ALL created Shirt objectIds and serials in JSON.
 * Output is easy to copy into backend DB as seed data.
 *
 * Requires: PRIVATE_KEY, RPC_URL, PACKAGE_ID, ADMIN_CAP_OBJECT_ID, DROP_OBJECT_ID
 * Optional: MINT_COUNT (default 1), WALRUS_BLOB_ID (hex, no 0x)
 */

import "dotenv/config";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { loadKeypair } from "./keypair.js";

function walrusBlobBytes(): number[] {
  const raw = process.env.WALRUS_BLOB_ID ?? "";
  const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (!hex) return [];
  const match = hex.match(/.{1,2}/g);
  if (!match) return [];
  return match.map((b) => parseInt(b, 16));
}

async function main() {
  const packageId = process.env.PACKAGE_ID;
  const adminCapId = process.env.ADMIN_CAP_OBJECT_ID;
  const dropObjectId = process.env.DROP_OBJECT_ID;
  if (!packageId?.trim()) throw new Error("PACKAGE_ID is required.");
  if (!adminCapId?.trim()) throw new Error("ADMIN_CAP_OBJECT_ID is required.");
  if (!dropObjectId?.trim()) throw new Error("DROP_OBJECT_ID is required. Run create-drop.ts first and set it in .env.");

  const mintCount = Number(process.env.MINT_COUNT ?? "1");
  if (Number.isNaN(mintCount) || mintCount < 1) throw new Error("MINT_COUNT must be a positive number.");

  const rpcUrl = process.env.RPC_URL || getFullnodeUrl("testnet");
  const keypair = loadKeypair();
  const client = new SuiClient({ url: rpcUrl });
  const walrusBlobId = walrusBlobBytes();

  console.log("[mint-shirts] Calling mint_shirts for", mintCount, "shirt(s)...");
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::onchaindrips::mint_shirts`,
    arguments: [
      tx.object(adminCapId),
      tx.object(dropObjectId),
      tx.pure.u64(mintCount),
      tx.pure.vector("u8", walrusBlobId),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showObjectChanges: true, showEffects: true },
  });

  if (result.effects?.status?.status !== "success") {
    const err = result.effects?.status?.error ?? result.effects?.status?.status;
    throw new Error(`Transaction failed: ${JSON.stringify(err)}`);
  }

  const changes = result.objectChanges ?? [];
  let shirtIds: string[] = [];

  // Collect all created object IDs from objectChanges (shape may vary by RPC/SDK)
  const createdIds: string[] = [];
  for (const c of changes) {
    const rec = c as Record<string, unknown>;
    if (String(rec.type).toLowerCase() !== "created") continue;
    const id = rec.objectId ?? (rec.reference as { objectId?: string })?.objectId;
    if (typeof id === "string") createdIds.push(id);
  }

  // Filter to Shirt type by fetching object types
  if (createdIds.length > 0) {
    const objects = await client.multiGetObjects({ ids: createdIds, options: { showType: true } });
    for (const obj of objects) {
      const type = obj.data?.type;
      if (type && String(type).includes("::onchaindrips::Shirt")) {
        shirtIds.push(obj.data.objectId);
      }
    }
  }

  // Fallback: sender just received the shirts; fetch their owned objects and filter by Shirt type
  if (shirtIds.length === 0) {
    const sender = keypair.toSuiAddress();
    const owned = await client.getOwnedObjects({
      owner: sender,
      options: { showType: true, showContent: true },
    });
    for (const o of owned.data) {
      const type = o.data?.type;
      if (type && String(type).includes("::onchaindrips::Shirt") && o.data?.objectId) {
        shirtIds.push(o.data.objectId);
      }
    }
  }

  if (shirtIds.length === 0) {
    console.log("[mint-shirts] No Shirt objects found. objectChanges length:", changes.length);
    process.exit(0);
    return;
  }

  const objects = await client.multiGetObjects({
    ids: shirtIds,
    options: { showContent: true },
  });

  type ShirtSeed = { objectId: string; serial: number };
  const shirts: ShirtSeed[] = [];
  for (const obj of objects) {
    if (obj.data?.content?.dataType !== "moveObject") continue;
    const fields = (obj.data.content as { fields?: Record<string, unknown> }).fields as Record<string, unknown> | undefined;
    const serial = typeof fields?.serial === "string" ? Number(fields.serial) : typeof fields?.serial === "number" ? fields.serial : NaN;
    if (Number.isNaN(serial)) continue;
    shirts.push({ objectId: obj.data.objectId, serial });
  }
  shirts.sort((a, b) => a.serial - b.serial);

  console.log("\n--- Mint shirts result ---");
  console.log("count:", shirts.length);
  console.log("\n--- JSON (backend seed: shirts array) ---");
  console.log(JSON.stringify(shirts, null, 2));
  console.log("\n--- One-line JSON (copy into DB) ---");
  console.log(JSON.stringify(shirts));
}

main().catch((err) => {
  console.error("[mint-shirts] Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
