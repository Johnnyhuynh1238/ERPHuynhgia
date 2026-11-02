"use client";

import { plexSans, plexMono } from "@/lib/fonts";
import Link from "next/link";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./tien-do.css";


type Work = {
  id: string; // id estimate_works
  name: string;
  location: string | null;
  unit: string;
  quantity: number;
  weight: number; // tỉ trọng trong hạng mục (Σ = 1)
  done: boolean;
};

type Task = {
  refType: "line" | "section";
  refId: string; // id dòng ngân sách (line) / id phần chưa có dòng NS (section)
  sectionId: string | null; // phần gắn với dòng (để set ngày dự kiến)
  groupKey: string; // kind ("tho"…)
  groupLabel: string; // "Thô" / "Hoàn thiện" / …
  name: string;
  amount: number; // ngân sách
  bought: number; // đã mua thực tế (đã chi + công nợ)
  percent: number; // thực tế
  done: boolean;
  planStart: string | null; // dự kiến
  planEnd: string | null;
  works: Work[]; // khối lượng con — mark done từng dòng; rỗng → Xong cả hạng mục
};

const fmt = (n: number) => Math.round(n || 0).toLocaleString("vi-VN");

const DAY_MS = 86400000;
// "YYYY-MM-DD" (+n ngày) → "YYYY-MM-DD"
const isoAddDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isoOfMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
// số ngày thi công (bao gồm cả 2 đầu) từ start→end; "" nếu thiếu
const durationDays = (start: string | null, end: string | null): number | "" => {
  if (!start || !end) return "";
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return "";
  return Math.round((e - s) / DAY_MS) + 1;
};

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
const fmtDMY = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
};
// Badge sớm/trễ của 1 hạng mục so với % dự kiến hôm nay.
function SchedBadge({ t }: { t: { planStart: string | null; planEnd: string | null; percent: number } }) {
  if (!t.planStart || !t.planEnd) return null;
  const pv = plannedPct(t);
  const d = t.percent - pv;
  const cls = d > 0 ? "ahead" : d < 0 ? "behind" : "ontime";
  const txt = d > 0 ? `sớm ${d}%` : d < 0 ? `trễ ${-d}%` : "đúng";
  return (
    <span className={`rsched ${cls}`}>
      DK {pv}% · {txt}
    </span>
  );
}
const fmtQty = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString("vi-VN");
// % hạng mục từ KL đã xong (theo tỉ trọng server tính).
const pctOfWorks = (ws: Work[]) => Math.round(ws.reduce((s, w) => s + (w.done ? w.weight : 0), 0) * 100);

