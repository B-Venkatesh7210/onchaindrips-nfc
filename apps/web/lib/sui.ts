/**
 * Sui client and transaction helpers. PACKAGE_ID from NEXT_PUBLIC_PACKAGE_ID.
 */

import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import type { Keypair } from "@mysten/sui/cryptography";
import { toB64 } from "@mysten/sui/utils";
import { Transaction } from "@mysten/sui/transactions";

const RPC_URL = process.env.NEXT_PUBLIC_SUI_RPC_URL ?? getFullnodeUrl("testnet");
const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID ?? "";

export function getSuiClient(): SuiClient {
  return new SuiClient({ url: RPC_URL });
}

/**
 * Build claim_and_transfer transaction (kind only, no gas).
 */
export async function buildClaimAndTransferKindBytes(
  shirtObjectId: string,
  recipient: string,
): Promise<Uint8Array> {
  if (!PACKAGE_ID) throw new Error("NEXT_PUBLIC_PACKAGE_ID is not set");
  const client = getSuiClient();
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::onchaindrips::claim_and_transfer`,
    arguments: [
      tx.object(shirtObjectId),
      tx.pure.address(recipient),
      tx.object.clock(),
    ],
  });
  const kindBytes = await tx.build({ client, onlyTransactionKind: true });
  return kindBytes;
}

/**
 * Sign kind bytes (for sponsor request). Backend uses this to get sender address.
 * Uses TransactionData intent so serialized signature contains public key.
 */
export async function signKindBytesForSponsor(
  keypair: Keypair,
  kindBytes: Uint8Array,
): Promise<string> {
  const { signature } = await keypair.signWithIntent(kindBytes, "TransactionData");
  return signature;
}

/**
 * Sign full transaction bytes (for execute).
 */
export async function signTransactionBytes(
  keypair: Keypair,
  txBytes: Uint8Array,
): Promise<string> {
  const { signature } = await keypair.signTransaction(txBytes);
  return signature;
}

/**
 * Submit a sponsored transaction (full tx bytes + user signature + sponsor signature).
 */
export async function executeSponsoredTransaction(
  txBytes: Uint8Array,
  userSignature: string,
  sponsorSignature: string,
): Promise<{ digest: string }> {
  const client = getSuiClient();
  const result = await client.executeTransactionBlock({
    transactionBlock: txBytes,
    signature: [userSignature, sponsorSignature],
    options: { showEffects: true },
  });
  if (result.effects?.status?.status !== "success") {
    const err = result.effects?.status?.error ?? result.effects?.status?.status;
    throw new Error(`Transaction failed: ${JSON.stringify(err)}`);
  }
  return { digest: result.digest };
}

/** Encode bytes to base64. */
export function toBase64(bytes: Uint8Array): string {
  return toB64(bytes);
}

/** Decode base64 to bytes. */
export function fromBase64(str: string): Uint8Array {
  if (typeof window === "undefined") {
    return new Uint8Array(Buffer.from(str, "base64"));
  }
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
