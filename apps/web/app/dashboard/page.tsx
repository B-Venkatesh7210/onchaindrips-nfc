"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getSuiClient, CURRENT_SHIRT_TYPE } from "@/lib/sui";
import { getStoredAddress } from "@/lib/auth";
import { fetchDrops, walrusBlobIdToString, type DropRow } from "@/lib/api";

type ShirtSummary = {
  objectId: string;
  dropId: string;
  type: string;
  serial?: number;
  isMinted?: boolean;
  /** Hex blob ID for NFT image (from chain). */
  imageBlobId: string | null;
};

function shortenAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-8)}`;
}

function ShirtCard({
  shirt,
  drop,
}: {
  shirt: ShirtSummary;
  drop: DropRow | null;
}) {
  const [imageError, setImageError] = useState(false);
  const imageSrc = shirt.imageBlobId
    ? `/api/walrus/${encodeURIComponent(shirt.imageBlobId)}`
    : drop?.image_blob_id?.trim()
      ? `/api/walrus/${encodeURIComponent(drop.image_blob_id)}`
      : null;
  const dropName = drop?.name ?? "Drop";
  const subline = [drop?.company_name, drop?.event_name].filter(Boolean).join(" · ");

  return (
    <Link
      href={`/${shirt.dropId}/${shirt.objectId}`}
      className="group block overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:border-neutral-300 hover:shadow-md"
    >
      <div className="relative aspect-square bg-neutral-100">
        {imageSrc && !imageError ? (
          <img
            src={imageSrc}
            alt={dropName}
            className="h-full w-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-400 text-sm">
            {imageSrc ? "Image unavailable" : "No image"}
          </div>
        )}
        {shirt.isMinted && (
          <span className="absolute right-2 top-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">
            Minted
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-neutral-900 truncate">{dropName}</h3>
        {subline ? <p className="text-sm text-neutral-500 truncate">{subline}</p> : null}
        <div className="mt-2 flex items-center justify-between">
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
            Serial #{shirt.serial ?? "?"}
          </span>
          {!shirt.isMinted && (
            <span className="text-xs font-medium text-amber-600">Unminted</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [address, setAddress] = useState<string | null>(null);
  const [shirts, setShirts] = useState<ShirtSummary[]>([]);
  const [drops, setDrops] = useState<DropRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOwnedShirts = useCallback(async (owner: string) => {
    const client = getSuiClient();
    const items: ShirtSummary[] = [];
    const shirtTypeLower = CURRENT_SHIRT_TYPE?.toLowerCase() ?? "";
    let cursor: string | undefined;
    do {
      const page = await client.getOwnedObjects({
        owner,
        cursor,
        limit: 50,
        options: { showContent: true, showType: true },
      });
      for (const obj of page.data) {
        const type = obj.data?.type;
        if (!type) continue;
        const typeLower = type.toLowerCase();
        const isCurrentPackageShirt = shirtTypeLower ? typeLower === shirtTypeLower : typeLower.includes("::onchaindrips::shirt");
        if (!isCurrentPackageShirt) continue;
        const content = obj.data?.content;
        const fields =
          content && typeof content === "object" && "fields" in content
            ? (content as { fields?: Record<string, unknown> }).fields
            : undefined;
        const serial =
          fields?.serial != null
            ? typeof fields.serial === "string"
              ? Number(fields.serial)
              : Number(fields.serial)
            : undefined;
        const isMinted = Boolean(fields?.is_minted);
        const dropId = typeof fields?.drop_id === "string" ? fields.drop_id : "";
        if (!dropId) continue;
        const rawImageBlob = fields?.walrus_blob_id_image;
        const imageBlobId = walrusBlobIdToString(
          Array.isArray(rawImageBlob) ? rawImageBlob : typeof rawImageBlob === "string" ? rawImageBlob : null
        );
        items.push({
          objectId: obj.data?.objectId ?? "",
          dropId,
          type,
          serial: Number.isNaN(serial) ? undefined : serial,
          isMinted,
          imageBlobId,
        });
      }
      cursor = page.hasNextPage ? page.nextCursor : undefined;
    } while (cursor);
    setShirts(items);
  }, []);

  useEffect(() => {
    const addr = getStoredAddress();
    setAddress(addr);
    if (!addr) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    loadOwnedShirts(addr)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load shirts"))
      .finally(() => setLoading(false));
  }, [loadOwnedShirts]);

  useEffect(() => {
    let cancelled = false;
    fetchDrops().then((list) => {
      if (!cancelled) setDrops(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!address) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
        <p className="text-neutral-600">Sign in to view your dashboard.</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="rounded-lg bg-neutral-800 px-4 py-2 text-white hover:bg-neutral-700"
        >
          Home
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
        <p className="mt-1 text-neutral-500 text-sm truncate" title={address}>
          {shortenAddress(address)}
        </p>
      </div>
      {error ? <p className="mb-4 text-red-600 text-sm">{error}</p> : null}
      {loading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : shirts.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
          <p className="text-neutral-500">No shirts minted yet.</p>
          <p className="mt-1 text-sm text-neutral-400">Claim a shirt from a drop to see it here.</p>
          {!CURRENT_SHIRT_TYPE && (
            <p className="mt-3 text-xs text-amber-600">
              Set <code className="rounded bg-amber-50 px-1">NEXT_PUBLIC_PACKAGE_ID</code> in <code className="rounded bg-amber-50 px-1">apps/web/.env.local</code> to show shirts from your deployed package.
            </p>
          )}
          {CURRENT_SHIRT_TYPE && (
            <p className="mt-3 text-xs text-neutral-500">
              Only shirts from the current app package are shown. If you just minted, ensure <code className="rounded bg-neutral-100 px-1">NEXT_PUBLIC_PACKAGE_ID</code> in the web app matches the package ID in your API <code className="rounded bg-neutral-100 px-1">.env</code>.
            </p>
          )}
          <Link href="/" className="mt-4 inline-block text-sm font-medium text-neutral-700 hover:text-neutral-900">
            Browse drops →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shirts.map((s) => (
            <ShirtCard
              key={s.objectId}
              shirt={s}
              drop={drops.find((d) => d.object_id?.toLowerCase() === s.dropId.toLowerCase()) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
