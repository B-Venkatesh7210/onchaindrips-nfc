/**
 * Yellow / Nitrolite integration: three-step flow for hackathon bidding.
 * - Step 1: Create channel (Sepolia + ytest.usd)
 * - Step 2: Faucet → Unified Balance → allocate_amount into channel
 * - Step 3: Winner signs close channel to release funds to organizer
 */

import {
  createAuthRequestMessage,
  createAuthVerifyMessageFromChallenge,
  createCreateChannelMessage,
  createResizeChannelMessage,
  createCloseChannelMessage,
  createGetChannelsMessageV2,
  createEIP712AuthMessageSigner,
  parseAnyRPCResponse,
  RPCMethod,
} from "@erc7824/nitrolite";
import type { RPCData } from "@erc7824/nitrolite";

function parseRPCResponse(data: string | unknown): { method: string; params?: Record<string, unknown> } | null {
  try {
    const str = typeof data === "string" ? data : JSON.stringify(data);
    const parsed = parseAnyRPCResponse(str);
    return { method: parsed.method, params: parsed.params as Record<string, unknown> };
  } catch {
    try {
      const obj = typeof data === "string" ? JSON.parse(data) : data;
      if (obj?.res && Array.isArray(obj.res)) return { method: obj.res[1], params: obj.res[2] };
      if (obj?.method) return { method: obj.method, params: obj.params };
    } catch {}
    return null;
  }
}
import { createWalletClient, custom } from "viem";
import { sepolia } from "viem/chains";
import { keccak256, toHex } from "viem";

// --- Config ---
const SANDBOX_WS_URL = "wss://clearnet-sandbox.yellow.com/ws";
const SEPOLIA_CHAIN_ID = 11155111;
/** Yellow sandbox ytest.usd token on Sepolia. Update if sandbox uses different address. */
const YTEST_USD_TOKEN = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;
const USDC_DECIMALS = 6;
const DEFAULT_APP_ID = "onchaindrips-nfc-bidding";

const LOG_PREFIX = "[Yellow]";

/** Yellow sandbox: use local balance & simulated flow (Sepolia + ytest.usd). Set NEXT_PUBLIC_YELLOW_SANDBOX=true */
export function useYellowSandbox(): boolean {
  if (typeof process === "undefined") return false;
  return process.env.NEXT_PUBLIC_YELLOW_SANDBOX === "true" || process.env.NEXT_PUBLIC_YELLOW_DEMO_MODE === "true";
}

function log(step: string, detail?: string): void {
  const msg = detail ? `${LOG_PREFIX} ${step}: ${detail}` : `${LOG_PREFIX} ${step}`;
  console.log(msg);
}
function logFail(step: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`${LOG_PREFIX} FAILED at ${step}:`, msg, err);
}

// --- Types ---
export type YellowConnection = {
  ws: WebSocket;
  url: string;
};

export type YellowSession = {
  userAddress: string;
  appId: string;
  depositedUsd: number;
  channelId?: string;
};

let yellowConn: YellowConnection | null = null;

// --- Message signer (Nitrolite expects raw ECDSA: keccak256(JSON) signed). ---
// Use eth_sign first (Rabby supports it); fallback to personal_sign (MetaMask).
function createBrowserMessageSigner(
  ethereum: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> },
  address: string
): (payload: RPCData) => Promise<`0x${string}`> {
  return async (payload: RPCData) => {
    const msg = toHex(
      JSON.stringify(payload, (_, v) => (typeof v === "bigint" ? v.toString() : v))
    );
    const hash = keccak256(msg);
    const method = Array.isArray(payload) && payload[1] ? String(payload[1]) : "unknown";
    log("Sign", `Signing payload for method=${method} (eth_sign for Rabby)`);

    let sig: string;
    try {
      sig = (await ethereum.request({
        method: "eth_sign",
        params: [address, hash],
      })) as string;
      log("Sign", "eth_sign succeeded (Rabby-compatible)");
    } catch (e) {
      log("Sign", "eth_sign failed, trying personal_sign (MetaMask)");
      try {
        sig = (await ethereum.request({
          method: "personal_sign",
          params: [hash, address],
        })) as string;
        log("Sign", "personal_sign succeeded (may fail Yellow verification)");
      } catch (personalErr) {
        logFail("Sign (wallet)", personalErr);
        throw new Error(
          "Wallet signing failed. Rabby (rabby.io) is recommended for Yellow."
        );
      }
    }

    if (!sig || typeof sig !== "string") {
      const err = new Error("Wallet did not return a signature");
      logFail("Sign", err);
      throw err;
    }
    return sig as `0x${string}`;
  };
}

