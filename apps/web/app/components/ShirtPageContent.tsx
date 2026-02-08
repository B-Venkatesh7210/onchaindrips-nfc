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

const SOCIAL_PREFIXES = {
  telegram: "https://t.me/",
  twitter: "https://x.com/",
  github: "https://github.com/",
} as const;

const SOCIAL_LINK_KEYS = ["website", "telegram", "twitter", "github", "email"] as const;

function getSocialLinkUrl(key: string, value: string | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  switch (key) {
    case "website":
      return v.startsWith("http") ? v : `https://${v}`;
    case "telegram":
      return v.startsWith("http") ? v : `${SOCIAL_PREFIXES.telegram}${v.replace(/^@/, "")}`;
    case "twitter":
      return v.startsWith("http") ? v : `${SOCIAL_PREFIXES.twitter}${v.replace(/^@/, "")}`;
    case "github":
      return v.startsWith("http") ? v : `${SOCIAL_PREFIXES.github}${v.replace(/^@/, "")}`;
    case "email":
      return v.startsWith("mailto:") ? v : `mailto:${v}`;
    default:
      return null;
  }
}

function SocialLinkIcon({
  type,
  className = "h-5 w-5",
}: {
  type: string;
  className?: string;
}) {
  switch (type) {
    case "telegram":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
      );
    case "twitter":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case "github":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
        </svg>
      );
    case "website":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
      );
    case "email":
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
    default:
      return null;
  }
}

