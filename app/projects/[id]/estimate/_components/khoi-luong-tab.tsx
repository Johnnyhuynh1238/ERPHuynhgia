"use client";

import { Check, CheckCheck, Loader2, MessageCircleQuestion, Sparkles, Trash2, Wrench, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { EditableText } from "./editable-text";
import { WorkerStatusBanner } from "./worker-status-banner";

type Qa = { q: string; a?: string; askedAt: string; answeredAt?: string };
type LineStatus = "ai_draft" | "edited" | "approved";

type Line = {
  id: string;
  normCode: string | null;
  normName: string | null;
  name: string;
  unit: string;
  formula: string | null;
  quantity: number;
  status: LineStatus;
  aiQuestion: string | null;
  aiAnswer: string | null;
  fixRequest: string | null;
  note: string | null;
};

type Item = { id: string; name: string; status: string; qaThread: Qa[]; lines: Line[] };
type Group = { id: string; name: string; items: Item[] };

const LINE_STATUS: Record<LineStatus, { label: string; cls: string }> = {
  ai_draft: { label: "AI nháp", cls: "bg-sky-500/15 text-sky-400" },
  edited: { label: "Đã sửa", cls: "bg-amber-500/15 text-amber-400" },
  approved: { label: "Duyệt", cls: "bg-emerald-500/15 text-emerald-400" },
};

async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  if (!r.ok) {
    const data = await r.json().catch(() => null);
    throw new Error(data?.message || `Lỗi ${r.status}`);
  }
  return r.json();
}

