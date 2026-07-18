"use client";

import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Lightbox ảnh vuốt ngang mượt bằng scroll-snap native (như cổng chủ nhà / nhật ký).
// Tự portal ra document.body → thoát mọi transform ancestor (app-shell .slide-up).
const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 120,
  background: "rgba(0,0,0,0.92)",
  display: "flex",
  flexDirection: "column",
};
const scroller: CSSProperties = {
  flex: 1,
  display: "flex",
  overflowX: "auto",
  overflowY: "hidden",
  scrollSnapType: "x mandatory",
  overscrollBehavior: "contain",
  WebkitOverflowScrolling: "touch",
};
const slide: CSSProperties = {
  minWidth: "100%",
  scrollSnapAlign: "center",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 12,
};
const imgStyle: CSSProperties = { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", userSelect: "none" };
const closeBtn: CSSProperties = {
  position: "absolute",
  right: 12,
  top: 12,
  zIndex: 2,
  width: 40,
  height: 40,
  borderRadius: 999,
  border: "none",
  background: "rgba(255,255,255,0.14)",
  color: "#fff",
  fontSize: 18,
  cursor: "pointer",
};
const counter: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: 16,
  transform: "translateX(-50%)",
  zIndex: 2,
  background: "rgba(255,255,255,0.14)",
  color: "#fff",
  fontSize: 12,
  padding: "4px 12px",
  borderRadius: 999,
};

export function SwipeLightbox({ imgs, startIdx, onClose }: { imgs: string[]; startIdx: number; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [idx, setIdx] = useState(startIdx);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => setMounted(true), []);

  const scrollTo = useCallback(
    (i: number, smooth = true) => {
      const s = ref.current;
      if (!s) return;
      const c = Math.max(0, Math.min(imgs.length - 1, i));
      s.scrollTo({ left: c * s.clientWidth, behavior: smooth ? "smooth" : "auto" });
    },
    [imgs.length],
  );

  useEffect(() => {
    if (mounted) scrollTo(startIdx, false);
  }, [mounted, startIdx, scrollTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") scrollTo(idx - 1);
      if (e.key === "ArrowRight") scrollTo(idx + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, onClose, scrollTo]);

  if (!mounted || imgs.length === 0) return null;

  return createPortal(
    <div style={overlay}>
      <div
        ref={ref}
        style={scroller}
        onScroll={(e) => {
          const s = e.currentTarget;
          if (s.clientWidth > 0) setIdx(Math.round(s.scrollLeft / s.clientWidth));
        }}
      >
        {imgs.map((u, i) => (
          <div key={`${u}-${i}`} style={slide}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt="Chứng từ" draggable={false} style={imgStyle} />
          </div>
        ))}
      </div>
      <button type="button" style={closeBtn} onClick={onClose} aria-label="Đóng">
        ✕
      </button>
      {imgs.length > 1 ? (
        <div style={counter}>
          {idx + 1} / {imgs.length}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
