"use client";

import { useEffect, useRef, useState } from "react";

type CustomerPhotoAlbumPhoto = {
  id: string;
  url: string;
  thumbnailUrl?: string | null;
  caption?: string | null;
};

type CustomerPhotoAlbumProps = {
  photos: CustomerPhotoAlbumPhoto[];
  gridClassName?: string;
  thumbnailClassName?: string;
  triggerLabel?: string;
  compactTrigger?: boolean;
};

export function CustomerPhotoAlbum({
  photos,
  gridClassName = "grid grid-cols-3 gap-2",
  thumbnailClassName = "h-24",
  triggerLabel,
  compactTrigger = false,
}: CustomerPhotoAlbumProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (activeIndex === null) return;
    const scroller = scrollerRef.current;
    const slide = scroller?.children.item(activeIndex) as HTMLElement | null;
    slide?.scrollIntoView({ block: "nearest", inline: "start" });
  }, [activeIndex]);

  if (photos.length === 0) return null;

  return (
    <>
      {triggerLabel ? (
        <button
          type="button"
          onClick={() => setActiveIndex(0)}
          className={compactTrigger ? "mt-3 inline-block text-xs font-semibold text-[#ffb37b] underline" : "owner-button mt-3 w-full"}
        >
          {triggerLabel}
        </button>
      ) : (
        <div className={gridClassName}>
          {photos.map((photo, index) => (
            <button key={photo.id} type="button" onClick={() => setActiveIndex(index)} className="block min-w-0 overflow-hidden rounded-lg bg-[#2a2a2a]">
              <img alt={photo.caption || "Ảnh công trình"} src={photo.thumbnailUrl || photo.url} className={`${thumbnailClassName} w-full object-cover`} />
            </button>
          ))}
        </div>
      )}

      {activeIndex !== null ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white">
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0 truncate">{photos[activeIndex]?.caption || "Album ảnh"}</div>
            <button type="button" onClick={() => setActiveIndex(null)} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
              Đóng
            </button>
          </div>
          <div ref={scrollerRef} className="flex flex-1 snap-x snap-mandatory overflow-x-auto overscroll-contain scroll-smooth">
            {photos.map((photo) => (
              <div key={`slide-${photo.id}`} className="flex min-w-full snap-center items-center justify-center px-3 py-4">
                <img alt={photo.caption || "Ảnh công trình"} src={photo.url} className="max-h-full max-w-full rounded-xl object-contain" />
              </div>
            ))}
          </div>
          <div className="px-4 pb-4 text-center text-xs text-neutral-400">Vuốt ngang để xem ảnh khác</div>
        </div>
      ) : null}
    </>
  );
}
