"use client";

import {
  ArrowDown,
  ArrowUp,
  ImagePlus,
  Loader2,
  MessageCircleQuestion,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { EditableText } from "./editable-text";

type Drawing = { key: string; name: string; type: string };
type Qa = { q: string; a?: string; askedAt: string; answeredAt?: string };
type ItemStatus = "draft" | "requested" | "analyzing" | "waiting_answer" | "ai_done" | "approved";

type Item = {
  id: string;
  name: string;
  method: string | null;
  materialSpec: string | null;
  dimensions: string | null;
  drawings: Drawing[];
  status: ItemStatus;
  qaThread: Qa[];
  sortOrder: number;
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
  const [lightbox, setLightbox] = useState<{ itemId: string; idx: number; drawing: Drawing } | null>(null);

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
      <div className="overflow-x-auto rounded-2xl border border-[#252840] bg-[#13151f]">
        <table className="w-full min-w-[880px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[#252840] text-[11px] uppercase tracking-wide text-zinc-500">
              <th className="w-[18%] px-3 py-2.5 font-semibold">Hạng mục</th>
              <th className="w-[22%] px-3 py-2.5 font-semibold">Biện pháp thi công</th>
              <th className="w-[22%] px-3 py-2.5 font-semibold">Chủng loại vật tư</th>
              <th className="w-[24%] px-3 py-2.5 font-semibold">Kích thước · Bản vẽ</th>
              <th className="w-[14%] px-3 py-2.5 text-right font-semibold">AI</th>
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
                openLightbox={(itemId, idx, drawing) => setLightbox({ itemId, idx, drawing })}
              />
            ))}
          </tbody>
        </table>
      </div>

      <AddInline
        placeholder="Tên nhóm mới…"
        label="+ Thêm nhóm"
        onAdd={(name) => run("group", () => api(`/api/projects/${projectId}/estimate/groups`, { method: "POST", body: JSON.stringify({ name }) }))}
      />

      {lightbox && (
        <Lightbox
          drawing={lightbox.drawing}
          url={`/api/estimate/items/${lightbox.itemId}/drawings/${lightbox.idx}`}
          onClose={() => setLightbox(null)}
          onDelete={async () => {
            const ok = await confirmDialog({ message: `Xoá bản vẽ "${lightbox.drawing.name}"?` });
            if (!ok) return;
            setLightbox(null);
            await run(lightbox.itemId, () => api(`/api/estimate/items/${lightbox.itemId}/drawings/${lightbox.idx}`, { method: "DELETE" }));
          }}
        />
      )}
    </div>
  );
}

function GroupRows({
  group,
  first,
  last,
  busy,
  run,
  openLightbox,
}: {
  group: Group;
  first: boolean;
  last: boolean;
  busy: string | null;
  run: (id: string, fn: () => Promise<unknown>, silent?: boolean) => Promise<void>;
  openLightbox: (itemId: string, idx: number, drawing: Drawing) => void;
}) {
  return (
    <>
      <tr className="border-y border-[#252840] bg-[#1a1d2e]">
        <td colSpan={5} className="px-3 py-2">
          <div className="flex items-center gap-2">
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

      {group.items.map((it, ii) => (
        <ItemRow key={it.id} item={it} first={ii === 0} last={ii === group.items.length - 1} busy={busy} run={run} openLightbox={openLightbox} />
      ))}

      <tr>
        <td colSpan={5} className="px-3 py-1.5">
          <AddInline
            placeholder="Tên hạng mục (VD: Móng, Cột + xây bao…)"
            label="+ Hạng mục"
            subtle
            onAdd={(name) => run(group.id, () => api(`/api/estimate/groups/${group.id}/items`, { method: "POST", body: JSON.stringify({ name }) }))}
          />
        </td>
      </tr>
    </>
  );
}

