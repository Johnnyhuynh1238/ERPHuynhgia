"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import "./cash-plan.css";

type Project = { id: string; code: string; name: string };

type PlanChunk = {
  id: string;
  plannedDate: string | null;
  amount: number;
  note: string | null;
  title: string | null;
  recurGroupId: string | null;
};
type CashRow = {
  key: string;
  direction: "out" | "in";
  sourceType: string;
  sourceId: string | null;
  projectId: string | null;
  projectLabel: string | null;
  title: string;
  subtitle: string | null;
  total: number;
  hasTotal: boolean;
  canSplit: boolean;
  nativeDate: string | null;
  nativeEditable: boolean;
  chunks: PlanChunk[];
  planned: number;
  unplanned: number;
  selfItemId: string | null;
};
type CashPlanData = { balance: number; out: CashRow[]; in: CashRow[] };

type TimelineItem = {
  id: string;
  rowKey: string;
  date: string;
  dir: "out" | "in";
  amount: number;
  title: string;
  subtitle: string | null;
  projectLabel: string | null;
  editKind: "native" | "item";
  sourceType: string;
  sourceId: string | null;
  itemId: string | null;
  recurGroupId: string | null;
  deletable: boolean;
};

const fmt = (n: number) => n.toLocaleString("vi-VN");
const EPS = 1;
const todayStr = () => new Date().toISOString().slice(0, 10);

