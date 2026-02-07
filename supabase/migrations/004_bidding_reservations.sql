-- Bidding / reservations for drops

-- Extend drops with optional bidding / reservation config.
ALTER TABLE drops
  ADD COLUMN IF NOT EXISTS reservation_slots integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bidding_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS reservation_evm_recipient text,
  ADD COLUMN IF NOT EXISTS bidding_closed boolean NOT NULL DEFAULT false;

-- Per-drop bid/reservation records.
CREATE TABLE IF NOT EXISTS reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_object_id text NOT NULL REFERENCES drops(object_id) ON DELETE CASCADE,
  evm_address text NOT NULL,
  bid_amount_usd numeric(18,6) NOT NULL,
  rank integer,
  status text NOT NULL DEFAULT 'pending', -- 'pending' | 'won' | 'lost'
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_reservations_drop_object_id
  ON reservations (drop_object_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_drop_object_id_address
  ON reservations (drop_object_id, evm_address);

