"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CompanyFinance, Pnl } from "@/lib/company-finance";
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

const LEVEL_ICON: Record<CompanyFinance["insights"][number]["level"], string> = { bad: "!", warn: "▲", info: "i", good: "✓" };

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
