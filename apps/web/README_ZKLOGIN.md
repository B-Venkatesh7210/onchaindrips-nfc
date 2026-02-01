# zkLogin Implementation

This directory contains a complete zkLogin implementation for Sui blockchain authentication using Google OAuth.

## What is zkLogin?

zkLogin enables users to authenticate with their Google account and derive a deterministic Sui wallet address. The key benefits:

- **No seed phrases**: Users log in with Google instead of managing private keys
- **Privacy-preserving**: Zero-knowledge proofs ensure Google never sees blockchain transactions
- **Deterministic addresses**: Same Google account = same Sui address every time
- **Familiar UX**: Standard OAuth flow that users already understand

## Architecture

### Core Modules

1. **`lib/zklogin-config.ts`**
   - Configuration constants for OAuth and zkLogin services
   - Environment variable validation
   - Storage key definitions

2. **`lib/zklogin-utils.ts`**
   - Ephemeral keypair generation
   - Nonce generation for OAuth
   - JWT parsing and validation
   - Session storage management
   - Salt retrieval (development + production modes)

3. **`lib/zklogin-proof.ts`**
   - ZK proof generation via Mysten's prover service
   - Handles extended ephemeral public key derivation
   - Proof request payload construction

4. **`lib/zklogin-signer.ts`**
   - zkLogin signature generation
   - Transaction signing with ephemeral key + ZK proof
   - Address derivation from JWT + salt
   - Signer interface compatible with Sui SDK

5. **`lib/auth.ts`**
   - Main authentication module
   - Orchestrates the complete zkLogin flow
   - Session management (login, logout, check status)
   - User info extraction from JWT

6. **`app/auth/callback/page.tsx`**
   - OAuth callback handler
   - Completes zkLogin flow after Google redirect
   - Shows proof generation progress
   - Handles errors gracefully

## Authentication Flow

### 1. Login Initiation

```typescript
import { loginWithGoogle } from "@/lib/auth";

// User clicks "Login with Google"
await loginWithGoogle(rpcUrl);
```

**What happens:**
- Generate ephemeral Ed25519 keypair (temporary, expires after ~10 epochs)
- Get current Sui epoch from RPC
- Calculate max epoch (current + 10)
- Generate nonce: `hash(ephemeralPublicKey + maxEpoch + randomness)`
- Store ephemeral key + randomness in sessionStorage
- Redirect to Google OAuth with nonce

### 2. Google OAuth

User is redirected to Google's OAuth page:
- Authenticates with Google account
- Grants permissions (openid, email, profile)
- Google generates JWT `id_token` with user's claims
- Redirects back to `/auth/callback#id_token=...`

### 3. Callback Processing

```typescript
import { completeZkLogin } from "@/lib/auth";

// Extract JWT from URL fragment
const jwt = getJwtFromUrl();

// Complete zkLogin (generates proof)
const userAddress = await completeZkLogin(jwt);
```

**What happens:**
- Extract JWT from URL fragment
- Parse JWT to get user's `sub` claim (Google user ID)
- Get user salt (deterministic based on `sub`)
- Derive zkLogin address: `jwtToAddress(jwt, salt)`
- Generate ZK proof via Mysten's prover service (30-60 seconds)
- Store complete session (ephemeral key, JWT, salt, proof, address)

### 4. Transaction Signing

```typescript
import { getStoredSigner } from "@/lib/auth";

const signer = getStoredSigner();
if (!signer) {
  // User not logged in
  return;
}

// Sign transaction
const signature = await signer.signTransaction(txBytes);
```

**What happens:**
- Load session data from storage
- Sign transaction with ephemeral keypair
- Combine ephemeral signature with ZK proof
- Generate zkLogin signature
- Submit to Sui network

## File Structure

```
apps/web/
├── lib/
│   ├── zklogin-config.ts      # Configuration
│   ├── zklogin-utils.ts       # Utilities (nonce, JWT, storage)
│   ├── zklogin-proof.ts       # Proof generation
│   ├── zklogin-signer.ts      # Transaction signing
│   └── auth.ts                # Main auth module
├── app/
│   ├── auth/
│   │   └── callback/
│   │       └── page.tsx       # OAuth callback handler
│   ├── s/[objectId]/
│   │   └── page.tsx           # Shirt page (uses zkLogin)
│   └── me/
│       └── page.tsx           # User's shirts (uses zkLogin)
├── ZKLOGIN_SETUP.md           # Setup guide
└── README_ZKLOGIN.md          # This file
```

## Environment Variables

Required in `.env.local`:

