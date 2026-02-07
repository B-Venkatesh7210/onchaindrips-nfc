/**
 * Backend API client. Uses NEXT_PUBLIC_API_URL (default http://localhost:4000).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Admin wallet address; admin routes require X-Admin-Address matching this. */
export const ADMIN_ADDRESS = "0x024b62b65c206e255b02b5fcf770634dcf0a4cac20dcca93f591a5253960365d";

export type DropRow = {
  id?: string;
  object_id: string;
  name: string;
  company_name: string;
  event_name: string;
  total_supply: number;
  next_serial?: number;
  minted_count?: number;
  created_at_ms?: number;
  created_at?: string;
  description?: string | null;
  release_date?: string | null;
  /** Optional bidding / reservation config for this drop. */
  reservation_slots?: number;
  bidding_ends_at?: string | null;
  reservation_evm_recipient?: string | null;
  bidding_closed?: boolean;
  // Optional per-size inventory for this drop.
  size_s_total?: number;
  size_m_total?: number;
  size_l_total?: number;
  size_xl_total?: number;
  size_xxl_total?: number;
  offchain_attributes?: Record<string, unknown>;
  /** Walrus blob ID for the drop's NFT t-shirt image (from first shirt). */
  image_blob_id?: string | null;
};

export type DropBid = {
  evm_address: string;
  bid_amount_usd: number;
  rank: number;
  status: "pending" | "won" | "lost";
  created_at: string;
  size?: string | null;
};

export type DropBidsResponse = {
  bids: DropBid[];
};

export async function fetchDrops(): Promise<DropRow[]> {
  const res = await fetch(`${API_URL}/drops`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** Public: list bids for a drop. */
export async function fetchDropBids(dropId: string): Promise<DropBidsResponse> {
  const res = await fetch(
    `${API_URL}/drops/${encodeURIComponent(dropId)}/bids`,
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(
      (err as { error?: string }).error ?? "Failed to fetch bids",
    );
  }
  return res.json() as Promise<DropBidsResponse>;
}

/** Public: place or update a bid for a drop. */
export async function placeDropBid(
  dropId: string,
  evmAddress: string,
  bidAmountUsd: number,
  size: "S" | "M" | "L" | "XL" | "XXL",
): Promise<{
  evm_address: string;
  bid_amount_usd: number;
  rank: number | null;
  total_bids: number;
  reservation_slots: number;
}> {
  const res = await fetch(
    `${API_URL}/drops/${encodeURIComponent(dropId)}/bids`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        evm_address: evmAddress,
        bid_amount_usd: bidAmountUsd,
        size,
      }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(
      (err as { error?: string }).error ?? "Failed to place bid",
    );
  }
  return res.json() as Promise<{
    evm_address: string;
    bid_amount_usd: number;
    rank: number | null;
    total_bids: number;
    reservation_slots: number;
  }>;
}

/** Resolve claim URL token to shirt object ID (for /{dropId}/{token} NFC URLs). */
export async function resolveClaimToken(
  dropId: string,
  token: string
): Promise<{ shirtObjectId: string }> {
  const url = new URL(`${API_URL}/drops/${encodeURIComponent(dropId)}/resolve`);
  url.searchParams.set("token", token.trim());
  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Invalid claim URL");
  }
  return res.json();
}

/** Admin: create drop (onchain + Supabase). Send X-Admin-Address. */
export async function adminCreateDrop(
  adminAddress: string,
  body: {
    name: string;
    company_name: string;
    event_name: string;
    total_supply: number;
    description?: string;
    release_date?: string;
    reservation_slots?: number;
    bidding_ends_at?: string;
    reservation_evm_recipient?: string;
    size_s_total?: number;
    size_m_total?: number;
    size_l_total?: number;
    size_xl_total?: number;
    size_xxl_total?: number;
  }
): Promise<{ dropObjectId: string; digest: string }> {
  const res = await fetch(`${API_URL}/admin/drops`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Address": adminAddress },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to create drop");
  }
  return res.json();
}

/** Admin: close bidding for a drop (after Yellow settlement). */
export async function adminCloseDropBids(
  adminAddress: string,
  dropId: string,
): Promise<{
  winners: { evm_address: string; bid_amount_usd: number; rank: number }[];
  losers: { evm_address: string; bid_amount_usd: number }[];
}> {
  const res = await fetch(
    `${API_URL}/admin/drops/${encodeURIComponent(dropId)}/bids/close`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Address": adminAddress,
      },
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(
      (err as { error?: string }).error ?? "Failed to close bids",
    );
  }
  return res.json() as Promise<{
    winners: {
      evm_address: string;
      bid_amount_usd: number;
      rank: number;
    }[];
    losers: { evm_address: string; bid_amount_usd: number }[];
  }>;
}

