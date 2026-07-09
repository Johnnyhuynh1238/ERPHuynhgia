"use client";

import {
  ArrowDown,
  ArrowUp,
  BookMarked,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { EditableText } from "./editable-text";
import { WorkerStatusBanner } from "./worker-status-banner";

type ItemStatus = "draft" | "requested" | "analyzing" | "waiting_answer" | "ai_done" | "approved";

type Field = { label: string; value: string };

type Item = {
  id: string;
  name: string;
  method: string | null;
  fields: Field[];
  status: ItemStatus;
  lineCount: number;
};

type Group = { id: string; name: string; sortOrder: number; items: Item[] };

const STATUS_META: Record<ItemStatus, { label: string; cls: string }> = {
  draft: { label: "Nháp", cls: "bg-zinc-700/50 text-zinc-300" },
  requested: { label: "Chờ AI", cls: "bg-amber-500/15 text-amber-400" },
  analyzing: { label: "AI đang bóc…", cls: "bg-sky-500/15 text-sky-400 animate-pulse" },
  waiting_answer: { label: "AI hỏi", cls: "bg-rose-500/15 text-rose-400" },
  ai_done: { label: "AI xong", cls: "bg-emerald-500/15 text-emerald-400" },
  approved: { label: "Đã duyệt", cls: "bg-emerald-500/25 text-emerald-300" },
};

async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, {
    headers: init?.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...init,
  });
  if (!r.ok) {
    const data = await r.json().catch(() => null);
    throw new Error(data?.message || `Lỗi ${r.status}`);
  }
  return r.json();
}