function ItemRow({
  item,
  first,
  last,
  busy,
  run,
  openLightbox,
}: {
  item: Item;
  first: boolean;
  last: boolean;
  busy: string | null;
  run: (id: string, fn: () => Promise<unknown>, silent?: boolean) => Promise<void>;
  openLightbox: (itemId: string, idx: number, drawing: Drawing) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const meta = STATUS_META[item.status];
  const isBusy = busy === item.id;
  const openQuestions = item.qaThread.filter((qa) => !qa.a);

  const patch = (field: string) => (value: string) =>
    run(item.id, () => api(`/api/estimate/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ [field]: value }) }));

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    await run(item.id, async () => {
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", f);
        await api(`/api/estimate/items/${item.id}/drawings`, { method: "POST", body: fd });
      }
    });
  };

  return (
    <>
      <tr className="group border-b border-[#1c1f30] align-top transition-colors hover:bg-[#171a28]">
        <td className="px-3 py-2">
          <EditableText value={item.name} className="font-semibold text-zinc-100" onSave={patch("name")} />
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.cls}`}>{meta.label}</span>
            {item.lineCount > 0 && <span className="text-[10px] text-zinc-500">{item.lineCount} công tác</span>}
            <span className="hidden items-center gap-0.5 group-hover:flex">
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
        </td>
        <td className="px-3 py-2">
          <EditableText value={item.method ?? ""} multiline placeholder="Biện pháp thi công…" onSave={patch("method")} />
        </td>
        <td className="px-3 py-2">
          <EditableText value={item.materialSpec ?? ""} multiline placeholder="Chủng loại vật tư…" onSave={patch("materialSpec")} />
        </td>
        <td className="px-3 py-2">
          <EditableText value={item.dimensions ?? ""} multiline placeholder="Kích thước, cao độ, số lượng…" onSave={patch("dimensions")} />
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {item.drawings.map((d, idx) => (
              <button
                key={d.key}
                onClick={() => openLightbox(item.id, idx, d)}
                title={d.name}
                className="overflow-hidden rounded-md border border-[#252840] hover:border-[#f97316]/60"
              >
                {d.type === "application/pdf" ? (
                  <span className="grid h-10 w-10 place-items-center bg-[#1a1d2e] text-[9px] font-bold text-rose-400">PDF</span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/estimate/items/${item.id}/drawings/${idx}`} alt={d.name} className="h-10 w-10 object-cover" />
                )}
              </button>
            ))}
            <button
              onClick={() => fileRef.current?.click()}
              title="Thêm ảnh bản vẽ / PDF"
              className="grid h-10 w-10 place-items-center rounded-md border border-dashed border-[#374151] text-zinc-500 hover:border-[#f97316]/60 hover:text-[#fb923c]"
            >
              <ImagePlus className="h-4 w-4" />
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple hidden onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
          </div>
        </td>
        <td className="px-3 py-2 text-right">
          {item.status === "requested" || item.status === "analyzing" ? (
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
                toast.success("Đã đưa vào hàng chờ AI bóc khối lượng");
              })}
              className="inline-flex items-center gap-1 rounded-lg bg-[#f97316]/15 px-2.5 py-1.5 text-[11px] font-bold text-[#fb923c] hover:bg-[#f97316]/25 disabled:opacity-50"
            >
              {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              AI Phân tích
            </button>
          )}
        </td>
      </tr>

      {item.qaThread.length > 0 && (
        <tr className="border-b border-[#1c1f30] bg-[#191322]/60">
          <td colSpan={5} className="px-3 py-2">
            <div className="space-y-2 pl-4">
              {item.qaThread.map((qa, qi) => (
                <QaRow key={qi} qa={qa} onAnswer={(answer) => run(item.id, () => api(`/api/estimate/items/${item.id}/answer`, { method: "POST", body: JSON.stringify({ index: qi, answer }) }))} />
              ))}
              {openQuestions.length > 0 && (
                <p className="text-[10px] text-zinc-500">Trả lời xong bấm lại <b className="text-[#fb923c]">AI Phân tích</b> để AI bóc tiếp với thông tin mới.</p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function QaRow({ qa, onAnswer }: { qa: Qa; onAnswer: (answer: string) => Promise<void> }) {
  const [draft, setDraft] = useState(qa.a ?? "");
  return (
    <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-start sm:gap-2">
      <span className="flex shrink-0 items-center gap-1 font-semibold text-rose-400">
        <MessageCircleQuestion className="h-3.5 w-3.5" /> AI hỏi:
      </span>
      <span className="text-zinc-300">{qa.q}</span>
      {qa.a ? (
        <span className="text-emerald-400 sm:ml-2">→ {qa.a}</span>
      ) : (
        <span className="flex flex-1 gap-1 sm:ml-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) void onAnswer(draft.trim()); }}
            placeholder="Trả lời…"
            className="w-full max-w-sm rounded-md border border-[#374151] bg-[#0d0f17] px-2 py-1 text-xs text-zinc-200 outline-none focus:border-[#f97316]/60"
          />
          <button
            onClick={() => draft.trim() && void onAnswer(draft.trim())}
            className="shrink-0 rounded-md bg-[#f97316]/15 px-2 py-1 text-[11px] font-bold text-[#fb923c] hover:bg-[#f97316]/25"
          >
            Gửi
          </button>
        </span>
      )}
    </div>
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
    <span className="inline-flex items-center gap-1">
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

function Lightbox({ drawing, url, onClose, onDelete }: { drawing: Drawing; url: string; onClose: () => void; onDelete: () => Promise<void> }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={onClose}>
      <div className="max-h-[90vh] max-w-4xl overflow-auto rounded-2xl border border-[#252840] bg-[#13151f] p-3" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="truncate text-xs font-semibold text-zinc-300">{drawing.name}</p>
          <div className="flex shrink-0 gap-1.5">
            <button onClick={() => void onDelete()} className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 px-2 py-1 text-[11px] font-semibold text-rose-400 hover:bg-rose-500/15">
              <Trash2 className="h-3 w-3" /> Xoá
            </button>
            <button onClick={onClose} className="rounded-md border border-zinc-700 p-1 text-zinc-400 hover:bg-zinc-800"><X className="h-4 w-4" /></button>
          </div>
        </div>
        {drawing.type === "application/pdf" ? (
          <iframe src={url} title={drawing.name} className="h-[75vh] w-[80vw] max-w-3xl rounded-lg bg-white" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={drawing.name} className="max-h-[78vh] w-auto rounded-lg" />
        )}
      </div>
    </div>
  );
}
