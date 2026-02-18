"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ralewayBlackItalic } from "./fonts";

const NFC_HOW_IT_WORKS = [
  {
    id: 1,
    title: "Exclusivity over free merch",
    description:
      "NFC-enabled t-shirts remove the word \"free\" from merchandise and bring exclusivity and value to each piece. The next time you're at a conference, you'll be wearing a physical on-chain asset—not just a regular t-shirt.",
    icon: "✨",
    gradient: "from-red-950/80 to-black/80",
  },
  {
    id: 2,
    title: "Exclusive drops for your event",
    description:
      "Web3 companies collaborate with us to create exclusive drops for their events. If company XYZ is running an event and launching 100 limited-edition t-shirts, we manufacture them from scratch and embed NFC in each. The chip carries the physical asset data—an NFT that attendees claim and mint at the event.",
    icon: "🎫",
    gradient: "from-amber-950/80 to-black/80",
  },
  {
    id: 3,
    title: "Scan, mint, collect",
    description:
      "Users mint an NFT to their wallet and hold it as a rare collectible for future trading. To mint, they simply scan the NFC on the t-shirt and tap the mint button—the NFT is sent to their wallet in seconds.",
    icon: "📱",
    gradient: "from-emerald-950/80 to-black/80",
  },
  {
    id: 4,
    title: "Your profile on the shirt",
    description:
      "Users can attach personal info and social handles to their NFT. At events, skip swapping Telegram handles—let someone scan the NFC on your t-shirt to discover who you are and connect.",
    icon: "👤",
    gradient: "from-blue-950/80 to-black/80",
  },
  {
    id: 5,
    title: "Trade & collect",
    description:
      "Holders of exclusive t-shirts can trade and collect them like any other digital collectible. Each piece is verifiable, scarce, and tied to real-world value.",
    icon: "🔄",
    gradient: "from-violet-950/80 to-black/80",
  },
  {
    id: 6,
    title: "Future: airdrops, VIP, and more",
    description:
      "We're adding more utility: companies can airdrop to exclusive holders, prioritize them for perks, and use the t-shirt as a working asset—e.g. priority access to VIP zones and conferences—not just a collectible.",
    icon: "🚀",
    gradient: "from-rose-950/80 to-black/80",
  },
];

const glitchColors = [
  "#ffffff",
  "#000000",
  "#ffffff",
  "#000000",
  "#ffffff",
  "#000000",
  "#ffffff",
  "#000000",
  "#ffffff",
  "#000000",
  "#ffffff",
  "#000000",
  "#ffffff",
  "#000000",
  "#ffffff",
  "#000000",
  "#ffffff",
];

