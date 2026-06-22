"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, MessageSquare, X } from "lucide-react";
import { ProposalComments } from "@/app/proposals/[id]/_components/proposal-comments";

type Proposal = {
  id: string;
  description: string;
  status: "pending" | "accepted" | "declined";
  orderStatus: "not_ordered" | "ordered" | "received" | "paid";
  processedNote: string | null;
  createdAt: string;
  _count: { comments: number };
};

type Props = {
  projectId: string;
  projectName: string;
  currentUserId: string;
  onClose: () => void;
};

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

function statusBadge(p: Proposal): { label: string; bg: string; color: string } {
  if (p.status === "declined") {
    return { label: "Từ chối", bg: "rgba(210,107,107,0.18)", color: "#D26B6B" };
  }
  if (p.status === "pending") {
    return { label: "Chờ duyệt", bg: "rgba(224,184,85,0.18)", color: "#E0B855" };
  }
  if (p.orderStatus === "not_ordered") {
    return { label: "Đã duyệt · KT chưa đặt", bg: "rgba(167,139,250,0.18)", color: "#a78bfa" };
  }
  if (p.orderStatus === "ordered") {
    return { label: "Đang về", bg: "rgba(210,122,82,0.18)", color: "#D27A52" };
  }
  if (p.orderStatus === "received") {
    return { label: "Đã nhận", bg: "rgba(111,166,119,0.18)", color: "#6FA677" };
  }
  return { label: "Đã trả tiền", bg: "rgba(111,166,119,0.12)", color: "#6FA677" };
}

export function PopupOrderMaterial({ projectId, projectName, currentUserId, onClose }: Props) {
  const [items, setItems] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [openComments, setOpenComments] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/proposals?projectId=${projectId}&limit=20`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Không tải được lịch sử");
      const j = await res.json();
      setItems((j.items as Proposal[]) ?? []);
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

  const submit = async () => {
    const text = description.trim();
    if (!text || submitting) return;
    if (text.length < 2) {
      setSubmitError("Mô tả phải có ít nhất 2 ký tự");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, description: text }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Gửi thất bại");
      setOkMsg("Đã gửi cho KT. Chờ duyệt cấp.");
      setDescription("");
      await load();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Lỗi gửi");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 transition-opacity duration-200 sm:items-center sm:p-4 ${
        mounted ? "opacity-100" : "opacity-0"
      }`}
      onClick={onClose}
    >
      <div
        className={`flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-[#2a221c] bg-[#0d0b09] shadow-2xl transition-all duration-200 sm:rounded-2xl ${
          mounted ? "translate-y-0 scale-100" : "translate-y-6 scale-95"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#2a221c] px-4 py-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-[#a78bfa]">Đặt VT/Máy</div>
            <div className="truncate text-[15px] font-semibold text-[#f5ede4]">{projectName}</div>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#2a221c] text-[#9a8f80] transition-colors hover:bg-[#181410] hover:text-[#f5ede4]"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="rounded-xl border border-[#2a221c] bg-[#181410] p-3">
            <div className="mb-1.5 text-[11px] uppercase tracking-wider text-[#9a8f80]">
              Đặt mới
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={`Ví dụ:
- 10 bao xi măng PCB40
- 2 m3 cát vàng
- Thuê 1 máy đầm cóc 2 ngày`}
              className="w-full resize-y rounded-lg border border-[#2a221c] bg-[#0d0b09] px-3 py-2 text-sm text-[#f5ede4] placeholder:text-[#5a4f42] focus:border-[#a78bfa] focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] text-[#5a4f42]">
                KT lên đơn hàng chuẩn dựa trên mô tả này
              </div>
              <button
                type="button"
                onClick={submit}
                disabled={submitting || !description.trim()}
                className="shrink-0 rounded-lg bg-[#a78bfa] px-4 py-2 text-sm font-semibold text-[#0d0b09] disabled:opacity-50"
              >
                {submitting ? "Đang gửi…" : "Gửi đề xuất"}
              </button>
            </div>
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
            Lịch sử đề xuất của bạn
          </div>

          {loading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-xl border border-[#2a221c] bg-[#181410]"
                />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#2a221c] px-3 py-6 text-center text-xs text-[#9a8f80]">
              Chưa có đề xuất nào. Gõ mô tả ở trên rồi bấm Gửi.
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((p) => {
                const badge = statusBadge(p);
                const isOpen = openComments === p.id;
                return (
                  <div
                    key={p.id}
                    className="overflow-hidden rounded-xl border border-[#2a221c] bg-[#181410]"
                  >
                    <div className="p-3">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                          style={{ background: badge.bg, color: badge.color }}
                        >
                          {badge.label}
                        </span>
                        <span className="text-[11px] text-[#9a8f80]">
                          {fmtTimeShort(p.createdAt)}
                        </span>
                      </div>
                      <div className="whitespace-pre-wrap text-sm leading-snug text-[#f5ede4]">
                        {p.description}
                      </div>
                      {p.processedNote && (
                        <div
                          className="mt-2 rounded-lg border px-2.5 py-1.5 text-xs"
                          style={{
                            borderColor:
                              p.status === "declined"
                                ? "rgba(210,107,107,0.35)"
                                : "rgba(167,139,250,0.35)",
                            background:
                              p.status === "declined"
                                ? "rgba(210,107,107,0.08)"
                                : "rgba(167,139,250,0.08)",
                            color:
                              p.status === "declined" ? "#E89C9C" : "#c4b3f5",
                          }}
                        >
                          KT note: {p.processedNote}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setOpenComments(isOpen ? null : p.id)}
                        className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-[#a78bfa] hover:underline"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span>
                          {isOpen ? "Ẩn trao đổi" : `Trao đổi (${p._count.comments})`}
                        </span>
                        <ChevronDown
                          className="h-3.5 w-3.5 transition-transform"
                          style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                        />
                      </button>
                    </div>
                    {isOpen && (
                      <div className="border-t border-[#2a221c] bg-[#0d0b09] p-3">
                        <ProposalComments proposalId={p.id} currentUserId={currentUserId} />
                      </div>
                    )}
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
