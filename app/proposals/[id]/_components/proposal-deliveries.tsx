"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileImage, Loader2, Minus, PackageCheck, Plus, RotateCcw, X } from "lucide-react";

type Photo = { key: string; contentType?: string };
type Delivery = {
  id: string;
  deliveredAt: string;
  invoicePhotos: Photo[];
  goodsPhotos: Photo[];
  itemsSnapshot: Array<{ itemSeq: number; qty: number }>;
  note: string | null;
  receiverName: string;
};
type LegacyReceipt = {
  itemSeq: number;
  receivedQty: number;
  receivedAt: string;
  receiverName: string;
  photos: Photo[];
};

type ParsedItem = {
  name?: string;
  ten?: string;
  qty?: number;
  sl?: number;
  unit?: string;
  dvt?: string;
};

function itemLabel(items: ParsedItem[], seq: number) {
  const it = items[seq];
  if (!it) return `Dòng ${seq + 1}`;
  return it.name ?? it.ten ?? `Dòng ${seq + 1}`;
}
function itemUnit(items: ParsedItem[], seq: number) {
  const it = items[seq];
  if (!it) return "";
  return it.unit ?? it.dvt ?? "";
}

function fmtQty(n: number) {
  const r = Math.round(n * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : r.toFixed(3).replace(/\.?0+$/, "");
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(
    d.getHours(),
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function ProposalDeliveries({
  proposalId,
  parsedItems,
}: {
  proposalId: string;
  parsedItems: ParsedItem[];
}) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [legacyReceipts, setLegacyReceipts] = useState<LegacyReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/proposals/${proposalId}/deliveries`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setDeliveries(json.deliveries ?? []);
          setLegacyReceipts(json.legacyReceipts ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [proposalId]);

  const hasAny = deliveries.length > 0 || legacyReceipts.length > 0;

  return (
    <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
      <div className="mb-3 flex items-center gap-2">
        <PackageCheck className="h-4 w-4 text-emerald-400" />
        <div className="text-xs uppercase tracking-wide text-[#8892b0]">Lịch sử giao hàng (đối chiếu công nợ)</div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[#8892b0]">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải...
        </div>
      ) : !hasAny ? (
        <div className="rounded-xl border border-dashed border-[#2d3249] bg-[#13151f] px-3 py-4 text-center text-xs text-[#5a627a]">
          Chưa có đợt giao hàng nào.
        </div>
      ) : (
        <div className="space-y-3">
          {deliveries.map((d, idx) => (
            <div key={d.id} className="rounded-xl border border-[#252840] bg-[#13151f] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-[#f0f2ff]">
                  Đợt #{deliveries.length - idx} · {fmtDate(d.deliveredAt)}
                </div>
                <div className="text-[11px] text-[#8892b0]">KS: {d.receiverName}</div>
              </div>

              {d.itemsSnapshot.length > 0 && (
                <div className="mt-2 rounded-lg border border-[#252840] bg-[#0b0d16] p-2">
                  <div className="text-[10px] uppercase tracking-wide text-[#5a627a]">Chi tiết đợt nhận</div>
                  <ul className="mt-1 space-y-0.5 text-[13px] text-[#f0f2ff]">
                    {d.itemsSnapshot.map((s) => (
                      <li key={s.itemSeq}>
                        <span className="text-[#8892b0]">{itemLabel(parsedItems, s.itemSeq)}:</span>{" "}
                        <span className="font-semibold text-emerald-300">
                          {fmtQty(Number(s.qty))} {itemUnit(parsedItems, s.itemSeq)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {d.note && (
                <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-[12px] text-amber-200">
                  Ghi chú: {d.note}
                </div>
              )}

              <PhotoStrip
                label="Ảnh phiếu giao NCC"
                photos={d.invoicePhotos}
                proposalId={proposalId}
                deliveryId={d.id}
                kind="invoice"
                onOpen={setZoom}
              />
              <PhotoStrip
                label="Ảnh hàng hoá"
                photos={d.goodsPhotos}
                proposalId={proposalId}
                deliveryId={d.id}
                kind="goods"
                onOpen={setZoom}
              />
            </div>
          ))}

          {legacyReceipts.length > 0 && (
            <div className="rounded-xl border border-[#252840] bg-[#13151f] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-[#f0f2ff]">Ảnh nhận hàng (đợt cũ)</div>
                <div className="text-[10px] uppercase tracking-wide text-amber-300/80">flow cũ</div>
              </div>
              <div className="space-y-2">
                {legacyReceipts.map((r) => (
                  <div key={r.itemSeq} className="rounded-lg border border-[#252840] bg-[#0b0d16] p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                      <div>
                        <span className="text-[#8892b0]">{itemLabel(parsedItems, r.itemSeq)}:</span>{" "}
                        <span className="font-semibold text-emerald-300">
                          {fmtQty(r.receivedQty)} {itemUnit(parsedItems, r.itemSeq)}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#5a627a]">
                        {fmtDate(r.receivedAt)}
                        {r.receiverName ? ` · KS: ${r.receiverName}` : ""}
                      </div>
                    </div>
                    <LegacyPhotoStrip
                      photos={r.photos}
                      proposalId={proposalId}
                      itemSeq={r.itemSeq}
                      onOpen={setZoom}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {zoom && <PhotoLightbox src={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}

function PhotoLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragOrigin = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const pinchOrigin = useRef<{ dist: number; scale: number } | null>(null);
  const lastTap = useRef(0);

  const MIN = 1;
  const MAX = 5;
  const clampScale = (s: number) => Math.min(MAX, Math.max(MIN, s));
  const reset = () => {
    setScale(1);
    setTx(0);
    setTy(0);
  };
  const bumpScale = (delta: number) => {
    setScale((s) => {
      const next = clampScale(s + delta);
      if (next === 1) {
        setTx(0);
        setTy(0);
      }
      return next;
    });
  };

  useEffect(() => {
    setMounted(true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") bumpScale(0.5);
      else if (e.key === "-" || e.key === "_") bumpScale(-0.5);
      else if (e.key === "0") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;
    const delta = -e.deltaY * 0.002;
    setScale((s) => {
      const next = clampScale(s * Math.exp(delta));
      const ratio = next / s;
      setTx((prev) => cx - (cx - prev) * ratio);
      setTy((prev) => cy - (cy - prev) * ratio);
      if (next === 1) {
        setTx(0);
        setTy(0);
      }
      return next;
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchOrigin.current = { dist, scale };
      dragOrigin.current = null;
    } else if (pointers.current.size === 1 && scale > 1) {
      dragOrigin.current = { x: e.clientX, y: e.clientY, tx, ty };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinchOrigin.current) {
      const [a, b] = Array.from(pointers.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const next = clampScale((dist / pinchOrigin.current.dist) * pinchOrigin.current.scale);
      setScale(next);
      if (next === 1) {
        setTx(0);
        setTy(0);
      }
    } else if (pointers.current.size === 1 && dragOrigin.current) {
      setTx(dragOrigin.current.tx + (e.clientX - dragOrigin.current.x));
      setTy(dragOrigin.current.ty + (e.clientY - dragOrigin.current.y));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchOrigin.current = null;
    if (pointers.current.size === 0) dragOrigin.current = null;
  };

  const onImgClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastTap.current < 280) {
      if (scale > 1) reset();
      else setScale(2.5);
    }
    lastTap.current = now;
  };

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/90"
      onClick={onClose}
      style={{ touchAction: "none" }}
    >
      <button
        className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white active:bg-white/20"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <X className="h-5 w-5" />
      </button>

      <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/10 p-1.5 backdrop-blur">
        <button
          onClick={(e) => {
            e.stopPropagation();
            bumpScale(-0.5);
          }}
          className="rounded-full bg-white/10 p-2 text-white active:bg-white/20"
        >
          <Minus className="h-4 w-4" />
        </button>
        <div className="min-w-[46px] text-center text-xs font-semibold text-white">
          {Math.round(scale * 100)}%
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            bumpScale(0.5);
          }}
          className="rounded-full bg-white/10 p-2 text-white active:bg-white/20"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            reset();
          }}
          className="rounded-full bg-white/10 p-2 text-white active:bg-white/20"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      <div
        ref={containerRef}
        className="flex h-full w-full items-center justify-center"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="preview"
          onClick={onImgClick}
          onDragStart={(e) => e.preventDefault()}
          className="max-h-full max-w-full select-none rounded-xl object-contain"
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transition: pointers.current.size ? "none" : "transform 0.15s ease-out",
            cursor: scale > 1 ? "grab" : "zoom-in",
          }}
          draggable={false}
        />
      </div>
    </div>,
    document.body,
  );
}

function PhotoStrip({
  label,
  photos,
  proposalId,
  deliveryId,
  kind,
  onOpen,
}: {
  label: string;
  photos: Photo[];
  proposalId: string;
  deliveryId: string;
  kind: "invoice" | "goods";
  onOpen: (url: string) => void;
}) {
  if (!photos.length) return null;
  const urlOf = (p: Photo) =>
    `/api/proposals/${proposalId}/deliveries/${deliveryId}/photos/file?kind=${kind}&key=${encodeURIComponent(p.key)}`;

  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-[#8892b0]">
        <FileImage className="h-3 w-3" />
        {label} ({photos.length})
      </div>
      <div className="flex gap-1.5 overflow-x-auto">
        {photos.slice(0, 8).map((p) => {
          const src = urlOf(p);
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onOpen(src)}
              className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[#2d3249] bg-[#0b0d16]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LegacyPhotoStrip({
  photos,
  proposalId,
  itemSeq,
  onOpen,
}: {
  photos: Photo[];
  proposalId: string;
  itemSeq: number;
  onOpen: (url: string) => void;
}) {
  if (!photos.length) return null;
  const urlOf = (p: Photo) =>
    `/api/proposals/${proposalId}/items/${itemSeq}/receipt/photos/file?key=${encodeURIComponent(p.key)}`;

  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-[#8892b0]">
        <FileImage className="h-3 w-3" />
        Ảnh nhận hàng ({photos.length})
      </div>
      <div className="flex gap-1.5 overflow-x-auto">
        {photos.slice(0, 8).map((p) => {
          const src = urlOf(p);
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onOpen(src)}
              className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[#2d3249] bg-[#0b0d16]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
