"use client";

import Link from "next/link";
import { plexSans, plexMono } from "@/lib/fonts";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import "./dong-tien.css";

type Term = "no_ngay" | "tra_ngay" | "sau_nghiem_thu";
type Item = {
  k: string;
  loai: "native" | "item" | "chunk" | "line" | "ro";
  huong: "in" | "out";
  ten: string;
  phu: string | null;
  du_an: string | null;
  ngay: string | null;
  uoc: boolean;
  tien: number;
  src: { op?: string; id?: string } | null;
};
type Week = { start: string; end: string; in: number; out: number; endBalance: number; items: Item[] };
type Month = { ym: string; label: string; in: number; out: number; endBalance: number; weeks: Week[] };
type Line = {
  id: string;
  kind: "vat_tu" | "nhan_cong" | "du_phong" | "khac";
  sectionName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  title: string;
  term: Term;
  baseDate: string;
  dueDate: string;
  dateManual: boolean;
  amount: number;
  consumed: number;
  remaining: number;
  note: string | null;
};
type Data = {
  plan: {
    exists: boolean;
    status: "draft" | "locked" | null;
    contingencyPct: number;
    receiptDelayDays: number;
    leadDays: number;
    generatedAt: string | null;
    lockedAt: string | null;
  };
  project: { startDate: string; expectedEndDate: string; contractValue: number };
  lines: Line[];
  suppliers: { id: string; name: string; paymentTerm: Term; creditDays: number; lines: number; amount: number }[];
  sectionsMissingDates: string[];
  hasSubContracts: boolean;
  thu: { total: number; dated: number; undated: number };
  totals: { forecastOut: number; actualOut: number; in: number };
  calendar: {
    today: string;
    horizonEnd: string;
    qua: { in: number; out: number; items: Item[] };
    chuaNgay: Item[];
    months: Month[];
    tuanAm: { start: string; end: string; endBalance: number }[];
    totals: { in: number; out: number };
  };
};

