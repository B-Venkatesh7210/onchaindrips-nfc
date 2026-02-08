"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ADMIN_ADDRESS,
  adminCreateDrop,
  adminMintShirts,
  uploadCarouselImageToSupabase,
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
      <span className="text-sm font-medium text-white/70">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <code className="flex-1 truncate rounded bg-black/40 border border-white/10 px-2 py-1.5 text-xs text-white/90 font-mono">
          {value || "—"}
        </code>
        <button
          type="button"
          onClick={copy}
          disabled={!value}
          className="rounded bg-white/10 px-2 py-1.5 text-xs font-medium text-white/90 hover:bg-white/20 disabled:opacity-50"
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
  const [dropReservationSlots, setDropReservationSlots] = useState("");
  const [dropBiddingEndsAt, setDropBiddingEndsAt] = useState("");
  const [dropReservationEvmRecipient, setDropReservationEvmRecipient] =
    useState("");
  const [dropSizeS, setDropSizeS] = useState("");
  const [dropSizeM, setDropSizeM] = useState("");
  const [dropSizeL, setDropSizeL] = useState("");
  const [dropSizeXL, setDropSizeXL] = useState("");
  const [dropSizeXXL, setDropSizeXXL] = useState("");
  const [dropCreating, setDropCreating] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [createdDropId, setCreatedDropId] = useState<string | null>(null);

  // Section 4: Mint shirts
  const [mintImageBlobId, setMintImageBlobId] = useState("");
  const [mintMetadataBlobId, setMintMetadataBlobId] = useState("");
  const [mintUploadedImage1File, setMintUploadedImage1File] = useState<File | null>(null);
  const [mintUploadedImage2File, setMintUploadedImage2File] = useState<File | null>(null);
  const [mintUploadedImage1Preview, setMintUploadedImage1Preview] = useState<string | null>(null);
  const [mintUploadedImage2Preview, setMintUploadedImage2Preview] = useState<string | null>(null);
  const [mintUploadedImage1Url, setMintUploadedImage1Url] = useState("");
  const [mintUploadedImage2Url, setMintUploadedImage2Url] = useState("");
  const [mintUploadedImageUploading, setMintUploadedImageUploading] = useState(false);
  const [mintSubmitting, setMintSubmitting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  /** After successful mint: shirt object IDs for NFC URL download. */
  const [mintedShirtIds, setMintedShirtIds] = useState<string[] | null>(null);
  /** Claim URL tokens (one per shirt) when API returns them; used for token-based NFC URLs. */
  const [claimTokens, setClaimTokens] = useState<
    { shirtObjectId: string; token: string }[] | null
  >(null);

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
      setMintImageBlobId(blobId);
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
      setMintMetadataBlobId(blobId);
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

  // Cleanup carousel image preview object URLs on unmount
  useEffect(() => {
    return () => {
      if (mintUploadedImage1Preview) URL.revokeObjectURL(mintUploadedImage1Preview);
      if (mintUploadedImage2Preview) URL.revokeObjectURL(mintUploadedImage2Preview);
    };
  }, [mintUploadedImage1Preview, mintUploadedImage2Preview]);

  // Sync metadata fields → drop details so filling metadata autofills drop section
  useEffect(() => {
    setDropName(metaDropName);
    setDropCompanyName(metaCompanyName);
    setDropEventName(metaEventName);
    setDropTotalSupply(metaTotalSupply);
    setDropReleaseDate(metaReleaseDate);
  }, [
    metaDropName,
    metaCompanyName,
    metaEventName,
    metaTotalSupply,
    metaReleaseDate,
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
        // Optional bidding / reservation config
        reservation_slots:
          Number(dropReservationSlots || "0") > 0
            ? Number(dropReservationSlots || "0")
            : 0,
        bidding_ends_at:
          dropBiddingEndsAt.trim() &&
          !Number.isNaN(Date.parse(dropBiddingEndsAt))
            ? new Date(dropBiddingEndsAt).toISOString()
            : undefined,
        reservation_evm_recipient:
          dropReservationEvmRecipient.trim() || undefined,
        // Optional per-size inventory
        size_s_total: Number(dropSizeS || "0") || 0,
        size_m_total: Number(dropSizeM || "0") || 0,
        size_l_total: Number(dropSizeL || "0") || 0,
        size_xl_total: Number(dropSizeXL || "0") || 0,
        size_xxl_total: Number(dropSizeXXL || "0") || 0,
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

  const uploadMintImages = useCallback(async (): Promise<[string, string] | null> => {
    if (!address || !mintUploadedImage1File || !mintUploadedImage2File) return null;
    setMintUploadedImageUploading(true);
    setMintError(null);
    try {
      const [r1, r2] = await Promise.all([
        uploadCarouselImageToSupabase(address, mintUploadedImage1File),
        uploadCarouselImageToSupabase(address, mintUploadedImage2File),
      ]);
      setMintUploadedImage1Url(r1.url);
      setMintUploadedImage2Url(r2.url);
      return [r1.url, r2.url];
    } catch (e) {
      setMintError(e instanceof Error ? e.message : "Supabase upload failed");
      return null;
    } finally {
      setMintUploadedImageUploading(false);
    }
  }, [address, mintUploadedImage1File, mintUploadedImage2File]);

  const mintShirts = useCallback(async () => {
    if (!address || !createdDropId) return;
    if (!mintImageBlobId.trim() || !mintMetadataBlobId.trim()) {
      setMintError("Image and metadata blob IDs are required");
      return;
    }
    if (!mintUploadedImage1File || !mintUploadedImage2File) {
      setMintError("Upload both carousel images (image 1 and image 2)");
      return;
    }
    setMintSubmitting(true);
    setMintError(null);
    setMintedShirtIds(null);
    try {
      let imageUrls: [string, string] =
        mintUploadedImage1Url && mintUploadedImage2Url
          ? [mintUploadedImage1Url, mintUploadedImage2Url]
          : (await uploadMintImages()) ?? (null as unknown as [string, string]);
      if (!imageUrls) {
        setMintError("Failed to upload carousel images");
        return;
      }
      const res = await adminMintShirts(address, createdDropId, {
        walrusBlobIdImage: mintImageBlobId.trim(),
        walrusBlobIdMetadata: mintMetadataBlobId.trim(),
        imageUrls,
      });
      setMintedShirtIds(res.shirtObjectIds ?? []);
      setClaimTokens(res.claimTokens ?? null);
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
    mintUploadedImage1File,
    mintUploadedImage2File,
    mintUploadedImage1Url,
    mintUploadedImage2Url,
    uploadMintImages,
  ]);

  const downloadNfcUrls = useCallback(() => {
    if (!createdDropId) return;
    const base =
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost:3000";
    const lines: string[] =
      claimTokens && claimTokens.length > 0
        ? claimTokens.map(
            ({ token }) => `${base}/${createdDropId}/${token.trim()}`
          )
        : (mintedShirtIds ?? []).map((id) => `${base}/${createdDropId}/${id}`);
    if (lines.length === 0) return;
    const blob = new Blob([lines.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nfc-urls-drop-${createdDropId.slice(
      0,
      10
    )}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [createdDropId, mintedShirtIds, claimTokens]);

  if (!address) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-white/70">Sign in to access this page.</p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm text-white/60 hover:text-white"
        >
          ← Home
        </Link>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-white/70">Admin only.</p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm text-white/60 hover:text-white"
        >
          ← Home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link
        href="/"
        className="text-sm text-white/60 hover:text-white"
      >
        ← Home
      </Link>
      <h1 className="mt-6 text-2xl font-bold text-white">
        Create a drop
      </h1>
      <p className="mt-1 text-sm text-white/60">
        Complete each section in order. After minting you’ll be redirected to
        the home page.
      </p>

      {/* Section 1: Image upload — form left, preview right */}
      <section className="mt-8 rounded-xl border border-white/10 bg-black/30 backdrop-blur-sm p-6">
        <h2 className="text-lg font-semibold text-white">
          1. NFT T-shirt image
        </h2>
        <p className="mt-1 text-sm text-white/60">
          Upload to Walrus; use the blob ID for minting.
        </p>
        <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="flex-1 space-y-3">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="block w-full text-sm text-white/80 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-white/20"
            />
            <button
              type="button"
              onClick={uploadImage}
              disabled={!imageFile || imageUploading}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              {imageUploading ? "Uploading…" : "Upload to Walrus"}
            </button>
            {imageError && (
              <p className="text-sm text-red-400">{imageError}</p>
            )}
            <CopyableBlobId label="Walrus blob ID (image)" value={imageBlobId} />
          </div>
          <div className="flex shrink-0 flex-col items-center lg:w-80">
            <p className="mb-2 text-xs font-medium text-white/50 uppercase tracking-wider">Preview</p>
            <div className="aspect-square w-full max-w-sm rounded-xl border border-white/10 bg-black/40 flex items-center justify-center overflow-hidden">
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="NFT preview"
                  className="h-full w-full object-contain p-2"
                />
              ) : (
                <span className="text-sm text-white/40">No image selected</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Metadata */}
      <section className="mt-8 rounded-xl border border-white/10 bg-black/30 backdrop-blur-sm p-6">
        <h2 className="text-lg font-semibold text-white">
          2. Metadata for NFT
        </h2>
        <p className="mt-1 text-sm text-white/60">
          Upload JSON to Walrus; use the blob ID for minting.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-white/70">
              Drop Name
            </label>
            <input
              type="text"
              value={metaDropName}
              onChange={(e) => setMetaDropName(e.target.value)}
              className="mt-1 w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/40"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-white/70">
              Company Name
            </label>
            <input
              type="text"
              value={metaCompanyName}
              onChange={(e) => setMetaCompanyName(e.target.value)}
              className="mt-1 w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/40"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-white/70">
              Event Name
            </label>
            <input
              type="text"
              value={metaEventName}
              onChange={(e) => setMetaEventName(e.target.value)}
              className="mt-1 w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/40"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-white/70">
              Release Date
            </label>
            <input
              type="date"
              value={metaReleaseDate}
              onChange={(e) => setMetaReleaseDate(e.target.value)}
              className="mt-1 w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/40 [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-white/70">
              Total Supply
            </label>
            <input
              type="number"
              min={1}
              value={metaTotalSupply}
              onChange={(e) => setMetaTotalSupply(e.target.value)}
              className="mt-1 w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/40"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={uploadMetadata}
          disabled={metadataUploading}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
        >
          {metadataUploading ? "Uploading…" : "Upload metadata to Walrus"}
        </button>
        {metadataError && (
          <p className="mt-2 text-sm text-red-400">{metadataError}</p>
        )}
        <CopyableBlobId
          label="Walrus blob ID (metadata)"
          value={metadataBlobId}
        />
      </section>

      {/* Section 3: Drop details (onchain + Supabase) */}
      <section className="mt-8 rounded-xl border border-white/10 bg-black/30 backdrop-blur-sm p-6">
        <h2 className="text-lg font-semibold text-white">
          3. Drop details
        </h2>
        <p className="mt-1 text-sm text-white/60">
          Creates the drop onchain and in the database.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-white/70">
              Drop Name
            </label>
            <input
              type="text"
              value={dropName}
              onChange={(e) => setDropName(e.target.value)}
              className="mt-1 w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/40"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-white/70">
              Company Name
            </label>
            <input
              type="text"
              value={dropCompanyName}
              onChange={(e) => setDropCompanyName(e.target.value)}
              className="mt-1 w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/40"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-white/70">
              Event Name
            </label>
            <input
              type="text"
              value={dropEventName}
              onChange={(e) => setDropEventName(e.target.value)}
              className="mt-1 w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/40"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-white/70">
              Total Supply
            </label>
            <input
              type="number"
              min={1}
              value={dropTotalSupply}
              onChange={(e) => setDropTotalSupply(e.target.value)}
              className="mt-1 w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/40"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-white/70">
              Release date
            </label>
            <input
              type="date"
              value={dropReleaseDate}
              onChange={(e) => setDropReleaseDate(e.target.value)}
              className="mt-1 w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/40 [color-scheme:dark]"
            />
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Bidding / reservations (optional)
            </h3>
            <p className="mt-1 text-xs text-white/60">
              Configure how many shirts can be pre-reserved via bidding and when
              bidding ends.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-white/70">
                  Reservation slots
                </label>
                <input
                  type="number"
                  min={0}
                  value={dropReservationSlots}
                  onChange={(e) => setDropReservationSlots(e.target.value)}
                  className="w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/40"
                  placeholder="0 (disable bidding)"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/70">
                  Bidding ends at
                </label>
                <input
                  type="datetime-local"
                  value={dropBiddingEndsAt}
                  onChange={(e) => setDropBiddingEndsAt(e.target.value)}
                  className="w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/40 [color-scheme:dark]"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-white/70">
                Reservation EVM recipient (organizer wallet)
              </label>
              <input
                type="text"
                value={dropReservationEvmRecipient}
                onChange={(e) => setDropReservationEvmRecipient(e.target.value)}
                className="w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/40"
                placeholder="0x..."
              />
            </div>
          </div>

          <div className="pt-2">
            <h3 className="text-sm font-semibold text-white">
              Size inventory (optional)
            </h3>
            <p className="mt-1 text-xs text-white/60">
              Specify how many shirts are available in each size for this drop.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div>
                <label className="mb-1 block text-xs font-medium text-white/70">
                  S
                </label>
                <input
                  type="number"
                  min={0}
                  value={dropSizeS}
                  onChange={(e) => setDropSizeS(e.target.value)}
                  className="w-full rounded border border-white/20 bg-black/40 px-2 py-1.5 text-xs text-white placeholder-white/40"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/70">
                  M
                </label>
                <input
                  type="number"
                  min={0}
                  value={dropSizeM}
                  onChange={(e) => setDropSizeM(e.target.value)}
                  className="w-full rounded border border-white/20 bg-black/40 px-2 py-1.5 text-xs text-white placeholder-white/40"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/70">
                  L
                </label>
                <input
                  type="number"
                  min={0}
                  value={dropSizeL}
                  onChange={(e) => setDropSizeL(e.target.value)}
                  className="w-full rounded border border-white/20 bg-black/40 px-2 py-1.5 text-xs text-white placeholder-white/40"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/70">
                  XL
                </label>
                <input
                  type="number"
                  min={0}
                  value={dropSizeXL}
                  onChange={(e) => setDropSizeXL(e.target.value)}
                  className="w-full rounded border border-white/20 bg-black/40 px-2 py-1.5 text-xs text-white placeholder-white/40"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/70">
                  XXL
                </label>
                <input
                  type="number"
                  min={0}
                  value={dropSizeXXL}
                  onChange={(e) => setDropSizeXXL(e.target.value)}
                  className="w-full rounded border border-white/20 bg-black/40 px-2 py-1.5 text-xs text-white placeholder-white/40"
                />
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3">
          <label className="text-sm font-medium text-white/70">
            Description
          </label>
          <textarea
            value={dropDescription}
            onChange={(e) => setDropDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/40"
          />
        </div>
        <button
          type="button"
          onClick={createDrop}
          disabled={dropCreating}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
        >
          {dropCreating ? "Creating…" : "Create drop onchain + Supabase"}
        </button>
        {dropError && <p className="mt-2 text-sm text-red-400">{dropError}</p>}
        {createdDropId && (
          <p className="mt-2 text-sm text-emerald-400">
            Drop created:{" "}
            <code className="rounded bg-black/40 px-1 text-white/90">{createdDropId}</code>
          </p>
        )}
      </section>

      {/* Section 4: Mint shirts */}
      <section className="mt-8 rounded-xl border border-white/10 bg-black/30 backdrop-blur-sm p-6">
        <h2 className="text-lg font-semibold text-white">
          4. Mint shirts
        </h2>
        <p className="mt-1 text-sm text-white/60">
          Mint total supply shirts onchain and save to Supabase. Paste blob IDs
          from sections 1 and 2.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-white/70">
              Walrus blob ID (image)
            </label>
            <input
              type="text"
              value={mintImageBlobId}
              onChange={(e) => setMintImageBlobId(e.target.value)}
              placeholder="Paste from section 1"
              className="mt-1 w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm font-mono text-white placeholder-white/40"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-white/70">
              Walrus blob ID (metadata)
            </label>
            <input
              type="text"
              value={mintMetadataBlobId}
              onChange={(e) => setMintMetadataBlobId(e.target.value)}
              placeholder="Paste from section 2"
              className="mt-1 w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm font-mono text-white placeholder-white/40"
            />
          </div>
        <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="flex-1 space-y-4">
            <div>
              <label className="text-sm font-medium text-white/70">
                Carousel image 1 (upload to Supabase Storage)
              </label>
              <p className="mt-0.5 text-xs text-white/60">
                Fallback when NFT image fails to load; also used in carousel.
              </p>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    setMintUploadedImage1Preview((prev) => {
                      if (prev) URL.revokeObjectURL(prev);
                      return f ? URL.createObjectURL(f) : null;
                    });
                    setMintUploadedImage1File(f ?? null);
                    if (!f) setMintUploadedImage1Url("");
                  }}
                  className="block w-full text-sm text-white/80 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-white/20"
                />
                {mintUploadedImage1Url && (
                  <span className="text-xs text-emerald-400 font-medium">Uploaded</span>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-white/70">
                Carousel image 2 (upload to Supabase Storage)
              </label>
              <p className="mt-0.5 text-xs text-white/60">
                Second slide in the image carousel.
              </p>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    setMintUploadedImage2Preview((prev) => {
                      if (prev) URL.revokeObjectURL(prev);
                      return f ? URL.createObjectURL(f) : null;
                    });
                    setMintUploadedImage2File(f ?? null);
                    if (!f) setMintUploadedImage2Url("");
                  }}
                  className="block w-full text-sm text-white/80 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-white/20"
                />
                {mintUploadedImage2Url && (
                  <span className="text-xs text-emerald-400 font-medium">Uploaded</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-center lg:w-80">
            <p className="mb-2 text-xs font-medium text-white/50 uppercase tracking-wider">Carousel preview</p>
            <div className="grid w-full max-w-sm grid-cols-2 gap-3">
              <div className="aspect-square rounded-xl border border-white/10 bg-black/40 flex items-center justify-center overflow-hidden">
                {mintUploadedImage1Preview ? (
                  <img
                    src={mintUploadedImage1Preview}
                    alt="Carousel 1"
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <span className="text-xs text-white/40 text-center px-2">Image 1</span>
                )}
              </div>
              <div className="aspect-square rounded-xl border border-white/10 bg-black/40 flex items-center justify-center overflow-hidden">
                {mintUploadedImage2Preview ? (
                  <img
                    src={mintUploadedImage2Preview}
                    alt="Carousel 2"
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <span className="text-xs text-white/40 text-center px-2">Image 2</span>
                )}
              </div>
            </div>
          </div>
        </div>
        </div>
        <button
          type="button"
          onClick={mintShirts}
          disabled={!createdDropId || mintSubmitting || mintUploadedImageUploading}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
        >
          {mintUploadedImageUploading
            ? "Uploading images…"
            : mintSubmitting
              ? "Minting…"
              : "Mint shirts onchain + Supabase"}
        </button>
        {mintError && <p className="mt-2 text-sm text-red-400">{mintError}</p>}
        {mintedShirtIds && mintedShirtIds.length > 0 && (
          <div className="mt-6 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
            <p className="font-medium text-emerald-300">Minting succeeded</p>
            <p className="mt-1 text-sm text-emerald-300">
              {mintedShirtIds.length} shirt(s) minted. Download a file with one
              URL per shirt to use in NFC tags.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={downloadNfcUrls}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Download NFC URLs (.txt)
              </button>
              <Link
                href="/"
                className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"
              >
                Go to Home
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
