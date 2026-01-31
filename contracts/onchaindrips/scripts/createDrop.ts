/**
 * Calls create_drop and prints the Drop objectId for .env and backend seed.
 *
 * Requires: PRIVATE_KEY, RPC_URL, PACKAGE_ID, ADMIN_CAP_OBJECT_ID
 * Optional: DROP_NAME, DROP_TOTAL_SUPPLY, WALRUS_BLOB_ID (hex, no 0x)
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
  if (!packageId?.trim()) throw new Error("PACKAGE_ID is required. Run publish.ts first and set it in .env.");
  if (!adminCapId?.trim()) throw new Error("ADMIN_CAP_OBJECT_ID is required. Run publish.ts first and set it in .env.");

  const rpcUrl = process.env.RPC_URL || getFullnodeUrl("testnet");
  const keypair = loadKeypair();
  const client = new SuiClient({ url: rpcUrl });

  const dropName = process.env.DROP_NAME ?? "My Drop";
  const totalSupply = Number(process.env.DROP_TOTAL_SUPPLY ?? "100");
  const walrusBlobId = walrusBlobBytes();

  if (Number.isNaN(totalSupply) || totalSupply < 1) throw new Error("DROP_TOTAL_SUPPLY must be a positive number.");

  console.log("[create-drop] Calling create_drop...");
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::onchaindrips::create_drop`,
    arguments: [
      tx.object(adminCapId),
      tx.pure.string(dropName),
      tx.pure.u64(totalSupply),
      tx.pure.vector("u8", walrusBlobId),
      tx.object.clock(),
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
  const dropCreated = changes.find(
    (c) => c.type === "created" && "objectType" in c && String((c as { objectType: string }).objectType).includes("Drop")
  ) as { type: "created"; objectId: string; objectType: string } | undefined;

  const dropObjectId = dropCreated?.objectId;
  if (!dropObjectId) throw new Error("create_drop succeeded but Drop objectId not found in objectChanges.");

  console.log("\n--- Create drop result ---");
  console.log("dropObjectId:", dropObjectId);
  console.log("\n--- Copy into .env (and backend seed) ---");
  console.log(`DROP_OBJECT_ID=${dropObjectId}`);
  console.log("\n--- JSON (backend seed) ---");
  console.log(JSON.stringify({ dropObjectId, digest: result.digest }, null, 2));
}

main().catch((err) => {
  console.error("[create-drop] Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
