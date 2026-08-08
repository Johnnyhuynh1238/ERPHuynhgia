"use client";

import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import "./budget-plan.css";

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

type LineStat = {
  id: string;
  name: string;
  groupKind: string;
  budget: number;
  spent: number;
  debt: number;
  remaining: number;
  over: boolean;
};
type PlanData = {
  exists: boolean;
  status: "draft" | "locked" | null;
  lockedAt: string | null;
  contractValue: number;
  lines: LineStat[];
  unassigned: { spent: number; debt: number };
  totals: { budget: number; spent: number; debt: number; remaining: number };
};

type EditLine = { name: string; groupKind: string; amount: string };

const GROUPS: { key: string; label: string }[] = [
  { key: "tho", label: "Phần thô" },
  { key: "hoan_thien", label: "Hoàn thiện" },
  { key: "nhan_cong", label: "Nhân công" },
  { key: "chung", label: "Chi phí chung" },
];
const groupLabel = (k: string) => GROUPS.find((g) => g.key === k)?.label ?? k;
const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export function BudgetPlanClient({
  projectId,
  projectCode,
  projectName,
  canLock,
}: {
  projectId: string;
  projectCode: string;
  projectName: string;
  canLock: boolean;
}) {
  const [data, setData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [edit, setEdit] = useState(false);
  const [rows, setRows] = useState<EditLine[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
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
      const res = await fetch(`/api/projects/${projectId}/budget-plan`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      toast.error("Không tải được ngân sách");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const locked = data?.status === "locked";
  const t = data?.totals ?? { budget: 0, spent: 0, debt: 0, remaining: 0 };
  const cv = data?.contractValue ?? 0;
  const profit = cv - t.budget;

  const startEdit = () => {
    setRows(
      (data?.lines ?? []).map((l) => ({ name: l.name, groupKind: l.groupKind, amount: String(l.budget) })),
    );
    setEdit(true);
  };
  const addRow = () => setRows((r) => [...r, { name: "", groupKind: "tho", amount: "" }]);
  const setRow = (i: number, patch: Partial<EditLine>) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const delRow = (i: number) => setRows((r) => r.filter((_, j) => j !== i));
  const editTotal = useMemo(() => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0), [rows]);

  const save = async () => {
    const clean = rows.filter((r) => r.name.trim());
    if (clean.some((r) => !(Number(r.amount) >= 0))) return toast.error("Ngân sách không hợp lệ");
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/budget-plan`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines: clean.map((r) => ({ name: r.name.trim(), groupKind: r.groupKind, amount: Number(r.amount) })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return toast.error(j.error ?? "Lỗi lưu");
    }
    toast.success("Đã lưu ngân sách");
    setEdit(false);
    load();
  };

  const setLock = async (action: "lock" | "unlock") => {
    if (action === "lock" && !confirm("Khoá ngân sách? Sau khi khoá phải mở khoá mới sửa được.")) return;
    const res = await fetch(`/api/projects/${projectId}/budget-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return toast.error(j.error ?? "Lỗi");
    }
    toast.success(action === "lock" ? "Đã khoá" : "Đã mở khoá");
    load();
  };

  const linesByGroup = useMemo(() => {
    const m = new Map<string, LineStat[]>();
    for (const l of data?.lines ?? []) (m.get(l.groupKind) ?? m.set(l.groupKind, []).get(l.groupKind)!).push(l);
    return m;
  }, [data]);

  const fontVars = `${plexSans.variable} ${plexMono.variable}`;

  return (
    <div className={`bpdoc ${fontVars} -mx-4 -mt-4 md:-mx-6 md:-mt-6`} data-theme={theme}>
      <div className="bp-inner">
        <div className="bp-top">
          <div className="bp-brand">
            <span className="bp-mark">HG</span>
            <div>
              <b>{projectCode}</b>
              <span>Ngân sách dự án</span>
            </div>
          </div>
          <button className="bp-iconbtn" onClick={toggleTheme} title="Đổi nền">
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>

        <div>
          <div className="bp-eyebrow">Quản lý dòng tiền · {projectName}</div>
          <h1 className="bp-h1">
            Ngân sách theo hạng mục
            {locked ? (
              <span className="bp-lock on">🔒 Đã khoá</span>
            ) : (
              <span className="bp-lock">✎ Nháp</span>
            )}
          </h1>
        </div>

        {/* KPI */}
        <section className="bp-kpis">
          <div className="bp-kpi">
            <label>Giá trị hợp đồng</label>
            <strong className="num">{fmt(cv)}</strong>
          </div>
          <div className="bp-kpi">
            <label>Tổng ngân sách</label>
            <strong className="num accent">{fmt(t.budget)}</strong>
          </div>
          <div className="bp-kpi">
            <label>Đã chi</label>
            <strong className="num">{fmt(t.spent)}</strong>
          </div>
          <div className="bp-kpi">
            <label>Công nợ</label>
            <strong className="num warn">{fmt(t.debt)}</strong>
          </div>
          <div className="bp-kpi">
            <label>Còn phải chi</label>
            <strong className={`num ${t.remaining < 0 ? "over" : "ok"}`}>{fmt(t.remaining)}</strong>
          </div>
          <div className="bp-kpi">
            <label>Dự kiến lời (HĐ − NS)</label>
            <strong className={`num ${profit < 0 ? "over" : "ok"}`}>{fmt(profit)}</strong>
          </div>
        </section>

        {/* actions */}
        <div className="bp-actions">
          {!edit && !locked && (
            <button className="bp-btn solid" onClick={startEdit}>
              {data?.exists ? "✎ Sửa ngân sách" : "＋ Lập ngân sách"}
            </button>
          )}
          {edit && (
            <>
              <button className="bp-btn solid" disabled={saving} onClick={save}>
                Lưu ({fmt(editTotal)})
              </button>
              <button className="bp-btn" onClick={() => setEdit(false)}>Huỷ</button>
              <button className="bp-btn" onClick={addRow}>＋ Hạng mục</button>
            </>
          )}
          {!edit && canLock && data?.exists && (
            <button className="bp-btn" onClick={() => setLock(locked ? "unlock" : "lock")}>
              {locked ? "🔓 Mở khoá" : "🔒 Khoá ngân sách"}
            </button>
          )}
        </div>

        {loading && <p className="bp-empty">Đang tải…</p>}

        {/* ── EDIT MODE ── */}
        {edit && (
          <div className="bp-edit">
            {rows.map((r, i) => (
              <div className="bp-erow" key={i}>
                <input
                  className="bp-ename"
                  placeholder="Tên hạng mục"
                  value={r.name}
                  onChange={(e) => setRow(i, { name: e.target.value })}
                />
                <select value={r.groupKind} onChange={(e) => setRow(i, { groupKind: e.target.value })}>
                  {GROUPS.map((g) => (
                    <option key={g.key} value={g.key}>{g.label}</option>
                  ))}
                </select>
                <input
                  className="bp-eamt num"
                  type="number"
                  placeholder="Ngân sách"
                  value={r.amount}
                  onChange={(e) => setRow(i, { amount: e.target.value })}
                />
                <button className="bp-del" onClick={() => delRow(i)}>🗑</button>
              </div>
            ))}
            {rows.length === 0 && <p className="bp-empty">Chưa có hạng mục. Bấm ＋ Hạng mục.</p>}
          </div>
        )}

        {/* ── VIEW MODE ── */}
        {!edit && data?.exists && (
          <div className="bp-table-wrap">
            <table className="bp-table">
              <thead>
                <tr>
                  <th className="l">Hạng mục</th>
                  <th>Ngân sách</th>
                  <th>Đã chi</th>
                  <th>Công nợ</th>
                  <th>Còn phải chi</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {GROUPS.filter((g) => linesByGroup.has(g.key)).map((g) => {
                  const ls = linesByGroup.get(g.key)!;
                  const gsum = ls.reduce(
                    (a, l) => ({
                      b: a.b + l.budget,
                      s: a.s + l.spent,
                      d: a.d + l.debt,
                      r: a.r + l.remaining,
                    }),
                    { b: 0, s: 0, d: 0, r: 0 },
                  );
                  return (
                    <GroupRows key={g.key} label={g.label} lines={ls} sum={gsum} />
                  );
                })}
                {(data.unassigned.spent > 0 || data.unassigned.debt > 0) && (
                  <tr className="bp-unassigned">
                    <td className="l">⚠ Chưa gắn hạng mục</td>
                    <td className="num">—</td>
                    <td className="num">{fmt(data.unassigned.spent)}</td>
                    <td className="num">{fmt(data.unassigned.debt)}</td>
                    <td className="num">—</td>
                    <td className="num">—</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td className="l">TỔNG</td>
                  <td className="num">{fmt(t.budget)}</td>
                  <td className="num">{fmt(t.spent)}</td>
                  <td className="num warn">{fmt(t.debt)}</td>
                  <td className={`num ${t.remaining < 0 ? "over" : "ok"}`}>{fmt(t.remaining)}</td>
                  <td className="num">{t.budget ? Math.round(((t.spent + t.debt) / t.budget) * 100) : 0}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {!edit && !loading && !data?.exists && (
          <p className="bp-empty">Chưa lập ngân sách. Bấm “Lập ngân sách”.</p>
        )}
      </div>
    </div>
  );
}

function GroupRows({
  label,
  lines,
  sum,
}: {
  label: string;
  lines: LineStat[];
  sum: { b: number; s: number; d: number; r: number };
}) {
  return (
    <>
      <tr className="bp-group">
        <td className="l" colSpan={6}>{label}</td>
      </tr>
      {lines.map((l) => {
        const pct = l.budget ? Math.round(((l.spent + l.debt) / l.budget) * 100) : 0;
        return (
          <tr key={l.id} className={l.over ? "over-row" : ""}>
            <td className="l">{l.name}</td>
            <td className="num">{fmt(l.budget)}</td>
            <td className="num">{fmt(l.spent)}</td>
            <td className="num warn">{fmt(l.debt)}</td>
            <td className={`num ${l.remaining < 0 ? "over" : ""}`}>{fmt(l.remaining)}</td>
            <td className="num">
              {pct}%{l.over && <span className="bp-over-tag">vượt</span>}
            </td>
          </tr>
        );
      })}
      <tr className="bp-gsum">
        <td className="l">∑ {label}</td>
        <td className="num">{fmt(sum.b)}</td>
        <td className="num">{fmt(sum.s)}</td>
        <td className="num">{fmt(sum.d)}</td>
        <td className={`num ${sum.r < 0 ? "over" : ""}`}>{fmt(sum.r)}</td>
        <td className="num">{sum.b ? Math.round(((sum.s + sum.d) / sum.b) * 100) : 0}%</td>
      </tr>
    </>
  );
}
