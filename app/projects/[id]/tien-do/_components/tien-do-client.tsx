"use client";

import { plexSans, plexMono } from "@/lib/fonts";
import Link from "next/link";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./tien-do.css";


type Task = {
  refType: "budget";
  refId: string; // = tên dòng ngân sách
  sectionId: string | null; // section khớp tên (để set ngày dự kiến)
  groupKey: string; // kind ("tho"…)
  groupLabel: string; // "Thô" / "Hoàn thiện" / …
  name: string;
  amount: number; // ngân sách
  bought: number; // đã mua thực tế (đã chi + công nợ)
  percent: number; // thực tế
  done: boolean;
  planStart: string | null; // dự kiến
  planEnd: string | null;
};

const fmt = (n: number) => Math.round(n || 0).toLocaleString("vi-VN");

// % DỰ KIẾN hôm nay theo khoảng ngày kế hoạch (nội suy tuyến tính)
const plannedPct = (t: { planStart: string | null; planEnd: string | null }): number => {
  if (!t.planStart || !t.planEnd) return 0;
  const s = Date.parse(t.planStart);
  const e = Date.parse(t.planEnd);
  const n = Date.now();
  if (!(e > s)) return n >= e ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(((n - s) / (e - s)) * 100)));
};
const keyOf = (t: { refType: string; refId: string }) => `${t.refType}|${t.refId}`;

