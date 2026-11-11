"use client";

import { plexSans, plexMono } from "@/lib/fonts";
import Link from "next/link";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./tien-do.css";


type Work = {
  id: string; // id estimate_works
  name: string;
  location: string | null;
  unit: string;
  quantity: number;
  weight: number; // tỉ trọng trong hạng mục (Σ = 1)
  done: boolean;
  doneAt: string | null; // lúc tick xong (khoá)
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

// Tiến độ thực tế (lib/tien-do-thuc-te qua API): ngày kế hoạch + dự báo từng công tác, chậm/nhanh N ngày.
type WDate = { own: boolean; planStart: string | null; planEnd: string | null; fStart: string | null; fEnd: string | null };
type Schedule = {
  today: string;
  hasPlan: boolean;
  slip: number;
  actualPct: number;
  plannedPct: number;
  planFinish: string | null;
  forecastFinish: string | null;
  works: Record<string, WDate>;
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
// ISO ngày → "dd/mm" (giờ VN cho timestamp)
const fmtDM = (iso: string) => {
  if (iso.length <= 10) {
    const [, m, d] = iso.split("-");
    return `${d}/${m}`;
  }
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};
// đồng → "triệu" gọn (vd 58,5)
const fmtTr = (n: number) => {
  const v = (n || 0) / 1e6;
  return v.toLocaleString("vi-VN", { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 1 });
};
type Status = "doing" | "todo" | "done";
const STATUS_LABEL: Record<Status, string> = { doing: "Đang làm", todo: "Chưa làm", done: "Xong" };
// Xong → done; đã có % hoặc tới ngày bắt đầu → đang làm; còn lại chưa làm.
const statusOf = (t: Task): Status => {
  if (t.done) return "done";
  if (t.percent > 0) return "doing";
  if (t.planStart && Date.parse(t.planStart) <= Date.now()) return "doing";
  return "todo";
};
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
  apiBase,
}: {
  projectId: string;
  projectCode: string;
  projectName: string;
  projectAddress?: string | null;
  backHref?: string;
  ks?: boolean; // màn KS (/ks-ql/sub): ko khung app, ko sửa ngày
  apiBase?: string; // mặc định /api/projects/<id>/tien-do; link ngày KS: /ks-td/<mã>/api (không đăng nhập)
}) {
  const api = apiBase ?? `/api/projects/${projectId}/tien-do`;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sched, setSched] = useState<Schedule | null>(null);
  const [wEdit, setWEdit] = useState<string | null>(null); // hạng mục đang sửa ngày công tác
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
        const r = await fetch(api, { cache: "no-store" });
        if (!r.ok) throw new Error("Không đọc được tiến độ");
        const j = await r.json();
        setTasks(Array.isArray(j.tasks) ? j.tasks : []);
        setUncataloged(j.uncataloged || 0);
        setHideMoney(!!j.hideMoney);
        setSched(j.schedule ?? null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Lỗi tải");
      } finally {
        setLoading(false);
      }
    })();
  }, [api]);

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

  // Tải lại tiến độ thực tế (sau tick / sửa ngày) — server tính từ DB, không chờ máy đồng bộ.
  const reloadSched = useCallback(async () => {
    const r = await fetch(api, { cache: "no-store" }).catch(() => null);
    if (!r || !r.ok) return;
    const j = await r.json().catch(() => null);
    if (j?.schedule) setSched(j.schedule);
  }, [api]);

  // Kỹ sư Dự toán / admin đặt ngày riêng cho 1 công tác. Trống cả 2 → bỏ ngày riêng (máy rải theo PHẦN).
  const saveWorkDate = async (workId: string, planStart: string | null, planEnd: string | null) => {
    if ((planStart === null) !== (planEnd === null)) return;
    const r = await fetch(`/api/projects/${projectId}/tien-do/ngay`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ works: [{ id: workId, planStart, planEnd }] }),
    }).catch(() => null);
    if (!r || !r.ok) {
      const j = r ? await r.json().catch(() => ({})) : {};
      toast(j.message || "Lưu ngày lỗi");
    }
    await reloadSched();
  };

  // Lưu mark done (KL hoặc cả hạng mục). Lỗi → trả local về trạng thái cũ.
  const save = useCallback(
    async (ref: { refType: "work" | "line" | "section"; refId: string }, done: boolean, rollback: () => void) => {
      const r = await fetch(api, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...ref, done }),
      }).catch(() => null);
      if (!r || !r.ok) {
        const j = r ? await r.json().catch(() => ({})) : {};
        rollback();
        toast(j.message || "Lưu lỗi");
        return;
      }
      void reloadSched();
    },
    [api, reloadSched],
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

  // Bấm tick → mở bảng xác nhận (ko dùng window.confirm). Đã xong là khoá, không mở lại.
  const [confirm, setConfirm] = useState<{ t: Task; w: Work | null } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Hạng mục KHÔNG có KL con → Xong cả hạng mục.
  const markDone = (t: Task) => {
    if (t.done) return;
    const prev = { done: t.done, percent: t.percent };
    const apply = (v: { done: boolean; percent: number }) =>
      setTasks((ts) => ts.map((x) => (keyOf(x) === keyOf(t) ? { ...x, ...v } : x)));
    apply({ done: true, percent: 100 });
    save({ refType: t.refType, refId: t.refId }, true, () => apply(prev));
    toast("Đã đánh dấu Xong");
  };

  // Tick 1 khối lượng → % hạng mục tự tính lại.
  const markWork = (t: Task, w: Work) => {
    if (w.done) return;
    const now = new Date().toISOString();
    const set = (done: boolean) =>
      setTasks((ts) =>
        ts.map((x) => {
          if (keyOf(x) !== keyOf(t)) return x;
          const works = x.works.map((y) => (y.id === w.id ? { ...y, done, doneAt: done ? now : null } : y));
          return { ...x, works, percent: pctOfWorks(works), done: works.every((y) => y.done) };
        }),
      );
    set(true);
    save({ refType: "work", refId: w.id }, true, () => set(false));
  };

  const doConfirm = () => {
    if (!confirm) return;
    if (confirm.w) markWork(confirm.t, confirm.w);
    else markDone(confirm.t);
    setConfirm(null);
  };

  // Tab trạng thái: Đang làm / Chưa làm / Xong.
  const [tab, setTab] = useState<Status>("doing");
  const counts = useMemo(() => {
    const c: Record<Status, number> = { doing: 0, todo: 0, done: 0 };
    tasks.forEach((t) => (c[statusOf(t)] += 1));
    return c;
  }, [tasks]);
  // Lần đầu tải: tab Đang làm trống → nhảy sang tab có hạng mục.
  const tabInit = useRef(false);
  useEffect(() => {
    if (loading || tabInit.current || !tasks.length) return;
    tabInit.current = true;
    if (!counts.doing) setTab(counts.todo ? "todo" : "done");
  }, [loading, tasks.length, counts]);

  const kl = useMemo(() => {
    let n = 0;
    let d = 0;
    tasks.forEach((t) => {
      n += t.works.length;
      d += t.works.filter((w) => w.done).length;
    });
    return { n, d };
  }, [tasks]);
  const lateCnt = useMemo(() => tasks.filter((t) => !t.done && t.planStart && t.planEnd && t.percent < plannedPct(t)).length, [tasks]);
  const daysLeft = useMemo(() => {
    const ends = tasks.filter((t) => t.planEnd).map((t) => Date.parse(t.planEnd as string));
    if (!ends.length) return null;
    const today = Date.parse(new Date().toISOString().slice(0, 10));
    return Math.max(0, Math.round((Math.max(...ends) - today) / DAY_MS));
  }, [tasks]);
  const diff = total.pct - total.planPct;

  return (
    <div
      className={`tddoc${ks ? "" : " -mx-4 -mt-4 md:-mx-6 md:-mt-6"} ${plexSans.variable} ${plexMono.variable}`}
      data-theme={theme}
    >
      <div className={`wrap${view === "list" ? " lst" : ""}`}>
        <div className="top2">
          <Link href={backHref ?? `/projects/${projectId}`} className="iconbtn" aria-label="Quay lại">
            ‹
          </Link>
          <div className="ttl">
            <div className="ey">Báo cáo tiến độ</div>
            <h1 title={projectAddress ?? undefined}>
              {ks ? projectName : `${projectName} · ${projectCode}`}
            </h1>
          </div>
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
          {!ks ? (
            <Link href={`/projects/${projectId}/gan-moc`} className="iconbtn" aria-label="Gán mốc" title="Gán mốc nghiệm thu & đợt thu">
              🔗
            </Link>
          ) : null}
        </div>

        {/* Tổng: vòng % + sớm/trễ + thanh (dự kiến nhạt, thực tế đậm) + 3 số */}
        <div className="hero">
          <div className="h-row">
            <Ring pct={loading ? 0 : dispPct} size={84} sw={8} color="var(--orange)">
              <b className="num ring-n">
                {loading ? "—" : dispPct}
                <span>%</span>
              </b>
            </Ring>
            <div className="h-info">
              <div className="l">Tổng tiến độ</div>
              {!loading && total.hasPlan && (
                <div className={`hbadge ${diff > 0 ? "ahead" : diff < 0 ? "behind" : "ontime"}`}>
                  {diff > 0 ? `▲ Sớm ${diff}% so kế hoạch` : diff < 0 ? `▼ Trễ ${-diff}% so kế hoạch` : "● Đúng kế hoạch"}
                </div>
              )}
              {!loading && sched?.hasPlan && (
                <div className={`hslip ${sched.slip > 0 ? "behind" : sched.slip < 0 ? "ahead" : "ontime"}`}>
                  {sched.slip > 0 ? `Đang chậm ${sched.slip} ngày` : sched.slip < 0 ? `Đang nhanh ${-sched.slip} ngày` : "Đúng tiến độ"}
                  {sched.forecastFinish ? (
                    <>
                      {" "}· xong dự báo <b className="num">{fmtDM(sched.forecastFinish)}</b>
                      {sched.planFinish && sched.planFinish !== sched.forecastFinish ? (
                        <small> (KH {fmtDM(sched.planFinish)})</small>
                      ) : null}
                    </>
                  ) : null}
                </div>
              )}
              {!loading && total.hasPlan && (
                <div className="pl">
                  Dự kiến hôm nay <b className="num">{total.planPct}%</b>
                  {daysLeft != null && (
                    <>
                      {" "}· còn <b className="num">{daysLeft}</b> ngày
                    </>
                  )}
                </div>
              )}
              {!loading && !total.hasPlan && <div className="pl">Chưa đặt ngày kế hoạch</div>}
            </div>
          </div>
          <div className="hbar">
            {!loading && total.hasPlan && (
              <span className="pv" style={{ width: `${Math.max(0, Math.min(100, total.planPct))}%` }} />
            )}
            <i style={{ width: `${Math.max(0, Math.min(100, dispPct))}%` }} />
          </div>
          <div className="stats">
            <div>
              <div className="v num">
                {total.doneCnt}
                <small>/{tasks.length}</small>
              </div>
              <div className="k">Hạng mục xong</div>
            </div>
            <div>
              <div className="v num">
                {kl.d}
                <small>/{kl.n}</small>
              </div>
              <div className="k">Khối lượng xong</div>
            </div>
            {hideMoney ? (
              <div>
                <div className={`v num${lateCnt ? " bad" : ""}`}>{lateCnt}</div>
                <div className="k">Hạng mục đang trễ</div>
              </div>
            ) : (
              <div>
                <div className="v num">
                  {loading ? "…" : fmtTr(dispEarned)}
                  <small>tr</small>
                </div>
                <div className="k">Giá trị h.thành</div>
              </div>
            )}
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
            <div className="tabs" role="tablist">
              {(["doing", "todo", "done"] as Status[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={tab === s}
                  className={tab === s ? "on" : ""}
                  onClick={() => setTab(s)}
                >
                  {STATUS_LABEL[s]}
                  <em>{counts[s]}</em>
                </button>
              ))}
            </div>
            {counts[tab] === 0 && <div className="empty sm">Không có hạng mục nào.</div>}
            {groups.map((g) => {
              const items = g.items.filter((x) => statusOf(x) === tab);
              if (!items.length) return null;
              const dn = g.items.filter((x) => x.done).length;
              const gAmt = g.items.reduce((s, x) => s + x.amount, 0);
              const gEarned = g.items.reduce((s, x) => s + (x.percent / 100) * x.amount, 0);
              const gPct = gAmt > 0 ? Math.round((gEarned / gAmt) * 100) : 0;
              return (
                <div key={g.groupKey} className="grp">
                  <div className="g-h">
                    <span className="n">{g.groupLabel}</span>
                    <span className="r">
                      <b className="num">{gPct}%</b> · {dn}/{g.items.length} xong
                    </span>
                  </div>
                  {items.map((t) => {
                    const k = keyOf(t);
                    const hasWorks = t.works.length > 0;
                    const isOpen = !!open[k];
                    const wDone = t.works.filter((w) => w.done).length;
                    const hasPlan = !!(t.planStart && t.planEnd);
                    const d = hasPlan ? t.percent - plannedPct(t) : 0;
                    const late = !t.done && hasPlan && d < 0;
                    return (
                      <div key={k} className={`it-w${isOpen ? " open" : ""}`}>
                        <button
                          type="button"
                          className={`it${t.done ? " done" : ""}`}
                          onClick={() => setOpen((o) => ({ ...o, [k]: !o[k] }))}
                          aria-expanded={isOpen}
                        >
                          <Ring
                            pct={t.percent}
                            size={38}
                            sw={4}
                            color={t.done ? "var(--ok)" : late ? "var(--red)" : "var(--orange)"}
                          >
                            <b className={`num mr-n${t.done ? " ok" : ""}`}>{t.done ? "✓" : t.percent}</b>
                          </Ring>
                          <span className="tx">
                            <span className="nm">{t.name}</span>
                            <span className="sb">
                              <span className="num">{hasWorks ? `${wDone}/${t.works.length} KL` : t.done ? "Xong" : "Cả hạng mục"}</span>
                              {hasPlan && (
                                <>
                                  <span className="d">·</span>
                                  <span className="num">
                                    {fmtDM(t.planStart as string)}→{fmtDM(t.planEnd as string)}
                                  </span>
                                </>
                              )}
                              {hasPlan && !t.done && (
                                <>
                                  <span className="d">·</span>
                                  <span className={late ? "late" : "ok"}>
                                    {d > 0 ? `sớm ${d}%` : d < 0 ? `trễ ${-d}%` : "đúng"}
                                  </span>
                                </>
                              )}
                            </span>
                          </span>
                          <span className="chev">{isOpen ? "⌄" : "›"}</span>
                        </button>
                        {isOpen && (
                          <div className="ex">
                            <div className="exmeta">
                              {t.sectionId && !ks ? (
                                <div className="full">
                                  <div className="k">Kế hoạch</div>
                                  <div className="pedit">
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
                                    <span className="u">ngày</span>
                                    {hasPlan && <span className="u">→ {fmtDMY(t.planEnd as string)}</span>}
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <div className="k">Kế hoạch</div>
                                  <div className="v num">
                                    {hasPlan ? (
                                      <>
                                        {fmtDM(t.planStart as string)} → {fmtDM(t.planEnd as string)}{" "}
                                        <small>{durationDays(t.planStart, t.planEnd)} ngày</small>
                                      </>
                                    ) : (
                                      <small>Chưa có ngày</small>
                                    )}
                                  </div>
                                </div>
                              )}
                              {hideMoney ? (
                                <div>
                                  <div className="k">Dự kiến hôm nay</div>
                                  <div className="v num">{hasPlan ? `${plannedPct(t)}%` : <small>—</small>}</div>
                                </div>
                              ) : (
                                <>
                                  <div>
                                    <div className="k">Hoàn thành / NS</div>
                                    <div className="v num">
                                      {fmtTr((t.percent / 100) * t.amount)} <small>/ {fmtTr(t.amount)} tr</small>
                                    </div>
                                  </div>
                                  <div>
                                    <div className="k">Đã mua</div>
                                    <div className={`v num${t.bought > t.amount ? " bad" : ""}`}>
                                      {fmtTr(t.bought)} <small>tr{t.bought > t.amount ? " · vượt" : ""}</small>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                            {hasWorks ? (
                              <>
                                <div className="kl-h">
                                  <span>Khối lượng</span>
                                  <span className="num">
                                    {!ks ? (
                                      <button
                                        type="button"
                                        className={`wedit-b${wEdit === keyOf(t) ? " on" : ""}`}
                                        onClick={() => setWEdit(wEdit === keyOf(t) ? null : keyOf(t))}
                                      >
                                        {wEdit === keyOf(t) ? "Xong sửa ngày" : "📅 Ngày công tác"}
                                      </button>
                                    ) : null}
                                    {wDone}/{t.works.length} xong
                                  </span>
                                </div>
                                {wEdit === keyOf(t)
                                  ? t.works.map((w) => {
                                      const d = sched?.works[w.id];
                                      const ps = d?.own ? d.planStart : null;
                                      const pe = d?.own ? d.planEnd : null;
                                      return (
                                        <div key={w.id} className="wedit">
                                          <span className="t">
                                            <b>{w.name}</b>
                                            <i>
                                              {d?.own
                                                ? "Ngày riêng"
                                                : d?.planStart
                                                  ? `Máy rải: ${fmtDM(d.planStart)} → ${fmtDM(d.planEnd as string)}`
                                                  : "Chưa có ngày"}
                                            </i>
                                          </span>
                                          <input
                                            type="date"
                                            value={ps ?? ""}
                                            aria-label={`Bắt đầu ${w.name}`}
                                            onChange={(e) => {
                                              const v = e.target.value || null;
                                              if (!v) return void saveWorkDate(w.id, null, null);
                                              const dur = ps && pe ? durationDays(ps, pe) : d?.planStart && d.planEnd ? durationDays(d.planStart, d.planEnd) : 1;
                                              void saveWorkDate(w.id, v, isoAddDays(v, (typeof dur === "number" ? dur : 1) - 1));
                                            }}
                                          />
                                          <input
                                            type="date"
                                            value={pe ?? ""}
                                            min={ps ?? undefined}
                                            aria-label={`Kết thúc ${w.name}`}
                                            onChange={(e) => {
                                              const v = e.target.value || null;
                                              if (!v) return void saveWorkDate(w.id, null, null);
                                              void saveWorkDate(w.id, ps ?? v, v);
                                            }}
                                          />
                                        </div>
                                      );
                                    })
                                  : t.works.map((w) => (
                                  <button
                                    key={w.id}
                                    type="button"
                                    className={`kl${w.done ? " on" : ""}`}
                                    onClick={() => !w.done && setConfirm({ t, w })}
                                    disabled={w.done}
                                    aria-pressed={w.done}
                                  >
                                    <span className="ck">{w.done ? "✓" : ""}</span>
                                    <span className="t">
                                      <b>{w.name}</b>
                                      {w.location ? <i>{w.location}</i> : null}
                                    </span>
                                    <span className="q num">
                                      {fmtQty(w.quantity)} {w.unit}
                                      {w.done && w.doneAt ? <span className="lock">🔒 {fmtDM(w.doneAt)}</span> : null}
                                      {!w.done ? <WorkDate d={sched?.works[w.id]} /> : null}
                                    </span>
                                  </button>
                                ))}
                                <div className="hint">Tick rồi là khoá, không mở lại được</div>
                              </>
                            ) : t.done ? (
                              <div className="whole on">✓ Đã xong cả hạng mục</div>
                            ) : (
                              <button type="button" className="whole" onClick={() => setConfirm({ t, w: null })}>
                                Đánh dấu xong cả hạng mục
                              </button>
                            )}
                          </div>
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

      {/* Bảng xác nhận trượt từ dưới — portal ra body (app shell transform làm hỏng fixed) */}
      {mounted &&
        confirm &&
        createPortal(
          <div className={`tddoc tdportal ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
            <div className="dim" onClick={() => setConfirm(null)} />
            <div className="sheet" role="dialog" aria-modal="true">
              <div className="grab" />
              <h3>{confirm.w ? "Xác nhận đã xong?" : "Xong cả hạng mục?"}</h3>
              <p>{confirm.t.name}</p>
              {confirm.w && (
                <div className="box">
                  <span>
                    {confirm.w.name}
                    {confirm.w.location ? <i>{confirm.w.location}</i> : null}
                  </span>
                  <b className="num">
                    {fmtQty(confirm.w.quantity)} {confirm.w.unit}
                  </b>
                </div>
              )}
              <div className="warn">⚠ Đã xong thì không mở lại được.</div>
              <div className="btns">
                <button type="button" className="no" onClick={() => setConfirm(null)}>
                  Huỷ
                </button>
                <button type="button" className="yes" onClick={doConfirm}>
                  ✓ Xong
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      <div className={`toast${toastMsg ? " show" : ""}`}>{toastMsg}</div>
    </div>
  );
}

// Vòng % (SVG) — tâm hiển thị children.
// Ngày KH công tác + dự báo nếu lệch (trễ đỏ / sớm xanh).
function WorkDate({ d }: { d?: WDate }) {
  if (!d?.planEnd) return null;
  const late = !!d.fEnd && d.fEnd > d.planEnd;
  return (
    <span className={`wd${late ? " late" : ""}`}>
      KH {fmtDM(d.planEnd)}
      {d.fEnd && d.fEnd !== d.planEnd ? ` → ${fmtDM(d.fEnd)}` : ""}
    </span>
  );
}

function Ring({ pct, size, sw, color, children }: { pct: number; size: number; sw: number; color: string; children: ReactNode }) {
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <span className="pring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={sw} />
        {p > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - p / 100)}
            style={{ transition: "stroke-dashoffset .25s ease" }}
          />
        )}
      </svg>
      {children}
    </span>
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
