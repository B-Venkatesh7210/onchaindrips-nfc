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
  walrus_blob_id: number[] | string | null;
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
): Promise<SponsorResponse> {
  const res = await fetch(`${API_URL}/sponsor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txBytesBase64, userSignatureBase64 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Sponsor request failed");
  }
  return res.json() as Promise<SponsorResponse>;
}