const fmtQty = (n: number) =>
  n.toLocaleString("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: 3 });

export function KhoiLuongTab({ projectId }: { projectId: string }) {
  const [groups, setGroups] = useState<Group[] | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await api(`/api/projects/${projectId}/estimate/lines`);
      setGroups(data.groups);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Có hạng mục đang bóc → poll để line mới tự hiện
  const hasPending = groups?.some((g) => g.items.some((it) => it.status === "requested" || it.status === "analyzing"));
  useEffect(() => {
    if (!hasPending) return;
    const t = setInterval(() => void reload(), 10000);
    return () => clearInterval(t);
  }, [hasPending, reload]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (groups === null) {
    return (
      <div className="grid place-items-center rounded-2xl border border-[#252840] bg-[#13151f] p-16">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  const itemsWithLines = groups.flatMap((g) => g.items).filter((it) => it.lines.length > 0);
  if (itemsWithLines.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#252840] bg-[#13151f] p-10 text-center">
        <p className="text-sm font-semibold text-zinc-300">Chưa có khối lượng</p>
        <p className="mt-1 text-xs text-zinc-500">
          Qua tab <b>Mô tả</b> nhập hạng mục rồi bấm <b className="text-[#fb923c]">AI Phân tích</b> — công tác AI bóc sẽ hiện ở đây.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <WorkerStatusBanner />
      <div className="overflow-x-auto rounded-2xl border border-[#252840] bg-[#13151f]">
        <table className="w-full min-w-[960px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-[#252840] text-[11px] uppercase tracking-wide text-zinc-500">
            <th className="w-[9%] px-3 py-2.5 font-semibold">Mã ĐM</th>
            <th className="w-[24%] px-3 py-2.5 font-semibold">Công tác</th>
            <th className="w-[30%] px-3 py-2.5 font-semibold">Diễn giải</th>
            <th className="w-[10%] px-3 py-2.5 text-right font-semibold">Khối lượng</th>
            <th className="w-[6%] px-3 py-2.5 font-semibold">ĐV</th>
            <th className="w-[8%] px-3 py-2.5 font-semibold">Trạng thái</th>
            <th className="w-[13%] px-3 py-2.5 text-right font-semibold"></th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const items = g.items.filter((it) => it.lines.length > 0 || it.status === "analyzing" || it.status === "waiting_answer");
            if (items.length === 0) return null;
            return (
              <GroupSection key={g.id} group={g} items={items} run={run} />
            );
          })}
        </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupSection({ group, items, run }: { group: Group; items: Item[]; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  return (
    <>
      <tr className="border-y border-[#252840] bg-[#1a1d2e]">
        <td colSpan={7} className="px-3 py-2 text-[13px] font-bold text-[#fb923c]">{group.name}</td>
      </tr>
      {items.map((it) => (
        <ItemSection key={it.id} item={it} run={run} />
      ))}
    </>
  );
}

function ItemSection({ item, run }: { item: Item; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const allApproved = item.lines.length > 0 && item.lines.every((l) => l.status === "approved");
  const isProcessing = item.status === "requested" || item.status === "analyzing";
  // Công tác chưa duyệt + có yêu cầu sửa = phần AI sẽ sửa lại
  const fixCount = item.lines.filter((l) => l.fixRequest && l.status !== "approved").length;
  // Câu hỏi còn treo (chung + theo công tác), và có gì đã trả lời / cần gửi lại AI
  const openCount = item.qaThread.filter((q) => !q.a).length + item.lines.filter((l) => l.aiQuestion && !l.aiAnswer).length;
  const answeredReady = item.qaThread.some((q) => q.a) || item.lines.some((l) => l.aiAnswer);
  const actionable = fixCount > 0 || answeredReady;

  return (
    <>
      {/* Câu hỏi chung của hạng mục — nằm TRÊN hàng tên hạng mục */}
      {item.qaThread.map((qa, qi) => (
        <tr key={`q${qi}`} className="border-b border-[#1c1f30] bg-[#191322]/60">
          <td colSpan={7} className="px-3 py-1.5">
            <AnswerBox
              question={qa.q}
              answer={qa.a ?? null}
              onSave={(a) => run(() => api(`/api/estimate/items/${item.id}/answer`, { method: "POST", body: JSON.stringify({ index: qi, answer: a }) }))}
            />
          </td>
        </tr>
      ))}

      <tr className="border-b border-[#1c1f30] bg-[#161927]">
        <td colSpan={7} className="px-3 py-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pl-2 text-xs font-semibold text-zinc-200">{item.name}</span>
            {isProcessing && (
              <span className="flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-400">
                <Loader2 className="h-2.5 w-2.5 animate-spin" /> AI đang xử lý…
              </span>
            )}
            {openCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                <MessageCircleQuestion className="h-3 w-3" /> {openCount} câu hỏi chờ trả lời
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {actionable && !isProcessing && (
                <button
                  onClick={() => run(async () => {
                    await api(`/api/estimate/items/${item.id}/request-analysis`, { method: "POST" });
                    toast.success("Đã gửi AI xử lý (câu trả lời + yêu cầu sửa)");
                  })}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#f97316]/15 px-2.5 py-1 text-[11px] font-bold text-[#fb923c] hover:bg-[#f97316]/25"
                >
                  <Sparkles className="h-3 w-3" /> Gửi AI xử lý{fixCount > 0 ? ` (sửa ${fixCount})` : ""}
                </button>
              )}
              {item.lines.length > 0 && !allApproved && (
                <button
                  onClick={() => run(() => api(`/api/estimate/items/${item.id}/approve-lines`, { method: "POST" }))}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-400 hover:bg-emerald-500/25"
                >
                  <CheckCheck className="h-3 w-3" /> Duyệt cả hạng mục
                </button>
              )}
              {allApproved && (
                <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                  <CheckCheck className="h-3.5 w-3.5" /> Đã duyệt hết
                </span>
              )}
            </div>
          </div>
        </td>
      </tr>
      {item.lines.map((l) => (
        <LineRow key={l.id} line={l} run={run} />
      ))}
    </>
  );
}

function LineRow({ line, run }: { line: Line; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const meta = LINE_STATUS[line.status];
  const [fixOpen, setFixOpen] = useState(false);
  const [fixDraft, setFixDraft] = useState(line.fixRequest ?? "");
  const patch = (field: string) => (value: string) =>
    run(() => api(`/api/estimate/lines/${line.id}`, { method: "PATCH", body: JSON.stringify({ [field]: value }) }));

  const saveFix = async (value: string) => {
    await run(() => api(`/api/estimate/lines/${line.id}`, { method: "PATCH", body: JSON.stringify({ fixRequest: value }) }));
    setFixOpen(false);
  };

  return (
    <>
      <tr className="group border-b border-[#1c1f30] align-top transition-colors hover:bg-[#171a28]">
        <td className="px-3 py-2">
          <EditableText
            value={line.normCode ?? ""}
            placeholder="—"
            className="font-mono text-[11px] text-zinc-400"
            onSave={patch("normCode")}
          />
          {line.normName && <p className="mt-0.5 line-clamp-2 pl-0 text-[10px] leading-tight text-zinc-600">{line.normName}</p>}
        </td>
        <td className="px-3 py-2">
          <EditableText value={line.name} className="text-zinc-200" onSave={patch("name")} />
        </td>
        <td className="px-3 py-2">
          <EditableText value={line.formula ?? ""} multiline placeholder="Diễn giải công thức…" className="font-mono text-[11px]" onSave={patch("formula")} />
          {line.note && <p className="mt-0.5 text-[10px] text-amber-500/80">{line.note}</p>}
        </td>
        <td className="px-3 py-2 text-right">
          <EditableText value={fmtQty(line.quantity)} className="text-right font-semibold tabular-nums text-zinc-100" onSave={(v) => patch("quantity")(v.replace(/\./g, "").replace(",", "."))} />
        </td>
        <td className="px-3 py-2 text-zinc-400">{line.unit}</td>
        <td className="px-3 py-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.cls}`}>{meta.label}</span>
        </td>
        <td className="px-3 py-2 text-right">
          <span className="inline-flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {line.status !== "approved" ? (
              <button
                title="Duyệt công tác này"
                onClick={() => run(() => api(`/api/estimate/lines/${line.id}`, { method: "PATCH", body: JSON.stringify({ action: "approve" }) }))}
                className="grid h-6 w-6 place-items-center rounded-md text-zinc-500 hover:bg-emerald-500/15 hover:text-emerald-400"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                title="Bỏ duyệt"
                onClick={() => run(() => api(`/api/estimate/lines/${line.id}`, { method: "PATCH", body: JSON.stringify({ action: "unapprove" }) }))}
                className="grid h-6 w-6 place-items-center rounded-md text-emerald-400 hover:bg-zinc-800"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            )}
            {line.status !== "approved" && (
              <button
                title="Yêu cầu AI sửa công tác này"
                onClick={() => setFixOpen((v) => !v)}
                className={`grid h-6 w-6 place-items-center rounded-md hover:bg-[#f97316]/15 hover:text-[#fb923c] ${line.fixRequest ? "text-[#fb923c]" : "text-zinc-500"}`}
              >
                <Wrench className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              title="Xoá công tác"
              onClick={async () => {
                const ok = await confirmDialog({ message: `Xoá công tác "${line.name}"?` });
                if (ok) await run(() => api(`/api/estimate/lines/${line.id}`, { method: "DELETE" }));
              }}
              className="grid h-6 w-6 place-items-center rounded-md text-zinc-500 hover:bg-rose-500/15 hover:text-rose-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </span>
        </td>
      </tr>
      {line.aiQuestion && (
        <tr className="border-b border-[#1c1f30] bg-[#191322]/60">
          <td colSpan={7} className="px-3 py-1.5 pl-6">
            <AnswerBox
              question={line.aiQuestion}
              answer={line.aiAnswer}
              onSave={(a) => run(() => api(`/api/estimate/lines/${line.id}`, { method: "PATCH", body: JSON.stringify({ aiAnswer: a }) }))}
            />
          </td>
        </tr>
      )}
      {fixOpen ? (
        <tr className="border-b border-[#1c1f30] bg-[#1c150a]/60">
          <td colSpan={7} className="px-3 py-2 pl-6">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start">
              <span className="flex shrink-0 items-center gap-1 pt-1.5 text-[11px] font-semibold text-[#fb923c]">
                <Wrench className="h-3.5 w-3.5" /> Yêu cầu sửa:
              </span>
              <textarea
                autoFocus
                value={fixDraft}
                onChange={(e) => setFixDraft(e.target.value)}
                placeholder="VD: khối lượng thiếu phần giằng móng, tính thêm; hoặc mã ĐM sai đổi sang BT.1120…"
                rows={2}
                className="w-full flex-1 rounded-md border border-[#f97316]/40 bg-[#0d0f17] px-2 py-1 text-xs text-zinc-200 outline-none focus:border-[#f97316]/70"
              />
              <div className="flex shrink-0 gap-1.5">
                <button
                  onClick={() => void saveFix(fixDraft.trim())}
                  disabled={!fixDraft.trim()}
                  className="rounded-md bg-[#f97316] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#ea580c] disabled:opacity-50"
                >
                  Lưu
                </button>
                <button
                  onClick={() => { setFixDraft(line.fixRequest ?? ""); setFixOpen(false); }}
                  className="rounded-md border border-zinc-700 p-1.5 text-zinc-400 hover:bg-zinc-800"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </td>
        </tr>
      ) : (
        line.fixRequest && (
          <tr className="border-b border-[#1c1f30] bg-[#1c150a]/60">
            <td colSpan={7} className="px-3 py-1.5 pl-6">
              <div className="flex items-start gap-1.5 text-[11px] text-[#fb923c]">
                <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="flex-1">{line.fixRequest}</span>
                <button onClick={() => setFixOpen(true)} className="shrink-0 text-zinc-500 hover:text-[#fb923c]">sửa</button>
                <button onClick={() => void saveFix("")} className="shrink-0 text-zinc-500 hover:text-rose-400">bỏ</button>
              </div>
            </td>
          </tr>
        )
      )}
    </>
  );
}

// Câu hỏi của AI + ô trả lời (dùng cho câu hỏi chung của hạng mục và câu hỏi theo công tác)
function AnswerBox({ question, answer, onSave }: { question: string; answer: string | null; onSave: (a: string) => Promise<void> | void }) {
  const [draft, setDraft] = useState(answer ?? "");
  const [editing, setEditing] = useState(!answer);

  if (answer && !editing) {
    return (
      <div className="flex items-start gap-1.5 text-[11px]">
        <MessageCircleQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
        <span className="text-zinc-400">{question}</span>
        <span className="flex-1 font-semibold text-emerald-400">→ {answer}</span>
        <button onClick={() => { setDraft(answer); setEditing(true); }} className="shrink-0 text-zinc-500 hover:text-emerald-400">sửa</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
      <span className="flex shrink-0 items-center gap-1 pt-1.5 text-[11px] font-semibold text-rose-400">
        <MessageCircleQuestion className="h-3.5 w-3.5" /> {question}
      </span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { void onSave(draft.trim()); setEditing(false); } }}
        placeholder="Trả lời cho AI…"
        className="w-full flex-1 rounded-md border border-rose-500/40 bg-[#0d0f17] px-2 py-1 text-xs text-zinc-200 outline-none focus:border-rose-500/70"
      />
      <button
        onClick={() => { if (draft.trim()) { void onSave(draft.trim()); setEditing(false); } }}
        disabled={!draft.trim()}
        className="shrink-0 rounded-md bg-rose-500/90 px-3 py-1 text-[11px] font-bold text-white hover:bg-rose-500 disabled:opacity-50"
      >
        Gửi
      </button>
    </div>
  );
}
