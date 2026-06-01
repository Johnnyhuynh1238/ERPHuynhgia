"use client";

import { useEffect, useState } from "react";

type ShiftInfo = { id: string; name: string; startTime: string; endTime: string };

type Session = {
  id: string;
  checkInAt: string;
  checkOutAt: string | null;
  durationMinutes: number | null;
  lateMinutes: number | null;
  earlyLeaveMinutes: number | null;
  checkInLat: number | null;
  checkInLng: number | null;
  checkInAccuracy: number | null;
  checkOutLat: number | null;
  checkOutLng: number | null;
  checkOutAccuracy: number | null;
  hasCheckInPhoto: boolean;
  hasCheckOutPhoto: boolean;
  shiftIn: ShiftInfo | null;
  shiftOut: ShiftInfo | null;
  note: string | null;
};

type DayDetailResponse = {
  user: { id: string; fullName: string; email: string; role: string };
  date: string;
  sessions: Session[];
};

function formatVnClock(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function minutesToHM(mins: number | null) {
  if (!mins || mins <= 0) return "0";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} phút`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function formatVnDateLong(ymd: string) {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function gmapsUrl(lat: number | null, lng: number | null) {
  if (lat === null || lng === null) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function AttendanceDayDetailModal({
  userId,
  date,
  fullName,
  onClose,
}: {
  userId: string;
  date: string;
  fullName: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<DayDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomKey, setZoomKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/attendance/day?userId=${encodeURIComponent(userId)}&date=${encodeURIComponent(date)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!active) return;
        if (!res.ok) {
          setError(json?.message || "Không tải được dữ liệu");
          return;
        }
        setData(json);
      })
      .catch(() => {
        if (active) setError("Lỗi mạng");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, date]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (zoomKey) setZoomKey(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, zoomKey]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-2 md:items-center md:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0f1320] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-white/10 px-5 py-3">
          <div>
            <div className="text-base font-semibold text-white">{fullName}</div>
            <div className="text-xs text-white/60">Ngày {formatVnDateLong(date)}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/15 px-2 py-1 text-sm text-white/70 hover:bg-white/10"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="py-10 text-center text-sm text-white/50">Đang tải...</div>
          ) : error ? (
            <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : !data || data.sessions.length === 0 ? (
            <div className="py-10 text-center text-sm text-white/50">Không có phiên chấm công.</div>
          ) : (
            <div className="space-y-4">
              {data.sessions.map((s, idx) => {
                const inMaps = gmapsUrl(s.checkInLat, s.checkInLng);
                const outMaps = gmapsUrl(s.checkOutLat, s.checkOutLng);
                const photoIn = s.hasCheckInPhoto ? `/api/attendance/${s.id}/photo?which=in` : null;
                const photoOut = s.hasCheckOutPhoto ? `/api/attendance/${s.id}/photo?which=out` : null;
                return (
                  <div
                    key={s.id}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-semibold text-white/90">
                        Phiên {idx + 1}
                        {s.shiftIn ? (
                          <span className="ml-2 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-normal text-white/70">
                            {s.shiftIn.name} ({s.shiftIn.startTime}–{s.shiftIn.endTime})
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-white/60">
                        Tổng: <strong className="text-white">{minutesToHM(s.durationMinutes)}</strong>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {/* Check-in column */}
                      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                        <div className="mb-2 flex items-center justify-between text-xs text-white/60">
                          <span className="font-semibold uppercase tracking-wide text-emerald-300">
                            Chấm vào
                          </span>
                          <span className="text-white/85">{formatVnClock(s.checkInAt)}</span>
                        </div>

                        {typeof s.lateMinutes === "number" ? (
                          s.lateMinutes > 0 ? (
                            <div className="mb-2 inline-block rounded bg-red-500/20 px-2 py-0.5 text-[11px] text-red-200">
                              Trễ {s.lateMinutes} phút
                            </div>
                          ) : (
                            <div className="mb-2 inline-block rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-200">
                              Đúng giờ
                            </div>
                          )
                        ) : (
                          <div className="mb-2 inline-block rounded bg-white/5 px-2 py-0.5 text-[11px] text-white/40">
                            Chưa gán ca
                          </div>
                        )}

                        {photoIn ? (
                          <button
                            type="button"
                            onClick={() => setZoomKey(photoIn)}
                            className="block w-full overflow-hidden rounded-md border border-white/10"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={photoIn}
                              alt="Ảnh chấm vào"
                              className="aspect-[4/3] w-full object-cover transition hover:scale-[1.02]"
                            />
                          </button>
                        ) : (
                          <div className="flex aspect-[4/3] w-full items-center justify-center rounded-md border border-dashed border-white/15 text-xs text-white/40">
                            Không có ảnh
                          </div>
                        )}

                        {inMaps ? (
                          <a
                            href={inMaps}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-[11px] text-sky-300 hover:underline"
                          >
                            📍 Mở Google Maps
                            {s.checkInAccuracy ? (
                              <span className="text-white/40">
                                (±{Math.round(s.checkInAccuracy)}m)
                              </span>
                            ) : null}
                          </a>
                        ) : (
                          <div className="mt-2 text-[11px] text-white/40">Không có vị trí</div>
                        )}
                      </div>

                      {/* Check-out column */}
                      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                        <div className="mb-2 flex items-center justify-between text-xs text-white/60">
                          <span className="font-semibold uppercase tracking-wide text-sky-300">
                            Chấm ra
                          </span>
                          <span className="text-white/85">
                            {s.checkOutAt ? formatVnClock(s.checkOutAt) : "— chưa chấm"}
                          </span>
                        </div>

                        {s.checkOutAt ? (
                          typeof s.earlyLeaveMinutes === "number" ? (
                            s.earlyLeaveMinutes > 0 ? (
                              <div className="mb-2 inline-block rounded bg-amber-500/20 px-2 py-0.5 text-[11px] text-amber-200">
                                Về sớm {s.earlyLeaveMinutes} phút
                              </div>
                            ) : (
                              <div className="mb-2 inline-block rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-200">
                                Đúng giờ
                              </div>
                            )
                          ) : (
                            <div className="mb-2 inline-block rounded bg-white/5 px-2 py-0.5 text-[11px] text-white/40">
                              Chưa gán ca
                            </div>
                          )
                        ) : (
                          <div className="mb-2 inline-block rounded bg-amber-500/20 px-2 py-0.5 text-[11px] text-amber-200">
                            Phiên hở
                          </div>
                        )}

                        {photoOut ? (
                          <button
                            type="button"
                            onClick={() => setZoomKey(photoOut)}
                            className="block w-full overflow-hidden rounded-md border border-white/10"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={photoOut}
                              alt="Ảnh chấm ra"
                              className="aspect-[4/3] w-full object-cover transition hover:scale-[1.02]"
                            />
                          </button>
                        ) : (
                          <div className="flex aspect-[4/3] w-full items-center justify-center rounded-md border border-dashed border-white/15 text-xs text-white/40">
                            {s.checkOutAt ? "Không có ảnh" : "Chưa chấm ra"}
                          </div>
                        )}

                        {outMaps ? (
                          <a
                            href={outMaps}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-[11px] text-sky-300 hover:underline"
                          >
                            📍 Mở Google Maps
                            {s.checkOutAccuracy ? (
                              <span className="text-white/40">
                                (±{Math.round(s.checkOutAccuracy)}m)
                              </span>
                            ) : null}
                          </a>
                        ) : (
                          <div className="mt-2 text-[11px] text-white/40">
                            {s.checkOutAt ? "Không có vị trí" : "—"}
                          </div>
                        )}
                      </div>
                    </div>

                    {s.note ? (
                      <div className="mt-3 rounded border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-white/70">
                        <span className="text-white/50">Ghi chú: </span>
                        {s.note}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {zoomKey ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-2"
          onClick={() => setZoomKey(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoomKey} alt="Ảnh phóng to" className="max-h-[95vh] max-w-[95vw] object-contain" />
        </div>
      ) : null}
    </div>
  );
}
