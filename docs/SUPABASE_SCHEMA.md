# Supabase Database Schema Proposal

This document proposes a robust Supabase schema for OnChainDrips: **drops**, **minted shirts**, **users**, and **user dashboard**, with room for **offchain attributes** so you can add new fields without changing the contract.

---

## Design principles

1. **Onchain IDs as source of truth** — Use Sui object IDs (`object_id`) for Drops and Shirts so we can reconcile with chain and avoid duplicates.
2. **Mirror contract fields** — Store the same fields the contract has so we can serve reads from DB and optionally sync from chain.
3. **Offchain attributes (JSONB)** — Each main entity has an `offchain_attributes` JSONB column. Any future “would have been onchain” field can live here (e.g. `campaign_id`, `tier`, `metadata_url`) without redeploying the contract.
4. **Allowlist → Shirts table** — Replace `allowlist.json` with rows in `shirts`. A shirt is “claimable” if it exists in DB and `is_minted = false` (and optionally `allow_claim = true` in offchain).
5. **Dashboard** — Users identified by wallet address; “my shirts” and “my claims” via `claims` and optional `users` table.

---

## Tables

### 1. `drops`

Stores each Drop (collection). Mirrors onchain Drop; add/change fields in `offchain_attributes` as needed.

| Column              | Type         | Constraints / Notes                                      |
|---------------------|--------------|----------------------------------------------------------|
| `id`                | `uuid`       | PRIMARY KEY DEFAULT gen_random_uuid()                    |
| `object_id`         | `text`       | UNIQUE NOT NULL — Sui Drop object ID                     |
| `name`              | `text`       | NOT NULL — from contract                                |
| `company_name`      | `text`       | NOT NULL                                                 |
| `event_name`        | `text`       | NOT NULL                                                 |
| `total_supply`      | `bigint`     | NOT NULL CHECK (total_supply >= 0)                      |
| `next_serial`       | `bigint`     | NOT NULL DEFAULT 0                                      |
| `minted_count`      | `bigint`     | NOT NULL DEFAULT 0                                      |
| `created_at_ms`     | `bigint`     | from contract (timestamp_ms)                             |
| `created_at`        | `timestamptz`| DEFAULT now() — when we first saw it                     |
| `updated_at`        | `timestamptz`| DEFAULT now()                                            |
| `offchain_attributes` | `jsonb`    | DEFAULT '{}' — future fields (e.g. image_url, campaign_id) |

**Indexes:** `UNIQUE ON object_id`, optional `idx_drops_created_at`, `idx_drops_company_name`.

---

### 2. `shirts`

Stores each Shirt NFT. Replaces allowlist: “in DB + not minted” = claimable (optionally gated by offchain flag).

| Column                 | Type          | Constraints / Notes                                      |
|------------------------|---------------|----------------------------------------------------------|
| `id`                   | `uuid`        | PRIMARY KEY DEFAULT gen_random_uuid()                    |
| `object_id`            | `text`        | UNIQUE NOT NULL — Sui Shirt object ID                    |
| `drop_object_id`       | `text`        | NOT NULL — references Drop onchain (drops.object_id)    |
| `serial`               | `bigint`      | NOT NULL                                                 |
| `is_minted`            | `boolean`     | NOT NULL DEFAULT false                                  |
| `minted_at_ms`         | `bigint`      | NULL until claimed                                      |
| `walrus_blob_id_image` | `text`        | NULL — hex or string form of blob ID                    |
| `walrus_blob_id_metadata` | `text`     | NULL                                                     |
| `current_owner_address`| `text`       | NULL — cached from chain after claim                    |
| `created_at`           | `timestamptz` | DEFAULT now()                                            |
| `updated_at`           | `timestamptz` | DEFAULT now()                                            |
| `offchain_attributes`  | `jsonb`      | DEFAULT '{}' — e.g. allow_claim, tier, display_name      |

**Indexes:** `UNIQUE ON object_id`, `idx_shirts_drop_object_id`, `idx_shirts_is_minted`, `idx_shirts_current_owner_address`.

**Allowlist replacement:**  
- **Before:** allowlist = list of Shirt object IDs allowed to claim.  
- **After:** “Claimable” = shirt row exists, `is_minted = false`, and optionally `(offchain_attributes->>'allow_claim')::boolean IS NOT FALSE`.

---

### 3. `users`

Optional but recommended for dashboard and future auth. One row per wallet address (zkLogin or regular).

| Column                 | Type          | Constraints / Notes                                      |
|------------------------|---------------|----------------------------------------------------------|
| `id`                   | `uuid`        | PRIMARY KEY DEFAULT gen_random_uuid()                    |
| `address`              | `text`        | UNIQUE NOT NULL — Sui wallet address (normalized)       |
| `auth_provider`        | `text`        | NULL — e.g. 'google' for zkLogin                        |
| `auth_sub`             | `text`        | NULL — OAuth subject (for zkLogin)                      |
| `created_at`           | `timestamptz` | DEFAULT now()                                            |
| `updated_at`           | `timestamptz` | DEFAULT now()                                            |
| `offchain_attributes`  | `jsonb`      | DEFAULT '{}' — profile, preferences, etc.               |

