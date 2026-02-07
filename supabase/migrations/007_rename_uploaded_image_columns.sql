-- Rename carousel image columns (no longer blob IDs, now Supabase Storage URLs).
-- Only runs if old column names exist (e.g. after migration 006 with old names).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'drops' AND column_name = 'uploaded_image_blob_id_1') THEN
    ALTER TABLE drops RENAME COLUMN uploaded_image_blob_id_1 TO uploaded_image_1;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'drops' AND column_name = 'uploaded_image_blob_id_2') THEN
    ALTER TABLE drops RENAME COLUMN uploaded_image_blob_id_2 TO uploaded_image_2;
  END IF;
END $$;
