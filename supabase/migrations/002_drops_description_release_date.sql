-- Add description and release_date to drops (offchain; not on-chain).
-- Run in Supabase SQL Editor or via: supabase db push

ALTER TABLE drops ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE drops ADD COLUMN IF NOT EXISTS release_date date;

COMMENT ON COLUMN drops.description IS 'Offchain drop description (Supabase only).';
COMMENT ON COLUMN drops.release_date IS 'Planned release date (Supabase only).';