export function CashPlanClient({ projects }: { projects: Project[]; role: string }) {
  const [projectId, setProjectId] = useState<string>("");
  const [data, setData] = useState<CashPlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | "manual" | "salary">(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cash-plan${projectId ? `?projectId=${projectId}` : ""}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      toast.error("Không tải được kế hoạch");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => (data ? [...data.out, ...data.in] : []), [data]);

  // Cột trái: khoản còn "chưa lên kế hoạch" (còn dư > 0).
  const unplanned = useMemo(() => rows.filter((r) => r.unplanned > EPS), [rows]);

  // Cột phải: timeline. Gộp đợt (chunk) + phần-còn-lại-ảo (ở ngày gốc) + self-entry có ngày.
  const timeline = useMemo<TimelineItem[]>(() => {
    const out: TimelineItem[] = [];
    for (const r of rows) {
      // self-entry (lãi/lương/nhập tay) có ngày
      if (r.selfItemId) {
        if (r.nativeDate)
          out.push({
            id: r.selfItemId,
            rowKey: r.key,
            date: r.nativeDate,
            dir: r.direction,
            amount: r.total,
            title: r.title,
            subtitle: r.subtitle,
            projectLabel: r.projectLabel,
            editKind: "item",
            sourceType: r.sourceType,
            sourceId: r.sourceId,
            itemId: r.selfItemId,
            recurGroupId: r.chunks[0]?.recurGroupId ?? null,
            deletable: true,
          });
        continue;
      }
      // đợt tự chia
      const chunkSum = r.chunks.reduce((s, c) => s + c.amount, 0);
      for (const c of r.chunks) {
        if (!c.plannedDate) continue;
        out.push({
          id: c.id,
          rowKey: r.key,
          date: c.plannedDate,
          dir: r.direction,
          amount: c.amount,
          title: r.title,
          subtitle: c.note ?? r.subtitle,
          projectLabel: r.projectLabel,
          editKind: "item",
          sourceType: r.sourceType,
          sourceId: r.sourceId,
          itemId: c.id,
          recurGroupId: c.recurGroupId,
          deletable: true,
        });
      }
      // phần còn lại ở ngày gốc
      const remaining = r.total - chunkSum;
      if (r.nativeDate && remaining > EPS) {
        out.push({
          id: `${r.key}:native`,
          rowKey: r.key,
          date: r.nativeDate,
          dir: r.direction,
          amount: remaining,
          title: r.title,
          subtitle: r.subtitle,
          projectLabel: r.projectLabel,
          editKind: r.nativeEditable ? "native" : "item",
          sourceType: r.sourceType,
          sourceId: r.sourceId,
          itemId: null,
          recurGroupId: null,
          deletable: false,
        });
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [rows]);

  // Nhóm timeline theo ngày + số dư luỹ kế.
  const days = useMemo(() => {
    const map = new Map<string, TimelineItem[]>();
    for (const t of timeline) (map.get(t.date) ?? map.set(t.date, []).get(t.date)!).push(t);
    let running = data?.balance ?? 0;
    return [...map.entries()].map(([date, items]) => {
      const inSum = items.filter((i) => i.dir === "in").reduce((s, i) => s + i.amount, 0);
      const outSum = items.filter((i) => i.dir === "out").reduce((s, i) => s + i.amount, 0);
      running += inSum - outSum;
      return { date, items, inSum, outSum, balance: running };
    });
  }, [timeline, data]);

  const totals = useMemo(() => {
    const chi = rows.filter((r) => r.direction === "out").reduce((s, r) => s + r.total, 0);
    const thu = rows.filter((r) => r.direction === "in").reduce((s, r) => s + r.total, 0);
    const chiChua = unplanned.filter((r) => r.direction === "out").reduce((s, r) => s + r.unplanned, 0);
    const thuChua = unplanned.filter((r) => r.direction === "in").reduce((s, r) => s + r.unplanned, 0);
    return { chi, thu, chiChua, thuChua };
  }, [rows, unplanned]);

  // ── mutations ──────────────────────────────────────────────────────────────
  const api = useCallback(
    async (url: string, method: string, body?: unknown) => {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? "Lỗi");
        return false;
      }
      await load();
      return true;
    },
    [load],
  );

  const addChunk = (r: CashRow, date: string, amount: number, asInterest = false) =>
    api("/api/cash-plan", "POST", {
      kind: "chunk",
      direction: r.direction,
      sourceType: asInterest ? "loan_interest" : r.sourceType,
      sourceId: r.sourceId,
      projectId: r.projectId,
      plannedDate: date,
      amount,
    });
  const setNativeDate = (t: { sourceType: string; sourceId: string | null }, date: string | null) =>
    api("/api/cash-plan", "PATCH", { sourceType: t.sourceType, sourceId: t.sourceId, date });
  const patchItem = (id: string, body: Record<string, unknown>) =>
    api(`/api/cash-plan/${id}`, "PATCH", body);
  const delItem = (id: string, series = false) =>
    api(`/api/cash-plan/${id}${series ? "?series=1" : ""}`, "DELETE");

  const planLeft = (r: CashRow, date: string, amount: number) => {
    if (r.sourceType === "loan_principal") return addChunk(r, date, amount);
    if (r.canSplit) return addChunk(r, date, amount);
    if (r.selfItemId) return patchItem(r.selfItemId, { plannedDate: date });
    return setNativeDate({ sourceType: r.sourceType, sourceId: r.sourceId }, date); // native (đợt thu HĐ)
  };

  const editTimelineDate = (t: TimelineItem, date: string | null) => {
    if (t.editKind === "native") {
      if (!date && t.sourceType === "sub_payment") return toast.error("Đợt thầu phụ bắt buộc có ngày");
      return setNativeDate(t, date);
    }
    return patchItem(t.itemId!, { plannedDate: date });
  };

  return (
    <div className="cp-wrap">
      <header className="cp-head">
        <div>
          <h1>Kế hoạch thu · chi</h1>
          <p>Dòng tiền dự kiến từ các nguồn: thầu phụ, mua hàng, công nợ, nợ vay, lương, HĐ, tạm ứng.</p>
        </div>
        <div className="cp-head-actions">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Tất cả dự án</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
          <button onClick={() => setModal("manual")}>＋ Khoản tay</button>
          <button onClick={() => setModal("salary")}>＋ Lương</button>
        </div>
      </header>

      <section className="cp-kpis">
        <div className="cp-kpi bal">
          <span>Số dư quỹ hiện tại</span>
          <strong>{fmt(data?.balance ?? 0)}</strong>
        </div>
        <div className="cp-kpi out">
          <span>Dự chi · chưa KH</span>
          <strong>{fmt(totals.chi)}</strong>
          <em>{fmt(totals.chiChua)} chưa lên KH</em>
        </div>
        <div className="cp-kpi in">
          <span>Dự thu · chưa KH</span>
          <strong>{fmt(totals.thu)}</strong>
          <em>{fmt(totals.thuChua)} chưa lên KH</em>
        </div>
      </section>

      {loading && <div className="cp-loading">Đang tải…</div>}

      <div className="cp-cols">
        {/* ── CỘT TRÁI ── */}
        <div className="cp-col">
          <h2>⏳ Chưa lên kế hoạch <span className="cp-count">{unplanned.length}</span></h2>
          {unplanned.length === 0 && !loading && <p className="cp-empty">Mọi khoản đã có ngày.</p>}
          {unplanned.map((r) => (
            <UnplannedCard
              key={r.key}
              row={r}
              onPlan={(d, a) => planLeft(r, d, a)}
              onInterest={(d, a) => addChunk(r, d, a, true)}
            />
          ))}
        </div>

        {/* ── CỘT PHẢI ── */}
        <div className="cp-col">
          <h2>📅 Kế hoạch (dòng tiền)</h2>
          {days.length === 0 && !loading && <p className="cp-empty">Chưa có khoản nào lên kế hoạch.</p>}
          {days.map((d) => (
            <div key={d.date} className={`cp-day ${d.balance < 0 ? "neg" : ""}`}>
              <div className="cp-day-head">
                <b>{new Date(d.date).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}</b>
                <span className="cp-day-bal">
                  Số dư: <strong>{fmt(d.balance)}</strong>
                  {d.balance < 0 && <em className="warn"> ⚠ âm</em>}
                </span>
              </div>
              {d.items.map((t) => (
                <TimelineCard
                  key={t.id}
                  item={t}
                  onDate={(date) => editTimelineDate(t, date)}
                  onDelete={t.deletable ? (series) => delItem(t.itemId!, series) : undefined}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {modal === "manual" && (
        <ManualModal projects={projects} onClose={() => setModal(null)} onSaved={load} />
      )}
      {modal === "salary" && <SalaryModal onClose={() => setModal(null)} onSaved={load} />}
    </div>
  );
}

// ── Cột trái: 1 khoản chưa KH ──────────────────────────────────────────────
function UnplannedCard({
  row,
  onPlan,
  onInterest,
}: {
  row: CashRow;
  onPlan: (date: string, amount: number) => Promise<boolean | void>;
  onInterest: (date: string, amount: number) => Promise<boolean | void>;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayStr());
  const [amount, setAmount] = useState(String(Math.round(row.unplanned)));
  const [intOpen, setIntOpen] = useState(false);
  const [intAmount, setIntAmount] = useState("");

  const isLoan = row.sourceType === "loan_principal";
  return (
    <div className={`cp-card ${row.direction}`}>
      <div className="cp-card-top">
        <div>
          <b>{row.title}</b>
          {row.subtitle && <small>{row.subtitle}</small>}
          {row.projectLabel && <small className="proj">{row.projectLabel}</small>}
        </div>
        <span className="cp-amt">{fmt(row.unplanned)}</span>
      </div>
      {row.hasTotal && row.planned > EPS && (
        <div className="cp-split-note">
          Tổng {fmt(row.total)} · đã KH {fmt(row.planned)} · chưa KH {fmt(row.unplanned)}
        </div>
      )}
      <div className="cp-card-actions">
        <button onClick={() => setOpen((v) => !v)}>{open ? "Huỷ" : "＋ Lên kế hoạch"}</button>
        {isLoan && <button className="ghost" onClick={() => setIntOpen((v) => !v)}>＋ Lãi vay</button>}
      </div>
      {open && (
        <div className="cp-inline">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input
            type="number"
            value={amount}
            disabled={!row.canSplit}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            onClick={async () => {
              const a = row.canSplit ? Number(amount) : row.unplanned;
              if (row.canSplit && (!a || a <= 0)) return toast.error("Số tiền không hợp lệ");
              const ok = await onPlan(date, a);
              if (ok) setOpen(false);
            }}
          >
            Lưu
          </button>
        </div>
      )}
      {intOpen && (
        <div className="cp-inline">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="number" placeholder="Tiền lãi" value={intAmount} onChange={(e) => setIntAmount(e.target.value)} />
          <button
            onClick={async () => {
              const a = Number(intAmount);
              if (!a || a <= 0) return toast.error("Nhập tiền lãi");
              const ok = await onInterest(date, a);
              if (ok) {
                setIntOpen(false);
                setIntAmount("");
              }
            }}
          >
            Lưu lãi
          </button>
        </div>
      )}
    </div>
  );
}

// ── Cột phải: 1 đợt trên timeline ──────────────────────────────────────────
function TimelineCard({
  item,
  onDate,
  onDelete,
}: {
  item: TimelineItem;
  onDate: (date: string | null) => Promise<boolean | void>;
  onDelete?: (series: boolean) => Promise<boolean | void>;
}) {
  const [edit, setEdit] = useState(false);
  const [date, setDate] = useState(item.date);
  return (
    <div className={`cp-tl ${item.dir}`}>
      <span className={`cp-dot ${item.dir}`} />
      <div className="cp-tl-body">
        <b>{item.title}</b>
        {item.subtitle && <small>{item.subtitle}</small>}
        {item.projectLabel && <small className="proj">{item.projectLabel}</small>}
      </div>
      <div className="cp-tl-right">
        <span className={`cp-amt ${item.dir}`}>
          {item.dir === "out" ? "−" : "+"}
          {fmt(item.amount)}
        </span>
        <div className="cp-tl-actions">
          <button className="ghost" onClick={() => setEdit((v) => !v)}>📅</button>
          {onDelete && (
            <button
              className="ghost del"
              onClick={() => {
                if (item.recurGroupId) {
                  if (confirm("Xoá CẢ CHUỖI định kỳ? OK = cả chuỗi, Cancel = chỉ kỳ này")) return onDelete(true);
                  return onDelete(false);
                }
                if (confirm("Xoá đợt này?")) return onDelete(false);
              }}
            >
              🗑
            </button>
          )}
        </div>
      </div>
      {edit && (
        <div className="cp-inline full">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button onClick={async () => (await onDate(date)) && setEdit(false)}>Đổi ngày</button>
          <button
            className="ghost"
            onClick={async () => (await onDate(null)) && setEdit(false)}
            title="Đưa về Chưa kế hoạch"
          >
            ⏏ Về trái
          </button>
        </div>
      )}
    </div>
  );
}

// ── Modal nhập tay ──────────────────────────────────────────────────────────
function ManualModal({
  projects,
  onClose,
  onSaved,
}: {
  projects: Project[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [dir, setDir] = useState<"out" | "in">("out");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState<string>("");
  const [projectId, setProjectId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim() || !Number(amount)) return toast.error("Nhập tên + số tiền");
    setBusy(true);
    const res = await fetch("/api/cash-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "manual",
        direction: dir,
        title: title.trim(),
        amount: Number(amount),
        plannedDate: date || null,
        projectId: projectId || null,
        note: note || null,
      }),
    });
    setBusy(false);
    if (!res.ok) return toast.error("Lỗi lưu");
    toast.success("Đã thêm");
    onSaved();
    onClose();
  };

  return (
    <Modal title="Khoản nhập tay (ngoài hệ thống)" onClose={onClose}>
      <div className="cp-seg">
        <button className={dir === "out" ? "on" : ""} onClick={() => setDir("out")}>Chi</button>
        <button className={dir === "in" ? "on" : ""} onClick={() => setDir("in")}>Thu</button>
      </div>
      <label>Tên khoản<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label>Số tiền<input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label>Ngày dự (trống = chưa KH)<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label>
        Dự án
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">— Không —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
          ))}
        </select>
      </label>
      <label>Ghi chú<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <button className="cp-save" disabled={busy} onClick={save}>Lưu</button>
    </Modal>
  );
}

// ── Modal lương ─────────────────────────────────────────────────────────────
function SalaryModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [payday, setPayday] = useState(todayStr());
  const [recurring, setRecurring] = useState(true);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim() || !Number(amount)) return toast.error("Nhập tên + số tiền");
    setBusy(true);
    const res = await fetch("/api/cash-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "salary",
        title: title.trim(),
        amount: Number(amount),
        payday,
        recurring,
      }),
    });
    setBusy(false);
    if (!res.ok) return toast.error("Lỗi lưu");
    toast.success(recurring ? "Đã tạo lương cả năm" : "Đã thêm kỳ lương");
    onSaved();
    onClose();
  };

  return (
    <Modal title="Lương nhân viên" onClose={onClose}>
      <label>Tên / nhân viên<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label>Lương / kỳ<input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label>Ngày trả<input type="date" value={payday} onChange={(e) => setPayday(e.target.value)} /></label>
      <label className="cp-check">
        <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
        Định kỳ cả năm (T1–T12 của năm chọn)
      </label>
      <button className="cp-save" disabled={busy} onClick={save}>Lưu</button>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="cp-modal-bg" onClick={onClose}>
      <div className="cp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cp-modal-head">
          <b>{title}</b>
          <button onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