export function TienDoClient({
  projectId,
  projectCode,
  projectName,
  projectAddress,
}: {
  projectId: string;
  projectCode: string;
  projectName: string;
  projectAddress?: string | null;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [uncataloged, setUncataloged] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("dark"); // mặc định tối
  const [view, setView] = useState<"list" | "gantt">("list"); // PC auto → gantt
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // PC (rộng ≥1024) auto hiện Gantt; mobile giữ danh sách. Người dùng đổi được bằng nút.
  useEffect(() => {
    try {
      if (window.matchMedia("(min-width: 1024px)").matches) setView("gantt");
    } catch {
      /* noop */
    }
  }, []);

  // Nền tối mặc định; nhớ lựa chọn của người dùng.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("tiendo-theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      /* noop */
    }
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("tiendo-theme", next);
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  const toast = (m: string) => {
    setToastMsg(m);
    window.setTimeout(() => setToastMsg(null), 2000);
  };

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/projects/${projectId}/tien-do`, { cache: "no-store" });
        if (!r.ok) throw new Error("Không đọc được tiến độ");
        const j = await r.json();
        setTasks(Array.isArray(j.tasks) ? j.tasks : []);
        setUncataloged(j.uncataloged || 0);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Lỗi tải");
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  // Tổng earned value (tính tại client cho mượt).
  const total = useMemo(() => {
    let amt = 0;
    let earned = 0;
    let planned = 0;
    let bought = 0;
    let doneCnt = 0;
    let hasPlan = false;
    tasks.forEach((t) => {
      amt += t.amount;
      earned += (t.percent / 100) * t.amount;
      planned += (plannedPct(t) / 100) * t.amount;
      bought += t.bought;
      if (t.done) doneCnt += 1;
      if (t.planStart && t.planEnd) hasPlan = true;
    });
    return {
      amt,
      earned,
      planned,
      bought,
      pct: amt > 0 ? Math.round((earned / amt) * 100) : 0,
      planPct: amt > 0 ? Math.round((planned / amt) * 100) : 0,
      doneCnt,
      hasPlan,
    };
  }, [tasks]);

  // Tween số tiền hoàn thành: bám theo target khi kéo thanh → chạy mượt.
  const [dispEarned, setDispEarned] = useState(0);
  const targetRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    targetRef.current = total.earned;
    if (rafRef.current != null) return;
    const step = () => {
      setDispEarned((prev) => {
        const t = targetRef.current;
        const d = t - prev;
        if (Math.abs(d) < 1000) {
          rafRef.current = null;
          return t;
        }
        rafRef.current = requestAnimationFrame(step);
        return prev + d * 0.2; // ease-follow
      });
    };
    rafRef.current = requestAnimationFrame(step);
  }, [total.earned]);
  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);
  const dispPct = total.amt > 0 ? Math.round((dispEarned / total.amt) * 100) : 0;

  const groups = useMemo(() => {
    const map = new Map<string, { groupKey: string; groupLabel: string; items: Task[] }>();
    for (const t of tasks) {
      const g = map.get(t.groupKey);
      if (g) g.items.push(t);
      else map.set(t.groupKey, { groupKey: t.groupKey, groupLabel: t.groupLabel, items: [t] });
    }
    return Array.from(map.values());
  }, [tasks]);

  const save = useCallback(
    async (t: Task, patch: { percent?: number; done?: boolean }) => {
      const r = await fetch(`/api/projects/${projectId}/tien-do`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refType: t.refType, refId: t.refId, ...patch }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        toast(j.message || "Lưu lỗi");
      }
    },
    [projectId],
  );

  // Kéo % → cập nhật local ngay (tiền tween theo), debounce PATCH.
  const setPercent = (t: Task, percent: number) => {
    setTasks((prev) =>
      prev.map((x) => (keyOf(x) === keyOf(t) ? { ...x, percent, done: percent >= 100 ? x.done : false } : x)),
    );
    const k = keyOf(t);
    if (timers.current[k]) clearTimeout(timers.current[k]);
    timers.current[k] = setTimeout(() => save({ ...t, percent }, { percent }), 350);
  };

  // Lưu ngày DỰ KIẾN của 1 PHẦN (chỉ refType 'section'), qua API sections.
  const savePlan = async (t: Task, patch: { planStart?: string | null; planEnd?: string | null }) => {
    setTasks((prev) => prev.map((x) => (keyOf(x) === keyOf(t) ? { ...x, ...patch } : x)));
    if (!t.sectionId) {
      toast("Dòng này không gắn PHẦN dự toán — không đặt ngày được");
      return;
    }
    const r = await fetch(`/api/projects/${projectId}/sections/${t.sectionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      toast(j.message || "Lưu ngày lỗi");
    }
  };

  const toggleDone = (t: Task) => {
    const nextDone = !t.done;
    setTasks((prev) =>
      prev.map((x) =>
        keyOf(x) === keyOf(t) ? { ...x, done: nextDone, percent: nextDone ? 100 : x.percent } : x,
      ),
    );
    save(t, { done: nextDone });
    toast(nextDone ? "Đã đánh dấu Xong" : "Mở lại công tác");
  };

  return (
    <div className={`tddoc -mx-4 -mt-4 md:-mx-6 md:-mt-6 ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
      <div className="wrap">
        <div className="topbar">
          <div className="brand">
            <div className="mark">HG</div>
            <div>
              <b>HUỲNH GIA</b>
              <span>Tiến độ thi công</span>
            </div>
          </div>
          <div className="tbtns">
            <button
              className="iconbtn"
              onClick={() => setView((v) => (v === "gantt" ? "list" : "gantt"))}
              type="button"
              aria-label="Đổi danh sách / Gantt"
              title={view === "gantt" ? "Xem danh sách" : "Xem Gantt (lịch)"}
            >
              {view === "gantt" ? "☰" : "📅"}
            </button>
            <button className="iconbtn" onClick={toggleTheme} type="button" aria-label="Đổi nền sáng/tối">
              ◑
            </button>
            <Link href={`/projects/${projectId}`} className="iconbtn" aria-label="Về dự án">
              ‹
            </Link>
          </div>
        </div>

        <div className="eyebrow">Tiến độ · theo phần (HĐTK)</div>
        <h1>{projectName}</h1>
        <div className="meta">
          <span>{projectCode}</span>
          {projectAddress ? (
            <>
              <span className="d">·</span>
              <span>{projectAddress}</span>
            </>
          ) : null}
          <span className="d">·</span>
          <span>
            <span className="num">{tasks.length}</span> phần
          </span>
        </div>

        {/* Tổng tiến độ — thanh thực tế + vạch dự kiến (PV), badge sớm/trễ */}
        <div className="tot">
          <div className="tot-top">
            <span className="tot-n">Tổng tiến độ dự án</span>
            <span className="tot-pc">{loading ? "—" : `${dispPct}%`}</span>
          </div>
          <div className="bar">
            {!loading && total.hasPlan && (
              <span className="planfill" style={{ width: `${Math.max(0, Math.min(100, total.planPct))}%` }} />
            )}
            <i style={{ width: `${Math.max(0, Math.min(100, dispPct))}%` }} />
          </div>
          {!loading && total.hasPlan && (
            <div className="tot-plan">
              <span>
                Dự kiến hôm nay <span className="num">{total.planPct}%</span>
              </span>
              {(() => {
                const d = total.pct - total.planPct;
                const cls = d > 0 ? "ahead" : d < 0 ? "behind" : "ontime";
                const txt = d > 0 ? `Sớm ${d}%` : d < 0 ? `Trễ ${-d}%` : "Đúng tiến độ";
                return <span className={`schedbadge ${cls}`}>{txt}</span>;
              })()}
            </div>
          )}
          <div className="tot-m">
            <span>
              Giá trị hoàn thành <span className="num">{loading ? "…" : fmt(dispEarned)}</span> đ
            </span>
            <span>
              Đã mua <span className="num">{loading ? "…" : fmt(total.bought)}</span> đ
            </span>
            <span>
              Ngân sách <span className="num">{loading ? "…" : fmt(total.amt)}</span> đ
            </span>
          </div>
        </div>

        {loading ? (
          <div className="load">Đang tải công tác…</div>
        ) : err ? (
          <div className="empty">{err}</div>
        ) : !tasks.length ? (
          <div className="empty">
            <div className="ic">📊</div>
            Chưa có PHẦN nào. Vào Dự toán → “Quản lý phần” tạo theo HĐTK trước.
          </div>
        ) : view === "gantt" ? (
          <GanttView tasks={tasks} />
        ) : (
          <>
            {groups.map((g) => {
              const dn = g.items.filter((x) => x.done).length;
              const gAmt = g.items.reduce((s, x) => s + x.amount, 0);
              const gEarned = g.items.reduce((s, x) => s + (x.percent / 100) * x.amount, 0);
              return (
                <div key={g.groupKey} className="sec">
                  <div className="phead">
                    <span className="pc">{g.groupLabel}</span>
                    <span className="pnm" />
                    <span className="pr">
                      <span className="pr-m num">
                        {fmt(gEarned)}<span className="pr-den"> / {fmt(gAmt)} đ</span>
                      </span>
                      <span className="pr-d">{dn > 0 ? `${dn}/${g.items.length} xong` : `${g.items.length} phần`}</span>
                    </span>
                  </div>
                  {g.items.map((t) => (
                    <div key={keyOf(t)} className={`row${t.done ? " done" : ""}`}>
                      <div className="rtop">
                        <div className="rl">
                          <span className="rnm">{t.name}</span>
                        </div>
                        <span className="ramt num">
                          <b>{fmt((t.percent / 100) * t.amount)}</b>
                          <span className="ramt-den"> / {fmt(t.amount)} NS</span>
                        </span>
                      </div>
                      <div className="rbuy">
                        <span>
                          Đã mua <b className={`num${t.bought > t.amount ? " over" : ""}`}>{fmt(t.bought)}</b> đ
                          {t.bought > t.amount ? " · vượt NS" : ""}
                        </span>
                      </div>
                      <div className="rctl">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={t.percent}
                          onChange={(e) => setPercent(t, Number(e.target.value))}
                          aria-label={`Tiến độ ${t.name}`}
                        />
                        <span className="rpct">{t.percent}%</span>
                        <button
                          type="button"
                          className={`dn${t.done ? " on" : ""}`}
                          onClick={() => toggleDone(t)}
                        >
                          {t.done ? "✓ Xong" : "Xong"}
                        </button>
                      </div>
                      {t.sectionId && (
                        <div className="rplan">
                          <span className="rplan-l">Dự kiến</span>
                          <input
                            type="date"
                            value={t.planStart ?? ""}
                            onChange={(e) => savePlan(t, { planStart: e.target.value || null })}
                            aria-label={`Ngày bắt đầu ${t.name}`}
                          />
                          <span className="arr">→</span>
                          <input
                            type="date"
                            value={t.planEnd ?? ""}
                            onChange={(e) => savePlan(t, { planEnd: e.target.value || null })}
                            aria-label={`Ngày kết thúc ${t.name}`}
                          />
                          {t.planStart && t.planEnd
                            ? (() => {
                                const pv = plannedPct(t);
                                const d = t.percent - pv;
                                const cls = d > 0 ? "ahead" : d < 0 ? "behind" : "ontime";
                                const txt = d > 0 ? `sớm ${d}%` : d < 0 ? `trễ ${-d}%` : "đúng";
                                return <span className={`rsched ${cls}`}>DK {pv}% · {txt}</span>;
                              })()
                            : null}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
            {uncataloged > 0 && (
              <div className="note">
                {uncataloged} dòng vật tư chưa gắn phần — không tính vào tiến độ. Gán phần trong Dự toán để hiện ở đây.
              </div>
            )}
          </>
        )}
      </div>

      <div className={`toast${toastMsg ? " show" : ""}`}>{toastMsg}</div>
    </div>
  );
}

// ───────────────────────── GANTT (view PC) ─────────────────────────
// Cột trái = tên PHẦN; trục ngang = ngày chạy hết dự án; mỗi phần 1 thanh theo plan_start→plan_end,
// bên trong tô % thực tế; có vạch "hôm nay".
const DAY = 86400000;
function GanttView({ tasks }: { tasks: Task[] }) {
  const secs = tasks;
  const dated = secs.filter((t) => t.planStart && t.planEnd);
  if (!dated.length)
    return (
      <div className="empty">
        <div className="ic">📅</div>
        Chưa có ngày kế hoạch. Đặt ngày ở view danh sách (nút ☰) — mỗi phần có 2 ô ngày.
      </div>
    );

  const origin = Math.min(...dated.map((t) => Date.parse(t.planStart as string)));
  const end = Math.max(...dated.map((t) => Date.parse(t.planEnd as string)));
  const span = Math.max(DAY, end - origin);
  const totalDays = Math.round(span / DAY);
  const PXD = 15; // px mỗi ngày
  const chartW = totalDays * PXD;
  const posX = (ms: number) => ((ms - origin) / span) * chartW;

  // mốc mỗi tuần, CĂN VÀO CHỦ NHẬT (getUTCDay: 0=CN). Bù ngày từ origin tới CN đầu tiên.
  const startWd = new Date(origin).getUTCDay();
  const firstSun = (7 - startWd) % 7; // số ngày từ origin tới CN đầu tiên
  const gridX0 = firstSun * PXD; // px offset để căn gridline/mốc vào CN
  const ticks: number[] = [];
  for (let d = firstSun; d <= totalDays; d += 7) ticks.push(d);
  const nowMs = Date.now();
  const todayX = nowMs >= origin && nowMs <= end ? posX(nowMs) : null;
  const fmtD = (ms: number) => {
    const d = new Date(ms);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  return (
    <div className="gantt">
      <div className="g-scroll">
        <div
          className="g-inner"
          style={{ width: chartW + 172, "--gw": `${7 * PXD}px`, "--gx": `${gridX0}px` } as unknown as CSSProperties}
        >
          {/* Header trục ngày */}
          <div className="g-headrow">
            <span className="g-corner">Phần</span>
            <div className="g-axis" style={{ width: chartW }}>
              {ticks.map((d) => (
                <span key={d} className="g-tick" style={{ left: d * PXD }}>
                  {fmtD(origin + d * DAY)}
                </span>
              ))}
              {todayX != null && <span className="g-todayhd" style={{ left: todayX }} />}
            </div>
          </div>
          {/* Hàng từng phần */}
          {secs.map((t) => {
            const has = t.planStart && t.planEnd;
            const l = has ? posX(Date.parse(t.planStart as string)) : 0;
            const w = has ? Math.max(8, posX(Date.parse(t.planEnd as string)) - l) : 0;
            const pv = plannedPct(t);
            const late = has && t.percent < pv;
            return (
              <div className="g-row" key={keyOf(t)}>
                <span className="g-name" title={t.name}>
                  {t.name}
                </span>
                <div className="g-lane" style={{ width: chartW }}>
                  {has && (
                    <div
                      className={`g-bar${t.done ? " done" : ""}${late ? " late" : ""}`}
                      style={{ left: l, width: w }}
                      title={`${t.planStart} → ${t.planEnd} · thực tế ${t.percent}% · dự kiến ${pv}% · đã mua ${fmt(t.bought)}/${fmt(t.amount)}đ`}
                    >
                      <span className="g-fill" style={{ width: `${Math.max(0, Math.min(100, t.percent))}%` }} />
                      <span className="g-plab">{t.percent}%</span>
                    </div>
                  )}
                  {todayX != null && <span className="g-today" style={{ left: todayX }} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="g-legend">
        <span><i className="lg-fill" /> Thực tế</span>
        <span><i className="lg-bar" /> Khoảng dự kiến</span>
        <span><i className="lg-late" /> Đang trễ</span>
        <span><i className="lg-today" /> Hôm nay</span>
      </div>
    </div>
  );
}
