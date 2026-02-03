"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getSuiClient, CURRENT_SHIRT_TYPE } from "@/lib/sui";
import { getStoredAddress, logout } from "@/lib/auth";

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

export default function MePage() {
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

  const handleLogout = useCallback(() => {
    logout();
    setAddress(null);
    setShirts([]);
  }, []);

  if (!address) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-neutral-50 p-4">
        <p className="text-neutral-600">Not logged in.</p>
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

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="max-w-lg mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <a href="/" className="text-neutral-500 hover:text-neutral-700 text-sm">
            ← Back
          </a>
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm text-neutral-500 hover:text-neutral-700"
          >
            Logout
          </button>
        </div>
        <h1 className="text-xl font-semibold text-neutral-800 mb-2">My Shirts</h1>
        <p className="text-neutral-500 text-sm mb-4 truncate" title={address}>
          {shortenAddress(address)}
        </p>
        {error ? <p className="text-red-600 text-sm mb-4">{error}</p> : null}
        {loading ? (
          <p className="text-neutral-500">Loading…</p>
        ) : shirts.length === 0 ? (
          <p className="text-neutral-500">No shirts owned.</p>
        ) : (
          <ul className="space-y-3">
            {shirts.map((s) => (
              <li key={s.objectId}>
                <a
                  href={`/s/${s.objectId}`}
                  className="block bg-white rounded-lg border border-neutral-200 p-4 shadow-sm hover:border-neutral-300"
                >
                  <span className="font-medium text-neutral-800">Shirt #{s.serial ?? "?"}</span>
                  <span className="text-neutral-500 text-sm ml-2">
                    {s.isMinted ? "Minted" : "Unminted"}
                  </span>
                  <p className="text-neutral-400 text-xs mt-1 truncate">{s.objectId}</p>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
