# Short NFC claim URLs (≤14 chars) — what to configure

NFC claim URLs use a **short token** (14 characters) instead of the long shirt object ID, so they fit on low-byte NFC tags. The token is stored in Supabase and resolved by the API.

---

## 1. Supabase

You must have Supabase configured for the API (drops, shirts, claims already use it):

- **SUPABASE_URL** — your project URL (e.g. `https://xxxxx.supabase.co`)
- **SUPABASE_SERVICE_ROLE_KEY** — service_role key from Project Settings → API

Set these in the **API** `.env` (e.g. `apps/api/.env`).

---

## 2. Run the new migration (create `claim_url_tokens` table)

Create the table that stores short tokens:

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste the contents of **`supabase/migrations/003_claim_url_tokens.sql`**.
3. Run the query. You should see the table `claim_url_tokens` in the Table Editor.

If you use Supabase CLI: from the repo root, run `supabase db push` (or apply the migration the way you normally do).

---

## 3. No extra env for short tokens

Short tokens do **not** use `CLAIM_URL_SECRET`. They are random 14-character keys; the API looks them up in the `claim_url_tokens` table. So you only need:

- Supabase URL + service role key (step 1)
- Migration 003 applied (step 2)

---

## 4. Flow

- **Mint (admin):** When you mint shirts, the API inserts one row per shirt into `claim_url_tokens` (token, drop_object_id, shirt_object_id) and returns `claimTokens` in the response. The admin “Download NFC URLs” file then contains short URLs like `https://yoursite.com/0xDropId/Ab3xY9kL2mNqR1`.
- **Resolve:** When a user opens `/{dropId}/{token}`, the frontend calls `GET /drops/:dropId/resolve?token=...`. The API looks up the token in `claim_url_tokens`, checks it belongs to that drop, and returns `shirtObjectId`. The page then loads the shirt and shows the mint/claim UI.

---

## 5. Checklist

- [ ] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in API `.env`
- [ ] Migration `003_claim_url_tokens.sql` applied in your Supabase project
- [ ] Restart the API after changing env
- [ ] Create a new drop and mint shirts; download the NFC URLs file — each URL should have a 14-character token after the drop ID