**Indexes:** `UNIQUE ON address`, optional composite `(auth_provider, auth_sub)` for zkLogin lookups.

---

### 4. `claims`

One row per shirt claim (mint-to-user). Powers “user dashboard” (my shirts) and analytics.

| Column              | Type          | Constraints / Notes                                      |
|---------------------|---------------|----------------------------------------------------------|
| `id`                | `uuid`        | PRIMARY KEY DEFAULT gen_random_uuid()                    |
| `shirt_object_id`   | `text`        | NOT NULL — shirts.object_id                             |
| `drop_object_id`    | `text`        | NOT NULL — drops.object_id                              |
| `recipient_address` | `text`        | NOT NULL — who received the shirt                       |
| `tx_digest`         | `text`        | NULL — Sui transaction digest                            |
| `claimed_at`        | `timestamptz` | DEFAULT now()                                            |
| `offchain_attributes` | `jsonb`     | DEFAULT '{}' — e.g. referral, device                    |

**Indexes:** `idx_claims_recipient_address`, `idx_claims_shirt_object_id`, `idx_claims_drop_object_id`, `idx_claims_claimed_at`.

**Dashboard:** “My shirts” = `SELECT * FROM claims WHERE recipient_address = $address ORDER BY claimed_at DESC`.

---

### 5. `sync_state` (optional)

For a future indexer / backfill: track last processed event or version so you can resume.

| Column       | Type          | Notes                    |
|--------------|---------------|--------------------------|
| `id`         | `uuid`        | PRIMARY KEY              |
| `key`        | `text`        | UNIQUE — e.g. 'sui_checkpoint' |
| `value`      | `text`/`jsonb`| last checkpoint / cursor |
| `updated_at` | `timestamptz` | DEFAULT now()            |

---

## Relationships

- **drops** — standalone; referenced by `shirts.drop_object_id` and `claims.drop_object_id`.
- **shirts** — belongs to a drop by `drop_object_id`; one row per claim in `claims` (one-to-one after claim).
- **users** — optional; `claims.recipient_address` can be joined to `users.address`.
- **claims** — links shirt, drop, and recipient; created when `claim_and_transfer` succeeds.

No strict FK from `shirts.drop_object_id` to `drops.object_id` if you want to tolerate drops created only onchain before sync; add FK when you’re ready.

---

## Offchain attributes strategy

- **Drops:** e.g. `image_url`, `campaign_id`, `starts_at`/`ends_at`, `max_claims_per_user`.
- **Shirts:** e.g. `allow_claim` (boolean), `tier`, `display_name`, `metadata_override`.
- **Users:** e.g. `display_name`, `email`, `notifications_enabled`.
- **Claims:** e.g. `referral_code`, `device_id`.

Use JSONB so you can add keys without migrations. Optionally add generated columns or views later for frequently queried keys (e.g. `shirts.allow_claim` from `offchain_attributes->>'allow_claim'`).

---

## Row Level Security (RLS)

- **Service role (API):** Use Supabase service role key in the API so the backend can read/write all tables (no RLS bypass needed if you only access DB from API).
- **Optional anon/authenticated:** If you later expose Supabase from the client (e.g. “my claims” via Supabase client), enable RLS and policies such as:
  - `users`: user can read/update only row where `address = auth.jwt() ->> 'address'` (if you put address in JWT).
  - `claims`: user can read only rows where `recipient_address = auth.jwt() ->> 'address'`.
  - `drops` / `shirts`: read-only for authenticated or anon as needed.

Start with API-only access and add RLS when you introduce client-side Supabase.

---

## Migration order

1. Create `drops`.
2. Create `shirts`.
3. Create `users`.
4. Create `claims`.
5. (Optional) Create `sync_state`.
6. Add indexes and, if desired, FKs.

---

## Implementation checklist (after your go-ahead)

- [ ] Create Supabase project and get URL + anon + service_role keys.
- [ ] Add SQL migrations (or run the DDL above) for tables + indexes.
- [ ] Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to API env.
- [ ] Implement: insert/update Drop when creating or syncing a drop; insert Shirts when minting (or via script callback); replace allowlist check with “shirt exists in DB and is_minted = false”.
- [ ] On successful `claim_and_transfer`: update `shirts` (is_minted, minted_at_ms, current_owner_address), insert `claims`, optionally upsert `users`.
- [ ] Add API routes: e.g. GET /drops, GET /drops/:objectId, GET /users/:address/claims (dashboard).
- [ ] (Optional) Migrate existing allowlist.json into `shirts` (object_id + drop_object_id + serial from chain or script).

Once you’re happy with this structure, say **go** and we can implement it (migrations + API changes + allowlist replacement).
