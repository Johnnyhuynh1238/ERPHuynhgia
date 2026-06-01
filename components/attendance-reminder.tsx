"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type TodayResponse = {
  date: string;
  sessions: Array<{ id: string; checkInAt: string; checkOutAt: string | null }>;
  totalMinutes: number;
  hasOpenSession: boolean;
};

const CHECKOUT_REMIND_HOUR_VN = 17;
const SESSION_KEY_PREFIX = "attendance-reminder-dismissed";

function nowVnHour(): number {
  const s = new Date().toLocaleString("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    hour12: false,
  });
  return Number(s);
}

function isSundayVn(): boolean {
  const s = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "short",
  });
  return s.startsWith("Sun");
}

function dismissKey(date: string, kind: "in" | "out") {
  return `${SESSION_KEY_PREFIX}-${date}-${kind}`;
}

export function AttendanceReminder() {
  const [reminder, setReminder] = useState<{
    date: string;
    kind: "in" | "out";
  } | null>(null);

  useEffect(() => {
    let active = true;
    if (isSundayVn()) return;

    const check = async () => {
      try {
        const res = await fetch("/api/attendance/today", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as TodayResponse;
        if (!active) return;

        const hasAnySession = data.sessions.length > 0;
        let kind: "in" | "out" | null = null;

        if (!hasAnySession) {
          kind = "in";
        } else if (data.hasOpenSession && nowVnHour() >= CHECKOUT_REMIND_HOUR_VN) {
          kind = "out";
        }

        if (!kind) {
          setReminder(null);
          return;
        }

        const dismissed = sessionStorage.getItem(dismissKey(data.date, kind));
        if (dismissed) {
          setReminder(null);
          return;
        }

        setReminder({ date: data.date, kind });
      } catch {
        /* ignore */
      }
    };

    check();
    return () => {
      active = false;
    };
  }, []);

  const onDismiss = () => {
    if (!reminder) return;
    try {
      sessionStorage.setItem(dismissKey(reminder.date, reminder.kind), "1");
    } catch {
      /* ignore */
    }
    setReminder(null);
  };

  if (!reminder) return null;

  const isIn = reminder.kind === "in";
  const title = isIn ? "Anh chưa chấm công vào hôm nay" : "Đã qua 17h, anh nhớ chấm ra";
  const body = isIn
    ? "Vui lòng vào trang chấm công để xác nhận anh đang làm việc. Việc này cần thiết để tính lương đầy đủ."
    : "Khi kết thúc giờ làm, anh nhớ vào trang chấm công và bấm 'Chấm ra' để chốt số giờ làm hôm nay.";
  const cta = isIn ? "🏗️ Chấm vào ngay" : "🚪 Chấm ra ngay";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-3 md:items-center">
      <div className="w-full max-w-md rounded-2xl border border-[#252840] bg-[#1a1d2e] p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="text-2xl leading-7">⏱️</div>
          <div className="flex-1">
            <div className="text-base font-bold text-[#f0f2ff]">{title}</div>
            <div className="mt-1 text-[13px] leading-snug text-[#c5cae0]">{body}</div>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Link
            href="/cham-cong"
            onClick={() => setReminder(null)}
            className={`flex-1 rounded-xl px-4 py-3 text-center text-sm font-bold transition active:scale-[0.98] ${
              isIn
                ? "border border-emerald-500/40 bg-emerald-500/20 text-emerald-200"
                : "border border-red-500/40 bg-red-500/20 text-red-200"
            }`}
          >
            {cta}
          </Link>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-xl border border-[#2d3249] bg-[#13151f] px-4 py-3 text-sm font-medium text-[#8892b0]"
          >
            Để sau
          </button>
        </div>
      </div>
    </div>
  );
}
