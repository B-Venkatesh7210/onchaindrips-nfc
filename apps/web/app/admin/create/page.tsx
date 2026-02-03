"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  ADMIN_ADDRESS,
  adminCreateDrop,
  adminMintShirts,
  uploadImageToWalrus,
  uploadMetadataToWalrus,
} from "@/lib/api";
import { getStoredAddress } from "@/lib/auth";

function normalizeAddress(a: string): string {
  return a.toLowerCase().trim();
}

function CopyableBlobId({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);
  return (
    <div className="mt-2">
      <span className="text-sm font-medium text-neutral-600">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <code className="flex-1 truncate rounded bg-neutral-100 px-2 py-1.5 text-xs text-neutral-800">
          {value || "—"}
        </code>
        <button
          type="button"
          onClick={copy}
          disabled={!value}
          className="rounded bg-neutral-200 px-2 py-1.5 text-xs font-medium hover:bg-neutral-300 disabled:opacity-50"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export default function AdminCreateDropPage() {
  const router = useRouter();
  const address = getStoredAddress();
  const isAdmin =
    address && normalizeAddress(address) === normalizeAddress(ADMIN_ADDRESS);

  // Section 1: Image upload
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBlobId, setImageBlobId] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // Section 2: Metadata (for Walrus)
  const [metaDropName, setMetaDropName] = useState("");
  const [metaCompanyName, setMetaCompanyName] = useState("");
  const [metaEventName, setMetaEventName] = useState("");
  const [metaReleaseDate, setMetaReleaseDate] = useState("");
  const [metaTotalSupply, setMetaTotalSupply] = useState("");
  const [metadataBlobId, setMetadataBlobId] = useState("");
  const [metadataUploading, setMetadataUploading] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  // Section 3: Drop details (onchain + Supabase)
  const [dropName, setDropName] = useState("");
  const [dropCompanyName, setDropCompanyName] = useState("");
  const [dropEventName, setDropEventName] = useState("");
  const [dropTotalSupply, setDropTotalSupply] = useState("");
  const [dropDescription, setDropDescription] = useState("");
  const [dropReleaseDate, setDropReleaseDate] = useState("");
  const [dropCreating, setDropCreating] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [createdDropId, setCreatedDropId] = useState<string | null>(null);

  // Section 4: Mint shirts
  const [mintImageBlobId, setMintImageBlobId] = useState("");
  const [mintMetadataBlobId, setMintMetadataBlobId] = useState("");
  const [mintGifUrl, setMintGifUrl] = useState("");
  const [mintImageUrls, setMintImageUrls] = useState("");
  const [mintSubmitting, setMintSubmitting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);

  const handleImageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      setImageFile(file ?? null);
      setImageBlobId("");
      setImageError(null);
      if (file) {
        const url = URL.createObjectURL(file);
        setImagePreview(url);
        return () => URL.revokeObjectURL(url);
      }
      setImagePreview(null);
    },
    []
  );

  const uploadImage = useCallback(async () => {
    if (!imageFile || !address) return;
    setImageUploading(true);
    setImageError(null);
    try {
      const { blobId } = await uploadImageToWalrus(imageFile);
      setImageBlobId(blobId);
    } catch (e) {
      setImageError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setImageUploading(false);
    }
  }, [imageFile, address]);

  const uploadMetadata = useCallback(async () => {
    if (!address) return;
    setMetadataUploading(true);
    setMetadataError(null);
    try {
      const totalSupply = parseInt(metaTotalSupply, 10);
      const metadata = {
        name: metaDropName || "Drop",
        company_name: metaCompanyName,
        event_name: metaEventName,
        release_date: metaReleaseDate || undefined,
        total_supply: Number.isNaN(totalSupply) ? undefined : totalSupply,
      };
      const { blobId } = await uploadMetadataToWalrus(metadata);
      setMetadataBlobId(blobId);
    } catch (e) {
      setMetadataError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setMetadataUploading(false);
    }
  }, [
    address,
    metaDropName,
    metaCompanyName,
    metaEventName,
    metaReleaseDate,
    metaTotalSupply,
  ]);

  const createDrop = useCallback(async () => {
    if (!address) return;
    const totalSupply = parseInt(dropTotalSupply, 10);
    if (Number.isNaN(totalSupply) || totalSupply < 1) {
      setDropError("Total supply must be a positive number");
      return;
    }
    setDropCreating(true);
    setDropError(null);
    try {
      const res = await adminCreateDrop(address, {
        name: dropName.trim() || "Drop",
        company_name: dropCompanyName.trim(),
        event_name: dropEventName.trim(),
        total_supply: totalSupply,
        description: dropDescription.trim() || undefined,
        release_date:
          dropReleaseDate.trim() &&
          /^\d{4}-\d{2}-\d{2}$/.test(dropReleaseDate.trim())
            ? dropReleaseDate.trim()
            : undefined,
      });
      setCreatedDropId(res.dropObjectId);
    } catch (e) {
      setDropError(e instanceof Error ? e.message : "Create drop failed");
    } finally {
      setDropCreating(false);
    }
  }, [
    address,
    dropName,
    dropCompanyName,
    dropEventName,
    dropTotalSupply,
    dropDescription,
    dropReleaseDate,
  ]);

  const mintShirts = useCallback(async () => {
    if (!address || !createdDropId) return;
    if (!mintImageBlobId.trim() || !mintMetadataBlobId.trim()) {
      setMintError("Image and metadata blob IDs are required");
      return;
    }
    setMintSubmitting(true);
    setMintError(null);
    try {
      const imageUrls = mintImageUrls
        .split(/[\n,]/)
        .map((u) => u.trim())
        .filter(Boolean);
      await adminMintShirts(address, createdDropId, {
        walrusBlobIdImage: mintImageBlobId.trim(),
        walrusBlobIdMetadata: mintMetadataBlobId.trim(),
        gifUrl: mintGifUrl.trim() || undefined,
        imageUrls: imageUrls.length ? imageUrls : undefined,
      });
      router.push("/");
    } catch (e) {
      setMintError(e instanceof Error ? e.message : "Mint failed");
    } finally {
      setMintSubmitting(false);
    }
  }, [
    address,
    createdDropId,
    mintImageBlobId,
    mintMetadataBlobId,
    mintGifUrl,
    mintImageUrls,
    router,
  ]);

  if (!address) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-neutral-600">Sign in to access this page.</p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm text-neutral-500 hover:text-neutral-700"
        >
          ← Home
        </Link>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-neutral-600">Admin only.</p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm text-neutral-500 hover:text-neutral-700"
        >
          ← Home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/"
        className="text-sm text-neutral-500 hover:text-neutral-700"
      >
        ← Home
      </Link>
      <h1 className="mt-6 text-2xl font-bold text-neutral-900">
        Create a drop
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        Complete each section in order. After minting you’ll be redirected to
        the home page.
      </p>

      {/* Section 1: Image upload */}
      <section className="mt-8 rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-neutral-800">
          1. NFT T-shirt image
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Upload to Walrus; use the blob ID for minting.
        </p>
        <div className="mt-4">
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="text-sm"
          />
          {imagePreview && (
            <div className="mt-3">
              <img
                src={imagePreview}
                alt="Preview"
                className="max-h-48 rounded-lg border border-neutral-200 object-contain"
              />
            </div>
          )}
          <button
            type="button"
            onClick={uploadImage}
            disabled={!imageFile || imageUploading}
            className="mt-3 rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {imageUploading ? "Uploading…" : "Upload to Walrus"}
          </button>
          {imageError && (
            <p className="mt-2 text-sm text-red-600">{imageError}</p>
          )}
          <CopyableBlobId label="Walrus blob ID (image)" value={imageBlobId} />
        </div>
      </section>

      {/* Section 2: Metadata */}
      <section className="mt-8 rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-neutral-800">
          2. Metadata for NFT
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Upload JSON to Walrus; use the blob ID for minting.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-neutral-600">
              Drop Name
            </label>
            <input
              type="text"
              value={metaDropName}
              onChange={(e) => setMetaDropName(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-600">
              Company Name
            </label>
            <input
              type="text"
              value={metaCompanyName}
              onChange={(e) => setMetaCompanyName(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-600">
              Event Name
            </label>
            <input
              type="text"
              value={metaEventName}
              onChange={(e) => setMetaEventName(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-600">
              Release Date
            </label>
            <input
              type="text"
              value={metaReleaseDate}
              onChange={(e) => setMetaReleaseDate(e.target.value)}
              placeholder="e.g. 2025-02-01"
              className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-600">
              Total Supply
            </label>
            <input
              type="number"
              min={1}
              value={metaTotalSupply}
              onChange={(e) => setMetaTotalSupply(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={uploadMetadata}
          disabled={metadataUploading}
          className="mt-4 rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {metadataUploading ? "Uploading…" : "Upload metadata to Walrus"}
        </button>
        {metadataError && (
          <p className="mt-2 text-sm text-red-600">{metadataError}</p>
        )}
        <CopyableBlobId
          label="Walrus blob ID (metadata)"
          value={metadataBlobId}
        />
      </section>

      {/* Section 3: Drop details (onchain + Supabase) */}
      <section className="mt-8 rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-neutral-800">
          3. Drop details
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Creates the drop onchain and in the database.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-neutral-600">
              Drop Name
            </label>
            <input
              type="text"
              value={dropName}
              onChange={(e) => setDropName(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-600">
              Company Name
            </label>
            <input
              type="text"
              value={dropCompanyName}
              onChange={(e) => setDropCompanyName(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-600">
              Event Name
            </label>
            <input
              type="text"
              value={dropEventName}
              onChange={(e) => setDropEventName(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-600">
              Total Supply
            </label>
            <input
              type="number"
              min={1}
              value={dropTotalSupply}
              onChange={(e) => setDropTotalSupply(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-600">
              Release date
            </label>
            <input
              type="date"
              value={dropReleaseDate}
              onChange={(e) => setDropReleaseDate(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="text-sm font-medium text-neutral-600">
            Description
          </label>
          <textarea
            value={dropDescription}
            onChange={(e) => setDropDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={createDrop}
          disabled={dropCreating}
          className="mt-4 rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {dropCreating ? "Creating…" : "Create drop onchain + Supabase"}
        </button>
        {dropError && <p className="mt-2 text-sm text-red-600">{dropError}</p>}
        {createdDropId && (
          <p className="mt-2 text-sm text-emerald-600">
            Drop created:{" "}
            <code className="rounded bg-neutral-100 px-1">{createdDropId}</code>
          </p>
        )}
      </section>

      {/* Section 4: Mint shirts */}
      <section className="mt-8 rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-neutral-800">
          4. Mint shirts
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Mint total supply shirts onchain and save to Supabase. Paste blob IDs
          from sections 1 and 2.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-neutral-600">
              Walrus blob ID (image)
            </label>
            <input
              type="text"
              value={mintImageBlobId}
              onChange={(e) => setMintImageBlobId(e.target.value)}
              placeholder="Paste from section 1"
              className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-600">
              Walrus blob ID (metadata)
            </label>
            <input
              type="text"
              value={mintMetadataBlobId}
              onChange={(e) => setMintMetadataBlobId(e.target.value)}
              placeholder="Paste from section 2"
              className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-600">
              GIF URL (Supabase offchain)
            </label>
            <input
              type="text"
              value={mintGifUrl}
              onChange={(e) => setMintGifUrl(e.target.value)}
              placeholder="https://…"
              className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-neutral-600">
              Image URLs (Supabase offchain, one per line or comma-separated)
            </label>
            <textarea
              value={mintImageUrls}
              onChange={(e) => setMintImageUrls(e.target.value)}
              rows={3}
              placeholder="https://…"
              className="mt-1 w-full rounded border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={mintShirts}
          disabled={!createdDropId || mintSubmitting}
          className="mt-4 rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {mintSubmitting ? "Minting…" : "Mint shirts onchain + Supabase"}
        </button>
        {mintError && <p className="mt-2 text-sm text-red-600">{mintError}</p>}
      </section>
    </div>
  );
}
