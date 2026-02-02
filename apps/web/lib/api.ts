/**
 * Backend API client. Uses NEXT_PUBLIC_API_URL (default http://localhost:4000).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type ShirtResponse = {
  objectId: string;
  is_minted: boolean;
  serial: number | null;
  drop_id: string | null;
  minted_at_ms: number | null;
  walrus_blob_id_image: number[] | string | null;
  walrus_blob_id_metadata: number[] | string | null;
  owner: string | null;
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
    throw new Error((err as { error?: string }).error ?? "Claim failed");
  }
  return res.json() as Promise<ClaimResponse>;
}

/** Walrus blob ID from chain (vector<u8>) may be number[] or string; normalize to string. */
export function walrusBlobIdToString(walrusBlobId: number[] | string | null): string | null {
  if (walrusBlobId == null) return null;
  if (typeof walrusBlobId === "string") return walrusBlobId.trim() || null;
  if (Array.isArray(walrusBlobId) && walrusBlobId.length > 0) {
    return new TextDecoder().decode(new Uint8Array(walrusBlobId));
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
