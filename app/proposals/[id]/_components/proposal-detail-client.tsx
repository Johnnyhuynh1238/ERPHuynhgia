"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProposalComments } from "./proposal-comments";

type ParsedItem = { ten: string; sl: number; dvt: string };

type Proposal = {
  id: string;
  description: string;
  status: "pending" | "accepted" | "declined";
  orderStatus: "not_ordered" | "ordered" | "received" | "paid";
  parsedItems: ParsedItem[] | null;
  processedNote: string | null;
  paymentMethod: string | null;
  paymentNote: string | null;
  createdAt: string;
  acceptedAt: string | null;
  orderedAt: string | null;
  receivedAt: string | null;
  paidAt: string | null;
  reminderDueAt: string | null;
  ks: { id: string; fullName: string };
  project: { id: string; code: string; name: string };
  processor: { id: string; fullName: string } | null;
};

type ChatMessage = { role: "user" | "assistant"; content: string };

const STATUS_LABEL: Record<Proposal["status"], string> = {
  pending: "Chờ duyệt",
  accepted: "Đã duyệt",
  declined: "Từ chối",
};
const STATUS_CHIP: Record<Proposal["status"], string> = {
  pending: "bg-amber-500/15 text-amber-300",
  accepted: "bg-blue-500/15 text-blue-300",
  declined: "bg-red-500/15 text-red-300",
};
const ORDER_LABEL: Record<Proposal["orderStatus"], string> = {
  not_ordered: "Chưa đặt NCC",
  ordered: "Đã đặt NCC",
  received: "Đã nhận hàng",
  paid: "Đã thanh toán",
};
const ORDER_CHIP: Record<Proposal["orderStatus"], string> = {
  not_ordered: "bg-slate-500/15 text-slate-300",
  ordered: "bg-cyan-500/15 text-cyan-300",
  received: "bg-emerald-500/15 text-emerald-300",
  paid: "bg-emerald-600/25 text-emerald-200",
};

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const HH = String(d.getHours()).padStart(2, "0");
  const MM = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${HH}:${MM}`;
}

export function ProposalDetailClient({
  proposalId,
  currentUserId,
  currentRole,
}: {
  proposalId: string;
  currentUserId: string;
  currentRole: string;
}) {
  const isAccountantView = currentRole === "accountant" || currentRole === "admin";
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [declineNote, setDeclineNote] = useState("");
  const [showDeclineBox, setShowDeclineBox] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payMethod, setPayMethod] = useState<"cash" | "transfer" | "debt">("cash");
  const [payNote, setPayNote] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/proposals/${proposalId}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) setProposal(data.proposal);
  }, [proposalId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const doAction = async (body: Record<string, unknown>) => {
    setActionBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || "Lỗi");
      await reload();
      setShowDeclineBox(false);
      setShowPayModal(false);
      setDeclineNote("");
      setPayNote("");
    } catch (e: any) {
      setActionError(e.message || "Lỗi không xác định");
    } finally {
      setActionBusy(false);
    }
  };

  if (loading || !proposal) {
    return (
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-5 text-center text-sm text-[#8892b0]">
        Đang tải đề xuất...
      </div>
    );
  }

  const isOwnKs = proposal.ks.id === currentUserId;
  const showKsReceiveBtn =
    (isOwnKs || currentRole === "admin") &&
    proposal.status === "accepted" &&
    proposal.orderStatus === "ordered";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 slide-up">
        <Link href="/proposals" className="text-xs text-[#8892b0] hover:text-[#fb923c]">
          ‹ Quay lại danh sách
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-[#8892b0]">{proposal.project.code}</div>
            <h1 className="text-xl font-bold text-[#f0f2ff]">{proposal.project.name}</h1>
            <div className="mt-1 text-sm text-[#8892b0]">
              KS: <span className="text-[#f0f2ff]">{proposal.ks.fullName}</span> · Gửi lúc {fmtTime(proposal.createdAt)}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_CHIP[proposal.status]}`}>
              {STATUS_LABEL[proposal.status]}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${ORDER_CHIP[proposal.orderStatus]}`}>
              {ORDER_LABEL[proposal.orderStatus]}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="text-xs uppercase tracking-wide text-[#8892b0]">Nội dung KS đề xuất</div>
        <div className="mt-2 whitespace-pre-wrap text-[14px] text-[#f0f2ff]">{proposal.description}</div>
        {proposal.parsedItems && proposal.parsedItems.length > 0 && (
          <div className="mt-3">
            <div className="text-xs uppercase tracking-wide text-[#8892b0]">Items đã tách</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {proposal.parsedItems.map((it, i) => (
                <span key={i} className="rounded-md bg-[#13151f] px-2 py-1 text-xs text-[#f0f2ff]">
                  {it.ten} · <span className="font-semibold text-[#fb923c]">{it.sl}</span> {it.dvt}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="text-xs uppercase tracking-wide text-[#8892b0]">Timeline</div>
        <div className="mt-2 space-y-1.5 text-sm">
          <TimelineRow label="KS chốt đề xuất" time={proposal.createdAt} active />
          <TimelineRow label="Kế toán duyệt" time={proposal.acceptedAt} active={!!proposal.acceptedAt} />
          {proposal.status === "declined" && (
            <TimelineRow
              label={`Kế toán từ chối${proposal.processedNote ? ` — ${proposal.processedNote}` : ""}`}
              time={proposal.acceptedAt}
              active
              variant="declined"
            />
          )}
          <TimelineRow label="Đã đặt NCC" time={proposal.orderedAt} active={!!proposal.orderedAt} />
          <TimelineRow label="KS nhận hàng tại công trình" time={proposal.receivedAt} active={!!proposal.receivedAt} />
          <TimelineRow
            label={`Đã thanh toán${proposal.paymentMethod ? ` (${paymentLabel(proposal.paymentMethod)})` : ""}`}
            time={proposal.paidAt}
            active={!!proposal.paidAt}
          />
        </div>
      </div>

      {actionError && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {actionError}
        </div>
      )}

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="text-xs uppercase tracking-wide text-[#8892b0]">Hành động</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {isAccountantView && proposal.status === "pending" && (
            <>
              <button
                onClick={() => doAction({ action: "accept" })}
                disabled={actionBusy}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#0b0d16] transition hover:bg-emerald-400 disabled:opacity-50"
              >
                Duyệt
              </button>
              <button
                onClick={() => setShowDeclineBox((v) => !v)}
                disabled={actionBusy}
                className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
              >
                Từ chối
              </button>
            </>
          )}

          {isAccountantView && proposal.status === "accepted" && proposal.orderStatus === "not_ordered" && (
            <button
              onClick={() => doAction({ action: "mark_ordered" })}
              disabled={actionBusy}
              className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-[#0b0d16] transition hover:bg-cyan-400 disabled:opacity-50"
            >
              Đã đặt NCC
            </button>
          )}

          {showKsReceiveBtn && (
            <button
              onClick={() => doAction({ action: "mark_received" })}
              disabled={actionBusy}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#0b0d16] transition hover:bg-emerald-400 disabled:opacity-50"
            >
              Đã nhận hàng tại công trình
            </button>
          )}

          {isAccountantView && proposal.status === "accepted" && proposal.orderStatus === "received" && (
            <button
              onClick={() => setShowPayModal(true)}
              disabled={actionBusy}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#0b0d16] transition hover:bg-emerald-400 disabled:opacity-50"
            >
              Hoàn tất thanh toán
            </button>
          )}

          {!isAccountantView &&
            !showKsReceiveBtn &&
            proposal.status === "pending" && (
              <div className="text-xs text-[#8892b0]">Đang chờ kế toán duyệt đề xuất.</div>
            )}
          {!isAccountantView &&
            !showKsReceiveBtn &&
            proposal.status === "accepted" &&
            proposal.orderStatus === "not_ordered" && (
              <div className="text-xs text-[#8892b0]">Kế toán đang xử lý đặt NCC.</div>
            )}
          {proposal.status === "declined" && (
            <div className="text-xs text-red-300">Đề xuất đã bị từ chối, kết thúc luồng.</div>
          )}
          {proposal.orderStatus === "paid" && (
            <div className="text-xs text-emerald-300">Đề xuất đã hoàn tất.</div>
          )}
        </div>

        {showDeclineBox && (
          <div className="mt-3 space-y-2 rounded-xl border border-[#2d3249] bg-[#13151f] p-3">
            <textarea
              value={declineNote}
              onChange={(e) => setDeclineNote(e.target.value)}
              rows={2}
              placeholder="Lý do từ chối (tuỳ chọn)"
              className="w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
            />
            <div className="flex gap-2">
              <button
                onClick={() => doAction({ action: "decline", note: declineNote.trim() || undefined })}
                disabled={actionBusy}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                Xác nhận từ chối
              </button>
              <button
                onClick={() => setShowDeclineBox(false)}
                disabled={actionBusy}
                className="rounded-lg border border-[#2d3249] px-3 py-1.5 text-xs text-[#8892b0]"
              >
                Hủy
              </button>
            </div>
          </div>
        )}

        {showPayModal && (
          <div className="mt-3 space-y-2 rounded-xl border border-[#2d3249] bg-[#13151f] p-3">
            <div className="text-xs uppercase tracking-wide text-[#8892b0]">Phương thức thanh toán</div>
            <div className="flex flex-wrap gap-2">
              {(["cash", "transfer", "debt"] as const).map((m) => (
                <label
                  key={m}
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs ${
                    payMethod === m
                      ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
                      : "border-[#2d3249] bg-[#0b0d16] text-[#8892b0]"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymethod"
                    value={m}
                    checked={payMethod === m}
                    onChange={() => setPayMethod(m)}
                    className="hidden"
                  />
                  {paymentLabel(m)}
                </label>
              ))}
            </div>
            <textarea
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              rows={2}
              placeholder="Ghi chú (số PT, ngày hẹn trả công nợ, …)"
              className="w-full rounded-lg border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#f0f2ff]"
            />
            <div className="flex gap-2">
              <button
                onClick={() =>
                  doAction({
                    action: "mark_paid",
                    paymentMethod: payMethod,
                    paymentNote: payNote.trim() || undefined,
                  })
                }
                disabled={actionBusy}
                className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-[#0b0d16] disabled:opacity-50"
              >
                Xác nhận
              </button>
              <button
                onClick={() => setShowPayModal(false)}
                disabled={actionBusy}
                className="rounded-lg border border-[#2d3249] px-3 py-1.5 text-xs text-[#8892b0]"
              >
                Hủy
              </button>
            </div>
          </div>
        )}
      </div>

      <ProposalComments proposalId={proposal.id} currentUserId={currentUserId} />

      {isAccountantView && <AccountantChat proposalId={proposal.id} />}
    </div>
  );
}

function TimelineRow({
  label,
  time,
  active,
  variant = "default",
}: {
  label: string;
  time: string | null;
  active: boolean;
  variant?: "default" | "declined";
}) {
  const dotColor = variant === "declined" ? "bg-red-400" : active ? "bg-emerald-400" : "bg-[#2d3249]";
  const textColor = variant === "declined" ? "text-red-300" : active ? "text-[#f0f2ff]" : "text-[#5a627a]";
  return (
    <div className="flex items-start gap-2">
      <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
      <div className="flex-1">
        <div className={`text-[13px] ${textColor}`}>{label}</div>
        <div className="text-[11px] text-[#5a627a]">{fmtTime(time)}</div>
      </div>
    </div>
  );
}

function paymentLabel(method: string) {
  if (method === "cash") return "Tiền mặt";
  if (method === "transfer") return "Chuyển khoản";
  if (method === "debt") return "Ghi công nợ";
  return method;
}

function AccountantChat({ proposalId }: { proposalId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const callAi = useCallback(
    async (history: ChatMessage[]) => {
      setThinking(true);
      setError(null);
      try {
        const res = await fetch(`/api/proposals/${proposalId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || json.error || "Lỗi không xác định");
        setMessages((prev) => [...prev, { role: "assistant", content: json.reply }]);
      } catch (e: any) {
        setError(e.message || "Không gọi được AI");
      } finally {
        setThinking(false);
      }
    },
    [proposalId],
  );

  useEffect(() => {
    if (messages.length === 0 && !thinking) callAi([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  const send = async () => {
    const text = input.trim();
    if (!text || thinking) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    await callAi(next);
  };

  return (
    <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
      <div className="text-xs uppercase tracking-wide text-[#8892b0]">Trợ lý AI kế toán</div>
      <div
        ref={scrollRef}
        className="mt-2 h-[320px] overflow-y-auto rounded-xl border border-[#2d3249] bg-[#13151f] p-3 space-y-2"
      >
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-[#fb923c] text-[#0b0d16]"
                  : "bg-[#0b0d16] border border-[#2d3249] text-[#f0f2ff]"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-[#2d3249] bg-[#0b0d16] px-3 py-2 text-sm text-[#8892b0]">
              AI đang trả lời…
            </div>
          </div>
        )}
      </div>
      {error && (
        <div className="mt-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder='Ví dụ: "Soạn tin nhắn gửi NCC cát đá"'
          disabled={thinking}
          className="flex-1 resize-none rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm text-[#f0f2ff] placeholder:text-[#5a627a] focus:outline-none focus:ring-1 focus:ring-[#fb923c] disabled:opacity-60"
        />
        <button
          onClick={send}
          disabled={!input.trim() || thinking}
          className="rounded-xl border border-[#2d3249] bg-[#13151f] px-4 py-2 text-sm font-medium text-[#f0f2ff] hover:bg-[#1f2436] disabled:opacity-50"
        >
          Gửi
        </button>
      </div>
    </div>
  );
}
