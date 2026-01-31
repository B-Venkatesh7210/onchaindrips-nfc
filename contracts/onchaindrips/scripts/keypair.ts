/**
 * Load keypair from PRIVATE_KEY env.
 * Accepts: Bech32 (suiprivkey1...), or 64-char hex (with or without 0x).
 */

import type { Keypair } from "@mysten/sui/cryptography";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Secp256k1Keypair } from "@mysten/sui/keypairs/secp256k1";
import { Secp256r1Keypair } from "@mysten/sui/keypairs/secp256r1";

export function loadKeypair(): Keypair {
  const raw = process.env.PRIVATE_KEY;
  if (!raw?.trim()) {
    throw new Error("PRIVATE_KEY is required. Set it in .env or the environment.");
  }
  const key = raw.trim().replace(/\s/g, "");

  // Bech32 (Phantom / Sui Wallet export)
  if (key.toLowerCase().startsWith("suiprivkey")) {
    try {
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`PRIVATE_KEY looks like Bech32 but failed to decode: ${msg}`);
    }
  }

  // 64-char hex (with or without 0x)
  const hex = key.startsWith("0x") ? key.slice(2) : key;
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    try {
      const bytes = Uint8Array.from(Buffer.from(hex, "hex"));
      return Ed25519Keypair.fromSecretKey(bytes);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`PRIVATE_KEY (hex) failed: ${msg}`);
    }
  }

  throw new Error(
    "PRIVATE_KEY must be Bech32 (suiprivkey1...) or 64-char hex. Remove spaces/newlines and ensure you copied the full key."
  );
}
