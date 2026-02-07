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
        <p className="text-neutral-500">Invalid drop.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-neutral-600 hover:text-neutral-900">← Home</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="h-8 w-48 animate-pulse rounded bg-neutral-200" />
        <div className="mt-4 h-4 w-full animate-pulse rounded bg-neutral-100" />
      </div>
    );
  }

  if (!drop) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-neutral-500">Drop not found.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-neutral-600 hover:text-neutral-900">← Home</Link>
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <Link
        href="/"
        className="text-sm text-neutral-500 hover:text-neutral-700"
      >
        ← Back to drops
      </Link>

      <div className="mt-2 rounded-xl border border-neutral-200 bg-white p-6">
        <h1 className="text-2xl font-bold text-neutral-900">{drop.name}</h1>
        <p className="mt-1 text-neutral-600">{drop.company_name}</p>
        <p className="text-sm text-neutral-500">{drop.event_name}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-700">
            {minted} / {total} minted
          </span>
          {drop.release_date && (
            <span className="text-sm text-neutral-500">
              Release: {drop.release_date}
            </span>
          )}
          {typeof drop.reservation_slots === "number" &&
            drop.reservation_slots > 0 && (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                {drop.reservation_slots} reservation slots
              </span>
            )}
        </div>
        {hasSizeInfo && (
          <div className="mt-3 text-xs text-neutral-600">
            <span className="font-medium">Available sizes:</span>{" "}
            {sizeInfo
              .filter((s) => s.value && s.value > 0)
              .map((s) => `${s.label} (${s.value})`)
              .join(", ")}
          </div>
        )}
        {(drop.description ??
          (drop.offchain_attributes &&
          typeof drop.offchain_attributes === "object" &&
          "description" in drop.offchain_attributes
            ? (drop.offchain_attributes as { description?: string })
                .description
            : null)) && (
          <p className="mt-4 text-neutral-600 text-sm">
            {String(
              drop.description ??
                (
                  (drop.offchain_attributes as { description?: string }) ??
                  {}
                ).description ??
                "",
            )}
          </p>
        )}
      </div>

      {/* Bidding panel (public, backed by Yellow session) */}
      {hasBidding && !biddingClosed && (
          <div className="rounded-xl border border-neutral-200 bg-white p-6 space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-neutral-900">
                Bid for a reserved shirt
              </h2>
              <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 border border-amber-200">
                Powered by Yellow Network
              </span>
            </div>
            <p className="text-sm text-neutral-600">
              Bids use Yellow Network on Sepolia with ytest.usd. Connect your EVM wallet, request
              test tokens from the faucet, fund your channel, then place your bid. No gas for
              bidding—winners sign to release funds at settlement. Rabby wallet recommended.
            </p>

            {yellowError && (
              <div className="space-y-1">
                <p className="text-sm text-red-600">{yellowError}</p>
                <p className="text-xs text-neutral-500">
                  Open browser console (F12) → Console tab for step-by-step logs and where it failed.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-medium text-neutral-600">
                    Yellow session
                  </p>
                  <p className="text-xs text-neutral-500">
                    {yellowSession && evmAddress
                      ? `Connected: ${evmAddress.slice(0, 8)}…${evmAddress.slice(
                          -6,
                        )} · $${yellowSession.depositedUsd.toFixed(2)}${
                          yellowSession.channelId ? " (channel funded)" : ""
                        }`
                      : "Connect an EVM wallet to start a Yellow session."}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {!yellowSession && (
                    <button
                      type="button"
                      onClick={handleConnectYellow}
                      disabled={connectingYellow}
                      className="inline-flex items-center justify-center rounded-lg bg-neutral-900 px-3 py-2 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {connectingYellow
                        ? yellowStep ?? "Connecting wallet…"
                        : "Connect wallet & fund (ytest.usd)"}
                    </button>
                  )}
                  {yellowSession && (
                    <button
                      type="button"
                      onClick={handleTopUp}
                      disabled={toppingUp}
                      className="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {toppingUp ? "Requesting…" : "Request more tokens"}
                    </button>
                  )}
                </div>
              </div>

              {hasPlacedBid ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-sm font-medium text-emerald-800">
                    Already bid placed
                  </p>
                  <p className="mt-0.5 text-xs text-emerald-700">
                    Your bid: ${myBid?.bid_amount_usd?.toFixed(2) ?? "—"}
                    {myBid?.size ? ` · Size ${myBid.size}` : ""}
                    {myRank ? ` · Rank #${myRank}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-emerald-600">
                    Wait for the bidding to get closed.
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Your bid (USD)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={bidAmountInput}
                      onChange={(e) => setBidAmountInput(e.target.value)}
                      className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
                      placeholder="e.g. 25.00"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Size
                    </label>
                    <select
                      value={mySize}
                      onChange={(e) =>
                        setMySize(e.target.value as
                          | "S"
                          | "M"
                          | "L"
                          | "XL"
                          | "XXL"
                          | "")
                      }
                      className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none"
                    >
                      <option value="">Select size</option>
                      <option value="S">S</option>
                      <option value="M">M</option>
                      <option value="L">L</option>
                      <option value="XL">XL</option>
                      <option value="XXL">XXL</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handlePlaceBid}
                    disabled={placingBid}
                    className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {placingBid ? "Placing bid…" : "Place bid"}
                  </button>
                </>
              )}

              {(myRank || reservationSlots) && (
                <p className="text-xs text-neutral-600">
                  {myRank
                    ? `Your current rank: #${myRank}${
                        reservationSlots
                          ? ` (top ${reservationSlots} will win a reservation)`
                          : ""
                      }`
                    : reservationSlots
                      ? `Top ${reservationSlots} bidders will win a reservation.`
                      : null}
                </p>
              )}
            </div>

            <div className="border-t border-neutral-200 pt-4">
              <h3 className="text-sm font-semibold text-neutral-900">
                Live leaderboard
              </h3>
              {bidsLoading ? (
                <p className="mt-2 text-xs text-neutral-500">Loading bids…</p>
              ) : bidsError ? (
                <p className="mt-2 text-xs text-red-600">{bidsError}</p>
              ) : bids.length === 0 ? (
                <p className="mt-2 text-xs text-neutral-500">
                  No bids yet. Be the first to bid.
                </p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {bids.slice(0, 10).map((b) => (
                    <li
                      key={`${b.evm_address}-${b.created_at}`}
                      className="flex items-center justify-between text-xs text-neutral-700"
                    >
                      <span className="font-mono text-[11px] text-neutral-500">
                        #{b.rank} ·{" "}
                        {`${b.evm_address.slice(0, 6)}…${b.evm_address.slice(
                          -4,
                        )}`}
                      </span>
                      <span className="font-medium">
                        ${b.bid_amount_usd.toFixed(2)}
                      </span>
                    </li>
                  ))}
                  {bids.length > 10 && (
                    <li className="mt-1 text-[11px] text-neutral-400">
                      + {bids.length - 10} more bidder
                      {bids.length - 10 === 1 ? "" : "s"}
                    </li>
                  )}
                </ul>
              )}
            </div>
            <div className="border-t border-neutral-100 pt-3 mt-2">
              <p className="text-[10px] text-neutral-400">
                Yellow Network · Sepolia · ytest.usd ·{" "}
                <a href="https://yellow.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-neutral-600">
                  yellow.org
                </a>
              </p>
            </div>
          </div>
        )}

      {/* Admin-only: Yellow settlement preview + close-bids helper */}
      {isAdmin && !biddingClosed && (
        <div className="rounded-xl border border-neutral-200 bg-white p-6 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-neutral-900">
              Admin: settle Yellow bids & close reservations
            </h2>
            <button
              type="button"
              onClick={handleAdminLoadSummary}
              disabled={adminSummaryLoading}
              className="rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
            >
              {adminSummaryLoading ? "Loading…" : "Preview winners"}
            </button>
          </div>
          <p className="text-xs text-neutral-600">
            Preview reads bids from Supabase. Settlement: 1) updates DB (winners
            marked, bidding closed), 2) each winner signs in their browser via Yellow Network
            to release funds to the organizer.
          </p>
          {adminSummaryError && (
            <p className="text-xs text-red-600">{adminSummaryError}</p>
          )}

          {adminWinners.length > 0 && (
            <div className="mt-2 space-y-2">
              <p className="text-xs font-medium text-neutral-800">
                Winners ({adminWinners.length}) — total ${" "}
                {adminTotalWinningUsd.toFixed(2)} to{" "}
                {drop.reservation_evm_recipient
                  ? drop.reservation_evm_recipient
                  : "reservation_evm_recipient not set"}
              </p>
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded border border-neutral-200 bg-neutral-50 p-2">
                {adminWinners.map((w) => (
                  <li
                    key={`${w.evm_address}-${w.rank}`}
                    className="flex items-center justify-between text-[11px] text-neutral-700"
                  >
                    <span className="font-mono text-[11px] text-neutral-500">
                      #{w.rank} ·{" "}
                      {`${w.evm_address.slice(0, 6)}…${w.evm_address.slice(
                        -4,
                      )}`}
                    </span>
                    <span className="font-medium">
                      ${w.bid_amount_usd.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>

              {adminLosers.length > 0 && (
                <p className="text-[11px] text-neutral-500">
                  {adminLosers.length} additional bidder
                  {adminLosers.length === 1 ? "" : "s"} will not be reserved.
                </p>
              )}

              <button
                type="button"
                onClick={handleAdminSettleAndClose}
                disabled={adminSettlementRunning}
                className="mt-2 w-full rounded-lg bg-neutral-900 px-4 py-2 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {adminSettlementRunning
                  ? "Settling via Yellow…"
                  : "Settle winners via Yellow & close bidding"}
              </button>
            </div>
          )}

          {adminWinners.length === 0 && !adminSummaryLoading && (
            <p className="text-xs text-neutral-500">
              Load the summary first to see current winners and totals.
            </p>
          )}
        </div>
      )}

      {/* If bidding already closed, show winners/losers summary for everyone */}
      {hasBidding && biddingClosed && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-emerald-900">
              Bidding closed
            </h2>
            <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 border border-amber-200">
              Yellow Network
            </span>
          </div>
          {(() => {
            const myBidResult = evmAddress
              ? bids.find((b) => b.evm_address.toLowerCase() === evmAddress.toLowerCase())
              : null;
            const myWinningBid = myBidResult?.status === "won" ? myBidResult : null;
            const myLosingBid = myBidResult?.status === "lost" ? myBidResult : null;

            // Loser: show message (balance refund handled in useEffect)
            if (myLosingBid && evmAddress) {
              const refundAmount = myLosingBid.bid_amount_usd;
              return (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
                  <p className="text-sm font-medium text-amber-900">
                    Unfortunately there were higher bids in this drop who won.
                  </p>
                  <p className="text-xs text-amber-800">
                    Your bid amount (${refundAmount.toFixed(2)}) has been returned to your wallet.
                  </p>
                </div>
              );
            }

            // Winner: show reservation message
            if (myWinningBid && evmAddress) {
              const channelId = yellowSession?.channelId ?? getStoredChannelId(evmAddress);
              const canRelease = drop?.reservation_evm_recipient && channelId && !useYellowSandbox();
              return (
                <div className="rounded-lg border border-emerald-300 bg-white p-4 space-y-2">
                  <p className="text-sm font-medium text-emerald-900">
                    You reserved a t-shirt for yourself.
                  </p>
                  <p className="text-xs text-emerald-700">
                    Show this message to the authority and avail a t-shirt.
                  </p>
                  {canRelease && (
                    <>
                      <p className="text-xs text-emerald-600">
                        Sign with your wallet to release ${myWinningBid.bid_amount_usd.toFixed(2)} to the organizer.
                      </p>
                      <button
                        type="button"
                        onClick={handleReleaseFunds}
                        disabled={releasingFunds}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {releasingFunds ? "Releasing…" : "Release funds"}
                      </button>
                    </>
                  )}
                </div>
              );
            }
            const hasWinners = bids.some((b) => b.status === "won");
            if (hasWinners && !evmAddress) {
              return (
                <div className="rounded-lg border border-emerald-300 bg-white p-4 space-y-2">
                  <p className="text-xs text-emerald-700">
                    Winners: connect your EVM wallet to see your result.
                  </p>
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
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                  >
                    Connect wallet
                  </button>
                </div>
              );
            }
            return null;
          })()}
          {bidsLoading ? (
            <p className="text-xs text-emerald-700">Loading results…</p>
          ) : bids.length === 0 ? (
            <p className="text-xs text-emerald-700">
              No bids were placed for this drop.
            </p>
          ) : (
            <>
              <p className="text-xs text-emerald-800">
                Winners (top {slots}):
              </p>
              <ul className="mt-1 space-y-1 text-xs text-emerald-900">
                {bids
                  .filter((b) => b.status === "won")
                  .sort((a, b) => a.rank - b.rank)
                  .map((b) => (
                    <li key={`${b.evm_address}-won`}>
                      #{b.rank} — {b.evm_address.slice(0, 6)}…
                      {b.evm_address.slice(-4)} — $
                      {b.bid_amount_usd.toFixed(2)}
                      {b.size ? ` · ${b.size}` : ""}
                    </li>
                  ))}
              </ul>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-emerald-800">
                  Show all bids
                </summary>
                <ul className="mt-1 space-y-1 text-xs text-emerald-900">
                  {bids.map((b) => (
                    <li key={`${b.evm_address}-${b.rank}`}>
                      #{b.rank} — {b.evm_address.slice(0, 6)}…
                      {b.evm_address.slice(-4)} — $
                      {b.bid_amount_usd.toFixed(2)} ({b.status}
                      {b.size ? `, ${b.size}` : ""})
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </div>
      )}
    </div>
  );
}
