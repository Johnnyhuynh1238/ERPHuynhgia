"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Check, CheckCircle2, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";

type Item = { seq: number; name: string; qty: number; unit: string; task: string };
type Photo = { key: string };
type Receipt = {
  itemSeq: number;
  receivedQty: number;
  qcChecked: boolean;
  photos: Photo[];
  note: string | null;
  receivedAt: string;
};

function fmtQty(n: number) {
  const r = Math.round(n * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : r.toFixed(3).replace(/\.?0+$/, "");
}

export function ReceiveDetailClient({
  proposalId,
  description,
  orderStatus,
  items,
  initialReceipts,
}: {
  proposalId: string;
  description: string;
  orderStatus: "ordered" | "received";
  items: Item[];
  initialReceipts: Receipt[];
}) {
  const [receipts, setReceipts] = useState<Map<number, Receipt>>(
    () => new Map(initialReceipts.map((r) => [r.itemSeq, r])),
  );
  const [openSeq, setOpenSeq] = useState<number | null>(null);

  function updateReceipt(seq: number, r: Receipt | null) {
    setReceipts((prev) => {
      const m = new Map(prev);
      if (r) m.set(seq, r);
      else m.delete(seq);
      return m;
    });
  }

  const summary = useMemo(() => {
    let done = 0;
    let qc = 0;
    let photos = 0;
    for (const it of items) {
      const r = receipts.get(it.seq);
      if (r && r.receivedQty + 1e-6 >= it.qty && it.qty > 0) done += 1;
      if (r?.qcChecked) qc += 1;
      photos += r?.photos.length ?? 0;
    }
    return { done, qc, photos };
  }, [items, receipts]);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[#8892b0]">
          Mô tả PO
        </div>
        <div className="mt-0.5 whitespace-pre-wrap text-sm text-[#f0f2ff]">{description}</div>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[#8892b0]">
          <span>
            Nhận: <b className="text-[#f0f2ff]">{summary.done}</b>/{items.length}
          </span>
          <span>·</span>
          <span>QC: {summary.qc}/{items.length}</span>
          <span>·</span>
          <span>Ảnh: {summary.photos}</span>
          <span>·</span>
          <span className={orderStatus === "received" ? "text-emerald-300" : "text-cyan-300"}>
            {orderStatus === "received" ? "Đã nhận đủ" : "Đang nhận"}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {items.map((it) => {
          const r = receipts.get(it.seq);
          const isComplete = r && r.receivedQty + 1e-6 >= it.qty && it.qty > 0;
          return (
            <button
              key={it.seq}
              type="button"
              onClick={() => setOpenSeq(it.seq)}
              className="block w-full rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3 text-left transition hover:border-[#ff8a3d]/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="text-sm font-semibold text-[#f0f2ff]">{it.name}</div>
                  <div className="text-[11px] text-[#8892b0]">
                    Đặt: <b className="text-[#f0f2ff]">{fmtQty(it.qty)}</b> {it.unit}
                    {it.task && <span className="ml-2 text-[#5a627a]">· {it.task}</span>}
                  </div>
                </div>
                <div className="text-right">
                  {r ? (
                    <>
                      <div className={`text-sm font-semibold ${isComplete ? "text-emerald-300" : "text-amber-300"}`}>
                        {fmtQty(r.receivedQty)} {it.unit}
                      </div>
                      <div className="mt-0.5 flex items-center justify-end gap-1.5 text-[10px] text-[#8892b0]">
                        {r.qcChecked && (
                          <span className="inline-flex items-center gap-0.5 text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" /> QC
                          </span>
                        )}
                        <span>{r.photos.length} ảnh</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-[11px] text-[#8892b0]">Chưa nhận</div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {openSeq !== null && (
        <ReceiveModal
          proposalId={proposalId}
          item={items.find((i) => i.seq === openSeq)!}
          receipt={receipts.get(openSeq) ?? null}
          onClose={() => setOpenSeq(null)}
          onSaved={(r) => updateReceipt(openSeq, r)}
        />
      )}
    </div>
  );
}

function ReceiveModal({
  proposalId,
  item,
  receipt,
  onClose,
  onSaved,
}: {
  proposalId: string;
  item: Item;
  receipt: Receipt | null;
  onClose: () => void;
  onSaved: (r: Receipt) => void;
}) {
  const [qty, setQty] = useState<string>(
    receipt ? fmtQty(receipt.receivedQty) : fmtQty(item.qty),
  );
  const [qcChecked, setQcChecked] = useState<boolean>(receipt?.qcChecked ?? false);
  const [note, setNote] = useState<string>(receipt?.note ?? "");
  const [photos, setPhotos] = useState<Photo[]>(receipt?.photos ?? []);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function saveBasic() {
    const num = Number(qty.replace(",", "."));
    if (!Number.isFinite(num) || num < 0) {
      toast.error("Số nhận không hợp lệ");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/proposals/${proposalId}/items/${item.seq}/receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receivedQty: num,
        qcChecked,
        note: note.trim() || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.message || "Lỗi lưu");
      return;
    }
    const j = await res.json();
    const updated: Receipt = {
      itemSeq: j.receipt.itemSeq,
      receivedQty: Number(j.receipt.receivedQty),
      qcChecked: j.receipt.qcChecked,
      photos,
      note: j.receipt.note,
      receivedAt: j.receipt.receivedAt,
    };
    onSaved(updated);
    toast.success("Đã lưu");
  }

  async function uploadPhotos(files: FileList) {
    if (!receipt && !files.length) return;
    if (!receipt) {
      toast.error("Lưu số lượng nhận trước khi up ảnh");
      return;
    }
    if (photos.length + files.length > 10) {
      toast.error(`Mỗi mặt hàng tối đa 10 ảnh (đang có ${photos.length})`);
      return;
    }
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    setUploading(true);
    const res = await fetch(`/api/proposals/${proposalId}/items/${item.seq}/receipt/photos`, {
      method: "POST",
      body: fd,
    });
    setUploading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.message || "Lỗi tải ảnh");
      return;
    }
    const j = await res.json();
    const next: Photo[] = j.photos.map((p: { key: string }) => ({ key: p.key }));
    setPhotos(next);
    onSaved({
      ...(receipt as Receipt),
      photos: next,
    });
  }

  async function deletePhoto(key: string) {
    if (!window.confirm("Xoá ảnh này?")) return;
    const res = await fetch(
      `/api/proposals/${proposalId}/items/${item.seq}/receipt/photos?key=${encodeURIComponent(key)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      toast.error("Lỗi xoá ảnh");
      return;
    }
    const j = await res.json();
    const next: Photo[] = j.photos.map((p: { key: string }) => ({ key: p.key }));
    setPhotos(next);
    if (receipt) onSaved({ ...receipt, photos: next });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-2 sm:p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#8892b0]">
              Nhận vật tư
            </div>
            <div className="text-base font-bold text-[#f0f2ff]">{item.name}</div>
            <div className="text-[11px] text-[#8892b0]">
              Số đặt: <b className="text-[#f0f2ff]">{fmtQty(item.qty)}</b> {item.unit}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[#8892b0] hover:bg-[#252840] hover:text-[#f0f2ff]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2">
          <label className="block">
            <div className="mb-0.5 text-[11px] uppercase tracking-wide text-[#8892b0]">
              Số thực nhận *
            </div>
            <input
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2.5 text-base font-semibold text-[#f0f2ff] outline-none focus:border-[#ff8a3d]/60"
            />
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff]">
            <input
              type="checkbox"
              checked={qcChecked}
              onChange={(e) => setQcChecked(e.target.checked)}
              className="h-4 w-4 accent-[#ff8a3d]"
            />
            <span>Đã kiểm tra chất lượng (QC)</span>
            {qcChecked && <Check className="ml-auto h-4 w-4 text-emerald-300" />}
          </label>

          <label className="block">
            <div className="mb-0.5 text-[11px] uppercase tracking-wide text-[#8892b0]">Ghi chú</div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="VD: thiếu 1 cây, NCC hứa giao bù mai"
              className="w-full rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#ff8a3d]/60"
            />
          </label>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wide text-[#8892b0]">
                Ảnh ({photos.length}/10)
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || photos.length >= 10 || !receipt}
                className="inline-flex items-center gap-1 rounded-lg bg-[#ff8a3d] px-3 py-1 text-xs font-semibold text-black hover:bg-[#ffa05f] disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                Thêm ảnh
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) uploadPhotos(e.target.files);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            {!receipt && (
              <div className="text-[10px] text-amber-300/90">
                Lưu số lượng trước rồi mới up ảnh được.
              </div>
            )}
            {photos.length > 0 && (
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {photos.map((p) => (
                  <div
                    key={p.key}
                    className="relative aspect-square overflow-hidden rounded-lg border border-[#252840] bg-[#0f1220]"
                  >
                    <Image
                      src={`/api/proposals/${proposalId}/items/${item.seq}/receipt/photos/file?key=${encodeURIComponent(p.key)}`}
                      alt=""
                      fill
                      sizes="120px"
                      className="object-cover"
                      unoptimized
                    />
                    <button
                      type="button"
                      onClick={() => deletePhoto(p.key)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-red-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-[#2d3249] px-3 py-2 text-sm text-[#8892b0]"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={saveBasic}
            disabled={busy}
            className="rounded-xl bg-[#ff8a3d] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
          >
            {busy ? "Đang lưu…" : "Lưu nhận"}
          </button>
        </div>
      </div>
    </div>
  );
}
