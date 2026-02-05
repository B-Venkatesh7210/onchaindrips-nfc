-- Short tokens for NFC claim URLs (≤14 chars). Token is the lookup key; no encryption.
-- Used when resolving /{dropId}/{token} to shirt_object_id.

CREATE TABLE claim_url_tokens (
  token text PRIMARY KEY,
  drop_object_id text NOT NULL,
  shirt_object_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_claim_url_tokens_drop ON claim_url_tokens (drop_object_id);
CREATE INDEX idx_claim_url_tokens_shirt ON claim_url_tokens (shirt_object_id);

COMMENT ON TABLE claim_url_tokens IS 'Short tokens (≤14 chars) for NFC URLs; resolve token to shirt_object_id';
