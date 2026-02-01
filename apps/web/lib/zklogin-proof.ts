/**
 * zkLogin proof generation using Mysten's prover service
 */

import type { PublicKey } from "@mysten/sui/cryptography";
import { getExtendedEphemeralPublicKey } from "@mysten/zklogin";
import axios from "axios";
import { ZKLOGIN_CONFIG } from "./zklogin-config";

export interface ZkProof {
  proofPoints: {
    a: string[];
    b: string[][];
    c: string[];
  };
  issBase64Details: {
    value: string;
    indexMod4: number;
  };
  headerBase64: string;
}

/**
 * Generate ZK proof using Mysten's prover service
 */
export async function generateZkProof(params: {
  jwt: string;
  ephemeralPublicKey: PublicKey;
  maxEpoch: number;
  randomness: string;
  userSalt: string;
}): Promise<ZkProof> {
  const { jwt, ephemeralPublicKey, maxEpoch, randomness, userSalt } = params;
  
  try {
    // Get extended ephemeral public key (expects PublicKey object)
    const extendedEphemeralPublicKey = getExtendedEphemeralPublicKey(ephemeralPublicKey);
    
    // Prepare request payload for prover service
    const payload = {
      jwt,
      extendedEphemeralPublicKey,
      maxEpoch,
      jwtRandomness: randomness,
      salt: userSalt,
      keyClaimName: "sub", // Google uses 'sub' for user ID
    };
    
    console.log("Requesting ZK proof from prover service...");
    
    // Call Mysten's prover service
    const response = await axios.post(ZKLOGIN_CONFIG.proverUrl, payload, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 60000, // 60 second timeout (proof generation can take time)
    });
    
    if (!response.data) {
      throw new Error("No proof data received from prover service");
    }
    
    console.log("ZK proof generated successfully");
    
    return response.data as ZkProof;
  } catch (error) {
    console.error("Failed to generate ZK proof:", error);
    
    if (axios.isAxiosError(error)) {
      if (error.response) {
        throw new Error(
          `Prover service error: ${error.response.status} - ${JSON.stringify(error.response.data)}`
        );
      } else if (error.request) {
        throw new Error("No response from prover service. Check your network connection.");
      }
    }
    
    throw new Error("Failed to generate ZK proof");
  }
}
