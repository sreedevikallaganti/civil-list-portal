"use client";

import { useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type Props = {
  images: { src: string; caption?: string }[];
  index: number | null;
  onIndexChange: (i: number | null) => void;
};

/** Full-screen photo viewer. ← → to move, Esc to close. */
export default function PhotoLightbox({ images, index, onIndexChange }: Props) {
  const open = index !== null && images.length > 0;

  const go = useCallback(
    (step: number) => {
      if (index === null) return;
      onIndexChange((index + step + images.length) % images.length);
    },
    [index, images.length, onIndexChange]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onIndexChange(null);
      }
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
    };
  }, [open, go, onIndexChange]);

  if (!open) return null;
  const img = images[index!];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="mem-fade-in fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/90 backdrop-blur-sm"
      onClick={() => onIndexChange(null)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={img.src}
        src={img.src}
        alt={img.caption ?? ""}
        onClick={(e) => e.stopPropagation()}
        className="mem-scale-in max-h-[82vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl"
      />

      <button
        type="button"
        aria-label="Close"
        className="absolute right-4 top-4 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 active:scale-95"
      >
        <X className="h-5 w-5" />
      </button>

      {images.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={(e) => { e.stopPropagation(); go(-1); }}
            className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={(e) => { e.stopPropagation(); go(1); }}
            className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 active:scale-95"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      <div className="absolute bottom-5 left-0 right-0 px-4 text-center">
        {img.caption && <p className="text-sm font-medium text-white/85">{img.caption}</p>}
        {images.length > 1 && (
          <p className="mt-1 text-xs font-semibold tabular-nums text-white/50">
            {index! + 1} / {images.length}
          </p>
        )}
      </div>
    </div>
  );
}
