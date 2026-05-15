"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type DesignPhoto = {
  id: string;
  groupId: string;
  groupTitle: string;
  photoUrl: string;
  thumbnailUrl: string;
};

export type DesignGroup = {
  id: string;
  title: string;
  description: string | null;
  photos: DesignPhoto[];
};

type Props = {
  groups: DesignGroup[];
  autoplayMs?: number;
};

export function DesignPhotoCarousel({ groups, autoplayMs = 2000 }: Props) {
  const [selectedGroupId, setSelectedGroupId] = useState<string>("all");
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const lightboxScrollerRef = useRef<HTMLDivElement | null>(null);

  const flatPhotos = useMemo(() => {
    const list: DesignPhoto[] = [];
    for (const group of groups) {
      for (const photo of group.photos) {
        list.push({ ...photo, groupId: group.id, groupTitle: group.title });
      }
    }
    return list;
  }, [groups]);

  const visiblePhotos = useMemo(() => {
    if (selectedGroupId === "all") return flatPhotos;
    return flatPhotos.filter((p) => p.groupId === selectedGroupId);
  }, [flatPhotos, selectedGroupId]);

  useEffect(() => {
    setActiveIndex(0);
    scrollerRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }, [selectedGroupId]);

  const scrollToIndex = useCallback(
    (next: number, behavior: ScrollBehavior = "smooth") => {
      const scroller = scrollerRef.current;
      if (!scroller || visiblePhotos.length === 0) return;
      const safeIndex = ((next % visiblePhotos.length) + visiblePhotos.length) % visiblePhotos.length;
      const slide = scroller.children.item(safeIndex) as HTMLElement | null;
      slide?.scrollIntoView({ behavior, inline: "start", block: "nearest" });
      setActiveIndex(safeIndex);
    },
    [visiblePhotos.length],
  );

  useEffect(() => {
    if (paused || lightboxIndex !== null || visiblePhotos.length <= 1) return;
    const timer = window.setInterval(() => {
      scrollToIndex(activeIndex + 1);
    }, autoplayMs);
    return () => window.clearInterval(timer);
  }, [paused, lightboxIndex, visiblePhotos.length, activeIndex, autoplayMs, scrollToIndex]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const slide = lightboxScrollerRef.current?.children.item(lightboxIndex) as HTMLElement | null;
    slide?.scrollIntoView({ behavior: "instant" as ScrollBehavior, inline: "start", block: "nearest" });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxIndex(null);
      if (event.key === "ArrowRight") setLightboxIndex((i) => (i === null ? null : Math.min(i + 1, visiblePhotos.length - 1)));
      if (event.key === "ArrowLeft") setLightboxIndex((i) => (i === null ? null : Math.max(i - 1, 0)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, visiblePhotos.length]);

  function handleScrollMomentum(event: React.UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const width = target.clientWidth;
    if (width === 0) return;
    const next = Math.round(target.scrollLeft / width);
    if (next !== activeIndex) setActiveIndex(next);
  }

  function handleLightboxScroll(event: React.UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const width = target.clientWidth;
    if (width === 0) return;
    const next = Math.round(target.scrollLeft / width);
    if (next !== lightboxIndex) setLightboxIndex(next);
  }

  if (groups.length === 0 || flatPhotos.length === 0) return null;

  return (
    <>
      <section className="owner-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="owner-section-title mb-0">ẢNH THIẾT KẾ</div>
          <span className="text-xs owner-muted">{visiblePhotos.length} ảnh · vuốt để xem</span>
        </div>

        <div className="mt-3 -mx-1 flex gap-2 overflow-x-auto pb-2 pl-1 pr-1" style={{ scrollbarWidth: "none" }}>
          <button
            type="button"
            onClick={() => setSelectedGroupId("all")}
            className={`owner-chip shrink-0 ${selectedGroupId === "all" ? "orange" : ""}`}
          >
            Tất cả
          </button>
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => setSelectedGroupId(group.id)}
              className={`owner-chip shrink-0 ${selectedGroupId === group.id ? "orange" : ""}`}
            >
              {group.title}
            </button>
          ))}
        </div>

        <div
          ref={scrollerRef}
          className="design-carousel mt-3 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth"
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerCancel={() => setPaused(false)}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onScroll={handleScrollMomentum}
          style={{ scrollbarWidth: "none" }}
        >
          {visiblePhotos.map((photo, index) => (
            <button
              type="button"
              key={`${photo.id}-${index}`}
              onClick={() => setLightboxIndex(index)}
              className="design-carousel-slide group relative block min-w-full snap-center overflow-hidden rounded-2xl bg-black/40"
            >
              <img
                src={photo.thumbnailUrl}
                alt={photo.groupTitle}
                loading="lazy"
                className="h-64 w-full object-cover transition duration-700 ease-out group-hover:scale-105 md:h-80"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-3 text-left">
                <div className="text-sm font-semibold text-white drop-shadow">{photo.groupTitle}</div>
                <div className="text-[11px] text-white/75">Bấm để xem lớn</div>
              </div>
            </button>
          ))}
        </div>

        {visiblePhotos.length > 1 ? (
          <div className="mt-3 flex items-center justify-center gap-1.5">
            {visiblePhotos.map((_, index) => (
              <button
                key={`dot-${index}`}
                type="button"
                onClick={() => scrollToIndex(index)}
                aria-label={`Xem ảnh ${index + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  index === activeIndex ? "w-6 bg-[#ff8a3d]" : "w-1.5 bg-white/30 hover:bg-white/60"
                }`}
              />
            ))}
          </div>
        ) : null}
      </section>

      {lightboxIndex !== null ? (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/95 text-white">
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0 truncate font-semibold">
              {visiblePhotos[lightboxIndex]?.groupTitle} · {lightboxIndex + 1}/{visiblePhotos.length}
            </div>
            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold transition hover:bg-white/20"
            >
              Đóng
            </button>
          </div>
          <div
            ref={lightboxScrollerRef}
            className="flex flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth"
            onScroll={handleLightboxScroll}
            style={{ scrollbarWidth: "none" }}
          >
            {visiblePhotos.map((photo, index) => (
              <div key={`lb-${photo.id}-${index}`} className="flex min-w-full snap-center items-center justify-center px-4 py-4">
                <img src={photo.photoUrl} alt={photo.groupTitle} className="max-h-full max-w-full rounded-xl object-contain" />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 px-4 pb-4 text-xs text-neutral-400">
            <button
              type="button"
              onClick={() => setLightboxIndex(Math.max(0, lightboxIndex - 1))}
              disabled={lightboxIndex === 0}
              className="rounded-full bg-white/10 px-3 py-1 transition disabled:opacity-30 enabled:hover:bg-white/20"
            >
              ← Trước
            </button>
            <span>Vuốt ngang hoặc dùng phím ← →</span>
            <button
              type="button"
              onClick={() => setLightboxIndex(Math.min(visiblePhotos.length - 1, lightboxIndex + 1))}
              disabled={lightboxIndex === visiblePhotos.length - 1}
              className="rounded-full bg-white/10 px-3 py-1 transition disabled:opacity-30 enabled:hover:bg-white/20"
            >
              Sau →
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
