"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  fetchShirt,
  fetchDrops,
  claimShirt,
  fetchWalrusBlob,
  walrusBlobIdToString,
  type ShirtResponse,
  type DropRow,
} from "@/lib/api";
import { getStoredAddress, loginWithGoogle } from "@/lib/auth";

function formatDate(ms: number | null): string {
  if (ms == null) return "—";
  try {
    return new Date(Number(ms)).toLocaleString();
  } catch {
    return "—";
  }
}

function shortenAddress(addr: string | null): string {
  if (!addr) return "—";
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-8)}`;
}

function normalizeAddress(a: string): string {
  return a.toLowerCase().trim();
}

function isOwner(userAddress: string | null, shirtOwner: string | null): boolean {
  if (!userAddress || !shirtOwner) return false;
  return normalizeAddress(userAddress) === normalizeAddress(shirtOwner);
}

const SUI_EXPLORER_BASE =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_SUI_EXPLORER_URL
    ? process.env.NEXT_PUBLIC_SUI_EXPLORER_URL
    : "https://suiexplorer.com/txblock";
const SUI_NETWORK = typeof process !== "undefined" && process.env.NEXT_PUBLIC_SUI_NETWORK ? process.env.NEXT_PUBLIC_SUI_NETWORK : "testnet";

function explorerTxUrl(digest: string): string {
  return `${SUI_EXPLORER_BASE}/${digest}?network=${SUI_NETWORK}`;
}

type Props = {
  shirtObjectId: string;
  dropId?: string;
  returnToPath: string;
};

export default function ShirtPageContent({ shirtObjectId, dropId, returnToPath }: Props) {
  const router = useRouter();
  const objectId = shirtObjectId;

  const [shirt, setShirt] = useState<ShirtResponse | null>(null);
  const [drop, setDrop] = useState<DropRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);
  const [mintTxDigest, setMintTxDigest] = useState<string | null>(null);
  const [walrusMetadata, setWalrusMetadata] = useState<Record<string, unknown> | null>(null);
  const [imageError, setImageError] = useState(false);

  const loadShirt = useCallback(async () => {
    if (!objectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchShirt(objectId);
      setShirt(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load shirt");
      setShirt(null);
    } finally {
      setLoading(false);
    }
  }, [objectId]);

  useEffect(() => {
    loadShirt();
  }, [loadShirt]);

  useEffect(() => {
    if (!dropId) return;
    let cancelled = false;
    fetchDrops().then((drops) => {
      if (cancelled) return;
      const normalized = dropId.toLowerCase().trim();
      const found = drops.find((d) => d.object_id?.toLowerCase() === normalized) ?? null;
      setDrop(found);
    });
    return () => {
      cancelled = true;
    };
  }, [dropId]);

  useEffect(() => {
    if (!shirt) return;
    const blobId = walrusBlobIdToString(shirt.walrus_blob_id_metadata);
    if (!blobId) {
      setWalrusMetadata(null);
      return;
    }
    let cancelled = false;
    fetchWalrusBlob(blobId).then((data) => {
      if (!cancelled && data) setWalrusMetadata(data);
    });
    return () => {
      cancelled = true;
    };
  }, [shirt?.objectId, shirt?.walrus_blob_id_metadata]);

  useEffect(() => {
    setUserAddress(getStoredAddress());
  }, []);

  const handleLogin = useCallback(async () => {
    try {
      const rpcUrl = process.env.NEXT_PUBLIC_SUI_RPC_URL || "https://fullnode.testnet.sui.io";
      await loginWithGoogle(rpcUrl, returnToPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    }
  }, [returnToPath]);

  const handleMint = useCallback(async () => {
    if (!shirt || shirt.is_minted || !userAddress) return;
    setMinting(true);
    setError(null);
    try {
      const { digest } = await claimShirt(objectId, userAddress);
      setMintTxDigest(digest);
      await loadShirt();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mint failed");
    } finally {
      setMinting(false);
    }
  }, [shirt, userAddress, objectId, loadShirt]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <p className="text-neutral-500">Loading…</p>
      </div>
    );
  }

  if (error && !shirt) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-neutral-50 p-4">
        <p className="text-red-600">{error}</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700"
        >
          Home
        </button>
      </div>
    );
  }

  if (!shirt) {
    return null;
  }

  const imageBlobId =
    walrusBlobIdToString(shirt.walrus_blob_id_image) ?? drop?.image_blob_id?.trim() ?? null;
  const imageSrc = imageBlobId ? `/api/walrus/${encodeURIComponent(imageBlobId)}` : null;
  const totalSupply = drop ? Number(drop.total_supply ?? 0) : 0;
  const mintedCount = drop ? Number(drop.minted_count ?? 0) : 0;
  const remaining = Math.max(0, totalSupply - mintedCount);
  const dropName = drop?.name ?? (walrusMetadata && typeof walrusMetadata.name === "string" ? walrusMetadata.name : "Drop");
  const description = drop?.description?.trim() || (walrusMetadata && typeof walrusMetadata.description === "string" ? walrusMetadata.description : null);

  const viewUnminted = !shirt.is_minted;
  const viewOwner = shirt.is_minted && isOwner(userAddress, shirt.owner);
  const viewNonOwner = shirt.is_minted && !viewOwner;
  const claimTxDigest = mintTxDigest ?? shirt.claim_tx_digest ?? null;

  return (
    <div className="min-h-screen bg-neutral-100 py-8 px-4">
      <div className="max-w-md mx-auto space-y-6">
        {/* Card: same for all three views */}
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-lg overflow-hidden">
          <div className="aspect-square bg-neutral-100 flex items-center justify-center">
            {imageSrc && !imageError ? (
              <img
                src={imageSrc}
                alt={dropName}
                className="w-full h-full object-contain"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-neutral-400 text-sm">
                {imageSrc ? "Image unavailable" : "No image"}
              </div>
            )}
          </div>

          <div className="p-5 sm:p-6 space-y-4">
            <h1 className="text-xl font-bold text-neutral-900 leading-tight">{dropName}</h1>
            {(drop?.company_name || drop?.event_name) && (
              <p className="text-neutral-600 text-sm">
                {[drop.company_name, drop.event_name].filter(Boolean).join(" · ")}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="font-medium text-neutral-800">Serial #{shirt.serial ?? "—"}</span>
              {totalSupply > 0 && (
                <span className="text-neutral-500">
                  {mintedCount} of {totalSupply} minted
                  {remaining > 0 && (
                    <span className="ml-1 font-medium text-emerald-600">· {remaining} left</span>
                  )}
                </span>
              )}
            </div>
            {description && (
              <p className="text-neutral-600 text-sm leading-relaxed">{description}</p>
            )}

            {/* View 1: Unminted — show Login + Mint */}
            {viewUnminted && (
              <>
                {error ? <p className="text-red-600 text-sm">{error}</p> : null}
                <div className="flex flex-col gap-3 pt-1">
                  {!userAddress ? (
                    <button
                      type="button"
                      onClick={handleLogin}
                      className="w-full py-3.5 px-4 rounded-xl bg-neutral-900 text-white font-medium hover:bg-neutral-800 transition-colors"
                    >
                      Log in with Google (zkLogin)
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleMint}
                    disabled={!userAddress || minting}
                    className="w-full py-3.5 px-4 rounded-xl bg-neutral-900 text-white font-medium hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {minting ? "Minting…" : "Mint"}
                  </button>
                </div>
              </>
            )}

            {/* Minted: no Mint button inside card */}
          </div>
        </div>

        {/* Below card: for minted shirts only */}
        {shirt.is_minted && (
          <div className="space-y-4">
            {/* Tx link — owner view only (or when we have digest) */}
            {viewOwner && claimTxDigest && (
              <div className="text-center">
                <a
                  href={explorerTxUrl(claimTxDigest)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-neutral-700 underline hover:text-neutral-900"
                >
                  View mint transaction on Explorer
                </a>
              </div>
            )}

            {/* Owner line — both owner and non-owner */}
            <p className="text-sm text-neutral-600 text-center">
              Owner: <span className="font-mono" title={shirt.owner ?? undefined}>{shirt.owner ? shortenAddress(shirt.owner) : "—"}</span>
            </p>

            {/* Add Details — owner view only */}
            {viewOwner && (
              <div className="flex justify-center">
                <button
                  type="button"
                  className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
                >
                  Add Details about yourself
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
