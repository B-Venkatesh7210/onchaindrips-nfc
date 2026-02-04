/**
 * zkLogin authentication module
 * Handles OAuth flow, proof generation, and session management
 */

import type { Keypair } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  generateEphemeralKeyPair,
  getCurrentEpoch,
  generateNonceForEpoch,
  buildGoogleOAuthUrl,
  getUserSalt,
  storeZkLoginSession,
  storeReturnTo,
  loadZkLoginSession,
  clearZkLoginSession,
  parseJWT,
} from "./zklogin-utils";
import { generateZkProof } from "./zklogin-proof";
import { getZkLoginAddress, createZkLoginSigner } from "./zklogin-signer";
import type { ZkLoginSignerData } from "./zklogin-signer";
import { validateZkLoginConfig } from "./zklogin-config";

const MAX_EPOCH_OFFSET = 10; // Ephemeral key valid for 10 epochs (~10 days on mainnet)

/**
 * Get stored user address (if logged in)
 */
export function getStoredAddress(): string | null {
  if (typeof window === "undefined") return null;
  const session = loadZkLoginSession();
  return session.userAddress;
}

/**
 * Get stored signer (if logged in and session is valid)
 */
export function getStoredSigner(): Keypair | null {
  if (typeof window === "undefined") return null;
  
  const session = loadZkLoginSession();
  
  // Check if we have all required data
  if (
    !session.ephemeralPrivateKey ||
    !session.userSalt ||
    !session.jwtToken ||
    !session.zkProof ||
    session.maxEpoch === null
  ) {
    return null;
  }
  
  try {
    const signerData: ZkLoginSignerData = {
      ephemeralPrivateKey: session.ephemeralPrivateKey,
      userSalt: session.userSalt,
      jwt: session.jwtToken,
      zkProof: session.zkProof,
      maxEpoch: session.maxEpoch,
    };
    
    return createZkLoginSigner(signerData) as any;
  } catch (error) {
    console.error("Failed to create zkLogin signer:", error);
    return null;
  }
}

/**
 * Start zkLogin OAuth flow
 * Redirects user to Google OAuth
 * @param rpcUrl - Sui RPC URL
 * @param returnTo - Path to redirect to after successful login (e.g. /{dropId}/{shirtObjectId})
 */
export async function loginWithGoogle(rpcUrl: string, returnTo?: string): Promise<void> {
  if (typeof window === "undefined") return;
  
  // Validate configuration
  const validation = validateZkLoginConfig();
  if (!validation.valid) {
    throw new Error(
      `Missing zkLogin configuration: ${validation.missing.join(", ")}. ` +
      "Please set up your Google OAuth credentials in .env.local"
    );
  }
  
  try {
    console.log("Starting zkLogin flow...");
    
    // 1. Generate ephemeral keypair and randomness
    const { ephemeralKeyPair, randomness } = generateEphemeralKeyPair();
    
    // 2. Get current epoch and calculate max epoch
    const currentEpoch = await getCurrentEpoch(rpcUrl);
    const maxEpoch = currentEpoch + MAX_EPOCH_OFFSET;
    
    console.log(`Current epoch: ${currentEpoch}, Max epoch: ${maxEpoch}`);
    
    // 3. Generate nonce (pass the public key object, not a string)
    const ephemeralPublicKey = ephemeralKeyPair.getPublicKey();
    const nonce = generateNonceForEpoch(ephemeralPublicKey, maxEpoch, randomness);
    
    console.log("Generated nonce:", nonce);
    
    // 4. Store ephemeral key, session data, and optional return path
    storeZkLoginSession({
      ephemeralPrivateKey: ephemeralKeyPair.getSecretKey(),
      maxEpoch,
      randomness,
    });
    if (returnTo) {
      storeReturnTo(returnTo);
    }
    
    // 5. Redirect to Google OAuth
    const oauthUrl = buildGoogleOAuthUrl(nonce);
    console.log("Redirecting to Google OAuth...");
    window.location.href = oauthUrl;
  } catch (error) {
    console.error("Failed to start zkLogin flow:", error);
    throw error;
  }
}

/**
 * Complete zkLogin flow after OAuth callback
 * Generates ZK proof and stores session
 */
export async function completeZkLogin(jwt: string): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("completeZkLogin can only be called in browser");
  }
  
  try {
    console.log("Completing zkLogin flow...");
    
    // 1. Load stored session data
    const session = loadZkLoginSession();
    
    if (!session.ephemeralPrivateKey || !session.randomness || session.maxEpoch === null) {
      throw new Error("No zkLogin session found. Please start login flow again.");
    }
    
    // 2. Parse JWT to get user info
    const jwtClaims = parseJWT(jwt);
    console.log("JWT claims:", { sub: jwtClaims.sub, email: jwtClaims.email });
    
    // 3. Get user salt
    console.log("Getting user salt...");
    const userSalt = await getUserSalt(jwt);
    
    // 4. Calculate zkLogin address
    const userAddress = getZkLoginAddress(jwt, userSalt);
    console.log("zkLogin address:", userAddress);
    
    // 5. Generate ZK proof
    console.log("Generating ZK proof (this may take 30-60 seconds)...");
    const ephemeralKeyPair = Ed25519Keypair.fromSecretKey(session.ephemeralPrivateKey);
    const ephemeralPublicKey = ephemeralKeyPair.getPublicKey();
    
    const zkProof = await generateZkProof({
      jwt,
      ephemeralPublicKey,
      maxEpoch: session.maxEpoch,
      randomness: session.randomness,
      userSalt,
    });
    
    console.log("ZK proof generated successfully");
    
    // 6. Store complete session
    storeZkLoginSession({
      ephemeralPrivateKey: session.ephemeralPrivateKey,
      maxEpoch: session.maxEpoch,
      randomness: session.randomness,
      jwtToken: jwt,
      userSalt,
      zkProof,
      userAddress,
    });
    
    console.log("zkLogin completed successfully");
    
    return userAddress;
  } catch (error) {
    console.error("Failed to complete zkLogin:", error);
    clearZkLoginSession();
    throw error;
  }
}

/**
 * Logout and clear session
 */
export function logout(): void {
  clearZkLoginSession();
}

/**
 * Check if user is logged in
 */
export function isLoggedIn(): boolean {
  const address = getStoredAddress();
  const signer = getStoredSigner();
  return address !== null && signer !== null;
}

/**
 * Get user info from stored JWT
 */
export function getUserInfo(): {
  email?: string;
  name?: string;
  sub?: string;
} | null {
  if (typeof window === "undefined") return null;
  
  const session = loadZkLoginSession();
  if (!session.jwtToken) return null;
  
  try {
    const claims = parseJWT(session.jwtToken);
    return {
      email: claims.email,
      name: claims.name,
      sub: claims.sub,
    };
  } catch {
    return null;
  }
}
