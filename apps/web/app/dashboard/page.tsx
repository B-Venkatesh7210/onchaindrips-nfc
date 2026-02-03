"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getSuiClient, CURRENT_SHIRT_TYPE } from "@/lib/sui";
import { getStoredAddress } from "@/lib/auth";

type ShirtSummary = {
  objectId: string;
  type: string;
  serial?: number;
  isMinted?: boolean;
};

function shortenAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-8)}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [address, setAddress] = useState<string | null>(null);
  const [shirts, setShirts] = useState<ShirtSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOwnedShirts = useCallback(async (owner: string) => {
    const client = getSuiClient();
    const page = await client.getOwnedObjects({
      owner,
      options: { showContent: true, showType: true },
    });
    const items: ShirtSummary[] = [];
    for (const obj of page.data) {
      const type = obj.data?.type;
      if (!type) continue;
      if (CURRENT_SHIRT_TYPE ? type.toLowerCase() !== CURRENT_SHIRT_TYPE : !type.includes("::onchaindrips::Shirt")) continue;
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
      items.push({
        objectId: obj.data?.objectId ?? "",
        type,
        serial: Number.isNaN(serial) ? undefined : serial,
        isMinted,
      });
    }
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
    <div className="mx-auto max-w-2xl px-4 py-8">
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
          <Link href="/" className="mt-4 inline-block text-sm font-medium text-neutral-700 hover:text-neutral-900">
            Browse drops →
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {shirts.map((s) => (
            <li key={s.objectId}>
              <Link
                href={`/s/${s.objectId}`}
                className="block rounded-lg border border-neutral-200 bg-white p-4 shadow-sm hover:border-neutral-300"
              >
                <span className="font-medium text-neutral-800">Shirt #{s.serial ?? "?"}</span>
                <span className="ml-2 text-sm text-neutral-500">{s.isMinted ? "Minted" : "Unminted"}</span>
                <p className="mt-1 truncate text-xs text-neutral-400">{s.objectId}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
