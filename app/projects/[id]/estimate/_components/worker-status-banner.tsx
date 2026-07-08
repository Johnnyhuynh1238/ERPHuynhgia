"use client";

import { Activity, AlertTriangle, ChevronDown, ChevronRight, Loader2, PauseCircle } from "lucide-react";
import { useEffect, useState } from "react";

type WorkerStatus = {
  state: "idle" | "working" | "stuck" | "quota" | "viewer_down" | "unknown";
  busy: boolean;
  tail: string | null;
  heartbeatAgeSec: number | null;
  requested: number;
  analyzing: number;
};

// Banner tiến trình worker AI: đang bóc / kẹt / hết quota — poll 10s, chỉ hiện khi có việc hoặc có vấn đề
export function WorkerStatusBanner() {
  const [st, setSt] = useState<WorkerStatus | null>(null);
  const [showTail, setShowTail] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await fetch("/api/estimate/worker-status", { cache: "no-store" }).catch(() => null);
      if (alive && r?.ok) setSt(await r.json());
    };
    void load();
    const t = setInterval(() => void load(), 10000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!st) return null;
  const staleHeartbeat = st.heartbeatAgeSec == null || st.heartbeatAgeSec > 180;
  const hasWork = st.requested > 0 || st.analyzing > 0;
  const hasProblem = st.state === "quota" || st.state === "stuck" || st.state === "viewer_down" || (hasWork && staleHeartbeat);
  if (!hasWork && !hasProblem) return null;

  let icon = <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  let cls = "border-sky-500/30 bg-sky-500/10 text-sky-400";
  let text = "";

  if (hasWork && staleHeartbeat) {
    icon = <AlertTriangle className="h-3.5 w-3.5" />;
    cls = "border-amber-500/30 bg-amber-500/10 text-amber-400";
    text = `Mất tín hiệu giám sát ${st.heartbeatAgeSec != null ? Math.round(st.heartbeatAgeSec / 60) + " phút" : ""} — kiểm tra cron watcher trên VPS.`;
  } else
    switch (st.state) {
      case "working":
        text = `AI đang bóc ${st.analyzing} hạng mục — hoạt động bình thường.${st.requested > 0 ? ` Còn ${st.requested} chờ tới lượt.` : ""}`;
        break;
      case "quota":
        icon = <PauseCircle className="h-3.5 w-3.5" />;
        cls = "border-rose-500/40 bg-rose-500/10 text-rose-400";
        text = "Hết quota Claude — worker tạm dừng. Đổi acc trên webterminal hoặc chờ quota reset rồi bấm Reset + AI Phân tích lại.";
        break;
      case "stuck":
        icon = <AlertTriangle className="h-3.5 w-3.5" />;
        cls = "border-amber-500/30 bg-amber-500/10 text-amber-400";
        text = `Worker im lặng dù còn ${st.analyzing} hạng mục đang bóc — có thể kẹt. Chờ 1-2 phút, không nhúc nhích thì bấm Reset trên hạng mục rồi AI Phân tích lại.`;
        break;
      case "viewer_down":
        icon = <AlertTriangle className="h-3.5 w-3.5" />;
        cls = "border-rose-500/40 bg-rose-500/10 text-rose-400";
        text = "Không nối được terminal service trên VPS — báo em kiểm tra.";
        break;
      default:
        icon = <Activity className="h-3.5 w-3.5" />;
        text = `${st.requested} hạng mục trong hàng chờ — watcher nhặt trong tối đa 1 phút.`;
    }

  return (
    <div className={`rounded-xl border px-3 py-2 text-[11px] ${cls}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="flex-1">{text}</span>
        {st.tail && (
          <button onClick={() => setShowTail((v) => !v)} className="flex shrink-0 items-center gap-0.5 font-semibold opacity-80 hover:opacity-100">
            {showTail ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} terminal
          </button>
        )}
      </div>
      {showTail && st.tail && (
        <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-black/40 p-2 font-mono text-[10px] leading-relaxed text-zinc-400">
          {st.tail}
        </pre>
      )}
    </div>
  );
}
