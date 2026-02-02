"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  fetchShirt,
  claimShirt,
  fetchWalrusBlob,
  walrusBlobIdToString,
  type ShirtResponse,
} from "@/lib/api";
import { getStoredAddress, loginWithGoogle, logout } from "@/lib/auth";

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

export default function ShirtPage() {
  const params = useParams();
  const router = useRouter();
  const objectId = typeof params.objectId === "string" ? params.objectId : "";

  const [shirt, setShirt] = useState<ShirtResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);
  const [mintTxDigest, setMintTxDigest] = useState<string | null>(null);
  const [walrusMetadata, setWalrusMetadata] = useState<Record<string, unknown> | null>(null);

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

  // If shirt has walrus_blob_id_metadata, fetch metadata from Walrus (name, description, image URL)
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
      const returnTo = `/s/${objectId}`;
      await loginWithGoogle(rpcUrl, returnTo);
      // User will be redirected to Google OAuth, then back to /auth/callback, then to returnTo
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    }
  }, [objectId]);

  const handleLogout = useCallback(() => {
    logout();
    setUserAddress(null);
  }, []);

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

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="max-w-md mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <a href="/" className="text-neutral-500 hover:text-neutral-700 text-sm">
            ← Back
          </a>
          {userAddress ? (
            <div className="flex items-center gap-2">
              <span className="text-neutral-500 text-sm truncate max-w-[140px]" title={userAddress}>
                {shortenAddress(userAddress)}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="text-sm text-neutral-500 hover:text-neutral-700"
              >
                Logout
              </button>
            </div>
          ) : null}
        </div>

        {shirt.is_minted ? (
          <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-sm">
            <h1 className="text-lg font-semibold text-neutral-800 mb-1">
              {walrusMetadata && typeof walrusMetadata.name === "string"
                ? walrusMetadata.name
                : "Shirt NFT"}
            </h1>
            {walrusMetadata && typeof walrusMetadata.description === "string" && (
              <p className="text-neutral-500 text-sm mb-4">{walrusMetadata.description}</p>
            )}
            {(() => {
              const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
              const imageBlobId = walrusBlobIdToString(shirt.walrus_blob_id_image);
              const imageSrc =
                (walrusMetadata && typeof walrusMetadata.image === "string" && walrusMetadata.image) ||
                (imageBlobId && apiUrl ? `${apiUrl}/walrus/${encodeURIComponent(imageBlobId)}` : null);
              return imageSrc ? (
                <div className="mb-4 rounded-lg overflow-hidden bg-neutral-100">
                  <img
                    src={imageSrc}
                    alt={typeof walrusMetadata?.name === "string" ? walrusMetadata.name : "Shirt"}
                    className="w-full h-auto object-cover"
                  />
                </div>
              ) : null;
            })()}
            {!walrusMetadata?.description &&
              !walrusMetadata?.image &&
              !walrusBlobIdToString(shirt.walrus_blob_id_image) && (
                <p className="text-neutral-500 text-sm mb-4">Drop name placeholder</p>
              )}
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-500">Serial</dt>
                <dd className="font-medium">{shirt.serial ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Owner</dt>
                <dd className="font-mono text-xs truncate max-w-[200px]" title={shirt.owner ?? undefined}>
                  {shortenAddress(shirt.owner)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Minted</dt>
                <dd>{formatDate(shirt.minted_at_ms)}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-sm">
            <h1 className="text-lg font-semibold text-neutral-800 mb-2">Unminted Shirt</h1>
            <p className="text-neutral-500 text-sm mb-4">Serial #{shirt.serial ?? "—"}. Log in and mint to claim.</p>
            {error ? <p className="text-red-600 text-sm mb-4">{error}</p> : null}
            {mintTxDigest ? (
              <p className="text-green-600 text-sm mb-4">Minted! Tx: {mintTxDigest.slice(0, 16)}…</p>
            ) : null}
            <div className="flex flex-col gap-3">
              {!userAddress ? (
                <button
                  type="button"
                  onClick={handleLogin}
                  className="w-full py-3 px-4 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 font-medium"
                >
                  Login with Google (zkLogin)
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleMint}
                disabled={!userAddress || minting}
                className="w-full py-3 px-4 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {minting ? "Minting…" : "Mint"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
