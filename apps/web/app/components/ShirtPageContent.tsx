"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchShirt,
  fetchDrops,
  claimShirt,
  fetchWalrusBlob,
  walrusBlobIdToString,
  fetchShirtProfile,
  saveShirtProfile,
  uploadImageToWalrus,
  type ShirtResponse,
  type DropRow,
  type ShirtProfile,
} from "@/lib/api";
import { ImageCarousel } from "@/app/components/ImageCarousel";
import { connectWalletAndLoadEnsProfile, hasEvmProvider } from "@/lib/ens";
import { getStoredAddress, loginWithGoogle } from "@/lib/auth";

function formatDate(ms: number | null): string {
  if (ms == null) return "—";
  try {
    return new Date(Number(ms)).toLocaleString();
  } catch {
    return "—";
  }
}

function shortenAddress(addr: string | null): string {
  if (!addr) return "—";
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-8)}`;
}

function normalizeAddress(a: string): string {
  return a.toLowerCase().trim();
}

function isOwner(
  userAddress: string | null,
  shirtOwner: string | null
): boolean {
  if (!userAddress || !shirtOwner) return false;
  return normalizeAddress(userAddress) === normalizeAddress(shirtOwner);
}

const SUI_EXPLORER_BASE =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_SUI_EXPLORER_URL
    ? process.env.NEXT_PUBLIC_SUI_EXPLORER_URL
    : "https://suiexplorer.com/txblock";
const SUI_NETWORK =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_SUI_NETWORK
    ? process.env.NEXT_PUBLIC_SUI_NETWORK
    : "testnet";

function explorerTxUrl(digest: string): string {
  return `${SUI_EXPLORER_BASE}/${digest}?network=${SUI_NETWORK}`;
}

type Props = {
  shirtObjectId: string;
  dropId?: string;
  returnToPath: string;
};

export default function ShirtPageContent({
  shirtObjectId,
  dropId,
  returnToPath,
}: Props) {
  const router = useRouter();
  const objectId = shirtObjectId;

  const [shirt, setShirt] = useState<ShirtResponse | null>(null);
  const [drop, setDrop] = useState<DropRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);
  const [mintTxDigest, setMintTxDigest] = useState<string | null>(null);
  const [walrusMetadata, setWalrusMetadata] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [profile, setProfile] = useState<ShirtProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileDraft, setProfileDraft] = useState<Record<string, string>>({});
  const [ensLoading, setEnsLoading] = useState(false);
  const [ensError, setEnsError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const loadShirt = useCallback(async () => {
    if (!objectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchShirt(objectId);
      setShirt(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load shirt");
      setShirt(null);
    } finally {
      setLoading(false);
    }
  }, [objectId]);

  useEffect(() => {
    loadShirt();
  }, [loadShirt]);

  useEffect(() => {
    if (!dropId) return;
    let cancelled = false;
    fetchDrops().then((drops) => {
      if (cancelled) return;
      const normalized = dropId.toLowerCase().trim();
      const found =
        drops.find((d) => d.object_id?.toLowerCase() === normalized) ?? null;
      setDrop(found);
    });
    return () => {
      cancelled = true;
    };
  }, [dropId]);

  useEffect(() => {
    if (!shirt) return;
    const blobId = walrusBlobIdToString(shirt.walrus_blob_id_metadata);
    if (!blobId) {
      setWalrusMetadata(null);
      return;
    }
    let cancelled = false;
    fetchWalrusBlob(blobId).then((data) => {
      if (!cancelled && data) setWalrusMetadata(data);
    });
    return () => {
      cancelled = true;
    };
  }, [shirt?.objectId, shirt?.walrus_blob_id_metadata]);

  useEffect(() => {
    setUserAddress(getStoredAddress());
  }, []);

  // Load profile from Supabase (if any) once we know the shirt is minted.
  useEffect(() => {
    if (!shirt?.is_minted) return;
    let cancelled = false;
    setProfileLoading(true);
    setProfileError(null);
    fetchShirtProfile(objectId)
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        if (p?.fields && typeof p.fields === "object") {
          const flat: Record<string, string> = {};
          for (const [k, v] of Object.entries(p.fields)) {
            if (v == null) continue;
            flat[k] = String(v);
          }
          setProfileDraft(flat);
        }
      })
      .catch((e) => {
        if (!cancelled)
          setProfileError(
            e instanceof Error ? e.message : "Failed to load profile"
          );
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [objectId, shirt?.is_minted]);

  const handleLogin = useCallback(async () => {
    try {
      const rpcUrl =
        process.env.NEXT_PUBLIC_SUI_RPC_URL ||
        "https://fullnode.testnet.sui.io";
      await loginWithGoogle(rpcUrl, returnToPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    }
  }, [returnToPath]);

  const handleMint = useCallback(async () => {
    if (!shirt || shirt.is_minted || !userAddress) return;
    setMinting(true);
    setError(null);
    try {
      const { digest } = await claimShirt(objectId, userAddress);
      setMintTxDigest(digest);
      await loadShirt();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mint failed");
    } finally {
      setMinting(false);
    }
  }, [shirt, userAddress, objectId, loadShirt]);

  const handleStartProfileEdit = useCallback(() => {
    if (profile?.fields && Object.keys(profile.fields).length > 0) {
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(profile.fields)) {
        if (v == null) continue;
        flat[k] = String(v);
      }
      setProfileDraft(flat);
    } else if (Object.keys(profileDraft).length === 0) {
      setProfileDraft({
        name: "",
        avatar: "",
        company: "",
        role: "",
        telegram: "",
        twitter: "",
        email: "",
        website: "",
        github: "",
        description: "",
      });
    }
    setProfileEditing(true);
  }, [profile, profileDraft]);

  const handleProfileFieldChange = useCallback((key: string, value: string) => {
    setProfileDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleAvatarUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      e.target.value = "";
      setProfileError(null);
      setAvatarUploading(true);
      try {
        const { blobId } = await uploadImageToWalrus(file);
        const origin =
          typeof window !== "undefined" ? window.location.origin : "";
        const avatarUrl = `${origin}/api/walrus/${encodeURIComponent(blobId)}`;
        setProfileDraft((prev) => ({ ...prev, avatar: avatarUrl }));
      } catch (err) {
        setProfileError(
          err instanceof Error ? err.message : "Failed to upload photo"
        );
      } finally {
        setAvatarUploading(false);
      }
    },
    []
  );

  const handleSaveProfile = useCallback(async () => {
    if (!shirt?.owner || !userAddress || !isOwner(userAddress, shirt.owner))
      return;
    setProfileError(null);
    setProfileLoading(true);
    try {
      const nextProfile: ShirtProfile = {
        ...(profile ?? {}),
        fields: { ...(profile?.fields ?? {}), ...profileDraft },
      };
      // Once user saves via the UI, treat the profile as editable even if it was
      // originally populated from ENS.
      if (nextProfile.ens_locked) {
        nextProfile.ens_locked = false;
      }
      const saved = await saveShirtProfile(objectId, userAddress, nextProfile);
      setProfile(saved);
      setProfileEditing(false);
    } catch (e) {
      setProfileError(
        e instanceof Error ? e.message : "Failed to save details"
      );
    } finally {
      setProfileLoading(false);
    }
  }, [shirt?.owner, userAddress, profile, profileDraft, objectId]);

  const handleConnectEns = useCallback(async () => {
    if (!shirt?.owner || !userAddress || !isOwner(userAddress, shirt.owner))
      return;
    setEnsError(null);
    setProfileError(null);
    setEnsLoading(true);
    try {
      const { ensName, records } = await connectWalletAndLoadEnsProfile();

      const fieldsFromEns: Record<string, string> = {};
      console.log("ens details", fieldsFromEns, records);
      // Map common ENS records to our friendly keys
      if (ensName) fieldsFromEns.name = ensName;
      if (records["avatar"]) fieldsFromEns.avatar = records["avatar"];
      if (records["description"])
        fieldsFromEns.description = records["description"];
      if (records["url"]) fieldsFromEns.website = records["url"];
      if (records["com.twitter"])
        fieldsFromEns.twitter = records["com.twitter"];
      if (records["com.telegram"])
        fieldsFromEns.telegram = records["com.telegram"];
      if (records["com.github"]) fieldsFromEns.github = records["com.github"];
      if (records["email"]) fieldsFromEns.email = records["email"];
      // Any ENS key not in the list above becomes an extra field (so nothing is dropped)
      const mappedKeys = [
        "description",
        "url",
        "com.twitter",
        "com.telegram",
        "com.github",
        "email",
        "avatar",
      ];
      for (const [key, value] of Object.entries(records)) {
        if (!value) continue;
        if (mappedKeys.includes(key)) continue;
        fieldsFromEns[`ens:${key}`] = value;
      }

      // Merge ENS-derived fields into the draft so user can review / add more before saving.
      setProfileDraft((prev) => ({ ...prev, ...fieldsFromEns }));
      setProfile((prev) => ({
        ...(prev ?? {}),
        ens_name: ensName,
        ens_locked: false,
        fields: { ...(prev?.fields ?? {}), ...fieldsFromEns },
      }));
      setProfileEditing(true);
    } catch (e) {
      setEnsError(
        e instanceof Error ? e.message : "Failed to load ENS records"
      );
    } finally {
      setEnsLoading(false);
    }
  }, [shirt?.owner, userAddress, objectId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <p className="text-neutral-500">Loading…</p>
      </div>
    );
  }

  if (error && !shirt) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-neutral-50 p-4">
        <p className="text-red-600">{error}</p>
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

  if (!shirt) {
    return null;
  }

  const toImageUrl = (value: string): string => {
    const v = value.trim();
    if (/^https?:\/\//i.test(v)) return v;
    return `/api/walrus/${encodeURIComponent(v)}`;
  };
  const shirtCarouselSlides = (): import("@/app/components/ImageCarousel").CarouselSlide[] => {
    if (drop) {
      const nft = drop.image_blob_id?.trim();
      const u1 = drop.uploaded_image_1?.trim();
      const u2 = drop.uploaded_image_2?.trim();
      const slide1 = nft
        ? u1
          ? { primary: toImageUrl(nft), fallback: toImageUrl(u1) }
          : toImageUrl(nft)
        : u1
          ? toImageUrl(u1)
          : null;
      const slide2 = u2 ? toImageUrl(u2) : null;
      return [slide1, slide2].filter(Boolean) as import("@/app/components/ImageCarousel").CarouselSlide[];
    }
    const nft = walrusBlobIdToString(shirt.walrus_blob_id_image);
    return nft ? [toImageUrl(nft)] : [];
  };
  const totalSupply = drop ? Number(drop.total_supply ?? 0) : 0;
  const mintedCount = drop ? Number(drop.minted_count ?? 0) : 0;
  const remaining = Math.max(0, totalSupply - mintedCount);
  const dropName =
    drop?.name ??
    (walrusMetadata && typeof walrusMetadata.name === "string"
      ? walrusMetadata.name
      : "Drop");
  const description =
    drop?.description?.trim() ||
    (walrusMetadata && typeof walrusMetadata.description === "string"
      ? walrusMetadata.description
      : null);

  const viewUnminted = !shirt.is_minted;
  const viewOwner = shirt.is_minted && isOwner(userAddress, shirt.owner);
  const viewNonOwner = shirt.is_minted && !viewOwner;
  const claimTxDigest = mintTxDigest ?? shirt.claim_tx_digest ?? null;

  return (
    <div className="min-h-screen bg-neutral-100 py-8 px-4">
      <div className="max-w-md mx-auto space-y-6">
        {/* Card: same for all three views */}
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-lg overflow-hidden">
          <div className="aspect-square bg-neutral-100 flex items-center justify-center">
            <ImageCarousel
              slides={shirtCarouselSlides()}
              alt={dropName}
              className="w-full h-full"
              imageClassName="w-full h-full object-contain"
            />
          </div>

          <div className="p-5 sm:p-6 space-y-4">
            <h1 className="text-xl font-bold text-neutral-900 leading-tight">
              {dropName}
            </h1>
            {(drop?.company_name || drop?.event_name) && (
              <p className="text-neutral-600 text-sm">
                {[drop.company_name, drop.event_name]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="font-medium text-neutral-800">
                Serial #{shirt.serial ?? "—"}
              </span>
              {totalSupply > 0 && (
                <span className="text-neutral-500">
                  {mintedCount} of {totalSupply} minted
                  {remaining > 0 && (
                    <span className="ml-1 font-medium text-emerald-600">
                      · {remaining} left
                    </span>
                  )}
                </span>
              )}
            </div>
            {description && (
              <p className="text-neutral-600 text-sm leading-relaxed">
                {description}
              </p>
            )}

            {/* View 1: Unminted — show Login + Mint */}
            {viewUnminted && (
              <>
                {error ? <p className="text-red-600 text-sm">{error}</p> : null}
                <div className="flex flex-col gap-3 pt-1">
                  {!userAddress ? (
                    <button
                      type="button"
                      onClick={handleLogin}
                      className="w-full py-3.5 px-4 rounded-xl bg-neutral-900 text-white font-medium hover:bg-neutral-800 transition-colors"
                    >
                      Log in with Google (zkLogin)
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleMint}
                    disabled={!userAddress || minting}
                    className="w-full py-3.5 px-4 rounded-xl bg-neutral-900 text-white font-medium hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {minting ? "Minting…" : "Mint"}
                  </button>
                </div>
              </>
            )}

            {/* Minted: no Mint button inside card */}
          </div>
        </div>

        {/* Below card: for minted shirts only */}
        {shirt.is_minted && (
          <div className="space-y-4">
            {/* Tx link — owner view only (or when we have digest) */}
            {viewOwner && claimTxDigest && (
              <div className="text-center">
                <a
                  href={explorerTxUrl(claimTxDigest)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-neutral-700 underline hover:text-neutral-900"
                >
                  View mint transaction on Explorer
                </a>
              </div>
            )}

            {/* Owner line — both owner and non-owner */}
            <p className="text-sm text-neutral-600 text-center">
              Owner:{" "}
              <span className="font-mono" title={shirt.owner ?? undefined}>
                {shirt.owner ? shortenAddress(shirt.owner) : "—"}
              </span>
            </p>

            {/* Owner / profile section */}
            {viewOwner && (
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-neutral-900">
                      About you
                    </h2>
                    {profile?.ens_locked && profile.ens_name && (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                        ENS-locked ({profile.ens_name})
                      </span>
                    )}
                  </div>
                  {!profileEditing && (
                    <button
                      type="button"
                      onClick={handleStartProfileEdit}
                      className="text-xs font-medium text-neutral-600 hover:text-neutral-900"
                    >
                      {profile ? "Edit" : "Add details"}
                    </button>
                  )}
                </div>
                {ensError ? (
                  <p className="mb-1 text-xs text-red-600">{ensError}</p>
                ) : null}
                {profileError ? (
                  <p className="mb-2 text-xs text-red-600">{profileError}</p>
                ) : null}
                {profileLoading && !profileEditing ? (
                  <p className="text-xs text-neutral-500">Loading details…</p>
                ) : null}

                {hasEvmProvider() && profileEditing && (
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={handleConnectEns}
                      disabled={ensLoading}
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {ensLoading
                        ? "Connecting ENS…"
                        : "Connect Ethereum wallet & load ENS"}
                    </button>
                  </div>
                )}

                {profileEditing ? (
                  <div className="space-y-3">
                    {/* Avatar: tap to upload or change */}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-neutral-600">
                        Profile picture
                      </label>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarUpload}
                      />
                      <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={avatarUploading}
                        className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-neutral-100 flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {avatarUploading ? (
                          <span className="text-neutral-500 text-xs">
                            Uploading…
                          </span>
                        ) : profileDraft.avatar?.trim() ? (
                          <img
                            src={profileDraft.avatar}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display =
                                "none";
                            }}
                          />
                        ) : (
                          <span className="text-neutral-400 text-xs">
                            Tap to upload
                          </span>
                        )}
                      </button>
                    </div>
                    {[
                      ["name", "Name"],
                      ["company", "Company"],
                      ["role", "Role"],
                      ["telegram", "Telegram"],
                      ["twitter", "Twitter"],
                      ["email", "Email"],
                      ["website", "Website"],
                      ["github", "GitHub"],
                    ].map(([key, label]) => (
                      <div key={key}>
                        <label className="mb-1 block text-xs font-medium text-neutral-600">
                          {label}
                        </label>
                        <input
                          type="text"
                          value={profileDraft[key] ?? ""}
                          onChange={(e) =>
                            handleProfileFieldChange(key, e.target.value)
                          }
                          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
                        />
                      </div>
                    ))}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-neutral-600">
                        Description
                      </label>
                      <textarea
                        value={profileDraft.description ?? ""}
                        onChange={(e) =>
                          handleProfileFieldChange(
                            "description",
                            e.target.value
                          )
                        }
                        rows={3}
                        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
                      />
                    </div>
                    {/* Extra fields from ENS (e.g. ens:com.discord) or custom */}
                    {(() => {
                      const standardKeys = new Set([
                        "name",
                        "avatar",
                        "company",
                        "role",
                        "telegram",
                        "twitter",
                        "email",
                        "website",
                        "github",
                        "description",
                      ]);
                      const extras = Object.entries(profileDraft).filter(
                        ([k]) => !standardKeys.has(k)
                      );
                      if (extras.length === 0) return null;
                      return (
                        <>
                          <p className="text-xs font-medium text-neutral-600 pt-1">
                            Other details
                          </p>
                          {extras.map(([key, value]) => (
                            <div key={key}>
                              <label className="mb-1 block text-xs font-medium text-neutral-600">
                                {key.startsWith("ens:") ? key.slice(4) : key}
                              </label>
                              <input
                                type="text"
                                value={value ?? ""}
                                onChange={(e) =>
                                  handleProfileFieldChange(key, e.target.value)
                                }
                                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
                              />
                            </div>
                          ))}
                        </>
                      );
                    })()}
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setProfileEditing(false);
                          setProfileError(null);
                        }}
                        className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveProfile}
                        disabled={profileLoading}
                        className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {profileLoading ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                ) : profile &&
                  profile.fields &&
                  Object.keys(profile.fields).length > 0 ? (
                  <>
                    {typeof profile.fields.avatar === "string" &&
                      profile.fields.avatar.trim() !== "" && (
                        <div className="mb-3 flex justify-center">
                          <img
                            src={profile.fields.avatar}
                            alt=""
                            className="h-20 w-20 rounded-full object-cover bg-neutral-100"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display =
                                "none";
                            }}
                          />
                        </div>
                      )}
                    <dl className="space-y-1.5 text-xs text-neutral-700">
                      {Object.entries(profile.fields).map(([key, value]) => {
                        if (key === "avatar" || value == null || value === "")
                          return null;
                        const label =
                          key.charAt(0).toUpperCase() +
                          key.slice(1).replace(/^Ens:/, "");
                        return (
                          <div key={key} className="flex gap-2">
                            <dt className="w-20 shrink-0 text-neutral-500">
                              {label}
                            </dt>
                            <dd className="flex-1 break-words">
                              {key === "website" &&
                              typeof value === "string" ? (
                                <a
                                  href={
                                    value.startsWith("http")
                                      ? value
                                      : `https://${value}`
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline hover:text-neutral-900"
                                >
                                  {value}
                                </a>
                              ) : (
                                String(value)
                              )}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </>
                ) : (
                  <p className="text-xs text-neutral-500">
                    No details added yet.
                  </p>
                )}
              </div>
            )}

            {/* Non-owner view of details */}
            {viewNonOwner &&
              profile &&
              profile.fields &&
              Object.keys(profile.fields).length > 0 && (
                <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
                  <h2 className="mb-3 text-sm font-semibold text-neutral-900">
                    About the owner
                  </h2>
                  {typeof profile.fields.avatar === "string" &&
                    profile.fields.avatar.trim() !== "" && (
                      <div className="mb-3 flex justify-center">
                        <img
                          src={profile.fields.avatar as string}
                          alt=""
                          className="h-20 w-20 rounded-full object-cover bg-neutral-100"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                      </div>
                    )}
                  <dl className="space-y-1.5 text-xs text-neutral-700">
                    {Object.entries(profile.fields).map(([key, value]) => {
                      if (key === "avatar" || value == null || value === "")
                        return null;
                      const label =
                        key.charAt(0).toUpperCase() +
                        key.slice(1).replace(/^Ens:/, "");
                      const strVal = String(value);
                      return (
                        <div key={key} className="flex gap-2">
                          <dt className="w-20 shrink-0 text-neutral-500">
                            {label}
                          </dt>
                          <dd className="flex-1 break-words">
                            {key === "website" && typeof value === "string" ? (
                              <a
                                href={
                                  value.startsWith("http")
                                    ? value
                                    : `https://${value}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline hover:text-neutral-900"
                              >
                                {value}
                              </a>
                            ) : (
                              strVal
                            )}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
}
