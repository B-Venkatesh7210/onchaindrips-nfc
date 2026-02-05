# OnChainDrips API

Express + TypeScript API for Shirt lookup and sponsored `claim_and_transfer` transactions.

## Env

Copy `.env.example` to `.env` and set:

- **RPC_URL** — Sui RPC (default: testnet)
- **PACKAGE_ID** — Deployed Move package ID
- **SPONSOR_PRIVATE_KEY** — Bech32 or 64-char hex; used only on backend for gas
- **SUPABASE_URL** and **SUPABASE_SERVICE_ROLE_KEY** — Required for drops, shirts, claims, and **short NFC claim URLs** (tokens ≤14 chars). Run migration `003_claim_url_tokens.sql` so the `claim_url_tokens` table exists; then after each mint the API returns short tokens and the downloadable TXT uses URLs like `https://yoursite.com/{dropId}/{token}`.

## Allowlist

`data/allowlist.json` is a JSON array of Shirt object IDs that are allowed to be claimed via `/sponsor`. Example:

```json
["0xabc...", "0xdef..."]
```

Update the file and restart the server (or add a reload endpoint) to change the list.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| GET | /shirt/:objectId | Fetch Shirt from Sui; returns is_minted, serial, drop_id, minted_at_ms, walrus_blob_id, owner |
| POST | /sponsor | Body: `{ txBytesBase64, userSignatureBase64 }`. Validates claim_and_transfer + allowlist, attaches sponsor gas, signs; returns `{ sponsoredTxBytesBase64, sponsorSignatureBase64 }` |

## Rate limiting

100 requests per 15 minutes per IP (in-memory).

## Run

```bash
pnpm install
pnpm dev    # or pnpm build && pnpm start
```
