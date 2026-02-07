"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ADMIN_ADDRESS,
  adminCloseDropBids,
  adminFetchDropBidSummary,
  fetchDropBids,
  fetchDrops,
  placeDropBid,
  type DropBid,
  type DropRow,
} from "@/lib/api";
import { getStoredAddress } from "@/lib/auth";
import { hasEvmProvider } from "@/lib/ens";
import {
  addYellowBalance,
  clearStoredEvmSession,
  closeYellowChannel,
  connectYellowWallet,
  ensureYellowBalance,
  getLoserRefunded,
  getStoredChannelId,
  getStoredEvmSession,
  getStoredYellowBalance,
  lockBidAmountOffChain,
  openYellowSession,
  setLoserRefunded,
  setStoredEvmSession,
  setStoredYellowBalance,
  settleYellowBidsClientSide,
  topUpYellowChannel,
  useYellowSandbox,
  type YellowSession,
} from "@/lib/yellow";

export default function DropDetailPage() {
  const params = useParams();
  const objectId = typeof params.objectId === "string" ? params.objectId : "";
  const [drop, setDrop] = useState<DropRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [bids, setBids] = useState<DropBid[]>([]);
  const [bidsLoading, setBidsLoading] = useState(false);
  const [bidsError, setBidsError] = useState<string | null>(null);

  const [evmAddress, setEvmAddress] = useState<string | null>(null);
  const [yellowSession, setYellowSession] = useState<YellowSession | null>(null);
  const [yellowError, setYellowError] = useState<string | null>(null);
  const [connectingYellow, setConnectingYellow] = useState(false);
  const [toppingUp, setToppingUp] = useState(false);
  const [releasingFunds, setReleasingFunds] = useState(false);
  const [yellowStep, setYellowStep] = useState<string | null>(null);

  const [bidAmountInput, setBidAmountInput] = useState("");
  const [placingBid, setPlacingBid] = useState(false);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [reservationSlots, setReservationSlots] = useState<number | null>(null);
  const [mySize, setMySize] = useState<"S" | "M" | "L" | "XL" | "XXL" | "">("");

  const storedAddress = getStoredAddress();
  const myBid = evmAddress
    ? bids.find((b) => b.evm_address.toLowerCase() === evmAddress.toLowerCase())
    : null;
  const hasPlacedBid = !!myBid;
  const isAdmin =
    storedAddress &&
    storedAddress.toLowerCase().trim() === ADMIN_ADDRESS.toLowerCase().trim();

  const [adminSummaryLoading, setAdminSummaryLoading] = useState(false);
  const [adminSummaryError, setAdminSummaryError] = useState<string | null>(null);
  const [adminWinners, setAdminWinners] = useState<
    { evm_address: string; bid_amount_usd: number; rank: number }[]
  >([]);
  const [adminLosers, setAdminLosers] = useState<
    { evm_address: string; bid_amount_usd: number }[]
  >([]);
  const [adminTotalWinningUsd, setAdminTotalWinningUsd] = useState(0);
  const [adminSettlementRunning, setAdminSettlementRunning] = useState(false);

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

  const loadBids = useCallback(async () => {
    if (!objectId) return;
    setBidsLoading(true);
    setBidsError(null);
    try {
      const { bids } = await fetchDropBids(objectId);
      setBids(bids);
    } catch (e) {
      setBidsError(
        e instanceof Error ? e.message : "Failed to load bids for this drop",
      );
    } finally {
      setBidsLoading(false);
    }
  }, [objectId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadBids();
  }, [loadBids]);

  // When bidding closed and user is a loser: add bid amount back to balance (once)
  useEffect(() => {
    if (!objectId || !evmAddress || !drop?.bidding_closed) return;
    const myBidResult = bids.find((b) => b.evm_address.toLowerCase() === evmAddress.toLowerCase());
    if (myBidResult?.status !== "lost" || !useYellowSandbox()) return;
    if (getLoserRefunded(objectId, evmAddress)) return;
    const refundAmount = myBidResult.bid_amount_usd;
    addYellowBalance(evmAddress, refundAmount);
    setLoserRefunded(objectId, evmAddress);
    const newBal = getStoredYellowBalance(evmAddress);
    setStoredEvmSession({ evmAddress, depositedUsd: newBal, channelId: getStoredChannelId(evmAddress) ?? undefined });
    setYellowSession((prev) => (prev ? { ...prev, depositedUsd: newBal } : null));
  }, [objectId, evmAddress, drop?.bidding_closed, bids]);

  // Auto-restore Yellow session when navigating to this drop (wallet already connected on another drop)
  useEffect(() => {
    if (!hasEvmProvider() || evmAddress || connectingYellow) return;
    const stored = getStoredEvmSession();
    if (!stored) return;
    const ethereum = (window as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
    if (!ethereum) return;
    ethereum.request({ method: "eth_accounts" }).then((accounts: unknown) => {
      const addrs = Array.isArray(accounts) ? accounts as string[] : [];
      const current = addrs[0];
      if (!current || current.toLowerCase() !== stored.evmAddress.toLowerCase()) return;
      setEvmAddress(stored.evmAddress);
      const balance = useYellowSandbox() ? getStoredYellowBalance(stored.evmAddress) : stored.depositedUsd;
      setYellowSession({
        userAddress: stored.evmAddress,
        appId: "onchaindrips-nfc-bidding",
        depositedUsd: balance,
        channelId: stored.channelId,
      });
    }).catch(() => {});
  }, [evmAddress, connectingYellow]);

  const handleConnectYellow = useCallback(async () => {
    let failed = false;
    try {
      setConnectingYellow(true);
      setYellowError(null);
      setYellowStep("Step 0: Connecting wallet…");
      if (!hasEvmProvider()) {
        throw new Error("No EVM wallet found. Install MetaMask or similar.");
      }
      const addr = await connectYellowWallet();
      setEvmAddress(addr);
      const initialDeposit = Number(bidAmountInput) > 0 ? Number(bidAmountInput) : 10;
      const session = await openYellowSession(addr, 10, (step) =>
        setYellowStep(step)
      );
      setYellowSession(session);
      setStoredEvmSession({ evmAddress: addr, depositedUsd: session.depositedUsd, channelId: session.channelId });
    } catch (e) {
      failed = true;
      const msg = e instanceof Error ? e.message : "Failed to start Yellow session";
      setYellowError(msg);
      setYellowStep(`Failed: ${msg}`);
    } finally {
      setConnectingYellow(false);
      if (!failed) setYellowStep(null);
    }
  }, []);

  const handleTopUp = useCallback(async () => {
    if (!yellowSession) return;
    const amount = Number(bidAmountInput) || 10;
    try {
      setToppingUp(true);
      setYellowError(null);
      const updated = await topUpYellowChannel(yellowSession, amount);
      setYellowSession(updated);
    } catch (e) {
      setYellowError(e instanceof Error ? e.message : "Failed to top up");
    } finally {
      setToppingUp(false);
    }
  }, [yellowSession, bidAmountInput]);

  const handleDisconnectYellow = useCallback(() => {
    setEvmAddress(null);
    setYellowSession(null);
    clearStoredEvmSession();
  }, []);

  const handleReleaseFunds = useCallback(async () => {
    if (!evmAddress || !drop?.reservation_evm_recipient) return;
    const organizer = drop.reservation_evm_recipient.trim();
    const channelId = yellowSession?.channelId ?? getStoredChannelId(evmAddress);
    if (!channelId) {
      setYellowError("No Yellow channel found. You may have cleared storage.");
      return;
    }
    try {
      setReleasingFunds(true);
      setYellowError(null);
      await closeYellowChannel(evmAddress, channelId, organizer);
      await loadBids();
    } catch (e) {
      setYellowError(e instanceof Error ? e.message : "Failed to release funds");
    } finally {
      setReleasingFunds(false);
    }
  }, [evmAddress, drop, yellowSession, loadBids]);

  const handlePlaceBid = useCallback(async () => {
    if (!drop || !objectId) return;
    const amount = Number(bidAmountInput);
    if (!yellowSession || !evmAddress) {
      setYellowError("Connect your EVM wallet & Yellow session first.");
      return;
    }
    if (!mySize) {
      setYellowError("Select a size before bidding.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setYellowError("Enter a positive bid amount in USD.");
      return;
    }
    setPlacingBid(true);
    setYellowError(null);
    try {
      await ensureYellowBalance(yellowSession, amount);
      await lockBidAmountOffChain({
        session: yellowSession,
        dropId: objectId,
        bidAmountUsd: amount,
      });
      const res = await placeDropBid(objectId, evmAddress, amount, mySize);
      setMyRank(res.rank);
      setReservationSlots(res.reservation_slots);
      // Update displayed Yellow balance: deduct bid amount immediately
      const previousBidAmount = bids.find(
        (b) => b.evm_address.toLowerCase() === evmAddress.toLowerCase(),
      )?.bid_amount_usd ?? 0;
      const delta = amount - previousBidAmount;
      const newBalance = yellowSession ? Math.max(0, yellowSession.depositedUsd - delta) : 0;
      setYellowSession((prev) =>
        prev ? { ...prev, depositedUsd: newBalance } : null,
      );
      if (useYellowSandbox()) {
        const current = getStoredYellowBalance(evmAddress);
        setStoredYellowBalance(evmAddress, Math.max(0, current - delta));
      }
      setStoredEvmSession({
        evmAddress,
        depositedUsd: newBalance,
        channelId: yellowSession?.channelId,
      });
      await loadBids();
    } catch (e) {
      setYellowError(
        e instanceof Error ? e.message : "Failed to place bid with Yellow",
      );
    } finally {
      setPlacingBid(false);
    }
  }, [drop, objectId, yellowSession, evmAddress, bidAmountInput, mySize, bids, loadBids]);

  const handleAdminLoadSummary = useCallback(async () => {
    if (!isAdmin || !objectId || !storedAddress) return;
    setAdminSummaryLoading(true);
    setAdminSummaryError(null);
    try {
      const summary = await adminFetchDropBidSummary(storedAddress, objectId);
      setAdminWinners(summary.winners);
      setAdminLosers(summary.losers);
      const totalWinning = summary.winners.reduce(
        (acc, w) => acc + Number(w.bid_amount_usd),
        0,
      );
      setAdminTotalWinningUsd(totalWinning);
    } catch (e) {
      setAdminSummaryError(
        e instanceof Error ? e.message : "Failed to load bid summary",
      );
    } finally {
      setAdminSummaryLoading(false);
    }
  }, [isAdmin, objectId, storedAddress]);

  const handleAdminSettleAndClose = useCallback(async () => {
    if (!isAdmin || !objectId || !storedAddress || !drop) return;
    if (!adminWinners.length) return;
    const organizer = drop.reservation_evm_recipient?.trim();
    if (!organizer) {
      setAdminSummaryError(
        "reservation_evm_recipient is not set for this drop; cannot settle.",
      );
      return;
    }
    setAdminSettlementRunning(true);
    setAdminSummaryError(null);
    try {
      await settleYellowBidsClientSide({
        organizer,
        dropId: objectId,
        winners: adminWinners.map((w) => ({
          address: w.evm_address,
          amountUsd: Number(w.bid_amount_usd),
        })),
      });
      await adminCloseDropBids(storedAddress, objectId);
      await handleAdminLoadSummary();
      await loadBids();
      await load();
    } catch (e) {
      setAdminSummaryError(
        e instanceof Error ? e.message : "Failed to settle bids via Yellow",
      );
    } finally {
      setAdminSettlementRunning(false);
    }
  }, [
    isAdmin,
    objectId,
    storedAddress,
    drop,
    adminWinners,
    handleAdminLoadSummary,
    loadBids,
    load,
  ]);

  if (!objectId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-white/70">Invalid drop.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-white/60 hover:text-white">← Home</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="h-8 w-48 animate-pulse rounded bg-black/40" />
        <div className="mt-4 h-4 w-full animate-pulse rounded bg-black/30" />
      </div>
    );
  }

  if (!drop) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-white/70">Drop not found.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-white/60 hover:text-white">← Home</Link>
      </div>
    );
  }

  const minted = Number(drop.minted_count ?? 0);
  const total = Number(drop.total_supply ?? 0);
  const slots = Number(drop.reservation_slots ?? 0);
  const biddingClosed = Boolean(drop.bidding_closed);
  const hasBidding = slots > 0;

  const sizeInfo = [
    { label: "S", value: drop.size_s_total ?? 0 },
    { label: "M", value: drop.size_m_total ?? 0 },
    { label: "L", value: drop.size_l_total ?? 0 },
    { label: "XL", value: drop.size_xl_total ?? 0 },
    { label: "XXL", value: drop.size_xxl_total ?? 0 },
  ];
  const hasSizeInfo = sizeInfo.some((s) => s.value && s.value > 0);

  const imageBlobId = drop.image_blob_id?.trim();
  const imageSrc = imageBlobId
    ? `/api/walrus/${encodeURIComponent(imageBlobId)}`
    : null;
  const btnClass =
    "bg-red-600 hover:bg-red-700 text-white shadow-[0_0_16px_0_rgba(220,38,38,0.6)] hover:shadow-[0_0_32px_4px_rgba(220,38,38,0.8)]";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <Link
        href="/"
        className="text-sm text-white/60 hover:text-white transition-colors"
      >
        ← Back to drops
      </Link>

      {/* Section 1: Drop Details */}
      <div className="mt-2 overflow-hidden rounded-xl shadow-xl">
        {/* Drop name + Event name — black bg, red outline top/left/right */}
        <div className="bg-black border border-red-600/40 border-b-0 rounded-t-xl px-6 py-4 text-center">
          <h1 className="text-2xl font-bold text-white">{drop.name}</h1>
          <p className="mt-1 text-white/80">{drop.event_name}</p>
        </div>
        {/* NFT image — transparent bg, ~90% of given space */}
        <div className="relative aspect-square bg-transparent flex items-center justify-center">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={drop.name}
              className="max-h-[90%] max-w-[90%] w-auto h-auto object-contain"
            />
          ) : (
            <div className="flex h-48 w-full items-center justify-center text-white/40 text-sm">
              No image
            </div>
          )}
        </div>
        {/* Other details — black bg, red outline left/right/bottom */}
        <div className="bg-black border border-red-600/40 border-t-0 rounded-b-xl px-6 py-4">
          <p className="text-sm text-white/70">{drop.company_name}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-red-600/20 px-3 py-1 text-xs font-medium text-red-400">
              {minted} / {total} minted
            </span>
            {drop.release_date && (
              <span className="text-sm text-white/60">
                Release: {drop.release_date}
              </span>
            )}
            {typeof drop.reservation_slots === "number" &&
              drop.reservation_slots > 0 && (
                <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-400">
                  {drop.reservation_slots} reservation slots
                </span>
              )}
          </div>
          {hasSizeInfo && (
            <p className="mt-3 text-xs text-white/60">
              <span className="font-medium text-white/80">Available sizes:</span>{" "}
              {sizeInfo
                .filter((s) => s.value && s.value > 0)
                .map((s) => `${s.label} (${s.value})`)
                .join(", ")}
            </p>
          )}
          {(drop.description ??
            (drop.offchain_attributes &&
            typeof drop.offchain_attributes === "object" &&
            "description" in drop.offchain_attributes
              ? (drop.offchain_attributes as { description?: string }).description
              : null)) && (
            <p className="mt-4 text-white/60 text-sm">
              {String(
                drop.description ??
                  (
                    (drop.offchain_attributes as { description?: string }) ?? {}
                  ).description ??
                  ""
              )}
            </p>
          )}
        </div>
      </div>

      {/* Section 2: Bidding panel */}
      {hasBidding && !biddingClosed && (
        <div className="rounded-xl border border-red-600/40 bg-black/80 backdrop-blur-sm overflow-hidden shadow-xl">
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-white">
                Bid for a reserved shirt
              </h2>
              <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/30">
                Powered by Yellow Network
              </span>
            </div>
            <p className="text-sm text-white/70">
              Bids use Yellow Network on Sepolia with ytest.usd. Connect your EVM wallet,
              request test tokens from the faucet, fund your channel, then place your bid.
              No gas for bidding—winners sign to release funds at settlement. Rabby wallet recommended.
            </p>

            {yellowError && (
              <div className="rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3">
                <p className="text-sm text-red-400">{yellowError}</p>
                <p className="mt-1 text-xs text-white/50">
                  Open browser console (F12) for step-by-step logs.
                </p>
              </div>
            )}

            {/* Wallet & balance block */}
            <div className="rounded-lg border border-red-600/30 bg-black/60 p-4 space-y-3">
              {!yellowSession ? (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <p className="text-sm text-white/70">
                    Connect an EVM wallet to start a Yellow session.
                  </p>
                  <button
                    type="button"
                    onClick={handleConnectYellow}
                    disabled={connectingYellow}
                    className={`shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${btnClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {connectingYellow
                      ? yellowStep ?? "Connecting…"
                      : "Connect wallet & fund"}
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-white/60 uppercase tracking-wider">Connected</p>
                      <p className="font-mono text-sm text-white/90">
                        {evmAddress
                          ? `${evmAddress.slice(0, 6)}…${evmAddress.slice(-4)}`
                          : "—"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-red-600/20 border border-red-600/40 px-4 py-2 text-center min-w-[100px]">
                      <p className="text-[10px] uppercase tracking-wider text-red-400/90">Balance</p>
                      <p className="text-lg font-bold text-white">
                        ${yellowSession.depositedUsd.toFixed(2)}
                      </p>
                      {yellowSession.channelId && (
                        <p className="text-[10px] text-emerald-400/80">channel funded</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleTopUp}
                      disabled={toppingUp}
                      className="rounded-lg border border-red-600/50 bg-red-950/40 px-3 py-2 text-xs font-medium text-white/90 hover:bg-red-950/60 disabled:opacity-50 transition-colors"
                    >
                      {toppingUp ? "Requesting…" : "Request more tokens"}
                    </button>
                    <button
                      type="button"
                      onClick={handleDisconnectYellow}
                      className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-medium text-white/80 hover:bg-white/10 transition-colors"
                    >
                      Disconnect wallet
                    </button>
                  </div>
                </>
              )}
            </div>

            {hasPlacedBid ? (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-4 py-3">
                <p className="text-sm font-medium text-emerald-400">Already bid placed</p>
                <p className="mt-0.5 text-xs text-white/70">
                  Your bid: ${myBid?.bid_amount_usd?.toFixed(2) ?? "—"}
                  {myBid?.size ? ` · Size ${myBid.size}` : ""}
                  {myRank ? ` · Rank #${myRank}` : ""}
                </p>
                <p className="mt-1 text-xs text-white/50">
                  Wait for the bidding to get closed.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-red-600/30 bg-black/60 p-4 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-white/90">
                    Your bid (USD)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={bidAmountInput}
                    onChange={(e) => setBidAmountInput(e.target.value)}
                    className="w-full rounded-lg border border-red-600/40 bg-black/60 px-4 py-3 text-white placeholder:text-white/40 focus:border-red-500 focus:ring-1 focus:ring-red-500/50 focus:outline-none"
                    placeholder="e.g. 25.00"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-white/90">Size</label>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Select shirt size">
                    {(["S", "M", "L", "XL", "XXL"] as const).map((size) => {
                      const info = sizeInfo.find((s) => s.label === size);
                      const available = !hasSizeInfo || (info?.value ?? 0) > 0;
                      const isSelected = mySize === size;
                      return (
                        <button
                          key={size}
                          type="button"
                          onClick={() => available && setMySize(size)}
                          disabled={!available}
                          className={`
                            min-w-[3rem] rounded-lg px-4 py-3 text-sm font-semibold transition-all
                            ${isSelected
                              ? "border-2 border-red-500 bg-red-600/30 text-white shadow-[0_0_12px_rgba(220,38,38,0.4)]"
                              : available
                                ? "border border-red-600/40 bg-black/60 text-white/90 hover:border-red-500/60 hover:bg-red-950/40 hover:text-white"
                                : "cursor-not-allowed border border-white/10 bg-black/30 text-white/40"
                            }
                          `}
                        >
                          <span>{size}</span>
                          {hasSizeInfo && info && (
                            <span className={`ml-1 text-[10px] font-normal ${available ? "text-white/60" : ""}`}>
                              ({info.value})
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handlePlaceBid}
                  disabled={placingBid || !yellowSession}
                  className={`w-full rounded-lg px-4 py-3 text-sm font-semibold transition-all ${btnClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {placingBid ? "Placing bid…" : "Place bid"}
                </button>
                {(myRank || reservationSlots) && (
                  <p className="text-xs text-white/60 text-center">
                    {myRank
                      ? `Your rank: #${myRank}${reservationSlots ? ` (top ${reservationSlots} win)` : ""}`
                      : reservationSlots
                        ? `Top ${reservationSlots} bidders will win a reservation.`
                        : null}
                  </p>
                )}
              </div>
            )}

            {/* Live leaderboard */}
            <div className="border-t border-red-600/20 pt-4">
              <h3 className="text-sm font-semibold text-white mb-3">Live leaderboard</h3>
              {bidsLoading ? (
                <p className="text-xs text-white/50">Loading bids…</p>
              ) : bidsError ? (
                <p className="text-xs text-red-400">{bidsError}</p>
              ) : bids.length === 0 ? (
                <p className="text-sm text-white/50 py-4 text-center rounded-lg bg-black/40 border border-dashed border-red-600/20">
                  No bids yet. Be the first to bid.
                </p>
              ) : (
                <div className="rounded-lg border border-red-600/20 overflow-hidden">
                  <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-4 py-2 bg-red-950/20 text-[10px] uppercase tracking-wider text-white/60">
                    <span>Rank</span>
                    <span>Address</span>
                    <span>Size</span>
                    <span>Amount</span>
                  </div>
                  {bids.slice(0, 10).map((b) => (
                    <div
                      key={`${b.evm_address}-${b.created_at}`}
                      className={`grid grid-cols-[auto_1fr_auto_auto] gap-3 px-4 py-2.5 text-sm border-t border-red-600/10 ${
                        evmAddress?.toLowerCase() === b.evm_address.toLowerCase()
                          ? "bg-red-600/10"
                          : ""
                      }`}
                    >
                      <span className="font-mono font-semibold text-red-400">#{b.rank}</span>
                      <span className="font-mono text-white/90 truncate">
                        {b.evm_address.slice(0, 6)}…{b.evm_address.slice(-4)}
                      </span>
                      <span className="text-white/80">{b.size ?? "—"}</span>
                      <span className="font-semibold text-emerald-400">
                        ${b.bid_amount_usd.toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {bids.length > 10 && (
                    <div className="px-4 py-2 text-xs text-white/50 border-t border-red-600/10">
                      + {bids.length - 10} more bidder{bids.length - 10 === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
              )}
            </div>

            <p className="text-[10px] text-white/40 text-center">
              Yellow Network · Sepolia · ytest.usd ·{" "}
              <a href="https://yellow.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-white/60">
                yellow.org
              </a>
            </p>
          </div>
        </div>
      )}

      {/* Section 3: Admin — settle Yellow bids & close reservations */}
      {isAdmin && !biddingClosed && (
        <div className="rounded-xl border border-red-600/40 bg-black/80 backdrop-blur-sm overflow-hidden shadow-xl">
          <div className="p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-white">
                Admin: settle Yellow bids & close reservations
              </h2>
              <button
                type="button"
                onClick={handleAdminLoadSummary}
                disabled={adminSummaryLoading}
                className="rounded-lg border border-red-600/50 bg-red-950/40 px-4 py-2 text-sm font-medium text-white/90 hover:bg-red-950/60 disabled:opacity-50 transition-colors"
              >
                {adminSummaryLoading ? "Loading…" : "Preview winners"}
              </button>
            </div>
            <p className="text-xs text-white/60">
              Preview reads bids from Supabase. Settlement: 1) updates DB (winners marked, bidding closed),
              2) each winner signs in their browser via Yellow Network to release funds to the organizer.
            </p>
            {adminSummaryError && (
              <div className="rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3">
                <p className="text-sm text-red-400">{adminSummaryError}</p>
              </div>
            )}

            {adminWinners.length > 0 && (
              <div className="space-y-4">
                <div className="rounded-lg border border-red-600/30 bg-black/60 p-4">
                  <p className="text-sm font-medium text-white/90 mb-3">
                    Winners ({adminWinners.length}) — total $
                    {adminTotalWinningUsd.toFixed(2)} to{" "}
                    <span className="font-mono text-xs">
                      {drop.reservation_evm_recipient
                        ? `${drop.reservation_evm_recipient.slice(0, 6)}…${drop.reservation_evm_recipient.slice(-4)}`
                        : "not set"}
                    </span>
                  </p>
                  <div className="rounded border border-red-600/20 overflow-hidden">
                    <div className="grid grid-cols-[auto_1fr_auto] gap-3 px-3 py-2 bg-red-950/30 text-[10px] uppercase tracking-wider text-white/60">
                      <span>Rank</span>
                      <span>Address</span>
                      <span>Amount</span>
                    </div>
                    {adminWinners.map((w) => (
                      <div
                        key={`${w.evm_address}-${w.rank}`}
                        className="grid grid-cols-[auto_1fr_auto] gap-3 px-3 py-2 text-sm border-t border-red-600/10"
                      >
                        <span className="font-mono font-semibold text-emerald-400">#{w.rank}</span>
                        <span className="font-mono text-white/90 truncate">
                          {w.evm_address.slice(0, 6)}…{w.evm_address.slice(-4)}
                        </span>
                        <span className="font-semibold text-white">${w.bid_amount_usd.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {adminLosers.length > 0 && (
                  <p className="text-xs text-amber-400/90">
                    {adminLosers.length} additional bidder
                    {adminLosers.length === 1 ? "" : "s"} will not be reserved (refunded).
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleAdminSettleAndClose}
                  disabled={adminSettlementRunning}
                  className={`w-full rounded-lg px-4 py-3 text-sm font-semibold transition-all ${btnClass} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {adminSettlementRunning
                    ? "Settling via Yellow…"
                    : "Settle winners via Yellow & close bidding"}
                </button>
              </div>
            )}

            {adminWinners.length === 0 && !adminSummaryLoading && (
              <p className="text-sm text-white/50 py-4 text-center rounded-lg bg-black/40 border border-dashed border-red-600/20">
                Load the summary first to see current winners and totals.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Bidding closed: winners, losers, non-participants */}
      {hasBidding && biddingClosed && (
        <div className="rounded-xl border border-red-600/40 bg-black/80 backdrop-blur-sm overflow-hidden shadow-xl">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white">Bidding closed</h2>
              <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/30">
                Yellow Network
              </span>
            </div>

            {(() => {
              const myBidResult = evmAddress
                ? bids.find((b) => b.evm_address.toLowerCase() === evmAddress.toLowerCase())
                : null;
              const myWinningBid = myBidResult?.status === "won" ? myBidResult : null;
              const myLosingBid = myBidResult?.status === "lost" ? myBidResult : null;
              const hasWinners = bids.some((b) => b.status === "won");
              const participatedButLost = evmAddress && bids.some((b) => b.evm_address.toLowerCase() === evmAddress.toLowerCase());
              const didntParticipate = evmAddress && !participatedButLost && hasWinners;

              // Loser: refund message
              if (myLosingBid && evmAddress) {
                const refundAmount = myLosingBid.bid_amount_usd;
                return (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-4 space-y-2">
                    <p className="text-sm font-medium text-amber-400">
                      Unfortunately there were higher bids in this drop who won.
                    </p>
                    <p className="text-xs text-white/70">
                      Your bid amount (${refundAmount.toFixed(2)}) has been returned to your Yellow balance.
                    </p>
                  </div>
                );
              }

              // Winner: reservation message + release funds
              if (myWinningBid && evmAddress) {
                const channelId = yellowSession?.channelId ?? getStoredChannelId(evmAddress);
                const canRelease = drop?.reservation_evm_recipient && channelId && !useYellowSandbox();
                return (
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 p-4 space-y-3">
                    <p className="text-sm font-medium text-emerald-400">You reserved a t-shirt.</p>
                    <p className="text-xs text-white/70">
                      Show this message to the authority to claim your t-shirt.
                    </p>
                    {canRelease && (
                      <>
                        <p className="text-xs text-white/60">
                          Sign with your wallet to release ${myWinningBid.bid_amount_usd.toFixed(2)} to the organizer.
                        </p>
                        <button
                          type="button"
                          onClick={handleReleaseFunds}
                          disabled={releasingFunds}
                          className={`rounded-lg px-4 py-2 text-sm font-semibold ${btnClass} disabled:opacity-50`}
                        >
                          {releasingFunds ? "Releasing…" : "Release funds"}
                        </button>
                      </>
                    )}
                  </div>
                );
              }

              // Winner potential: not connected — prompt to connect
              if (hasWinners && !evmAddress) {
                return (
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 p-4 space-y-3">
                    <p className="text-sm text-white/90">Connect your EVM wallet to see your result.</p>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          if (!hasEvmProvider()) throw new Error("No EVM wallet");
                          const addr = await connectYellowWallet();
                          setEvmAddress(addr);
                          const stored = getStoredEvmSession();
                          if (stored && addr.toLowerCase() === stored.evmAddress.toLowerCase()) {
                            const bal = useYellowSandbox() ? getStoredYellowBalance(addr) : stored.depositedUsd;
                            setYellowSession({ userAddress: addr, appId: "onchaindrips-nfc-bidding", depositedUsd: bal, channelId: stored.channelId });
                          }
                        } catch (e) {
                          setYellowError(e instanceof Error ? e.message : "Failed");
                        }
                      }}
                      className={`rounded-lg px-4 py-2 text-sm font-semibold ${btnClass}`}
                    >
                      Connect wallet
                    </button>
                  </div>
                );
              }

              // Didn't participate but bidding closed with winners
              if (didntParticipate) {
                return (
                  <div className="rounded-lg border border-white/20 bg-white/5 p-4">
                    <p className="text-sm text-white/80">
                      Bidding has closed. You did not place a bid in this drop.
                    </p>
                    <p className="text-xs text-white/50 mt-1">
                      Winners are shown below.
                    </p>
                  </div>
                );
              }

              return null;
            })()}

            {/* Results summary */}
            {bidsLoading ? (
              <p className="text-sm text-white/50">Loading results…</p>
            ) : bids.length === 0 ? (
              <div className="rounded-lg border border-dashed border-red-600/20 bg-black/40 p-6 text-center">
                <p className="text-sm text-white/60">No bids were placed for this drop.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-white/90 mb-2">Winners (top {slots})</h3>
                  <div className="rounded-lg border border-emerald-500/30 overflow-hidden">
                    <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-3 py-2 bg-emerald-950/30 text-[10px] uppercase tracking-wider text-white/60">
                      <span>Rank</span>
                      <span>Address</span>
                      <span>Size</span>
                      <span>Amount</span>
                    </div>
                    {bids
                      .filter((b) => b.status === "won")
                      .sort((a, b) => a.rank - b.rank)
                      .map((b) => (
                        <div
                          key={`${b.evm_address}-won`}
                          className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-3 py-2 text-sm border-t border-emerald-500/10"
                        >
                          <span className="font-mono font-semibold text-emerald-400">#{b.rank}</span>
                          <span className="font-mono text-white/90 truncate">
                            {b.evm_address.slice(0, 6)}…{b.evm_address.slice(-4)}
                          </span>
                          <span className="text-white/80">{b.size ?? "—"}</span>
                          <span className="font-semibold text-emerald-400">${b.bid_amount_usd.toFixed(2)}</span>
                        </div>
                      ))}
                  </div>
                </div>

                {bids.some((b) => b.status === "lost") && (
                  <details className="group">
                    <summary className="cursor-pointer text-sm text-white/70 hover:text-white">
                      Show all bids (including outbid)
                    </summary>
                    <div className="mt-2 rounded-lg border border-red-600/20 overflow-hidden">
                      <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-3 py-2 bg-red-950/20 text-[10px] uppercase tracking-wider text-white/60">
                        <span>Rank</span>
                        <span>Address</span>
                        <span>Size</span>
                        <span>Amount</span>
                        <span>Status</span>
                      </div>
                      {bids
                        .sort((a, b) => a.rank - b.rank)
                        .map((b) => (
                          <div
                            key={`${b.evm_address}-${b.rank}`}
                            className={`grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-3 py-2 text-sm border-t border-red-600/10 ${
                              b.status === "lost" ? "text-white/60" : ""
                            }`}
                          >
                            <span className="font-mono">#{b.rank}</span>
                            <span className="font-mono truncate">
                              {b.evm_address.slice(0, 6)}…{b.evm_address.slice(-4)}
                            </span>
                            <span>{b.size ?? "—"}</span>
                            <span>${b.bid_amount_usd.toFixed(2)}</span>
                            <span
                              className={
                                b.status === "won"
                                  ? "text-emerald-400"
                                  : b.status === "lost"
                                    ? "text-amber-400"
                                    : "text-white/50"
                              }
                            >
                              {b.status}
                            </span>
                          </div>
                        ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