/** Admin: preview winners/losers and totals before closing bids. */
export async function adminFetchDropBidSummary(
  adminAddress: string,
  dropId: string,
): Promise<{
  drop: {
    object_id: string;
    name: string;
    reservation_slots: number;
    reservation_evm_recipient: string | null;
    bidding_closed?: boolean;
    bidding_ends_at?: string | null;
  };
  winners: { evm_address: string; bid_amount_usd: number; rank: number }[];
  losers: { evm_address: string; bid_amount_usd: number }[];
}> {
  const res = await fetch(
    `${API_URL}/admin/drops/${encodeURIComponent(dropId)}/bids/summary`,
    {
      headers: {
        "X-Admin-Address": adminAddress,
      },
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(
      (err as { error?: string }).error ?? "Failed to load bid summary",
    );
  }
  return res.json() as Promise<{
    drop: {
      object_id: string;
      name: string;
      reservation_slots: number;
      reservation_evm_recipient: string | null;
      bidding_closed?: boolean;
      bidding_ends_at?: string | null;
    };
    winners: { evm_address: string; bid_amount_usd: number; rank: number }[];
    losers: { evm_address: string; bid_amount_usd: number }[];
  }>;
}

/** Admin: mint shirts (onchain + Supabase). Send X-Admin-Address. */
export async function adminMintShirts(
  adminAddress: string,
  dropObjectId: string,
  body: {
    walrusBlobIdImage: string;
    walrusBlobIdMetadata: string;
    count?: number;
    gifUrl?: string;
    imageUrls?: string[];
  }
): Promise<{
  dropObjectId: string;
  digest: string;
  count: number;
  shirtObjectIds: string[];
  claimTokens?: { shirtObjectId: string; token: string }[];
}> {
  const res = await fetch(`${API_URL}/admin/drops/${encodeURIComponent(dropObjectId)}/mint`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Address": adminAddress },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to mint shirts");
  }
  return res.json();
}

/** Upload image to Walrus (multipart field "image"). Returns blobId. */
export async function uploadImageToWalrus(file: File): Promise<{ blobId: string }> {
  const form = new FormData();
  form.append("image", file);
  const res = await fetch(`${API_URL}/walrus/upload-image`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to upload image");
  }
  return res.json();
}

/** Upload JSON metadata to Walrus. Returns blobId. */
export async function uploadMetadataToWalrus(metadata: Record<string, unknown>): Promise<{ blobId: string }> {
  const res = await fetch(`${API_URL}/walrus/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to upload metadata");
  }
  return res.json();
}

export type ShirtResponse = {
  objectId: string;
  is_minted: boolean;
  serial: number | null;
  drop_id: string | null;
  minted_at_ms: number | null;
  walrus_blob_id_image: number[] | string | null;
  walrus_blob_id_metadata: number[] | string | null;
  owner: string | null;
  /** Mint/claim transaction digest (from claims table); for explorer link. */
  claim_tx_digest?: string | null;
};

export type ShirtProfile = {
  ens_name?: string | null;
  ens_locked?: boolean;
  fields?: Record<string, unknown>;
};

export type SponsorResponse = {
  sponsoredTxBytesBase64: string;
  sponsorSignatureBase64: string;
};

export async function fetchShirt(objectId: string): Promise<ShirtResponse> {
  const res = await fetch(`${API_URL}/shirt/${encodeURIComponent(objectId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to fetch shirt");
  }
  return res.json() as Promise<ShirtResponse>;
}

export async function fetchShirtProfile(objectId: string): Promise<ShirtProfile | null> {
  const res = await fetch(`${API_URL}/shirt/${encodeURIComponent(objectId)}/profile`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to fetch shirt profile");
  }
  const body = (await res.json()) as { profile?: ShirtProfile | null };
  return body.profile ?? null;
}

export async function saveShirtProfile(
  objectId: string,
  ownerAddress: string,
  profile: ShirtProfile,
): Promise<ShirtProfile> {
  const res = await fetch(`${API_URL}/shirt/${encodeURIComponent(objectId)}/profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ownerAddress, profile }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to save shirt profile");
  }
  const body = (await res.json()) as { profile: ShirtProfile };
  return body.profile;
}

export async function sponsorTransaction(
  txBytesBase64: string,
  userSignatureBase64: string,
  senderAddress?: string,
): Promise<SponsorResponse> {
  const body: { txBytesBase64: string; userSignatureBase64: string; senderAddress?: string } = {
    txBytesBase64,
    userSignatureBase64,
  };
  if (senderAddress) {
    body.senderAddress = senderAddress;
  }
  const res = await fetch(`${API_URL}/sponsor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Sponsor request failed");
  }
  return res.json() as Promise<SponsorResponse>;
}

export type ClaimResponse = {
  digest: string;
};

/** Claim a shirt: backend builds claim_and_transfer, signs as shirt owner, executes. No user signing. */
export async function claimShirt(shirtObjectId: string, recipientAddress: string): Promise<ClaimResponse> {
  const res = await fetch(`${API_URL}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shirtObjectId, recipientAddress }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const body = err as { error?: string; details?: string };
    const message = body.details ? `${body.error ?? "Claim failed"}: ${body.details}` : (body.error ?? "Claim failed");
    throw new Error(message);
  }
  return res.json() as Promise<ClaimResponse>;
}

/** Walrus blob ID from chain (vector<u8>) may be number[] or string; normalize to string for /api/walrus. */
export function walrusBlobIdToString(walrusBlobId: number[] | string | null): string | null {
  if (walrusBlobId == null) return null;
  if (typeof walrusBlobId === "string") return walrusBlobId.trim() || null;
  if (Array.isArray(walrusBlobId) && walrusBlobId.length > 0) {
    return Array.from(walrusBlobId)
      .map((b) => Number(b).toString(16).padStart(2, "0"))
      .join("");
  }
  return null;
}

/** Fetch blob data from API (proxies to Walrus aggregator). Returns parsed JSON or null. */
export async function fetchWalrusBlob(blobId: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${API_URL}/walrus/${encodeURIComponent(blobId)}`);
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json() as Promise<Record<string, unknown>>;
  }
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}
