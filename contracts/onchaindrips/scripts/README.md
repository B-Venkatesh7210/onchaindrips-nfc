# OnChainDrips scripts

TypeScript scripts using `@mysten/sui` to publish the Move package and call `create_drop` / `mint_shirts` on Sui testnet.

## Setup

1. Copy `.env.example` to `.env` and fill in `PRIVATE_KEY` and `RPC_URL`.
2. Install dependencies: `pnpm install` (or `npm install`) in this folder.
3. Ensure **Sui CLI** is on PATH (required for `publish.ts`).  
   - **Windows:** Use [Chocolatey](https://chocolatey.org/) (`choco install sui`) **or** download [suiup from Releases](https://github.com/MystenLabs/suiup/releases) (e.g. `suiup-x86_64-pc-windows-msvc.zip`), unzip, add the folder to PATH, then run `suiup install sui@testnet`.  
   - **macOS/Linux:** `curl -sSfL https://raw.githubusercontent.com/MystenLabs/suiup/main/install.sh | sh` then `suiup install sui@testnet`.  
   - Verify: `sui --version`.

## Scripts

| Script | Command | Env vars |
|--------|--------|----------|
| **publish** | `pnpm run publish` | `PRIVATE_KEY`, `RPC_URL` |
| **create-drop** | `pnpm run create-drop` | + `PACKAGE_ID`, `ADMIN_CAP_OBJECT_ID`; optional: `DROP_NAME`, `DROP_TOTAL_SUPPLY`, `WALRUS_BLOB_ID` |
| **mint-shirts** | `pnpm run mint-shirts` | + `DROP_OBJECT_ID`; optional: `MINT_COUNT`, `WALRUS_BLOB_ID` |

After running **publish**, copy the printed `PACKAGE_ID` and `ADMIN_CAP_OBJECT_ID` into `.env`.  
After running **create-drop**, copy `DROP_OBJECT_ID` into `.env` for **mint-shirts**.

Output is formatted for easy copy into your backend DB as seed data (JSON and one-line JSON for shirts).
