"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CompanyFinance, Pnl } from "@/lib/company-finance";
import type { CompanyForecast, OverheadItem } from "@/lib/company-forecast";
import { OVERHEAD_GROUPS } from "@/lib/company-overhead-groups";
import { plexSans, plexMono } from "@/lib/fonts";
import "./finance-overview.css";

type SpendItem = { categoryId: string | null; code: string | null; name: string; amount: number; count: number };
type SpendDto = { from: string; to: string; total: number; items: SpendItem[] };

type Preset = "week" | "2weeks" | "month" | "year" | "custom";
const PRESETS: { key: Preset; label: string }[] = [
  { key: "week", label: "Tuần này" },
  { key: "2weeks", label: "2 tuần" },
  { key: "month", label: "Tháng này" },
  { key: "year", label: "Năm nay" },
  { key: "custom", label: "Tuỳ chọn" },
];

// Bảng màu lát bánh theo theme; danh mục ngoài top → gộp "Còn lại" màu xám.
const SLICE_COLORS = {
  light: ["#e36122", "#8a3d1c", "#b8934a", "#5b7a52", "#3f6f86", "#6c4a86", "#b5432e", "#c99a6e"],
  dark: ["#f0752f", "#d8996a", "#d8b25e", "#89ab78", "#8fc0d8", "#b498d0", "#e07a5f", "#f2cfa0"],
};
const REST_COLOR = { light: "rgba(46,20,10,.28)", dark: "rgba(247,242,228,.32)" };
const TOP_N = SLICE_COLORS.light.length;

const fmtN = (n: number) => Math.round(n).toLocaleString("vi-VN");
// Rút gọn số cho tâm biểu đồ: 1,23 tỷ / 456 tr.
const fmtShort = (n: number) =>
  n >= 1e9
    ? `${(n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`
    : n >= 1e6
      ? `${(n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`
      : fmtN(n);
const fmtDay = (s: string) => s.split("-").reverse().join("/");

// Ngày hôm nay theo giờ VN dạng YYYY-MM-DD.
const todayVn = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const addDays = (s: string, n: number) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
function presetRange(p: Exclude<Preset, "custom">): { from: string; to: string } {
  const to = todayVn();
  if (p === "2weeks") return { from: addDays(to, -13), to };
  if (p === "month") return { from: `${to.slice(0, 7)}-01`, to };
  if (p === "year") return { from: `${to.slice(0, 4)}-01-01`, to };
  // Tuần bắt đầu thứ 2.
  const [y, m, d] = to.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { from: addDays(to, -((dow + 6) % 7)), to };
}

