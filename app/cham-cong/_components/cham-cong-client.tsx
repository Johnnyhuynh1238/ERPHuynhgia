"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

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

type GeoResult =
  | { kind: "ok"; pos: GeolocationPosition }
  | { kind: "unsupported" }
  | { kind: "denied" }
  | { kind: "unavailable" }
  | { kind: "timeout" };

function getGeolocation(): Promise<GeoResult> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ kind: "unsupported" });
      return;
    }
    const tryOnce = (highAccuracy: boolean, timeoutMs: number) =>
      new Promise<GeoResult>((res) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => res({ kind: "ok", pos }),
          (err) => {
            if (err.code === err.PERMISSION_DENIED) res({ kind: "denied" });
            else if (err.code === err.POSITION_UNAVAILABLE) res({ kind: "unavailable" });
            else if (err.code === err.TIMEOUT) res({ kind: "timeout" });
            else res({ kind: "unavailable" });
          },
          { enableHighAccuracy: highAccuracy, timeout: timeoutMs, maximumAge: 0 },
        );
      });
    // Try high-accuracy 12s first; if that fails non-denied, retry low-accuracy 15s.
    tryOnce(true, 12000).then(async (first) => {
      if (first.kind === "ok" || first.kind === "denied") {
        resolve(first);
        return;
      }
      const second = await tryOnce(false, 15000);
      resolve(second);
    });
  });
}

type GeoErrorKind = Exclude<GeoResult["kind"], "ok">;

function geoErrorTitle(kind: GeoErrorKind): string {
  if (kind === "unsupported") return "Trình duyệt không hỗ trợ định vị";
  if (kind === "denied") return "Anh chưa cho phép truy cập vị trí";
  if (kind === "timeout") return "Quá lâu không lấy được vị trí";
  return "Không lấy được vị trí GPS";
}

function geoErrorHint(kind: GeoErrorKind): string {
  if (kind === "unsupported") return "Vui lòng dùng Chrome hoặc Safari mới nhất, không dùng app Zalo/Messenger.";
  if (kind === "denied") return "Cần mở Cài đặt → bật quyền Vị trí cho trình duyệt, sau đó quay lại tải lại trang và chấm lại.";
  if (kind === "timeout") return "Bật GPS điện thoại, ra chỗ thoáng (không có toà nhà che), rồi thử lại.";
  return "Bật GPS điện thoại, kiểm tra anh đang dùng trình duyệt thường (Chrome/Safari), rồi thử lại.";
}

type Platform = "android" | "ios" | "other";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  return "other";
}

function locationSettingsHref(p: Platform): string | null {
  if (p === "android") {
    return "intent:#Intent;action=android.settings.LOCATION_SOURCE_SETTINGS;end";
  }
  if (p === "ios") {
    return "App-Prefs:Privacy&path=LOCATION";
  }
  return null;
}

function platformSteps(p: Platform): string[] {
  if (p === "android") {
    return [
      "1. Bấm nút Mở cài đặt vị trí bên dưới (hoặc vuốt từ trên xuống → bật biểu tượng Vị trí)",
      "2. Bật công tắc Vị trí (Location) ở đầu màn hình",
      "3. Quay lại trình duyệt, tải lại trang, bấm Chấm vào lại",
    ];
  }
  if (p === "ios") {
    return [
      "1. Vào Cài đặt → Quyền riêng tư & Bảo mật → Dịch vụ định vị → bật ON",
      "2. Cuộn xuống mục Safari → chọn 'Khi sử dụng App' và bật Vị trí Chính xác",
      "3. Quay lại Safari, tải lại trang, bấm Chấm vào lại",
    ];
  }
  return [
    "1. Bấm vào biểu tượng ổ khóa cạnh thanh địa chỉ trình duyệt",
    "2. Chọn Quyền (Permissions) → Vị trí → Cho phép",
    "3. Tải lại trang và bấm Chấm vào lại",
  ];
}

export function ChamCongClient() {
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [month, setMonth] = useState<string>(currentMonthString());
  const [busy, setBusy] = useState<"in" | "out" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selfieOpen, setSelfieOpen] = useState<null | "in" | "out">(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<{ kind: GeoErrorKind; lastAction: "in" | "out" } | null>(null);
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
    setGeoError(null);
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
      const geo = await getGeolocation();
      if (geo.kind !== "ok") {
        setGeoError({ kind: geo.kind, lastAction: kind });
        fetch("/api/attendance/geo-error", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: geo.kind, action: kind }),
          keepalive: true,
        }).catch(() => {});
        closeSelfie();
        setBusy(null);
        return;
      }
      setGeoError(null);
      const fd = new FormData();
      fd.append("photo", file);
      fd.append("lat", String(geo.pos.coords.latitude));
      fd.append("lng", String(geo.pos.coords.longitude));
      if (Number.isFinite(geo.pos.coords.accuracy)) {
        fd.append("accuracy", String(geo.pos.coords.accuracy));
      }
      const endpoint = kind === "in" ? "/api/attendance/check-in" : "/api/attendance/check-out";
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.message || "Có lỗi xảy ra");
      }
      if (kind === "in" && typeof json?.autoClosedCount === "number" && json.autoClosedCount > 0) {
        toast.warning(
          `Đã tự đóng ${json.autoClosedCount} phiên cũ chưa chấm ra. Vui lòng báo kế toán để điều chỉnh giờ làm.`,
          { duration: 8000 },
        );
      } else if (kind === "in") {
        toast.success("Đã chấm vào");
      } else {
        toast.success("Đã chấm ra");
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

      {geoError ? (
        <GpsHelpCard
          kind={geoError.kind}
          onRetry={() => {
            const k = geoError.lastAction;
            setGeoError(null);
            openSelfie(k);
          }}
          onDismiss={() => setGeoError(null)}
        />
      ) : null}

      {error && !geoError ? (
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

function GpsHelpCard({
  kind,
  onRetry,
  onDismiss,
}: {
  kind: GeoErrorKind;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const platform = detectPlatform();
  const settingsHref = locationSettingsHref(platform);
  const steps = platformSteps(platform);
  const platformLabel =
    platform === "android" ? "Android" : platform === "ios" ? "iPhone/iPad" : "Máy tính";

  return (
    <div className="slide-up overflow-hidden rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-[#1a1d2e]/60 to-[#13151f]/80 backdrop-blur-sm">
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-xl">
          📍
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-amber-100">{geoErrorTitle(kind)}</div>
          <div className="mt-1 text-xs leading-relaxed text-[#cdd3ec]">{geoErrorHint(kind)}</div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-md border border-white/15 px-2 py-0.5 text-xs text-white/60 hover:bg-white/10"
          aria-label="Đóng"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-wrap gap-2 px-4 pb-3">
        {settingsHref ? (
          <a
            href={settingsHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/20 px-3 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/30"
          >
            ⚙️ Mở cài đặt vị trí
          </a>
        ) : null}
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/30"
        >
          🔄 Thử chấm lại
        </button>
      </div>

      <div className="border-t border-white/10 bg-black/20 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-200/80">
          Hướng dẫn cho {platformLabel}
        </div>
        <ol className="mt-1.5 space-y-1 text-[12px] text-[#cdd3ec]">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        {platform === "ios" ? (
          <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-200/80">
            Lưu ý: iOS không cho web mở thẳng Cài đặt. Nếu nút trên không phản hồi, anh mở Cài đặt thủ công theo các bước trên.
          </div>
        ) : null}
      </div>
    </div>
  );
}
