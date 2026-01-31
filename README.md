# OnChainDrips

Monorepo for OnChainDrips: Sui Move contracts, Node/Express API, and Next.js web app.

## Directory structure

```
onchaindrips-nfc/
├── apps/
│   ├── api/                 # Node/Express backend
│   │   └── src/
│   │       └── index.js
│   └── web/                 # Next.js app (App Router)
│       ├── app/
│       │   ├── layout.tsx
│       │   └── page.tsx
│       ├── next.config.ts
│       └── tsconfig.json
├── contracts/
│   └── onchaindrips/        # Sui Move package
│       ├── Move.toml
│       └── sources/
│           └── onchaindrips.move
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

## Prerequisites

- **Node.js** 20+
- **pnpm** 9+
- **Sui CLI** (for building and publishing Move contracts)

## Setup

### 1. Install pnpm

```bash
npm install -g pnpm
```

Verify:

```bash
pnpm --version
```

### 2. Install Sui CLI

Recommended: use **suiup** (Sui toolchain installer).

**macOS / Linux:**

```bash
curl -sSfL https://raw.githubusercontent.com/MystenLabs/suiup/main/install.sh | sh
suiup install sui@testnet
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/MystenLabs/suiup/main/install.ps1 | iex
suiup install sui@testnet
```

**Other options:** Homebrew (`brew install sui`), Chocolatey (`choco install sui`), or from source with Cargo.

Verify:

```bash
sui --version
```

### 3. Install dependencies

From the repo root:

```bash
pnpm install
```

This installs dependencies for `apps/api` and `apps/web` via pnpm workspaces.

## Running the apps

### API (Node/Express)

```bash
pnpm dev:api
```

Or from `apps/api`:

```bash
pnpm --filter api dev
```

Server runs at `http://localhost:4000`. Health check: `GET http://localhost:4000/health`.

### Web (Next.js)

```bash
pnpm dev:web
```

Or from `apps/web`:

```bash
pnpm --filter web dev
```

App runs at `http://localhost:3000`.

### Sui Move contracts

Build from repo root:

```bash
pnpm build:contracts
```

Or from the package directory:

```bash
cd contracts/onchaindrips
sui move build
```

Run tests:

```bash
cd contracts/onchaindrips
sui move test
```

Publish (after configuring an environment and client):

```bash
cd contracts/onchaindrips
sui client publish --gas-budget 100000000
```

## Root scripts

| Script           | Description                          |
|------------------|--------------------------------------|
| `pnpm dev:api`   | Start API in watch mode              |
| `pnpm dev:web`   | Start Next.js dev server             |
| `pnpm build:contracts` | Build Sui Move package in `contracts/onchaindrips` |
| `pnpm build`     | Run `build` in all workspace packages |

## Workspaces

pnpm workspaces are defined in `pnpm-workspace.yaml` and include `apps/*` only. The Sui Move package under `contracts/onchaindrips` is not a Node package; use `sui move` commands in that directory.
