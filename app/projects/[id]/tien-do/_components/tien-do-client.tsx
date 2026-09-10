"use client";

import { plexSans, plexMono } from "@/lib/fonts";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./tien-do.css";


type Task = {
  refType: "section" | "khoan";
  refId: string;
  groupKey: string; // kind ("tho"…) hoặc "khoan"
  groupLabel: string; // "Thô" / "Hoàn thiện" / … / "Khoán trọn gói"
  name: string;
  amount: number;
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
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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
    let doneCnt = 0;
    let hasPlan = false;
    tasks.forEach((t) => {
      amt += t.amount;
      earned += (t.percent / 100) * t.amount;
      planned += (plannedPct(t) / 100) * t.amount;
      if (t.done) doneCnt += 1;
      if (t.planStart && t.planEnd) hasPlan = true;
    });
    return {
      amt,
      earned,
      planned,
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
    if (t.refType !== "section") return;
    const r = await fetch(`/api/projects/${projectId}/sections/${t.refId}`, {
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
            <i style={{ width: `${Math.max(0, Math.min(100, dispPct))}%` }} />
            {!loading && total.hasPlan && (
              <span className="planmark" style={{ left: `${Math.max(0, Math.min(100, total.planPct))}%` }} />
            )}
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
              Dự toán <span className="num">{loading ? "…" : fmt(total.amt)}</span> đ
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
                          {t.refType === "khoan" && <span className="rc kh num">KHOÁN</span>}
                          <span className="rnm">{t.name}</span>
                        </div>
                        <span className="ramt num">
                          <b>{fmt((t.percent / 100) * t.amount)}</b>
                          <span className="ramt-den"> / {fmt(t.amount)}</span>
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
                      {t.refType === "section" && (
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
