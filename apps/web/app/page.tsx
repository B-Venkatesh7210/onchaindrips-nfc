"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Twitter, Send, Mail as MailIcon } from "lucide-react";
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

const productTitleGlitchColors = [...glitchColors.slice(0, -1), "#000000"];

const NFC_AUTO_SCROLL_MS = 5500;

const PRODUCT_CATEGORIES = [
  {
    id: 1,
    name: "HOODIES",
    image: "/images/products/product_1.png",
  },
  {
    id: 2,
    name: "T-SHIRTS",
    image: "/images/products/product_2.png",
  },

  {
    id: 3,
    name: "POLO T-SHIRTS",
    image: "/images/products/product_3.png",
  },
  {
    id: 4,
    name: "SWEATSHIRTS",
    image: "/images/products/product_4.png",
  },
  {
    id: 5,
    name: "CAPS",
    image: "/images/products/product_5.png",
  },
];

const productGridVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.09, delayChildren: 0.12 },
  },
};

const productCardVariants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  },
};

const EXTRA_ITEMS_HOTSPOTS = [
  {
    id: "soft-toy",
    top: "10%", // vertical position relative to image height
    left: "72.5%", // horizontal position relative to image width
    title: "Soft Toy",
    description: "Mascots, plushies, soft toys and more.",
  },
  {
    id: "tote-bag",
    top: "70%", // vertical position relative to image height
    left: "95%", // horizontal position relative to image width
    title: "Tote Bag",
    description: "Customised tote bags of various sizes,designs, zip pockets and different cloth qualities.",
  },
  {
    id: "sling-bag",
    top: "14%", // vertical position relative to image height
    left: "55%", // horizontal position relative to image width
    title: "Sling Bags",
    description: "Sling bags of different qualities and custumizations available.",
  },
  {
    id: "card-holder",
    top: "17%", // vertical position relative to image height
    left: "64%", // horizontal position relative to image width
    title: "Card Holders",
    description: "Passport and Card holders with sleek design available in metal, leather and plastic.",
  },
  {
    id: "keychains",
    top: "15%", // vertical position relative to image height
    left: "16%", // horizontal position relative to image width
    title: "Keychains",
    description: "Acrylic, plastic, metal and wooden keychains of different customization with dye cuts.",
  },
  {
    id: "desk-mat",
    top: "72%", // vertical position relative to image height
    left: "52%", // horizontal position relative to image width
    title: "Desk Mat",
    description: "Desk Mat, Mouse pads to make your work setup even better, different qualities and numerous designs.",
  },
  {
    id: "metal-badge",
    top: "72%", // vertical position relative to image height
    left: "58%", // horizontal position relative to image width
    title: "Metal Badges",
    description: "Magnetic metal badges with logos for wearing over your tshirts and blazers or to pin to you backpacks.",
  },
  {
    id: "tumbler",
    top: "72%", // vertical position relative to image height
    left: "71%", // horizontal position relative to image width
    title: "Tumblers",
    description: "High quality tumblers to keep developers hydrated, available in multiple colors and sizes.",
  },
  {
    id: "thermal-cups",
    top: "70%", // vertical position relative to image height
    left: "78%", // horizontal position relative to image width
    title: "Thermal Cups",
    description: "Thermal cups to have coffee and other hot drinks to keep it warm using durable and high quality material used inside out.",
  },
  {
    id: "stickers",
    top: "55%", // vertical position relative to image height
    left: "64%", // horizontal position relative to image width
    title: "Stickers",
    description: "Black Matte, hologram, plastic and high qulaity dye cuts stickers available.",
  },
  {
    id: "shorts",
    top: "47%", // vertical position relative to image height
    left: "82%", // horizontal position relative to image width
    title: "Shorts",
    description: "Unisex shorts 100% cotton, bio washable and high quality logo prints.",
  },
  {
    id: "socks",
    top: "35%", // vertical position relative to image height
    left: "87%", // horizontal position relative to image width
    title: "Socks",
    description: "High quality fabric socks to wear outdoors, gym and even for sports.",
  },


];

const TRUSTED_BY_CLIENTS = [
  { name: "Bybit", src: "/images/clients/bybit.png", height: 80, width: 240 },
  { name: "HedgeX", src: "/images/clients/hedgex.png", height: 80, width: 240 },
  { name: "IBT26", src: "/images/clients/ibt26.svg", height: 40, width: 120 },
  { name: "IBW", src: "/images/clients/ibw.svg", height: 80, width: 240 },
  { name: "TRJ", src: "/images/clients/trj.png", height: 40, width: 120 },
  { name: "Trust", src: "/images/clients/trust.svg", height: 160, width: 480 },
];