export function MoTaTab({ projectId }: { projectId: string }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // id đang gọi API
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
      const data = await api(`/api/projects/${projectId}/estimate`);
      setGroups(data.groups);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Có hạng mục đang chờ/đang bóc → poll nhẹ để badge tự cập nhật khi AI làm xong
  const hasPending = groups?.some((g) => g.items.some((it) => it.status === "requested" || it.status === "analyzing"));
  useEffect(() => {
    if (!hasPending) return;
    const t = setInterval(() => void reload(), 10000);
    return () => clearInterval(t);
  }, [hasPending, reload]);

  const run = async (id: string, fn: () => Promise<unknown>, silent = false) => {
    setBusy(id);
    try {
      await fn();
      await reload();
    } catch (e) {
      if (!silent) toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (groups === null) {
    return (
      <div className="grid place-items-center rounded-2xl border border-[#252840] bg-[#13151f] p-16">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#252840] bg-[#13151f] p-10 text-center">
        <p className="text-sm font-semibold text-zinc-300">Chưa có nhóm hạng mục</p>
        <p className="mt-1 text-xs text-zinc-500">Tạo nhóm rồi thêm hạng mục thi công, nhập mô tả để AI bóc khối lượng.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => run("defaults", () => api(`/api/projects/${projectId}/estimate/groups`, { method: "POST", body: JSON.stringify({ defaults: true }) }))}
            className="rounded-lg bg-[#f97316] px-4 py-2 text-xs font-bold text-white hover:bg-[#ea580c]"
          >
            Tạo 3 nhóm mặc định (Thô · Hoàn thiện · ME)
          </button>
          <AddInline placeholder="Tên nhóm…" onAdd={(name) => run("group", () => api(`/api/projects/${projectId}/estimate/groups`, { method: "POST", body: JSON.stringify({ name }) }))} label="+ Nhóm trống" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <WorkerStatusBanner />

      {/* PC: bảng 3 cột */}
      <div className="hidden overflow-x-auto rounded-2xl border border-[#252840] bg-[#13151f] md:block">
        <table className="w-full min-w-[640px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[#252840] text-[11px] uppercase tracking-wide text-zinc-500">
              <th className="w-[26%] px-3 py-2.5 font-semibold">Hạng mục</th>
              <th className="w-[56%] px-3 py-2.5 font-semibold">Mô tả</th>
              <th className="w-[18%] px-3 py-2.5 text-right font-semibold">AI</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => (
              <GroupRows
                key={g.id}
                group={g}
                first={gi === 0}
                last={gi === groups.length - 1}
                busy={busy}
                run={run}
                collapsed={collapsed.has(g.id)}
                onToggle={() => toggleCollapse(g.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: mỗi nhóm 1 khối, mỗi hạng mục 1 card — không cuộn ngang */}
      <div className="space-y-3 md:hidden">
        {groups.map((g, gi) => (
          <div key={g.id} className="overflow-hidden border-y border-[#252840] bg-[#13151f] sm:rounded-2xl sm:border-x">
            <div className="flex items-center gap-2 border-b border-[#252840] bg-[#1a1d2e] px-3 py-2">
              <button onClick={() => toggleCollapse(g.id)} title={collapsed.has(g.id) ? "Xổ nhóm" : "Gập nhóm"} className="shrink-0 text-zinc-400 hover:text-[#fb923c]">
                {collapsed.has(g.id) ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              <EditableText
                value={g.name}
                className="text-[13px] font-bold text-[#fb923c]"
                onSave={(name) => run(g.id, () => api(`/api/estimate/groups/${g.id}`, { method: "PATCH", body: JSON.stringify({ name }) }))}
              />
              <span className="text-[10px] text-zinc-600">{g.items.length} hạng mục</span>
              <div className="ml-auto flex items-center gap-1">
                {gi > 0 && <IconBtn title="Lên" onClick={() => run(g.id, () => api(`/api/estimate/groups/${g.id}`, { method: "PATCH", body: JSON.stringify({ move: "up" }) }))}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>}
                {gi < groups.length - 1 && <IconBtn title="Xuống" onClick={() => run(g.id, () => api(`/api/estimate/groups/${g.id}`, { method: "PATCH", body: JSON.stringify({ move: "down" }) }))}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>}
                <IconBtn
                  title="Xoá nhóm"
                  danger
                  onClick={async () => {
                    const ok = await confirmDialog({ message: `Xoá nhóm "${g.name}" cùng ${g.items.length} hạng mục và toàn bộ khối lượng bên trong?` });
                    if (ok) await run(g.id, () => api(`/api/estimate/groups/${g.id}`, { method: "DELETE" }));
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </div>
            </div>
            {!collapsed.has(g.id) && g.items.map((it, ii) => (
              <ItemRow key={it.id} item={it} first={ii === 0} last={ii === g.items.length - 1} busy={busy} run={run} mode="card" />
            ))}
            {!collapsed.has(g.id) && (
              <div className="border-t border-[#1c1f30] px-3 py-2">
                <AddInline
                  placeholder="Tên hạng mục…"
                  label="+ Hạng mục"
                  subtle
                  onAdd={(name) => run(g.id, () => api(`/api/estimate/groups/${g.id}/items`, { method: "POST", body: JSON.stringify({ name }) }))}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <AddInline
        placeholder="Tên nhóm mới…"
        label="+ Thêm nhóm"
        onAdd={(name) => run("group", () => api(`/api/projects/${projectId}/estimate/groups`, { method: "POST", body: JSON.stringify({ name }) }))}
      />
    </div>
  );
}

function GroupRows({
  group,
  first,
  last,
  busy,
  run,
  collapsed,
  onToggle,
}: {
  group: Group;
  first: boolean;
  last: boolean;
  busy: string | null;
  run: (id: string, fn: () => Promise<unknown>, silent?: boolean) => Promise<void>;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-y border-[#252840] bg-[#1a1d2e]">
        <td colSpan={3} className="px-3 py-2">
          <div className="flex items-center gap-2">
            <button onClick={onToggle} title={collapsed ? "Xổ nhóm" : "Gập nhóm"} className="shrink-0 text-zinc-400 hover:text-[#fb923c]">
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            <EditableText
              value={group.name}
              className="text-[13px] font-bold text-[#fb923c]"
              onSave={(name) => run(group.id, () => api(`/api/estimate/groups/${group.id}`, { method: "PATCH", body: JSON.stringify({ name }) }))}
            />
            <span className="text-[10px] text-zinc-600">{group.items.length} hạng mục</span>
            <div className="ml-auto flex items-center gap-1">
              {!first && <IconBtn title="Lên" onClick={() => run(group.id, () => api(`/api/estimate/groups/${group.id}`, { method: "PATCH", body: JSON.stringify({ move: "up" }) }))}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>}
              {!last && <IconBtn title="Xuống" onClick={() => run(group.id, () => api(`/api/estimate/groups/${group.id}`, { method: "PATCH", body: JSON.stringify({ move: "down" }) }))}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>}
              <IconBtn
                title="Xoá nhóm"
                danger
                onClick={async () => {
                  const ok = await confirmDialog({
                    message: `Xoá nhóm "${group.name}" cùng ${group.items.length} hạng mục và toàn bộ khối lượng bên trong?`,
                  });
                  if (ok) await run(group.id, () => api(`/api/estimate/groups/${group.id}`, { method: "DELETE" }));
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconBtn>
            </div>
          </div>
        </td>
      </tr>

      {!collapsed && group.items.map((it, ii) => (
        <ItemRow key={it.id} item={it} first={ii === 0} last={ii === group.items.length - 1} busy={busy} run={run} />
      ))}

      {!collapsed && (
        <tr>
          <td colSpan={3} className="px-3 py-1.5">
            <AddInline
              placeholder="Tên hạng mục (VD: Móng, Cột + xây bao…)"
              label="+ Hạng mục"
              subtle
              onAdd={(name) =>
                run(group.id, () => api(`/api/estimate/groups/${group.id}/items`, { method: "POST", body: JSON.stringify({ name }) }))
              }
            />
          </td>
        </tr>
      )}
    </>
  );
}

function ItemRow({
  item,
  first,
  last,
  busy,
  run,
  mode = "row",
}: {
  item: Item;
  first: boolean;
  last: boolean;
  busy: string | null;
  run: (id: string, fn: () => Promise<unknown>, silent?: boolean) => Promise<void>;
  mode?: "row" | "card";
}) {
  const meta = STATUS_META[item.status];
  const isBusy = busy === item.id;
  const [showDoc, setShowDoc] = useState(false);

  // Thông tin riêng — mỗi dòng sửa qua popup; bên ngoài chỉ hiện text phẳng
  const [fields, setFields] = useState<Field[]>(item.fields ?? []);
  useEffect(() => { setFields(item.fields ?? []); }, [item.fields]);
  const [editing, setEditing] = useState<number | "new" | null>(null); // dòng đang mở popup
  const missing = fields.filter((f) => !f.value.trim()).length;

  const patchName = (value: string) =>
    run(item.id, () => api(`/api/estimate/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ name: value }) }));

  // Lưu ngay khi popup bấm Lưu — bên ngoài luôn là text đã lưu
  const persistFields = (next: Field[]) => {
    setFields(next);
    return run(item.id, () => api(`/api/estimate/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ fields: next }) }));
  };
  const saveField = (label: string, value: string) => {
    const next = editing === "new" ? [...fields, { label, value }] : fields.map((f, k) => (k === editing ? { label, value } : f));
    void persistFields(next);
    setEditing(null);
  };
  const deleteField = () => {
    if (typeof editing === "number") void persistFields(fields.filter((_, k) => k !== editing));
    setEditing(null);
  };

  // Tên + trạng thái + Mô tả chung + di chuyển/xoá. alwaysActions=true cho card (không có hover)
  const header = (alwaysActions: boolean) => (
    <>
      <EditableText value={item.name} className="font-semibold text-zinc-100" onSave={patchName} />
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.cls}`}>{meta.label}</span>
        {item.lineCount > 0 && <span className="text-[10px] text-zinc-500">{item.lineCount} công tác</span>}
        <button
          onClick={() => setShowDoc(true)}
          title="Xem / sửa mô tả chung (phần cố định)"
          className="inline-flex items-center gap-1 rounded-md bg-[#312152]/60 px-1.5 py-0.5 text-[10px] font-semibold text-[#c4b5fd] hover:bg-[#3b2a63]"
        >
          <FileText className="h-3 w-3" /> Mô tả chung
        </button>
        <span className={alwaysActions ? "flex items-center gap-0.5" : "hidden items-center gap-0.5 group-hover:flex"}>
          {!first && <IconBtn title="Lên" onClick={() => run(item.id, () => api(`/api/estimate/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ move: "up" }) }))}><ArrowUp className="h-3 w-3" /></IconBtn>}
          {!last && <IconBtn title="Xuống" onClick={() => run(item.id, () => api(`/api/estimate/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ move: "down" }) }))}><ArrowDown className="h-3 w-3" /></IconBtn>}
          <IconBtn
            title="Xoá hạng mục"
            danger
            onClick={async () => {
              const ok = await confirmDialog({ message: `Xoá hạng mục "${item.name}" và toàn bộ khối lượng đã bóc?` });
              if (ok) await run(item.id, () => api(`/api/estimate/items/${item.id}`, { method: "DELETE" }));
            }}
          >
            <Trash2 className="h-3 w-3" />
          </IconBtn>
        </span>
      </div>
    </>
  );

  const fieldsBlock = (
    <>
      {/* Thông tin riêng — hiện text phẳng, bấm dòng để mở popup sửa */}
      {fields.length > 0 && (
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Thông tin riêng</span>
          {missing > 0 ? (
            <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-400">
              còn {missing}/{fields.length} ô chưa điền
            </span>
          ) : (
            <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">đủ thông tin</span>
          )}
        </div>
      )}
      {fields.length > 0 && (
        <div className="space-y-1">
          {fields.map((f, i) => (
            <button
              key={i}
              onClick={() => setEditing(i)}
              className="block w-full rounded-md px-1.5 py-1 text-left text-sm leading-relaxed hover:bg-[#171a28]"
            >
              {f.label && <span className="font-semibold text-[#fb923c]">{f.label}: </span>}
              {f.value.trim() ? (
                <span className="whitespace-pre-wrap text-zinc-200">{f.value}</span>
              ) : (
                <span className="italic text-rose-400/80">chưa nhập</span>
              )}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setEditing("new")}
        className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
      >
        <Plus className="h-3 w-3" /> Thêm dòng mô tả
      </button>
    </>
  );

  const aiBtn = item.status === "requested" || item.status === "analyzing" ? (
    <button
      onClick={async () => {
        const ok = await confirmDialog({ message: "Reset trạng thái về Nháp? Chỉ dùng khi AI kẹt không trả kết quả." });
        if (ok) await run(item.id, () => api(`/api/estimate/items/${item.id}/request-analysis`, { method: "DELETE" }));
      }}
      className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-400 hover:bg-zinc-800"
    >
      <RotateCcw className="h-3 w-3" /> Reset
    </button>
  ) : (
    <button
      disabled={isBusy}
      onClick={() => run(item.id, async () => {
        await api(`/api/estimate/items/${item.id}/request-analysis`, { method: "POST" });
        toast.success("Đã lưu & đưa vào hàng chờ AI bóc khối lượng");
      })}
      className="inline-flex items-center gap-1 rounded-lg bg-[#f97316]/15 px-2.5 py-1.5 text-[11px] font-bold text-[#fb923c] hover:bg-[#f97316]/25 disabled:opacity-50"
    >
      {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
      AI Phân tích
    </button>
  );

  const modals = (
    <>
      {showDoc && (
        <DocModal item={item} isBusy={isBusy} run={run} onClose={() => setShowDoc(false)} labels={fields.map((f) => f.label).filter(Boolean)} />
      )}
      {editing !== null && (
        <FieldModal
          initial={editing === "new" ? { label: "", value: "" } : fields[editing]}
          isNew={editing === "new"}
          onSave={saveField}
          onDelete={deleteField}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );

  if (mode === "card") {
    return (
      <div className="border-t border-[#1c1f30] p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">{header(true)}</div>
          <div className="shrink-0">{aiBtn}</div>
        </div>
        <div className="mt-2">{fieldsBlock}</div>
        {modals}
      </div>
    );
  }

  return (
    <>
      <tr className="group border-b border-[#1c1f30] align-top transition-colors hover:bg-[#171a28]">
        <td className="px-3 py-2">{header(false)}</td>
        <td className="px-3 py-2">{fieldsBlock}</td>
        <td className="px-3 py-2 text-right">{aiBtn}</td>
      </tr>
      {modals}
    </>
  );
}

// Popup thêm/sửa 1 dòng mô tả — căn giữa màn hình hiện tại, không khuất
function FieldModal({
  initial,
  isNew,
  onSave,
  onDelete,
  onClose,
}: {
  initial: Field;
  isNew: boolean;
  onSave: (label: string, value: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(initial.label);
  const [value, setValue] = useState(initial.value);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSave = !!label.trim() || !!value.trim();
  const submit = () => { if (canSave) onSave(label.trim(), value.trim()); };

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-[#252840] bg-[#13151f] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#252840] px-4 py-3">
          <span className="text-sm font-bold text-zinc-100">{isNew ? "Thêm dòng mô tả" : "Sửa dòng mô tả"}</span>
          <button onClick={onClose} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <div>
            <p className="mb-0.5 text-[10px] uppercase tracking-wide text-zinc-500">Tiêu đề</p>
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="VD: Mác bê tông, Loại thép, Cao độ…"
              className="w-full rounded-lg border border-[#252840] bg-[#0d0f17] px-3 py-2 text-sm font-semibold text-[#fb923c] outline-none focus:border-[#f97316]/60 placeholder:font-normal placeholder:text-zinc-600"
            />
          </div>
          <div>
            <p className="mb-0.5 text-[10px] uppercase tracking-wide text-zinc-500">Nội dung</p>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(); }}
              rows={5}
              placeholder="Nhập nội dung mô tả…"
              className="w-full resize-y rounded-lg border border-[#252840] bg-[#0d0f17] px-3 py-2 text-sm leading-relaxed text-zinc-100 outline-none focus:border-[#f97316]/60"
            />
            <p className="mt-1 text-[10px] text-zinc-600">Ctrl+Enter để lưu nhanh</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 border-t border-[#252840] px-4 py-3">
          {!isNew && (
            <button
              onClick={onDelete}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-400 hover:bg-rose-500/15 hover:text-rose-400"
            >
              <Trash2 className="h-3.5 w-3.5" /> Xoá
            </button>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={onClose} className="rounded-md border border-zinc-700 px-3 py-1.5 text-[11px] font-semibold text-zinc-400 hover:bg-zinc-800">Huỷ</button>
            <button
              onClick={submit}
              disabled={!canSave}
              className="inline-flex items-center gap-1 rounded-md bg-[#f97316] px-4 py-1.5 text-[11px] font-bold text-white hover:bg-[#ea580c] disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" /> Lưu
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Modal giữa màn — mô tả chung (phần cố định) của hạng mục
function DocModal({
  item,
  isBusy,
  run,
  onClose,
  labels,
}: {
  item: Item;
  isBusy: boolean;
  run: (id: string, fn: () => Promise<unknown>, silent?: boolean) => Promise<void>;
  onClose: () => void;
  labels: string[];
}) {
  const [method, setMethod] = useState(item.method ?? "");
  const dirty = method !== (item.method ?? "");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const saveProject = () =>
    run(item.id, async () => {
      await api(`/api/estimate/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ method }) });
      toast.success("Đã lưu mô tả cho dự án");
      onClose();
    });

  // Lưu mẫu chung: method + template trường riêng (nhãn hiện có)
  const saveGlobal = () =>
    run(item.id, async () => {
      await api(`/api/estimate/defaults`, { method: "PUT", body: JSON.stringify({ name: item.name, method, fields: labels }) });
      await api(`/api/estimate/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ method }) });
      toast.success(`Đã lưu mẫu chung "${item.name}"`);
      onClose();
    });

  const pullGlobal = async () => {
    try {
      const r = await api(`/api/estimate/defaults?name=${encodeURIComponent(item.name)}`);
      if (!r.default || r.default.method == null || r.default.method === "") {
        toast.error(`Chưa có mẫu chung cho "${item.name}"`);
        return;
      }
      setMethod(r.default.method);
      toast.success("Đã lấy mẫu chung — bấm Lưu dự án để áp");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return createPortal(
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
          <div
            className="w-full max-w-2xl rounded-2xl border border-[#252840] bg-[#13151f] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#252840] px-4 py-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#c4b5fd]" />
                <span className="text-sm font-bold text-zinc-100">Mô tả chung — {item.name}</span>
              </div>
              <button onClick={onClose} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4">
              <p className="mb-2 text-[11px] text-zinc-500">
                Phần cố định (biện pháp, mác BT, loại thép…) — giống mọi dự án. AI đọc phần này + thông tin riêng để bóc khối lượng.
              </p>
              <textarea
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                rows={12}
                placeholder="Mô tả cố định của hạng mục…"
                className="w-full resize-y rounded-lg border border-[#252840] bg-[#0d0f17] px-3 py-2 text-xs leading-relaxed text-zinc-200 outline-none focus:border-[#f97316]/50"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 border-t border-[#252840] px-4 py-3">
              <button
                onClick={() => void pullGlobal()}
                className="inline-flex items-center gap-1 rounded-md bg-[#312152]/60 px-2.5 py-1.5 text-[11px] font-semibold text-[#c4b5fd] hover:bg-[#3b2a63]"
              >
                <BookMarked className="h-3.5 w-3.5" /> Lấy từ mẫu chung
              </button>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  onClick={saveGlobal}
                  disabled={isBusy}
                  title="Lưu vào mẫu chung để dùng lại cho dự án khác"
                  className="inline-flex items-center gap-1 rounded-md border border-[#6d5bb0]/60 px-2.5 py-1.5 text-[11px] font-bold text-[#c4b5fd] hover:bg-[#312152]/60 disabled:opacity-50"
                >
                  <BookMarked className="h-3.5 w-3.5" /> Lưu mẫu chung
                </button>
                <button
                  onClick={saveProject}
                  disabled={isBusy || !dirty}
                  className="inline-flex items-center gap-1 rounded-md bg-[#f97316] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#ea580c] disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" /> Lưu dự án
                </button>
              </div>
            </div>
          </div>
        </div>,
    document.body,
  );
}

function AddInline({
  onAdd,
  placeholder,
  label,
  subtle = false,
}: {
  onAdd: (name: string) => Promise<void>;
  placeholder: string;
  label: string;
  subtle?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={
          subtle
            ? "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            : "inline-flex items-center gap-1 rounded-lg border border-dashed border-[#374151] px-3 py-2 text-xs font-semibold text-zinc-400 hover:border-[#f97316]/60 hover:text-[#fb923c]"
        }
      >
        <Plus className="h-3.5 w-3.5" /> {label.replace(/^\+\s*/, "")}
      </button>
    );
  }

  const submit = async () => {
    const v = name.trim();
    if (!v) return;
    setName("");
    setOpen(false);
    await onAdd(v);
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") { setName(""); setOpen(false); }
        }}
        placeholder={placeholder}
        className="w-64 rounded-md border border-[#f97316]/50 bg-[#0d0f17] px-2 py-1.5 text-xs text-zinc-100 outline-none"
      />
      <button onClick={() => void submit()} className="rounded-md bg-[#f97316] px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-[#ea580c]">OK</button>
      <button onClick={() => { setName(""); setOpen(false); }} className="rounded-md border border-zinc-700 p-1.5 text-zinc-400 hover:bg-zinc-800"><X className="h-3.5 w-3.5" /></button>
    </span>
  );
}

function IconBtn({ children, onClick, title, danger = false }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`grid h-6 w-6 place-items-center rounded-md transition-colors ${danger ? "text-zinc-500 hover:bg-rose-500/15 hover:text-rose-400" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"}`}
    >
      {children}
    </button>
  );
}
