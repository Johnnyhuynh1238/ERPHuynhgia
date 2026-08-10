"use client";

import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import "./cash-plan.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

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
type BudgetRemain = {
  total: number; // tổng còn phải chi mọi dự án có ngân sách
  byProject: { projectId: string; label: string; remaining: number }[];
};
type CashPlanData = {
  balance: number;
  out: CashRow[];
  in: CashRow[];
  budget?: BudgetRemain | null; // còn phải chi theo ngân sách (tổng cty / hoặc dự án đang lọc)
};

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

type View = "thu" | "chi";

const fmt = (n: number) => n.toLocaleString("vi-VN");
const EPS = 1;
const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (base: string, d: number) => {
  const dt = new Date(base);
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
};

export function CashPlanClient({ projects }: { projects: Project[]; role: string }) {
  const [projectId, setProjectId] = useState<string>("");
  const [data, setData] = useState<CashPlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | "manual" | "salary">(null);
  const [view, setView] = useState<View>("thu");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [mounted, setMounted] = useState(false);

  // Bộ lọc khoảng ngày (global, trên cùng) — 1 ô lịch chọn từ → đến.
  const [fromD, setFromD] = useState<string>("");
  const [toD, setToD] = useState<string>("");
  const [calOpen, setCalOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    const s = localStorage.getItem("cashplan-theme");
    if (s === "light" || s === "dark") setTheme(s);
  }, []);
  const toggleTheme = () =>
    setTheme((t) => {
      const n = t === "dark" ? "light" : "dark";
      localStorage.setItem("cashplan-theme", n);
      return n;
    });

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

  // Khoản còn "chưa lên kế hoạch" (còn dư > 0).
  const unplanned = useMemo(() => rows.filter((r) => r.unplanned > EPS), [rows]);

  // Timeline: gộp đợt (chunk) + phần-còn-lại-ảo (ở ngày gốc) + self-entry có ngày.
  const timeline = useMemo<TimelineItem[]>(() => {
    const out: TimelineItem[] = [];
    for (const r of rows) {
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

  // Nhóm 1 danh sách timeline theo ngày + số dư luỹ kế (bắt đầu từ số dư quỹ).
  const groupDays = useCallback(
    (items: TimelineItem[], withBalance: boolean) => {
      const map = new Map<string, TimelineItem[]>();
      for (const t of items) (map.get(t.date) ?? map.set(t.date, []).get(t.date)!).push(t);
      let running = data?.balance ?? 0;
      return Array.from(map.entries()).map(([date, list]) => {
        const inSum = list.filter((i) => i.dir === "in").reduce((s, i) => s + i.amount, 0);
        const outSum = list.filter((i) => i.dir === "out").reduce((s, i) => s + i.amount, 0);
        running += inSum - outSum;
        return { date, items: list, inSum, outSum, balance: withBalance ? running : 0 };
      });
    },
    [data],
  );

  // Lọc theo khoảng ngày (áp cho phần đã lên kế hoạch).
  const inRange = useCallback(
    (d: string) => (!fromD || d >= fromD) && (!toD || d <= toD),
    [fromD, toD],
  );

  const dir: "in" | "out" = view === "thu" ? "in" : "out";
  // Khoản chưa kế hoạch của tab đang mở → luôn nằm trên cùng.
  const activeUnplanned = useMemo(
    () => unplanned.filter((r) => r.direction === dir),
    [unplanned, dir],
  );
  // Phần đã lên kế hoạch (theo ngày, có lọc khoảng ngày).
  const activeDays = useMemo(
    () => groupDays(timeline.filter((t) => t.dir === dir && inRange(t.date)), false),
    [timeline, dir, inRange, groupDays],
  );
  // Tổng thu / chi trong khoảng ngày đã chọn (phần đã lên kế hoạch, có ngày).
  const rangeThu = useMemo(
    () => timeline.filter((t) => t.dir === "in" && inRange(t.date)).reduce((s, t) => s + t.amount, 0),
    [timeline, inRange],
  );
  const rangeChi = useMemo(
    () => timeline.filter((t) => t.dir === "out" && inRange(t.date)).reduce((s, t) => s + t.amount, 0),
    [timeline, inRange],
  );
  const rangeActive = Boolean(fromD || toD);

  // Ngân sách "còn phải chi" mỗi dự án = khoản CHI chưa có kế hoạch (chưa đặt đơn).
  const budgetRows = useMemo(
    () =>
      (data?.budget?.byProject ?? [])
        .filter((p) => p.remaining > EPS)
        .map((p) => ({ key: `budget:${p.projectId}`, label: p.label, amount: p.remaining })),
    [data],
  );
  const budgetChiTotal = useMemo(() => budgetRows.reduce((s, b) => s + b.amount, 0), [budgetRows]);

  const totals = useMemo(() => {
    const chi = rows.filter((r) => r.direction === "out").reduce((s, r) => s + r.total, 0);
    const thu = rows.filter((r) => r.direction === "in").reduce((s, r) => s + r.total, 0);
    // Chi chưa lên KH gồm: khoản nguồn chưa xếp ngày + hạn mức ngân sách còn phải chi.
    const chiChua =
      unplanned.filter((r) => r.direction === "out").reduce((s, r) => s + r.unplanned, 0) +
      budgetChiTotal;
    const thuChua = unplanned.filter((r) => r.direction === "in").reduce((s, r) => s + r.unplanned, 0);
    return { chi, thu, chiChua, thuChua };
  }, [rows, unplanned, budgetChiTotal]);

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
    return setNativeDate({ sourceType: r.sourceType, sourceId: r.sourceId }, date);
  };

  const editTimelineDate = (t: TimelineItem, date: string | null): Promise<boolean | void> => {
    if (t.editKind === "native") {
      if (!date && t.sourceType === "sub_payment") {
        toast.error("Đợt thầu phụ bắt buộc có ngày");
        return Promise.resolve(false);
      }
      return setNativeDate(t, date);
    }
    return patchItem(t.itemId!, { plannedDate: date });
  };

  const fontVars = `${plexSans.variable} ${plexMono.variable}`;

  const setPreset = (days: number) => {
    setFromD(todayStr());
    setToD(addDays(todayStr(), days));
  };

  const clearRange = () => {
    setFromD("");
    setToD("");
  };

  return (
    <div className={`cpdoc ${fontVars} -mx-4 -mt-4 md:-mx-6 md:-mt-6`} data-theme={theme}>
      <div className="cp-inner">
        {/* topbar */}
        <div className="cp-top">
          <div className="cp-brand">
            <span className="cp-mark">HG</span>
            <div>
              <b>HUỲNH GIA</b>
              <span>Dòng tiền</span>
            </div>
          </div>
          <div className="cp-tbtns">
            <button
              className="cp-iconbtn"
              onClick={toggleTheme}
              title={theme === "dark" ? "Nền sáng" : "Nền tối"}
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
          </div>
        </div>

        {/* header */}
        <div>
          <div className="cp-eyebrow">Kế hoạch tài chính</div>
          <h1 className="cp-h1">Kế hoạch thu · chi</h1>
          <p className="cp-lead">
            Dòng tiền dự kiến từ các nguồn: thầu phụ, mua hàng, công nợ, nợ vay, lương, HĐ, tạm ứng.
          </p>
        </div>

        {/* controls */}
        <div className="cp-controls">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Tất cả dự án</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
          <button className="cp-btn" onClick={() => setModal("manual")}>＋ Khoản tay</button>
          <button className="cp-btn" onClick={() => setModal("salary")}>＋ Lương</button>
        </div>

        {/* Bộ lọc khoảng ngày — 1 ô lịch, trên cùng */}
        <DateRange
          fromD={fromD}
          toD={toD}
          open={calOpen}
          setOpen={setCalOpen}
          onPick={(f, t) => {
            setFromD(f);
            setToD(t);
          }}
          setPreset={setPreset}
          clearRange={clearRange}
        />

        {/* KPI: số dư + tổng thu + tổng chi (theo khoảng ngày; chưa KH ghi dưới) */}
        <section className="cp-kpis">
          <div className="cp-kpi bal">
            <label>Số dư quỹ hiện tại</label>
            <strong>{fmt(data?.balance ?? 0)}</strong>
          </div>
          <div className="cp-kpi in">
            <label>Tổng thu{rangeActive ? " (trong khoảng)" : ""}</label>
            <strong>{fmt(rangeThu)}</strong>
            <em>{fmt(totals.thuChua)} chưa lên KH</em>
          </div>
          <div className="cp-kpi out">
            <label>Tổng chi{rangeActive ? " (trong khoảng)" : ""}</label>
            <strong>{fmt(rangeChi + budgetChiTotal)}</strong>
            <em>
              {fmt(totals.chiChua)} chưa lên KH
              {budgetChiTotal > 0 ? ` · gồm ${fmt(budgetChiTotal)} ngân sách` : ""}
            </em>
          </div>
        </section>

        {/* 2 tab lớn: Thu / Chi */}
        <nav className="cp-tabs big">
          <button
            className={`cp-tab in ${view === "thu" ? "on" : ""}`}
            onClick={() => setView("thu")}
          >
            ↓ Thu
            <span className="cp-tabcount">{fmt(rangeThu)}</span>
          </button>
          <button
            className={`cp-tab out ${view === "chi" ? "on" : ""}`}
            onClick={() => setView("chi")}
          >
            ↑ Chi
            <span className="cp-tabcount">{fmt(rangeChi + budgetChiTotal)}</span>
          </button>
        </nav>

        {loading && <div className="cp-loading">Đang tải…</div>}

        <FlowView
          dir={dir}
          unplanned={activeUnplanned}
          budgetRows={dir === "out" ? budgetRows : []}
          days={activeDays}
          rangeActive={rangeActive}
          onPlan={planLeft}
          onInterest={(r, d, a) => addChunk(r, d, a, true)}
          onDate={editTimelineDate}
          onDelete={delItem}
          loading={loading}
        />
      </div>

      {mounted &&
        modal &&
        createPortal(
          <div className={`cpportal ${fontVars}`} data-theme={theme}>
            {modal === "manual" && (
              <ManualModal projects={projects} onClose={() => setModal(null)} onSaved={load} />
            )}
            {modal === "salary" && <SalaryModal onClose={() => setModal(null)} onSaved={load} />}
          </div>,
          document.body,
        )}
    </div>
  );
}

// ── 1 ngày trên timeline ────────────────────────────────────────────────────
type DayData = {
  date: string;
  items: TimelineItem[];
  inSum: number;
  outSum: number;
  balance: number;
};
function DayBlock({
  d,
  onDate,
  onDelete,
  showBalance,
  overdue,
}: {
  d: DayData;
  onDate: (t: TimelineItem, date: string | null) => Promise<boolean | void>;
  onDelete: (id: string, series?: boolean) => Promise<boolean | void>;
  showBalance?: boolean;
  overdue?: boolean;
}) {
  return (
    <div className={`cp-day ${(showBalance && d.balance < 0) || overdue ? "neg" : ""}`}>
      <div className="cp-day-head">
        <b>
          {new Date(d.date).toLocaleDateString("vi-VN", {
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
          {overdue && <span className="cp-badge-over">quá hạn kế hoạch</span>}
        </b>
        {showBalance ? (
          <span className="cp-day-bal">
            Số dư: <strong>{fmt(d.balance)}</strong>
            {d.balance < 0 && <em className="warn"> ⚠ âm</em>}
          </span>
        ) : (
          <span className="cp-day-bal">
            <strong>{fmt(d.inSum + d.outSum)}</strong>
          </span>
        )}
      </div>
      {d.items.map((t) => (
        <TimelineCard
          key={t.id}
          item={t}
          onDate={(date) => onDate(t, date)}
          onDelete={t.deletable ? (series) => onDelete(t.itemId!, series) : undefined}
        />
      ))}
    </div>
  );
}

// ── Body 1 tab (Thu / Chi): chưa KH lên đầu → đã KH theo ngày ────────────────
function FlowView({
  dir,
  unplanned,
  budgetRows,
  days,
  rangeActive,
  onPlan,
  onInterest,
  onDate,
  onDelete,
  loading,
}: {
  dir: "in" | "out";
  unplanned: CashRow[];
  budgetRows: { key: string; label: string; amount: number }[];
  days: DayData[];
  rangeActive: boolean;
  onPlan: (r: CashRow, date: string, amount: number) => Promise<boolean | void>;
  onInterest: (r: CashRow, date: string, amount: number) => Promise<boolean | void>;
  onDate: (t: TimelineItem, date: string | null) => Promise<boolean | void>;
  onDelete: (id: string, series?: boolean) => Promise<boolean | void>;
  loading: boolean;
}) {
  const word = dir === "in" ? "thu" : "chi";
  const today = todayStr();
  const overdueDays = days.filter((d) => d.date < today);
  const futureDays = days.filter((d) => d.date >= today);
  const overdueCount = overdueDays.reduce((s, d) => s + d.items.length, 0);
  const futureCount = futureDays.reduce((s, d) => s + d.items.length, 0);
  const empty = unplanned.length === 0 && days.length === 0 && budgetRows.length === 0 && !loading;
  return (
    <div className="cp-list">
      {/* ── Chưa lên kế hoạch (luôn trên cùng) ── */}
      {(unplanned.length > 0 || budgetRows.length > 0) && (
        <>
          <div className="cp-sec warn">
            <span>⏳ Chưa lên kế hoạch</span>
            <span className="cp-sec-n">{unplanned.length + budgetRows.length}</span>
          </div>
          {/* Hạn mức ngân sách còn phải chi (chưa đặt đơn) — chỉ hiển thị, không lên lịch. */}
          {budgetRows.map((b) => (
            <div key={b.key} className="cp-card out cp-card-budget">
              <div className="cp-card-top">
                <div>
                  <b>🏦 Ngân sách còn phải chi</b>
                  <small className="proj">{b.label}</small>
                  <small>Hạn mức chưa đặt đơn</small>
                </div>
                <span className="cp-amt out">{fmt(b.amount)}</span>
              </div>
            </div>
          ))}
          {unplanned.map((r) => (
            <UnplannedCard
              key={r.key}
              row={r}
              onPlan={(d, a) => onPlan(r, d, a)}
              onInterest={(d, a) => onInterest(r, d, a)}
            />
          ))}
        </>
      )}

      {/* ── Quá hạn kế hoạch (ngày đã qua, chưa chi/thu) — nổi lên trên ── */}
      {overdueDays.length > 0 && (
        <>
          <div className="cp-sec over">
            <span>⚠ Quá hạn kế hoạch</span>
            <span className="cp-sec-n">{overdueCount}</span>
          </div>
          {overdueDays.map((d) => (
            <DayBlock key={d.date} d={d} onDate={onDate} onDelete={onDelete} overdue />
          ))}
        </>
      )}

      {/* ── Sắp tới theo ngày (lọc theo khoảng chọn ở trên) ── */}
      <div className="cp-sec">
        <span>📅 Theo kế hoạch{rangeActive ? " · trong khoảng" : ""}</span>
        <span className="cp-sec-n">{futureCount}</span>
      </div>
      {futureDays.length === 0 && !loading && (
        <p className="cp-empty">Chưa có khoản {word} nào sắp tới{rangeActive ? " trong khoảng" : ""}.</p>
      )}
      {futureDays.map((d) => (
        <DayBlock key={d.date} d={d} onDate={onDate} onDelete={onDelete} />
      ))}

      {empty && <p className="cp-empty">Chưa có khoản {word} nào.</p>}
    </div>
  );
}

// ── Bộ lọc khoảng ngày: nút + popover lịch chọn range ────────────────────────
const VN_MONTHS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"];
const VN_DOW = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const dmy = (s: string) => {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};

function DateRange({
  fromD,
  toD,
  open,
  setOpen,
  onPick,
  setPreset,
  clearRange,
}: {
  fromD: string;
  toD: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  onPick: (from: string, to: string) => void;
  setPreset: (days: number) => void;
  clearRange: () => void;
}) {
  const label =
    !fromD && !toD
      ? "Toàn bộ thời gian"
      : fromD && toD && fromD !== toD
        ? `${dmy(fromD)} → ${dmy(toD)}`
        : dmy(fromD || toD);

  return (
    <div className="cp-daterange">
      <button className={`cp-dr-btn ${fromD || toD ? "on" : ""}`} onClick={() => setOpen(!open)}>
        <span>📅 {label}</span>
        <span className="cp-dr-caret">{open ? "▲" : "▼"}</span>
      </button>
      {(fromD || toD) && (
        <button className="cp-dr-clear" onClick={clearRange} title="Xoá lọc">
          ✕
        </button>
      )}
      {open && (
        <div className="cp-cal-pop">
          <RangeCalendar fromD={fromD} toD={toD} onPick={onPick} />
          <div className="cp-chips cp-cal-presets">
            <button className="cp-chip" onClick={() => { setPreset(7); }}>7 ngày</button>
            <button className="cp-chip" onClick={() => { setPreset(30); }}>30 ngày</button>
            <button className="cp-chip" onClick={() => { setPreset(90); }}>90 ngày</button>
            <button className="cp-chip" onClick={() => { clearRange(); }}>Xoá</button>
            <button className="cp-chip on" onClick={() => setOpen(false)}>Xong</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RangeCalendar({
  fromD,
  toD,
  onPick,
}: {
  fromD: string;
  toD: string;
  onPick: (from: string, to: string) => void;
}) {
  const anchor = fromD || toD || todayStr();
  const [ym, setYm] = useState(() => {
    const [y, m] = anchor.split("-").map(Number);
    return { y, m: m - 1 }; // m: 0-based
  });

  const shift = (delta: number) =>
    setYm((s) => {
      const dt = new Date(s.y, s.m + delta, 1);
      return { y: dt.getFullYear(), m: dt.getMonth() };
    });

  // Lưới ngày (tuần bắt đầu T2).
  const first = new Date(ym.y, ym.m, 1);
  const startDow = (first.getDay() + 6) % 7; // 0=T2
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++)
    cells.push(`${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);

  const pick = (d: string) => {
    // Đang chọn dở = có ngày đầu, chưa có ngày cuối.
    const picking = Boolean(fromD) && !toD;
    if (!picking) {
      onPick(d, ""); // click 1: đặt ngày đầu, chờ ngày cuối
    } else if (d < fromD) {
      onPick(d, fromD); // click 2 trước ngày đầu → đảo
    } else {
      onPick(fromD, d); // click 2: chốt khoảng
    }
  };

  const today = todayStr();
  return (
    <div className="cp-cal">
      <div className="cp-cal-head">
        <button onClick={() => shift(-1)}>‹</button>
        <b>{VN_MONTHS[ym.m]} {ym.y}</b>
        <button onClick={() => shift(1)}>›</button>
      </div>
      <div className="cp-cal-dow">
        {VN_DOW.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="cp-cal-grid">
        {cells.map((d, i) =>
          d === null ? (
            <span key={`e${i}`} className="cp-cal-day empty" />
          ) : (
            <button
              key={d}
              className={[
                "cp-cal-day",
                d === today ? "today" : "",
                fromD && toD && d > fromD && d < toD ? "inrange" : "",
                d === fromD ? "edge start" : "",
                d === toD ? "edge end" : "",
                fromD && d === fromD && d === toD ? "single" : "",
              ].join(" ")}
              onClick={() => pick(d)}
            >
              {Number(d.slice(-2))}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

// ── 1 khoản chưa KH ─────────────────────────────────────────────────────────
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
        <span className={`cp-amt ${row.direction}`}>{fmt(row.unplanned)}</span>
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

// ── 1 đợt trên timeline ─────────────────────────────────────────────────────
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
