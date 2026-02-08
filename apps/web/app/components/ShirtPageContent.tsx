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
      // Use ENS Metadata Service for avatar — resolves eip155/NFT/IPFS to a displayable HTTP URL
      // (records["avatar"] can be raw eip155:1/erc1155:... which browsers cannot load)
      if (ensName) {
        fieldsFromEns.name = ensName;
        fieldsFromEns.avatar = `https://metadata.ens.domains/mainnet/avatar/${ensName}`;
      } else if (records["avatar"]?.startsWith("http")) {
        fieldsFromEns.avatar = records["avatar"];
      }
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
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-white/70">Loading…</p>
      </div>
    );
  }

  if (error && !shirt) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-red-400">{error}</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500"
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

  /** Returns a displayable avatar URL; converts eip155/ipfs URIs via ENS Metadata Service. */
  const getDisplayableAvatarUrl = (
    avatar: string | undefined,
    ensName?: string | null
  ): string | null => {
    if (!avatar?.trim()) return null;
    const v = avatar.trim();
    if (/^https?:\/\//i.test(v)) return v;
    if ((v.startsWith("eip155:") || v.startsWith("ipfs:")) && ensName?.trim()) {
      return `https://metadata.ens.domains/mainnet/avatar/${ensName.trim()}`;
    }
    return null;
  };
  const ensNameForAvatar =
    profile?.ens_name ?? profileDraft.name ?? (profile?.fields?.name as string | undefined);
  const displayAvatarUrl =
    getDisplayableAvatarUrl(
      profileDraft.avatar ?? (profile?.fields?.avatar as string | undefined),
      ensNameForAvatar
    );
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
    <div className="min-h-screen py-8 px-4">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Back link */}
        <button
          type="button"
          onClick={() => router.push(returnToPath)}
          className="text-sm text-white/60 hover:text-white transition-colors"
        >
          ← Back
        </button>

        {/* Card: drop-page style — name + event, image, details */}
        <div className="overflow-hidden rounded-xl shadow-xl">
          <div className="bg-black border border-red-600/40 border-b-0 rounded-t-xl px-6 py-4 text-center">
            <h1 className="text-2xl font-bold text-white">{dropName}</h1>
            {(drop?.company_name || drop?.event_name) && (
              <p className="mt-1 text-white/80">
                {[drop.company_name, drop.event_name]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
          <div className="relative aspect-square bg-transparent flex items-center justify-center">
            <ImageCarousel
              slides={shirtCarouselSlides()}
              alt={dropName}
              className="max-h-[90%] max-w-[90%] w-full"
              imageClassName="max-h-[90%] max-w-[90%] w-auto h-auto object-contain"
            />
          </div>
          <div className="bg-black border border-red-600/40 border-t-0 rounded-b-xl px-6 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-red-600/20 px-3 py-1 text-xs font-medium text-red-400">
                Serial #{shirt.serial ?? "—"}
              </span>
              {totalSupply > 0 && (
                <span className="text-sm text-white/70">
                  {mintedCount} of {totalSupply} minted
                  {remaining > 0 && (
                    <span className="ml-1 font-medium text-emerald-400">
                      · {remaining} left
                    </span>
                  )}
                </span>
              )}
            </div>
            {description && (
              <p className="mt-4 text-white/60 text-sm leading-relaxed">
                {description}
              </p>
            )}

            {/* Unminted: Login + Mint */}
            {viewUnminted && (
              <div className="mt-4 flex flex-col gap-3">
                {error ? <p className="text-red-400 text-sm">{error}</p> : null}
                {!userAddress ? (
                  <button
                    type="button"
                    onClick={handleLogin}
                    className="w-full py-3.5 px-4 rounded-xl bg-red-600 text-white font-medium hover:bg-red-500 transition-colors"
                  >
                    Log in with Google (zkLogin)
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleMint}
                  disabled={!userAddress || minting}
                  className="w-full py-3.5 px-4 rounded-xl bg-red-600 text-white font-medium hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {minting ? "Minting…" : "Mint"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Below card: for minted shirts only */}
        {shirt.is_minted && (
          <div className="space-y-4">
            {/* Tx link — owner view only */}
            {viewOwner && claimTxDigest && (
              <div className="text-center">
                <a
                  href={explorerTxUrl(claimTxDigest)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-white/80 underline hover:text-white"
                >
                  View mint transaction on Explorer
                </a>
              </div>
            )}

            {/* Ownership note — prominent block */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-center">
              <p className="text-sm font-medium text-emerald-200/90">
                This tshirt is minted and now owned by{" "}
                <span
                  className="font-mono text-white font-semibold"
                  title={shirt.owner ?? undefined}
                >
                  {shirt.owner ? shortenAddress(shirt.owner) : "—"}
                </span>
              </p>
            </div>

            {/* Owner profile section — profile-style card */}
            {viewOwner && (
              <div className="rounded-xl border border-white/10 bg-black/30 backdrop-blur-sm p-6 sm:p-8">
                <div className="mb-6 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-white">
                      Your profile
                    </h2>
                    {profile?.ens_locked && profile.ens_name && (
                      <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-300">
                        ENS ({profile.ens_name})
                      </span>
                    )}
                  </div>
                  {!profileEditing && (
                    <button
                      type="button"
                      onClick={handleStartProfileEdit}
                      className="text-sm font-medium text-white/70 hover:text-white"
                    >
                      {profile ? "Edit" : "Add details"}
                    </button>
                  )}
                </div>
                {ensError ? (
                  <p className="mb-2 text-sm text-red-400">{ensError}</p>
                ) : null}
                {profileError ? (
                  <p className="mb-2 text-sm text-red-400">{profileError}</p>
                ) : null}
                {profileLoading && !profileEditing ? (
                  <p className="text-sm text-white/50">Loading details…</p>
                ) : null}

                {hasEvmProvider() && profileEditing && (
                  <div className="mb-6 flex justify-center sm:justify-start">
                    <button
                      type="button"
                      onClick={handleConnectEns}
                      disabled={ensLoading}
                      className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {ensLoading
                        ? "Connecting ENS…"
                        : "Connect wallet & load ENS"}
                    </button>
                  </div>
                )}

                {profileEditing ? (
                  <div className="space-y-5">
                    {/* Avatar — centered, larger, clearly visible */}
                    <div className="flex flex-col items-center">
                      <label className="mb-3 text-sm font-medium text-white/80">
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
                        className="h-32 w-32 shrink-0 overflow-hidden rounded-full border-2 border-dashed border-white/50 bg-white/5 flex items-center justify-center cursor-pointer hover:border-white/70 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-red-500/60 focus:ring-offset-2 focus:ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {avatarUploading ? (
                          <span className="text-white/70 text-sm px-2 text-center">
                            Uploading…
                          </span>
                        ) : displayAvatarUrl ? (
                          <img
                            src={displayAvatarUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display =
                                "none";
                            }}
                          />
                        ) : (
                          <span className="text-white/70 text-sm px-2 text-center">
                            + Add photo
                          </span>
                        )}
                      </button>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
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
                          <label className="mb-1 block text-sm font-medium text-white/70">
                            {label}
                          </label>
                          <input
                            type="text"
                            value={profileDraft[key] ?? ""}
                            onChange={(e) =>
                              handleProfileFieldChange(key, e.target.value)
                            }
                            className="w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2.5 text-sm text-white placeholder-white/40 focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/50"
                          />
                        </div>
                      ))}
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-white/70">
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
                        className="w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2.5 text-sm text-white placeholder-white/40 focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/50"
                      />
                    </div>
                    {/* Extra fields from ENS */}
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
                          <p className="text-sm font-medium text-white/70 pt-2">
                            Other details
                          </p>
                          <div className="grid gap-4 sm:grid-cols-2">
                            {extras.map(([key, value]) => (
                              <div key={key}>
                                <label className="mb-1 block text-sm font-medium text-white/70">
                                  {key.startsWith("ens:") ? key.slice(4) : key}
                                </label>
                                <input
                                  type="text"
                                  value={value ?? ""}
                                  onChange={(e) =>
                                    handleProfileFieldChange(key, e.target.value)
                                  }
                                  className="w-full rounded-lg border border-white/20 bg-black/40 px-3 py-2.5 text-sm text-white placeholder-white/40 focus:border-red-500/50 focus:outline-none"
                                />
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setProfileEditing(false);
                          setProfileError(null);
                        }}
                        className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveProfile}
                        disabled={profileLoading}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {profileLoading ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                ) : profile &&
                  profile.fields &&
                  Object.keys(profile.fields).length > 0 ? (
                  <>
                    {(() => {
                      const ownerAvatarUrl = getDisplayableAvatarUrl(
                        profile.fields?.avatar as string | undefined,
                        profile.ens_name ?? (profile.fields?.name as string | undefined)
                      );
                      return ownerAvatarUrl ? (
                        <div className="mb-6 flex justify-center">
                          <img
                            src={ownerAvatarUrl}
                            alt=""
                            className="h-28 w-28 rounded-full object-cover border-2 border-white/10 bg-black/40"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display =
                                "none";
                            }}
                          />
                        </div>
                      ) : null;
                    })()}
                    <dl className="space-y-3 text-sm">
                      {Object.entries(profile.fields).map(([key, value]) => {
                        if (key === "avatar" || value == null || value === "")
                          return null;
                        const label =
                          key.charAt(0).toUpperCase() +
                          key.slice(1).replace(/^Ens:/, "");
                        return (
                          <div key={key} className="flex gap-3 border-b border-white/10 pb-3 last:border-0 last:pb-0">
                            <dt className="w-24 shrink-0 text-white/60">
                              {label}
                            </dt>
                            <dd className="flex-1 break-words text-white/90">
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
                                  className="underline hover:text-white"
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
                  <p className="text-sm text-white/50">
                    No details added yet. Click &quot;Add details&quot; to add your name, avatar, and links.
                  </p>
                )}
              </div>
            )}

            {/* Non-owner view of details */}
            {viewNonOwner &&
              profile &&
              profile.fields &&
              Object.keys(profile.fields).length > 0 && (
                <div className="rounded-xl border border-white/10 bg-black/30 backdrop-blur-sm p-6 sm:p-8">
                  <h2 className="mb-6 text-lg font-semibold text-white text-center">
                    About the owner
                  </h2>
                  {(() => {
                    const ownerAvatarUrl = getDisplayableAvatarUrl(
                      profile.fields?.avatar as string | undefined,
                      profile.ens_name ?? (profile.fields?.name as string | undefined)
                    );
                    return ownerAvatarUrl ? (
                      <div className="mb-6 flex justify-center">
                        <img
                          src={ownerAvatarUrl}
                          alt=""
                          className="h-28 w-28 rounded-full object-cover border-2 border-white/10 bg-black/40"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                      </div>
                    ) : null;
                  })()}
                  <dl className="space-y-3 text-sm">
                    {Object.entries(profile.fields).map(([key, value]) => {
                      if (key === "avatar" || value == null || value === "")
                        return null;
                      const label =
                        key.charAt(0).toUpperCase() +
                        key.slice(1).replace(/^Ens:/, "");
                      const strVal = String(value);
                      return (
                        <div key={key} className="flex gap-3 border-b border-white/10 pb-3 last:border-0 last:pb-0">
                          <dt className="w-24 shrink-0 text-white/60">
                            {label}
                          </dt>
                          <dd className="flex-1 break-words text-white/90">
                            {key === "website" && typeof value === "string" ? (
                              <a
                                href={
                                  strVal.startsWith("http")
                                    ? strVal
                                    : `https://${strVal}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline hover:text-white"
                              >
                                {strVal}
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
