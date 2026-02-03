# Walrus blob ID formats

## On-chain (Sui Move)

Blob IDs are stored as **raw bytes**: `vector<u8>` in the `Shirt` struct.

- **Type:** `vector<u8>` (no base64, no hex — just the byte array).
- **Typical length:** 32 bytes (Walrus blob IDs are u256).
- **How it gets there:** When you call `mint_shirts`, the SDK sends the blob ID as a `vector<u8>` argument; the API decodes from base64url (or hex) into bytes and passes those bytes to the transaction. The chain does not care about encoding; it only stores the bytes.

So “which format on-chain?” → **raw bytes** (`vector<u8>`). Any encoding (base64url, hex) is only used when sending the value to the chain or reading it back off-chain.

## Supabase

We store blob IDs in **base64url** (URL-safe base64, no padding).

- **Mint flow:** The admin sends base64url from the Create drop UI; we store that string as-is in `shirts.walrus_blob_id_image` and `shirts.walrus_blob_id_metadata`. No conversion.
- **Backfill:** When we backfill from chain, we read the on-chain `vector<u8>`, encode it as base64url, and store that string. So Supabase always has base64url for new/backfilled rows.
- **Fetching images:** The Walrus aggregator expects base64url; we use the value from Supabase directly (and still support hex for older rows via conversion in the API).

## Summary

| Place       | Format     | Notes                                      |
|------------|------------|--------------------------------------------|
| On-chain   | Raw bytes  | `vector<u8>` in Move                       |
| Supabase   | Base64url  | Stored and used as-is; no conversion       |
| Walrus API | Base64url  | Same as Supabase for fetches               |
