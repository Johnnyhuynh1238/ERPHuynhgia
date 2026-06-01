"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { AttendanceDayDetailModal } from "./attendance-day-detail-modal";

type DaySummary = {
  date: string;
  sessions: number;
  totalMinutes: number;
  hasOpen: boolean;
  firstIn: string | null;
  lastOut: string | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  hasShiftData: boolean;
};

type SummaryRow = {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  daysWorked: number;
  openDays: number;
  totalMinutes: number;
  lateDays: number;
  earlyLeaveDays: number;
  totalLateMinutes: number;
  totalEarlyLeaveMinutes: number;
  days: DaySummary[];
};

type Engineer = {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  role: string;
};

function roleLabel(role: string) {
  if (role === "engineer") return "KS";
  if (role === "accountant") return "Kế toán";
  return role;
}

function minutesToHM(mins: number) {
  if (!mins || mins <= 0) return "0";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function formatVnClock(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(date: string) {
  const [, m, d] = date.split("-");
  return `${d}/${m}`;
}

export function AttendanceAdminClient({
  initialMonth,
  engineers,
}: {
  initialMonth: string;
  engineers: Engineer[];
}) {
  const [month, setMonth] = useState(initialMonth);
  const [userFilter, setUserFilter] = useState<string>("");
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dayDetail, setDayDetail] = useState<{ userId: string; date: string; fullName: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ month });
      if (userFilter) params.set("userId", userFilter);
      const res = await fetch(`/api/admin/attendance?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Không tải được dữ liệu");
      setSummary(data.summary || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi không xác định");
    } finally {
      setLoading(false);
    }
  }, [month, userFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const stats = useMemo(() => {
    const totalMinutes = summary.reduce((s, r) => s + r.totalMinutes, 0);
    const totalLateMinutes = summary.reduce((s, r) => s + r.totalLateMinutes, 0);
    const totalEarlyMinutes = summary.reduce((s, r) => s + r.totalEarlyLeaveMinutes, 0);
    const openDays = summary.reduce((s, r) => s + r.openDays, 0);
    return { totalMinutes, totalLateMinutes, totalEarlyMinutes, openDays };
  }, [summary]);

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams({ month });
    if (userFilter) params.set("userId", userFilter);
    return `/api/admin/attendance/export/xlsx?${params.toString()}`;
  }, [month, userFilter]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-white">Chấm công nhân viên</h1>
        <p className="text-sm text-white/60">
          Thống kê chấm công của KS và kế toán theo tháng. Click vào dòng nhân viên để xem ngày, click vào ngày để xem chi tiết.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Tổng giờ tháng"
          value={minutesToHM(stats.totalMinutes)}
          icon="⏱️"
          tone="emerald"
        />
        <StatCard
          label="Tổng phút trễ"
          value={stats.totalLateMinutes > 0 ? `${stats.totalLateMinutes}p` : "0"}
          icon="⏰"
          tone="red"
        />
        <StatCard
          label="Tổng phút về sớm"
          value={stats.totalEarlyMinutes > 0 ? `${stats.totalEarlyMinutes}p` : "0"}
          icon="🚪"
          tone="amber"
        />
        <StatCard
          label="Ngày phiên hở"
          value={String(stats.openDays)}
          icon="⚠️"
          tone={stats.openDays > 0 ? "amber" : "slate"}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <label className="space-y-1 text-sm">
          <span className="block text-white/70">Tháng</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-white"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-white/70">Nhân viên</span>
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-white"
          >
            <option value="">Tất cả</option>
            {engineers.map((u) => (
              <option key={u.id} value={u.id}>
                [{roleLabel(u.role)}] {u.fullName} {u.isActive ? "" : "(ngưng)"}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={fetchData} disabled={loading}>
          {loading ? "Đang tải..." : "Tải lại"}
        </Button>
        <a
          href={exportUrl}
          className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-500"
        >
          📥 Xuất Excel
        </a>
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm text-white/70">
          <span>{summary.length} nhân viên</span>
          <span className="hidden md:block text-xs text-white/40">
            Click dòng để xem chi tiết theo ngày
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-white/60">
              <tr>
                <th className="w-10 px-4 py-3"></th>
                <th className="px-4 py-3">Nhân viên</th>
                <th className="px-4 py-3 text-right">Ngày</th>
                <th className="px-4 py-3 text-right">Tổng giờ</th>
                <th className="px-4 py-3 text-right">Trễ</th>
                <th className="px-4 py-3 text-right">Về sớm</th>
                <th className="px-4 py-3 text-right">Phiên hở</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {summary.length === 0 && !loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-white/50">
                    Chưa có dữ liệu chấm công cho tháng này.
                  </td>
                </tr>
              ) : null}
              {summary.map((row) => {
                const isOpen = expanded === row.userId;
                return (
                  <Fragment key={row.userId}>
                    <tr
                      className={`cursor-pointer text-white/90 transition hover:bg-white/[0.04] ${
                        isOpen ? "bg-white/[0.04]" : ""
                      }`}
                      onClick={() => setExpanded(isOpen ? null : row.userId)}
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/15 text-xs text-white/80 transition ${
                            isOpen ? "rotate-90" : ""
                          }`}
                          aria-label={isOpen ? "Thu gọn" : "Xem chi tiết"}
                        >
                          ▸
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar fullName={row.fullName} role={row.role} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium text-white">{row.fullName}</span>
                              <span className="shrink-0 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/70">
                                {roleLabel(row.role)}
                              </span>
                            </div>
                            <div className="truncate text-xs text-white/50">{row.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-white/85">{row.daysWorked}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-white">{minutesToHM(row.totalMinutes)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <MetricBadge
                          days={row.lateDays}
                          minutes={row.totalLateMinutes}
                          tone="red"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <MetricBadge
                          days={row.earlyLeaveDays}
                          minutes={row.totalEarlyLeaveMinutes}
                          tone="amber"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.openDays > 0 ? (
                          <span className="rounded-md bg-amber-500/20 px-2 py-1 text-xs font-semibold text-amber-200">
                            {row.openDays}
                          </span>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr className="bg-black/30">
                        <td colSpan={7} className="px-4 py-4">
                          {row.days.length === 0 ? (
                            <div className="text-sm text-white/50">Không có ngày chấm công.</div>
                          ) : (
                            <div>
                              <div className="mb-3 text-[11px] text-white/50">
                                💡 Click vào ngày để xem chi tiết ảnh selfie, vị trí, trễ/sớm.
                              </div>
                              <div className="overflow-hidden rounded-lg border border-white/10">
                                <table className="min-w-full text-xs">
                                  <thead className="bg-white/[0.03] text-white/50">
                                    <tr>
                                      <th className="px-3 py-2 text-left">Ngày</th>
                                      <th className="px-3 py-2 text-right">Phiên</th>
                                      <th className="px-3 py-2 text-right">Tổng giờ</th>
                                      <th className="px-3 py-2 text-right">Vào</th>
                                      <th className="px-3 py-2 text-right">Ra</th>
                                      <th className="px-3 py-2 text-right">Trễ</th>
                                      <th className="px-3 py-2 text-right">Về sớm</th>
                                      <th className="px-3 py-2 text-right">Phiên hở</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-white/5 text-white/85">
                                    {row.days.map((d) => (
                                      <tr
                                        key={d.date}
                                        className="cursor-pointer transition hover:bg-emerald-500/5"
                                        onClick={() =>
                                          setDayDetail({
                                            userId: row.userId,
                                            date: d.date,
                                            fullName: row.fullName,
                                          })
                                        }
                                      >
                                        <td className="px-3 py-2">
                                          <span className="font-medium text-emerald-300 underline-offset-2 hover:underline">
                                            {formatDate(d.date)}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 text-right">{d.sessions}</td>
                                        <td className="px-3 py-2 text-right font-medium">
                                          {minutesToHM(d.totalMinutes)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-white/70">
                                          {formatVnClock(d.firstIn)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-white/70">
                                          {formatVnClock(d.lastOut)}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                          <MinuteCell
                                            minutes={d.lateMinutes}
                                            hasShift={d.hasShiftData}
                                            tone="red"
                                          />
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                          <MinuteCell
                                            minutes={d.earlyLeaveMinutes}
                                            hasShift={d.hasShiftData}
                                            tone="amber"
                                          />
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                          {d.hasOpen ? (
                                            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200">
                                              Có
                                            </span>
                                          ) : (
                                            <span className="text-white/30">—</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {dayDetail ? (
        <AttendanceDayDetailModal
          userId={dayDetail.userId}
          date={dayDetail.date}
          fullName={dayDetail.fullName}
          onClose={() => setDayDetail(null)}
        />
      ) : null}
    </div>
  );
}

type Tone = "emerald" | "red" | "amber" | "slate";

const TONE_STYLES: Record<Tone, { bg: string; border: string; text: string; iconBg: string }> = {
  emerald: {
    bg: "bg-gradient-to-br from-emerald-500/10 to-emerald-500/5",
    border: "border-emerald-500/25",
    text: "text-emerald-200",
    iconBg: "bg-emerald-500/20",
  },
  red: {
    bg: "bg-gradient-to-br from-red-500/10 to-red-500/5",
    border: "border-red-500/25",
    text: "text-red-200",
    iconBg: "bg-red-500/20",
  },
  amber: {
    bg: "bg-gradient-to-br from-amber-500/10 to-amber-500/5",
    border: "border-amber-500/25",
    text: "text-amber-200",
    iconBg: "bg-amber-500/20",
  },
  slate: {
    bg: "bg-white/[0.03]",
    border: "border-white/10",
    text: "text-white/70",
    iconBg: "bg-white/10",
  },
};

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: string;
  tone: Tone;
}) {
  const s = TONE_STYLES[tone];
  return (
    <div className={`flex items-center gap-3 rounded-xl border ${s.border} ${s.bg} p-4`}>
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${s.iconBg} text-lg`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[11px] uppercase tracking-wide text-white/50">{label}</div>
        <div className={`truncate text-lg font-semibold ${s.text}`}>{value}</div>
      </div>
    </div>
  );
}

function Avatar({ fullName, role }: { fullName: string; role: string }) {
  const initials = fullName
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(-2)
    .join("")
    .toUpperCase() || "?";
  const bg =
    role === "engineer"
      ? "bg-gradient-to-br from-orange-500/30 to-orange-700/30 text-orange-100"
      : role === "accountant"
      ? "bg-gradient-to-br from-sky-500/30 to-sky-700/30 text-sky-100"
      : "bg-white/10 text-white/70";
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-xs font-bold ${bg}`}
    >
      {initials}
    </div>
  );
}

function MetricBadge({
  days,
  minutes,
  tone,
}: {
  days: number;
  minutes: number;
  tone: "red" | "amber";
}) {
  if (days === 0 && minutes === 0) {
    return <span className="text-white/30">—</span>;
  }
  const s =
    tone === "red"
      ? "bg-red-500/15 text-red-200 border-red-500/25"
      : "bg-amber-500/15 text-amber-200 border-amber-500/25";
  return (
    <div className={`inline-flex flex-col items-end rounded-md border ${s} px-2 py-1`}>
      <span className="text-sm font-semibold leading-none">{days} ngày</span>
      <span className="mt-0.5 text-[10px] opacity-80">{minutes} phút</span>
    </div>
  );
}

function MinuteCell({
  minutes,
  hasShift,
  tone,
}: {
  minutes: number;
  hasShift: boolean;
  tone: "red" | "amber";
}) {
  if (!hasShift) {
    return <span className="text-[10px] text-white/30">—</span>;
  }
  if (minutes <= 0) {
    return <span className="text-[11px] text-emerald-300/70">✓</span>;
  }
  const cls = tone === "red" ? "text-red-300" : "text-amber-300";
  return <span className={`text-[11px] font-semibold ${cls}`}>{minutes}p</span>;
}
