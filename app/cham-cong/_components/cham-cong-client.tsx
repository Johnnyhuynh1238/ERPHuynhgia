"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type TodaySession = {
  id: string;
  checkInAt: string;
  checkInLat: number | null;
  checkInLng: number | null;
  checkInAccuracy: number | null;
  hasCheckInPhoto: boolean;
  checkOutAt: string | null;
  checkOutLat: number | null;
  checkOutLng: number | null;
  checkOutAccuracy: number | null;
  hasCheckOutPhoto: boolean;
  durationMinutes: number | null;
  note: string | null;
};

type TodayResponse = {
  date: string;
  sessions: TodaySession[];
  totalMinutes: number;
  hasOpenSession: boolean;
  openSessionId: string | null;
};

type CalendarDay = {
  date: string;
  sessions: number;
  totalMinutes: number;
  hasOpen: boolean;
  firstIn: string | null;
  lastOut: string | null;
};

type CalendarResponse = { month: string; days: CalendarDay[] };

const SELFIE_GUIDE =
  "Vui lòng chụp selfie có khuôn mặt anh và bối cảnh công trình phía sau. Ảnh sẽ được lưu để xác minh KS có mặt tại công trình. Camera sẽ tự bật ống kính trước.";

function formatClock(iso: string | null | undefined) {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(mins: number | null | undefined) {
  if (!mins || mins <= 0) return "0 giờ";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m} phút`;
  if (m <= 0) return `${h} giờ`;
  return `${h} giờ ${m} phút`;
}

function currentMonthString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getGeolocation(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

export function ChamCongClient() {
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [month, setMonth] = useState<string>(currentMonthString());
  const [busy, setBusy] = useState<"in" | "out" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selfieOpen, setSelfieOpen] = useState<null | "in" | "out">(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadToday = useCallback(async () => {
    const res = await fetch("/api/attendance/today", { cache: "no-store" });
    if (!res.ok) return;
    setToday((await res.json()) as TodayResponse);
  }, []);

  const loadCalendar = useCallback(
    async (m: string) => {
      const res = await fetch(`/api/attendance/calendar?month=${m}`, { cache: "no-store" });
      if (!res.ok) return;
      setCalendar((await res.json()) as CalendarResponse);
    },
    [],
  );

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  useEffect(() => {
    loadCalendar(month);
  }, [month, loadCalendar]);

  const openSelfie = (kind: "in" | "out") => {
    setError(null);
    setSelfieOpen(kind);
  };

  const closeSelfie = () => {
    setSelfieOpen(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onFileChosen = async (kind: "in" | "out", file: File) => {
    setBusy(kind);
    setError(null);
    try {
      const pos = await getGeolocation();
      const fd = new FormData();
      fd.append("photo", file);
      if (pos) {
        fd.append("lat", String(pos.coords.latitude));
        fd.append("lng", String(pos.coords.longitude));
        if (Number.isFinite(pos.coords.accuracy)) {
          fd.append("accuracy", String(pos.coords.accuracy));
        }
      }
      const endpoint = kind === "in" ? "/api/attendance/check-in" : "/api/attendance/check-out";
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.message || "Có lỗi xảy ra");
      }
      await Promise.all([loadToday(), loadCalendar(month)]);
      closeSelfie();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const monthDays = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const firstWeekday = new Date(y, m - 1, 1).getDay(); // 0=CN
    const daysInMonth = new Date(y, m, 0).getDate();
    const byDate = new Map<string, CalendarDay>();
    (calendar?.days || []).forEach((d) => byDate.set(d.date, d));
    const cells: Array<{ date: string | null; data: CalendarDay | null; isSunday: boolean }> = [];
    for (let i = 0; i < firstWeekday; i++) cells.push({ date: null, data: null, isSunday: false });
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const weekday = new Date(y, m - 1, day).getDay();
      cells.push({ date, data: byDate.get(date) || null, isSunday: weekday === 0 });
    }
    return cells;
  }, [calendar, month]);

  const todayYmd = ymdLocal(new Date());
  const selectedDayData = useMemo(() => {
    if (!selectedDay) return null;
    return (calendar?.days || []).find((d) => d.date === selectedDay) || null;
  }, [calendar, selectedDay]);

  const monthTotalMinutes = (calendar?.days || []).reduce((s, d) => s + d.totalMinutes, 0);
  const monthDaysWorked = (calendar?.days || []).filter((d) => d.totalMinutes > 0 || d.hasOpen).length;

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="text-xl font-bold text-[#f0f2ff]">⏱️ Chấm công hôm nay</div>
        <div className="mt-1 text-xs text-[#8892b0]">
          {today ? new Date(today.date).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }) : "Đang tải..."}
        </div>
        <div className="mt-2 text-sm text-[#f0f2ff]">
          Tổng giờ ở công trình hôm nay: <span className="font-bold text-emerald-300">{formatDuration(today?.totalMinutes ?? 0)}</span>
        </div>
      </div>

      {today?.hasOpenSession ? (
        <button
          type="button"
          disabled={busy === "out"}
          onClick={() => openSelfie("out")}
          className="w-full rounded-2xl border border-red-500/40 bg-red-500/15 p-5 text-center text-base font-bold text-red-200 transition active:scale-[0.98] disabled:opacity-50"
        >
          🚪 Chấm RA công trình
        </button>
      ) : (
        <button
          type="button"
          disabled={busy === "in"}
          onClick={() => openSelfie("in")}
          className="w-full rounded-2xl border border-emerald-500/40 bg-emerald-500/15 p-5 text-center text-base font-bold text-emerald-200 transition active:scale-[0.98] disabled:opacity-50"
        >
          🏗️ Chấm VÀO công trình
        </button>
      )}

      {error ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
      ) : null}

      <section className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="text-sm font-semibold text-[#f0f2ff]">Phiên chấm hôm nay</div>
        {!today?.sessions.length ? (
          <div className="mt-3 rounded-xl border border-dashed border-[#2d3249] p-4 text-center text-xs text-[#8892b0]">
            Chưa có phiên nào hôm nay.
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {today.sessions.map((s, idx) => (
              <li key={s.id} className="rounded-xl border border-[#2d3249] bg-[#13151f] p-3 text-[13px] text-[#f0f2ff]">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Phiên {idx + 1}</div>
                  <div className="text-xs text-[#8892b0]">{formatDuration(s.durationMinutes)}</div>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-2 text-xs text-[#8892b0]">
                  <div>
                    Chấm vào: <span className="text-emerald-300">{formatClock(s.checkInAt)}</span>
                    {s.hasCheckInPhoto ? (
                      <a className="ml-2 text-[#fb923c] underline" href={`/api/attendance/${s.id}/photo?which=in`} target="_blank" rel="noreferrer">ảnh</a>
                    ) : null}
                  </div>
                  <div>
                    Chấm ra: <span className={s.checkOutAt ? "text-red-300" : "text-amber-300"}>{s.checkOutAt ? formatClock(s.checkOutAt) : "(đang ở công trình)"}</span>
                    {s.hasCheckOutPhoto ? (
                      <a className="ml-2 text-[#fb923c] underline" href={`/api/attendance/${s.id}/photo?which=out`} target="_blank" rel="noreferrer">ảnh</a>
                    ) : null}
                  </div>
                </div>
                {s.note ? <div className="mt-1 text-xs text-[#8892b0]">Ghi chú: {s.note}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => shiftMonth(-1)} className="rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-1.5 text-xs text-[#f0f2ff]">◀</button>
          <div className="text-sm font-semibold text-[#f0f2ff]">Lịch chấm công · Tháng {month}</div>
          <button type="button" onClick={() => shiftMonth(1)} className="rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-1.5 text-xs text-[#f0f2ff]">▶</button>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[#8892b0]">
          <div>Ngày có chấm: <span className="font-semibold text-[#f0f2ff]">{monthDaysWorked}</span></div>
          <div>Tổng giờ: <span className="font-semibold text-emerald-300">{formatDuration(monthTotalMinutes)}</span></div>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] text-[#8892b0]">
          {["CN", "T2", "T3", "T4", "T5", "T6", "T7"].map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
          {monthDays.map((cell, idx) => {
            if (!cell.date) return <div key={`e-${idx}`} />;
            const isToday = cell.date === todayYmd;
            const hasData = Boolean(cell.data && (cell.data.totalMinutes > 0 || cell.data.hasOpen));
            const isOpen = cell.data?.hasOpen;
            const bg = isOpen
              ? "bg-amber-500/20 border-amber-500/40 text-amber-200"
              : hasData
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-200"
                : cell.isSunday
                  ? "bg-[#13151f] border-[#2d3249] text-amber-200/60"
                  : "bg-[#13151f] border-[#2d3249] text-[#8892b0]";
            return (
              <button
                key={cell.date}
                type="button"
                onClick={() => setSelectedDay(cell.date)}
                className={`flex flex-col items-center justify-center rounded-lg border px-1 py-1.5 ${bg} ${isToday ? "ring-2 ring-[#f97316]" : ""}`}
              >
                <span className="text-[12px] font-semibold">{Number(cell.date.split("-")[2])}</span>
                {hasData && cell.data ? (
                  <span className="text-[9px] leading-none mt-0.5">{Math.round((cell.data.totalMinutes / 60) * 10) / 10}h</span>
                ) : (
                  <span className="text-[9px] leading-none mt-0.5">·</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-[#8892b0]">
          <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-emerald-500/30 bg-emerald-500/15" /> Có chấm đủ</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-amber-500/40 bg-amber-500/20" /> Chưa chấm ra</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-[#2d3249] bg-[#13151f]" /> Trống / CN</span>
        </div>
      </section>

      {selectedDay ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-2 md:items-center" onClick={() => setSelectedDay(null)}>
          <div className="w-full max-w-md rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-[#f0f2ff]">{new Date(selectedDay).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}</div>
              <button type="button" onClick={() => setSelectedDay(null)} className="rounded-lg border border-[#2d3249] bg-[#13151f] px-2 py-1 text-xs text-[#f0f2ff]">Đóng</button>
            </div>
            {!selectedDayData ? (
              <div className="mt-3 rounded-xl border border-dashed border-[#2d3249] p-4 text-center text-xs text-[#8892b0]">Không có phiên chấm công ngày này.</div>
            ) : (
              <div className="mt-3 space-y-2 text-[13px] text-[#f0f2ff]">
                <div>Số phiên: <span className="font-semibold">{selectedDayData.sessions}</span></div>
                <div>Tổng giờ: <span className="font-semibold text-emerald-300">{formatDuration(selectedDayData.totalMinutes)}</span></div>
                <div>Chấm vào sớm nhất: <span className="font-semibold text-emerald-300">{formatClock(selectedDayData.firstIn)}</span></div>
                <div>Chấm ra muộn nhất: <span className="font-semibold text-red-300">{formatClock(selectedDayData.lastOut)}</span></div>
                {selectedDayData.hasOpen ? <div className="text-amber-300">⚠ Còn phiên chưa chấm ra</div> : null}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {selfieOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-2 md:items-center">
          <div className="w-full max-w-md rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
            <div className="text-base font-bold text-[#f0f2ff]">
              {selfieOpen === "in" ? "🏗️ Chụp selfie để Chấm vào" : "🚪 Chụp selfie để Chấm ra"}
            </div>
            <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-[12px] text-amber-100/90">
              {SELFIE_GUIDE}
            </div>

            <label className="mt-3 flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#f97316]/40 bg-[#13151f] px-3 py-6 text-center text-sm font-semibold text-[#fb923c] transition active:scale-[0.98]">
              <span>📸 Mở camera & chụp selfie</span>
              <span className="text-[11px] font-normal text-[#8892b0]">Ấn để mở camera trước. Đảm bảo thấy mặt và bối cảnh công trình.</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                disabled={busy !== null}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onFileChosen(selfieOpen, file);
                }}
              />
            </label>

            {busy ? (
              <div className="mt-3 text-center text-xs text-[#8892b0]">Đang gửi... đừng tắt trang</div>
            ) : (
              <button
                type="button"
                onClick={closeSelfie}
                className="mt-3 w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm text-[#f0f2ff]"
              >
                Hủy
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
