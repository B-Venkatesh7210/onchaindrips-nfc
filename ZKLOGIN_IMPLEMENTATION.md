# zkLogin Implementation Summary

Real zkLogin authentication has been successfully implemented for the OnChainDrips project.

## What Changed

### 1. Dependencies Added (`apps/web/package.json`)
- `@mysten/zklogin@^0.7.7` - zkLogin SDK
- `axios@^1.7.9` - HTTP client for prover service
- `jwt-decode@^4.0.0` - JWT parsing

### 2. New Files Created

**Core Implementation:**
- `apps/web/lib/zklogin-config.ts` - Configuration and constants
- `apps/web/lib/zklogin-utils.ts` - Utilities (nonce, JWT, storage)
- `apps/web/lib/zklogin-proof.ts` - ZK proof generation
- `apps/web/lib/zklogin-signer.ts` - Transaction signing
- `apps/web/lib/auth.ts` - Main auth module (replaced stub)
- `apps/web/app/auth/callback/page.tsx` - OAuth callback handler

**Documentation:**
- `apps/web/ZKLOGIN_SETUP.md` - Step-by-step setup guide
- `apps/web/README_ZKLOGIN.md` - Technical documentation

### 3. Files Updated

**UI Components:**
- `apps/web/app/s/[objectId]/page.tsx` - Uses real zkLogin
- `apps/web/app/me/page.tsx` - Uses real zkLogin

**Environment:**
- `apps/web/.env.example` - Added zkLogin variables
- `apps/web/.env.local` - Added zkLogin configuration

## How It Works

### Authentication Flow

1. **User clicks "Login with Google"**
   - App generates ephemeral keypair (temporary, expires after 10 epochs)
   - Gets current Sui epoch from RPC
   - Generates nonce from ephemeral key + epoch + randomness
   - Redirects to Google OAuth

2. **Google OAuth**
   - User authenticates with Google
   - Grants permissions (openid, email, profile)
   - Google returns JWT `id_token`
   - Redirects to `/auth/callback`

3. **Proof Generation**
   - App extracts JWT from URL
   - Derives zkLogin address from JWT + salt
   - Generates zero-knowledge proof via Mysten's prover service (30-60s)
   - Stores complete session

4. **Transaction Signing**
   - User initiates transaction (e.g., mint NFT)
   - App signs with ephemeral key
   - Combines with ZK proof to create zkLogin signature
   - Submits to Sui network

### Key Benefits

✅ **No seed phrases** - Users log in with Google
✅ **Privacy-preserving** - Google can't see blockchain activity
✅ **Deterministic** - Same Google account = same Sui address
✅ **Familiar UX** - Standard OAuth flow

## Setup Required

### 1. Google OAuth Credentials

You need to create OAuth credentials in Google Cloud Console:

1. Go to https://console.cloud.google.com/
2. Create/select project
3. Navigate to APIs & Services → Credentials
4. Create OAuth 2.0 Client ID (Web application)
5. Add authorized redirect URI: `http://localhost:3000/auth/callback`
6. Copy the Client ID

### 2. Environment Variables

Add to `apps/web/.env.local`:

```bash
# REQUIRED: Your Google OAuth Client ID
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com

# Optional: These have working defaults
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000/auth/callback
NEXT_PUBLIC_PROVER_URL=https://prover-dev.mystenlabs.com/v1
NEXT_PUBLIC_SALT_SERVICE_URL=https://salt.api.mystenlabs.com/get_salt
ZKLOGIN_USER_SALT=onchaindrips-dev-salt-12345
```

### 3. Install Dependencies

```bash
cd apps/web
pnpm install
```

### 4. Test

```bash
# Start backend
cd apps/api
pnpm dev

# Start frontend (new terminal)
cd apps/web
pnpm dev

# Navigate to http://localhost:3000/s/[shirt-object-id]
# Click "Login with Google (zkLogin)"
```

## Differences from Mock Implementation

### Before (Mock)
- ❌ Random keypair generated on each "login"
- ❌ Not tied to any identity
- ❌ Lost when browser closed
- ❌ Different address every time
- ❌ No OAuth/authentication

