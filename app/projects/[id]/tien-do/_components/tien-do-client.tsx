"use client";

import { IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./tien-do.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

type Task = {
  refType: "catalog" | "khoan";
  refId: string;
  phaseCode: string;
  phaseName: string;
  taskCode: string;
  name: string;
  amount: number;
  percent: number;
  done: boolean;
};

const fmt = (n: number) => Math.round(n || 0).toLocaleString("vi-VN");
const keyOf = (t: { refType: string; refId: string }) => `${t.refType}|${t.refId}`;

export function TienDoClient({
  projectId,
  projectCode,
  projectName,
}: {
  projectId: string;
  projectCode: string;
  projectName: string;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [uncataloged, setUncataloged] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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

  // Tổng earned value tính tại client cho mượt (server cũng trả về khi PATCH).
  const total = useMemo(() => {
    let amt = 0;
    let earned = 0;
    let doneCnt = 0;
    tasks.forEach((t) => {
      amt += t.amount;
      earned += (t.percent / 100) * t.amount;
      if (t.done) doneCnt += 1;
    });
    return { amt, pct: amt > 0 ? Math.round((earned / amt) * 100) : 0, doneCnt };
  }, [tasks]);

  const groups = useMemo(() => {
    const map = new Map<string, { phaseCode: string; phaseName: string; items: Task[] }>();
    for (const t of tasks) {
      const g = map.get(t.phaseCode);
      if (g) g.items.push(t);
      else map.set(t.phaseCode, { phaseCode: t.phaseCode, phaseName: t.phaseName, items: [t] });
    }
    return [...map.values()];
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

  // Kéo % → cập nhật local ngay, debounce PATCH.
  const setPercent = (t: Task, percent: number) => {
    setTasks((prev) =>
      prev.map((x) => (keyOf(x) === keyOf(t) ? { ...x, percent, done: percent >= 100 ? x.done : false } : x)),
    );
    const k = keyOf(t);
    if (timers.current[k]) clearTimeout(timers.current[k]);
    timers.current[k] = setTimeout(() => save({ ...t, percent }, { percent }), 350);
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
    <div className={`tddoc -mx-4 -mt-4 md:-mx-6 md:-mt-6 ${plexSans.variable}`}>
      <div className="wrap">
        <div className="topbar">
          <div className="brand">
            <div className="mark">H6</div>
            <div>
              <b>HUỲNH GIA</b>
              <span>Tiến độ thi công</span>
            </div>
          </div>
          <Link href={`/projects/${projectId}`} className="tdback">
            ← Dự án
          </Link>
        </div>

        <div className="eyebrow">Tiến độ theo công tác dự toán · {projectCode}</div>
        <h1>{projectName}</h1>

        {/* Tổng tiến độ */}
        <div className="totcard">
          <div className="tt">
            <span className="tn">Tổng tiến độ dự án</span>
            <span className="tp">{loading ? "—" : `${total.pct}%`}</span>
          </div>
          <div className="tbar">
            <i style={{ width: `${Math.max(0, Math.min(100, total.pct))}%` }} />
          </div>
          <div className="tmeta">
            {loading ? "…" : `${tasks.length} công tác · ${total.doneCnt} xong · dự toán ${fmt(total.amt)} đ`}
          </div>
        </div>

        {loading ? (
          <div className="load">Đang tải công tác…</div>
        ) : err ? (
          <div className="empty">{err}</div>
        ) : !tasks.length ? (
          <div className="empty">
            <div className="ic">📊</div>
            Dự toán chưa có công tác nào. Vào Dự toán thêm vật tư/khoán trước.
          </div>
        ) : (
          <>
            {groups.map((g) => (
              <div key={g.phaseCode} className="grp">
                <div className="ghead">
                  <span className="gi">{g.phaseCode === "KHOAN" ? "Khoán" : `GĐ ${g.phaseCode}`}</span>
                  <span className="gn">{g.phaseName}</span>
                </div>
                {g.items.map((t) => (
                  <div key={keyOf(t)} className={`row${t.done ? " done" : ""}`}>
                    <div className="rhead">
                      <div className="rn">
                        {t.taskCode && <span className="rc">{t.taskCode}</span>}
                        <span className="rnm">{t.name}</span>
                      </div>
                      <div className="ra">{fmt(t.amount)} đ</div>
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
                        className={`donebtn${t.done ? " on" : ""}`}
                        onClick={() => toggleDone(t)}
                      >
                        {t.done ? "✓ Xong" : "Xong"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {uncataloged > 0 && (
              <div className="note">
                {uncataloged} dòng vật tư chưa gắn công tác — không tính vào tiến độ. Gắn công tác trong Dự toán để hiện ở đây.
              </div>
            )}
          </>
        )}
      </div>

      <div className={`toast${toastMsg ? " show" : ""}`}>{toastMsg}</div>
    </div>
  );
}