export function TienDoClient({
  projectId,
  projectCode,
  projectName,
  projectAddress,
  backHref,
  ks = false,
}: {
  projectId: string;
  projectCode: string;
  projectName: string;
  projectAddress?: string | null;
  backHref?: string;
  ks?: boolean; // màn KS (/ks-ql/sub): ko khung app, ko sửa ngày
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [uncataloged, setUncataloged] = useState(0);
  const [hideMoney, setHideMoney] = useState(ks); // KS ko thấy tiền (server cũng che)
  const [open, setOpen] = useState<Record<string, boolean>>({}); // hạng mục đang mở KL
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("dark"); // mặc định tối
  const [view, setView] = useState<"list" | "gantt">("list"); // PC auto → gantt

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
        setHideMoney(!!j.hideMoney);
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

  // Tween số tiền hoàn thành: bám theo target khi tick → chạy mượt.
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

  const undated = useMemo(() => tasks.filter((t) => !t.planStart || !t.planEnd), [tasks]);

  const groups = useMemo(() => {
    const map = new Map<string, { groupKey: string; groupLabel: string; items: Task[] }>();
    for (const t of tasks) {
      const g = map.get(t.groupKey);
      if (g) g.items.push(t);
      else map.set(t.groupKey, { groupKey: t.groupKey, groupLabel: t.groupLabel, items: [t] });
    }
    return Array.from(map.values());
  }, [tasks]);

  // Lưu mark done (KL hoặc cả hạng mục). Lỗi → trả local về trạng thái cũ.
  const save = useCallback(
    async (ref: { refType: "work" | "line" | "section"; refId: string }, done: boolean, rollback: () => void) => {
      const r = await fetch(`/api/projects/${projectId}/tien-do`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...ref, done }),
      }).catch(() => null);
      if (!r || !r.ok) {
        const j = r ? await r.json().catch(() => ({})) : {};
        rollback();
        toast(j.message || "Lưu lỗi");
      }
    },
    [projectId],
  );

  // Lưu ngày DỰ KIẾN của 1 PHẦN (chỉ refType 'section'), qua API sections.
  const savePlan = async (t: Task, patch: { planStart?: string | null; planEnd?: string | null }) => {
    setTasks((prev) => prev.map((x) => (keyOf(x) === keyOf(t) ? { ...x, ...patch } : x)));
    if (!t.sectionId) {
      toast("Dòng chưa gắn PHẦN — vào Ngân sách chọn “Phần tiến độ” trước");
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

  // Hạng mục KHÔNG có KL con → Xong cả hạng mục. Đã xong là khoá, không mở lại.
  const markDone = (t: Task) => {
    if (t.done) return;
    if (!window.confirm(`Đánh dấu XONG cả hạng mục “${t.name}”?\nĐã xong thì không mở lại được.`)) return;
    const prev = { done: t.done, percent: t.percent };
    const apply = (v: { done: boolean; percent: number }) =>
      setTasks((ts) => ts.map((x) => (keyOf(x) === keyOf(t) ? { ...x, ...v } : x)));
    apply({ done: true, percent: 100 });
    save({ refType: t.refType, refId: t.refId }, true, () => apply(prev));
    toast("Đã đánh dấu Xong");
  };

  // Tick 1 khối lượng → % hạng mục tự tính lại. Đã tick là khoá.
  const markWork = (t: Task, w: Work) => {
    if (w.done) return;
    if (!window.confirm(`Xong khối lượng “${w.name}”?\nĐã xong thì không mở lại được.`)) return;
    const set = (done: boolean) =>
      setTasks((ts) =>
        ts.map((x) => {
          if (keyOf(x) !== keyOf(t)) return x;
          const works = x.works.map((y) => (y.id === w.id ? { ...y, done } : y));
          return { ...x, works, percent: pctOfWorks(works), done: works.every((y) => y.done) };
        }),
      );
    set(true);
    save({ refType: "work", refId: w.id }, true, () => set(false));
  };

  return (
    <div
      className={`tddoc${ks ? "" : " -mx-4 -mt-4 md:-mx-6 md:-mt-6"} ${plexSans.variable} ${plexMono.variable}`}
      data-theme={theme}
    >
      <div className="wrap">
        <div className="topbar">
          <div className="brand">
            <div className="mark">HG</div>
            <div>
              <b>HUỲNH GIA</b>
              <span>Báo cáo tiến độ</span>
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
            <Link href={backHref ?? `/projects/${projectId}`} className="iconbtn" aria-label="Quay lại">
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
            <span className="num">{tasks.length}</span> hạng mục
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
          {hideMoney ? (
            <div className="tot-m">
              <span>
                Xong <span className="num">{total.doneCnt}/{tasks.length}</span> hạng mục
              </span>
            </div>
          ) : (
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
          )}
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
          <>
            {undated.length > 0 && !ks && (
              // Hạng mục thiếu ngày KHÔNG vẽ được trên timeline → báo rõ, không ẩn im lặng.
              <div className="undated">
                <b>⚠ {undated.length} hạng mục chưa hiện trên timeline (chưa có ngày):</b>{" "}
                {undated.map((t) => t.name).join(" · ")}.{" "}
                <button onClick={() => setView("list")}>Đặt ngày ở danh sách ☰</button>
                {undated.some((t) => !t.sectionId) && (
                  <span className="hint">
                    {" "}Dòng chưa gắn PHẦN → vào Ngân sách, chọn “Phần tiến độ” cho dòng đó.
                  </span>
                )}
              </div>
            )}
            <GanttView
              tasks={tasks}
              readOnly={ks}
              hideMoney={hideMoney}
              onPlan={(t, patch) => savePlan(t, patch)}
            />
          </>
        ) : (
          <>
            {groups.map((g) => {
              const dn = g.items.filter((x) => x.done).length;
              const gAmt = g.items.reduce((s, x) => s + x.amount, 0);
              const gEarned = g.items.reduce((s, x) => s + (x.percent / 100) * x.amount, 0);
              const gPct = gAmt > 0 ? Math.round((gEarned / gAmt) * 100) : 0;
              return (
                <div key={g.groupKey} className="sec">
                  <div className="phead">
                    <span className="pc">{g.groupLabel}</span>
                    <span className="pnm" />
                    <span className="pr">
                      {hideMoney ? (
                        <span className="pr-m num">{gPct}%</span>
                      ) : (
                        <span className="pr-m num">
                          {fmt(gEarned)}<span className="pr-den"> / {fmt(gAmt)} đ</span>
                        </span>
                      )}
                      <span className="pr-d">{dn > 0 ? `${dn}/${g.items.length} xong` : `${g.items.length} hạng mục`}</span>
                    </span>
                  </div>
                  {g.items.map((t) => {
                    const k = keyOf(t);
                    const hasWorks = t.works.length > 0;
                    const isOpen = !!open[k];
                    const wDone = t.works.filter((w) => w.done).length;
                    return (
                    <div key={k} className={`row${t.done ? " done" : ""}`}>
                      <div className="rtop">
                        <div className="rl">
                          <span className="rnm">{t.name}</span>
                        </div>
                        {!hideMoney && (
                          <div className="rright">
                            <span className="ramt num">
                              <b>{fmt((t.percent / 100) * t.amount)}</b>
                              <span className="ramt-den"> / {fmt(t.amount)} NS</span>
                            </span>
                            <span className="rbuy2">
                              đã mua <b className={`num${t.bought > t.amount ? " over" : ""}`}>{fmt(t.bought)}</b> đ
                              {t.bought > t.amount ? " · vượt" : ""}
                            </span>
                          </div>
                        )}
                      </div>
                      {t.sectionId && !ks && (
                        <div className="rplan">
                          <span className="rplan-l">Bắt đầu</span>
                          <input
                            type="date"
                            value={t.planStart ?? ""}
                            onChange={(e) => {
                              const start = e.target.value || null;
                              if (!start) {
                                savePlan(t, { planStart: null, planEnd: null });
                                return;
                              }
                              const cur = durationDays(t.planStart, t.planEnd);
                              const dur = typeof cur === "number" ? cur : 1;
                              savePlan(t, { planStart: start, planEnd: isoAddDays(start, dur - 1) });
                            }}
                            aria-label={`Ngày bắt đầu ${t.name}`}
                          />
                          <input
                            type="number"
                            min={1}
                            className="rdays"
                            placeholder="số ngày"
                            value={durationDays(t.planStart, t.planEnd)}
                            onChange={(e) => {
                              if (!t.planStart) {
                                toast("Chọn ngày bắt đầu trước");
                                return;
                              }
                              const n = Math.max(1, Math.round(Number(e.target.value) || 0));
                              savePlan(t, { planEnd: isoAddDays(t.planStart, n - 1) });
                            }}
                            aria-label={`Số ngày thi công ${t.name}`}
                          />
                          <span className="rdays-u">ngày</span>
                          <SchedBadge t={t} />
                        </div>
                      )}
                      {ks && t.planStart && t.planEnd && (
                        <div className="rplan">
                          <span className="rplan-d">
                            {fmtDMY(t.planStart)} → {fmtDMY(t.planEnd)} · {durationDays(t.planStart, t.planEnd)} ngày
                          </span>
                          <SchedBadge t={t} />
                        </div>
                      )}
                      <div className="rctl">
                        <span className="rbar" aria-hidden>
                          <i style={{ width: `${Math.max(0, Math.min(100, t.percent))}%` }} />
                        </span>
                        <span className="rpct">{t.percent}%</span>
                        {hasWorks ? (
                          <button
                            type="button"
                            className={`dn kl${isOpen ? " open" : ""}`}
                            onClick={() => setOpen((o) => ({ ...o, [k]: !o[k] }))}
                            aria-expanded={isOpen}
                          >
                            {wDone}/{t.works.length} KL {isOpen ? "▴" : "▾"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={`dn${t.done ? " on" : ""}`}
                            onClick={() => markDone(t)}
                            disabled={t.done}
                          >
                            {t.done ? "✓ Xong" : "Xong"}
                          </button>
                        )}
                      </div>
                      {hasWorks && isOpen && (
                        <ul className="wlist">
                          {t.works.map((w) => (
                            <li key={w.id}>
                              <button
                                type="button"
                                className={`witem${w.done ? " on" : ""}`}
                                onClick={() => markWork(t, w)}
                                disabled={w.done}
                                aria-pressed={w.done}
                              >
                                <span className="wck">{w.done ? "✓" : ""}</span>
                                <span className="wtx">
                                  <span className="wnm">{w.name}</span>
                                  {w.location ? <span className="wloc">{w.location}</span> : null}
                                </span>
                                <span className="wq num">
                                  {fmtQty(w.quantity)} {w.unit}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    );
                  })}
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
type DragState = {
  key: string;
  mode: "move" | "start" | "end";
  startClientX: number;
  origStart: number;
  origEnd: number;
  curStart: number;
  curEnd: number;
};
function GanttView({
  tasks,
  readOnly = false,
  hideMoney = false,
  onPlan,
}: {
  tasks: Task[];
  readOnly?: boolean; // KS: xem, ko kéo ngày
  hideMoney?: boolean;
  onPlan: (t: Task, patch: { planStart: string; planEnd: string }) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [scrubMs, setScrubMs] = useState<number | null>(null); // line ngày kéo được (null = hôm nay)
  const [scrubDrag, setScrubDrag] = useState<{ startClientX: number; origMs: number } | null>(null);
  const secs = tasks;
  const dated = secs.filter((t) => t.planStart && t.planEnd);
  if (!dated.length)
    return (
      <div className="empty">
        <div className="ic">📅</div>
        Chưa có ngày kế hoạch. Đặt ở view danh sách (nút ☰): ngày bắt đầu + số ngày thi công.
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
  // Mảng THÁNG (xen kẽ tông màu để phân biệt) — cắt theo mốc đầu tháng trong [origin, end].
  const monthBands: { x: number; w: number; alt: boolean; label: string }[] = [];
  {
    const o = new Date(origin);
    let cur = Date.UTC(o.getUTCFullYear(), o.getUTCMonth(), 1);
    let mi = 0;
    while (cur < end) {
      const c = new Date(cur);
      const next = Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1);
      const s = Math.max(origin, cur);
      const e = Math.min(end, next);
      if (e > s) {
        const x = posX(s);
        monthBands.push({ x, w: posX(e) - x, alt: mi % 2 === 1, label: `Tháng ${c.getUTCMonth() + 1}` });
        mi++;
      }
      cur = next;
    }
  }
  const nowMs = Date.now();
  const fmtD = (ms: number) => {
    const d = new Date(ms);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };
  // Line ngày kéo được (scrubber) — mặc định = hôm nay, kẹp trong [origin, end].
  const scrubEff = Math.min(end, Math.max(origin, scrubMs != null ? scrubMs : nowMs));
  const scrubX = posX(scrubEff);
  const isToday = scrubMs == null || new Date(scrubMs).toDateString() === new Date().toDateString();

  return (
    <div className="gantt">
      <div className="g-scroll">
        <div
          className="g-inner"
          style={{ width: chartW + 172, "--gw": `${7 * PXD}px`, "--gx": `${gridX0}px` } as unknown as CSSProperties}
        >
          {/* Nền xen kẽ theo THÁNG (phân biệt tháng) */}
          <div className="g-bands" style={{ left: 160, width: chartW }}>
            {monthBands.map((m, i) => (
              <span
                key={i}
                className={`g-band${m.alt ? " alt" : ""}`}
                style={{ left: m.x, width: m.w }}
                title={m.label}
              />
            ))}
          </div>
          {/* Header trục ngày */}
          <div className="g-headrow">
            <span className="g-corner">Phần</span>
            <div className="g-axis" style={{ width: chartW }}>
              {ticks.map((d) => (
                <span key={d} className="g-tick" style={{ left: d * PXD }}>
                  {fmtD(origin + d * DAY)}
                </span>
              ))}
            </div>
          </div>
          {/* Hàng từng phần */}
          {secs.map((t) => {
            const has = t.planStart && t.planEnd;
            const dCur = drag && drag.key === keyOf(t) ? drag : null;
            const sMs = has ? (dCur ? dCur.curStart : Date.parse(t.planStart as string)) : 0;
            const eMs = has ? (dCur ? dCur.curEnd : Date.parse(t.planEnd as string)) : 0;
            const l = has ? posX(sMs) : 0;
            const w = has ? Math.max(8, posX(eMs) - l) : 0;
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
                      className={`g-bar${readOnly ? " ro" : ""}${t.done ? " done" : ""}${late ? " late" : ""}${dCur ? " dragging" : ""}`}
                      style={{ left: l, width: w }}
                      title={`${isoOfMs(sMs)} → ${isoOfMs(eMs)} · ${durationDays(isoOfMs(sMs), isoOfMs(eMs))} ngày · thực tế ${t.percent}% · dự kiến ${pv}%${hideMoney ? "" : ` · đã mua ${fmt(t.bought)}/${fmt(t.amount)}đ`}`}
                      onPointerDown={(ev) => {
                        if (readOnly) return;
                        const tgt = ev.target as HTMLElement;
                        const mode =
                          tgt.dataset.h === "l" ? "start" : tgt.dataset.h === "r" ? "end" : "move";
                        ev.currentTarget.setPointerCapture(ev.pointerId);
                        const os = Date.parse(t.planStart as string);
                        const oe = Date.parse(t.planEnd as string);
                        setDrag({ key: keyOf(t), mode, startClientX: ev.clientX, origStart: os, origEnd: oe, curStart: os, curEnd: oe });
                        ev.preventDefault();
                      }}
                      onPointerMove={(ev) => {
                        if (!drag || drag.key !== keyOf(t)) return;
                        const delta = Math.round((ev.clientX - drag.startClientX) / PXD);
                        let cs = drag.origStart;
                        let ce = drag.origEnd;
                        if (drag.mode === "move") {
                          cs = drag.origStart + delta * DAY;
                          ce = drag.origEnd + delta * DAY;
                        } else if (drag.mode === "start") {
                          cs = Math.min(drag.origEnd - DAY, drag.origStart + delta * DAY);
                        } else {
                          ce = Math.max(drag.origStart + DAY, drag.origEnd + delta * DAY);
                        }
                        setDrag({ ...drag, curStart: cs, curEnd: ce });
                      }}
                      onPointerUp={(ev) => {
                        if (!drag || drag.key !== keyOf(t)) return;
                        ev.currentTarget.releasePointerCapture(ev.pointerId);
                        onPlan(t, { planStart: isoOfMs(drag.curStart), planEnd: isoOfMs(drag.curEnd) });
                        setDrag(null);
                      }}
                    >
                      <span className="g-fill" style={{ width: `${Math.max(0, Math.min(100, t.percent))}%` }} />
                      <span className="g-plab">{t.percent}%</span>
                      {/* số ngày ở giữa thân (hover) */}
                      <span className="g-hint g-hd">{durationDays(isoOfMs(sMs), isoOfMs(eMs))} ngày</span>
                      <span className="g-handle l" data-h="l" />
                      <span className="g-handle r" data-h="r" />
                    </div>
                  )}
                  {/* ngày 2 đầu — ngoài thanh (không bị overflow cắt), hiện khi hover thanh */}
                  {has && <span className="g-hint g-hs" style={{ left: l }}>{fmtD(sMs)}</span>}
                  {has && <span className="g-hint g-he" style={{ left: l + w }}>{fmtD(eMs)}</span>}
                </div>
              </div>
            );
          })}
          {/* Line ngày kéo được (scrubber) — nhãn ngày ở đầu, kéo để rà timeline */}
          <div
            className={`g-scrub${isToday ? " today" : ""}`}
            style={{ left: 160 + scrubX }}
            onPointerDown={(ev) => {
              ev.currentTarget.setPointerCapture(ev.pointerId);
              setScrubDrag({ startClientX: ev.clientX, origMs: scrubEff });
              ev.preventDefault();
            }}
            onPointerMove={(ev) => {
              if (!scrubDrag) return;
              const delta = Math.round((ev.clientX - scrubDrag.startClientX) / PXD);
              setScrubMs(Math.min(end, Math.max(origin, scrubDrag.origMs + delta * DAY)));
            }}
            onPointerUp={(ev) => {
              if (!scrubDrag) return;
              ev.currentTarget.releasePointerCapture(ev.pointerId);
              setScrubDrag(null);
            }}
          >
            <span className="g-scrub-lbl">{fmtD(scrubEff)}</span>
          </div>
        </div>
      </div>
      <div className="g-legend">
        <span><i className="lg-fill" /> Thực tế</span>
        <span><i className="lg-bar" /> Khoảng dự kiến</span>
        <span><i className="lg-late" /> Đang trễ</span>
        <span><i className="lg-today" /> Line ngày (kéo để rà)</span>
      </div>
    </div>
  );
}
