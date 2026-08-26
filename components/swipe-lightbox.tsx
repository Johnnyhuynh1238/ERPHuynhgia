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
const actionBar: CSSProperties = {
  position: "absolute",
  left: 12,
  top: 12,
  zIndex: 2,
  display: "flex",
  gap: 8,
};
const actionBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 40,
  padding: "0 14px",
  borderRadius: 999,
  border: "none",
  color: "#fff",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

function billFileName(src: string) {
  try {
    const path = new URL(src, window.location.origin).pathname;
    const base = path.split("/").pop() || "chung-tu";
    return /\.[a-z0-9]{2,5}$/i.test(base) ? base : `${base}.jpg`;
  } catch {
    return "chung-tu.jpg";
  }
}
async function downloadBill(src: string) {
  try {
    const res = await fetch(src, { cache: "no-store" });
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = billFileName(src);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
  } catch {
    window.open(src, "_blank", "noopener");
  }
}
async function shareBill(src: string) {
  try {
    try {
      const res = await fetch(src, { cache: "no-store" });
      const blob = await res.blob();
      const file = new File([blob], billFileName(src), { type: blob.type || "image/jpeg" });
      const navAny = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (navAny.canShare && navAny.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Chứng từ" });
        return;
      }
    } catch {
      /* fall through to link share */
    }
    const absUrl = new URL(src, window.location.origin).href;
    if (navigator.share) {
      await navigator.share({ title: "Chứng từ", url: absUrl });
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(absUrl);
    } else {
      window.open(absUrl, "_blank", "noopener");
    }
  } catch {
    /* user huỷ share — bỏ qua */
  }
}

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
      <div style={actionBar}>
        <button
          type="button"
          style={{ ...actionBtn, background: "rgba(234,88,12,0.92)" }}
          onClick={() => shareBill(imgs[idx])}
          aria-label="Chia sẻ"
        >
          📤 Chia sẻ
        </button>
        <button
          type="button"
          style={{ ...actionBtn, background: "rgba(255,255,255,0.14)" }}
          onClick={() => downloadBill(imgs[idx])}
          aria-label="Tải ảnh"
        >
          ⬇️ Tải
        </button>
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
