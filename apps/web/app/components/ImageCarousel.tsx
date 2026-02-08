"use client";

import { useCallback, useEffect, useState } from "react";

const INTERVAL_MS = 6000;
const TRANSITION_MS = 500;

/** Slide: single URL or primary with fallback (e.g. NFT + carousel1 when NFT fails). */
export type CarouselSlide = string | { primary: string; fallback?: string };

export type ImageCarouselProps = {
  /** Slides. First can use fallback: try primary (NFT/Walrus), on error use fallback (Supabase). */
  slides: CarouselSlide[];
  alt: string;
  className?: string;
  imageClassName?: string;
};

function getSlideUrl(
  slide: CarouselSlide,
  useFallback: boolean
): string | null {
  if (typeof slide === "string") return slide || null;
  if (useFallback && slide.fallback) return slide.fallback;
  return slide.primary || null;
}

export function ImageCarousel({
  slides,
  alt,
  className = "",
  imageClassName = "",
}: ImageCarouselProps) {
  const [index, setIndex] = useState(0);
  const [fallbackUsed, setFallbackUsed] = useState<Record<number, boolean>>({});

  const list = slides.filter((s) => {
    const u = typeof s === "string" ? s : s.primary || s.fallback;
    return !!u;
  });

  const handleError = useCallback(
    (slideIndex: number) => {
      const slide = list[slideIndex];
      if (slide && typeof slide === "object" && slide.fallback) {
        setFallbackUsed((prev) => ({ ...prev, [slideIndex]: true }));
      }
    },
    [list]
  );

  useEffect(() => {
    if (list.length <= 1) return;
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % list.length);
    }, INTERVAL_MS);
    return () => clearInterval(t);
  }, [list.length]);

  if (list.length === 0) {
    return (
      <div
        className={`flex items-center justify-center bg-transparent text-white/40 text-sm ${className}`}
      >
        No image
      </div>
    );
  }

  return (
    <div
      className={`relative block w-full min-w-0 overflow-hidden bg-transparent ${className}`}
    >
      <div
        className="flex h-full"
        style={{
          width: `${list.length * 100}%`,
          transform: `translateX(-${index * (100 / list.length)}%)`,
          transition: `transform ${TRANSITION_MS}ms ease-in-out`,
        }}
      >
        {list.map((slide, i) => {
          const useFb = typeof slide !== "string" && fallbackUsed[i];
          const url = getSlideUrl(slide, !!useFb);
          const slidePct = 100 / list.length;
          if (!url) {
            return (
              <div
                key={i}
                className="flex shrink-0 grow-0 items-center justify-center bg-transparent text-white/40 text-sm"
                style={{ width: `${slidePct}%` }}
              >
                No image
              </div>
            );
          }
          return (
            <div
              key={i}
              className="flex shrink-0 grow-0 items-center justify-center overflow-hidden"
              style={{ width: `${slidePct}%` }}
            >
              <img
                src={url}
                alt={alt}
                className={`max-h-full max-w-full object-contain ${imageClassName}`}
                onError={() => handleError(i)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
