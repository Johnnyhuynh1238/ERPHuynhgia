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

export function DesignPhotoCarousel({ groups, autoplayMs = 4000 }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxGroupId, setLightboxGroupId] = useState<string>("all");
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

  const lightboxPhotos = useMemo(() => {
    if (lightboxGroupId === "all") return flatPhotos;
    return flatPhotos.filter((p) => p.groupId === lightboxGroupId);
  }, [flatPhotos, lightboxGroupId]);

  const scrollToIndex = useCallback(
    (next: number, behavior: ScrollBehavior = "smooth") => {
      const scroller = scrollerRef.current;
      if (!scroller || flatPhotos.length === 0) return;
      const safeIndex = ((next % flatPhotos.length) + flatPhotos.length) % flatPhotos.length;
      const slide = scroller.children.item(safeIndex) as HTMLElement | null;
      slide?.scrollIntoView({ behavior, inline: "start", block: "nearest" });
      setActiveIndex(safeIndex);
    },
    [flatPhotos.length],
  );

  useEffect(() => {
    if (paused || lightboxIndex !== null || flatPhotos.length <= 1) return;
    const timer = window.setInterval(() => {
      scrollToIndex(activeIndex + 1);
    }, autoplayMs);
    return () => window.clearInterval(timer);
  }, [paused, lightboxIndex, flatPhotos.length, activeIndex, autoplayMs, scrollToIndex]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const slide = lightboxScrollerRef.current?.children.item(lightboxIndex) as HTMLElement | null;
    slide?.scrollIntoView({ behavior: "instant" as ScrollBehavior, inline: "start", block: "nearest" });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxIndex(null);
      if (event.key === "ArrowRight") setLightboxIndex((i) => (i === null ? null : Math.min(i + 1, lightboxPhotos.length - 1)));
      if (event.key === "ArrowLeft") setLightboxIndex((i) => (i === null ? null : Math.max(i - 1, 0)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, lightboxPhotos.length]);

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

  function openLightboxFromCarousel(index: number) {
    const photo = flatPhotos[index];
    if (!photo) return;
    setLightboxGroupId("all");
    setLightboxIndex(index);
  }

  function selectLightboxGroup(groupId: string) {
    if (groupId === lightboxGroupId) return;
    setLightboxGroupId(groupId);
    setLightboxIndex(0);
    requestAnimationFrame(() => {
      lightboxScrollerRef.current?.scrollTo({ left: 0, behavior: "auto" });
    });
  }

  if (groups.length === 0 || flatPhotos.length === 0) return null;

  return (
    <>
      <section className="owner-section p-0 overflow-hidden">
        <div
          ref={scrollerRef}
          className="design-carousel flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth"
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerCancel={() => setPaused(false)}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onScroll={handleScrollMomentum}
          style={{ scrollbarWidth: "none" }}
        >
          {flatPhotos.map((photo, index) => (
            <button
              type="button"
              key={`${photo.id}-${index}`}
              onClick={() => openLightboxFromCarousel(index)}
              aria-label="Xem ảnh lớn"
              className="design-carousel-slide group relative block min-w-full snap-center overflow-hidden bg-black/40"
            >
              <img
                src={photo.thumbnailUrl}
                alt=""
                loading="lazy"
                className="h-72 w-full object-cover transition duration-700 ease-out group-hover:scale-105 md:h-96"
              />
            </button>
          ))}
        </div>
      </section>

      {lightboxIndex !== null ? (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/95 text-white">
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0 truncate font-semibold">
              {lightboxPhotos[lightboxIndex]?.groupTitle} · {lightboxIndex + 1}/{lightboxPhotos.length}
            </div>
            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold transition hover:bg-white/20"
            >
              Đóng
            </button>
          </div>

          <div className="-mx-1 flex gap-2 overflow-x-auto px-4 pb-3" style={{ scrollbarWidth: "none" }}>
            <button
              type="button"
              onClick={() => selectLightboxGroup("all")}
              className={`owner-chip shrink-0 ${lightboxGroupId === "all" ? "orange" : ""}`}
            >
              Tất cả
            </button>
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => selectLightboxGroup(group.id)}
                className={`owner-chip shrink-0 ${lightboxGroupId === group.id ? "orange" : ""}`}
              >
                {group.title}
              </button>
            ))}
          </div>

          <div
            ref={lightboxScrollerRef}
            className="flex flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth"
            onScroll={handleLightboxScroll}
            style={{ scrollbarWidth: "none" }}
          >
            {lightboxPhotos.map((photo, index) => (
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
              onClick={() => setLightboxIndex(Math.min(lightboxPhotos.length - 1, lightboxIndex + 1))}
              disabled={lightboxIndex === lightboxPhotos.length - 1}
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
