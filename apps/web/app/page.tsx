"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchDrops, type DropRow } from "@/lib/api";

function DropCard({ drop }: { drop: DropRow }) {
  const minted = Number(drop.minted_count ?? 0);
  const total = Number(drop.total_supply ?? 0);
  const today = new Date();
  const todayStr =
    today.getFullYear() +
    "-" +
    String(today.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(today.getDate()).padStart(2, "0");
  const releaseDatePassed =
    !drop.release_date?.trim() || drop.release_date.trim() <= todayStr;
  const isReleased = total > 0 && minted > 0 && releaseDatePassed;
  const [imageError, setImageError] = useState(false);
  const imageBlobId = drop.image_blob_id?.trim();
  const imageSrc = imageBlobId
    ? `/api/walrus/${encodeURIComponent(imageBlobId)}`
    : null;

  return (
    <Link
      href={`/drops/${encodeURIComponent(drop.object_id)}`}
      className="group block overflow-hidden rounded-xl shadow-xl transition hover:shadow-red-600/20"
    >
      <div className="relative aspect-square bg-transparent">
        {imageSrc && !imageError ? (
          <img
            src={imageSrc}
            alt={drop.name}
            className="h-full w-full object-contain p-2"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/50 text-sm bg-transparent">
            {imageSrc ? "Image unavailable" : "No image"}
          </div>
        )}
      </div>
      <div className="p-4 bg-black border-x border-b border-red-600/40 rounded-b-xl">
        <h3 className="font-semibold text-white truncate">{drop.name}</h3>
        <p className="text-sm text-white/70 truncate">{drop.company_name}</p>
        <p className="mt-1 text-xs text-white/50">{drop.event_name}</p>
        <div className="mt-2 flex items-center justify-between">
          <span className="rounded-full bg-red-600/20 px-2 py-0.5 text-xs font-medium text-red-400">
            {minted} / {total} minted
          </span>
          <span
            className={`text-xs font-medium ${
              isReleased ? "text-emerald-400" : "text-amber-400"
            }`}
          >
            {isReleased ? "Released" : "Coming soon"}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const [drops, setDrops] = useState<DropRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDrops();
      setDrops(data);
    } catch {
      setDrops([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Drops</h1>
        <p className="mt-1 text-white/70">
          Latest NFT drops — claim your shirt when a drop is live.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="aspect-square animate-pulse rounded-xl bg-black/40"
            />
          ))}
        </div>
      ) : drops.length === 0 ? (
        <div className="rounded-xl border border-red-600/20 bg-black/60 backdrop-blur-sm p-12 text-center">
          <p className="text-white/80">No drops yet.</p>
          <p className="mt-1 text-sm text-white/50">
            Check back later or sign in as admin to create a drop.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {drops.map((drop) => (
            <DropCard key={drop.object_id} drop={drop} />
          ))}
        </div>
      )}
    </div>
  );
}
