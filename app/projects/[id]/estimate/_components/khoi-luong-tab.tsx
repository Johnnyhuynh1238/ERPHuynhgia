"use client";

import { Check, CheckCheck, ChevronDown, ChevronRight, Loader2, MessageCircleQuestion, Plus, RotateCcw, Search, Sparkles, Trash2, Wrench, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  const [detailId, setDetailId] = useState<string | null>(null); // popup chi tiết công tác (mobile)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()); // nhóm đang gập
  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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

  const detailLine = detailId
    ? groups.flatMap((g) => g.items).flatMap((it) => it.lines).find((l) => l.id === detailId) ?? null
    : null;

  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((it) => it.lines.length > 0 || it.status === "analyzing" || it.status === "waiting_answer") }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-3">
      <WorkerStatusBanner />

      {/* PC: bảng đầy đủ, sửa tại chỗ */}
      <div className="hidden overflow-x-auto rounded-2xl border border-[#252840] bg-[#13151f] md:block">
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
          {visibleGroups.map((g) => (
            <GroupSection key={g.id} group={g} items={g.items} run={run} collapsedSet={collapsed} toggle={toggleCollapse} />
          ))}
        </tbody>
        </table>
      </div>

      {/* Mobile: danh sách phẳng tràn mép, header nhóm dính — không card */}
      <div className="-mx-4 md:hidden">
        {visibleGroups.map((g) => (
          <div key={g.id}>
            <button
              onClick={() => toggleCollapse(g.id)}
              className="sticky top-14 z-20 flex w-full items-center gap-1.5 border-y border-[#252840] bg-[#1a1d2e] px-3 py-2 text-left text-[13px] font-bold text-[#fb923c]"
            >
              {collapsed.has(g.id) ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {g.name}
              <span className="text-[10px] font-normal text-zinc-600">{g.items.length} hạng mục</span>
            </button>
            {!collapsed.has(g.id) && g.items.map((it, ii) => (
              <div key={it.id} className={`border-b border-[#252840] ${ii % 2 === 1 ? "bg-[#1c2338]" : "bg-[#12141d]"}`}>
                {it.qaThread.map((qa, qi) => (
                  <div key={`q${qi}`} className="border-b border-[#1c1f30] bg-[#191322]/60 px-3 py-1.5">
                    <AnswerBox
                      question={qa.q}
                      answer={qa.a ?? null}
                      onSave={(a) => run(() => api(`/api/estimate/items/${it.id}/answer`, { method: "POST", body: JSON.stringify({ index: qi, answer: a }) }))}
                    />
                  </div>
                ))}
                <div className="border-b border-[#252840] bg-black/25 px-3 py-2">
                  <ItemActions item={it} run={run} collapsed={collapsed.has(it.id)} onToggle={() => toggleCollapse(it.id)} />
                </div>
                {!collapsed.has(it.id) && it.lines.map((l) => {
                  const meta = LINE_STATUS[l.status];
                  const needAnswer = !!l.aiQuestion && !l.aiAnswer;
                  return (
                    <button
                      key={l.id}
                      onClick={() => setDetailId(l.id)}
                      className="flex w-full items-center gap-2 border-t border-[#1c1f30] px-3 py-2.5 pl-5 text-left active:bg-[#171a28]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-zinc-200">{l.name}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-zinc-500">
                          {l.normCode || "—"} · {fmtQty(l.quantity)} {l.unit}
                          {l.fixRequest && l.status !== "approved" ? " · có YC sửa" : ""}
                        </span>
                      </span>
                      {needAnswer && <MessageCircleQuestion className="h-4 w-4 shrink-0 text-rose-400" />}
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.cls}`}>{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>

      {detailLine && (
        <LineDetailModal line={detailLine} run={run} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}

function GroupSection({ group, items, run, collapsedSet, toggle }: { group: Group; items: Item[]; run: (fn: () => Promise<unknown>) => Promise<void>; collapsedSet: Set<string>; toggle: (id: string) => void }) {
  const collapsed = collapsedSet.has(group.id);
  return (
    <>
      <tr className="border-y border-[#252840] bg-[#1a1d2e]">
        <td colSpan={7} className="px-3 py-2">
          <button onClick={() => toggle(group.id)} className="flex items-center gap-1.5 text-[13px] font-bold text-[#fb923c]">
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {group.name}
            <span className="text-[10px] font-normal text-zinc-600">{items.length} hạng mục</span>
          </button>
        </td>
      </tr>
      {!collapsed && items.map((it) => (
        <ItemSection key={it.id} item={it} run={run} collapsed={collapsedSet.has(it.id)} onToggle={() => toggle(it.id)} />
      ))}
    </>
  );
}

function ItemSection({ item, run, collapsed, onToggle }: { item: Item; run: (fn: () => Promise<unknown>) => Promise<void>; collapsed: boolean; onToggle: () => void }) {
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
          <ItemActions item={item} run={run} collapsed={collapsed} onToggle={onToggle} />
        </td>
      </tr>
      {!collapsed && item.lines.map((l) => (
        <LineRow key={l.id} line={l} run={run} />
      ))}
    </>
  );
}

// Tên hạng mục + badge + nút hành động (Gửi AI xử lý / Duyệt / Bỏ duyệt). Dùng chung PC + mobile.
function ItemActions({ item, run, collapsed, onToggle }: { item: Item; run: (fn: () => Promise<unknown>) => Promise<void>; collapsed?: boolean; onToggle?: () => void }) {
  const allApproved = item.lines.length > 0 && item.lines.every((l) => l.status === "approved");
  const someApproved = item.lines.some((l) => l.status === "approved");
  const isProcessing = item.status === "requested" || item.status === "analyzing";
  // Công tác chưa duyệt + có yêu cầu sửa = phần AI sẽ sửa lại
  const fixCount = item.lines.filter((l) => l.fixRequest && l.status !== "approved").length;
  // Câu hỏi còn treo (chung + theo công tác), và có gì đã trả lời / cần gửi lại AI
  const openCount = item.qaThread.filter((q) => !q.a).length + item.lines.filter((l) => l.aiQuestion && !l.aiAnswer).length;
  const answeredReady = item.qaThread.some((q) => q.a) || item.lines.some((l) => l.aiAnswer);
  const actionable = fixCount > 0 || answeredReady;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {onToggle && (
        <button onClick={onToggle} title={collapsed ? "Xổ hạng mục" : "Gập hạng mục"} className="shrink-0 text-zinc-400 hover:text-[#fb923c]">
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      )}
      <span className="text-xs font-semibold text-zinc-200">{item.name}</span>
      {item.lines.length > 0 && <span className="text-[10px] text-zinc-500">{item.lines.length} công tác</span>}
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
        {someApproved && (
          <button
            onClick={() => run(() => api(`/api/estimate/items/${item.id}/approve-lines`, { method: "DELETE" }))}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-bold text-zinc-400 hover:bg-zinc-800 hover:text-rose-400"
          >
            <RotateCcw className="h-3 w-3" /> Bỏ duyệt hạng mục
          </button>
        )}
      </div>
    </div>
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
          <NormModeControl line={line} run={run} />
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-0.5 text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      {children}
    </div>
  );
}

// Popup chi tiết 1 công tác (mobile) — căn giữa màn hình, cuộn trong popup, sửa tại chỗ + hành động
function LineDetailModal({ line, run, onClose }: { line: Line; run: (fn: () => Promise<unknown>) => Promise<void>; onClose: () => void }) {
  const meta = LINE_STATUS[line.status];
  const [fixDraft, setFixDraft] = useState(line.fixRequest ?? "");
  const patch = (field: string) => (value: string) =>
    run(() => api(`/api/estimate/lines/${line.id}`, { method: "PATCH", body: JSON.stringify({ [field]: value }) }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#252840] bg-[#13151f] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#252840] bg-[#13151f] px-4 py-3">
          <span className="text-sm font-bold text-zinc-100">Chi tiết công tác</span>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.cls}`}>{meta.label}</span>
            <button onClick={onClose} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <Field label="Công tác">
            <EditableText value={line.name} className="text-sm text-zinc-200" onSave={patch("name")} />
          </Field>
          <Field label="Kiểu công tác">
            <NormModeControl line={line} run={run} />
          </Field>
          <Field label="Khối lượng">
            <div className="flex items-center gap-1">
              <EditableText
                value={fmtQty(line.quantity)}
                className="font-semibold tabular-nums text-zinc-100"
                onSave={(v) => patch("quantity")(v.replace(/\./g, "").replace(",", "."))}
              />
              <span className="text-xs text-zinc-500">{line.unit}</span>
            </div>
          </Field>
          <Field label="Diễn giải">
            <EditableText value={line.formula ?? ""} multiline placeholder="Diễn giải công thức…" className="font-mono text-xs" onSave={patch("formula")} />
            {line.note && <p className="mt-0.5 text-[10px] text-amber-500/80">{line.note}</p>}
          </Field>

          {line.aiQuestion && (
            <Field label="Câu hỏi AI">
              <AnswerBox
                question={line.aiQuestion}
                answer={line.aiAnswer}
                onSave={(a) => run(() => api(`/api/estimate/lines/${line.id}`, { method: "PATCH", body: JSON.stringify({ aiAnswer: a }) }))}
              />
            </Field>
          )}

          {line.status !== "approved" && (
            <div>
              <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-[#fb923c]">
                <Wrench className="h-3 w-3" /> Yêu cầu AI sửa
              </p>
              <textarea
                value={fixDraft}
                onChange={(e) => setFixDraft(e.target.value)}
                placeholder="VD: khối lượng thiếu phần giằng móng, tính thêm; hoặc mã ĐM sai đổi sang BT.1120…"
                rows={2}
                className="w-full rounded-md border border-[#f97316]/40 bg-[#0d0f17] px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-[#f97316]/70"
              />
              <div className="mt-1.5 flex gap-1.5">
                <button
                  onClick={() => void run(() => api(`/api/estimate/lines/${line.id}`, { method: "PATCH", body: JSON.stringify({ fixRequest: fixDraft.trim() }) }))}
                  disabled={fixDraft.trim() === (line.fixRequest ?? "")}
                  className="rounded-md bg-[#f97316] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#ea580c] disabled:opacity-50"
                >
                  Lưu YC sửa
                </button>
                {line.fixRequest && (
                  <button
                    onClick={() => { setFixDraft(""); void run(() => api(`/api/estimate/lines/${line.id}`, { method: "PATCH", body: JSON.stringify({ fixRequest: "" }) })); }}
                    className="rounded-md border border-zinc-700 px-3 py-1 text-[11px] font-semibold text-zinc-400 hover:bg-zinc-800"
                  >
                    Bỏ YC
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex items-center gap-2 border-t border-[#252840] bg-[#13151f] px-4 py-3">
          {line.status !== "approved" ? (
            <button
              onClick={() => run(() => api(`/api/estimate/lines/${line.id}`, { method: "PATCH", body: JSON.stringify({ action: "approve" }) }))}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-400 hover:bg-emerald-500/25"
            >
              <Check className="h-4 w-4" /> Duyệt công tác
            </button>
          ) : (
            <button
              onClick={() => run(() => api(`/api/estimate/lines/${line.id}`, { method: "PATCH", body: JSON.stringify({ action: "unapprove" }) }))}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-400 hover:bg-zinc-800"
            >
              <RotateCcw className="h-4 w-4" /> Bỏ duyệt
            </button>
          )}
          <button
            onClick={async () => {
              const ok = await confirmDialog({ message: `Xoá công tác "${line.name}"?` });
              if (ok) { await run(() => api(`/api/estimate/lines/${line.id}`, { method: "DELETE" })); onClose(); }
            }}
            className="flex items-center justify-center gap-1 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-400 hover:bg-rose-500/15 hover:text-rose-400"
          >
            <Trash2 className="h-4 w-4" /> Xoá
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Câu hỏi của AI + ô trả lời. Câu hỏi thường dài → bấm mở modal giữa màn, ô trả lời to.
function AnswerBox({ question, answer, onSave }: { question: string; answer: string | null; onSave: (a: string) => Promise<void> | void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Hàng tóm tắt trong bảng */}
      {answer ? (
        <div className="flex items-start gap-1.5 text-[11px]">
          <MessageCircleQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
          <span className="min-w-0 flex-1 text-zinc-400">
            {question} <span className="font-semibold text-emerald-400">→ {answer}</span>
          </span>
          <button onClick={() => setOpen(true)} className="shrink-0 text-zinc-500 hover:text-emerald-400">sửa</button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-start gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/5 px-2 py-1.5 text-left text-[11px] text-rose-300 hover:bg-rose-500/10"
        >
          <MessageCircleQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
          <span className="min-w-0 flex-1 line-clamp-2">{question}</span>
          <span className="shrink-0 rounded bg-rose-500/90 px-2 py-0.5 text-[10px] font-bold text-white">Trả lời</span>
        </button>
      )}
      {open && (
        <AnswerModal
          question={question}
          answer={answer}
          onClose={() => setOpen(false)}
          onSave={async (a) => { await onSave(a); setOpen(false); }}
        />
      )}
    </>
  );
}

// Modal giữa màn — câu hỏi đầy đủ + ô trả lời to
function AnswerModal({ question, answer, onClose, onSave }: { question: string; answer: string | null; onClose: () => void; onSave: (a: string) => Promise<void> | void }) {
  const [draft, setDraft] = useState(answer ?? "");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = () => { if (draft.trim()) void onSave(draft.trim()); };

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl border border-[#252840] bg-[#13151f] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#252840] px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageCircleQuestion className="h-4 w-4 text-rose-400" />
            <span className="text-sm font-bold text-zinc-100">Trả lời AI</span>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">
          <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm leading-relaxed text-rose-200">
            {question}
          </div>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(); }}
            rows={7}
            placeholder="Nhập câu trả lời cho AI…"
            className="w-full resize-y rounded-lg border border-[#252840] bg-[#0d0f17] px-3 py-2 text-sm leading-relaxed text-zinc-100 outline-none focus:border-rose-500/60"
          />
          <p className="mt-1 text-[10px] text-zinc-600">Ctrl+Enter để gửi nhanh</p>
        </div>
        <div className="flex items-center justify-end gap-1.5 border-t border-[#252840] px-4 py-3">
          <button onClick={onClose} className="rounded-md border border-zinc-700 px-3 py-1.5 text-[11px] font-semibold text-zinc-400 hover:bg-zinc-800">Huỷ</button>
          <button
            onClick={submit}
            disabled={!draft.trim()}
            className="rounded-md bg-rose-500/90 px-4 py-1.5 text-[11px] font-bold text-white hover:bg-rose-500 disabled:opacity-50"
          >
            Gửi
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Toggle Định mức ↔ Trọn gói + chọn/tạo định mức ──────────────────────────
const NORM_CATEGORIES = ["be_tong", "cot_thep", "cop_pha", "xay", "to_trat", "op_lat", "son", "tran", "chong_tham", "cua", "mep", "khac"] as const;
const NORM_CAT_LABELS: Record<string, string> = {
  be_tong: "Bê tông", cot_thep: "Cốt thép", cop_pha: "Cốp pha", xay: "Xây", to_trat: "Tô trát",
  op_lat: "Ốp lát", son: "Sơn", tran: "Trần", chong_tham: "Chống thấm", cua: "Cửa", mep: "M&E", khac: "Khác",
};
const inputCls = "min-w-0 rounded-md border border-[#2b2f45] bg-[#0d0f17] px-2 py-1 text-xs text-zinc-100 outline-none focus:border-[#f97316]/60";

function NormModeControl({ line, run }: { line: Line; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [assignOpen, setAssignOpen] = useState(false);
  const isLump = !line.normCode;
  const toLump = () => run(() => api(`/api/estimate/lines/${line.id}`, { method: "PATCH", body: JSON.stringify({ normCode: "" }) }));

  return (
    <div>
      <div className="mb-1 inline-flex overflow-hidden rounded-md border border-[#2b2f45] text-[10px] font-bold">
        <button
          onClick={() => { if (isLump) setAssignOpen(true); }}
          className={`px-2 py-0.5 ${!isLump ? "bg-sky-500/20 text-sky-300" : "text-zinc-500 hover:text-zinc-300"}`}
        >
          Định mức
        </button>
        <button
          onClick={() => { if (!isLump) void toLump(); }}
          className={`border-l border-[#2b2f45] px-2 py-0.5 ${isLump ? "bg-[#f97316]/20 text-[#fb923c]" : "text-zinc-500 hover:text-zinc-300"}`}
        >
          Trọn gói
        </button>
      </div>
      {isLump ? (
        <p className="text-[10px] leading-tight text-amber-500/80">Nhập đơn giá ở tab Hao phí</p>
      ) : (
        <>
          <button
            onClick={() => setAssignOpen(true)}
            title="Đổi / chọn định mức"
            className="block font-mono text-[11px] text-zinc-300 hover:text-[#fb923c]"
          >
            {line.normCode}
          </button>
          {line.normName && <p className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-zinc-600">{line.normName}</p>}
        </>
      )}
      {assignOpen && <NormAssignModal line={line} run={run} onClose={() => setAssignOpen(false)} />}
    </div>
  );
}

type MatRow = { name: string; unit: string; qty: string };
type LabRow = { grade: string; qty: string };
type MacRow = { name: string; qty: string };
type NormHit = { code: string; name: string; unit: string; category: string | null };

function NormAssignModal({ line, run, onClose }: { line: Line; run: (fn: () => Promise<unknown>) => Promise<void>; onClose: () => void }) {
  const [tab, setTab] = useState<"pick" | "create">("pick");

  // pick
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<NormHit[]>([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (tab !== "pick") return;
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await api(`/api/norms?q=${encodeURIComponent(q.trim())}`);
        if (!cancelled) setHits((r.norms as NormHit[]).slice(0, 40));
      } catch { /* ignore */ }
      if (!cancelled) setSearching(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, tab]);

  const assign = (code: string) =>
    run(async () => {
      await api(`/api/estimate/lines/${line.id}`, { method: "PATCH", body: JSON.stringify({ normCode: code }) });
      toast.success(`Đã gán mã ${code}`);
      onClose();
    });

  // create
  const [code, setCode] = useState("");
  const [name, setName] = useState(line.name);
  const [unit, setUnit] = useState(line.unit);
  const [category, setCategory] = useState<string>("khac");
  const [mats, setMats] = useState<MatRow[]>([{ name: "", unit: "", qty: "" }]);
  const [labs, setLabs] = useState<LabRow[]>([{ grade: "", qty: "" }]);
  const [macs, setMacs] = useState<MacRow[]>([]);
  const [saving, setSaving] = useState(false);

  const num = (s: string) => Number(s.replace(",", ".").trim());

  const saveCreate = async () => {
    const c = code.trim().toUpperCase();
    if (!/^[A-Z]{2,4}\.[A-Z0-9]{2,8}$/.test(c)) { toast.error("Mã ĐM sai định dạng (VD: MT.1110)"); return; }
    if (!name.trim() || !unit.trim()) { toast.error("Thiếu tên hoặc đơn vị"); return; }
    const materialItems = mats.filter((m) => m.name.trim() && m.unit.trim() && num(m.qty) > 0).map((m) => ({ name: m.name.trim(), unit: m.unit.trim(), qtyPerUnit: num(m.qty) }));
    const laborItems = labs.filter((l) => l.grade.trim() && num(l.qty) > 0).map((l) => ({ grade: l.grade.trim(), qtyPerUnit: num(l.qty) }));
    const machineItems = macs.filter((m) => m.name.trim() && num(m.qty) > 0).map((m) => ({ name: m.name.trim(), qtyPerUnit: num(m.qty) }));
    if (materialItems.length + laborItems.length + machineItems.length === 0) {
      toast.error("Nhập ít nhất 1 dòng hao phí (VT / NC / MM)");
      return;
    }
    setSaving(true);
    try {
      await api(`/api/norms`, {
        method: "POST",
        body: JSON.stringify({ code: c, name: name.trim(), unit: unit.trim(), category, materialItems, laborItems, machineItems }),
      });
    } catch (e) {
      setSaving(false);
      toast.error((e as Error).message);
      return;
    }
    setSaving(false);
    await run(async () => {
      await api(`/api/estimate/lines/${line.id}`, { method: "PATCH", body: JSON.stringify({ normCode: c }) });
      toast.success(`Đã tạo & gán định mức ${c}`);
      onClose();
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const tabCls = (active: boolean) =>
    `flex-1 px-3 py-2 text-xs font-bold ${active ? "border-b-2 border-[#f97316] text-[#fb923c]" : "text-zinc-500 hover:text-zinc-300"}`;

  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#252840] bg-[#13151f] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#252840] px-4 py-3">
          <span className="text-sm font-bold text-zinc-100">Định mức cho: <span className="text-zinc-400">{line.name}</span></span>
          <button onClick={onClose} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex border-b border-[#252840]">
          <button onClick={() => setTab("pick")} className={tabCls(tab === "pick")}>Chọn có sẵn</button>
          <button onClick={() => setTab("create")} className={tabCls(tab === "create")}>＋ Tạo mới</button>
        </div>

        {tab === "pick" ? (
          <div className="flex min-h-0 flex-col p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm mã / tên định mức…"
                className="w-full rounded-lg border border-[#2b2f45] bg-[#0d0f17] py-2 pl-8 pr-2 text-xs text-zinc-100 outline-none focus:border-[#f97316]/60"
              />
            </div>
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
              {searching && hits.length === 0 ? (
                <div className="grid place-items-center py-8"><Loader2 className="h-4 w-4 animate-spin text-zinc-600" /></div>
              ) : hits.length === 0 ? (
                <p className="py-8 text-center text-xs text-zinc-600">Không có định mức khớp. Qua tab <b className="text-[#fb923c]">＋ Tạo mới</b>.</p>
              ) : (
                <ul className="divide-y divide-[#1c1f30]">
                  {hits.map((h) => (
                    <li key={h.code}>
                      <button onClick={() => void assign(h.code)} className="flex w-full items-start gap-2 px-1 py-2 text-left hover:bg-[#171a28]">
                        <span className="shrink-0 font-mono text-[11px] text-[#fb923c]">{h.code}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs text-zinc-200">{h.name}</span>
                          <span className="text-[10px] text-zinc-500">{h.unit}{h.category ? ` · ${NORM_CAT_LABELS[h.category] ?? h.category}` : ""}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <p className="mb-0.5 text-[10px] uppercase tracking-wide text-zinc-500">Mã định mức *</p>
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="VD: MT.1110" className={`w-full font-mono ${inputCls}`} />
              </div>
              <div className="col-span-2">
                <p className="mb-0.5 text-[10px] uppercase tracking-wide text-zinc-500">Tên công tác *</p>
                <input value={name} onChange={(e) => setName(e.target.value)} className={`w-full ${inputCls}`} />
              </div>
              <div>
                <p className="mb-0.5 text-[10px] uppercase tracking-wide text-zinc-500">Đơn vị *</p>
                <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="m², md, kg…" className={`w-full ${inputCls}`} />
              </div>
              <div>
                <p className="mb-0.5 text-[10px] uppercase tracking-wide text-zinc-500">Nhóm</p>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className={`w-full ${inputCls}`}>
                  {NORM_CATEGORIES.map((c) => <option key={c} value={c}>{NORM_CAT_LABELS[c]}</option>)}
                </select>
              </div>
            </div>

            <NormItemSection
              title="Vật tư (VT)" accent="text-emerald-400"
              rows={mats}
              onAdd={() => setMats((r) => [...r, { name: "", unit: "", qty: "" }])}
              onRemove={(i) => setMats((r) => r.filter((_, k) => k !== i))}
              render={(m, i) => (
                <>
                  <input value={m.name} onChange={(e) => setMats((r) => r.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} placeholder="Tên vật tư" className={`flex-1 ${inputCls}`} />
                  <input value={m.unit} onChange={(e) => setMats((r) => r.map((x, k) => (k === i ? { ...x, unit: e.target.value } : x)))} placeholder="ĐV" className={`w-12 ${inputCls}`} />
                  <input value={m.qty} inputMode="decimal" onChange={(e) => setMats((r) => r.map((x, k) => (k === i ? { ...x, qty: e.target.value } : x)))} placeholder="ĐM/đv" className={`w-16 text-right ${inputCls}`} />
                </>
              )}
            />
            <NormItemSection
              title="Nhân công (NC)" accent="text-sky-400"
              rows={labs}
              onAdd={() => setLabs((r) => [...r, { grade: "", qty: "" }])}
              onRemove={(i) => setLabs((r) => r.filter((_, k) => k !== i))}
              render={(l, i) => (
                <>
                  <input value={l.grade} onChange={(e) => setLabs((r) => r.map((x, k) => (k === i ? { ...x, grade: e.target.value } : x)))} placeholder="Bậc thợ (VD: Thợ chính)" className={`flex-1 ${inputCls}`} />
                  <input value={l.qty} inputMode="decimal" onChange={(e) => setLabs((r) => r.map((x, k) => (k === i ? { ...x, qty: e.target.value } : x)))} placeholder="công/đv" className={`w-16 text-right ${inputCls}`} />
                </>
              )}
            />
            <NormItemSection
              title="Máy thi công (MM)" accent="text-amber-400"
              rows={macs}
              onAdd={() => setMacs((r) => [...r, { name: "", qty: "" }])}
              onRemove={(i) => setMacs((r) => r.filter((_, k) => k !== i))}
              render={(m, i) => (
                <>
                  <input value={m.name} onChange={(e) => setMacs((r) => r.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} placeholder="Loại máy" className={`flex-1 ${inputCls}`} />
                  <input value={m.qty} inputMode="decimal" onChange={(e) => setMacs((r) => r.map((x, k) => (k === i ? { ...x, qty: e.target.value } : x)))} placeholder="ca/đv" className={`w-16 text-right ${inputCls}`} />
                </>
              )}
            />
            <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">ĐM/đv = hao phí cho 1 {unit || "đơn vị"} công tác. Giá VT/NC/MM lấy từ tab Đơn giá theo tên + đơn vị (khớp thì bóc ra tiền).</p>
          </div>
        )}

        {tab === "create" && (
          <div className="flex items-center justify-end gap-1.5 border-t border-[#252840] px-4 py-3">
            <button onClick={onClose} className="rounded-md border border-zinc-700 px-3 py-1.5 text-[11px] font-semibold text-zinc-400 hover:bg-zinc-800">Huỷ</button>
            <button
              onClick={() => void saveCreate()}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-md bg-[#f97316] px-4 py-1.5 text-[11px] font-bold text-white hover:bg-[#ea580c] disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />} Tạo & gán
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function NormItemSection<T>({ title, accent, rows, onAdd, onRemove, render }: {
  title: string; accent: string; rows: T[];
  onAdd: () => void; onRemove: (i: number) => void; render: (row: T, i: number) => ReactNode;
}) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between">
        <p className={`text-[10px] font-bold uppercase tracking-wide ${accent}`}>{title}</p>
        <button onClick={onAdd} className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-zinc-400 hover:text-[#fb923c]">
          <Plus className="h-3 w-3" /> Thêm
        </button>
      </div>
      <div className="space-y-1">
        {rows.length === 0 && <p className="text-[10px] text-zinc-600">—</p>}
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-1.5">
            {render(row, i)}
            <button onClick={() => onRemove(i)} className="shrink-0 rounded p-1 text-zinc-600 hover:bg-rose-500/15 hover:text-rose-400">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
