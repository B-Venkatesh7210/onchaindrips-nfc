/**
 * zkLogin utility functions for generating ephemeral keys, randomness, and handling OAuth
 */

import type { PublicKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { generateNonce, generateRandomness } from "@mysten/zklogin";
import { jwtDecode } from "jwt-decode";
import { ZKLOGIN_CONFIG } from "./zklogin-config";

/**
 * Generate ephemeral keypair and randomness for zkLogin session
 */
export function generateEphemeralKeyPair() {
  const ephemeralKeyPair = new Ed25519Keypair();
  const randomness = generateRandomness();
  
  return {
    ephemeralKeyPair,
    randomness,
  };
}

/**
 * Get the current epoch from Sui network
 */
export async function getCurrentEpoch(rpcUrl: string): Promise<number> {
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "suix_getLatestSuiSystemState",
        params: [],
      }),
    });
    
    const data = await response.json();
    return Number(data.result.epoch);
  } catch (error) {
    console.error("Failed to get current epoch:", error);
    throw new Error("Failed to get current epoch");
  }
}

/**
 * Generate nonce for OAuth flow
 * @param ephemeralPublicKey - The public key object from the ephemeral keypair
 * @param maxEpoch - Maximum epoch for key validity
 * @param randomness - Random bigint as string
 */
export function generateNonceForEpoch(
  ephemeralPublicKey: PublicKey,
  maxEpoch: number,
  randomness: string
): string {
  return generateNonce(ephemeralPublicKey, maxEpoch, randomness);
}

/**
 * Build Google OAuth URL
 */
export function buildGoogleOAuthUrl(nonce: string): string {
  const params = new URLSearchParams({
    client_id: ZKLOGIN_CONFIG.googleClientId,
    redirect_uri: ZKLOGIN_CONFIG.redirectUri,
    response_type: "id_token",
    scope: ZKLOGIN_CONFIG.googleScopes.join(" "),
    nonce: nonce,
  });
  
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Parse JWT token and extract claims
 */
export function parseJWT(jwt: string): {
  sub: string;
  aud: string;
  iss: string;
  email?: string;
  name?: string;
} {
  try {
    const decoded = jwtDecode(jwt);
    return decoded as any;
  } catch (error) {
    console.error("Failed to decode JWT:", error);
    throw new Error("Invalid JWT token");
  }
}

/**
 * Generate a deterministic salt from a string (e.g., Google sub claim)
 * Returns a BigInt-compatible numeric string
 */
function generateDeterministicSalt(input: string): string {
  // Simple hash function to generate a large number from the input string
  // This creates a deterministic salt based on the user's Google sub claim
  let hash = BigInt(0);
  for (let i = 0; i < input.length; i++) {
    const char = BigInt(input.charCodeAt(i));
    hash = ((hash << BigInt(5)) - hash) + char;
    hash = hash & BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"); // Keep it within 128 bits
  }
  return hash.toString();
}

/**
 * Get user salt for zkLogin address derivation
 * 
 * IMPORTANT: The salt must be:
 * 1. A numeric string (BigInt-compatible)
 * 2. Deterministic for the same user (same Google account = same salt = same address)
 * 3. Kept secret (don't expose it)
 * 
 * For development: We derive salt from the user's Google sub claim
 * For production: Use a backend salt service that stores salts securely
 */
export async function getUserSalt(jwt: string): Promise<string> {
  try {
    const { sub } = parseJWT(jwt);
    
    // Generate a deterministic salt from the user's Google sub claim
    // This ensures the same Google account always gets the same Sui address
    const salt = generateDeterministicSalt(sub + ZKLOGIN_CONFIG.userSalt);
    
    console.log("Generated deterministic salt for user");
    return salt;
  } catch (error) {
    console.error("Failed to get user salt:", error);
    throw new Error("Failed to get user salt");
  }
}

/**
 * Store zkLogin session data in browser storage
 */
export function storeZkLoginSession(data: {
  ephemeralPrivateKey: string;
  maxEpoch: number;
  randomness: string;
  jwtToken?: string;
  userSalt?: string;
  zkProof?: string;
  userAddress?: string;
}): void {
  if (typeof window === "undefined") return;
  
  const { storageKeys } = ZKLOGIN_CONFIG;
  
  sessionStorage.setItem(storageKeys.ephemeralPrivateKey, data.ephemeralPrivateKey);
  sessionStorage.setItem(storageKeys.maxEpoch, data.maxEpoch.toString());
  sessionStorage.setItem(storageKeys.randomness, data.randomness);
  
  if (data.jwtToken) {
    sessionStorage.setItem(storageKeys.jwtToken, data.jwtToken);
  }
  if (data.userSalt) {
    sessionStorage.setItem(storageKeys.userSalt, data.userSalt);
  }
  if (data.zkProof) {
    sessionStorage.setItem(storageKeys.zkProof, JSON.stringify(data.zkProof));
  }
  if (data.userAddress) {
    localStorage.setItem(storageKeys.userAddress, data.userAddress);
  }
}

/**
 * Store return URL before OAuth redirect (so we can redirect back after login)
 */
export function storeReturnTo(path: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ZKLOGIN_CONFIG.storageKeys.returnTo, path);
}

