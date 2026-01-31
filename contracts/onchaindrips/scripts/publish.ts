/**
 * Publishes the OnchainDrips Move package to Sui testnet.
 * Prints packageId and AdminCap objectId for use in .env and backend.
 *
 * Requires: PRIVATE_KEY, RPC_URL
 * Requires: Sui CLI (sui) on PATH for build step.
 */

import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { loadKeypair } from "./keypair.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, "..");

function buildPackage(): { modules: string[]; dependencies: string[] } {
  console.log("[publish] Building Move package...");
  try {
    const out = execSync(`sui move build --dump-bytecode-as-base64 --path "${PACKAGE_ROOT}"`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
    const parsed = JSON.parse(out.trim()) as { modules?: string[]; dependencies?: string[] };
    if (!parsed.modules?.length) throw new Error("Build produced no modules.");
    return {
      modules: parsed.modules,
      dependencies: Array.isArray(parsed.dependencies) ? parsed.dependencies : [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("sui move build")) throw new Error("Sui CLI not found. Install Sui and ensure `sui` is on PATH.");
    throw new Error(`Build failed: ${message}`);
  }
}

async function main() {
  const rpcUrl = process.env.RPC_URL || getFullnodeUrl("testnet");
  const keypair = loadKeypair();
  const client = new SuiClient({ url: rpcUrl });

  const { modules, dependencies } = buildPackage();
  console.log("[publish] Publishing to testnet...");

  const tx = new Transaction();
  const [upgradeCap] = tx.publish({ modules, dependencies });
  tx.transferObjects([upgradeCap], keypair.toSuiAddress());

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: {
      showObjectChanges: true,
      showEffects: true,
    },
  });

  if (result.effects?.status?.status !== "success") {
    const err = result.effects?.status?.error ?? result.effects?.status?.status;
    throw new Error(`Transaction failed: ${JSON.stringify(err)}`);
  }

  const changes = result.objectChanges ?? [];
  const published = changes.find((c) => c.type === "published") as { type: "published"; packageId: string } | undefined;
  const adminCapCreated = changes.find(
    (c) => c.type === "created" && "objectType" in c && String((c as { objectType: string }).objectType).includes("AdminCap")
  ) as { type: "created"; objectId: string; objectType: string } | undefined;

  const packageId = published?.packageId;
  const adminCapObjectId = adminCapCreated?.objectId;

  if (!packageId) throw new Error("Publish succeeded but packageId not found in objectChanges.");
  if (!adminCapObjectId) throw new Error("Publish succeeded but AdminCap objectId not found in objectChanges.");

  console.log("\n--- Publish result ---");
  console.log("packageId:", packageId);
  console.log("adminCapObjectId:", adminCapObjectId);
  console.log("\n--- Copy into .env (and backend seed) ---");
  console.log(`PACKAGE_ID=${packageId}`);
  console.log(`ADMIN_CAP_OBJECT_ID=${adminCapObjectId}`);
  console.log("\n--- JSON (backend seed) ---");
  console.log(
    JSON.stringify(
      { packageId, adminCapObjectId, digest: result.digest },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("[publish] Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