function extractSocialUsername(
  value: string | undefined,
  prefix: string
): string {
  if (!value?.trim()) return "";
  const v = value.trim().replace(/^@/, "");
  if (v.startsWith(prefix)) return v.slice(prefix.length).replace(/\/$/, "");
  const patterns = [
    /^https?:\/\/t\.me\/(.+)/i,
    /^https?:\/\/(www\.)?(twitter|x)\.com\/(.+)/i,
    /^https?:\/\/(www\.)?github\.com\/(.+)/i,
  ];
  for (const re of patterns) {
    const m = v.match(re);
    if (m) return (m[1] ?? m[3] ?? "").replace(/\/$/, "");
  }
  return v;
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
        const str = String(v);
        if (k === "telegram")
          flat[k] = extractSocialUsername(str, SOCIAL_PREFIXES.telegram);
        else if (k === "twitter")
          flat[k] = extractSocialUsername(str, SOCIAL_PREFIXES.twitter);
        else if (k === "github")
          flat[k] = extractSocialUsername(str, SOCIAL_PREFIXES.github);
        else flat[k] = str;
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
      const draftWithFullUrls = { ...profileDraft };
      const uname = (draftWithFullUrls.telegram ?? "").trim();
      if (uname) draftWithFullUrls.telegram = SOCIAL_PREFIXES.telegram + uname;
      const tuname = (draftWithFullUrls.twitter ?? "").trim();
      if (tuname) draftWithFullUrls.twitter = SOCIAL_PREFIXES.twitter + tuname;
      const guname = (draftWithFullUrls.github ?? "").trim();
      if (guname) draftWithFullUrls.github = SOCIAL_PREFIXES.github + guname;
      const nextProfile: ShirtProfile = {
        ...(profile ?? {}),
        fields: { ...(profile?.fields ?? {}), ...draftWithFullUrls },
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
        fieldsFromEns.twitter = extractSocialUsername(
          records["com.twitter"],
          SOCIAL_PREFIXES.twitter
        );
      if (records["com.telegram"])
        fieldsFromEns.telegram = extractSocialUsername(
          records["com.telegram"],
          SOCIAL_PREFIXES.telegram
        );
      if (records["com.github"])
        fieldsFromEns.github = extractSocialUsername(
          records["com.github"],
          SOCIAL_PREFIXES.github
        );
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
    profile?.ens_name ??
    profileDraft.name ??
    (profile?.fields?.name as string | undefined);
  const displayAvatarUrl = getDisplayableAvatarUrl(
    profileDraft.avatar ?? (profile?.fields?.avatar as string | undefined),
    ensNameForAvatar
  );
  const shirtCarouselSlides =
    (): import("@/app/components/ImageCarousel").CarouselSlide[] => {
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
        return [slide1, slide2].filter(
          Boolean
        ) as import("@/app/components/ImageCarousel").CarouselSlide[];
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
                Serial #{shirt.serial != null ? shirt.serial + 1 : "—"}
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
              <p className="mt-4 text-white/60 text-sm leading-relaxed whitespace-pre-wrap">
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
                      {(
                        [
                          ["name", "Name", null],
                          ["company", "Company", null],
                          ["role", "Role", null],
                          ["website", "Website", null],
                          ["telegram", "Telegram", SOCIAL_PREFIXES.telegram],
                          ["twitter", "Twitter", SOCIAL_PREFIXES.twitter],
                          ["github", "GitHub", SOCIAL_PREFIXES.github],
                          ["email", "Email", null],
                        ] as [string, string, string | null][]
                      ).map(([key, label, prefix]) =>
                        prefix ? (
                          <div key={key}>
                            <label className="mb-1 block text-sm font-medium text-white/70">
                              {label}
                            </label>
                            <div className="flex rounded-lg border border-white/20 bg-black/40 overflow-hidden">
                              <span className="flex shrink-0 items-center rounded-l-lg border-r border-white/20 bg-white/5 px-3 py-2.5 text-sm text-white/60">
                                {prefix}
                              </span>
                              <input
                                type="text"
                                value={profileDraft[key] ?? ""}
                                onChange={(e) =>
                                  handleProfileFieldChange(key, e.target.value)
                                }
                                placeholder="username"
                                className="flex-1 min-w-0 rounded-r-lg border-0 bg-transparent px-3 py-2.5 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-red-500/50"
                              />
                            </div>
                          </div>
                        ) : (
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
                        )
                      )}
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
                                    handleProfileFieldChange(
                                      key,
                                      e.target.value
                                    )
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
                        profile.ens_name ??
                          (profile.fields?.name as string | undefined)
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
                    {profile.fields &&
                    SOCIAL_LINK_KEYS.some((k) => {
                      const v = profile.fields?.[k as keyof typeof profile.fields] as string | undefined;
                      return getSocialLinkUrl(k, v);
                    }) && (
                      <div className="mb-6 flex flex-wrap gap-3">
                        {SOCIAL_LINK_KEYS.map((k) => {
                          const v = profile.fields?.[k as keyof typeof profile.fields] as string | undefined;
                          const url = getSocialLinkUrl(k, v);
                          if (!url) return null;
                          return (
                            <a
                              key={k}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={k.charAt(0).toUpperCase() + k.slice(1)}
                              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/5 text-white/80 transition hover:border-red-500/50 hover:bg-white/10 hover:text-white"
                            >
                              <SocialLinkIcon type={k} />
                            </a>
                          );
                        })}
                      </div>
                    )}
                    <dl className="space-y-3 text-sm">
                      {Object.entries(profile.fields).map(([key, value]) => {
                        if (
                          key === "avatar" ||
                          (SOCIAL_LINK_KEYS as readonly string[]).includes(key) ||
                          value == null ||
                          value === ""
                        )
                          return null;
                        const label =
                          key.charAt(0).toUpperCase() +
                          key.slice(1).replace(/^Ens:/, "");
                        return (
                          <div
                            key={key}
                            className="flex gap-3 border-b border-white/10 pb-3 last:border-0 last:pb-0"
                          >
                            <dt className="w-24 shrink-0 text-white/60">
                              {label}
                            </dt>
                            <dd className="flex-1 break-words text-white/90">
                              {String(value)}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </>
                ) : (
                  <p className="text-sm text-white/50">
                    No details added yet. Click &quot;Add details&quot; to add
                    your name, avatar, and links.
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
                      profile.ens_name ??
                        (profile.fields?.name as string | undefined)
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
                  {profile.fields &&
                  SOCIAL_LINK_KEYS.some((k) => {
                    const v = profile.fields?.[k as keyof typeof profile.fields] as string | undefined;
                    return getSocialLinkUrl(k, v);
                  }) && (
                    <div className="mb-6 flex flex-wrap gap-3">
                      {SOCIAL_LINK_KEYS.map((k) => {
                        const v = profile.fields?.[k as keyof typeof profile.fields] as string | undefined;
                        const url = getSocialLinkUrl(k, v);
                        if (!url) return null;
                        return (
                          <a
                            key={k}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={k.charAt(0).toUpperCase() + k.slice(1)}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/5 text-white/80 transition hover:border-red-500/50 hover:bg-white/10 hover:text-white"
                          >
                            <SocialLinkIcon type={k} />
                          </a>
                        );
                      })}
                    </div>
                  )}
                  <dl className="space-y-3 text-sm">
                    {Object.entries(profile.fields).map(([key, value]) => {
                      if (
                        key === "avatar" ||
                        (SOCIAL_LINK_KEYS as readonly string[]).includes(key) ||
                        value == null ||
                        value === ""
                      )
                        return null;
                      const label =
                        key.charAt(0).toUpperCase() +
                        key.slice(1).replace(/^Ens:/, "");
                      return (
                        <div
                          key={key}
                          className="flex gap-3 border-b border-white/10 pb-3 last:border-0 last:pb-0"
                        >
                          <dt className="w-24 shrink-0 text-white/60">
                            {label}
                          </dt>
                          <dd className="flex-1 break-words text-white/90">
                            {String(value)}
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