/**
 * Get and clear stored return URL (one-time use after login)
 */
export function getAndClearReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  const path = sessionStorage.getItem(ZKLOGIN_CONFIG.storageKeys.returnTo);
  sessionStorage.removeItem(ZKLOGIN_CONFIG.storageKeys.returnTo);
  return path;
}

/**
 * Load zkLogin session data from browser storage
 */
export function loadZkLoginSession(): {
  ephemeralPrivateKey: string | null;
  maxEpoch: number | null;
  randomness: string | null;
  jwtToken: string | null;
  userSalt: string | null;
  zkProof: any | null;
  userAddress: string | null;
} {
  if (typeof window === "undefined") {
    return {
      ephemeralPrivateKey: null,
      maxEpoch: null,
      randomness: null,
      jwtToken: null,
      userSalt: null,
      zkProof: null,
      userAddress: null,
    };
  }
  
  const { storageKeys } = ZKLOGIN_CONFIG;
  
  const ephemeralPrivateKey = sessionStorage.getItem(storageKeys.ephemeralPrivateKey);
  const maxEpochStr = sessionStorage.getItem(storageKeys.maxEpoch);
  const randomness = sessionStorage.getItem(storageKeys.randomness);
  const jwtToken = sessionStorage.getItem(storageKeys.jwtToken);
  const userSalt = sessionStorage.getItem(storageKeys.userSalt);
  const zkProofStr = sessionStorage.getItem(storageKeys.zkProof);
  const userAddress = localStorage.getItem(storageKeys.userAddress);
  
  return {
    ephemeralPrivateKey,
    maxEpoch: maxEpochStr ? parseInt(maxEpochStr, 10) : null,
    randomness,
    jwtToken,
    userSalt,
    zkProof: zkProofStr ? JSON.parse(zkProofStr) : null,
    userAddress,
  };
}

/**
 * Clear zkLogin session data
 */
export function clearZkLoginSession(): void {
  if (typeof window === "undefined") return;
  
  const { storageKeys } = ZKLOGIN_CONFIG;
  
  sessionStorage.removeItem(storageKeys.ephemeralPrivateKey);
  sessionStorage.removeItem(storageKeys.maxEpoch);
  sessionStorage.removeItem(storageKeys.randomness);
  sessionStorage.removeItem(storageKeys.jwtToken);
  sessionStorage.removeItem(storageKeys.userSalt);
  sessionStorage.removeItem(storageKeys.zkProof);
  sessionStorage.removeItem(storageKeys.returnTo);
  localStorage.removeItem(storageKeys.userAddress);
}
