"use client";

import { Check, CheckCheck, Loader2, MessageCircleQuestion, Trash2 } from "lucide-react";
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
  const openQuestions = item.qaThread.filter((qa) => !qa.a);
  const allApproved = item.lines.length > 0 && item.lines.every((l) => l.status === "approved");

  return (
    <>
      <tr className="border-b border-[#1c1f30] bg-[#161927]">
        <td colSpan={7} className="px-3 py-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pl-2 text-xs font-semibold text-zinc-200">{item.name}</span>
            {item.status === "analyzing" && (
              <span className="flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-400">
                <Loader2 className="h-2.5 w-2.5 animate-spin" /> AI đang bóc…
              </span>
            )}
            {openQuestions.length > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                <MessageCircleQuestion className="h-3 w-3" /> {openQuestions.length} câu hỏi — trả lời ở tab Mô tả
              </span>
            )}
            {item.lines.length > 0 && !allApproved && (
              <button
                onClick={() => run(() => api(`/api/estimate/items/${item.id}/approve-lines`, { method: "POST" }))}
                className="ml-auto inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-400 hover:bg-emerald-500/25"
              >
                <CheckCheck className="h-3 w-3" /> Duyệt cả hạng mục
              </button>
            )}
            {allApproved && (
              <span className="ml-auto flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                <CheckCheck className="h-3.5 w-3.5" /> Đã duyệt hết
              </span>
            )}
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
  const patch = (field: string) => (value: string) =>
    run(() => api(`/api/estimate/lines/${line.id}`, { method: "PATCH", body: JSON.stringify({ [field]: value }) }));

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
            <span className="flex items-center gap-1.5 text-[11px] text-rose-400">
              <MessageCircleQuestion className="h-3.5 w-3.5 shrink-0" /> {line.aiQuestion}
            </span>
          </td>
        </tr>
      )}
    </>
  );
}
