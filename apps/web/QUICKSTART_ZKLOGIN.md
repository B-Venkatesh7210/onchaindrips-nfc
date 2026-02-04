# zkLogin Quick Start

Get zkLogin working in 5 minutes.

## Prerequisites

- Node.js 20+ and pnpm installed
- Google account

## Step 1: Google OAuth Setup (2 minutes)

1. Go to https://console.cloud.google.com/
2. Create a new project (or select existing)
3. Go to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. If prompted, configure OAuth consent screen:
   - User Type: **External**
   - App name: **OnChainDrips**
   - Add scopes: `openid`, `email`, `profile`
6. Create OAuth client:
   - Application type: **Web application**
   - Authorized redirect URIs: `http://localhost:3000/auth/callback`
7. **Copy the Client ID** (looks like `123456-abc.apps.googleusercontent.com`)

## Step 2: Configure Environment (1 minute)

Edit `apps/web/.env.local` and add your Client ID:

```bash
# Paste your Client ID here
NEXT_PUBLIC_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID_HERE.apps.googleusercontent.com

# These are already set with defaults:
NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000/auth/callback
NEXT_PUBLIC_PROVER_URL=https://prover-dev.mystenlabs.com/v1
NEXT_PUBLIC_SALT_SERVICE_URL=https://salt.api.mystenlabs.com/get_salt
ZKLOGIN_USER_SALT=onchaindrips-dev-salt-12345
```

## Step 3: Install Dependencies (1 minute)

```bash
cd apps/web
pnpm install
```

## Step 4: Start the App (1 minute)

Terminal 1 - Backend:
```bash
cd apps/api
pnpm install  # if not done already
pnpm dev
```

Terminal 2 - Frontend:
```bash
cd apps/web
pnpm dev
```

## Step 5: Test zkLogin (1 minute)

1. Open a shirt URL (e.g. `http://localhost:3000/{dropId}/{shirtObjectId}`)
   - Use the NFC URL format: drop object ID and shirt object ID from your drop

2. Click **"Login with Google (zkLogin)"**

3. Sign in with your Google account

4. Wait 30-60 seconds for proof generation

5. You should see your zkLogin address in the top-right corner

6. Click **"Mint"** to test transaction signing

## What You Should See

### Before Login
```
┌─────────────────────────────┐
│  Unminted Shirt             │
│  Serial #0                  │
│                             │
│  [Login with Google]        │
│  [Mint] (disabled)          │
└─────────────────────────────┘
```

### After Login
```
┌─────────────────────────────┐
│  ← Back    0x9b02...da9ce   │
│                    [Logout] │
│                             │
│  Unminted Shirt             │
│  Serial #0                  │
│                             │
│  [Mint]                     │
└─────────────────────────────┘
```

### During Proof Generation
```
┌─────────────────────────────┐
│  Completing zkLogin...      │
│                             │
│  ⟳ Generating zero-         │
│     knowledge proof.        │
│     This may take 30-60s.   │
│                             │
│  Please do not close this   │
│  window.                    │
└─────────────────────────────┘
```

## Troubleshooting

### "Missing zkLogin configuration"
- Make sure `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set in `.env.local`
- Restart the Next.js dev server: `Ctrl+C` then `pnpm dev`

### "No id_token found in callback URL"
- Check redirect URI in Google Console: must be exactly `http://localhost:3000/auth/callback`
- Make sure you created an **OAuth client ID** (not API key or service account)

### "Failed to generate ZK proof"
- Check internet connection (proof service is external)
- Wait the full 30-60 seconds
- Check browser console for detailed errors

### Proof generation takes too long
- This is normal! ZK proof generation is computationally intensive
- First proof can take 60+ seconds
- Subsequent proofs are usually faster (30-40s)

### Address changes every login
- Make sure `ZKLOGIN_USER_SALT` is set in `.env.local`
- Use the same Google account each time
- Clear browser cache and try again

## What's Different from Before?

### Old (Mock) Implementation
- Random keypair on each "login"
- Lost when browser closed
- Not tied to any identity
- Different address every time

### New (Real zkLogin) Implementation
- ✅ Tied to your Google account
- ✅ Same address every time
- ✅ Real OAuth authentication
- ✅ Zero-knowledge proofs
- ✅ Privacy-preserving

## Next Steps

- Read `ZKLOGIN_SETUP.md` for detailed setup
- Read `README_ZKLOGIN.md` for technical details
- Test minting an NFT
- Deploy to production (requires HTTPS)

## Need Help?

1. Check browser console for errors
2. Verify Google OAuth credentials
3. Ensure backend API is running
4. Check `ZKLOGIN_SETUP.md` for detailed troubleshooting
