"use client";

import { useParams } from "next/navigation";
import ShirtPageContent from "@/app/components/ShirtPageContent";

/**
 * NFC URL route: /{dropId}/{shirtObjectId}
 * Renders the shirt claim page at this URL (no redirect).
 */
export default function NfcShirtPage() {
  const params = useParams();
  const dropId = typeof params.dropId === "string" ? params.dropId : "";
  const shirtObjectId = typeof params.shirtObjectId === "string" ? params.shirtObjectId : "";
  const returnToPath = dropId && shirtObjectId ? `/${dropId}/${shirtObjectId}` : "/";

  if (!shirtObjectId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4">
        <p className="text-neutral-500">Invalid shirt URL.</p>
      </div>
    );
  }

  return (
    <ShirtPageContent
      shirtObjectId={shirtObjectId}
      dropId={dropId || undefined}
      returnToPath={returnToPath}
    />
  );
}
