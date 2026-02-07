/**
 * Yellow Network proxy routes. Faucet request is proxied server-side to avoid CORS.
 */

import type { Request, Response } from "express";

const YELLOW_FAUCET_URL = "https://clearnet-sandbox.yellow.com/faucet/requestTokens";

/**
 * POST /yellow/faucet — request ytest.usd tokens for user (proxies to Yellow sandbox faucet).
 * Body: { userAddress: string }
 */
export async function faucetHandler(req: Request, res: Response): Promise<void> {
  const { userAddress } = req.body as { userAddress?: string };
  if (!userAddress || typeof userAddress !== "string" || !userAddress.trim()) {
    res.status(400).json({ error: "userAddress is required" });
    return;
  }
  const addr = (userAddress as string).trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    res.status(400).json({ error: "userAddress must be a valid 0x-prefixed EVM address" });
    return;
  }

  try {
    const faucetRes = await fetch(YELLOW_FAUCET_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userAddress: addr }),
    });
    const text = await faucetRes.text();
    if (!faucetRes.ok) {
      res.status(faucetRes.status).json({
        error: "Faucet request failed",
        details: text || faucetRes.statusText,
      });
      return;
    }
    try {
      const data = JSON.parse(text || "{}");
      res.json(data);
    } catch {
      res.json({ success: true, message: "Tokens requested" });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Faucet proxy failed", details: msg });
  }
}
