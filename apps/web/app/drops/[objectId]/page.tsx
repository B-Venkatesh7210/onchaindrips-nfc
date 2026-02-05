"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { fetchDrops, type DropRow } from "@/lib/api";

export default function DropDetailPage() {
  const params = useParams();
  const objectId = typeof params.objectId === "string" ? params.objectId : "";
  const [drop, setDrop] = useState<DropRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!objectId) return;
    setLoading(true);
    try {
      const drops = await fetchDrops();
      const found = drops.find((d) => d.object_id === objectId) ?? null;
      setDrop(found);
    } catch {
      setDrop(null);
    } finally {
      setLoading(false);
    }
  }, [objectId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!objectId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-neutral-500">Invalid drop.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-neutral-600 hover:text-neutral-900">← Home</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="h-8 w-48 animate-pulse rounded bg-neutral-200" />
        <div className="mt-4 h-4 w-full animate-pulse rounded bg-neutral-100" />
      </div>
    );
  }

  if (!drop) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-neutral-500">Drop not found.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-neutral-600 hover:text-neutral-900">← Home</Link>
      </div>
    );
  }

  const minted = Number(drop.minted_count ?? 0);
  const total = Number(drop.total_supply ?? 0);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-700">← Back to drops</Link>
      <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-6">
        <h1 className="text-2xl font-bold text-neutral-900">{drop.name}</h1>
        <p className="mt-1 text-neutral-600">{drop.company_name}</p>
        <p className="text-sm text-neutral-500">{drop.event_name}</p>
        <div className="mt-4 flex items-center gap-4">
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-700">
            {minted} / {total} minted
          </span>
          {drop.release_date && (
            <span className="text-sm text-neutral-500">Release: {drop.release_date}</span>
          )}
        </div>
        {(drop.description ?? (drop.offchain_attributes && typeof drop.offchain_attributes === "object" && "description" in drop.offchain_attributes ? (drop.offchain_attributes as { description?: string }).description : null)) && (
          <p className="mt-4 text-neutral-600 text-sm">
            {String(drop.description ?? ((drop.offchain_attributes as { description?: string })?.description ?? ""))}
          </p>
        )}
      </div>
    </div>
  );
}
