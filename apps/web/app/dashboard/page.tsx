"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getSuiClient, CURRENT_SHIRT_TYPE } from "@/lib/sui";
import { getStoredAddress } from "@/lib/auth";
import { fetchDrops, walrusBlobIdToString, type DropRow } from "@/lib/api";
import { ImageCarousel, type CarouselSlide } from "@/app/components/ImageCarousel";

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

function toImageUrl(value: string): string {
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) return v;
  return `/api/walrus/${encodeURIComponent(v)}`;
}

function shirtCarouselSlides(
  shirt: ShirtSummary,
  drop: DropRow | null
): CarouselSlide[] {
  if (drop) {
    const nft = drop.image_blob_id?.trim();
    const u1 = drop.uploaded_image_1?.trim();
    const u2 = drop.uploaded_image_2?.trim();
    const slide1: CarouselSlide | null = nft
      ? u1
        ? { primary: toImageUrl(nft), fallback: toImageUrl(u1) }
        : toImageUrl(nft)
      : u1
        ? toImageUrl(u1)
        : null;
    const slide2 = u2 ? toImageUrl(u2) : null;
    return [slide1, slide2].filter(Boolean) as CarouselSlide[];
  }
  const blobId = shirt.imageBlobId ?? null;
  return blobId ? [toImageUrl(blobId)] : [];
}

function ShirtCard({
  shirt,
  drop,
}: {
  shirt: ShirtSummary;
  drop: DropRow | null;
}) {
  const carouselSlides = shirtCarouselSlides(shirt, drop);
  const dropName = drop?.name ?? "Drop";
  const subline = [drop?.company_name, drop?.event_name]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/${shirt.dropId}/${shirt.objectId}`}
      className="group block overflow-hidden rounded-xl shadow-xl transition hover:shadow-red-600/20"
    >
      <div className="relative aspect-square overflow-hidden bg-transparent">
        <div className="h-full w-full transition-transform duration-300 ease-out group-hover:scale-[1.2]">
          <ImageCarousel
            slides={carouselSlides}
            alt={dropName}
            className="h-full w-full p-2"
            imageClassName="h-full w-full object-contain"
          />
        </div>
        {shirt.isMinted && (
          <span className="absolute right-2 top-2 rounded-full bg-emerald-600/90 px-2 py-0.5 text-xs font-medium text-white shadow-lg">
            Minted
          </span>
        )}
      </div>
      <div className="p-4 bg-black border-x border-b border-red-600/40 rounded-b-xl">
        <h3 className="font-semibold text-white truncate">{dropName}</h3>
        {subline ? (
          <p className="text-sm text-white/70 truncate">{subline}</p>
        ) : null}
        <div className="mt-2 flex items-center justify-between">
          <span className="rounded-full bg-red-600/20 px-2 py-0.5 text-xs font-medium text-red-400">
            Serial #{shirt.serial ?? "?"}
          </span>
          {!shirt.isMinted && (
            <span className="text-xs font-medium text-amber-400">Unminted</span>
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
        const isCurrentPackageShirt = shirtTypeLower
          ? typeLower === shirtTypeLower
          : typeLower.includes("::onchaindrips::shirt");
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
        const dropId =
          typeof fields?.drop_id === "string" ? fields.drop_id : "";
        if (!dropId) continue;
        const rawImageBlob = fields?.walrus_blob_id_image;
        const imageBlobId = walrusBlobIdToString(
          Array.isArray(rawImageBlob)
            ? rawImageBlob
            : typeof rawImageBlob === "string"
            ? rawImageBlob
            : null
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
      cursor = page.hasNextPage ? (page.nextCursor ?? undefined) : undefined;
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
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load shirts")
      )
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
        <p className="text-white/70">Sign in to view your dashboard.</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-500"
        >
          Home
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/" className="text-sm text-white/60 hover:text-white">
        ← Home
      </Link>
      <div className="mt-6 mb-6">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
      </div>
      {error ? (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : null}
      {loading ? (
        <div className="flex items-center gap-2">
          <div className="h-4 w-48 animate-pulse rounded bg-black/40" />
          <p className="text-sm text-white/50">Loading…</p>
        </div>
      ) : shirts.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/30 backdrop-blur-sm p-8 text-center">
          <p className="text-white/80">No shirts minted yet.</p>
          <p className="mt-1 text-sm text-white/60">
            Claim a shirt from a drop to see it here.
          </p>
          {!CURRENT_SHIRT_TYPE && (
            <p className="mt-3 text-xs text-amber-400">
              Set{" "}
              <code className="rounded bg-black/40 px-1 text-amber-300">
                NEXT_PUBLIC_PACKAGE_ID
              </code>{" "}
              in{" "}
              <code className="rounded bg-black/40 px-1 text-white/80">
                apps/web/.env.local
              </code>{" "}
              to show shirts from your deployed package.
            </p>
          )}
          {CURRENT_SHIRT_TYPE && (
            <p className="mt-3 text-xs text-white/50">
              Only shirts from the current app package are shown. If you just
              minted, ensure{" "}
              <code className="rounded bg-black/40 px-1 text-white/80">
                NEXT_PUBLIC_PACKAGE_ID
              </code>{" "}
              in the web app matches the package ID in your API{" "}
              <code className="rounded bg-black/40 px-1 text-white/80">
                .env
              </code>
              .
            </p>
          )}
          <Link
            href="/"
            className="mt-4 inline-block text-sm font-medium text-red-400 hover:text-red-300"
          >
            Browse drops →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shirts.map((s) => (
            <ShirtCard
              key={s.objectId}
              shirt={s}
              drop={
                drops.find(
                  (d) => d.object_id?.toLowerCase() === s.dropId.toLowerCase()
                ) ?? null
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
