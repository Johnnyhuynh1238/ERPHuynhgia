"use client";

import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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

type Goods = { name: string; unit: string; qty: number; price: number };
// Cột nào của hàng được bấm: tổng chi phí (mọi nguồn) / đã chi (sổ quỹ) / công nợ.
type DetailKind = "total" | "spent" | "debt";
type DetailItem = {
  source: "mh_order" | "sub" | "expense" | "ncc";
  id: string;
  label: string;
  sub: string;
  amount: number;
  date: string | null;
  budgetLineId: string | null;
  goods?: Goods[]; // hàng hoá trong đơn (chỉ mh_order)
};
type DetailData = { items: DetailItem[]; lines: { id: string; name: string; groupKind: string }[] };
const SRC_LABEL: Record<DetailItem["source"], string> = {
  mh_order: "Mua hàng",
  sub: "Thầu phụ",
  expense: "Chi tay",
  ncc: "Công nợ NCC",
};
const KIND_TITLE: Record<DetailKind, string> = {
  total: "Chi phí gắn hạng mục",
  spent: "Đã chi — sổ quỹ",
  debt: "Công nợ còn lại",
};
const itemKey = (it: DetailItem) => `${it.source}:${it.id}`;

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

  // Popup chi tiết 1 hạng mục: list chi phí gắn vào + đổi hạng mục từng khoản (admin).
  const [detailLine, setDetailLine] = useState<{ id: string | null; name: string } | null>(null);
  const [detailKind, setDetailKind] = useState<DetailKind>("total");
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // key `${source}:${id}` -> lineId đang chọn ("" = bỏ gắn).
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [savingReassign, setSavingReassign] = useState(false);
  // Popup con: hàng hoá của 1 đơn mua hàng.
  const [goodsItem, setGoodsItem] = useState<DetailItem | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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

  const openDetail = useCallback(
    async (line: { id: string | null; name: string }, kind: DetailKind = "total") => {
      setDetailLine(line);
      setDetailKind(kind);
      setDetail(null);
      setChanges({});
      setDetailLoading(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/budget-plan/lines/${line.id ?? "unassigned"}/detail?kind=${kind}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error();
        setDetail(await res.json());
      } catch {
        toast.error("Không tải được chi tiết hạng mục");
        setDetailLine(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [projectId],
  );

  const pendingChanges = useMemo(() => {
    if (!detail) return [];
    return detail.items
      .filter((it) => {
        const k = itemKey(it);
        return k in changes && (changes[k] || null) !== (it.budgetLineId || null);
      })
      .map((it) => ({ source: it.source, id: it.id, budgetLineId: changes[itemKey(it)] || null }));
  }, [detail, changes]);

  const saveReassign = async () => {
    if (!pendingChanges.length) {
      setDetailLine(null);
      return;
    }
    setSavingReassign(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/budget-plan/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: pendingChanges }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error);
      }
      toast.success(`Đã đổi hạng mục ${pendingChanges.length} khoản`);
      setDetailLine(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Lưu lỗi");
    } finally {
      setSavingReassign(false);
    }
  };

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
    <>
    <div className={`bpdoc ${fontVars} -mx-4 -mt-4 md:-mx-6 md:-mt-6`} data-theme={theme}>
      <div className="bp-inner">
        <div className="bp-titlebar">
          <div>
            <div className="bp-eyebrow">
              {projectCode} · {projectName}
            </div>
            <h1 className="bp-h1">
              Ngân sách theo hạng mục
              {locked ? (
                <span className="bp-lock on">🔒 Đã khoá</span>
              ) : (
                <span className="bp-lock">✎ Nháp</span>
              )}
            </h1>
          </div>
          <button className="bp-iconbtn" onClick={toggleTheme} title="Đổi nền">
            {theme === "dark" ? "☀" : "☾"}
          </button>
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
                  <th>Tổng chi phí</th>
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
                      // Vượt (âm) không bù ngược — khớp tổng ở server.
                      r: a.r + Math.max(0, l.remaining),
                    }),
                    { b: 0, s: 0, d: 0, r: 0 },
                  );
                  return (
                    <GroupRows
                      key={g.key}
                      label={g.label}
                      lines={ls}
                      sum={gsum}
                      onOpen={canLock ? openDetail : undefined}
                    />
                  );
                })}
                {(data.unassigned.spent > 0 || data.unassigned.debt > 0) &&
                  (() => {
                    const ua = { id: null, name: "Chưa gắn hạng mục" };
                    const cell = canLock
                      ? (kind: DetailKind) => ({
                          className: "num strong bp-cellbtn",
                          onClick: () => openDetail(ua, kind),
                          title: "Gán hạng mục cho khoản mồ côi",
                        })
                      : () => ({ className: "num strong" });
                    return (
                      <tr className="bp-unassigned">
                        <td className="l">⚠ Chưa gắn hạng mục</td>
                        <td className="num">—</td>
                        <td {...cell("total")}>{fmt(data.unassigned.spent + data.unassigned.debt)}</td>
                        <td {...cell("spent")} className={canLock ? "num bp-cellbtn" : "num"}>
                          {fmt(data.unassigned.spent)}
                        </td>
                        <td {...cell("debt")} className={canLock ? "num warn bp-cellbtn" : "num warn"}>
                          {fmt(data.unassigned.debt)}
                        </td>
                        <td className="num">—</td>
                        <td className="num">—</td>
                      </tr>
                    );
                  })()}
              </tbody>
              <tfoot>
                <tr>
                  <td className="l">TỔNG</td>
                  <td className="num">{fmt(t.budget)}</td>
                  <td className="num strong">{fmt(t.spent + t.debt)}</td>
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

      {/* Bottom-sheet chi tiết hạng mục (portal ra body — thoát transform AppShell). */}
      {mounted &&
        detailLine &&
        createPortal(
          <div className={`bpdoc bp-portal ${fontVars}`} data-theme={theme}>
            <div className="bp-sheet-scrim" onClick={() => !savingReassign && setDetailLine(null)} />
            <div className="bp-sheet" role="dialog" aria-modal="true">
              <div className="bp-sheet-grip" />
              <div className="bp-sheet-head">
                <div>
                  <div className="bp-modal-eyebrow">{KIND_TITLE[detailKind]}</div>
                  <b>{detailLine.name}</b>
                </div>
                <button className="bp-iconbtn" onClick={() => setDetailLine(null)} aria-label="Đóng">
                  ✕
                </button>
              </div>

              <div className="bp-sheet-body">
                {detailLoading && <p className="bp-empty">Đang tải…</p>}
                {!detailLoading && detail && detail.items.length === 0 && (
                  <p className="bp-empty">
                    {detailKind === "spent"
                      ? "Chưa chi khoản nào cho hạng mục này."
                      : detailKind === "debt"
                        ? "Không còn công nợ cho hạng mục này."
                        : "Chưa có chi phí nào gắn hạng mục này."}
                  </p>
                )}
                {!detailLoading && detail && detail.items.length > 0 && detailKind !== "total" && (
                  <div className="bp-ditotal">
                    <span>Tổng {detailKind === "spent" ? "đã chi" : "công nợ"}</span>
                    <b className="num">{fmt(detail.items.reduce((s, it) => s + it.amount, 0))}</b>
                  </div>
                )}
                {!detailLoading &&
                  detail &&
                  detail.items.map((it) => {
                    const k = itemKey(it);
                    const val = k in changes ? changes[k] : it.budgetLineId ?? "";
                    const dirty = (val || null) !== (it.budgetLineId || null);
                    const hasGoods = it.source === "mh_order" && (it.goods?.length ?? 0) > 0;
                    return (
                      <div className={`bp-ditem${dirty ? " dirty" : ""}`} key={k}>
                        {hasGoods ? (
                          <button
                            type="button"
                            className="bp-ditem-main as-btn"
                            onClick={() => setGoodsItem(it)}
                            title="Xem hàng hoá trong đơn"
                          >
                            <span className="bp-ditem-src">{SRC_LABEL[it.source]}</span>
                            <span className="bp-ditem-label">
                              {it.label} <span className="bp-ditem-chev">›</span>
                            </span>
                            <span className="bp-ditem-sub">
                              {it.sub}
                              {it.date ? ` · ${it.date}` : ""} · {it.goods?.length} hàng
                            </span>
                          </button>
                        ) : (
                          <div className="bp-ditem-main">
                            <span className="bp-ditem-src">{SRC_LABEL[it.source]}</span>
                            <span className="bp-ditem-label">{it.label}</span>
                            <span className="bp-ditem-sub">
                              {it.sub}
                              {it.date ? ` · ${it.date}` : ""}
                            </span>
                          </div>
                        )}
                        <div className="bp-ditem-right">
                          <span className="bp-ditem-amt num">{fmt(it.amount)}</span>
                          {detailKind === "total" && (
                            <select
                              value={val}
                              onChange={(e) => setChanges((c) => ({ ...c, [k]: e.target.value }))}
                            >
                              <option value="">— Chưa gắn —</option>
                              {detail.lines.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>

              <div className="bp-sheet-foot">
                <button className="bp-btn" onClick={() => setDetailLine(null)} disabled={savingReassign}>
                  Đóng
                </button>
                {detailKind === "total" && (
                  <button
                    className="bp-btn solid"
                    onClick={saveReassign}
                    disabled={savingReassign || pendingChanges.length === 0}
                  >
                    {savingReassign ? "Đang lưu…" : `Lưu${pendingChanges.length ? ` (${pendingChanges.length})` : ""}`}
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Popup con: hàng hoá của 1 đơn mua hàng. */}
      {mounted &&
        goodsItem &&
        createPortal(
          <div className={`bpdoc bp-portal ${fontVars}`} data-theme={theme}>
            <div className="bp-sheet-scrim" onClick={() => setGoodsItem(null)} />
            <div className="bp-sheet bp-sheet-goods" role="dialog" aria-modal="true">
              <div className="bp-sheet-grip" />
              <div className="bp-sheet-head">
                <div>
                  <div className="bp-modal-eyebrow">Hàng hoá trong đơn</div>
                  <b>{goodsItem.label}</b>
                </div>
                <button className="bp-iconbtn" onClick={() => setGoodsItem(null)} aria-label="Đóng">
                  ✕
                </button>
              </div>
              <div className="bp-sheet-body">
                {(goodsItem.goods ?? []).length === 0 && <p className="bp-empty">Đơn không có hàng.</p>}
                {(goodsItem.goods ?? []).map((g, i) => (
                  <div className="bp-good" key={i}>
                    <div className="bp-good-main">
                      <span className="bp-good-name">{g.name}</span>
                      <span className="bp-good-sub num">
                        {fmt(g.qty)} {g.unit} × {fmt(g.price)}
                      </span>
                    </div>
                    <span className="bp-good-amt num">{fmt(g.qty * g.price)}</span>
                  </div>
                ))}
              </div>
              <div className="bp-sheet-foot">
                <button className="bp-btn solid" onClick={() => setGoodsItem(null)}>
                  Đóng
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function GroupRows({
  label,
  lines,
  sum,
  onOpen,
}: {
  label: string;
  lines: LineStat[];
  sum: { b: number; s: number; d: number; r: number };
  onOpen?: (line: { id: string; name: string }, kind: DetailKind) => void;
}) {
  return (
    <>
      <tr className="bp-group">
        <td className="l" colSpan={7}>{label}</td>
      </tr>
      {lines.map((l) => {
        const pct = l.budget ? Math.round(((l.spent + l.debt) / l.budget) * 100) : 0;
        // Cell chi phí bấm được: mở popup đúng loại (tổng/đã chi/công nợ).
        const cell = (kind: DetailKind, extra: string) =>
          onOpen
            ? {
                className: `num ${extra} bp-cellbtn`.trim(),
                onClick: () => onOpen({ id: l.id, name: l.name }, kind),
                title:
                  kind === "total"
                    ? "Xem chi phí & đổi hạng mục"
                    : kind === "spent"
                      ? "Xem sổ quỹ đã chi"
                      : "Xem công nợ còn lại",
              }
            : { className: `num ${extra}`.trim() };
        return (
          <tr key={l.id} className={l.over ? "over-row" : ""}>
            <td className="l">{l.name}</td>
            <td className="num">{fmt(l.budget)}</td>
            <td {...cell("total", "strong")}>{fmt(l.spent + l.debt)}</td>
            <td {...cell("spent", "")}>{fmt(l.spent)}</td>
            <td {...cell("debt", "warn")}>{fmt(l.debt)}</td>
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
        <td className="num strong">{fmt(sum.s + sum.d)}</td>
        <td className="num">{fmt(sum.s)}</td>
        <td className="num">{fmt(sum.d)}</td>
        <td className={`num ${sum.r < 0 ? "over" : ""}`}>{fmt(sum.r)}</td>
        <td className="num">{sum.b ? Math.round(((sum.s + sum.d) / sum.b) * 100) : 0}%</td>
      </tr>
    </>
  );
}