### After (Real zkLogin)
- ✅ Tied to Google account
- ✅ Same address every time (deterministic)
- ✅ Real OAuth authentication
- ✅ Zero-knowledge proofs
- ✅ Privacy-preserving

## Architecture

```
┌─────────────┐
│   User      │
└──────┬──────┘
       │ 1. Click "Login"
       ▼
┌─────────────────────────────────────────┐
│  Next.js App (apps/web)                 │
│  - Generate ephemeral keypair           │
│  - Generate nonce                       │
│  - Redirect to Google OAuth             │
└──────┬──────────────────────────────────┘
       │ 2. OAuth redirect
       ▼
┌─────────────────────────────────────────┐
│  Google OAuth                           │
│  - User authenticates                   │
│  - Returns JWT id_token                 │
└──────┬──────────────────────────────────┘
       │ 3. Callback with JWT
       ▼
┌─────────────────────────────────────────┐
│  /auth/callback                         │
│  - Extract JWT                          │
│  - Get user salt                        │
│  - Derive zkLogin address               │
│  - Request ZK proof from prover         │
└──────┬──────────────────────────────────┘
       │ 4. Proof request
       ▼
┌─────────────────────────────────────────┐
│  Mysten Prover Service                  │
│  - Generate zero-knowledge proof        │
│  - Returns proof (30-60s)               │
└──────┬──────────────────────────────────┘
       │ 5. Proof response
       ▼
┌─────────────────────────────────────────┐
│  Session Storage                        │
│  - Ephemeral key                        │
│  - JWT token                            │
│  - User salt                            │
│  - ZK proof                             │
│  - User address (localStorage)          │
└─────────────────────────────────────────┘
```

## Security Notes

- **Ephemeral keys** stored in sessionStorage (cleared when tab closes)
- **User address** stored in localStorage (persists across sessions)
- **Private keys never leave browser**
- **Google can't see blockchain transactions**
- **ZK proofs hide JWT contents from blockchain**
- **Sessions expire after ~10 epochs** (~10 days on mainnet)

## Production Considerations

1. **Use Salt Service**: Current implementation uses static salt for development. In production, use Mysten's salt service for unique per-user salts.

2. **HTTPS Required**: Google OAuth requires HTTPS in production (localhost exempt).

3. **Add Production Domains**: Update Google OAuth settings with production URLs.

4. **Monitor Epochs**: Add epoch monitoring and prompt users to re-login before expiration.

5. **Error Handling**: Add comprehensive error handling for network failures, expired keys, etc.

## Documentation

- **Setup Guide**: `apps/web/ZKLOGIN_SETUP.md` - Step-by-step setup instructions
- **Technical Docs**: `apps/web/README_ZKLOGIN.md` - Architecture and API reference
- **This File**: High-level summary of implementation

## Testing Checklist

- [ ] Install dependencies: `pnpm install`
- [ ] Set up Google OAuth credentials
- [ ] Add `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to `.env.local`
- [ ] Start backend API: `cd apps/api && pnpm dev`
- [ ] Start frontend: `cd apps/web && pnpm dev`
- [ ] Navigate to shirt page: `http://localhost:3000/s/[objectId]`
- [ ] Click "Login with Google (zkLogin)"
- [ ] Complete Google OAuth
- [ ] Wait for proof generation (30-60s)
- [ ] Verify address appears in UI
- [ ] Click "Mint" to test transaction signing
- [ ] Verify NFT is minted successfully

## Next Steps

1. **Get Google OAuth credentials** (see `apps/web/ZKLOGIN_SETUP.md`)
2. **Test the implementation** with a real shirt object
3. **Deploy to production** with proper configuration
4. **Add epoch monitoring** for better UX
5. **Integrate salt service** for production

## Support

If you encounter issues:
- Check `apps/web/ZKLOGIN_SETUP.md` for troubleshooting
- Verify all environment variables are set
- Check browser console for detailed errors
- Ensure Google OAuth credentials are configured correctly
