"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";

type Expense = {
  id: string;
  code: string;
  amount: number;
  paidAmount: number | null;
  note: string | null;
  attachmentUrl: string | null;
  status: "tptc_pending" | "pending" | "paid" | "cancelled";
  priority: "normal" | "urgent";
  cancelledReason: string | null;
  tptcRejectedReason: string | null;
  createdAt: string;
  tptcApprover: { id: string; fullName: string } | null;
  project: { id: string; code: string; name: string } | null;
  category: { id: string; code: string; name: string };
};

type Props = {
  projectId: string;
  projectName: string;
  onClose: () => void;
};

function fmtVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " đ";
}

function fmtTimeShort(s: string) {
  const d = new Date(s);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (sameDay) {
    return `Hôm nay ${d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (diffDays === 1) {
    return `Hôm qua ${d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (diffDays < 7) return `${diffDays} ngày trước`;
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function statusBadge(e: Expense): { label: string; bg: string; color: string } {
  if (e.status === "tptc_pending") return { label: "Chờ TPTC duyệt", bg: "rgba(224,184,85,0.18)", color: "#fbbf24" };
  if (e.status === "pending") return { label: "TPTC duyệt · KT chưa chi", bg: "rgba(167,139,250,0.18)", color: "#a78bfa" };
  if (e.status === "paid") return { label: "Đã chi", bg: "rgba(111,166,119,0.18)", color: "#34d399" };
  return { label: "Từ chối", bg: "rgba(210,107,107,0.18)", color: "#f87171" };
}

export function PopupPettyCash({ projectId, projectName, onClose }: Props) {
  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [priority, setPriority] = useState<"normal" | "urgent">("normal");
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/ks-ql/petty-cash?projectId=${projectId}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Không tải được lịch sử");
      const j = await res.json();
      setItems((j.rows as Expense[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = orig;
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleFile = async (file: File) => {
    setUploading(true);
    setSubmitError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "receipt");
      const res = await fetch("/api/expenses/upload-receipt", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message || "Upload thất bại");
      setAttachmentUrl(j.url);
      setPreviewUrl(URL.createObjectURL(file));
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Lỗi upload ảnh");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setSubmitError(null);
    setOkMsg(null);
    const amt = Number(amount.replace(/[^\d]/g, ""));
    if (!amt || amt <= 0) {
      setSubmitError("Số tiền không hợp lệ");
      return;
    }
    if (note.trim().length < 3) {
      setSubmitError("Ghi chú đơn hàng tối thiểu 3 ký tự");
      return;
    }
    if (!attachmentUrl) {
      setSubmitError("Bắt buộc gửi ảnh hoá đơn");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/ks-ql/petty-cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          amount: amt,
          note: note.trim(),
          attachmentUrl,
          priority,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message || "Gửi thất bại");
      setOkMsg("Đã gửi yêu cầu cho TPTC duyệt.");
      setAmount("");
      setNote("");
      setAttachmentUrl(null);
      setPreviewUrl(null);
      setPriority("normal");
      await load();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Lỗi gửi");
    } finally {
      setSubmitting(false);
    }
  };

  const formatAmountInput = (v: string) => {
    const digits = v.replace(/[^\d]/g, "");
    if (!digits) return "";
    return new Intl.NumberFormat("vi-VN").format(Number(digits));
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 pb-[env(safe-area-inset-bottom)] transition-opacity duration-200 sm:items-center sm:p-4 sm:pb-4 ${
        mounted ? "opacity-100" : "opacity-0"
      }`}
      onClick={onClose}
    >
      <div
        className={`flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-[#2a221c] bg-[#0d0b09] shadow-2xl transition-all duration-200 sm:rounded-2xl ${
          mounted ? "translate-y-0 scale-100" : "translate-y-6 scale-95"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#2a221c] px-4 py-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-[#a78bfa]">Yêu cầu chi mua lẻ</div>
            <div className="truncate text-[15px] font-semibold text-[#f0f2ff]">{projectName}</div>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#2a221c] text-[#9a8f80] transition-colors hover:bg-[#181410] hover:text-[#f0f2ff]"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="rounded-xl border border-[#2a221c] bg-[#181410] p-3">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-[#9a8f80]">
              Gửi yêu cầu mới
            </div>

            <label className="mb-2 block">
              <span className="mb-1 block text-xs text-[#9a8f80]">Số tiền (VNĐ)</span>
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(formatAmountInput(e.target.value))}
                placeholder="120.000"
                className="w-full rounded-lg border border-[#2a221c] bg-[#0d0b09] px-3 py-2 text-base font-medium text-[#f0f2ff] placeholder:text-[#5a4f42] focus:border-[#a78bfa] focus:outline-none"
              />
            </label>

            <label className="mb-2 block">
              <span className="mb-1 block text-xs text-[#9a8f80]">Ghi chú đơn hàng</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={`Ví dụ:
- 2 ổ điện + 5m dây 2.5
- 1 kg đinh 5 phân
- Cơm trưa cho thợ ngày mưa`}
                className="w-full resize-y rounded-lg border border-[#2a221c] bg-[#0d0b09] px-3 py-2 text-sm text-[#f0f2ff] placeholder:text-[#5a4f42] focus:border-[#a78bfa] focus:outline-none"
              />
            </label>

            <div className="mb-2">
              <span className="mb-1 block text-xs text-[#9a8f80]">Ảnh hoá đơn (bắt buộc)</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#3a2d22] bg-[#0d0b09] px-3 py-3 text-sm text-[#d4c8b8] transition-colors hover:border-[#a78bfa] hover:text-[#a78bfa] disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang upload…
                  </>
                ) : attachmentUrl ? (
                  <>
                    <Camera className="h-4 w-4" />
                    Đã có ảnh — bấm để đổi
                  </>
                ) : (
                  <>
                    <Camera className="h-4 w-4" />
                    Chụp / chọn ảnh hoá đơn
                  </>
                )}
              </button>
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Hoá đơn"
                  className="mt-2 max-h-40 rounded-lg border border-[#2a221c] object-contain"
                />
              ) : null}
            </div>

            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs text-[#9a8f80]">Ưu tiên:</span>
              <button
                type="button"
                onClick={() => setPriority("normal")}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  priority === "normal"
                    ? "border-[#a78bfa] bg-[#a78bfa]/15 text-[#a78bfa]"
                    : "border-[#2a221c] text-[#9a8f80]"
                }`}
              >
                Bình thường
              </button>
              <button
                type="button"
                onClick={() => setPriority("urgent")}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  priority === "urgent"
                    ? "border-[#f87171] bg-[#f87171]/15 text-[#f87171]"
                    : "border-[#2a221c] text-[#9a8f80]"
                }`}
              >
                Khẩn
              </button>
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={submitting || uploading}
              className="mt-1 w-full rounded-lg bg-[#a78bfa] px-4 py-2.5 text-sm font-semibold text-[#0d0b09] disabled:opacity-50"
            >
              {submitting ? "Đang gửi…" : "Gửi yêu cầu cho TPTC"}
            </button>

            {submitError && (
              <div className="mt-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {submitError}
              </div>
            )}
            {okMsg && (
              <div className="mt-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                {okMsg}
              </div>
            )}
          </div>

          <div className="mt-4 mb-1.5 text-[11px] uppercase tracking-wider text-[#9a8f80]">
            Yêu cầu của bạn gần đây
          </div>

          {loading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl border border-[#2a221c] bg-[#181410]" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#2a221c] px-3 py-6 text-center text-xs text-[#9a8f80]">
              Chưa gửi yêu cầu nào.
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((e) => {
                const badge = statusBadge(e);
                return (
                  <div key={e.id} className="overflow-hidden rounded-xl border border-[#2a221c] bg-[#181410] p-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                        style={{ background: badge.bg, color: badge.color }}
                      >
                        {badge.label}
                      </span>
                      <span className="text-[11px] text-[#9a8f80]">{e.code} · {fmtTimeShort(e.createdAt)}</span>
                      {e.priority === "urgent" ? (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                              style={{ background: "rgba(210,107,107,0.18)", color: "#f87171" }}>
                          Khẩn
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[15px] font-semibold text-[#f0f2ff]">
                      {fmtVnd(e.amount)}
                    </div>
                    {e.note ? (
                      <div className="mt-0.5 whitespace-pre-wrap text-sm text-[#d4c8b8]">{e.note}</div>
                    ) : null}
                    {e.status === "cancelled" && (e.tptcRejectedReason || e.cancelledReason) ? (
                      <div
                        className="mt-2 rounded-lg border px-2.5 py-1.5 text-xs"
                        style={{
                          borderColor: "rgba(210,107,107,0.35)",
                          background: "rgba(210,107,107,0.08)",
                          color: "#E89C9C",
                        }}
                      >
                        Lý do từ chối: {e.tptcRejectedReason || e.cancelledReason}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
