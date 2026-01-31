/**
 * OnChainDrips API: health, Shirt lookup, and sponsored claim_and_transfer.
 *
 * Env: RPC_URL, PACKAGE_ID, SPONSOR_PRIVATE_KEY.
 * Allowlist: data/allowlist.json (array of Shirt object IDs).
 */

import "dotenv/config";
import express, { type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { SuiClient } from "@mysten/sui/client";
import { config } from "./config.js";
import { createShirtRouter } from "./routes/shirt.js";
import { sponsorHandler } from "./routes/sponsor.js";

const app = express();
const client = new SuiClient({ url: config.rpcUrl });

// Rate limit: 100 requests per 15 minutes per IP (in-memory)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use(express.json({ limit: "64kb" }));

// --- Routes ---

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.get("/shirt/:objectId", createShirtRouter(client));

app.post("/sponsor", sponsorHandler);

// 404
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use((err: Error, _req: Request, res: Response) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});
