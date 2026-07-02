"use client";

import { useEffect, useState } from "react";
import { FileImage, Loader2, PackageCheck, X } from "lucide-react";

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
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/proposals/${proposalId}/deliveries`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) setDeliveries(json.deliveries ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [proposalId]);

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
      ) : deliveries.length === 0 ? (
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
        </div>
      )}

      {zoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setZoom(null)}
        >
          <button
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white"
            onClick={(e) => {
              e.stopPropagation();
              setZoom(null);
            }}
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="preview" className="max-h-full max-w-full rounded-xl object-contain" />
        </div>
      )}
    </div>
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