export function FinanceOverviewClient() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const t = typeof window !== "undefined" ? localStorage.getItem("hg-theme") : null;
    if (t === "light" || t === "dark") setTheme(t);
  }, []);
  const toggleTheme = () =>
    setTheme((p) => {
      const n = p === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("hg-theme", n);
      } catch {
        /* bỏ qua */
      }
      return n;
    });

  return (
    <div className={`fodoc -mx-4 -mt-4 md:-mx-6 md:-mt-6 ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
      <div className="fowrap">
        <div className="fo-head">
          <div>
            <div className="fo-eyebrow">Tài chính công ty</div>
            <h1 className="fo-h1">Tài chính tổng quan</h1>
          </div>
          <button className="fo-iconbtn" onClick={toggleTheme} title="Đổi giao diện">
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>

        <BriefModule />
        <SpendModule theme={theme} />
        <FinanceModules theme={theme} />
      </div>
    </div>
  );
}

/* ── Module 1: Chi phí đi về đâu ─────────────────────────── */
function SpendModule({ theme }: { theme: "light" | "dark" }) {
  const [preset, setPreset] = useState<Preset>("month");
  const [custom, setCustom] = useState(() => presetRange("month"));
  const range = preset === "custom" ? custom : presetRange(preset);
  const [data, setData] = useState<SpendDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<number | null>(null);

  const validRange = range.from && range.to && range.from <= range.to;
  useEffect(() => {
    if (!validRange) return;
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/finance-overview/spend?from=${range.from}&to=${range.to}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? "Lỗi tải dữ liệu");
        return r.json() as Promise<SpendDto>;
      })
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [range.from, range.to, validRange]);

  const colors = SLICE_COLORS[theme];
  // Lát bánh: top N danh mục + gộp phần còn lại.
  const slices = useMemo(() => {
    const items = data?.items ?? [];
    const top = items.slice(0, TOP_N).map((i, idx) => ({ name: i.name, amount: i.amount, color: colors[idx] }));
    const rest = items.slice(TOP_N).reduce((s, i) => s + i.amount, 0);
    return rest > 0 ? [...top, { name: "Còn lại", amount: rest, color: REST_COLOR[theme] }] : top;
  }, [data, colors, theme]);
  const total = data?.total ?? 0;
  const activeSlice = active != null ? slices[active] : null;

  return (
    <section className="fo-mod">
      <div className="fo-mod-head">
        <h2 className="fo-h2">Chi phí đi về đâu</h2>
        <div className="fo-sub">
          {fmtDay(range.from)} – {fmtDay(range.to)} · chi phí đã chi (không gồm trả nợ gốc, tạm ứng)
        </div>
      </div>

      <div className="fo-chips">
        {PRESETS.map((p) => (
          <button key={p.key} className={`fo-chip ${preset === p.key ? "on" : ""}`} onClick={() => setPreset(p.key)}>
            {p.label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="fo-range">
          <label>
            Từ
            <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
          </label>
          <label>
            Đến
            <input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </label>
        </div>
      )}

      {!validRange ? (
        <div className="fo-empty">Chọn khoảng ngày hợp lệ.</div>
      ) : error ? (
        <div className="fo-empty err">{error}</div>
      ) : loading && !data ? (
        <div className="fo-empty">Đang tải…</div>
      ) : total <= 0 ? (
        <div className="fo-empty">Không có khoản chi nào trong khoảng này.</div>
      ) : (
        <div className={`fo-spend ${loading ? "dim" : ""}`}>
          <div className="fo-pie">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="amount"
                  nameKey="name"
                  innerRadius="58%"
                  outerRadius="92%"
                  paddingAngle={slices.length > 1 ? 1.2 : 0}
                  stroke="none"
                  isAnimationActive={false}
                  onMouseEnter={(_, i) => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onClick={(_, i) => setActive((a) => (a === i ? null : i))}
                >
                  {slices.map((s, i) => (
                    <Cell key={s.name} fill={s.color} opacity={active == null || active === i ? 1 : 0.35} />
                  ))}
                </Pie>
                <Tooltip content={() => null} />
              </PieChart>
            </ResponsiveContainer>
            <div className="fo-pie-c">
              <div className="k">{activeSlice ? activeSlice.name : "Tổng chi"}</div>
              <div className="v num">{fmtShort(activeSlice ? activeSlice.amount : total)}</div>
              {activeSlice && <div className="s num">{((activeSlice.amount / total) * 100).toFixed(1)}%</div>}
            </div>
          </div>

          <table className="fo-tbl">
            <thead>
              <tr>
                <th>Hạng mục</th>
                <th className="r">Đã chi</th>
                <th className="r">%</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((it, idx) => {
                const sliceIdx = idx < TOP_N ? idx : slices.length - 1;
                return (
                  <tr
                    key={it.categoryId ?? "none"}
                    className={active === sliceIdx ? "on" : ""}
                    onClick={() => setActive((a) => (a === sliceIdx ? null : sliceIdx))}
                  >
                    <td>
                      <span className="dot" style={{ background: slices[sliceIdx]?.color }} />
                      {it.name}
                      <span className="cnt">{it.count}</span>
                    </td>
                    <td className="r num">{fmtN(it.amount)}</td>
                    <td className="r num mut">{((it.amount / total) * 100).toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Tổng</td>
                <td className="r num">{fmtN(total)}</td>
                <td className="r num mut">100</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

/* ── Module 2–4: Lãi/lỗ · Nợ/dư · Phân tích ─────────────── */
type PnlKey = keyof CompanyFinance["pnl"];
const PNL_TABS: { key: PnlKey; label: string }[] = [
  { key: "month", label: "Tháng này" },
  { key: "lastMonth", label: "Tháng trước" },
  { key: "year", label: "Năm nay" },
  { key: "all", label: "Từ đầu" },
];
const signed = (n: number) => `${n < 0 ? "−" : "+"}${fmtN(Math.abs(n))}`;

function FinanceModules({ theme }: { theme: "light" | "dark" }) {
  const [data, setData] = useState<CompanyFinance | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/admin/finance-overview/position", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? "Lỗi tải dữ liệu");
        return r.json() as Promise<CompanyFinance>;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <section className="fo-mod"><div className="fo-empty err">{error}</div></section>;
  if (!data) return <section className="fo-mod"><div className="fo-empty">Đang tính lãi lỗ, công nợ…</div></section>;
  return (
    <>
      <PnlModule data={data} theme={theme} />
      <PositionModule data={data} />
      <ForecastModule />
      <InsightModule data={data} />
    </>
  );
}

function Verdict({ good, label, amount, note }: { good: boolean; label: string; amount: number; note?: string }) {
  return (
    <div className={`fo-verdict ${good ? "good" : "bad"}`}>
      <div className="k">{label}</div>
      <div className="v num">{fmtShort(Math.abs(amount))}</div>
      {note && <div className="s">{note}</div>}
    </div>
  );
}

function PnlModule({ data, theme }: { data: CompanyFinance; theme: "light" | "dark" }) {
  const [tab, setTab] = useState<PnlKey>("year");
  const p: Pnl = data.pnl[tab];
  const b = data.bridge;
  const c = theme === "dark" ? { inc: "#89ab78", cost: "#d8996a", grid: "rgba(247,242,228,.1)", axis: "rgba(247,242,228,.55)" } : { inc: "#5b7a52", cost: "#8a3d1c", grid: "rgba(46,20,10,.08)", axis: "rgba(46,20,10,.5)" };
  const chart = data.monthly.map((m) => ({ ...m, label: `T${Number(m.ym.slice(5))}` }));
  const cashProfit = b.customer + b.otherIn - b.cost;

  return (
    <section className="fo-mod">
      <div className="fo-mod-head">
        <h2 className="fo-h2">Công ty đang lãi hay lỗ?</h2>
        <div className="fo-sub">theo tiền thực thu – thực chi</div>
      </div>
      <div className="fo-chips">
        {PNL_TABS.map((t) => (
          <button key={t.key} className={`fo-chip ${tab === t.key ? "on" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="fo-grid2">
        <div>
          <Verdict
            good={p.profit >= 0}
            label={p.profit >= 0 ? "Đang lãi" : "Đang lỗ"}
            amount={p.profit}
            note={p.margin != null ? `Biên ${(p.margin * 100).toFixed(1)}% trên tổng thu` : undefined}
          />
          <table className="fo-kv">
            <tbody>
              <tr><td>Thu từ khách</td><td className="r num">{fmtN(p.customer)}</td></tr>
              <tr><td>Thu khác</td><td className="r num">{fmtN(p.otherIn)}</td></tr>
              <tr><td>Chi phí</td><td className="r num">−{fmtN(p.cost)}</td></tr>
            </tbody>
            <tfoot>
              <tr><td>{p.profit >= 0 ? "Lãi" : "Lỗ"}</td><td className={`r num ${p.profit >= 0 ? "ok" : "bad"}`}>{signed(p.profit)}</td></tr>
            </tfoot>
          </table>
        </div>
        <div>
          <div className="fo-cap">6 tháng gần nhất · thu vs chi</div>
          <div className="fo-bar">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 6, right: 0, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke={c.grid} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: c.axis, fontSize: 11 }} />
                <YAxis width={38} tickLine={false} axisLine={false} tick={{ fill: c.axis, fontSize: 10 }} tickFormatter={(v: number) => `${Math.round(v / 1e6)}`} />
                <Tooltip
                  cursor={{ fill: c.grid }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <div className="fo-tip">
                        <b>{label}</b>
                        <div>Thu <span className="num">{fmtN(Number(payload[0].payload.income))}</span></div>
                        <div>Chi <span className="num">{fmtN(Number(payload[0].payload.cost))}</span></div>
                        <div>{payload[0].payload.profit >= 0 ? "Lãi" : "Lỗ"} <span className="num">{signed(Number(payload[0].payload.profit))}</span></div>
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="income" fill={c.inc} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="cost" fill={c.cost} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="fo-legend">
            <span><i style={{ background: c.inc }} />Thu</span>
            <span><i style={{ background: c.cost }} />Chi phí</span>
            <span className="mut">đơn vị: triệu</span>
          </div>
        </div>
      </div>

      <div className="fo-cap" style={{ marginTop: 18 }}>Tiền đi đâu · từ đầu đến nay</div>
      <table className="fo-kv">
        <tbody>
          <tr><td>Thu từ khách + thu khác</td><td className="r num">{fmtN(b.customer + b.otherIn)}</td></tr>
          <tr><td>Chi phí</td><td className="r num">−{fmtN(b.cost)}</td></tr>
          <tr className="sub"><td>= {cashProfit >= 0 ? "Lãi" : "Lỗ"} theo dòng tiền</td><td className={`r num ${cashProfit >= 0 ? "ok" : "bad"}`}>{signed(cashProfit)}</td></tr>
          <tr><td>Nhận tiền vay</td><td className="r num">+{fmtN(b.loanIn)}</td></tr>
          <tr><td>Trả nợ gốc</td><td className="r num">−{fmtN(b.principalPaid)}</td></tr>
          <tr><td>Chi tạm ứng</td><td className="r num">−{fmtN(b.advanceOut)}</td></tr>
          <tr><td>Hoàn ứng</td><td className="r num">+{fmtN(b.advanceReturned)}</td></tr>
        </tbody>
        <tfoot>
          <tr><td>= Quỹ hiện còn</td><td className="r num">{fmtN(b.cash)}</td></tr>
        </tfoot>
      </table>
    </section>
  );
}

