/**
 * Encrypt/decrypt claim URL tokens so NFC URLs use an opaque token instead of shirt object ID.
 * Token = base64url(IV || ciphertext || authTag) with AES-256-GCM; payload is JSON { dropId, shirtId }.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALG = "aes-256-gcm";
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;

function getKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

function toBase64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(str: string): Buffer {
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad) b64 += "=".repeat(4 - pad);
  return Buffer.from(b64, "base64");
}

/**
 * Encrypt dropId + shirtId into a URL-safe token. Returns base64url string.
 */
export function encryptClaimToken(secret: string, dropId: string, shirtId: string): string {
  const key = getKey(secret);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const payload = JSON.stringify({ dropId, shirtId });
  const enc = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, enc, authTag]);
  return toBase64url(combined);
}

/**
 * Decrypt a token and return { dropId, shirtId }. Returns null if invalid.
 */
export function decryptClaimToken(secret: string, token: string): { dropId: string; shirtId: string } | null {
  try {
    const t = (token ?? "").trim();
    if (!t) return null;
    const raw = fromBase64url(t);
    if (raw.length < IV_LEN + AUTH_TAG_LEN + 1) return null;
    const iv = raw.subarray(0, IV_LEN);
    const authTag = raw.subarray(raw.length - AUTH_TAG_LEN);
    const ciphertext = raw.subarray(IV_LEN, raw.length - AUTH_TAG_LEN);
    const key = getKey(secret);
    const decipher = createDecipheriv(ALG, key, iv);
    decipher.setAuthTag(authTag);
    const payload = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(payload) as { dropId?: string; shirtId?: string };
    if (typeof parsed.dropId !== "string" || typeof parsed.shirtId !== "string") return null;
    return { dropId: parsed.dropId, shirtId: parsed.shirtId };
  } catch {
    return null;
  }
}
