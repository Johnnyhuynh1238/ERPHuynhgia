"use client";

import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import "./overview.css";

const plexSans = IBM_Plex_Sans({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });

type Cost = { name: string; amount: number };
type Overview = {
  project: { id: string; code: string; name: string; address: string; status: string; startDate: string; endDate: string | null; daysLeft: number | null };
  finance: {
    contract: number; collected: number; remaining: number;
    budgetCost: number; grossMargin: number; spent: number; remainingSpend: number;
    surplus: number | null; cashFlow: number; supplierDebt: number; supplierCount: number;
    costBreakdown: Cost[];
  };
  payments: { doneInstallments: number; totalInstallments: number; lastMilestone: string | null; next: { label: string; amount: number; date: string | null } | null };
  progress: { pct: number; source: string };
  tiles: { muaHang: { count: number; total: number; received: number }; acceptance: { total: number; signed: number }; diary: { count: number } };
  diary: { date: string; workers: number | null; tasks: string | null; issues: string | null }[];
};

// ── format tiền (đồng → tr / tỷ) ──────────────────────────────
function fmt(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(2).replace(".", ",")} tỷ`;
  const tr = a / 1e6;
  if (tr >= 100) return `${sign}${Math.round(tr)}tr`;
  if (tr >= 10) return `${sign}${tr.toFixed(1).replace(".", ",")}tr`;
  if (tr >= 0.5) return `${sign}${tr.toFixed(1).replace(".", ",")}tr`;
  return `${sign}${Math.round(a / 1e3)}k`;
}
const fmtSigned = (v: number) => (v > 0 ? `+${fmt(v)}` : fmt(v));
const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const clampW = (n: number) => Math.max(0, Math.min(100, n));
const ddmm = (s: string | null) => {
  if (!s) return "";
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const COST_COLORS = ["var(--orange)", "var(--ok)", "var(--gold)", "var(--terra)", "var(--mut)"];

export function OverviewClient({
  projectId,
  laborMode = "self",
  pendingDiaries = 0,
}: {
  projectId: string;
  laborMode?: "self" | "subcontract";
  pendingDiaries?: number;
}) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [aiOn, setAiOn] = useState(false);
  const [aiSrc, setAiSrc] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const saved = (typeof localStorage !== "undefined" && localStorage.getItem("overview-theme")) as "light" | "dark" | null;
    if (saved === "light" || saved === "dark") setTheme(saved);
    else if (typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches) setTheme("dark");
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try { localStorage.setItem("overview-theme", next); } catch { /* noop */ }
      return next;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/projects/${projectId}/overview`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? "Lỗi tải dữ liệu");
        return r.json();
      })
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [projectId]);

  // nhãn phụ tràn khỏi đoạn thanh → canh phải
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const fit = () => {
      root.querySelectorAll<HTMLElement>(".slabels .sl").forEach((sl) => {
        if (sl.classList.contains("hi")) return;
        sl.classList.remove("ovf");
        let cw = 0;
        sl.querySelectorAll<HTMLElement>(".snm,.sn").forEach((el) => { cw = Math.max(cw, el.scrollWidth); });
        if (cw > sl.clientWidth + 1) sl.classList.add("ovf");
      });
    };
    fit();
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, [data]);

  const openAi = useCallback(() => {
    setAiSrc((s) => s ?? `https://huynhgia6.com/claude/chat?arg=duan-${data?.project.code ?? projectId}`);
    setAiOn(true);
  }, [data, projectId]);

  const base = `/projects/${projectId}`;

  const bars = useMemo(() => {
    if (!data) return null;
    const f = data.finance;
    return {
      thu: { hi: clampW(pct(f.remaining, f.contract)), l: clampW(pct(f.collected, f.contract)) },
      ln: { hi: clampW(pct(f.grossMargin, f.contract)), m: clampW(pct(f.spent, f.contract)), l: clampW(pct(f.remainingSpend, f.contract)) },
      td: { m: clampW(pct(f.spent, f.budgetCost)), l: clampW(pct(f.remainingSpend, f.budgetCost)) },
      cash: { hi: clampW(pct(f.cashFlow, f.collected)), m: clampW(pct(f.spent, f.collected)) },
    };
  }, [data]);

  if (err) {
    return (
      <div className={`ovdoc ${plexSans.variable} ${plexMono.variable}`} data-theme={theme} ref={rootRef}>
        <div className="wrap" style={{ paddingTop: 40 }}><p style={{ color: "var(--mut)" }}>Không tải được tổng quan: {err}</p></div>
      </div>
    );
  }
  if (!data || !bars) {
    return (
      <div className={`ovdoc ${plexSans.variable} ${plexMono.variable}`} data-theme={theme} ref={rootRef}>
        <div className="wrap" style={{ paddingTop: 40 }}><p style={{ color: "var(--mut)" }}>Đang tải…</p></div>
      </div>
    );
  }

  const f = data.finance;
  const p = data.project;
  const spentTotal = f.spent || 1;
  const isSelf = laborMode === "self";

  type Tile = { href: string; emoji: string; name: string; sub?: string; badge?: { cls: string; text: string }; show?: boolean };
  const tiles: Tile[] = [
    { href: `${base}/tasks`, emoji: "📊", name: "Tiến độ", sub: "Mốc thi công" },
    { href: `${base}/du-toan`, emoji: "📐", name: "Dự toán", sub: `Giá vốn ${fmt(f.budgetCost)}`, badge: { cls: "ok", text: "Đã duyệt" } },
    { href: `${base}/mua-hang`, emoji: "🛒", name: "Mua hàng", sub: `${data.tiles.muaHang.count} đơn · ${fmt(data.tiles.muaHang.total)}`, badge: data.tiles.muaHang.received ? { cls: "info", text: `${data.tiles.muaHang.received} đã nhận` } : undefined },
    { href: `${base}/payments`, emoji: "💵", name: "Thanh toán HĐ", sub: `Đã thu ${fmt(f.collected)}`, badge: { cls: "info", text: `${data.payments.doneInstallments}/${data.payments.totalInstallments} đợt` } },
    { href: `${base}/cong-no`, emoji: "💰", name: "Công nợ NCC", sub: `Còn nợ ${fmt(f.supplierDebt)}`, badge: f.supplierCount ? { cls: "warn", text: `${f.supplierCount} NCC` } : undefined },
    { href: `${base}/material-proposals`, emoji: "📦", name: "Đề xuất vật tư", sub: "VT cần mua" },
    { href: `${base}/work-orders`, emoji: "👷", name: "Giao việc", sub: "Phiếu hàng ngày", show: isSelf },
    { href: `${base}/eod`, emoji: "🌇", name: "Cuối ngày", sub: "Chấm công · sản lượng", show: isSelf },
    { href: `${base}/qc-mapping`, emoji: "✅", name: "QC Mapping", sub: "Checklist NC", show: isSelf },
    { href: `${base}/payroll`, emoji: "🏦", name: "Lương tuần", sub: "Bonus · payslip", show: isSelf },
    { href: `${base}/acceptance`, emoji: "📋", name: "Nghiệm thu", sub: `${Math.max(0, data.tiles.acceptance.total - data.tiles.acceptance.signed)} mốc chờ ký`, badge: { cls: "ok", text: `${data.tiles.acceptance.signed}/${data.tiles.acceptance.total} mốc` } },
    { href: `${base}/construction-log`, emoji: "📖", name: "Nhật ký", sub: `${data.tiles.diary.count} bản ghi`, badge: data.diary[0] ? { cls: "info", text: ddmm(data.diary[0].date) } : undefined },
    { href: `${base}/diary-approval`, emoji: "📝", name: "Duyệt nhật ký", sub: "Nhật ký KS QL", badge: pendingDiaries ? { cls: "warn", text: `${pendingDiaries} chờ` } : undefined },
    { href: `${base}/documents`, emoji: "📁", name: "Hồ sơ", sub: "File · ảnh · HĐ" },
    { href: `${base}/members`, emoji: "👥", name: "Thành viên", sub: "Đội thi công" },
    { href: `${base}/sub-contracts`, emoji: "🤝", name: "Thầu phụ", sub: "Hợp đồng phụ", show: !isSelf },
    { href: `${base}/edit`, emoji: "✏️", name: "Sửa dự án", sub: "Thông tin chung" },
    { href: `${base}/log`, emoji: "🕘", name: "Log dự án", sub: "Activity log" },
  ].filter((t) => t.show !== false);

  return (
    <div className={`ovdoc -mx-4 -mt-4 md:-mx-6 md:-mt-6 ${plexSans.variable} ${plexMono.variable}`} data-theme={theme} ref={rootRef}>
      <div className="wrap">
        <div className="topbar">
          <div className="brand">
            <div className="mark">HG</div>
            <div><b>HUỲNH GIA</b><span>Dự án</span></div>
          </div>
          <div className="tbtns">
            <button className="aibtn" onClick={openAi} type="button">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2.2l1.7 5.7c.2.6.6 1 1.2 1.2l5.7 1.7-5.7 1.7c-.6.2-1 .6-1.2 1.2L12 19.4l-1.7-5.7c-.2-.6-.6-1-1.2-1.2L3.4 10.8l5.7-1.7c.6-.2 1-.6 1.2-1.2L12 2.2z" />
                <path d="M18.6 14.3l.7 2.4c.1.3.3.5.6.6l2.4.7-2.4.7c-.3.1-.5.3-.6.6l-.7 2.4-.7-2.4c-.1-.3-.3-.5-.6-.6l-2.4-.7 2.4-.7c.3-.1.5-.3.6-.6l.7-2.4z" opacity=".55" />
              </svg> AI
            </button>
            <button className="iconbtn" onClick={toggleTheme} type="button" aria-label="Đổi nền">◑</button>
          </div>
        </div>

        <div className="eyebrow">{p.status === "in_progress" || p.status === "construction" ? "Đang thi công" : "Dự án"}{data.payments.lastMilestone ? ` · ${data.payments.lastMilestone}` : ""}</div>
        <h1>{p.name}<span className="status">Live</span></h1>
        <div className="meta">
          <span className="num">{p.code}</span><span className="d">·</span>
          {p.address ? (<><span>📍 <b>{p.address}</b></span><span className="d">·</span></>) : null}
          {p.startDate ? (<><span>Khởi công <b>{ddmm(p.startDate)}</b></span><span className="d">·</span></>) : null}
          {p.endDate ? (<span>Bàn giao <b>{ddmm(p.endDate)}</b></span>) : null}
        </div>

        {/* ── TÀI CHÍNH ── */}
        <div className="phead"><span className="pn">Tài chính dự án</span></div>
        <div className="vbars">
          {/* 1 · Còn thu khách hàng */}
          <div className="vb">
            <div className="vb-btn">
              <div className="vb-bar"><div className="barcol">
                <div className="slabels">
                  <span className="sl hi" style={{ width: `${bars.thu.hi}%` }}><span className="snm">Còn thu khách hàng</span><span className="sn">{fmt(f.remaining)}<span className="den">/{fmt(f.contract)}</span></span></span>
                  <span className="sl" style={{ width: `${bars.thu.l}%` }}><span className="snm">Đã thu</span><span className="sn">{fmt(f.collected)}</span></span>
                </div>
                <div className="thinbar"><span className="tf hi" style={{ width: `${bars.thu.hi}%` }} /><span className="tf l" style={{ width: `${bars.thu.l}%` }} /></div>
              </div></div>
            </div>
          </div>

          {/* 2 · Biên lợi nhuận dự kiến */}
          <div className="vb">
            <div className="vb-btn">
              <div className="vb-bar"><div className="barcol">
                <div className="slabels">
                  <span className="sl hi" style={{ width: `${bars.ln.hi}%` }}><span className="snm">Biên LN dự kiến</span><span className="sn">{fmtSigned(f.grossMargin)}<span className="den">/{fmt(f.contract)}</span></span></span>
                  <span className="sl" style={{ width: `${bars.ln.m}%` }}><span className="snm">Đã chi</span><span className="sn">{fmt(f.spent)}</span></span>
                  <span className="sl" style={{ width: `${bars.ln.l}%` }}><span className="snm">Còn chi</span><span className="sn">{fmt(f.remainingSpend)}</span></span>
                </div>
                <div className="thinbar"><span className="tf hi" style={{ width: `${bars.ln.hi}%` }} /><span className="tf m" style={{ width: `${bars.ln.m}%` }} /><span className="tf l" style={{ width: `${bars.ln.l}%` }} /></div>
              </div></div>
            </div>
          </div>

          {/* 3 · Thặng dư dự toán — CHỜ dữ liệu tiến độ công tác */}
          <div className="vb wait">
            <div className="vb-btn">
              <div className="vb-bar"><div className="barcol">
                <div className="slabels">
                  <span className="sl hi" style={{ width: "0.1%" }}><span className="snm">Thặng dư dự toán</span><span className="sn">—<span className="den">/{fmt(f.budgetCost)}</span></span></span>
                  <span className="sl" style={{ width: `${bars.td.m}%` }}><span className="snm">Đã chi</span><span className="sn">{fmt(f.spent)}</span></span>
                  <span className="sl" style={{ width: `${bars.td.l}%` }}><span className="snm">Còn chi</span><span className="sn">{fmt(f.remainingSpend)}</span></span>
                </div>
                <div className="thinbar"><span className="tf hi" style={{ width: "0.1%", minWidth: 3 }} /><span className="tf m" style={{ width: `${bars.td.m}%` }} /><span className="tf l" style={{ width: `${bars.td.l}%` }} /></div>
                <div className="waitnote">Chờ dữ liệu tiến độ theo công tác</div>
              </div></div>
            </div>
          </div>

          {/* 4 · Dòng tiền dự án */}
          <div className="vb">
            <div className="vb-btn">
              <div className="vb-bar"><div className="barcol">
                <div className="slabels">
                  <span className="sl hi" style={{ width: `${bars.cash.hi}%` }}><span className="snm">Dòng tiền dự án</span><span className="sn">{fmtSigned(f.cashFlow)}<span className="den">/{fmt(f.collected)}</span></span></span>
                  <span className="sl" style={{ width: `${bars.cash.m}%` }}><span className="snm">Đã chi</span><span className="sn">{fmt(f.spent)}</span></span>
                </div>
                <div className="thinbar"><span className="tf hi" style={{ width: `${bars.cash.hi}%` }} /><span className="tf m" style={{ width: `${bars.cash.m}%` }} /></div>
              </div></div>
            </div>
          </div>
        </div>

        {/* ── TIẾN ĐỘ ── */}
        <div className="phead"><span className="pn">Tiến độ thi công</span></div>
        <div className="card">
          <div className="ovp">
            <div className="ovp-top"><span className="ovp-n">Tổng tiến độ dự án</span><span className="ovp-pc">{data.progress.pct}%</span></div>
            <div className="bar"><i style={{ width: `${clampW(data.progress.pct)}%` }} /></div>
            <div className="ovp-meta">
              {data.payments.lastMilestone ? (<><span>Mốc <b>{data.payments.lastMilestone}</b> xong</span><span className="d">·</span></>) : null}
              <span><b>{data.payments.doneInstallments}/{data.payments.totalInstallments}</b> đợt thu</span>
              {p.daysLeft != null ? (<><span className="d">·</span><span>Còn <b>{p.daysLeft} ngày</b></span></>) : null}
              {p.endDate ? (<><span className="d">·</span><span>Bàn giao <b>{ddmm(p.endDate)}</b></span></>) : null}
            </div>
          </div>
        </div>

        {/* ── CƠ CẤU CHI PHÍ ── */}
        <div className="phead"><span className="pn">Cơ cấu chi phí</span><Link href={`${base}/finance`}>Chi tiết →</Link></div>
        <div className="card cost">
          <div className="split">
            {f.costBreakdown.map((c, i) => (<span key={c.name} style={{ width: `${clampW(pct(c.amount, spentTotal))}%`, background: COST_COLORS[i % COST_COLORS.length] }} />))}
          </div>
          <div className="lgd">
            {f.costBreakdown.map((c, i) => (
              <div className="li" key={c.name}><span className="dot" style={{ background: COST_COLORS[i % COST_COLORS.length] }} />{c.name}<span className="num">{fmt(c.amount)}</span></div>
            ))}
          </div>
        </div>

        {/* ── PHÂN HỆ ── */}
        <div className="phead"><span className="pn">Phân hệ dự án</span></div>
        <div className="tiles">
          {tiles.map((t) => (
            <Link className="tile" href={t.href} key={t.href}>
              <div className="tt"><span className="ic">{t.emoji}</span>{t.badge ? <span className={`badge ${t.badge.cls}`}>{t.badge.text}</span> : null}</div>
              <div className="nm">{t.name}</div>{t.sub ? <div className="st">{t.sub}</div> : null}
            </Link>
          ))}
        </div>

        {/* ── NHẬT KÝ ── */}
        <div className="phead"><span className="pn">Nhật ký thi công</span></div>
        <div className="card">
          <div className="feed">
            {data.diary.length === 0 ? (
              <div className="fi"><span className="fdot" /><div><div className="tx">Chưa có nhật ký</div></div><span className="tm" /></div>
            ) : data.diary.map((d, i) => (
              <div className="fi" key={i}>
                <span className={`fdot${d.issues ? " warn" : ""}`} />
                <div>
                  <div className="tx"><b>Công việc</b> {d.tasks?.trim() || "—"}</div>
                  <div className="mt">{d.workers != null ? `${d.workers} thợ` : ""}{d.issues ? `${d.workers != null ? " · " : ""}Vướng: ${d.issues}` : ""}</div>
                </div>
                <span className="tm">{ddmm(d.date)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="foot">TỔNG QUAN · {p.code}</div>
      </div>

      {aiOn ? (
        <div className="aiov show">
          <div className="aihd"><b>🤖 Trợ lý dự án · {p.name}</b><button className="x" onClick={() => setAiOn(false)} type="button" aria-label="Đóng">✕</button></div>
          {aiSrc ? <iframe src={aiSrc} title="Trợ lý AI" allow="clipboard-write; clipboard-read" /> : null}
        </div>
      ) : null}
    </div>
  );
}