function PositionModule({ data }: { data: CompanyFinance }) {
  const p = data.position;
  const f = data.forecast30;
  return (
    <section className="fo-mod">
      <div className="fo-mod-head">
        <h2 className="fo-h2">Công ty đang nợ hay đang dư?</h2>
        <div className="fo-sub">nguồn: sổ quỹ + Kế hoạch thu-chi + Vay &amp; Tạm ứng</div>
      </div>

      <div className="fo-grid2" style={{ marginTop: 14 }}>
        <div>
          <Verdict good={p.netNow >= 0} label={p.netNow >= 0 ? "Hiện đang dư" : "Hiện đang nợ ròng"} amount={p.netNow} note="Tính các khoản đã đến hạn" />
          <table className="fo-kv">
            <tbody>
              <tr className="grp"><td colSpan={2}>Đang có</td></tr>
              <tr><td>Tiền quỹ</td><td className="r num">{fmtN(p.cash)}</td></tr>
              <tr><td>Khách nợ đã đến hạn</td><td className="r num">{fmtN(p.receivableDue)}</td></tr>
              <tr><td>Tạm ứng chưa hoàn</td><td className="r num">{fmtN(p.advances)}</td></tr>
              <tr className="grp"><td colSpan={2}>Đang nợ</td></tr>
              <tr><td>Dư nợ vay</td><td className="r num">−{fmtN(p.loans)}</td></tr>
              <tr><td>Nợ NCC vật tư</td><td className="r num">−{fmtN(p.ncc)}</td></tr>
              <tr><td>Phải trả đã đến hạn <span className="hint">thầu phụ, mua hàng, lương/lãi đã lên lịch</span></td><td className="r num">−{fmtN(p.payableDue)}</td></tr>
            </tbody>
            <tfoot>
              <tr><td>= {p.netNow >= 0 ? "Dư" : "Nợ ròng"}</td><td className={`r num ${p.netNow >= 0 ? "ok" : "bad"}`}>{signed(p.netNow)}</td></tr>
            </tfoot>
          </table>
        </div>
        <div>
          <Verdict good={p.netProjected >= 0} label={p.netProjected >= 0 ? "Dự kiến dư khi xong HĐ" : "Dự kiến vẫn nợ khi xong HĐ"} amount={p.netProjected} note="Thu hết đợt khách, trả hết khoản đã cam kết" />
          <table className="fo-kv">
            <tbody>
              <tr><td>Hiện tại</td><td className="r num">{signed(p.netNow)}</td></tr>
              <tr><td>Khách còn phải trả các đợt sau</td><td className="r num">+{fmtN(p.receivableLater)}</td></tr>
              <tr><td>Còn phải trả chưa đến hạn <span className="hint">thầu phụ, mua hàng, khoản đã lên lịch</span></td><td className="r num">−{fmtN(p.payableLater)}</td></tr>
            </tbody>
            <tfoot>
              <tr><td>= Dự kiến</td><td className={`r num ${p.netProjected >= 0 ? "ok" : "bad"}`}>{signed(p.netProjected)}</td></tr>
            </tfoot>
          </table>
          <div className="fo-note">Chưa trừ vật tư/nhân công công trình chưa đặt mua hoặc chưa ký thầu phụ — số thực tế sẽ thấp hơn.</div>
        </div>
      </div>

      <div className="fo-cap" style={{ marginTop: 18 }}>Quỹ 30 ngày tới</div>
      <div className="fo-stats">
        <div className="fo-tile"><div className="k">Thu dự kiến</div><div className="v num ok">{fmtShort(f.inflow)}</div></div>
        <div className="fo-tile"><div className="k">Chi dự kiến</div><div className="v num">{fmtShort(f.outflow)}</div></div>
        <div className="fo-tile"><div className="k">Quỹ thấp nhất</div><div className={`v num ${f.lowestCash < 0 ? "bad" : ""}`}>{f.lowestCash < 0 ? "−" : ""}{fmtShort(Math.abs(f.lowestCash))}</div></div>
        <div className="fo-tile"><div className="k">Quỹ cuối kỳ</div><div className={`v num ${f.endCash < 0 ? "bad" : ""}`}>{f.endCash < 0 ? "−" : ""}{fmtShort(Math.abs(f.endCash))}</div></div>
      </div>
      {f.firstNegative && <div className="fo-note bad">Quỹ âm từ ngày {fmtDay(f.firstNegative)} nếu thu chi đúng kế hoạch (khoản quá hạn tính dồn vào hôm nay).</div>}

      {data.overdueIn.length > 0 && (
        <>
          <div className="fo-cap" style={{ marginTop: 18 }}>Đợt thu quá hạn</div>
          <table className="fo-kv">
            <tbody>
              {data.overdueIn.map((x, i) => (
                <tr key={i}><td>{x.project ?? x.title}<span className="hint">{x.title} · hạn {x.date ? fmtDay(x.date) : "—"}</span></td><td className="r num">{fmtN(x.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

// Số triệu gọn cho bảng HĐ: 1.234,5
const fmtTr = (n: number) => (n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const signedTr = (n: number) => `${n < 0 ? "−" : "+"}${fmtTr(Math.abs(n))}`;
const pct = (m: number) => `${(m * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;

function ForecastModule() {
  const [data, setData] = useState<CompanyForecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    fetch("/api/admin/finance-overview/forecast", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? "Lỗi tải dữ liệu");
        return r.json() as Promise<CompanyForecast>;
      })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  if (error) return <section className="fo-mod"><div className="fo-empty err">{error}</div></section>;
  if (!data) return <section className="fo-mod"><div className="fo-empty">Đang tính dự báo các HĐ…</div></section>;

  const b = data.base;
  const assumed = data.projects.filter((p) => p.costSource === "assumed");
  return (
    <section className="fo-mod">
      <div className="fo-mod-head">
        <h2 className="fo-h2">Đến khi xong các HĐ đang chạy</h2>
        <div className="fo-sub">đến {fmtDay(data.horizonEnd)} · {data.months.toLocaleString("vi-VN")} tháng</div>
      </div>

      <div className="fo-grid2">
        <div>
          <Verdict
            good={data.end >= 0}
            label={data.end >= 0 ? "Dự kiến dư khi xong HĐ" : "Dự kiến vẫn nợ khi xong HĐ"}
            amount={data.end}
            note={assumed.length ? `Có ${assumed.length} HĐ chưa có ngân sách — đang giả định lãi gộp 25%` : "Tính theo ngân sách từng HĐ"}
          />
          <table className="fo-kv">
            <tbody>
              <tr className="grp"><td colSpan={2}>Nợ ròng hiện tại</td></tr>
              <tr><td>Tiền quỹ</td><td className="r num">{fmtN(b.cash)}</td></tr>
              <tr><td>Dư nợ vay</td><td className="r num">−{fmtN(b.loans)}</td></tr>
              {data.finished.map((p) => (
                <tr key={p.code}>
                  <td>{p.name}<span className="hint">đã xong · nợ NCC/thầu phụ {fmtN(p.debt)}{p.receivable > 0 ? ` · khách còn nợ ${fmtN(p.receivable)}` : ""}</span></td>
                  <td className="r num">{signed(p.receivable - p.debt)}</td>
                </tr>
              ))}
              {b.otherDebt > 0.5 && <tr><td>Nợ chưa gắn dự án</td><td className="r num">−{fmtN(b.otherDebt)}</td></tr>}
              <tr className="sub"><td>= Nợ ròng hiện tại</td><td className={`r num ${b.total >= 0 ? "ok" : "bad"}`}>{signed(b.total)}</td></tr>
              <tr className="grp"><td colSpan={2}>HĐ đang chạy (còn thu − còn phải chi)</td></tr>
              {data.projects.map((p) => (
                <tr key={p.id}><td>{p.name}<span className="hint">xong {fmtDay(p.endDate)}</span></td><td className="r num">{signed(p.net)}</td></tr>
              ))}
              <tr className="grp"><td colSpan={2}>Chi phí chung</td></tr>
              <tr><td>{fmtShort(data.overhead.monthly)}/tháng × {data.months.toLocaleString("vi-VN")} tháng</td><td className="r num">−{fmtN(data.overhead.total)}</td></tr>
            </tbody>
            <tfoot>
              <tr><td>= Cuối kỳ</td><td className={`r num ${data.end >= 0 ? "ok" : "bad"}`}>{signed(data.end)}</td></tr>
            </tfoot>
          </table>
        </div>
        <div>
          {data.scenarios.length > 0 && (
            <>
              <div className="fo-cap">Nếu lãi gộp các HĐ chưa có ngân sách là…</div>
              <div className="fo-stats fo-stats3">
                {data.scenarios.map((s) => (
                  <div key={s.margin} className="fo-tile">
                    <div className="k">{pct(s.margin)}</div>
                    <div className={`v num ${s.end < 0 ? "bad" : "ok"}`}>{s.end < 0 ? "−" : "+"}{fmtShort(Math.abs(s.end))}</div>
                  </div>
                ))}
              </div>
              {data.breakEvenMargin != null && (
                <div className={`fo-note ${data.breakEvenMargin > 0.3 ? "bad" : ""}`}>
                  Muốn hết nợ khi xong HĐ: lãi gộp các HĐ này cần đạt khoảng <b>{pct(Math.max(0, data.breakEvenMargin))}</b>.
                </div>
              )}
            </>
          )}
          <div className="fo-note">
            Chưa tính: tạm ứng chưa hoàn {fmtShort(data.advances)}, đợt thu bảo hành (thu sau 12 tháng)
            {data.projects.some((p) => p.warrantyIn > 0) ? ` ${fmtShort(data.projects.reduce((s, p) => s + p.warrantyIn, 0))}` : ""}. HĐ chưa có ngân sách: vốn = 75% giá trị HĐ, trừ phần đã chi.
          </div>
        </div>
      </div>

      <div className="fo-cap" style={{ marginTop: 18 }}>Từng HĐ đang chạy · triệu đồng</div>
      <div className="fo-scroll">
        <table className="fo-tbl plain">
          <thead>
            <tr>
              <th>HĐ</th>
              <th className="r">Giá trị</th>
              <th className="r">Đã thu</th>
              <th className="r">Lãi gộp</th>
              <th className="r">Còn thu</th>
              <th className="r">Còn phải chi</th>
              <th className="r">Dư / thiếu</th>
            </tr>
          </thead>
          <tbody>
            {data.projects.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.name}
                  <span className={`fo-tag ${p.costSource}`}>{p.costSource === "budget" ? (p.budgetStatus === "locked" ? "ngân sách đã khoá" : "ngân sách nháp") : "giả định"}</span>
                </td>
                <td className="r num">{fmtTr(p.revenue)}</td>
                <td className="r num">{fmtTr(p.collected)}</td>
                <td className="r num">{fmtTr(p.gross)}<span className="cnt">{p.margin != null ? pct(p.margin) : ""}</span></td>
                <td className="r num">{fmtTr(p.remainingIn)}</td>
                <td className="r num">{fmtTr(p.remainingOut)}</td>
                <td className={`r num ${p.net >= 0 ? "ok" : "bad"}`}>{signedTr(p.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <OverheadEditor items={data.overhead.items} monthly={data.overhead.monthly} onChanged={load} />
    </section>
  );
}

const parseTr = (s: string) => {
  const v = Number(s.replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(v) && v >= 0 ? Math.round(v * 1e6) : null;
};
const trInput = (n: number) => (n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 3, useGrouping: false });

function OverheadEditor({ items, monthly, onChanged }: { items: OverheadItem[]; monthly: number; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [add, setAdd] = useState({ name: "", groupKey: "van_hanh", amount: "" });

  const call = async (url: string, method: string, body?: unknown) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? "Lỗi lưu");
      onChanged();
      return true;
    } catch (e) {
      setMsg((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const patch = (it: OverheadItem, data: Partial<{ name: string; monthlyAmount: number; note: string | null }>) =>
    call(`/api/admin/finance-overview/overhead/${it.id}`, "PATCH", data);
  const remove = (it: OverheadItem) => {
    if (!window.confirm(`Xoá khoản "${it.name}" khỏi chi phí chung?`)) return;
    call(`/api/admin/finance-overview/overhead/${it.id}`, "DELETE");
  };
  const create = async () => {
    const amount = parseTr(add.amount);
    if (!add.name.trim() || amount == null) return setMsg("Nhập tên khoản và số tiền (triệu)");
    if (await call("/api/admin/finance-overview/overhead", "POST", { name: add.name, groupKey: add.groupKey, monthlyAmount: amount })) setAdd({ name: "", groupKey: add.groupKey, amount: "" });
  };

  return (
    <>
      <div className="fo-cap" style={{ marginTop: 18 }}>Chi phí chung hàng tháng · sửa trực tiếp (triệu)</div>
      <div className={`fo-oh ${busy ? "dim" : ""}`}>
        {OVERHEAD_GROUPS.map((g) => {
          const rows = items.filter((i) => i.groupKey === g.key);
          const sum = rows.reduce((s, i) => s + i.monthlyAmount, 0);
          return (
            <div key={g.key} className="fo-oh-grp">
              <div className="fo-oh-h"><span>{g.label}</span><span className="num">{fmtTr(sum)}</span></div>
              {rows.map((it) => (
                <div key={`${it.id}:${it.name}:${it.monthlyAmount}:${it.note ?? ""}`} className="fo-oh-row">
                  <div className="nm">
                    <input defaultValue={it.name} aria-label="Tên khoản" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== it.name && patch(it, { name: e.target.value.trim() })} />
                    <input className="nt" defaultValue={it.note ?? ""} placeholder="ghi chú" aria-label="Ghi chú" onBlur={(e) => e.target.value.trim() !== (it.note ?? "") && patch(it, { note: e.target.value.trim() || null })} />
                  </div>
                  <input
                    className="amt num"
                    inputMode="decimal"
                    defaultValue={trInput(it.monthlyAmount)}
                    aria-label="Số tiền/tháng (triệu)"
                    onBlur={(e) => {
                      const v = parseTr(e.target.value);
                      if (v == null) {
                        e.target.value = trInput(it.monthlyAmount);
                        return;
                      }
                      if (v !== it.monthlyAmount) patch(it, { monthlyAmount: v });
                    }}
                  />
                  <button className="del" title="Xoá" onClick={() => remove(it)} disabled={busy}>×</button>
                </div>
              ))}
            </div>
          );
        })}
        <div className="fo-oh-add">
          <input placeholder="Thêm khoản…" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
          <select value={add.groupKey} onChange={(e) => setAdd({ ...add, groupKey: e.target.value })}>
            {OVERHEAD_GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>
          <input className="amt num" inputMode="decimal" placeholder="tr/tháng" value={add.amount} onChange={(e) => setAdd({ ...add, amount: e.target.value })} />
          <button className="fo-chip on" onClick={create} disabled={busy}>Thêm</button>
        </div>
        <div className="fo-oh-total"><span>Tổng chi phí chung</span><span className="num">{fmtTr(monthly)} tr/tháng</span></div>
        {msg && <div className="fo-note bad">{msg}</div>}
      </div>
    </>
  );
}

const LEVEL_ICON: Record<CompanyFinance["insights"][number]["level"], string> = { bad: "!", warn: "▲", info: "i", good: "✓" };

type Brief = { id: string; asOf: string; headline: string; items: CompanyFinance["insights"]; createdAt: string };

/* ── Nhận định: bản AI soạn khi anh hỏi cập nhật tình hình, chọn xem bản cũ ── */
function BriefModule() {
  const [list, setList] = useState<Brief[] | null>(null);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    fetch("/api/admin/finance-overview/briefs", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Brief[]>) : []))
      .then(setList)
      .catch(() => setList([]));
  }, []);
  if (!list?.length) return null;
  const b = list[Math.min(idx, list.length - 1)];
  return (
    <section className="fo-mod">
      <div className="fo-mod-head">
        <h2 className="fo-h2">Nhận định</h2>
        {list.length > 1 ? (
          <select className="fo-brief-sel" value={idx} onChange={(e) => setIdx(Number(e.target.value))} aria-label="Chọn bản nhận định">
            {list.map((x, i) => (
              <option key={x.id} value={i}>
                {i === 0 ? "Mới nhất · " : ""}
                {fmtDay(x.asOf)}
              </option>
            ))}
          </select>
        ) : (
          <div className="fo-sub">cập nhật {fmtDay(b.asOf)}</div>
        )}
      </div>
      <div className="fo-brief-hl">{b.headline}</div>
      <div className="fo-ins">
        {b.items.map((x, i) => (
          <div key={i} className={`fo-in ${x.level}`}>
            <span className="ic">{LEVEL_ICON[x.level] ?? "i"}</span>
            <div>
              <div className="t">{x.title}</div>
              <div className="d">{x.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function InsightModule({ data }: { data: CompanyFinance }) {
  return (
    <section className="fo-mod">
      <div className="fo-mod-head">
        <h2 className="fo-h2">Phân tích &amp; đề xuất</h2>
        <div className="fo-sub">tự động từ số liệu hôm nay</div>
      </div>
      <div className="fo-ins">
        {data.insights.map((x, i) => (
          <div key={i} className={`fo-in ${x.level}`}>
            <span className="ic">{LEVEL_ICON[x.level]}</span>
            <div>
              <div className="t">{x.title}</div>
              <div className="d">{x.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
