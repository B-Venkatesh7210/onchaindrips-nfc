/**
 * Load sponsor keypair from SPONSOR_PRIVATE_KEY.
 * Accepts Bech32 (suiprivkey1...) or 64-char hex.
 */

import type { Keypair } from "@mysten/sui/cryptography";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Secp256k1Keypair } from "@mysten/sui/keypairs/secp256k1";
import { Secp256r1Keypair } from "@mysten/sui/keypairs/secp256r1";

export function loadSponsorKeypair(): Keypair {
  const raw = process.env.SPONSOR_PRIVATE_KEY;
  if (!raw?.trim()) throw new Error("SPONSOR_PRIVATE_KEY is required.");
  const key = raw.trim().replace(/\s/g, "");

  if (key.toLowerCase().startsWith("suiprivkey")) {
    const { schema, secretKey } = decodeSuiPrivateKey(key);
    switch (schema) {
      case "ED25519":
        return Ed25519Keypair.fromSecretKey(secretKey);
      case "Secp256k1":
        return Secp256k1Keypair.fromSecretKey(secretKey);
      case "Secp256r1":
        return Secp256r1Keypair.fromSecretKey(secretKey);
      default:
        throw new Error(`Unsupported key scheme: ${schema}`);
    }
  }

  const hex = key.startsWith("0x") ? key.slice(2) : key;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("SPONSOR_PRIVATE_KEY must be Bech32 (suiprivkey1...) or 64-char hex.");
  }
  return Ed25519Keypair.fromSecretKey(Uint8Array.from(Buffer.from(hex, "hex")));
}