export default function LandingPage() {
  const nfcScrollRef = useRef<HTMLDivElement>(null);
  const [nfcActiveIndex, setNfcActiveIndex] = useState(0);

  useEffect(() => {
    const el = nfcScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const slideWidth = el.scrollWidth / NFC_HOW_IT_WORKS.length;
      const index = Math.round(el.scrollLeft / slideWidth);
      setNfcActiveIndex(
        Math.min(Math.max(0, index), NFC_HOW_IT_WORKS.length - 1)
      );
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToNfc = (index: number) => {
    const el = nfcScrollRef.current;
    if (!el) return;
    const slideWidth = el.scrollWidth / NFC_HOW_IT_WORKS.length;
    el.scrollTo({ left: index * slideWidth, behavior: "smooth" });
  };

  return (
    <>
      {/* Hero: pulled up behind transparent navbar so image shows through */}
      <section className="relative min-h-[85vh] w-full flex flex-col items-center justify-center overflow-hidden -mt-24">
        {/* Full-width hero image — animates in first */}
        <div className="absolute inset-0 w-screen left-1/2 -translate-x-1/2 overflow-hidden">
          <motion.div
            className="relative w-full h-full"
            initial={{ opacity: 0, scale: 1.06, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <Image
              src="/images/hero6.png"
              alt="OnChainDrips merchandise — branded apparel for web3 brands"
              fill
              className="object-cover object-center"
              style={{ objectPosition: "center 0rem" }}
              sizes="100vw"
              priority
            />
          </motion.div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-red-950/40 via-transparent to-red-950/30 pointer-events-none" />
        <div className="relative z-10 px-4 text-center">
          <motion.h1
            className={`${ralewayBlackItalic.className} text-6xl md:text-5xl lg:text-9xl mt-[30rem] font-bold max-w-8xl mx-auto drop-shadow-lg italic`}
            initial={{ opacity: 0, letterSpacing: "0.6em" }}
            animate={{
              opacity: 1,
              letterSpacing: "0.02em",
              color: glitchColors,
            }}
            transition={{
              opacity: { duration: 1.25, ease: "easeOut", delay: 0.25 },
              letterSpacing: { duration: 1.25, ease: "easeOut", delay: 0.25 },
              color: {
                duration: 1.25,
                delay: 0.25,
                times: glitchColors.map(
                  (_, i) => i / (glitchColors.length - 1)
                ),
              },
            }}
          >
            OnChainDrips
          </motion.h1>
          <motion.p
            className="mt-6 text-lg md:text-3xl text-white/90 max-w-4xl mx-auto drop-shadow-md font-semibold"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut", delay: 1.6 }}
          >
            NFC-enabled merch, B2B Merchandise and on-chain utility.
          </motion.p>
          <motion.div
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: "easeOut", delay: 2.1 }}
          >
            <Link
              href="/drops"
              className="rounded-xl bg-red-600 px-8 py-3.5 text-base font-semibold text-white shadow-[0_0_20px_rgba(220,38,38,0.4)] hover:bg-red-500 hover:shadow-[0_0_28px_rgba(220,38,38,0.5)] transition-all duration-300 hover:scale-105"
            >
              Explore drops
            </Link>
            <Link
              href="/drops"
              className="rounded-xl border border-red-600/50 bg-transparent px-8 py-3.5 text-base font-semibold text-white hover:bg-red-600/10 transition-colors duration-300 hover:scale-105"
            >
              View marketplace
            </Link>
          </motion.div>
        </div>
      </section>

      {/* How NFC-enabled t-shirts work — horizontal snap scroll */}
      <section className="py-20 px-0 border-y border-red-600/20 bg-black/40">
        <div className="px-4 mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-white text-center">
            How NFC-enabled t-shirts work
          </h2>
          <p className="mt-2 text-white/70 text-center max-w-xl mx-auto text-sm md:text-base">
            From exclusive drops to minting, profiles, and future utility.
          </p>
        </div>
        <div
          ref={nfcScrollRef}
          className="flex overflow-x-auto snap-x snap-mandatory gap-6 pb-12 px-4 md:px-8 scroll-smooth scrollbar-hide"
          style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        >
          {NFC_HOW_IT_WORKS.map((item, index) => (
            <article
              key={item.id}
              className="flex-shrink-0 w-[85vw] md:w-[75vw] max-w-4xl snap-center rounded-2xl overflow-hidden border border-red-600/20 bg-black/60 backdrop-blur-sm flex flex-col md:flex-row min-h-[320px] md:min-h-[280px]"
            >
              <div
                className={`w-full md:w-2/5 min-h-[180px] md:min-h-full bg-gradient-to-br ${item.gradient} flex items-center justify-center p-8`}
              >
                <span className="text-6xl md:text-7xl opacity-90" aria-hidden>
                  {item.icon}
                </span>
              </div>
              <div className="flex-1 p-6 md:p-8 flex flex-col justify-center">
                <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">
                  {String(item.id).padStart(2, "0")}
                </span>
                <h3 className="mt-1 text-xl md:text-2xl font-bold text-white">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm md:text-base text-white/80 leading-relaxed">
                  {item.description}
                </p>
              </div>
            </article>
          ))}
        </div>
        <div className="flex justify-center gap-2 pt-2">
          {NFC_HOW_IT_WORKS.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => scrollToNfc(index)}
              className={`h-2 rounded-full transition-all duration-300 ${
                index === nfcActiveIndex
                  ? "w-8 bg-red-500"
                  : "w-2 bg-white/30 hover:bg-white/50"
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </section>

      {/* Value / Features strip */}
      <section className="border-y border-red-600/20 bg-black/30 py-16 px-4">
        <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-10 text-center">
          <div>
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-600/20 text-red-400 mb-4">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white">Web3-native</h3>
            <p className="mt-2 text-sm text-white/70">
              Drops and claims tied to on-chain identity and NFTs.
            </p>
          </div>
          <div>
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-600/20 text-red-400 mb-4">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white">For brands</h3>
            <p className="mt-2 text-sm text-white/70">
              Run limited drops, events, and collectible merchandise at scale.
            </p>
          </div>
          <div>
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-600/20 text-red-400 mb-4">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white">
              Verifiable & scarce
            </h3>
            <p className="mt-2 text-sm text-white/70">
              Proof of ownership and authenticity on-chain.
            </p>
          </div>
        </div>
      </section>

      {/* NFC-enabled t-shirts & drops — main CTA section */}
      <section id="nfc-drops" className="py-24 px-4">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white">
            NFC-enabled t-shirts & drops
          </h2>
          <p className="mt-6 text-lg text-white/80 max-w-2xl mx-auto">
            Each piece of merchandise can carry an NFC chip. Tap to verify
            authenticity, view the drop, or unlock on-chain benefits. Brands
            launch limited drops; fans claim, collect, and connect.
          </p>
          <ul className="mt-8 text-left max-w-md mx-auto space-y-3 text-white/80">
            <li className="flex items-center gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-red-600/30 flex items-center justify-center text-red-400 text-sm font-semibold">
                1
              </span>
              Browse live and upcoming drops from web3 brands.
            </li>
            <li className="flex items-center gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-red-600/30 flex items-center justify-center text-red-400 text-sm font-semibold">
                2
              </span>
              Claim or bid for limited-edition NFC-enabled merchandise.
            </li>
            <li className="flex items-center gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-red-600/30 flex items-center justify-center text-red-400 text-sm font-semibold">
                3
              </span>
              Tap your shirt to verify and access on-chain utility.
            </li>
          </ul>
          <Link
            href="/drops"
            className="mt-12 inline-block rounded-xl bg-red-600 px-8 py-3.5 text-base font-semibold text-white shadow-[0_0_20px_rgba(220,38,38,0.4)] hover:bg-red-500 hover:shadow-[0_0_28px_rgba(220,38,38,0.5)] transition-all duration-300"
          >
            Explore drops
          </Link>
        </div>
      </section>

      {/* Footer strip */}
      <section className="border-t border-red-600/20 py-10 px-4">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-white/50">
            OnChainDrips — B2B merchandise for web3 brands.
          </p>
          <div className="flex items-center gap-6">
            <Link
              href="/drops"
              className="text-sm font-medium text-white/70 hover:text-white transition-colors"
            >
              Drops
            </Link>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-white/70 hover:text-white transition-colors"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
