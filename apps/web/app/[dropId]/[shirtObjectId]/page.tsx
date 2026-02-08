"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ShirtPageContent from "@/app/components/ShirtPageContent";
import { resolveClaimToken } from "@/lib/api";

/** Sui object ID: 0x + 64 hex chars. */
function isSuiObjectId(segment: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(segment);
}

/**
 * NFC URL route: /{dropId}/{shirtObjectIdOrToken}
 * Segment can be a shirt object ID (legacy) or a short claim token (≤14 chars) for NFC tags.
 * Renders the shirt claim page at this URL (no redirect).
 */
export default function NfcShirtPage() {
  const params = useParams();
  const dropId = typeof params.dropId === "string" ? params.dropId : "";
  const segment = typeof params.shirtObjectId === "string" ? params.shirtObjectId : "";
  const [resolvedShirtId, setResolvedShirtId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const resolveSegment = useCallback(async () => {
    if (!segment) return;
    if (isSuiObjectId(segment)) {
      setResolvedShirtId(segment);
      setResolveError(null);
      return;
    }
    if (!dropId) {
      setResolveError("Invalid URL.");
      return;
    }
    try {
      const { shirtObjectId } = await resolveClaimToken(dropId, segment);
      setResolvedShirtId(shirtObjectId);
      setResolveError(null);
    } catch (e) {
      setResolveError(e instanceof Error ? e.message : "Invalid claim URL");
      setResolvedShirtId(null);
    }
  }, [dropId, segment]);

  useEffect(() => {
    resolveSegment();
  }, [resolveSegment]);

  if (!segment) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4">
        <p className="text-white/70">Invalid shirt URL.</p>
      </div>
    );
  }

  if (resolveError) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4">
        <p className="text-white/70">{resolveError}</p>
      </div>
    );
  }

  if (!resolvedShirtId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4">
        <p className="text-white/70">Loading…</p>
      </div>
    );
  }

  const returnToPath = dropId && segment ? `/${dropId}/${segment}` : "/";

  return (
    <ShirtPageContent
      shirtObjectId={resolvedShirtId}
      dropId={dropId || undefined}
      returnToPath={returnToPath}
    />
  );
}
