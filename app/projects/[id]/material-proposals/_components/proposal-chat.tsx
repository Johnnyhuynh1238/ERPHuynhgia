"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };

type ProposalChatProps = {
  projectId: string;
  projectName: string;
};

function extractConfirmation(text: string): string | null {
  // Pattern: "Em xác nhận: <X>. Anh bấm CHỐT..."
  // Lấy X trước dấu chấm + "Anh bấm" hoặc trước "Anh bấm".
  const m = text.match(/Em xác nhận[:\s]+([\s\S]+?)(?=\.\s*Anh bấm|\bAnh bấm)/i);
  if (m && m[1]) return m[1].trim().replace(/[.,]\s*$/, "");
  return null;
}

export function ProposalChat({ projectId, projectName }: ProposalChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [aiThinking, setAiThinking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSubmittedId, setJustSubmittedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const callAi = useCallback(
    async (history: ChatMessage[]) => {
      setAiThinking(true);
      setError(null);
      try {
        const res = await fetch("/api/proposals/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, messages: history }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.message || json.error || "Lỗi không xác định");
        }
        setMessages((prev) => [...prev, { role: "assistant", content: json.reply }]);
      } catch (e: any) {
        setError(e.message || "Không gọi được AI");
      } finally {
        setAiThinking(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    if (messages.length === 0 && !aiThinking) {
      callAi([]);
    }
    // intentionally only on mount + when reset
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, aiThinking]);

  const sendUserMessage = async () => {
    const text = input.trim();
    if (!text || aiThinking) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    await callAi(next);
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const confirmedDescription = lastAssistant ? extractConfirmation(lastAssistant.content) : null;
  const canChot = !!confirmedDescription && !aiThinking && !submitting;

  const handleChot = async () => {
    if (!canChot || !confirmedDescription) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, description: confirmedDescription }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || "Lỗi gửi đề xuất");
      setJustSubmittedId(json.id);
      setMessages([]);
      setTimeout(() => {
        setJustSubmittedId(null);
        callAi([]);
      }, 1500);
    } catch (e: any) {
      setError(e.message || "Không gửi được");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
        <div className="text-xs text-[#8892b0]">Công trình</div>
        <div className="text-sm font-semibold text-[#f0f2ff]">{projectName}</div>
      </div>

      <div
        ref={scrollRef}
        className="h-[400px] overflow-y-auto rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3 space-y-2"
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-[#fb923c] text-[#0b0d16]"
                  : "bg-[#13151f] border border-[#2d3249] text-[#f0f2ff]"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {aiThinking && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm text-[#8892b0]">
              AI đang trả lời…
            </div>
          </div>
        )}
        {justSubmittedId && (
          <div className="flex justify-center">
            <div className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
              ✓ Đã chuyển kế toán · mã #{justSubmittedId.slice(0, 8)}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3 space-y-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendUserMessage();
            }
          }}
          rows={2}
          placeholder="Ví dụ: 5 khối cát"
          disabled={aiThinking || submitting}
          className="w-full resize-none rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm text-[#f0f2ff] placeholder:text-[#5a627a] focus:outline-none focus:ring-1 focus:ring-[#fb923c] disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={sendUserMessage}
            disabled={!input.trim() || aiThinking || submitting}
            className="rounded-xl border border-[#2d3249] bg-[#13151f] px-4 py-2 text-sm font-medium text-[#f0f2ff] transition hover:bg-[#1f2436] disabled:opacity-50"
          >
            Gửi
          </button>
          <button
            onClick={handleChot}
            disabled={!canChot}
            className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-[#0b0d16] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-[#2d3249] disabled:text-[#5a627a]"
          >
            {submitting ? "Đang gửi…" : "CHỐT"}
          </button>
        </div>
        {confirmedDescription && !submitting && (
          <div className="text-[11px] text-emerald-300">
            Sẵn sàng chốt: <span className="font-medium">{confirmedDescription}</span>
          </div>
        )}
      </div>
    </div>
  );
}
