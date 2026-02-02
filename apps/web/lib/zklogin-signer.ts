/**
 * zkLogin signer implementation for signing transactions
 */

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { getZkLoginSignature, jwtToAddress } from "@mysten/zklogin";
import type { ZkProof } from "./zklogin-proof";

export interface ZkLoginSignerData {
  ephemeralPrivateKey: string;
  userSalt: string;
  jwt: string;
  zkProof: ZkProof;
  maxEpoch: number;
}

/**
 * Get zkLogin address from JWT and salt
 */
export function getZkLoginAddress(jwt: string, userSalt: string): string {
  return jwtToAddress(jwt, userSalt);
}

/**
 * Sign transaction bytes using zkLogin
 */
export async function signWithZkLogin(
  transactionBytes: Uint8Array,
  signerData: ZkLoginSignerData
): Promise<string> {
  const { ephemeralPrivateKey, userSalt, jwt, zkProof, maxEpoch } = signerData;
  
  try {
    // Recreate ephemeral keypair from stored private key
    const ephemeralKeyPair = Ed25519Keypair.fromSecretKey(ephemeralPrivateKey);
    
    // Sign the transaction with ephemeral key
    const ephemeralSignature = await ephemeralKeyPair.signPersonalMessage(transactionBytes);
    
    // Generate zkLogin signature
    const zkLoginSignature = getZkLoginSignature({
      inputs: {
        ...zkProof,
        addressSeed: userSalt,
      },
      maxEpoch,
      userSignature: ephemeralSignature.signature,
    });
    
    return zkLoginSignature;
  } catch (error) {
    console.error("Failed to sign with zkLogin:", error);
    throw new Error("Failed to sign transaction with zkLogin");
  }
}

/**
 * Create a zkLogin signer object that can be used for signing
 * Implements the same interface as Sui Keypair (signWithIntent, signTransaction, signPersonalMessage).
 */
export function createZkLoginSigner(signerData: ZkLoginSignerData) {
  return {
    getAddress: () => getZkLoginAddress(signerData.jwt, signerData.userSalt),

    /** Sign bytes with an intent (e.g. "TransactionData" for sponsor flow). */
    signWithIntent: async (bytes: Uint8Array, _intent: string) => {
      const signature = await signWithZkLogin(bytes, signerData);
      return {
        signature,
        bytes,
      };
    },

    signPersonalMessage: async (message: Uint8Array) => {
      const signature = await signWithZkLogin(message, signerData);
      return {
        signature,
        bytes: message,
      };
    },

    signTransaction: async (transactionBytes: Uint8Array) => {
      const signature = await signWithZkLogin(transactionBytes, signerData);
      return {
        signature,
        bytes: transactionBytes,
      };
    },
  };
}
