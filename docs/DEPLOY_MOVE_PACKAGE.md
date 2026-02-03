# Deploy a New Move Package (After Contract Changes)

When you change the Move contract and deploy again, you are publishing a **new** package. That gives you a **new** `PACKAGE_ID` and a **new** `AdminCap` object. You must update env everywhere and re-create any drops/shirts (or point to the new IDs).

---

## Prerequisites

- **Sui CLI** installed and on your PATH (`sui move build` must work).
- **Wallet** with testnet SUI for gas (the key you use for `PRIVATE_KEY`).
- **Same key** for publish and for the API’s sponsor/admin (so the published package’s AdminCap is owned by the sponsor).

---

## Step 1: Publish the package

From the repo root:

```bash
cd contracts/onchaindrips/scripts
npm install
```

Set in `contracts/onchaindrips/scripts/.env`:

- `PRIVATE_KEY` — Bech32 or 64-char hex (the wallet that will own the new package and AdminCap).
- `RPC_URL` — Optional; defaults to testnet.

Then run:

```bash
npx tsx publish.ts
```

On success, the script prints something like:

```
--- Publish result ---
packageId: 0x...
adminCapObjectId: 0x...

--- Copy into .env (and backend seed) ---
PACKAGE_ID=0x...
ADMIN_CAP_OBJECT_ID=0x...
```

Copy those two values; you will use them in the next steps.

---

## Step 2: Env changes

### 2.1 Contract scripts (`contracts/onchaindrips/scripts/.env`)

Update (or set) after **every** new publish:

| Variable | What to set |
|----------|-------------|
| `PACKAGE_ID` | The new `packageId` from Step 1. |
| `ADMIN_CAP_OBJECT_ID` | The new `adminCapObjectId` from Step 1. |

If you create a new drop and mint shirts from the scripts, you will also set:

- `DROP_OBJECT_ID` — After running `createDrop.ts`.
- `WALRUS_BLOB_ID_IMAGE`, `WALRUS_BLOB_ID_METADATA` — For `mintShirts.ts`.
- `MINT_COUNT`, `DROP_NAME`, `COMPANY_NAME`, `EVENT_NAME`, `DROP_TOTAL_SUPPLY` — As needed.

### 2.2 API (`apps/api/.env`)

Update after **every** new publish:

| Variable | What to set |
|----------|-------------|
| `PACKAGE_ID` | Same new `packageId` from Step 1. |
| `ADMIN_CAP_OBJECT_ID` | Same new `adminCapObjectId` from Step 1. |

Optional but recommended for admin and DB:

- `ADMIN_ADDRESS` — Wallet address that can call admin routes (create drop, mint). Usually the same as the publisher/sponsor.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — If you use Supabase.
- `SPONSOR_PRIVATE_KEY` — Should be the same key that owns the AdminCap (so the API can create drops and mint).

### 2.3 Web app (`apps/web/.env.local`)

Update if the frontend uses the package ID:

| Variable | What to set |
|----------|-------------|
| `NEXT_PUBLIC_PACKAGE_ID` | Same new `packageId` from Step 1 (only if your web app reads it, e.g. for transaction building). |

If you don’t use `NEXT_PUBLIC_PACKAGE_ID` anywhere, you can leave it unset or unchanged.

---

## Step 3: After a new package (new IDs)

Because the package is new:

1. **Old objects** (old Drop, old Shirts) still exist onchain but belong to the **old** package. The API and app now point at the **new** package, so they won’t use those old types/objects.
2. **Create a new drop** — Either:
   - From the **admin UI**: Create a drop (and then mint shirts), or  
   - From scripts: run `createDrop.ts`, then set `DROP_OBJECT_ID` in `contracts/onchaindrips/scripts/.env`, then run `mintShirts.ts`.
3. **Supabase** — If you use the DB, the new drop and new shirts will be inserted when you create/mint via the API or when you run scripts and then sync (e.g. allowlist or shirts table). Any old drop/shirt rows that referred to the previous package are effectively legacy.
4. **Allowlist** — If you still use `allowlist.json`, replace or extend it with the new Shirt object IDs from the new mint.

---

## Checklist (quick reference)

- [ ] Sui CLI on PATH; wallet has testnet SUI.
- [ ] `contracts/onchaindrips/scripts/.env`: `PRIVATE_KEY`, `RPC_URL`.
- [ ] Run `npx tsx publish.ts` from `contracts/onchaindrips/scripts`.
- [ ] Copy `PACKAGE_ID` and `ADMIN_CAP_OBJECT_ID` from the script output.
- [ ] Update `contracts/onchaindrips/scripts/.env`: `PACKAGE_ID`, `ADMIN_CAP_OBJECT_ID`.
- [ ] Update `apps/api/.env`: `PACKAGE_ID`, `ADMIN_CAP_OBJECT_ID` (and `ADMIN_ADDRESS` if used).
- [ ] Update `apps/web/.env.local`: `NEXT_PUBLIC_PACKAGE_ID` (if used).
- [ ] Create a new drop (admin UI or `createDrop.ts`); if using scripts, set `DROP_OBJECT_ID`.
- [ ] Mint shirts (admin UI or `mintShirts.ts`); if using allowlist/DB, add the new shirt IDs.
- [ ] Restart API (and web if env changed) so they pick up the new env.