/** Connect to Yellow sandbox WebSocket (idempotent). */
export function connectYellowSandbox(): Promise<YellowConnection> {
  log("Step 1/5", "Connecting to Yellow WebSocket");
  if (typeof window === "undefined") {
    const err = new Error("Yellow connection can only be created in the browser");
    logFail("Step 1/5 (WebSocket)", err);
    throw err;
  }
  if (yellowConn && yellowConn.ws.readyState === WebSocket.OPEN) {
    log("Step 1/5", "WebSocket already connected");
    return Promise.resolve(yellowConn);
  }
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(SANDBOX_WS_URL);
    const fail = (err: Error) => {
      ws.onopen = null;
      ws.onerror = null;
      logFail("Step 1/5 (WebSocket)", err);
      reject(err);
    };
    const t = setTimeout(
      () => fail(new Error("Yellow WebSocket connection timed out (10s)")),
      10_000
    );
    ws.onopen = () => {
      clearTimeout(t);
      yellowConn = { ws, url: SANDBOX_WS_URL };
      log("Step 1/5", "WebSocket connected");
      resolve(yellowConn);
    };
    ws.onerror = () => {
      clearTimeout(t);
      fail(new Error("Failed to connect to Yellow sandbox"));
    };
  });
}

/** Switch wallet to Sepolia (required for Yellow). Prompts user if on wrong network. */
async function ensureSepolia(ethereum: { request: (args: unknown) => Promise<unknown> }): Promise<void> {
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${SEPOLIA_CHAIN_ID.toString(16)}` }],
    });
  } catch (e) {
    // 4902 = chain not added; add Sepolia
    if ((e as { code?: number }).code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: `0x${SEPOLIA_CHAIN_ID.toString(16)}`,
          chainName: "Sepolia",
          nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://rpc.sepolia.org"],
          blockExplorerUrls: ["https://sepolia.etherscan.io"],
        }],
      });
    } else {
      throw e;
    }
  }
}

/** Connect EVM wallet and return address. */
export async function connectYellowWallet(): Promise<string> {
  log("Wallet", "Requesting EVM accounts");
  if (typeof window === "undefined" || !(window as unknown as { ethereum?: unknown }).ethereum) {
    const err = new Error("EVM wallet provider (window.ethereum) not found");
    logFail("Wallet", err);
    throw err;
  }
  const ethereum = (window as unknown as { ethereum: { request: (args: unknown) => Promise<unknown> } })
    .ethereum;
  const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
  const addr = accounts?.[0];
  if (!addr) {
    const err = new Error("No EVM account selected");
    logFail("Wallet", err);
    throw err;
  }
  log("Wallet", `Connected: ${addr.slice(0, 10)}…`);
  return addr;
}

/**
 * Send a message over WS and wait for a matching response (or auth_challenge).
 * Returns the parsed response. Handles auth_challenge → auth_verify automatically.
 * @param expectMethod - If set, only resolve when response method matches (e.g. auth_verify for auth flow).
 *   Ignores other methods like "assets" that may arrive first.
 */
async function sendAndWait(
  conn: YellowConnection,
  message: string,
  signer: (payload: RPCData) => Promise<`0x${string}`>,
  userAddress: string,
  expectMethod?: string
): Promise<{ method: string; params?: Record<string, unknown>; result?: unknown }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      conn.ws.onmessage = null;
      const err = new Error("Yellow request timed out (15s). Check connection.");
      logFail("sendAndWait (timeout)", err);
      reject(err);
    }, 15_000);

    const handler = async (event: MessageEvent) => {
      try {
        const parsed = parseRPCResponse(event.data);
        if (!parsed) return;

        const method = (parsed as { method?: string }).method;
        log("sendAndWait", `Received: ${method}`);

        if (method === RPCMethod.AuthChallenge) {
          conn.ws.onmessage = null;
          clearTimeout(timeout);
          const params = (parsed as { params?: Record<string, unknown> }).params ?? {};
          const challenge = (params.challengeMessage as string) ?? (params.challenge_message as string);
          if (!challenge) {
            const err = new Error("Auth challenge missing challengeMessage");
            logFail("sendAndWait (AuthChallenge)", err);
            reject(err);
            return;
          }
          console.log("[Yellow] DEBUG auth_challenge received:", {
            challenge,
            challengeLength: challenge.length,
            fullParams: params,
            rawResponse: typeof event.data === "string" ? event.data : JSON.stringify(event.data),
          });
          log("sendAndWait", "AuthChallenge received, signing AuthVerify");
          const verifyMsg = await createAuthVerifyMessageFromChallenge(signer, challenge);
          console.log("[Yellow] DEBUG auth_verify sent (message length:", verifyMsg.length, ")");
          conn.ws.send(verifyMsg);
          conn.ws.onmessage = handler;
          return;
        }

        if (method === RPCMethod.Error) {
          conn.ws.onmessage = null;
          clearTimeout(timeout);
          const params = (parsed as { params?: Record<string, unknown> }).params ?? {};
          const errMsg =
            ((params.error as string) ?? (params.message as string) ?? JSON.stringify(params)) ||
            "Unknown error";
          const err = new Error(String(errMsg));
          logFail("sendAndWait (Error response)", err);
          console.error("[Yellow] DEBUG error response:", {
            params,
            rawResponse: typeof event.data === "string" ? event.data : JSON.stringify(event.data),
          });
          reject(err);
          return;
        }

        if (expectMethod && method !== expectMethod) {
          log("sendAndWait", `Ignoring ${method}, waiting for ${expectMethod}`);
          return;
        }

        log("sendAndWait", `Success: ${method}`);
        conn.ws.onmessage = null;
        clearTimeout(timeout);
        resolve(parsed as { method: string; params?: Record<string, unknown>; result?: unknown });
      } catch (e) {
        conn.ws.onmessage = null;
        clearTimeout(timeout);
        reject(e);
      }
    };

    conn.ws.onmessage = handler;
    conn.ws.send(message);
  });
}

/**
 * Authenticate with Yellow (auth_request → auth_challenge → auth_verify).
 * auth_verify MUST be EIP-712 signed (not raw keccak256). Per Yellow docs:
 * https://docs.yellow.org/docs/protocol/off-chain/authentication
 */
async function authenticateWithYellow(
  conn: YellowConnection,
  ethereum: { request: (args: unknown) => Promise<unknown> },
  userAddress: string
): Promise<void> {
  log("Auth", "Ensuring wallet is on Sepolia");
  await ensureSepolia(ethereum);

  log("Auth", "Sending auth_request (public endpoint, no signature)");
  // Yellow docs: "Provide a 13-digit Unix ms timestamp". Server timestamps in logs are 13-digit ms.
  const expiresAt = BigInt(Date.now() + 3600_000); // 1 hour from now, milliseconds
  const allowances = [{ asset: "ytest.usd", amount: "999999999" }];
  // Yellow docs: application defaults to "clearnode"
  const application = "clearnode";

  console.log("[Yellow] DEBUG auth_request params:", {
    address: userAddress,
    session_key: userAddress,
    application,
    scope: "*",
    expires_at: expiresAt.toString(),
    expires_at_raw: Number(expiresAt),
    allowances,
  });

  const authRequest = await createAuthRequestMessage({
    address: userAddress as `0x${string}`,
    session_key: userAddress as `0x${string}`,
    application,
    allowances,
    expires_at: expiresAt,
    scope: "*",
  });

  const walletClient = createWalletClient({
    account: userAddress as `0x${string}`,
    chain: sepolia,
    transport: custom(ethereum),
  });
  if (!walletClient.account) {
    throw new Error("Wallet client could not resolve account");
  }
  const eip712PartialMessage = {
    scope: "*",
    session_key: userAddress as `0x${string}`,
    expires_at: expiresAt,
    allowances,
  };
  // Domain with chainId so MetaMask shows Sepolia. User must be on Sepolia (ensureSepolia switches).
  const eip712Domain = { name: application, chainId: SEPOLIA_CHAIN_ID };
  console.log("[Yellow] DEBUG EIP-712 signer config:", {
    partialMessage: { ...eip712PartialMessage, expires_at: eip712PartialMessage.expires_at.toString() },
    domain: eip712Domain,
  });

  const eip712Signer = createEIP712AuthMessageSigner(walletClient, eip712PartialMessage, eip712Domain);

  log("Auth", "Waiting for auth_challenge → auth_verify (EIP-712 signTypedData)");
  await sendAndWait(conn, authRequest, eip712Signer, userAddress, RPCMethod.AuthVerify);
  log("Auth", "Authentication complete");
}

/** Step 2: Create Yellow channel on Sepolia with ytest.usd. */
export async function createYellowChannel(userAddress: string): Promise<string> {
  log("Step 2/5", "Creating Yellow channel (chain=Sepolia, token=ytest.usd)");
  if (typeof window === "undefined" || !(window as unknown as { ethereum?: unknown }).ethereum) {
    const err = new Error("EVM wallet required");
    logFail("Step 2/5 (CreateChannel)", err);
    throw err;
  }
  const ethereum = (window as unknown as { ethereum: { request: (args: unknown) => Promise<unknown> } })
    .ethereum;
  const signer = createBrowserMessageSigner(ethereum, userAddress);
  const conn = await connectYellowSandbox();

  await authenticateWithYellow(conn, ethereum, userAddress);

  log("Step 2/5", "Signing CreateChannel message (wallet will prompt)");
  let msg: string;
  try {
    msg = await createCreateChannelMessage(signer, {
      chain_id: SEPOLIA_CHAIN_ID,
      token: YTEST_USD_TOKEN as `0x${string}`,
    });
  } catch (e) {
    logFail("Step 2/5 (CreateChannel sign)", e);
    throw new Error(`CreateChannel sign failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  log("Step 2/5", "Sending CreateChannel, waiting for response");
  let resp: { method: string; params?: Record<string, unknown> };
  try {
    resp = await sendAndWait(conn, msg, signer, userAddress);
  } catch (e) {
    logFail("Step 2/5 (CreateChannel sendAndWait)", e);
    throw e;
  }

  const channelId = (resp.params?.channelId ?? resp.params?.channel_id) as string | undefined;
  if (!channelId) {
    const err = new Error("Create channel did not return channel_id");
    logFail("Step 2/5 (CreateChannel response)", err);
    throw err;
  }
  log("Step 2/5", `Channel created: ${channelId.slice(0, 14)}…`);
  storeChannelId(userAddress, channelId);
  return channelId;
}

