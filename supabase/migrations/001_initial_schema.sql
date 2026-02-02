-- OnChainDrips initial schema: drops, shirts, users, claims, sync_state
-- Run this in Supabase SQL Editor or via: supabase db push

-- ============ DROPS ============
CREATE TABLE drops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id text NOT NULL UNIQUE,
  name text NOT NULL,
  company_name text NOT NULL,
  event_name text NOT NULL,
  total_supply bigint NOT NULL CHECK (total_supply >= 0),
  next_serial bigint NOT NULL DEFAULT 0,
  minted_count bigint NOT NULL DEFAULT 0,
  created_at_ms bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  offchain_attributes jsonb NOT NULL DEFAULT '{}'
);

-- (unique index on object_id created by UNIQUE constraint)
CREATE INDEX idx_drops_created_at ON drops (created_at DESC);
CREATE INDEX idx_drops_company_name ON drops (company_name);

-- ============ SHIRTS ============
CREATE TABLE shirts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id text NOT NULL UNIQUE,
  drop_object_id text NOT NULL,
  serial bigint NOT NULL,
  is_minted boolean NOT NULL DEFAULT false,
  minted_at_ms bigint,
  walrus_blob_id_image text,
  walrus_blob_id_metadata text,
  current_owner_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  offchain_attributes jsonb NOT NULL DEFAULT '{}'
);

-- (unique index on object_id created by UNIQUE constraint)
CREATE INDEX idx_shirts_drop_object_id ON shirts (drop_object_id);
CREATE INDEX idx_shirts_is_minted ON shirts (is_minted);
CREATE INDEX idx_shirts_current_owner_address ON shirts (current_owner_address);

-- ============ USERS ============
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL UNIQUE,
  auth_provider text,
  auth_sub text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  offchain_attributes jsonb NOT NULL DEFAULT '{}'
);

-- (unique index on address created by UNIQUE constraint)
CREATE INDEX idx_users_auth ON users (auth_provider, auth_sub);

-- ============ CLAIMS ============
CREATE TABLE claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shirt_object_id text NOT NULL,
  drop_object_id text NOT NULL,
  recipient_address text NOT NULL,
  tx_digest text,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  offchain_attributes jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_claims_recipient_address ON claims (recipient_address);
CREATE INDEX idx_claims_shirt_object_id ON claims (shirt_object_id);
CREATE INDEX idx_claims_drop_object_id ON claims (drop_object_id);
CREATE INDEX idx_claims_claimed_at ON claims (claimed_at DESC);

-- ============ SYNC_STATE (optional, for future indexer) ============
CREATE TABLE sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_state_key ON sync_state (key);
