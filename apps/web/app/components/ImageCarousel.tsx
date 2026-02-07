"use client";

import { useEffect, useState } from "react";

const INTERVAL_MS = 5000;

/** Slide: single URL or primary with fallback (e.g. NFT + carousel1 when NFT fails). */
export type CarouselSlide = string | { primary: string; fallback?: string };

export type ImageCarouselProps = {
  /** Slides. First can use fallback: try primary (NFT/Walrus), on error use fallback (Supabase). */
  slides: CarouselSlide[];
  alt: string;
  className?: string;
  imageClassName?: string;
};

function getSlideUrl(slide: CarouselSlide, useFallback: boolean): string | null {
  if (typeof slide === "string") return slide || null;
  if (useFallback && slide.fallback) return slide.fallback;
  return slide.primary || null;
}

export function ImageCarousel({ slides, alt, className = "", imageClassName = "" }: ImageCarouselProps) {
  const [index, setIndex] = useState(0);
  const [fallbackUsed, setFallbackUsed] = useState<Record<number, boolean>>({});
  const [currentError, setCurrentError] = useState(false);

  const list = slides.filter((s) => {
    const u = typeof s === "string" ? s : s.primary || s.fallback;
    return !!u;
  });
  const currentSlide = list[index % list.length] ?? list[0];
  const useFallback = currentSlide && typeof currentSlide !== "string" ? fallbackUsed[index % list.length] : false;
  const currentUrl = currentSlide ? getSlideUrl(currentSlide, !!useFallback) : null;

  useEffect(() => {
    if (list.length <= 1) return;
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % list.length);
      setCurrentError(false);
    }, INTERVAL_MS);
    return () => clearInterval(t);
  }, [list.length]);

  const handleError = () => {
    if (currentSlide && typeof currentSlide === "object" && currentSlide.fallback) {
      setFallbackUsed((prev) => ({ ...prev, [index % list.length]: true }));
      setCurrentError(false);
    } else {
      setCurrentError(true);
    }
  };

  if (list.length === 0 || !currentUrl) {
    return (
      <div className={`flex items-center justify-center bg-transparent text-white/40 text-sm ${className}`}>
        No image
      </div>
    );
  }

  return (
    <div className={`relative flex items-center justify-center overflow-hidden bg-transparent ${className}`}>
      <img
        key={currentUrl}
        src={currentUrl}
        alt={alt}
        className={imageClassName}
        onError={handleError}
      />
      {currentError && (
        <div className="absolute inset-0 flex items-center justify-center bg-transparent text-white/40 text-sm">
          Image unavailable
        </div>
      )}
    </div>
  );
}
