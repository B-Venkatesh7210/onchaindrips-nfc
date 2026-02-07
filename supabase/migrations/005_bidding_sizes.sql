-- Size-aware bidding for drops and reservations

-- Per-size inventory on drops.
ALTER TABLE drops
  ADD COLUMN IF NOT EXISTS size_s_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS size_m_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS size_l_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS size_xl_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS size_xxl_total integer NOT NULL DEFAULT 0;

-- Size preference on each reservation (one of S, M, L, XL, XXL).
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS size_preference text;

