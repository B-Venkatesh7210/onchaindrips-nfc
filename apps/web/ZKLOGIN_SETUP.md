# zkLogin Setup Guide

This guide walks you through setting up zkLogin authentication with Google OAuth for your OnChainDrips app.

## Overview

zkLogin allows users to authenticate with their Google account and derive a deterministic Sui wallet address. The authentication uses zero-knowledge proofs, so Google never sees your blockchain transactions.

## Prerequisites

- Google Cloud Console account
- Node.js 20+ and pnpm installed
- Sui testnet RPC access

## Step 1: Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. Configure OAuth consent screen if prompted:
   - User Type: External
   - App name: OnChainDrips (or your app name)
   - User support email: your email
   - Developer contact: your email
   - Scopes: Add `openid`, `email`, `profile`
6. Create OAuth 2.0 Client ID:
   - Application type: **Web application**
   - Name: OnChainDrips Web
   - Authorized JavaScript origins:
     - `http://localhost:3000`
     - (add production domain later)
   - Authorized redirect URIs:
     - `http://localhost:3000/auth/callback`
     - (add production callback later)
7. Copy the **Client ID** (looks like `123456789-abc123.apps.googleusercontent.com`)

## Step 2: Configure Environment Variables

Update your `apps/web/.env.local` file:

```bash
# Backend API
NEXT_PUBLIC_API_URL=http://localhost:4000

# Sui RPC
NEXT_PUBLIC_SUI_RPC_URL=https://fullnode.testnet.sui.io

# Move package ID (from deployment)
NEXT_PUBLIC_PACKAGE_ID=0x...

# Google OAuth (REQUIRED for zkLogin)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID_HERE.apps.googleusercontent.com
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000/auth/callback

# zkLogin services (Mysten Labs - default values work)
NEXT_PUBLIC_PROVER_URL=https://prover-dev.mystenlabs.com/v1
NEXT_PUBLIC_SALT_SERVICE_URL=https://salt.api.mystenlabs.com/get_salt

# User salt (for development - use salt service in production)
ZKLOGIN_USER_SALT=your-random-salt-string-here
```

**Important:** Replace `YOUR_CLIENT_ID_HERE` with your actual Google Client ID from Step 1.

## Step 3: Install Dependencies

```bash
cd apps/web
pnpm install
```

This will install:
- `@mysten/zklogin` - zkLogin SDK
- `axios` - HTTP client for prover service
- `jose` - JWT parsing

## Step 4: Test the Flow

1. Start the backend API:
   ```bash
   cd apps/api
   pnpm dev
   ```

2. Start the Next.js app:
   ```bash
   cd apps/web
   pnpm dev
   ```

3. Navigate to a shirt page (e.g., `http://localhost:3000/{dropId}/{shirtObjectId}`)

4. Click **"Login with Google (zkLogin)"**

5. You'll be redirected to Google OAuth:
   - Sign in with your Google account
   - Grant permissions (openid, email, profile)

6. After OAuth, you'll be redirected to `/auth/callback`:
   - The app will generate a zero-knowledge proof (takes 30-60 seconds)
   - Your zkLogin address will be derived from your Google account
   - You'll be redirected back to the home page

7. Your zkLogin address will be shown in the top-right corner

8. Click **"Mint"** to claim the shirt NFT using your zkLogin wallet

## How It Works

### Login Flow

1. **Start Login** (`loginWithGoogle`):
   - Generate ephemeral keypair (temporary, expires after ~10 epochs)
   - Get current Sui epoch
   - Generate nonce from ephemeral public key + max epoch + randomness
   - Store ephemeral key in sessionStorage
   - Redirect to Google OAuth with nonce

2. **OAuth Callback** (`/auth/callback`):
   - Receive JWT `id_token` from Google (contains user's `sub` claim)
   - Get user salt (deterministic based on Google `sub`)
   - Derive zkLogin address: `jwtToAddress(jwt, salt)`
   - Generate ZK proof via Mysten's prover service (30-60s)
   - Store complete session (ephemeral key, JWT, salt, proof, address)

3. **Sign Transactions**:
   - Sign with ephemeral keypair
   - Combine with ZK proof to create zkLogin signature
   - Submit to Sui network

### Key Concepts

- **Ephemeral Keypair**: Temporary key that expires after max epoch (~10 days)
- **Nonce**: Binds ephemeral key to OAuth session
- **JWT**: Google's signed token proving your identity
- **Salt**: Random value that makes your address unique
- **ZK Proof**: Proves you have a valid JWT without revealing it
- **zkLogin Address**: Deterministic address derived from JWT + salt

### Security Notes

- Your Google credentials never touch the blockchain
- Google cannot see your transactions
- The ephemeral key expires automatically
- Each login session requires a new proof
- Your zkLogin address is always the same (tied to your Google account)

## Production Considerations

1. **Use Mysten's Salt Service**: The current implementation uses a static salt for development. In production, use the salt service API to get a unique salt per user.

2. **Add Production Domains**: Update your Google OAuth settings to include production domains.

3. **HTTPS Required**: Google OAuth requires HTTPS in production (localhost is exempt).

4. **Epoch Management**: Monitor epoch expiration and prompt users to re-login when their ephemeral key expires.

5. **Error Handling**: Add proper error handling for:
   - Network failures during proof generation
   - Expired ephemeral keys
   - Invalid JWT tokens
   - Prover service downtime

## Troubleshooting

### "Missing zkLogin configuration" error
- Make sure `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set in `.env.local`
- Restart the Next.js dev server after changing env vars

### "No id_token found in callback URL"
- Check that your redirect URI in Google Console matches exactly: `http://localhost:3000/auth/callback`
- Ensure you're using `response_type=id_token` (not `code`)

### "Failed to generate ZK proof"
- Check network connectivity
- Verify prover service URL is correct
- Proof generation takes 30-60 seconds - be patient
- Check browser console for detailed error messages

### "Invalid JWT token"
- JWT may have expired (Google JWTs expire after 1 hour)
- Try logging in again

### Address changes on each login
- This means the salt is changing
- For development, use a fixed `ZKLOGIN_USER_SALT` in `.env.local`
- For production, use Mysten's salt service which returns consistent salts

## Resources

- [Sui zkLogin Documentation](https://docs.sui.io/concepts/cryptography/zklogin)
- [zkLogin SDK Reference](https://sdk.mystenlabs.com/zklogin)
- [Google OAuth 2.0 Guide](https://developers.google.com/identity/protocols/oauth2)
- [Mysten Labs Prover Service](https://prover-dev.mystenlabs.com/)

## Support

If you encounter issues:
1. Check browser console for errors
2. Verify all environment variables are set
3. Ensure Google OAuth credentials are configured correctly
4. Check that backend API is running and accessible
