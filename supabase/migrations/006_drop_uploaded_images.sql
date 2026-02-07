-- Add two columns to drops for carousel images (Supabase Storage URLs).
-- Slide 1 = NFT image (image_blob_id from first shirt) or fallback to uploaded_image_1.
-- Slide 2 = uploaded_image_2.
-- We no longer use gifUrl; it was stored in shirts.offchain_attributes (jsonb), so no column to drop.

ALTER TABLE drops
  ADD COLUMN IF NOT EXISTS uploaded_image_1 text,
  ADD COLUMN IF NOT EXISTS uploaded_image_2 text;

COMMENT ON COLUMN drops.uploaded_image_1 IS 'Supabase Storage URL for 1st carousel image (fallback when NFT image fails)';
COMMENT ON COLUMN drops.uploaded_image_2 IS 'Supabase Storage URL for 2nd carousel image';