const TERM_LABEL: Record<Term, string> = {
  no_ngay: "Công nợ",
  tra_ngay: "Trả ngay",
  sau_nghiem_thu: "Trả sau khi xong",
};
const fmt = (n: number) => `${Math.round(n).toLocaleString("vi-VN")} đ`;
const fmtK = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(2)} tỷ` : a >= 1e6 ? `${Math.round(a / 1e6)} tr` : `${Math.round(a / 1e3)} k`;
  return (n < 0 ? "−" : "") + s;
};
const THU = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const isoAdd = (iso: string, days: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const dmy = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "—");
const dmyFull = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "—");

export function DongTienClient({
  projectId,
  projectCode,
  projectName,
  canEdit,
}: {
  projectId: string;
  projectCode: string;
  projectName: string;
  canEdit: boolean;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [openWeek, setOpenWeek] = useState<string | null>(null);
  const [showNcc, setShowNcc] = useState(false);
  const [showQua, setShowQua] = useState(false);
  const [editLine, setEditLine] = useState<Line | null>(null);
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
      const res = await fetch(`/api/projects/${projectId}/dong-tien`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      toast.error("Không tải được kế hoạch dòng tiền");
    } finally {
      setLoading(false);
    }
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

  const post = useCallback(
    async (body: Record<string, unknown>, okMsg?: string) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/dong-tien`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.message || "Lỗi");
        if (okMsg) toast.success(okMsg);
        if (Array.isArray(j?.warnings)) j.warnings.forEach((w: string) => toast.warning(w, { duration: 7000 }));
        await load();
        return true;
      } catch (e) {
        toast.error(e instanceof Error && e.message ? e.message : "Lỗi");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [projectId, load],
  );

  const locked = data?.plan.status === "locked";
  const lineById = useMemo(() => new Map((data?.lines ?? []).map((l) => [l.id, l])), [data]);
  const fontVars = `${plexSans.variable} ${plexMono.variable}`;

  const regen = async () => {
    if (!confirm("Tạo lại kế hoạch từ dự toán + tiến độ? Số tiền các dòng sẽ tính lại; ngày sếp đã sửa tay được giữ."))
      return;
    await post({ op: "regen" }, "Đã tạo kế hoạch dòng tiền");
  };
  const setHeader = (patch: Record<string, unknown>) => post({ op: "header", ...patch });

  const openItem = (it: Item) => {
    if (!canEdit || it.loai !== "line" || !it.src?.id) return;
    const l = lineById.get(it.src.id);
    if (l) setEditLine(l);
  };

  const Row = ({ it }: { it: Item }) => (
    <div
      className={`dt-item${it.uoc ? " uoc" : ""}${canEdit && it.loai === "line" ? " clickable" : ""}`}
      onClick={() => openItem(it)}
      role={canEdit && it.loai === "line" ? "button" : undefined}
    >
      <span className="dt-item-d num">{dmy(it.ngay)}</span>
      <span className="dt-item-t">
        <b>{it.ten}</b>
        {it.phu ? <small>{it.phu}</small> : null}
        {it.uoc ? <em>ước tính</em> : null}
      </span>
      <span className={`dt-item-m num ${it.huong}`}>
        {it.huong === "in" ? "+" : "−"}
        {fmtK(it.tien)}
      </span>
    </div>
  );

  return (
    <>
      <div className={`dtdoc ${fontVars} -mx-4 -mt-4 md:-mx-6 md:-mt-6`} data-theme={theme}>
        <div className="dt-inner">
          <div className="dt-titlebar">
            <div>
              <Link href={`/projects/${projectId}`} className="dt-back">
                ← {projectName}
              </Link>
              <div className="dt-eyebrow">
                {projectCode} · {projectName}
              </div>
              <h1 className="dt-h1">
                Kế hoạch dòng tiền
                {locked ? <span className="dt-lock on">🔒 Đã khoá</span> : <span className="dt-lock">✎ Nháp</span>}
              </h1>
            </div>
            <button className="dt-iconbtn" onClick={toggleTheme} title="Đổi nền">
              {theme === "dark" ? "☀" : "☾"}
            </button>
          </div>

          {loading && !data ? <p className="dt-empty">Đang tải…</p> : null}

          {data ? (
            <>
              <section className="dt-kpis">
                <div className="dt-kpi">
                  <label>Chi dự báo (chưa có đơn)</label>
                  <strong className="num accent">{fmt(data.totals.forecastOut)}</strong>
                  <small>{data.lines.length} dòng từ dự toán</small>
                </div>
                <div className="dt-kpi">
                  <label>Chi đã có nguồn</label>
                  <strong className="num tot">{fmt(data.totals.actualOut)}</strong>
                  <small>đơn mua · thầu phụ · công nợ</small>
                </div>
                <div className="dt-kpi">
                  <label>Thu dự kiến</label>
                  <strong className="num ok">{fmt(data.totals.in)}</strong>
                  <small>{data.thu.undated > 0 ? `${fmt(data.thu.undated)} chưa có ngày` : "đợt thu HĐ"}</small>
                </div>
                <div className="dt-kpi">
                  <label>Thu − Chi (cả kỳ)</label>
                  <strong className={`num ${data.totals.in - data.totals.forecastOut - data.totals.actualOut < 0 ? "over" : "ok"}`}>
                    {fmt(data.totals.in - data.totals.forecastOut - data.totals.actualOut)}
                  </strong>
                  <small>
                    {dmyFull(data.project.startDate)} → {dmyFull(data.project.expectedEndDate)}
                  </small>
                </div>
              </section>

              {!data.plan.exists || data.lines.length === 0 ? (
                <div className="dt-note warn">
                  Chưa có kế hoạch dòng tiền. Bấm <b>Tạo từ dự toán</b>: vật tư theo PHẦN × NCC × điều khoản thanh toán,
                  khoán NC trả khi xong phần, thu theo đợt HĐ.
                </div>
              ) : null}
              {data.sectionsMissingDates.length ? (
                <div className="dt-note warn">
                  PHẦN chưa có tiến độ dự kiến (tạm lấy ngày dự án): {data.sectionsMissingDates.join(", ")} —{" "}
                  <Link href={`/projects/${projectId}/tien-do`}>đặt ở Tiến độ ›</Link>
                </div>
              ) : null}
              {data.calendar.tuanAm.length ? (
                <div className="dt-note bad">
                  {data.calendar.tuanAm.length} tuần dòng tiền dự án ÂM (chi trước thu), thấp nhất{" "}
                  <b className="num">{fmtK(Math.min(...data.calendar.tuanAm.map((w) => w.endBalance)))}</b> tuần{" "}
                  {dmy(data.calendar.tuanAm.reduce((a, b) => (a.endBalance < b.endBalance ? a : b)).start)}. Cân nhắc lùi ngày
                  trả NCC / xin thu sớm.
                </div>
              ) : null}

              {canEdit ? (
                <section className="dt-settings">
                  <label>
                    Dự phòng
                    <span>
                      <input
                        type="number"
                        min={0}
                        max={50}
                        step={0.5}
                        className="num"
                        defaultValue={data.plan.contingencyPct}
                        disabled={locked || busy}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== data.plan.contingencyPct) void setHeader({ contingencyPct: v });
                        }}
                      />
                      % VT
                    </span>
                  </label>
                  <label>
                    Khách trễ
                    <span>
                      <input
                        type="number"
                        min={0}
                        max={90}
                        className="num"
                        defaultValue={data.plan.receiptDelayDays}
                        disabled={locked || busy}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== data.plan.receiptDelayDays) void setHeader({ receiptDelayDays: v });
                        }}
                      />
                      ngày
                    </span>
                  </label>
                  <label>
                    Đặt hàng trước
                    <span>
                      <input
                        type="number"
                        min={0}
                        max={60}
                        className="num"
                        defaultValue={data.plan.leadDays}
                        disabled={locked || busy}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== data.plan.leadDays) void setHeader({ leadDays: v });
                        }}
                      />
                      ngày
                    </span>
                  </label>
                  <div className="dt-actions">
                    <button className="dt-btn" disabled={locked || busy} onClick={regen}>
                      ↻ Tạo từ dự toán
                    </button>
                    {locked ? (
                      <button className="dt-btn" disabled={busy} onClick={() => setHeader({ status: "draft" })}>
                        🔓 Mở khoá
                      </button>
                    ) : (
                      <button
                        className="dt-btn solid"
                        disabled={busy || data.lines.length === 0}
                        onClick={() => {
                          if (confirm("Khoá kế hoạch dòng tiền? Sau khi khoá mới chốt được mục GĐ 5 Chuẩn bị.")) void setHeader({ status: "locked" });
                        }}
                      >
                        🔒 Khoá
                      </button>
                    )}
                  </div>
                </section>
              ) : null}

              {/* Lịch tháng → tuần → chi tiết */}
              <section className="dt-cal">
                <div className="dt-cal-head">
                  <span>Lịch dòng tiền theo tháng</span>
                  <small>
                    đến {dmyFull(data.calendar.horizonEnd)} · bấm tuần để xem chi tiết
                  </small>
                </div>
                {data.calendar.qua.items.length ? (
                  <div className="dt-month">
                    <button type="button" className="dt-month-h qua" onClick={() => setShowQua((v) => !v)}>
                      <b>Trước tuần này · {data.calendar.qua.items.length} món</b>
                      <span className="num in">+{fmtK(data.calendar.qua.in)}</span>
                      <span className="num out">−{fmtK(data.calendar.qua.out)}</span>
                      <span className="dt-chev">{showQua ? "▴" : "▾"}</span>
                    </button>
                    {showQua ? <div className="dt-items">{data.calendar.qua.items.map((it) => <Row key={it.k} it={it} />)}</div> : null}
                  </div>
                ) : null}
                <div className="dt-months">
                  {data.calendar.months.map((m) => (
                    <div className="dt-month" key={m.ym}>
                      <div className="dt-month-h">
                        <b>{m.label}</b>
                        <span className="num in">+{fmtK(m.in)}</span>
                        <span className="num out">−{fmtK(m.out)}</span>
                        <span className={`dt-bal num${m.endBalance < 0 ? " neg" : ""}`} title="Luỹ kế cuối tháng">
                          {fmtK(m.endBalance)}
                        </span>
                      </div>
                      <div className="dt-cal" role="grid">
                        {THU.map((t) => <div className="dt-dh" key={t}>{t}</div>)}
                        <div className="dt-dh du">Dư cuối tuần</div>
                        {m.weeks.map((w) => {
                          const key = w.start;
                          const open = openWeek === key;
                          const isNow = data.calendar.today >= w.start && data.calendar.today <= w.end;
                          const byDay = new Map<string, { in: number; out: number }>();
                          for (const it of w.items) {
                            if (!it.ngay) continue;
                            const x = byDay.get(it.ngay) ?? { in: 0, out: 0 };
                            x[it.huong] += it.tien;
                            byDay.set(it.ngay, x);
                          }
                          const days = Array.from({ length: 7 }, (_, k) => isoAdd(w.start, k));
                          return (
                            <Fragment key={key}>
                              <div
                                role="row"
                                tabIndex={0}
                                className={`dt-wk${open ? " open" : ""}${isNow ? " now" : ""}`}
                                title="Bấm xem chi tiết tuần"
                                onClick={() => setOpenWeek(open ? null : key)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setOpenWeek(open ? null : key);
                                  }
                                }}
                              >
                                {days.map((d) => {
                                  const x = byDay.get(d);
                                  const today = d === data.calendar.today;
                                  return (
                                    <div key={d}>
                                      <div className={`dt-d${d.slice(0, 7) !== m.ym ? " ngoai" : ""}${today ? " nay" : ""}`}>
                                        {today ? <b>{Number(d.slice(8, 10))}</b> : Number(d.slice(8, 10))}
                                      </div>
                                      {x?.in ? <span className="dt-a in">+{fmtK(x.in)}</span> : null}
                                      {x?.out ? <span className="dt-a out">−{fmtK(x.out)}</span> : null}
                                    </div>
                                  );
                                })}
                                <div className={`dt-du${w.endBalance < 0 ? " neg" : ""}`}>
                                  {fmtK(w.endBalance)}
                                  <small>{w.items.length ? `${w.items.length} món` : "—"}</small>
                                </div>
                              </div>
                              {open ? (
                                <div className="dt-wd">
                                  <div className="dt-wh">
                                    Tuần {dmy(w.start)}–{dmy(w.end)}
                                    {isNow ? " (tuần này)" : ""} · thu +{fmt(w.in)} · chi −{fmt(w.out)} · dư cuối tuần <b>{fmt(w.endBalance)}</b>
                                  </div>
                                  <div className="dt-items">
                                    {w.items.length ? w.items.map((it) => <Row key={it.k} it={it} />) : <p className="dt-empty">Không có thu/chi tuần này</p>}
                                  </div>
                                </div>
                              ) : null}
                            </Fragment>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {data.calendar.chuaNgay.length ? (
                  <div className="dt-month">
                    <div className="dt-month-h qua">
                      <b>Chưa có ngày · {data.calendar.chuaNgay.length} món</b>
                      <span className="num out">
                        {fmtK(data.calendar.chuaNgay.reduce((s, i) => s + (i.huong === "in" ? i.tien : -i.tien), 0))}
                      </span>
                    </div>
                    <div className="dt-items">{data.calendar.chuaNgay.map((it) => <Row key={it.k} it={it} />)}</div>
                  </div>
                ) : null}
              </section>

              {/* Điều khoản NCC */}
              {data.suppliers.length ? (
                <section className="dt-ncc">
                  <button type="button" className="dt-cal-head asbtn" onClick={() => setShowNcc((v) => !v)}>
                    <span>Điều khoản thanh toán NCC ({data.suppliers.length})</span>
                    <small>{showNcc ? "thu gọn ▴" : "mở ▾"}</small>
                  </button>
                  {showNcc ? (
                    <table className="dt-table">
                      <thead>
                        <tr>
                          <th>NCC</th>
                          <th>Điều khoản</th>
                          <th className="r">Nợ (ngày)</th>
                          <th className="r">Dự toán</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.suppliers.map((s) => (
                          <tr key={s.id}>
                            <td>{s.name}</td>
                            <td>
                              {canEdit && !locked ? (
                                <select
                                  value={s.paymentTerm}
                                  disabled={busy}
                                  onChange={(e) =>
                                    void post(
                                      { op: "supplier_term", supplierId: s.id, paymentTerm: e.target.value, creditDays: s.creditDays },
                                      "Đã đổi điều khoản + tính lại",
                                    )
                                  }
                                >
                                  {(Object.keys(TERM_LABEL) as Term[]).map((t) => (
                                    <option key={t} value={t}>
                                      {TERM_LABEL[t]}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                TERM_LABEL[s.paymentTerm]
                              )}
                            </td>
                            <td className="r num">
                              {s.paymentTerm !== "no_ngay" ? (
                                "—"
                              ) : canEdit && !locked ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={180}
                                  className="num"
                                  defaultValue={s.creditDays}
                                  disabled={busy}
                                  onBlur={(e) => {
                                    const v = Number(e.target.value);
                                    if (v !== s.creditDays)
                                      void post({ op: "supplier_term", supplierId: s.id, paymentTerm: s.paymentTerm, creditDays: v }, "Đã đổi số ngày nợ");
                                  }}
                                />
                              ) : (
                                s.creditDays
                              )}
                            </td>
                            <td className="r num">{fmtK(s.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                </section>
              ) : null}
              <p className="dt-foot">
                Nguyên tắc: vật tư NCC công nợ → trả sau khi giao N ngày (mặc định 14); vật tư mua 1 lần (tôn, sắt kèo…) trả ngay;
                NCC hoàn thiện (thạch cao, cửa nhôm, lan can…) trả sau khi làm xong. Đơn mua thật của NCC nào trừ dần vào dự báo NCC đó.
                {data.hasSubContracts ? " Nhân công theo đợt HĐ thầu phụ." : " Nhân công khoán: trả khi xong phần (chưa có HĐ khoán)."}
              </p>
            </>
          ) : null}
        </div>
      </div>

      {mounted && editLine
        ? createPortal(
            <LineSheet
              line={editLine}
              theme={theme}
              fontVars={fontVars}
              busy={busy}
              locked={!!locked}
              onClose={() => setEditLine(null)}
              onSave={async (patch) => {
                const ok = await post({ op: "line", id: editLine.id, ...patch }, "Đã lưu");
                if (ok) setEditLine(null);
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function LineSheet({
  line,
  theme,
  fontVars,
  busy,
  locked,
  onClose,
  onSave,
}: {
  line: Line;
  theme: string;
  fontVars: string;
  busy: boolean;
  locked: boolean;
  onClose: () => void;
  onSave: (patch: { dueDate?: string; amount?: number; term?: Term; note?: string | null }) => Promise<void>;
}) {
  const [dueDate, setDueDate] = useState(line.dueDate);
  const [amount, setAmount] = useState(String(Math.round(line.amount)));
  const [term, setTerm] = useState<Term>(line.term);
  const [note, setNote] = useState(line.note ?? "");
  return (
    <div className={`dtdoc dt-portal ${fontVars}`} data-theme={theme}>
      <div className="dt-sheet-scrim" onClick={() => !busy && onClose()} />
      <div className="dt-sheet" role="dialog" aria-modal="true">
        <div className="dt-sheet-grip" />
        <div className="dt-sheet-head">
          <div>
            <div className="dt-modal-eyebrow">
              {line.sectionName ?? "Chưa gắn phần"} {line.supplierName ? `· ${line.supplierName}` : ""}
            </div>
            <b>{line.title}</b>
          </div>
          <button className="dt-iconbtn" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>
        <div className="dt-sheet-body">
          <div className="dt-field">
            <span>Ngày trả</span>
            <input type="date" className="num" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <small>
              Gốc {dmyFull(line.baseDate)} · {line.dateManual ? "đã sửa tay" : "tính từ tiến độ"}
            </small>
          </div>
          <div className="dt-field">
            <span>Số tiền dự báo</span>
            <input type="number" className="num" min={0} step={1000} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={locked} />
            <small>
              {line.consumed > 0 ? `Đã có đơn thật ${fmt(line.consumed)} · còn ${fmt(line.remaining)}` : "Chưa có đơn thật trừ vào"}
            </small>
          </div>
          <div className="dt-field">
            <span>Điều khoản</span>
            <select value={term} onChange={(e) => setTerm(e.target.value as Term)} disabled={locked}>
              {(Object.keys(TERM_LABEL) as Term[]).map((t) => (
                <option key={t} value={t}>
                  {TERM_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="dt-field">
            <span>Ghi chú</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div className="dt-sheet-foot">
          <button className="dt-btn" onClick={onClose} disabled={busy}>
            Huỷ
          </button>
          <button
            className="dt-btn solid"
            disabled={busy || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)}
            onClick={() =>
              void onSave({
                dueDate,
                ...(locked ? {} : { amount: Math.max(0, Number(amount) || 0), term }),
                note: note.trim() || null,
              })
            }
          >
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