/** Request ytest.usd from Yellow sandbox faucet (uses API proxy to avoid CORS). */
export async function requestFaucetTokens(userAddress: string): Promise<void> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  log("Step 3/5", `Requesting faucet tokens (POST ${apiUrl}/yellow/faucet)`);
  let res: Response;
  try {
    res = await fetch(`${apiUrl}/yellow/faucet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userAddress }),
    });
  } catch (e) {
    logFail("Step 3/5 (Faucet fetch)", e);
    throw new Error(`Faucet request failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const errMsg = (body as { error?: string; details?: string }).error ?? (body as { details?: string }).details ?? res.statusText;
    const err = new Error(`Faucet failed (${res.status}): ${errMsg}`);
    logFail("Step 3/5 (Faucet response)", err);
    throw err;
  }
  log("Step 3/5", "Faucet request successful");
}

/** Step 4: Allocate amount from Unified Balance into channel (after faucet). */
export async function allocateToChannel(
  userAddress: string,
  channelId: string,
  amountUsd: number
): Promise<void> {
  log("Step 4/5", `Allocating $${amountUsd} from Unified Balance into channel`);
  if (typeof window === "undefined" || !(window as unknown as { ethereum?: unknown }).ethereum) {
    const err = new Error("EVM wallet required");
    logFail("Step 4/5 (Allocate)", err);
    throw err;
  }
  const ethereum = (window as unknown as { ethereum: { request: (args: unknown) => Promise<unknown> } })
    .ethereum;
  const signer = createBrowserMessageSigner(ethereum, userAddress);
  const conn = await connectYellowSandbox();

  await authenticateWithYellow(conn, ethereum, userAddress);

  const units = BigInt(Math.round(amountUsd * 10 ** USDC_DECIMALS));
  log("Step 4/5", "Signing ResizeChannel (allocate_amount)");
  let msg: string;
  try {
    msg = await createResizeChannelMessage(signer, {
      channel_id: channelId as `0x${string}`,
      allocate_amount: units,
      funds_destination: userAddress as `0x${string}`,
    });
  } catch (e) {
    logFail("Step 4/5 (Allocate sign)", e);
    throw new Error(`Allocate sign failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  log("Step 4/5", "Sending ResizeChannel, waiting for response");
  try {
    await sendAndWait(conn, msg, signer, userAddress);
  } catch (e) {
    logFail("Step 4/5 (Allocate sendAndWait)", e);
    throw e;
  }
  log("Step 4/5", "Allocate successful");
}

/** Step 3: Close channel (winner signs to release funds to organizer). */
export async function closeYellowChannel(
  userAddress: string,
  channelId: string,
  fundDestination: string
): Promise<void> {
  if (useYellowSandbox()) {
    await new Promise((r) => setTimeout(r, 500));
    return;
  }
  if (typeof window === "undefined" || !(window as unknown as { ethereum?: unknown }).ethereum) {
    throw new Error("EVM wallet required");
  }
  const ethereum = (window as unknown as { ethereum: { request: (args: unknown) => Promise<unknown> } })
    .ethereum;
  const signer = createBrowserMessageSigner(ethereum, userAddress);
  const conn = await connectYellowSandbox();

  await authenticateWithYellow(conn, ethereum, userAddress);

  const msg = await createCloseChannelMessage(
    signer,
    channelId as `0x${string}`,
    fundDestination as `0x${string}`
  );
  await sendAndWait(conn, msg, signer, userAddress);
}

/** Get user's open channels (may need auth first; returns [] if none). */
export async function getYellowChannels(userAddress: string): Promise<string[]> {
  const stored = getStoredChannelId(userAddress);
  if (stored) return [stored];
  const conn = await connectYellowSandbox();
  return new Promise((resolve) => {
    const msg = createGetChannelsMessageV2(userAddress as `0x${string}`);
    conn.ws.send(msg);
    const timeout = setTimeout(() => {
      conn.ws.onmessage = null;
      resolve([]);
    }, 10_000);
    conn.ws.onmessage = (event: MessageEvent) => {
      try {
        const parsed = parseRPCResponse(event.data);
        if (!parsed) return;
        const method = (parsed as { method?: string }).method;
        if (method === RPCMethod.ChannelsUpdate || method === RPCMethod.ChannelUpdate || method === RPCMethod.Error) {
          clearTimeout(timeout);
          conn.ws.onmessage = null;
          if (method === RPCMethod.Error) resolve([]);
          else {
            const ch = (parsed as { params?: { channels?: unknown[] } }).params?.channels ?? [];
            const ids = (ch as { channelId?: string; channel_id?: string }[])
              .map((c) => c.channelId ?? c.channel_id)
              .filter(Boolean) as string[];
            ids.forEach((id) => storeChannelId(userAddress, id));
            resolve(ids.length ? ids : []);
          }
        }
      } catch {
        resolve([]);
      }
    };
  });
}

// --- High-level flow ---

/** Yellow sandbox: open session with local balance (Sepolia + ytest.usd). */
async function openYellowSessionSandbox(
  userAddress: string,
  depositAmountUsd: number,
  onStep?: (step: string) => void
): Promise<YellowSession> {
  log("openYellowSession", "Yellow sandbox: opening session on Sepolia");

  if (typeof window !== "undefined" && (window as { ethereum?: { request: (a: unknown) => Promise<unknown> } }).ethereum) {
    const ethereum = (window as { ethereum: { request: (a: unknown) => Promise<unknown> } }).ethereum;
    onStep?.("Switching to Sepolia…");
    try {
      await ensureSepolia(ethereum);
    } catch (e) {
      log("openYellowSession", "Sepolia switch skipped or failed");
    }
  }

  onStep?.("Requesting token…");
  await new Promise((r) => setTimeout(r, 600));
  onStep?.("Allocation…");
  await new Promise((r) => setTimeout(r, 900));

  const existingChannel = getStoredChannelId(userAddress);
  const channelId = existingChannel ?? `0xYLW${userAddress.slice(2).padEnd(36, "0").slice(0, 36)}`;
  if (!existingChannel) storeChannelId(userAddress, channelId);

  // Faucet only once per wallet and only when balance is zero (first connect, no prior channel)
  const usedFaucet = getYellowFaucetUsed(userAddress);
  const balanceZero = !existingChannel;
  const needsFaucet = !usedFaucet && balanceZero;
  if (needsFaucet) {
    onStep?.("Requesting token…");
    await new Promise((r) => setTimeout(r, 500));
    onStep?.("Allocation…");
    await new Promise((r) => setTimeout(r, 2000));
    setYellowFaucetUsed(userAddress);
    setStoredYellowBalance(userAddress, YELLOW_INITIAL_BALANCE);
  }

  const balance = needsFaucet ? YELLOW_INITIAL_BALANCE : getStoredYellowBalance(userAddress);
  onStep?.("Done");
  const session: YellowSession = {
    userAddress,
    appId: DEFAULT_APP_ID,
    depositedUsd: balance,
    channelId,
  };
  setStoredEvmSession({ evmAddress: userAddress, depositedUsd: balance, channelId });
  return session;
}

/** Full flow: create channel, request faucet, allocate. Returns session. */
export async function openYellowSession(
  userAddress: string,
  depositAmountUsd: number,
  onStep?: (step: string) => void
): Promise<YellowSession> {
  if (useYellowSandbox()) {
    return openYellowSessionSandbox(userAddress, 10, onStep);
  }

  log("openYellowSession", `Starting for ${userAddress.slice(0, 10)}…, deposit=$${depositAmountUsd}`);

  let channelId: string | undefined = getStoredChannelId(userAddress);
  if (channelId) {
    log("openYellowSession", `Using stored channel: ${channelId.slice(0, 14)}…`);
  }

  if (!channelId) {
    onStep?.("Step 2/5: Creating Yellow channel");
    try {
      channelId = await createYellowChannel(userAddress);
    } catch (e) {
      logFail("openYellowSession (Step 2 - CreateChannel)", e);
      onStep?.("Failed: Create channel");
      throw new Error(`Step 2 failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  onStep?.("Step 3/5: Requesting faucet tokens");
  try {
    await requestFaucetTokens(userAddress);
  } catch (e) {
    logFail("openYellowSession (Step 3 - Faucet)", e);
    onStep?.("Failed: Faucet request");
    throw new Error(`Step 3 failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  onStep?.("Step 4/5: Waiting 2s for faucet settlement…");
  await new Promise((r) => setTimeout(r, 2000));

  onStep?.("Step 5/5: Allocating to channel");
  try {
    await allocateToChannel(userAddress, channelId, depositAmountUsd);
  } catch (e) {
    logFail("openYellowSession (Step 5 - Allocate)", e);
    onStep?.("Failed: Allocate to channel");
    throw new Error(`Step 5 failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  log("openYellowSession", "All steps complete");
  onStep?.("Done");
  return {
    userAddress,
    appId: DEFAULT_APP_ID,
    depositedUsd: depositAmountUsd,
    channelId,
  };
}

/** Top up existing channel with more faucet tokens. */
export async function topUpYellowChannel(
  session: YellowSession,
  additionalUsd: number
): Promise<YellowSession> {
  if (useYellowSandbox()) {
    await new Promise((r) => setTimeout(r, 800));
    const newBalance = session.depositedUsd + additionalUsd;
    setStoredYellowBalance(session.userAddress, newBalance);
    const updated = { ...session, depositedUsd: newBalance };
    setStoredEvmSession({ evmAddress: session.userAddress, depositedUsd: newBalance, channelId: session.channelId });
    return updated;
  }
  if (!session.channelId) throw new Error("No channel to top up");
  await requestFaucetTokens(session.userAddress);
  await new Promise((r) => setTimeout(r, 2000));
  await allocateToChannel(session.userAddress, session.channelId, additionalUsd);
  return {
    ...session,
    depositedUsd: session.depositedUsd + additionalUsd,
  };
}

export async function ensureYellowBalance(
  session: YellowSession | null,
  requiredAmountUsd: number
): Promise<void> {
  if (!session) throw new Error("Yellow session not started");
  if (useYellowSandbox()) {
    if (session.depositedUsd < requiredAmountUsd) {
      throw new Error("Insufficient Yellow balance. Request more from faucet.");
    }
    return;
  }
  if (requiredAmountUsd <= 0) throw new Error("Bid amount must be positive");
  if (session.depositedUsd < requiredAmountUsd) {
    throw new Error("Insufficient Yellow balance. Request more from faucet and fund your channel.");
  }
}

/** Lock bid off-chain (stub for now; full integration would use SubmitAppState). */
export async function lockBidAmountOffChain(params: {
  session: YellowSession;
  dropId: string;
  bidAmountUsd: number;
}): Promise<void> {
  void params;
}

/** Admin/winner: close channel to release funds to organizer. */
export async function settleYellowBidsClientSide(params: {
  organizer: string;
  winners: { address: string; amountUsd: number }[];
  dropId: string;
}): Promise<void> {
  if (useYellowSandbox()) {
    await new Promise((r) => setTimeout(r, 500));
    return;
  }
  if (!params.organizer || !params.winners.length) return;
  for (const w of params.winners) {
    const channelId = getStoredChannelId(w.address);
    if (channelId) {
      try {
        await closeYellowChannel(w.address, channelId, params.organizer);
      } catch (e) {
        console.warn(`Could not close channel for ${w.address}:`, e);
      }
    }
  }
}

const CHANNEL_STORAGE_KEY = "onchaindrips_yellow_channel";
const YELLOW_FAUCET_USED_KEY = "onchaindrips_yellow_faucet_used";
const YELLOW_BALANCE_KEY = "onchaindrips_yellow_balance";
const EVM_SESSION_KEY = "onchaindrips_yellow_evm_session";

/** Yellow sandbox: initial ytest.usd balance on first connect. */
export const YELLOW_INITIAL_BALANCE = 10;

/** Get persisted Yellow channel balance for address. */
export function getStoredYellowBalance(address: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const map = JSON.parse(localStorage.getItem(YELLOW_BALANCE_KEY) ?? "{}") as Record<string, number>;
    const val = map[address.toLowerCase()];
    return typeof val === "number" && Number.isFinite(val) ? val : 0;
  } catch {
    return 0;
  }
}

/** Set persisted Yellow channel balance for address. */
export function setStoredYellowBalance(address: string, amount: number): void {
  if (typeof window === "undefined") return;
  try {
    const map = JSON.parse(localStorage.getItem(YELLOW_BALANCE_KEY) ?? "{}") as Record<string, number>;
    map[address.toLowerCase()] = Math.max(0, amount);
    localStorage.setItem(YELLOW_BALANCE_KEY, JSON.stringify(map));
  } catch {}
}

/** Add amount to user's Yellow balance (e.g. when loser gets refund). */
export function addYellowBalance(address: string, amount: number): void {
  const curr = getStoredYellowBalance(address);
  setStoredYellowBalance(address, curr + amount);
}

/** Persist EVM Yellow session for auto-restore across drops. */
export function setStoredEvmSession(session: { evmAddress: string; depositedUsd: number; channelId?: string }): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(EVM_SESSION_KEY, JSON.stringify({
      evmAddress: session.evmAddress.toLowerCase(),
      depositedUsd: session.depositedUsd,
      channelId: session.channelId ?? null,
    }));
  } catch {}
}

/** Mark loser refund as done for drop+address (prevent double refund on remount). */
export function setLoserRefunded(dropId: string, evmAddress: string): void {
  if (typeof window === "undefined") return;
  try {
    const key = `${dropId}:${evmAddress.toLowerCase()}`;
    const set = new Set(JSON.parse(localStorage.getItem("onchaindrips_yellow_loser_refunded") ?? "[]") as string[]);
    set.add(key);
    localStorage.setItem("onchaindrips_yellow_loser_refunded", JSON.stringify([...set]));
  } catch {}
}

/** Check if loser refund already done for drop+address. */
export function getLoserRefunded(dropId: string, evmAddress: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const key = `${dropId}:${evmAddress.toLowerCase()}`;
    const set = new Set(JSON.parse(localStorage.getItem("onchaindrips_yellow_loser_refunded") ?? "[]") as string[]);
    return set.has(key);
  } catch {
    return false;
  }
}

