# Carousel images and uploaded images

## SQL to run in Supabase

Run this in the **Supabase Dashboard → SQL Editor** so that drops can store the two carousel image URLs:

```sql
-- Add two columns to drops for carousel images (Supabase Storage URLs).
-- uploaded_image_1 = fallback when NFT (Walrus) fails; also carousel slide 1 fallback.
-- uploaded_image_2 = carousel slide 2 (always).
ALTER TABLE drops
  ADD COLUMN IF NOT EXISTS uploaded_image_1 text,
  ADD COLUMN IF NOT EXISTS uploaded_image_2 text;

COMMENT ON COLUMN drops.uploaded_image_1 IS 'Supabase Storage URL for 1st carousel image (fallback when NFT image fails)';
COMMENT ON COLUMN drops.uploaded_image_2 IS 'Supabase Storage URL for 2nd carousel image';
```

If you already ran migration 006 with the old names (`uploaded_image_blob_id_1`, `uploaded_image_blob_id_2`), run this to rename:

```sql
ALTER TABLE drops RENAME COLUMN uploaded_image_blob_id_1 TO uploaded_image_1;
ALTER TABLE drops RENAME COLUMN uploaded_image_blob_id_2 TO uploaded_image_2;
```

## Create the Storage bucket

In **Supabase Dashboard → Storage**:

1. Click **New bucket**.
2. Name: `carousel`.
3. Enable **Public bucket** (so carousel images are publicly readable).
4. Create.

## Behavior

- **Create drop / Mint shirts:** GIF URL is removed. You upload two images (carousel 1 and 2) to **Supabase Storage** via the admin API. The API returns public URLs and stores them in `drops.uploaded_image_1` and `drops.uploaded_image_2` (and in each shirt’s `offchain_attributes.imageUrls`).
- **Carousel proxy:** Slide 1 tries the **NFT image** (Walrus) first. If it fails to load (error/404), it falls back to **carousel image 1** (Supabase Storage). Slide 2 is always **carousel image 2** (Supabase Storage).
- **Where carousel is used:** Home (drop cards), drop detail page, and shirt (mint) page.
