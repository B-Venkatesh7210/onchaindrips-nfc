/**
 * Upload carousel images to Supabase Storage. Returns public URL.
 * Admin-only (requires X-Admin-Address).
 */

import type { Request, Response } from "express";
import { getSupabase } from "../supabase.js";

const BUCKET = "carousel";

export async function uploadCarouselImageHandler(req: Request, res: Response): Promise<void> {
  const file = (req as { file?: Express.Multer.File }).file;
  if (!file?.buffer) {
    res.status(400).json({ error: "No image file" });
    return;
  }

  const supabase = getSupabase();
  if (!supabase) {
    res.status(503).json({ error: "Supabase not configured" });
    return;
  }

  const ext = (file.originalname?.match(/\.(jpg|jpeg|png|gif|webp)$/i)?.[1] ?? "png").toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file.buffer, {
        contentType: file.mimetype || `image/${ext}`,
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      if (error.message?.includes("Bucket not found") || error.message?.includes("does not exist")) {
        res.status(503).json({
          error: `Supabase Storage bucket "${BUCKET}" not found. Create it in Supabase Dashboard → Storage with public read access.`,
        });
        return;
      }
      console.error("[upload] Supabase Storage error:", error);
      res.status(500).json({ error: error.message || "Upload failed" });
      return;
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
    res.json({ url: urlData.publicUrl });
  } catch (err) {
    console.error("[upload] Error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Upload failed",
    });
  }
}