/** Restore persisted EVM Yellow session (for auto-connect on other drops). */
export function getStoredEvmSession(): { evmAddress: string; depositedUsd: number; channelId?: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(EVM_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { evmAddress?: string; depositedUsd?: number; channelId?: string | null };
    if (!data?.evmAddress) return null;
    return {
      evmAddress: data.evmAddress,
      depositedUsd: typeof data.depositedUsd === "number" ? data.depositedUsd : 0,
      channelId: data.channelId ?? undefined,
    };
  } catch {
    return null;
  }
}

function getYellowFaucetUsed(address: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const set = JSON.parse(localStorage.getItem(YELLOW_FAUCET_USED_KEY) ?? "[]") as string[];
    return set.includes(address.toLowerCase());
  } catch {
    return false;
  }
}

function setYellowFaucetUsed(address: string): void {
  if (typeof window === "undefined") return;
  try {
    const set = new Set(
      JSON.parse(localStorage.getItem(YELLOW_FAUCET_USED_KEY) ?? "[]") as string[],
    );
    set.add(address.toLowerCase());
    localStorage.setItem(YELLOW_FAUCET_USED_KEY, JSON.stringify([...set]));
  } catch {}
}

export function storeChannelId(address: string, channelId: string): void {
  if (typeof window === "undefined") return;
  try {
    const map = JSON.parse(localStorage.getItem(CHANNEL_STORAGE_KEY) ?? "{}");
    map[address.toLowerCase()] = channelId;
    localStorage.setItem(CHANNEL_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export function getStoredChannelId(address: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const map = JSON.parse(localStorage.getItem(CHANNEL_STORAGE_KEY) ?? "{}");
    return map[address.toLowerCase()] ?? null;
  } catch {
    return null;
  }
}
