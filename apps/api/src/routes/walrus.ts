/**
 * Walrus blob routes: upload JSON metadata, upload image (multer), fetch blob by ID.
 * Uses Walrus HTTP API (publisher for upload, aggregator for read).
 */

import type { Request, Response } from "express";
import { config } from "../config.js";

const PUBLISHER = config.walrusPublisherUrl;
const AGGREGATOR = config.walrusAggregatorUrl;

/** Map common mime types to Walrus-friendly Content-Type */
function getContentType(mimetype: string): string {
  if (mimetype === "image/png" || mimetype === "image/jpeg" || mimetype === "image/webp" || mimetype === "image/gif") {
    return mimetype;
  }
  return "application/octet-stream";
}

/**
 * POST /walrus/upload
 * Body: { metadata: string } or raw string. Uploads to Walrus publisher, returns blobId.
 */
export async function walrusUploadHandler(req: Request, res: Response): Promise<void> {
  let body: string;
  const raw = req.body;
  if (typeof raw === "string" && raw.length > 0) {
    body = raw;
  } else if (raw && typeof raw === "object" && typeof (raw as { metadata?: string }).metadata === "string") {
    body = (raw as { metadata: string }).metadata;
  } else if (raw && typeof raw === "object") {
    body = JSON.stringify(raw);
  } else {
    res.status(400).json({ error: "Request body must be a string or { metadata: string }" });
    return;
  }

  try {
    const putRes = await fetch(`${PUBLISHER}/v1/blobs?epochs=3`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      res.status(putRes.status).json({ error: "Walrus upload failed", details: errText });
      return;
    }

    const data = (await putRes.json()) as {
      newlyCreated?: { blobObject?: { blobId?: string } };
      alreadyCertified?: { blobId?: string };
    };
    const blobId =
      data.newlyCreated?.blobObject?.blobId ?? data.alreadyCertified?.blobId ?? null;
    if (!blobId) {
      res.status(500).json({ error: "Walrus response missing blobId" });
      return;
    }
    res.json({ blobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Failed to upload to Walrus", details: message });
  }
}

/**
 * POST /walrus/upload-image
 * Multipart form field: "image" (file). Uploads raw bytes to Walrus, returns blobId.
 * Use multer before this handler: multer.single('image'), limit e.g. 5MB.
 */
export async function walrusUploadImageHandler(req: Request, res: Response): Promise<void> {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file?.buffer) {
    res.status(400).json({ error: "No image file provided; use multipart field 'image'" });
    return;
  }

  const contentType = getContentType(file.mimetype || "application/octet-stream");

  try {
    const putRes = await fetch(`${PUBLISHER}/v1/blobs?epochs=3`, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: new Uint8Array(file.buffer),
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      res.status(putRes.status).json({ error: "Walrus image upload failed", details: errText });
      return;
    }

    const data = (await putRes.json()) as {
      newlyCreated?: { blobObject?: { blobId?: string } };
      alreadyCertified?: { blobId?: string };
    };
    const blobId =
      data.newlyCreated?.blobObject?.blobId ?? data.alreadyCertified?.blobId ?? null;
    if (!blobId) {
      res.status(500).json({ error: "Walrus response missing blobId" });
      return;
    }
    res.json({ blobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Failed to upload image to Walrus", details: message });
  }
}

/**
 * Walrus expects blob IDs as URL-safe base64 (u256 → base64).
 * When we backfill from chain we store hex (blob ID bytes → hex). So if the param is hex, convert to base64url.
 */
function blobIdForWalrus(param: string): string {
  const trimmed = param.trim();
  const hexMatch = trimmed.match(/^[0-9a-fA-F]+$/);
  if (hexMatch && trimmed.length % 2 === 0) {
    try {
      const bytes = Buffer.from(trimmed, "hex");
      const base64 = bytes.toString("base64");
      const base64url = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      if (base64url.length > 0) return base64url;
    } catch {
      // fall through to use as-is
    }
  }
  return trimmed;
}

/**
 * GET /walrus/:blobId
 * Fetches blob from Walrus aggregator, returns blob data (JSON parsed if possible).
 * BlobId may be base64 (from Walrus) or hex (from DB backfill); we try the format Walrus expects.
 */
export async function walrusFetchHandler(req: Request, res: Response): Promise<void> {
  const blobIdParam = req.params.blobId;
  if (!blobIdParam?.trim()) {
    res.status(400).json({ error: "blobId is required" });
    return;
  }

  const blobId = blobIdForWalrus(blobIdParam);

  try {
    const getRes = await fetch(`${AGGREGATOR}/v1/blobs/${encodeURIComponent(blobId)}`);
    if (!getRes.ok) {
      res.status(getRes.status).json({ error: "Blob not found or fetch failed" });
      return;
    }
    const bytes = new Uint8Array(await getRes.arrayBuffer());
    // Detect image magic bytes and return as binary with correct Content-Type
    if (bytes.length >= 4) {
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
        res.setHeader("Content-Type", "image/png");
        res.send(Buffer.from(bytes));
        return;
      }
      if (bytes[0] === 0xff && bytes[1] === 0xd8) {
        res.setHeader("Content-Type", "image/jpeg");
        res.send(Buffer.from(bytes));
        return;
      }
      if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
        res.setHeader("Content-Type", "image/webp");
        res.send(Buffer.from(bytes));
        return;
      }
    }
    const text = new TextDecoder().decode(bytes);
    const trimmed = text.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        const json = JSON.parse(text);
        res.json(json);
        return;
      } catch {
        // fall through
      }
    }
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "Failed to fetch blob", details: message });
  }
}
