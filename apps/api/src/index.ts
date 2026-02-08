/**
 * OnChainDrips API: health, Shirt lookup, sponsored claim, Walrus upload, admin (drops/mint), drops list.
 *
 * Env: RPC_URL, PACKAGE_ID, SPONSOR_PRIVATE_KEY, ADMIN_CAP_OBJECT_ID, ADMIN_ADDRESS (optional), SUPABASE_* (optional).
 */

import "dotenv/config";
import cors from "cors";
import express, { type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { SuiClient } from "@mysten/sui/client";
import { config } from "./config.js";
import { uploadSingleImage } from "./multer.js";
import { claimHandler } from "./routes/claim.js";
import {
  createShirtRouter,
  getShirtProfileHandler,
  upsertShirtProfileHandler,
} from "./routes/shirt.js";
import { sponsorHandler } from "./routes/sponsor.js";
import { walrusUploadHandler, walrusFetchHandler, walrusUploadImageHandler } from "./routes/walrus.js";
import {
  adminMiddleware,
  listDropsHandler,
  createDropHandler,
  mintShirtsHandler,
  backfillShirtsHandler,
  resolveClaimTokenHandler,
  getDropBidsHandler,
  placeBidHandler,
  closeBidsHandler,
  getDropBidsSummaryHandler,
} from "./routes/admin.js";
import { uploadCarouselImageHandler } from "./routes/upload.js";
import { faucetHandler } from "./routes/yellow.js";
import { upsertUserHandler } from "./routes/users.js";

const app = express();
const client = new SuiClient({ url: config.rpcUrl });

// Allow frontend (e.g. localhost:3000) to call this API
app.use(cors({ origin: true }));

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
app.get("/shirt/:objectId/profile", getShirtProfileHandler);
app.post("/shirt/:objectId/profile", upsertShirtProfileHandler);

app.post("/sponsor", sponsorHandler);
app.post("/claim", claimHandler);

app.post("/walrus/upload", walrusUploadHandler);
app.post("/walrus/upload-image", uploadSingleImage, walrusUploadImageHandler);
app.get("/walrus/:blobId", walrusFetchHandler);

// Admin: upload carousel image to Supabase Storage (returns public URL)
app.post("/admin/upload-carousel-image", adminMiddleware, uploadSingleImage, uploadCarouselImageHandler);

// Public: list drops (from Supabase)
app.get("/drops", listDropsHandler);
// Public: resolve claim URL token to shirtObjectId (for /{dropId}/{token} NFC URLs). Token via query ?token= or path.
app.get("/drops/:dropId/resolve", resolveClaimTokenHandler);
// Public: bids for a drop (bidding / reservations)
app.get("/drops/:dropId/bids", getDropBidsHandler);
app.post("/drops/:dropId/bids", placeBidHandler);

// Yellow sandbox: faucet proxy (avoids CORS)
app.post("/yellow/faucet", faucetHandler);

// User registration on zkLogin sign-in
app.post("/users/upsert", upsertUserHandler);

// Admin-only (X-Admin-Address header must match ADMIN_ADDRESS)
app.get("/admin/drops", adminMiddleware, listDropsHandler);
app.post("/admin/drops", adminMiddleware, createDropHandler);
app.post("/admin/drops/:dropObjectId/mint", adminMiddleware, mintShirtsHandler);
app.post("/admin/drops/:dropObjectId/backfill-shirts", adminMiddleware, backfillShirtsHandler);
app.get("/admin/drops/:dropId/bids/summary", adminMiddleware, getDropBidsSummaryHandler);
app.post("/admin/drops/:dropId/bids/close", adminMiddleware, closeBidsHandler);

// 404
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler (including multer errors, e.g. file too large)
app.use((err: unknown, _req: Request, res: Response) => {
  console.error(err);
  if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "LIMIT_FILE_SIZE") {
    res.status(400).json({ error: "File too large (max 5MB)" });
    return;
  }
  res.status(500).json({ error: "Internal server error" });
});

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});
