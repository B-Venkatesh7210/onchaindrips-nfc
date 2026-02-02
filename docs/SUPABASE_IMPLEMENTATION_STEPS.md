# Supabase Implementation Steps — Explained

This doc walks through each step of the checklist so you don’t miss anything. **You** = things you do in Supabase dashboard or env; **Code** = what we implement in the repo.

---

## Step 1: Create Supabase project and get keys

**What it means:** Create a real Supabase project and copy the credentials the API will use.

**What you do:**

1. Go to [supabase.com](https://supabase.com) and sign in.
2. **New project** → pick org, name (e.g. `onchaindrips`), database password (save it), region.
3. Wait for the project to be ready.
4. In the project: **Settings** → **API**.
5. Copy and save:
   - **Project URL** (e.g. `https://xxxxx.supabase.co`) → this is `SUPABASE_URL`.
   - **anon public** key → optional for now (for client-side Supabase later).
   - **service_role** key (under “Project API keys”) → this is `SUPABASE_SERVICE_ROLE_KEY`.  
     ⚠️ **Never** expose the service_role key in the frontend; use it only in the API (backend).

**Why:** The API will talk to Supabase with the URL + service_role key to read/write drops, shirts, users, and claims.

**Done when:** You have `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` saved somewhere safe.

---

## Step 2: Add SQL migrations (tables + indexes)

**What it means:** Create the database tables and indexes from the schema (drops, shirts, users, claims, optionally sync_state).

**What you do (option A — Supabase Dashboard):**

1. In the project: **SQL Editor** → **New query**.
2. Paste the full DDL (the `CREATE TABLE` and `CREATE INDEX` statements from the schema doc or from the migration file we add to the repo).
3. Run the query. Confirm no errors and that the **Table Editor** shows the new tables.

**What we do (option B — repo migrations):**

1. Add a `supabase/` folder (or `apps/api/supabase/`) with migration files, e.g. `001_initial_schema.sql`.
2. The file contains the same DDL. You can then run it via Supabase CLI (`supabase db push`) or copy-paste into the SQL Editor.

**Tables you must have:**

- `drops` — one row per Drop (object_id, name, company_name, event_name, total_supply, next_serial, minted_count, created_at_ms, offchain_attributes, etc.).
- `shirts` — one row per Shirt (object_id, drop_object_id, serial, is_minted, walrus blob IDs, current_owner_address, offchain_attributes, etc.).
- `users` — one row per wallet address (address, optional auth_provider, auth_sub, offchain_attributes).
- `claims` — one row per claim (shirt_object_id, drop_object_id, recipient_address, tx_digest, claimed_at).
- (Optional) `sync_state` — for a future indexer.

**Done when:** In Supabase **Table Editor**, you see `drops`, `shirts`, `users`, `claims` (and optionally `sync_state`), and indexes are created.

---

## Step 3: Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to API env

**What it means:** The API server needs to know which Supabase project to use and which key to use (service_role for full access).

**What you do:**

1. Open `apps/api/.env` (create if it doesn’t exist).
2. Add two lines (use your real values from Step 1):

   ```env
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....
   ```

3. Add the same variable **names** to `apps/api/.env.example` with placeholder values (no real key), so other devs know what to set:

   ```env
   SUPABASE_URL=
   SUPABASE_SERVICE_ROLE_KEY=
   ```

4. Restart the API server so it picks up the new env.

**Done when:** The API can start without errors and, once we add the client code, it can connect to Supabase (e.g. list tables or insert a test row).

---

## Step 4: Implement DB writes for drops and shirts; replace allowlist check

**What it means:**

- **Drops:** Whenever a drop is created (onchain), we also insert (or update) a row in `drops` so the DB stays in sync.
- **Shirts:** Whenever shirts are minted (onchain), we insert rows in `shirts` for each shirt. The **allowlist** is no longer a JSON file; a shirt is “claimable” if there is a row in `shirts` with `is_minted = false`.

**Concretely:**

1. **Insert/update Drop when a drop is created**
   - When: After you (or a script) call the contract’s `create_drop` and get the new Drop object ID.
   - Action: API or script calls an internal “sync drop” function (or POST endpoint) with: object_id, name, company_name, event_name, total_supply, next_serial (0), minted_count (0), created_at_ms.
   - Code: Insert into `drops` (or upsert on `object_id`). So “when creating or syncing a drop” = whenever we learn about a new/updated drop (creation script or future indexer).

2. **Insert Shirts when minting**
   - When: After `mint_shirts` is called and we know the created Shirt object IDs (e.g. from the script that mints, or from parsing the tx result).
   - Action: For each new shirt, insert into `shirts`: object_id, drop_object_id, serial, is_minted = false, walrus_blob_id_image, walrus_blob_id_metadata (and leave current_owner_address null until claimed).
   - This can be: (a) script that mints then calls an API “register shirts” endpoint with the new object IDs, or (b) an API endpoint that the mint script calls with the list of shirt object IDs + drop_object_id + serials + blob IDs.

3. **Replace allowlist check**
   - Before: Claim allowed only if `shirtObjectId` was in `allowlist.json`.
   - After: Claim allowed only if there is a row in `shirts` with that `object_id` **and** `is_minted = false` (and optionally allow_claim in offchain_attributes).
   - Code: In the claim handler, replace `isAllowedShirt(shirtId)` with a DB query: e.g. `SELECT 1 FROM shirts WHERE object_id = $1 AND is_minted = false`. If no row, return 400 “Shirt not claimable”.

**Done when:** Creating a drop and minting shirts also creates/updates rows in Supabase; the claim endpoint uses the `shirts` table instead of allowlist.json to decide if a shirt can be claimed.

---

## Step 5: On successful claim_and_transfer — update shirts, insert claim, optionally upsert user

**What it means:** Right after the Sui transaction `claim_and_transfer` succeeds, we update our DB so it reflects chain state and we have a record for the dashboard.

**Concretely:**

1. **Update `shirts`**
   - Set `is_minted = true`, `minted_at_ms = <from chain or now>`, `current_owner_address = recipientAddress`, `updated_at = now()` for the row where `object_id = shirtObjectId`.

2. **Insert into `claims`**
   - One new row: shirt_object_id, drop_object_id (from the shirt row or from the tx), recipient_address, tx_digest (from the execution result), claimed_at = now(). Optionally offchain_attributes (e.g. device).

3. **Optionally upsert `users`**
   - If you have a `users` table: insert a row for `recipient_address` if it doesn’t exist, or update `updated_at` (and optionally auth_provider/auth_sub if you pass them from the client). This lets the dashboard show “user X has these claims” and later extend to profile/preferences.

**Where in code:** In the same place you currently return `{ digest }` after a successful `claim_and_transfer` (in the claim handler). After `result.effects?.status?.status === 'success'`, run the three DB operations (update shirts, insert claims, optional users upsert), then return the digest.

**Done when:** After a successful claim, the shirt row is updated, a claim row is inserted, and (if implemented) the user row exists; the dashboard can show “my shirts” from `claims`.

---

## Step 6: Add API routes — GET /drops, GET /drops/:objectId, GET /users/:address/claims

**What it means:** Expose Supabase data through your API so the frontend (or scripts) can list drops, get one drop, and get a user’s claimed shirts (dashboard).

**Concretely:**

1. **GET /drops**
   - Returns a list of drops (e.g. from `drops` table, ordered by created_at or created_at_ms). Optional query params: limit, offset, company_name. Response: array of drop objects (object_id, name, company_name, event_name, total_supply, minted_count, etc.).

2. **GET /drops/:objectId**
   - Returns a single drop by Sui Drop object_id. 404 if not found. Response: one drop object (same shape as above, plus offchain_attributes if you use them).

3. **GET /users/:address/claims** (dashboard)
   - Returns all claims for that wallet address (recipient_address). Query: `SELECT * FROM claims WHERE recipient_address = $address ORDER BY claimed_at DESC`. Optionally join to `shirts` (and `drops`) to include shirt/drop details (object_id, serial, drop name, etc.). Response: array of claim objects (shirt_object_id, drop_object_id, tx_digest, claimed_at, and optionally nested shirt/drop info).

**Done when:** The API server has these three routes registered and returns the expected JSON; the frontend (or you via curl/Postman) can list drops, get one drop, and get “my shirts” by address.

---

## Step 7 (Optional): Migrate existing allowlist.json into shirts

**What it means:** You already have shirts listed in `allowlist.json` (object IDs and serials). Instead of re-minting or re-running scripts, we can backfill the `shirts` table so those existing shirts are “known” and claimable via the new logic.

**Concretely:**

1. Read `apps/api/data/allowlist.json` (array of `{ objectId, serial }` or similar).
2. For each entry you need at least: shirt `object_id`, and the `drop_object_id` that these shirts belong to (one drop). Serial you have; is_minted you can set to false for all if they haven’t been claimed yet, or set to true and set current_owner from chain if you already know they were claimed.
3. Insert into `shirts`: object_id, drop_object_id (same for all from that allowlist), serial, is_minted (false unless you know otherwise), walrus_blob_id_image/metadata if you have them (or null). You can run this as a one-off script (e.g. `node scripts/migrate-allowlist-to-db.js`) or a one-off API call with the file path or pasted JSON.

**Done when:** Every shirt that was in allowlist.json has a row in `shirts` with the correct drop_object_id and serial; claims for those shirts are allowed via the new “shirt in DB and is_minted = false” check.

---

## Order to do them

| Order | Step | Who |
|-------|------|-----|
| 1 | Create Supabase project, get URL + service_role key | You |
| 2 | Run SQL migrations (create tables + indexes) | You (or run our migration file) |
| 3 | Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to apps/api/.env | You |
| 4 | Implement drop/shirt writes and replace allowlist check in API | Code |
| 5 | After claim success: update shirts, insert claims, upsert users | Code |
| 6 | Add GET /drops, GET /drops/:objectId, GET /users/:address/claims | Code |
| 7 | (Optional) Migrate allowlist.json into shirts | You + small script/code |

Steps 1–3 are setup (you + env). Steps 4–6 are implementation (code we write). Step 7 is optional backfill so existing shirts work with the new DB.

Once you’ve done 1–3, you can say “go” and we implement 4–6 (and optionally 7).
