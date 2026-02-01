# OnChainDrips Web

Next.js (App Router) + TypeScript + Tailwind. Shirt view, mint flow (sponsored), and auth stub.

## Env

Copy `.env.example` to `.env.local` and set:

- **NEXT_PUBLIC_API_URL** — Backend API (default `http://localhost:4000`)
- **NEXT_PUBLIC_SUI_RPC_URL** — Sui RPC (default testnet)
- **NEXT_PUBLIC_PACKAGE_ID** — Deployed Move package ID

## Routes

| Path | Description |
|------|-------------|
| `/` | Home; link to My Shirts |
| `/s/[objectId]` | Shirt page: fetch from API; if unminted show Login + Mint; if minted show NFT view |
| `/me` | My Shirts: list owned Shirt objects (Sui RPC by owner address) |

## Auth (stub)

- "Login with Google (zkLogin)" sets a mock keypair (address in `localStorage`, secret in `sessionStorage`).
- Replace with real zkLogin later; keep using `getStoredAddress()` / `getStoredSigner()` (or a real signer interface).

## Mint flow

1. Build `claim_and_transfer` tx (kind only).
2. Sign kind bytes; send kind + user signature to `POST /sponsor`.
3. Receive sponsored tx bytes + sponsor signature.
4. Sign full tx; execute with `[userSig, sponsorSig]`.

## Run

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. Ensure the API is running and `NEXT_PUBLIC_PACKAGE_ID` is set.
