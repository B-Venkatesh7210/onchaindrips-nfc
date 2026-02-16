"use client";

import Image from "next/image";
import Link from "next/link";

export default function LandingPage() {
  return (
    <>
      {/* Hero: pulled up behind transparent navbar so image shows through */}
      <section className="relative min-h-[85vh] w-full flex flex-col items-center justify-center overflow-hidden -mt-24">
        {/* Full-width hero image */}
        <div className="absolute inset-0 w-screen left-1/2 -translate-x-1/2">
          <div className="relative w-full h-full">
            <Image
              src="/images/hero6.png"
              alt="OnChainDrips merchandise — branded apparel for web3 brands"
              fill
              className="object-cover object-center"
              style={{ objectPosition: "center 0rem" }}
              sizes="100vw"
              priority
            />
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-red-950/40 via-transparent to-red-950/30 pointer-events-none" />
        <div className="relative z-10 px-4 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight max-w-4xl mx-auto drop-shadow-lg">
            OnChainDrips
          </h1>
          <p className="mt-6 text-lg md:text-xl text-white/90 max-w-2xl mx-auto drop-shadow-md">
            B2B merchandise for web3 brands. Physical products, on-chain
            utility.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/drops"
              className="rounded-xl bg-red-600 px-8 py-3.5 text-base font-semibold text-white shadow-[0_0_20px_rgba(220,38,38,0.4)] hover:bg-red-500 hover:shadow-[0_0_28px_rgba(220,38,38,0.5)] transition-all duration-300"
            >
              Explore drops
            </Link>
            <Link
              href="/drops"
              className="rounded-xl border border-red-600/50 bg-transparent px-8 py-3.5 text-base font-semibold text-white hover:bg-red-600/10 transition-colors duration-300"
            >
              View marketplace
            </Link>
          </div>
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
