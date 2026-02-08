import { createPublicClient, http } from "viem";
import { normalize } from "viem/ens";
import { mainnet } from "viem/chains";

const ETH_RPC_URL =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_ETH_RPC_URL
    ? process.env.NEXT_PUBLIC_ETH_RPC_URL
    : "https://cloudflare-eth.com";

/** When true, "Connect EVM wallet & load ENS" uses vitalik.eth for testing (no wallet required). */
const ENS_TEST_MODE =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_ENS_TEST_MODE === "true";

const VITALIK_ETH = {
  address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" as const,
  name: "vitalik.eth",
};

const client = createPublicClient({
  chain: mainnet,
  transport: http(ETH_RPC_URL),
});

const ENS_TEXT_KEYS = [
  "avatar",
  "description",
  "url",
  "email",
  "com.twitter",
  "com.telegram",
  "com.github",
] as const;

export type EnsRecords = Record<string, string>;

export type EnsProfileFromWallet = {
  address: string;
  ensName: string;
  records: EnsRecords;
};

declare global {
  interface Window {
    ethereum?: {
      request(args: { method: string; params?: unknown[] }): Promise<unknown>;
    };
  }
}

async function getEnsTextRecords(name: string): Promise<EnsRecords> {
  const out: EnsRecords = {};
  const normalizedName = normalize(name);
  for (const key of ENS_TEXT_KEYS) {
    try {
      const value = await client.getEnsText({ name: normalizedName, key });
      if (value) out[key] = value;
    } catch {
      // ignore missing keys / resolver issues
    }
  }
  // Skip client-side getEnsAvatar — it fetches from euc.li and triggers CORS errors in the browser.
  // ShirtPageContent uses https://metadata.ens.domains/mainnet/avatar/{name} for display instead.
  return out;
}

export function hasEvmProvider(): boolean {
  if (typeof window === "undefined") return false;
  if (ENS_TEST_MODE) return true;
  return typeof window.ethereum !== "undefined";
}

/**
 * Connect to an EVM wallet via window.ethereum, resolve ENS name and text records.
 * When NEXT_PUBLIC_ENS_TEST_MODE=true, uses vitalik.eth for testing (no wallet popup).
 * Throws on failure; caller should catch and surface a friendly error.
 */
export async function connectWalletAndLoadEnsProfile(): Promise<EnsProfileFromWallet> {
  if (ENS_TEST_MODE) {
    const records = await getEnsTextRecords(VITALIK_ETH.name);
    return {
      address: VITALIK_ETH.address,
      ensName: VITALIK_ETH.name,
      records,
    };
  }

  if (!hasEvmProvider()) {
    throw new Error("No Ethereum wallet found in this browser.");
  }
  const accounts = (await window.ethereum!.request({
    method: "eth_requestAccounts",
  })) as string[];
  if (!accounts || accounts.length === 0) {
    throw new Error("No account returned from wallet.");
  }
  const address = accounts[0] as string;

  let ensName: string | null = null;
  try {
    ensName = await client.getEnsName({ address: address as `0x${string}` });
  } catch {
    // Some RPCs / gateways may revert internal ENS helper calls; treat as "no name".
    ensName = null;
  }
  if (!ensName) {
    throw new Error("This address does not have a primary ENS name.");
  }

  const records = await getEnsTextRecords(ensName);
  return { address, ensName, records };
}

