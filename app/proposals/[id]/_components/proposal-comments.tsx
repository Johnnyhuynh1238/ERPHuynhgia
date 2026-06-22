"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Comment = {
  id: string;
  body: string;
  authorRole: string;
  createdAt: string;
  author: { id: string; fullName: string };
};

const ROLE_LABEL: Record<string, { label: string; color: string }> = {
  engineer: { label: "KS", color: "#a78bfa" },
  accountant: { label: "KT", color: "#6FA677" },
  construction_manager: { label: "TPTC", color: "#E0B855" },
  admin: { label: "Admin", color: "#D27A52" },
};

function fmtTime(s: string) {
  const d = new Date(s);
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ProposalComments({
  proposalId,
  currentUserId,
}: {
  proposalId: string;
  currentUserId: string;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/proposals/${proposalId}/comments`, { cache: "no-store" });
      if (!res.ok) throw new Error("Không tải được bình luận");
      const j = await res.json();
      setComments(j.comments || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải");
    } finally {
      setLoading(false);
    }
  }, [proposalId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [comments.length]);

  const submit = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Gửi thất bại");
      setComments((prev) => [...prev, j.comment]);
      setBody("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi gửi");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
      <div className="mb-2 text-xs uppercase tracking-wide text-[#8892b0]">
        Trao đổi (KS · KT · TPTC)
      </div>

      <div
        ref={listRef}
        className="mb-2 max-h-[320px] space-y-2 overflow-y-auto pr-1"
      >
        {loading ? (
          <div className="text-center text-xs text-[#8892b0]">Đang tải…</div>
        ) : comments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#2d3249] px-3 py-4 text-center text-xs text-[#8892b0]">
            Chưa có trao đổi. Hỏi/đáp về quy cách, NCC, thời hạn… tại đây.
          </div>
        ) : (
          comments.map((c) => {
            const meta = ROLE_LABEL[c.authorRole] ?? { label: c.authorRole, color: "#8892b0" };
            const mine = c.author.id === currentUserId;
            return (
              <div
                key={c.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    mine
                      ? "rounded-tr-md border border-[#3a3461] bg-[#26203d] text-[#f0f2ff]"
                      : "rounded-tl-md border border-[#2d3249] bg-[#0f1220] text-[#d4c8b8]"
                  }`}
                >
                  <div className="mb-0.5 flex items-baseline gap-2 text-[10px]">
                    <span
                      className="rounded px-1 py-px font-semibold uppercase tracking-wider"
                      style={{ background: `${meta.color}22`, color: meta.color }}
                    >
                      {meta.label}
                    </span>
                    <span className="text-[#8892b0]">{c.author.fullName}</span>
                    <span className="text-[#5a627a]">· {fmtTime(c.createdAt)}</span>
                  </div>
                  <div className="whitespace-pre-wrap leading-snug">{c.body}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <div className="mb-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder="Viết trao đổi… (Ctrl/⌘+Enter để gửi)"
          className="flex-1 resize-none rounded-lg border border-[#2d3249] bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#a78bfa]"
        />
        <button
          type="button"
          onClick={submit}
          disabled={sending || !body.trim()}
          className="shrink-0 rounded-lg bg-[#a78bfa] px-4 py-2 text-sm font-semibold text-[#0b0d16] disabled:opacity-50"
        >
          {sending ? "Gửi…" : "Gửi"}
        </button>
      </div>
    </div>
  );
}