```bash
# Google OAuth Client ID (from Google Cloud Console)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com

# OAuth redirect URI (must match Google Console config)
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000/auth/callback

# Mysten Labs services (defaults work for testnet)
NEXT_PUBLIC_PROVER_URL=https://prover-dev.mystenlabs.com/v1
NEXT_PUBLIC_SALT_SERVICE_URL=https://salt.api.mystenlabs.com/get_salt

# Development salt (use salt service in production)
ZKLOGIN_USER_SALT=your-random-salt-string
```

## Usage in Components

### Check Login Status

```typescript
import { isLoggedIn, getStoredAddress } from "@/lib/auth";

const loggedIn = isLoggedIn();
const address = getStoredAddress();
```

### Login Button

```typescript
import { loginWithGoogle } from "@/lib/auth";

<button onClick={() => loginWithGoogle(rpcUrl)}>
  Login with Google
</button>
```

### Logout Button

```typescript
import { logout } from "@/lib/auth";

<button onClick={logout}>
  Logout
</button>
```

### Get User Info

```typescript
import { getUserInfo } from "@/lib/auth";

const userInfo = getUserInfo();
// { email: "user@gmail.com", name: "John Doe", sub: "123456..." }
```

### Sign Transactions

```typescript
import { getStoredSigner } from "@/lib/auth";

const signer = getStoredSigner();
if (signer) {
  const signature = await signer.signTransaction(txBytes);
}
```

## Session Management

### Storage Strategy

- **sessionStorage**: Ephemeral key, JWT, salt, proof, randomness
  - Cleared when browser tab closes
  - Not shared across tabs
  - Sensitive data stays in memory

- **localStorage**: User address only
  - Persists across sessions
  - Shared across tabs
  - Public data (address is public anyway)

### Session Expiration

Ephemeral keys expire after `maxEpoch`:
- Current implementation: 10 epochs (~10 days on mainnet)
- Users must re-login after expiration
- TODO: Add epoch monitoring and auto-refresh

## Security Considerations

### What's Secure

✅ **Private keys never leave the browser**
- Ephemeral keys generated client-side
- Stored in sessionStorage (not sent to server)

✅ **Google can't see blockchain activity**
- ZK proofs hide JWT contents from blockchain
- Transactions don't reveal OAuth identity

✅ **Deterministic addresses**
- Same Google account = same address
- Users can recover access by logging in again

✅ **Time-limited sessions**
- Ephemeral keys expire automatically
- Reduces risk of key compromise

### What to Improve

⚠️ **Salt management**
- Current: Static salt in env vars (development only)
- Production: Use Mysten's salt service for unique per-user salts

⚠️ **Epoch monitoring**
- Current: No warning when ephemeral key nears expiration
- Production: Monitor epochs and prompt re-login

⚠️ **Error handling**
- Current: Basic error messages
- Production: Detailed error recovery flows

⚠️ **Rate limiting**
- Current: No rate limiting on proof generation
- Production: Add rate limits to prevent abuse

## Testing

### Manual Testing Checklist

1. **Login Flow**
   - [ ] Click "Login with Google"
   - [ ] Redirected to Google OAuth
   - [ ] Grant permissions
   - [ ] Redirected to callback page
   - [ ] Proof generation completes (30-60s)
   - [ ] Address appears in UI
   - [ ] Address stored in localStorage

2. **Session Persistence**
   - [ ] Refresh page - still logged in
   - [ ] Close tab and reopen - logged out (sessionStorage cleared)
   - [ ] Open new tab - not logged in (sessionStorage not shared)

3. **Transaction Signing**
   - [ ] Mint a shirt NFT
   - [ ] Transaction succeeds
   - [ ] NFT appears in wallet

4. **Logout**
   - [ ] Click logout
   - [ ] Address cleared from UI
   - [ ] sessionStorage cleared
   - [ ] localStorage cleared

5. **Error Cases**
   - [ ] Missing Google Client ID - shows error
   - [ ] Cancel OAuth - returns to app
   - [ ] Network error during proof generation - shows error
   - [ ] Invalid JWT - shows error

## Dependencies

```json
{
  "@mysten/sui": "^1.45.2",
  "@mysten/zklogin": "^0.7.7",
  "axios": "^1.7.9",
  "jwt-decode": "^4.0.0"
}
```

## Resources

- [Sui zkLogin Docs](https://docs.sui.io/concepts/cryptography/zklogin)
- [zkLogin SDK](https://sdk.mystenlabs.com/zklogin)
- [Mysten Prover Service](https://prover-dev.mystenlabs.com/)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)

## Troubleshooting

See `ZKLOGIN_SETUP.md` for detailed troubleshooting steps.

## Next Steps

1. **Get Google OAuth credentials** (see `ZKLOGIN_SETUP.md`)
2. **Install dependencies**: `pnpm install`
3. **Configure `.env.local`** with your Client ID
4. **Test the flow** on a shirt page
5. **Deploy to production** with proper salt service integration
