"use client";

import Link from "next/link";
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
      <div className="slide-up">
        <Link
          href="/"
          className="smooth-press inline-flex items-center gap-1 rounded-full border border-[#2d3249] bg-[#13151f]/80 px-3 py-1.5 text-xs font-semibold text-[#d9def3] hover:border-[#f97316]/50 hover:text-[#fb923c]"
        >
          ← Quay lại
        </Link>
      </div>

      <div
        className="slide-up delay-1 relative overflow-hidden rounded-2xl border p-4"
        style={{
          borderColor: "rgba(249, 115, 22, 0.18)",
          background:
            "linear-gradient(135deg, rgba(249,115,22,0.10) 0%, rgba(26,29,46,0.95) 55%, rgba(19,21,31,0.95) 100%)",
        }}
      >
        <div
          className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(249,115,22,0.22), transparent 70%)" }}
        />
        <div className="relative">
          <div className="flex items-center gap-2 text-xl font-bold text-[#f0f2ff]">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#f97316]/15 text-lg">⏱️</span>
            Chấm công hôm nay
          </div>
          <div className="mt-1 text-xs text-[#8892b0]">
            {today
              ? new Date(today.date).toLocaleDateString("vi-VN", {
                  weekday: "long",
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })
              : "Đang tải..."}
          </div>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-[11px] uppercase tracking-wide text-[#8892b0]">Tổng giờ hôm nay</span>
          </div>
          <div className="mt-0.5 text-2xl font-extrabold text-[#fb923c]">
            {formatDuration(today?.totalMinutes ?? 0)}
          </div>
        </div>
      </div>

      <div className="slide-up delay-2">
        {today?.hasOpenSession ? (
          <button
            type="button"
            disabled={busy === "out"}
            onClick={() => openSelfie("out")}
            className="smooth-press pulse-glow-cool w-full rounded-2xl border border-[#60a5fa]/40 p-5 text-center text-base font-bold text-[#dbeafe] disabled:opacity-50"
            style={{
              background:
                "linear-gradient(135deg, rgba(96,165,250,0.18) 0%, rgba(59,130,246,0.10) 100%)",
            }}
          >
            🚪 Chấm RA công trình
          </button>
        ) : (
          <button
            type="button"
            disabled={busy === "in"}
            onClick={() => openSelfie("in")}
            className="smooth-press pulse-glow w-full rounded-2xl border border-[#f97316]/45 p-5 text-center text-base font-bold text-white disabled:opacity-50"
            style={{
              background:
                "linear-gradient(135deg, #f97316 0%, #fb923c 100%)",
            }}
          >
            🏗️ Chấm VÀO công trình
          </button>
        )}
      </div>

      {error ? (
        <div className="slide-up rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
      ) : null}

      <section className="slide-up delay-3 rounded-2xl border border-[#252840] bg-[#1a1d2e]/80 p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#f0f2ff]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#f97316]" />
          Phiên chấm hôm nay
        </div>
        {!today?.sessions.length ? (
          <div className="mt-3 rounded-xl border border-dashed border-[#2d3249] bg-[#13151f]/50 p-4 text-center text-xs text-[#8892b0]">
            Chưa có phiên nào hôm nay.
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {today.sessions.map((s, idx) => (
              <li
                key={s.id}
                className="smooth-press rounded-xl border border-[#2d3249] bg-[#13151f] p-3 text-[13px] text-[#f0f2ff] hover:border-[#f97316]/30"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#f97316]/15 text-[10px] text-[#fb923c]">
                      {idx + 1}
                    </span>
                    Phiên {idx + 1}
                  </div>
                  <div className="text-xs font-semibold text-[#fb923c]">{formatDuration(s.durationMinutes)}</div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[#8892b0]">
                  <div>
                    Vào: <span className="font-medium text-[#f0f2ff]">{formatClock(s.checkInAt)}</span>
                    {s.hasCheckInPhoto ? (
                      <a
                        className="ml-1.5 text-[#fb923c] underline-offset-2 hover:underline"
                        href={`/api/attendance/${s.id}/photo?which=in`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        ảnh
                      </a>
                    ) : null}
                  </div>
                  <div>
                    Ra:{" "}
                    <span className={s.checkOutAt ? "font-medium text-[#f0f2ff]" : "font-medium text-[#60a5fa]"}>
                      {s.checkOutAt ? formatClock(s.checkOutAt) : "(đang ở công trình)"}
                    </span>
                    {s.hasCheckOutPhoto ? (
                      <a
                        className="ml-1.5 text-[#fb923c] underline-offset-2 hover:underline"
                        href={`/api/attendance/${s.id}/photo?which=out`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        ảnh
                      </a>
                    ) : null}
                  </div>
                </div>
                {s.note ? <div className="mt-1 text-xs text-[#8892b0]">Ghi chú: {s.note}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="slide-up delay-4 rounded-2xl border border-[#252840] bg-[#1a1d2e]/80 p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="smooth-press rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-1.5 text-xs text-[#f0f2ff] hover:border-[#f97316]/40 hover:text-[#fb923c]"
            aria-label="Tháng trước"
          >
            ◀
          </button>
          <div className="text-sm font-semibold text-[#f0f2ff]">Lịch chấm công · Tháng {month}</div>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="smooth-press rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-1.5 text-xs text-[#f0f2ff] hover:border-[#f97316]/40 hover:text-[#fb923c]"
            aria-label="Tháng sau"
          >
            ▶
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-[#2d3249] bg-[#13151f]/60 px-3 py-2 text-xs">
            <div className="text-[10px] uppercase tracking-wide text-[#8892b0]">Ngày có chấm</div>
            <div className="mt-0.5 text-base font-bold text-[#f0f2ff]">{monthDaysWorked}</div>
          </div>
          <div className="rounded-lg border border-[#2d3249] bg-[#13151f]/60 px-3 py-2 text-xs">
            <div className="text-[10px] uppercase tracking-wide text-[#8892b0]">Tổng giờ</div>
            <div className="mt-0.5 text-base font-bold text-[#fb923c]">{formatDuration(monthTotalMinutes)}</div>
          </div>
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
              ? "border-[#60a5fa]/40 bg-[#60a5fa]/15 text-[#dbeafe]"
              : hasData
                ? "border-[#f97316]/35 bg-[#f97316]/12 text-[#fed7aa]"
                : cell.isSunday
                  ? "border-[#2d3249] bg-[#13151f]/60 text-[#8892b0]/70"
                  : "border-[#2d3249] bg-[#13151f]/80 text-[#8892b0]";
            return (
              <button
                key={cell.date}
                type="button"
                onClick={() => setSelectedDay(cell.date)}
                className={`cal-cell flex flex-col items-center justify-center rounded-lg border px-1 py-1.5 ${bg} ${
                  isToday ? "ring-2 ring-[#f97316] ring-offset-1 ring-offset-[#1a1d2e]" : ""
                }`}
              >
                <span className="text-[12px] font-semibold">{Number(cell.date.split("-")[2])}</span>
                {hasData && cell.data ? (
                  <span className="mt-0.5 text-[9px] leading-none">
                    {Math.round((cell.data.totalMinutes / 60) * 10) / 10}h
                  </span>
                ) : (
                  <span className="mt-0.5 text-[9px] leading-none opacity-40">·</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-[#8892b0]">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border border-[#f97316]/35 bg-[#f97316]/12" /> Có chấm đủ
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border border-[#60a5fa]/40 bg-[#60a5fa]/15" /> Chưa chấm ra
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded border border-[#2d3249] bg-[#13151f]" /> Trống / CN
          </span>
        </div>
      </section>

      {selectedDay ? (
        <div
          className="modal-backdrop-in fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-2 md:items-center"
          onClick={() => setSelectedDay(null)}
        >
          <div
            className="modal-sheet-in w-full max-w-md rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-[#f0f2ff]">
                {new Date(selectedDay).toLocaleDateString("vi-VN", {
                  weekday: "long",
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </div>
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="smooth-press rounded-lg border border-[#2d3249] bg-[#13151f] px-2 py-1 text-xs text-[#f0f2ff] hover:border-[#f97316]/40"
              >
                Đóng
              </button>
            </div>
            {!selectedDayData ? (
              <div className="mt-3 rounded-xl border border-dashed border-[#2d3249] p-4 text-center text-xs text-[#8892b0]">
                Không có phiên chấm công ngày này.
              </div>
            ) : (
              <div className="mt-3 space-y-2 text-[13px] text-[#f0f2ff]">
                <div>
                  Số phiên: <span className="font-semibold">{selectedDayData.sessions}</span>
                </div>
                <div>
                  Tổng giờ: <span className="font-bold text-[#fb923c]">{formatDuration(selectedDayData.totalMinutes)}</span>
                </div>
                <div>
                  Vào sớm nhất: <span className="font-semibold">{formatClock(selectedDayData.firstIn)}</span>
                </div>
                <div>
                  Ra muộn nhất: <span className="font-semibold">{formatClock(selectedDayData.lastOut)}</span>
                </div>
                {selectedDayData.hasOpen ? (
                  <div className="rounded-lg border border-[#60a5fa]/40 bg-[#60a5fa]/10 px-2 py-1 text-[#dbeafe]">
                    ⚠ Còn phiên chưa chấm ra
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {selfieOpen ? (
        <div className="modal-backdrop-in fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-2 md:items-center">
          <div className="modal-sheet-in w-full max-w-md rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 shadow-2xl">
            <div className="text-base font-bold text-[#f0f2ff]">
              {selfieOpen === "in" ? "🏗️ Chụp selfie để Chấm vào" : "🚪 Chụp selfie để Chấm ra"}
            </div>
            <div className="mt-2 rounded-xl border border-[#f97316]/25 bg-[#f97316]/8 p-3 text-[12px] text-[#fed7aa]">
              {SELFIE_GUIDE}
            </div>

            <label className="smooth-press mt-3 flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#f97316]/45 bg-[#13151f] px-3 py-6 text-center text-sm font-semibold text-[#fb923c] hover:border-[#f97316]/70">
              <span>📸 Mở camera & chụp selfie</span>
              <span className="text-[11px] font-normal text-[#8892b0]">
                Ấn để mở camera trước. Đảm bảo thấy mặt và bối cảnh công trình.
              </span>
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
              <div className="mt-3 flex items-center justify-center gap-2 text-center text-xs text-[#fb923c]">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#f97316]/30 border-t-[#fb923c]" />
                Đang gửi... đừng tắt trang
              </div>
            ) : (
              <button
                type="button"
                onClick={closeSelfie}
                className="smooth-press mt-3 w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm text-[#f0f2ff] hover:border-[#f97316]/40"
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