export default function LandingPage() {
  const nfcSectionRef = useRef<HTMLElement>(null);
  const nfcScrollRef = useRef<HTMLDivElement>(null);
  const [nfcActiveIndex, setNfcActiveIndex] = useState(0);
  const nfcActiveIndexRef = useRef(0);
  const [hasHiddenExtrasTitle, setHasHiddenExtrasTitle] = useState(false);
  const [extrasTitleExiting, setExtrasTitleExiting] = useState(false);
  const [activeHotspotId, setActiveHotspotId] = useState<string | null>(null);
  const autoScrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  const scrollToNfc = useCallback((index: number) => {
    // For the single-image arc approach we no longer scroll; simply set the active index.
    setNfcActiveIndex(index);
    nfcActiveIndexRef.current = index;
  }, []);

  const startAutoScroll = useCallback(() => {
    if (autoScrollTimerRef.current) clearInterval(autoScrollTimerRef.current);
    autoScrollTimerRef.current = setInterval(() => {
      const next = (nfcActiveIndexRef.current + 1) % NFC_HOW_IT_WORKS.length;
      scrollToNfc(next);
    }, NFC_AUTO_SCROLL_MS);
  }, [scrollToNfc]);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollTimerRef.current) {
      clearInterval(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    nfcActiveIndexRef.current = nfcActiveIndex;
  }, [nfcActiveIndex]);

  // scrolling listener removed — the new layout uses state-driven slides and drag detection

  // Only run auto-scroll when the NFC section is in view
  useEffect(() => {
    const section = nfcSectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          scrollToNfc(0);
          setNfcActiveIndex(0);
          nfcActiveIndexRef.current = 0;
          startAutoScroll();
        } else {
          stopAutoScroll();
        }
      },
      { threshold: 0.25, rootMargin: "0px" }
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [scrollToNfc, startAutoScroll, stopAutoScroll]);

  const goToNfc = (index: number) => {
    if (index < 0 || index >= NFC_HOW_IT_WORKS.length) return;
    scrollToNfc(index);
    setNfcActiveIndex(index);
    startAutoScroll(); // reset timer on user interaction
  };

  return (
    <>
      {/* Hero: pulled up behind transparent navbar so image shows through */}
      <section className="relative h-[calc(100vh-6rem)] w-full flex flex-col items-center justify-center overflow-hidden -mt-24">
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
            className={`${ralewayBlackItalic.className} text-6xl md:text-5xl lg:text-9xl mt-[20rem] font-bold max-w-8xl mx-auto drop-shadow-lg italic`}
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
          {/* <motion.div
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
          </motion.div> */}
        </div>
      </section>

      {/* How NFC-enabled t-shirts work — rebuilt single-image arc (no horizontal slide) */}
      <section
        id="nfc"
        ref={nfcSectionRef}
        className="py-16 md:py-20 border-y border-red-600/20 bg-black/40"
      >
        <div className="w-full max-w-[92vw] 2xl:max-w-[2200px] mx-auto px-4 md:px-6 lg:px-10 mb-8 relative">
          {/* Centered overlay heading — animates on enter, pointer-events-none so it doesn't block interactions */}
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98, filter: "blur(6px)" }}
            whileInView={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            viewport={{ once: true, amount: 0.35 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="text-center px-4 md:px-8">
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white">
                How NFC-enabled t-shirts work
              </h2>
              <p className="mt-2 text-white/70 text-sm md:text-base max-w-2xl mx-auto">
                From exclusive drops to minting, profiles, and future utility.
              </p>
            </div>
          </motion.div>
          {/* Keep an invisible spacer so section layout stays correct */}
          <div aria-hidden className="invisible">
            <h2 className="text-2xl md:text-3xl font-bold text-white text-left">
              How NFC-enabled t-shirts work
            </h2>
            <p className="mt-2 text-white/70 text-left text-sm md:text-base max-w-xl">
              From exclusive drops to minting, profiles, and future utility.
            </p>
          </div>
        </div>

        <div className="relative w-full max-w-[92vw] 2xl:max-w-[2000px] mx-auto px-4 md:px-6 2xl:px-10">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 min-h-[360px] md:min-h-[320px]">
            {/* Text column — left */}
            <motion.div
              key={`text-${nfcActiveIndex}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="w-full md:w-1/2 bg-transparent p-0 md:pr-8"
            >
              <div className="flex flex-row justify-start items-center gap-4">
                <span className="text-4xl 2xl:text-8xl lg:text-6xl font-semibold text-red-400 uppercase tracking-wider">
                  {String(NFC_HOW_IT_WORKS[nfcActiveIndex].id).padStart(2, "0")}
                </span>
                <h3 className="mt-2 text-2xl 2xl:text-6xl lg:text-4xl md:text-3xl font-bold text-white">
                  {NFC_HOW_IT_WORKS[nfcActiveIndex].title}
                </h3>
              </div>

              <p className="mt-4 text-sm md:text-base 2xl:text-2xl text-white/80 leading-relaxed">
                {NFC_HOW_IT_WORKS[nfcActiveIndex].description}
              </p>
              <div className="mt-6">
                <Link
                  href="/drops"
                  onClick={(e) => e.preventDefault()}
                  className="group inline-block rounded-xl bg-red-600 px-6 py-2.5 text-sm md:text-base font-semibold text-white shadow-[0_0_16px_rgba(220,38,38,0.35)] transition-all duration-300 hover:bg-red-700/70 hover:shadow-none hover:cursor-not-allowed"
                >
                  <span className="group-hover:hidden">Explore drops</span>
                  <span className="hidden group-hover:inline">Coming soon</span>
                </Link>
              </div>
            </motion.div>

            {/* Image column — right (drag to change step) */}
            <motion.div
              key={`image-col-${nfcActiveIndex}`}
              className="flex items-center justify-center"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={(_, info) => {
                const offset = info.offset.x;
                const threshold = 80;
                if (offset < -threshold) {
                  const next = (nfcActiveIndex + 1) % NFC_HOW_IT_WORKS.length;
                  goToNfc(next);
                } else if (offset > threshold) {
                  const prev =
                    (nfcActiveIndex - 1 + NFC_HOW_IT_WORKS.length) %
                    NFC_HOW_IT_WORKS.length;
                  goToNfc(prev);
                } else {
                  startAutoScroll();
                }
              }}
            >
              <motion.div
                key={`img-${nfcActiveIndex}`}
                initial={{ opacity: 0, y: -220, rotate: -12, scale: 1.03 }}
                animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                transition={{ duration: 0.7, ease: [0.22, 0.9, 0.32, 1] }}
                className="w-full h-full flex items-center justify-center"
              >
                <div
                  className="w-full h-full flex items-center justify-center rounded-sm nfc-image-active"
                  style={{
                    width: "clamp(320px, 30vw, 720px)",
                    height: "clamp(240px, 28vh, 720px)",
                  }}
                >
                  <div className="relative w-full h-full rounded-sm overflow-hidden">
                    <Image
                      src={`/images/nfc/step_${NFC_HOW_IT_WORKS[nfcActiveIndex].id}.png`}
                      alt={NFC_HOW_IT_WORKS[nfcActiveIndex].title}
                      fill
                      className="object-cover"
                      sizes="(min-width: 1024px) 30vw, 80vw"
                    />
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>

          <div className="flex justify-center gap-2 pt-6">
            {NFC_HOW_IT_WORKS.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => goToNfc(index)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  index === nfcActiveIndex
                    ? "w-8 bg-red-500"
                    : "w-2 bg-white/30 hover:bg-white/50"
                }`}
                aria-label={`Go to step ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Product range section */}
      <section
        id="products"
        className="bg-gradient-to-b from-red-50 to-red-100/70 pt-8 flex justify-center items-center"
      >
        <div className="mx-2 w-screen">
          <div className="text-center mb-10">
            <motion.h2
              className={`${ralewayBlackItalic.className} text-2xl md:text-3xl lg:text-6xl font-bold tracking-wide drop-shadow-[0_0_10px_rgba(0,0,0,0.25)]`}
              initial={{ opacity: 0, letterSpacing: "0.6em" }}
              whileInView={{
                opacity: 1,
                letterSpacing: "0.02em",
                color: productTitleGlitchColors,
              }}
              viewport={{ once: true, amount: 0.75 }}
              transition={{
                opacity: { duration: 1.25, ease: "easeOut", delay: 0.1 },
                letterSpacing: { duration: 1.25, ease: "easeOut", delay: 0.1 },
                color: {
                  duration: 1.25,
                  delay: 0.1,
                  times: productTitleGlitchColors.map(
                    (_, i) => i / (productTitleGlitchColors.length - 1)
                  ),
                },
              }}
            >
              Widest Range Of Products
            </motion.h2>
          </div>

          <motion.div
            variants={productGridVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.25 }}
            className="flex flex-wrap justify-between gap-y-4 md:gap-y-6"
          >
            {PRODUCT_CATEGORIES.map((product) => (
              <motion.div
                key={product.id}
                variants={productCardVariants}
                whileTap={{ scale: 0.99 }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                className="group relative bg-transparent overflow-hidden flex-1 basis-[48%] md:basis-[31%] lg:basis-[18%] max-w-[49%] md:max-w-[32%] lg:max-w-[19%]"
              >
                <div className="relative aspect-square w-full rounded-t-md overflow-hidden">
                  <div className="relative w-full h-full overflow-hidden">
                    <Image
                      src={product.image}
                      alt={product.name}
                      fill
                      className="object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                      sizes="(min-width: 1024px) 18vw, (min-width: 768px) 30vw, 45vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/45 to-transparent flex items-center justify-center transition-colors duration-500">
                      <span
                        className={`${ralewayBlackItalic.className} text-base md:text-xl lg:text-2xl font-bold tracking-wide text-white text-center transform translate-y-8 md:translate-y-10 lg:translate-y-12 transition-transform duration-500 group-hover:translate-y-0`}
                      >
                        {product.name}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Additional items section */}
      <section
        id="extras"
        className="relative border-y border-red-600/20 py-12 px-4 bg-[radial-gradient(circle_at_center,_#4a000b_0%,_#2b0004_55%,_#120002_100%)]"
      >
        {/* Vignette overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />

        <div className="relative max-w-6xl mx-auto flex flex-col items-center">
          <div className="relative w-full max-w-4xl flex justify-center">
            {/* Ambient glow behind image */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-3/4 h-3/4 rounded-full bg-[radial-gradient(circle,_rgba(255,0,60,0.35)_0%,_transparent_70%)] blur-[140px] opacity-40" />
            </div>

            {/* Image with soft edge mask */}
            <div className="relative w-full">
              {!hasHiddenExtrasTitle && !extrasTitleExiting && (
                <motion.h2
                  className={`${ralewayBlackItalic.className} pointer-events-none absolute inset-0 z-20 flex items-center justify-center text-2xl md:text-3xl lg:text-6xl font-bold tracking-wide text-white text-center`}
                  initial={{ opacity: 0, letterSpacing: "0.6em" }}
                  whileInView={{
                    opacity: 1,
                    letterSpacing: "0.02em",
                    color: glitchColors,
                  }}
                  viewport={{ once: true, amount: 0.7 }}
                  transition={{
                    opacity: { duration: 1.25, ease: "easeOut", delay: 0.1 },
                    letterSpacing: { duration: 1.25, ease: "easeOut", delay: 0.1 },
                    color: {
                      duration: 1.25,
                      delay: 0.1,
                      times: glitchColors.map(
                        (_, i) => i / (glitchColors.length - 1)
                      ),
                    },
                  }}
                  onAnimationComplete={() => {
                    setTimeout(() => setExtrasTitleExiting(true), 3000);
                  }}
                >
                  We also have....
                </motion.h2>
              )}
              {extrasTitleExiting && !hasHiddenExtrasTitle && (
                <motion.h2
                  className={`${ralewayBlackItalic.className} pointer-events-none absolute inset-0 z-20 flex items-center justify-center text-2xl md:text-3xl lg:text-4xl font-bold tracking-wide text-white text-center`}
                  initial={{ opacity: 1, letterSpacing: "0.02em", color: "#ffffff" }}
                  animate={{
                    opacity: [1, 1, 0],
                    letterSpacing: ["0.02em", "0.3em", "0.6em"],
                    color: glitchColors,
                  }}
                  transition={{
                    duration: 1.1,
                    ease: "easeInOut",
                    opacity: { times: [0, 0.6, 1] },
                    letterSpacing: { times: [0, 0.7, 1] },
                    color: {
                      times: glitchColors.map(
                        (_, i) => i / (glitchColors.length - 1)
                      ),
                    },
                  }}
                  onAnimationComplete={() => setHasHiddenExtrasTitle(true)}
                >
                  We also have....
                </motion.h2>
              )}
              <div className="relative w-full h-auto">
                {/* Masked image only (keeps soft edges) */}
                <div
                  className="relative w-full h-auto"
                  style={{
                    WebkitMaskImage:
                      "radial-gradient(circle at center, black 72%, transparent 100%)",
                    maskImage:
                      "radial-gradient(circle at center, black 72%, transparent 100%)",
                  }}
                >
                  <Image
                    src="/images/items.png"
                    alt="Additional items available"
                    width={1600}
                    height={500}
                    className="w-full h-auto"
                    priority={false}
                  />
                </div>

                {/* Hotspots overlay (NOT masked, so tips can overflow).
                    Only appear after the intro title has fully exited. */}
                {hasHiddenExtrasTitle && (
                  <div className="absolute inset-0 z-10">
                    {EXTRA_ITEMS_HOTSPOTS.map((hotspot) => (
                      <motion.div
                        key={hotspot.id}
                        className="absolute"
                        style={{
                          top: hotspot.top,
                          left: hotspot.left,
                          transform: "translate(-50%, -50%)",
                        }}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                      >
                        <motion.button
                          type="button"
                          onClick={() =>
                            setActiveHotspotId(
                              activeHotspotId === hotspot.id ? null : hotspot.id
                            )
                          }
                          whileHover={{ scale: 1.15 }}
                          className="relative flex items-center justify-center"
                        >
                          <span className="absolute inline-flex h-8 w-8 rounded-full bg-red-500/70 blur-[6px]" />
                          <motion.span
                            className="relative inline-flex h-2 w-2 lg:h-3 lg:w-3 rounded-full border-[1.2px] border-white bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.9)]"
                            animate={{ scale: [1, 1.25, 1] }}
                            transition={{
                              duration: 1.4,
                              repeat: Infinity,
                              ease: "easeInOut",
                            }}
                          />
                        </motion.button>

                        {activeHotspotId === hotspot.id && (
                          <div className="absolute left-1/2 bottom-full mb-3 w-52 -translate-x-1/2 rounded-lg bg-black/85 px-3 py-2 text-left shadow-lg backdrop-blur-sm">
                            <p className="text-xs font-semibold text-white">
                              {hotspot.title}
                            </p>
                            <p className="mt-1 text-[11px] text-white/80">
                              {hotspot.description}
                            </p>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trusted By — client logos marquee */}
      <section
        id="trusted-by"
        className="border-y border-red-600/20 bg-black/40 py-12 overflow-hidden"
      >
        <p className="text-center text-white/80 text-sm lg:text-3xl font-medium uppercase tracking-widest mb-8">
          Trusted By
        </p>
        <div className="relative w-full">
          <div
            className="flex overflow-hidden"
            style={{
              maskImage:
                "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
              WebkitMaskImage:
                "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
            }}
          >
            <motion.div
              className="flex shrink-0 items-center justify-around gap-12 md:gap-16 pr-12 md:pr-16"
              animate={{ x: ["0%", "-50%"] }}
              transition={{
                x: { duration: 28, repeat: Infinity, ease: "linear" },
              }}
            >
              {[...TRUSTED_BY_CLIENTS, ...TRUSTED_BY_CLIENTS].map((client, i) => {
                const h = client.height ?? 40;
                const w = client.width ?? 120;
                return (
                  <div
                    key={`${client.name}-${i}`}
                    className="flex shrink-0 items-center justify-center"
                  >
                    <Image
                      src={client.src}
                      alt={client.name}
                      width={w}
                      height={h}
                      className="w-auto object-contain"
                      style={{ height: h, maxWidth: w }}
                    />
                  </div>
                );
              })}
            </motion.div>
          </div>
        </div>
      </section>
      
      {/* What makes us different */}
      <section
        id="why-us"
        className="border-y border-red-600/20 bg-gradient-to-br from-black via-black/90 to-red-950/60 py-16 px-4"
      >
        <div className="mx-auto max-w-6xl flex flex-col lg:flex-row gap-10 items-start">
          <div className="w-full lg:w-2/5 space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-950/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-red-200">
              <span>✨</span>
              <span>What makes us different</span>
            </p>
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white">
              Merch that feels like a product, not an afterthought.
            </h2>
            <p className="text-sm md:text-base text-white/70">
              We build merch like a product line—designed from scratch, manufactured in-house, and shipped reliably worldwide.
            </p>
          </div>
          <div className="w-full lg:w-3/5 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-gradient-to-br from-red-900/60 via-red-700/20 to-red-900/60 p-[1px] rounded-2xl">
              <div className="h-full rounded-2xl bg-black/90 p-4 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🏭</span>
                  <h3 className="text-base md:text-lg font-semibold text-white">
                    Manufacturers, not middlemen
                  </h3>
                </div>
                <p className="text-xs md:text-sm text-white/70">
                  We don&apos;t deal with third-party vendors. Every apparel is made from scratch so fits, fabrics, and finishes match your brand—not a catalog SKU.
                </p>
              </div>
            </div>
            <div className="bg-gradient-to-br from-red-900/60 via-red-700/20 to-red-900/60 p-[1px] rounded-2xl">
              <div className="h-full rounded-2xl bg-black/90 p-4 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🏬</span>
                  <h3 className="text-base md:text-lg font-semibold text-white">
                    Real warehouses, real operations
                  </h3>
                </div>
                <p className="text-xs md:text-sm text-white/70">
                  Inventory lives in our warehouses across major Indian cities—not in your community manager&apos;s living room—so picking, packing, and returns stay professional.
                </p>
              </div>
            </div>
            <div className="bg-gradient-to-br from-red-900/60 via-red-700/20 to-red-900/60 p-[1px] rounded-2xl">
              <div className="h-full rounded-2xl bg-black/90 p-4 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🧵</span>
                  <h3 className="text-base md:text-lg font-semibold text-white">
                    Quality over &quot;free merch&quot;
                  </h3>
                </div>
                <p className="text-xs md:text-sm text-white/70">
                  We don&apos;t treat merch as throwaway freebies. We obsess over quality so people want to wear your brand every day—not just once at a conference.
                </p>
              </div>
            </div>
            <div className="bg-gradient-to-br from-red-900/60 via-red-700/20 to-red-900/60 p-[1px] rounded-2xl">
              <div className="h-full rounded-2xl bg-black/90 p-4 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🌍🚀</span>
                  <h3 className="text-base md:text-lg font-semibold text-white">
                    Global shipping, India-strong pricing
                  </h3>
                </div>
                <p className="text-xs md:text-sm text-white/70">
                  We ship globally and deliver ahead of schedule—while confidently challenging Chinese market pricing <span className="whitespace-nowrap">and quality.</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value / Features strip + Book a call */}
      <section
        id="book-call"
        className="border-y border-red-600/20 bg-black/30 py-16 px-4"
      >
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

        <div className="mx-auto mt-12 max-w-3xl text-center space-y-4">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white">
            Book a call with us
          </h2>
          <p className="text-sm md:text-base text-white/80">
            Get your next exclusive merch drop designed, manufactured, and shipped by our team.
          </p>
          <div className="pt-4">
            <a
              href="https://calendly.com/venkumj1234/b-venkatesh"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-xl bg-red-600 px-8 py-3 text-sm md:text-base font-semibold text-white shadow-[0_0_18px_rgba(220,38,38,0.45)] hover:bg-red-500 hover:shadow-[0_0_26px_rgba(220,38,38,0.6)] transition-all duration-300"
            >
              Book a call
            </a>
          </div>
        </div>
      </section>

      {/* NFC-enabled t-shirts & drops — main CTA section */}
      {/* <section id="nfc-drops" className="py-24 px-4">
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
      </section> */}

      {/* Thin footer strip */}
      <section className="border-t border-red-600/20 bg-black/60 py-4 px-4">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs md:text-sm">
          <p className="text-white/50">
            OnChainDrips — NFC-enabled merch for web3 brands.
          </p>
          <div className="flex items-center gap-4">
            <Link
              href="https://twitter.com/onchaindrips"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/70 hover:text-white transition-colors flex items-center gap-1.5"
            >
              <Twitter className="h-4 w-4" aria-hidden="true" />
              <span>Twitter</span>
            </Link>
            <Link
              href="https://t.me/VenmusTheRapper"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/70 hover:text-white transition-colors flex items-center gap-1.5"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              <span>Telegram</span>
            </Link>
            <a
              href="mailto:hello@onchaindrips.xyz"
              className="text-white/70 hover:text-white transition-colors flex items-center gap-1.5"
            >
              <MailIcon className="h-4 w-4" aria-hidden="true" />
              <span>Mail</span>
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
