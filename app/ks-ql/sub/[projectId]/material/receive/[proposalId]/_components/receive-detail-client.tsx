"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Check, CheckCircle2, Download, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";

function poCode(id: string) {
  return `PO-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

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
  project,
  ksName,
}: {
  proposalId: string;
  description: string;
  orderStatus: "ordered" | "received";
  items: Item[];
  initialReceipts: Receipt[];
  project: { code: string; name: string };
  ksName: string;
}) {
  const [receipts, setReceipts] = useState<Map<number, Receipt>>(
    () => new Map(initialReceipts.map((r) => [r.itemSeq, r])),
  );
  const [openSeq, setOpenSeq] = useState<number | null>(null);
  const poRef = useRef<HTMLDivElement>(null);
  const [downloadingPo, setDownloadingPo] = useState(false);
  const code = poCode(proposalId);

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

      {items.length > 0 && (
        <PurchaseOrderTemplate
          poRef={poRef}
          code={code}
          items={items}
          project={project}
          ksName={ksName}
        />
      )}

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
