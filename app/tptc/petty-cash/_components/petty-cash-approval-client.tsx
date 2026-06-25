"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type Expense = {
  id: string;
  code: string;
  amount: number;
  paidAmount: number | null;
  note: string | null;
  payee: string | null;
  attachmentUrl: string | null;
  status: "tptc_pending" | "pending" | "paid" | "cancelled";
  priority: "normal" | "urgent";
  tptcRejectedReason: string | null;
  cancelledReason: string | null;
  createdAt: string;
  tptcApprovedAt: string | null;
  project: { id: string; code: string; name: string } | null;
  creator: { id: string; fullName: string };
  tptcApprover: { id: string; fullName: string } | null;
  payer: { id: string; fullName: string } | null;
};

type Tab = "tptc_pending" | "history";

function fmtVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " đ";
}

function fmtTime(s: string) {
  const d = new Date(s);
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadge(e: Expense) {
  if (e.status === "tptc_pending") return { label: "Chờ duyệt", cls: "bg-amber-500/15 text-amber-300" };
  if (e.status === "pending") return { label: "KT chưa chi", cls: "bg-purple-500/15 text-purple-300" };
  if (e.status === "paid") return { label: "Đã chi", cls: "bg-emerald-500/15 text-emerald-300" };
  return { label: "Từ chối", cls: "bg-red-500/15 text-red-300" };
}

export function PettyCashApprovalClient() {
  const [tab, setTab] = useState<Tab>("tptc_pending");
  const [rows, setRows] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [openReject, setOpenReject] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tptc/petty-cash?status=${tab}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.message || "Không tải được danh sách");
        return;
      }
      setRows(j.rows ?? []);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/tptc/petty-cash/${id}/approve`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.message || "Duyệt thất bại");
        return;
      }
      toast.success("Đã duyệt. Đã chuyển sang kế toán.");
      await load();
    } finally {
      setBusy(null);
    }
  };

  const reject = async (id: string) => {
    if (rejectReason.trim().length < 3) {
      toast.error("Lý do tối thiểu 3 ký tự");
      return;
    }
    setBusy(id);
    try {
      const res = await fetch(`/api/tptc/petty-cash/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.message || "Từ chối thất bại");
        return;
      }
      toast.success("Đã từ chối.");
      setOpenReject(null);
      setRejectReason("");
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-orange-300">Yêu cầu chi mua lẻ</h1>
        <p className="text-xs text-[#8892b0]">
          KS gửi yêu cầu chi cho các khoản mua lẻ tại công trình. TPTC duyệt rồi chuyển sang kế toán chi.
        </p>
      </div>

      <div className="flex gap-2 border-b border-[#252840]">
        {[
          { k: "tptc_pending" as Tab, label: "Chờ duyệt" },
          { k: "history" as Tab, label: "Lịch sử đã xử lý" },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.k ? "border-orange-300 text-orange-300" : "border-transparent text-[#8892b0] hover:text-[#cdd6f4]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-lg border border-[#252840] bg-[#1a1d2e] p-4 text-sm text-[#8892b0]">Đang tải…</div>
      ) : rows.length === 0 ? (
        <Card className="border-[#252840] bg-[#1a1d2e]">
          <CardContent className="p-6 text-center text-sm text-[#8892b0]">
            {tab === "tptc_pending" ? "Không có yêu cầu nào chờ duyệt." : "Chưa có lịch sử."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((e) => {
            const badge = statusBadge(e);
            const isOpen = openReject === e.id;
            return (
              <Card key={e.id} className="border-[#252840] bg-[#1a1d2e]">
                <CardContent className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badge.cls}`}>
                      {badge.label}
                    </span>
                    {e.priority === "urgent" ? (
                      <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-300">
                        Khẩn
                      </span>
                    ) : null}
                    <span className="text-[11px] text-[#8892b0]">
                      {e.code} · {fmtTime(e.createdAt)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-xl font-semibold text-[#cdd6f4]">{fmtVnd(e.amount)}</span>
                    <span className="text-xs text-[#8892b0]">
                      {e.project ? `${e.project.code} — ${e.project.name}` : "(không gắn dự án)"} · KS: {e.creator.fullName}
                    </span>
                  </div>

                  {e.note ? (
                    <div className="whitespace-pre-wrap rounded-md border border-[#2d3249] bg-[#171a27] p-2 text-sm text-[#cdd6f4]">
                      {e.note}
                    </div>
                  ) : null}

                  {e.attachmentUrl ? (
                    <a
                      href={
                        e.attachmentUrl.startsWith("minio://")
                          ? `/api/expenses/${e.id}/file?type=attachment`
                          : e.attachmentUrl
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-300 hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Xem ảnh hoá đơn
                    </a>
                  ) : null}

                  {e.status === "cancelled" && (e.tptcRejectedReason || e.cancelledReason) ? (
                    <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-300">
                      Lý do từ chối: {e.tptcRejectedReason || e.cancelledReason}
                    </div>
                  ) : null}

                  {e.status !== "tptc_pending" && e.tptcApprover ? (
                    <div className="text-[11px] text-[#8892b0]">
                      Xử lý bởi {e.tptcApprover.fullName}
                      {e.tptcApprovedAt ? ` lúc ${fmtTime(e.tptcApprovedAt)}` : ""}
                    </div>
                  ) : null}

                  {e.status === "tptc_pending" ? (
                    <div className="flex flex-wrap items-center gap-2 border-t border-[#2d3249]/40 pt-2">
                      <button
                        onClick={() => approve(e.id)}
                        disabled={busy === e.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
                      >
                        {busy === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Duyệt
                      </button>
                      <button
                        onClick={() => {
                          setOpenReject(isOpen ? null : e.id);
                          setRejectReason("");
                        }}
                        disabled={busy === e.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/25 disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Từ chối
                      </button>
                    </div>
                  ) : null}

                  {isOpen ? (
                    <div className="space-y-2 border-t border-[#2d3249]/40 pt-2">
                      <textarea
                        value={rejectReason}
                        onChange={(ev) => setRejectReason(ev.target.value)}
                        rows={2}
                        placeholder="Lý do từ chối (KS sẽ thấy)"
                        className="w-full resize-y rounded-md border border-[#2d3249] bg-[#0b0d16] px-2.5 py-1.5 text-sm text-[#cdd6f4] placeholder:text-[#5a6280] focus:border-red-400 focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => reject(e.id)}
                          disabled={busy === e.id || rejectReason.trim().length < 3}
                          className="rounded-md bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-300 hover:bg-red-500/30 disabled:opacity-50"
                        >
                          {busy === e.id ? "Đang gửi…" : "Xác nhận từ chối"}
                        </button>
                        <button
                          onClick={() => {
                            setOpenReject(null);
                            setRejectReason("");
                          }}
                          className="rounded-md border border-[#2d3249] px-3 py-1 text-xs text-[#8892b0] hover:bg-[#22263a]"
                        >
                          Huỷ
                        </button>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
