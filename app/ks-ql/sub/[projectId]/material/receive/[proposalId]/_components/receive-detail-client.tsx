"use client";

import { confirmDialog } from "@/components/confirm-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Download,
  FileImage,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

/** Nén ảnh client-side: cạnh dài tối đa 1600px, JPEG q=0.82. Lỗi decode (định dạng lạ) thì giữ file gốc. */
async function compressImage(file: File): Promise<File> {
  try {
    const url = URL.createObjectURL(file);
    try {
      const img = document.createElement("img");
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("decode fail"));
        img.src = url;
      });
      const MAX = 1600;
      const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, w, h);
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.82),
      );
      if (!blob || blob.size >= file.size) return file;
      return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
        type: "image/jpeg",
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return file;
  }
}

function poCode(id: string) {
  return `PO-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

type Item = { seq: number; name: string; qty: number; unit: string; task: string };
type Photo = { key: string };
type Delivery = {
  id: string;
  deliveredAt: string;
  invoicePhotos: Photo[];
  goodsPhotos: Photo[];
  itemsSnapshot: Array<{ itemSeq: number; qty: number }>;
  note: string | null;
  receiverName: string;
};

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

export function ReceiveDetailClient({
  proposalId,
  description,
  orderStatus,
  items,
  receivedByItem,
  initialDeliveries,
  project,
  ksName,
}: {
  proposalId: string;
  description: string;
  orderStatus: "ordered" | "received";
  items: Item[];
  receivedByItem: Record<number, number>;
  initialDeliveries: Delivery[];
  project: { code: string; name: string };
  ksName: string;
}) {
  const [deliveries, setDeliveries] = useState<Delivery[]>(initialDeliveries);
  const [received, setReceived] = useState<Record<number, number>>(receivedByItem);
  const [status, setStatus] = useState(orderStatus);
  const poRef = useRef<HTMLDivElement>(null);
  const [downloadingPo, setDownloadingPo] = useState(false);
  const code = poCode(proposalId);

  // Đợt hiện đang nhập
  const [draftQty, setDraftQty] = useState<Record<number, string>>({});
  const [invoiceFiles, setInvoiceFiles] = useState<File[]>([]);
  const [goodsFiles, setGoodsFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const invoiceInputRef = useRef<HTMLInputElement>(null);
  const goodsInputRef = useRef<HTMLInputElement>(null);

  const draftRows = useMemo(() => {
    const rows: Array<{ itemSeq: number; qty: number }> = [];
    for (const it of items) {
      const raw = draftQty[it.seq];
      if (!raw) continue;
      const n = Number(raw.replace(",", "."));
      if (Number.isFinite(n) && n > 0) rows.push({ itemSeq: it.seq, qty: n });
    }
    return rows;
  }, [draftQty, items]);

  const canSubmit =
    !submitting && draftRows.length > 0 && invoiceFiles.length > 0 && goodsFiles.length > 0;

  // Cảnh báo cả đơn: các dòng mà (đã nhận + đợt này) vượt số đặt
  const overLines = useMemo(() => {
    return draftRows
      .map((r) => {
        const it = items.find((i) => i.seq === r.itemSeq);
        if (!it || it.qty <= 0) return null;
        const total = (received[it.seq] ?? 0) + r.qty;
        return total > it.qty + 1e-6
          ? { name: it.name, over: total - it.qty, unit: it.unit }
          : null;
      })
      .filter(Boolean) as Array<{ name: string; over: number; unit: string }>;
  }, [draftRows, items, received]);

  async function downloadPo() {
    if (!poRef.current) return;
    setDownloadingPo(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(poRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
      });
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("no blob");
      const file = new File([blob], `${code}.png`, { type: "image/png" });

      const nav = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
        share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
      };
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        try {
          await nav.share({
            files: [file],
            title: code,
            text: `${code} - Đơn đặt hàng vật tư Huỳnh Gia`,
          });
          return;
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
        }
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `${code}.png`;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setDownloadingPo(false);
    }
  }

  async function submitDelivery() {
    if (!canSubmit) {
      if (draftRows.length === 0) toast.error("Nhập số nhận đợt này cho ít nhất 1 dòng");
      else if (invoiceFiles.length === 0) toast.error("Bắt buộc ≥1 ảnh phiếu giao hàng");
      else if (goodsFiles.length === 0) toast.error("Bắt buộc ≥1 ảnh hàng hoá");
      return;
    }
    if (overLines.length > 0) {
      const detail = overLines
        .map((o) => `• ${o.name}: vượt ${fmtQty(o.over)} ${o.unit}`)
        .join("\n");
      const ok = await confirmDialog(
        `ĐƠN NÀY CÓ ${overLines.length} DÒNG NHẬN VƯỢT SỐ ĐẶT:\n\n${detail}\n\nKiểm tra lại số nhập. Vẫn lưu đợt nhận này?`,
      );
      if (!ok) return;
    }
    setSubmitting(true);
    const fd = new FormData();
    fd.append("items", JSON.stringify(draftRows));
    if (note.trim()) fd.append("note", note.trim());
    for (const f of invoiceFiles) fd.append("invoicePhotos", f);
    for (const f of goodsFiles) fd.append("goodsPhotos", f);
    const res = await fetch(`/api/proposals/${proposalId}/deliveries`, {
      method: "POST",
      body: fd,
    });
    setSubmitting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.message || "Lỗi lưu đợt nhận");
      return;
    }
    // Refetch deliveries + tổng đã nhận
    const listRes = await fetch(`/api/proposals/${proposalId}/deliveries`, { cache: "no-store" });
    const listJson = await listRes.json().catch(() => ({ deliveries: [] }));
    setDeliveries(listJson.deliveries ?? []);

    // Cộng dồn client-side
    setReceived((prev) => {
      const next = { ...prev };
      for (const row of draftRows) {
        next[row.itemSeq] = (next[row.itemSeq] ?? 0) + row.qty;
      }
      return next;
    });

    // Check nếu tất cả item đủ số → server auto set received
    const allMet = items.every((it) => {
      const total = (received[it.seq] ?? 0) + (draftRows.find((r) => r.itemSeq === it.seq)?.qty ?? 0);
      return it.qty > 0 && total + 1e-6 >= it.qty;
    });
    if (allMet) setStatus("received");

    // Reset draft
    setDraftQty({});
    setInvoiceFiles([]);
    setGoodsFiles([]);
    setNote("");
    toast.success("Đã lưu đợt nhận");
  }

  async function addFiles(pool: File[], setPool: (f: File[]) => void, files: FileList) {
    const incoming = Array.from(files).slice(0, Math.max(0, 10 - pool.length));
    if (incoming.length < files.length) toast.error("Tối đa 10 ảnh / nhóm");
    if (incoming.length === 0) return;
    const compressed = await Promise.all(incoming.map(compressImage));
    setPool([...pool, ...compressed]);
  }

  function removeFile(pool: File[], setPool: (f: File[]) => void, idx: number) {
    const next = pool.slice();
    next.splice(idx, 1);
    setPool(next);
  }

  const totalDoneCount = items.reduce((acc, it) => {
    const got = received[it.seq] ?? 0;
    return acc + (it.qty > 0 && got + 1e-6 >= it.qty ? 1 : 0);
  }, 0);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#8892b0]">
              Mô tả PO · <span className="font-mono text-[#5a627a]">{code}</span>
            </div>
            <div className="mt-0.5 whitespace-pre-wrap text-sm text-[#f0f2ff]">{description}</div>
          </div>
          {items.length > 0 && (
            <button
              type="button"
              onClick={downloadPo}
              disabled={downloadingPo}
              className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
            >
              <Download className="h-3 w-3" />
              {downloadingPo ? "Đang tạo..." : "Tải / Chia sẻ PO"}
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[#8892b0]">
          <span>
            Nhận đủ: <b className="text-[#f0f2ff]">{totalDoneCount}</b>/{items.length}
          </span>
          <span>·</span>
          <span>Đợt: {deliveries.length}</span>
          <span>·</span>
          <span className={status === "received" ? "text-emerald-300" : "text-cyan-300"}>
            {status === "received" ? "Đã nhận đủ" : "Đang nhận"}
          </span>
        </div>
      </div>

      {items.length > 0 && (
        <PurchaseOrderTemplate
          poRef={poRef}
          code={code}
          items={items}
          project={project}
          ksName={ksName}
        />
      )}

      {/* Form đợt nhận mới */}
      {status !== "received" && (
        <div className="rounded-2xl border-2 border-[#ff8a3d]/40 bg-[#1a1d2e] p-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-[#ff8a3d]" />
            <div className="text-sm font-bold text-[#f0f2ff]">Ghi nhận đợt giao mới</div>
          </div>
          <div className="mb-2 text-[11px] text-[#8892b0]">
            Nhập số nhận đợt này cho các dòng được giao. Bắt buộc ảnh phiếu giao NCC + ảnh hàng hoá
            trước khi xác nhận.
          </div>

          <div className="space-y-1.5">
            {items.map((it) => {
              const alreadyGot = received[it.seq] ?? 0;
              const remaining = Math.max(0, it.qty - alreadyGot);
              const isDone = it.qty > 0 && alreadyGot + 1e-6 >= it.qty;
              return (
                <div
                  key={it.seq}
                  className={`grid grid-cols-[1fr_100px] items-center gap-2 rounded-lg border px-2.5 py-2 ${
                    isDone
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-[#2d3249] bg-[#0f1220]"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[#f0f2ff]">{it.name}</div>
                    <div className="text-[10px] text-[#8892b0]">
                      Đặt: {fmtQty(it.qty)} {it.unit} · Đã nhận: <b className="text-[#f0f2ff]">{fmtQty(alreadyGot)}</b>
                      {!isDone && (
                        <>
                          {" "}
                          · Còn <b className="text-amber-300">{fmtQty(remaining)}</b>
                        </>
                      )}
                    </div>
                  </div>
                  {isDone ? (
                    <div className="flex items-center justify-end gap-1 text-[11px] font-semibold text-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Đủ
                    </div>
                  ) : (
                    <input
                      inputMode="decimal"
                      placeholder="0"
                      value={draftQty[it.seq] ?? ""}
                      onChange={(e) => setDraftQty({ ...draftQty, [it.seq]: e.target.value })}
                      className="w-full rounded-md border border-[#2d3249] bg-[#0b0d16] px-2 py-1.5 text-right text-sm font-semibold text-[#f0f2ff] outline-none focus:border-[#ff8a3d]/60"
                    />
                  )}
                </div>
              );
            })}
          </div>

          <PhotoPicker
            label="Ảnh phiếu giao hàng NCC *"
            icon={<FileImage className="h-4 w-4" />}
            files={invoiceFiles}
            onAdd={(fl) => addFiles(invoiceFiles, setInvoiceFiles, fl)}
            onRemove={(i) => removeFile(invoiceFiles, setInvoiceFiles, i)}
            inputRef={invoiceInputRef}
          />
          <PhotoPicker
            label="Ảnh hàng hoá *"
            icon={<Camera className="h-4 w-4" />}
            files={goodsFiles}
            onAdd={(fl) => addFiles(goodsFiles, setGoodsFiles, fl)}
            onRemove={(i) => removeFile(goodsFiles, setGoodsFiles, i)}
            inputRef={goodsInputRef}
          />

          <label className="mt-2 block">
            <div className="mb-0.5 text-[11px] uppercase tracking-wide text-[#8892b0]">
              Ghi chú (tuỳ chọn)
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="VD: NCC hứa giao bù mai"
              className="w-full rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#ff8a3d]/60"
            />
          </label>

          {overLines.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[12px] font-bold text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Đơn này có {overLines.length} dòng nhận vượt số đặt
              </div>
              <div className="mt-1 space-y-0.5 text-[11px] text-amber-200/90">
                {overLines.map((o, i) => (
                  <div key={i}>
                    {o.name}: vượt <b>{fmtQty(o.over)}</b> {o.unit}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={submitDelivery}
            disabled={!canSubmit}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff8a3d] py-3 text-base font-bold text-[#1a120a] transition hover:bg-[#fb923c] disabled:opacity-40"
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            Xác nhận đợt nhận
          </button>
        </div>
      )}

      {/* Lịch sử các đợt đã giao */}
      {deliveries.length > 0 && (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
          <div className="mb-2 text-sm font-bold text-[#f0f2ff]">
            Lịch sử giao hàng ({deliveries.length} đợt)
          </div>
          <div className="space-y-2">
            {deliveries.map((d) => (
              <DeliveryCard key={d.id} proposalId={proposalId} delivery={d} items={items} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PhotoPicker({
  label,
  icon,
  files,
  onAdd,
  onRemove,
  inputRef,
}: {
  label: string;
  icon: React.ReactNode;
  files: File[];
  onAdd: (fl: FileList) => void;
  onRemove: (idx: number) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#f0f2ff]">
          {icon}
          {label} ({files.length}/10)
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={files.length >= 10}
          className="inline-flex items-center gap-1 rounded-lg bg-[#252840] px-3 py-1.5 text-xs font-semibold text-[#f0f2ff] hover:bg-[#2d3249] disabled:opacity-50"
        >
          <Camera className="h-3.5 w-3.5" />
          Chụp / Chọn
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onAdd(e.target.files);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      {files.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#2d3249] bg-[#0b0d16] px-3 py-3 text-center text-[11px] text-[#8892b0]">
          Chưa có ảnh
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {files.map((f, i) => (
            <FilePreview key={i} file={f} onRemove={() => onRemove(i)} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className="relative aspect-square overflow-hidden rounded-lg border border-[#252840] bg-[#0f1220]">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white hover:bg-red-600"
        aria-label="Bỏ ảnh"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

function DeliveryCard({
  proposalId,
  delivery,
  items,
}: {
  proposalId: string;
  delivery: Delivery;
  items: Item[];
}) {
  const [zoomKey, setZoomKey] = useState<{ key: string; kind: "invoice" | "goods" } | null>(null);
  const linesText = delivery.itemsSnapshot
    .map((r) => {
      const it = items.find((i) => i.seq === r.itemSeq);
      return it ? `${it.name}: ${fmtQty(r.qty)} ${it.unit}` : `Dòng ${r.itemSeq}: ${fmtQty(r.qty)}`;
    })
    .join(" · ");

  return (
    <div className="rounded-xl border border-[#252840] bg-[#0f1220] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-mono text-[#8892b0]">{fmtDate(delivery.deliveredAt)}</div>
        <div className="text-[10px] text-[#5a627a]">{delivery.receiverName}</div>
      </div>
      <div className="mt-1 text-[12px] text-[#d9def3]">{linesText}</div>
      {delivery.note && <div className="mt-1 text-[11px] italic text-[#8892b0]">&ldquo;{delivery.note}&rdquo;</div>}

      <div className="mt-2 grid grid-cols-2 gap-2">
        <PhotoStrip
          proposalId={proposalId}
          deliveryId={delivery.id}
          photos={delivery.invoicePhotos}
          kind="invoice"
          label="Phiếu giao"
          onZoom={setZoomKey}
        />
        <PhotoStrip
          proposalId={proposalId}
          deliveryId={delivery.id}
          photos={delivery.goodsPhotos}
          kind="goods"
          label="Hàng hoá"
          onZoom={setZoomKey}
        />
      </div>

      {zoomKey && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setZoomKey(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white"
            onClick={() => setZoomKey(null)}
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
          <Image
            src={`/api/proposals/${proposalId}/deliveries/${delivery.id}/photos/file?kind=${zoomKey.kind}&key=${encodeURIComponent(zoomKey.key)}`}
            alt=""
            width={1200}
            height={1200}
            unoptimized
            className="max-h-[90vh] max-w-full object-contain"
          />
        </div>
      )}
    </div>
  );
}

function PhotoStrip({
  proposalId,
  deliveryId,
  photos,
  kind,
  label,
  onZoom,
}: {
  proposalId: string;
  deliveryId: string;
  photos: Photo[];
  kind: "invoice" | "goods";
  label: string;
  onZoom: (v: { key: string; kind: "invoice" | "goods" }) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#8892b0]">
        {label} ({photos.length})
      </div>
      {photos.length === 0 ? (
        <div className="rounded-md bg-[#1a1d2e] px-2 py-3 text-center text-[10px] text-[#5a627a]">
          Không có ảnh
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {photos.slice(0, 6).map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => onZoom({ key: p.key, kind })}
              className="relative aspect-square overflow-hidden rounded-md border border-[#252840] bg-[#1a1d2e]"
            >
              <Image
                src={`/api/proposals/${proposalId}/deliveries/${deliveryId}/photos/file?kind=${kind}&key=${encodeURIComponent(p.key)}`}
                alt=""
                fill
                sizes="80px"
                className="object-cover"
                unoptimized
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PurchaseOrderTemplate({
  poRef,
  code,
  items,
  project,
  ksName,
}: {
  poRef: React.RefObject<HTMLDivElement>;
  code: string;
  items: Item[];
  project: { code: string; name: string };
  ksName: string;
}) {
  const TERRA = "#A55A35";
  const TERRA_LIGHT = "#D27A52";
  const GOLD = "#C49A3A";
  const CREAM = "#FAF6EE";
  const CREAM_DEEP = "#F3EADA";
  const INK = "#261C13";
  const MUTED = "#7A6B55";
  const today = new Date().toLocaleDateString("vi-VN");

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: "-9999px",
        width: "800px",
        background: "#ffffff",
        color: INK,
      }}
    >
      <div
        ref={poRef}
        style={{
          padding: "36px 40px 32px",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          background: "#ffffff",
          color: INK,
          borderTop: `6px solid ${TERRA}`,
        }}
      >
        <div style={{ display: "flex", gap: "16px", alignItems: "center", paddingBottom: "18px", borderBottom: `1px solid ${CREAM_DEEP}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/a6-logo-256.png"
            alt="Huỳnh Gia"
            width={68}
            height={68}
            style={{ width: "68px", height: "68px", objectFit: "contain", flexShrink: 0 }}
          />
          <div style={{ flex: 1, lineHeight: 1.35 }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: GOLD, letterSpacing: "1.5px" }}>
              CÔNG TY TNHH KIẾN TRÚC XÂY DỰNG VÀ NỘI THẤT
            </div>
            <div style={{ fontSize: "22px", fontWeight: 800, color: TERRA, letterSpacing: "0.5px", marginTop: "2px" }}>
              HUỲNH GIA
            </div>
            <div style={{ fontSize: "11px", color: MUTED, marginTop: "3px" }}>
              2157 QL51, Ấp Phước Bình 1, Xã Phước Thái, Tỉnh Đồng Nai
            </div>
            <div style={{ fontSize: "11px", color: MUTED, marginTop: "1px" }}>
              Hotline / Zalo: <span style={{ color: INK, fontWeight: 600 }}>0931 316 513</span>
              <span style={{ margin: "0 6px", color: CREAM_DEEP }}>·</span>
              <span style={{ color: INK, fontWeight: 600 }}>huynhgia6.com</span>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: "20px",
            background: `linear-gradient(135deg, ${TERRA} 0%, ${TERRA_LIGHT} 100%)`,
            color: "#ffffff",
            padding: "12px 18px",
            borderRadius: "6px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: "20px", fontWeight: 800, letterSpacing: "1px" }}>
            ĐƠN ĐẶT HÀNG VẬT TƯ
          </div>
          <div style={{ fontSize: "13px", fontWeight: 600, opacity: 0.92 }}>
            Số: {code}
          </div>
        </div>

        <div
          style={{
            marginTop: "16px",
            background: CREAM,
            border: `1px solid ${CREAM_DEEP}`,
            borderLeft: `3px solid ${GOLD}`,
            padding: "12px 16px",
            borderRadius: "4px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "6px 24px",
            fontSize: "13px",
          }}
        >
          <div>
            <span style={{ color: MUTED }}>Ngày lập:</span>{" "}
            <span style={{ fontWeight: 600 }}>{today}</span>
          </div>
          <div>
            <span style={{ color: MUTED }}>Mã công trình:</span>{" "}
            <span style={{ fontWeight: 600 }}>{project.code}</span>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <span style={{ color: MUTED }}>Công trình:</span>{" "}
            <span style={{ fontWeight: 600 }}>{project.name}</span>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <span style={{ color: MUTED }}>Người phụ trách (KS):</span>{" "}
            <span style={{ fontWeight: 600 }}>{ksName}</span>
          </div>
        </div>

        <div style={{ marginTop: "14px", fontSize: "13px" }}>
          <span style={{ color: MUTED }}>Kính gửi Quý Nhà cung cấp:</span>{" "}
          <span style={{ borderBottom: `1px dotted ${MUTED}`, paddingBottom: "1px", display: "inline-block", minWidth: "320px" }}>
            &nbsp;
          </span>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", marginTop: "16px" }}>
          <thead>
            <tr style={{ background: TERRA, color: "#ffffff" }}>
              <th style={{ padding: "10px 8px", textAlign: "center", width: "40px", fontWeight: 700 }}>STT</th>
              <th style={{ padding: "10px 10px", textAlign: "left", fontWeight: 700 }}>Chủng loại vật tư</th>
              <th style={{ padding: "10px 8px", textAlign: "right", width: "90px", fontWeight: 700 }}>Số lượng</th>
              <th style={{ padding: "10px 8px", textAlign: "center", width: "70px", fontWeight: 700 }}>ĐVT</th>
              <th style={{ padding: "10px 10px", textAlign: "left", width: "200px", fontWeight: 700 }}>Dùng cho công tác</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr
                key={i}
                style={{
                  background: i % 2 === 0 ? "#ffffff" : CREAM,
                  borderBottom: `1px solid ${CREAM_DEEP}`,
                }}
              >
                <td style={{ padding: "9px 8px", textAlign: "center", color: MUTED }}>{i + 1}</td>
                <td style={{ padding: "9px 10px", fontWeight: 600 }}>{it.name}</td>
                <td style={{ padding: "9px 8px", textAlign: "right", fontWeight: 700, color: TERRA }}>
                  {it.qty.toLocaleString("vi-VN")}
                </td>
                <td style={{ padding: "9px 8px", textAlign: "center" }}>{it.unit}</td>
                <td style={{ padding: "9px 10px", color: MUTED, fontSize: "12px" }}>
                  {it.task || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div
          style={{
            marginTop: "18px",
            padding: "10px 14px",
            background: CREAM,
            border: `1px dashed ${GOLD}`,
            borderRadius: "4px",
            fontSize: "12px",
            color: MUTED,
            lineHeight: 1.55,
          }}
        >
          <span style={{ color: TERRA, fontWeight: 700 }}>Lưu ý: </span>
          Vật tư giao đúng chủng loại, đủ số lượng. Hoá đơn / phiếu giao hàng vui lòng ghi rõ Mã PO
          <span style={{ color: INK, fontWeight: 600 }}> {code}</span> để Huỳnh Gia đối chiếu thanh toán.
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "28px", fontSize: "13px" }}>
          <div style={{ textAlign: "center", width: "45%" }}>
            <div style={{ fontWeight: 700, color: TERRA, marginBottom: "4px" }}>NHÀ CUNG CẤP</div>
            <div style={{ fontSize: "11px", color: MUTED, fontStyle: "italic" }}>(Ký, ghi rõ họ tên)</div>
            <div style={{ height: "70px" }} />
          </div>
          <div style={{ textAlign: "center", width: "45%" }}>
            <div style={{ fontWeight: 700, color: TERRA, marginBottom: "4px" }}>ĐẠI DIỆN HUỲNH GIA</div>
            <div style={{ fontSize: "11px", color: MUTED, fontStyle: "italic" }}>(Ký, ghi rõ họ tên)</div>
            <div style={{ height: "70px" }} />
          </div>
        </div>

        <div
          style={{
            marginTop: "20px",
            paddingTop: "10px",
            borderTop: `1px solid ${CREAM_DEEP}`,
            display: "flex",
            justifyContent: "space-between",
            fontSize: "10px",
            color: MUTED,
          }}
        >
          <div>Huỳnh Gia · 14 năm xây nhà phố TP.HCM · 200+ công trình</div>
          <div>{code} · {today}</div>
        </div>
      </div>
    </div>
  );
}
