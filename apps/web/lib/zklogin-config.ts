/**
 * zkLogin configuration and constants
 */

export const ZKLOGIN_CONFIG = {
  // Google OAuth
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "",
  redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI || "http://localhost:3000/auth/callback",
  
  // zkLogin prover service
  proverUrl: process.env.NEXT_PUBLIC_PROVER_URL || "https://prover-dev.mystenlabs.com/v1",
  
  // Salt secret seed - combined with user's Google sub to derive deterministic salt
  // IMPORTANT: Keep this consistent! Changing it changes all user addresses!
  userSalt: process.env.ZKLOGIN_USER_SALT || "default-dev-salt-seed",
  
  // OAuth scopes
  googleScopes: ["openid", "email", "profile"],
  
  // Storage keys
  storageKeys: {
    ephemeralPrivateKey: "zklogin_ephemeral_private_key",
    maxEpoch: "zklogin_max_epoch",
    randomness: "zklogin_randomness",
    jwtToken: "zklogin_jwt_token",
    userSalt: "zklogin_user_salt",
    zkProof: "zklogin_zk_proof",
    userAddress: "zklogin_user_address",
    returnTo: "zklogin_return_to",
  },
} as const;

export function validateZkLoginConfig(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  if (!ZKLOGIN_CONFIG.googleClientId) {
    missing.push("NEXT_PUBLIC_GOOGLE_CLIENT_ID");
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}
