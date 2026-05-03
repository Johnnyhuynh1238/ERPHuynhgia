"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  fullName: string;
  email: string;
  config: {
    id: string;
    salaryMax: number;
    baseSalary: number;
    bonusMax: number;
    effectiveFrom: string;
    updatedAt: string;
  } | null;
};

type SalaryListResponse = {
  totals: {
    engineerCount: number;
    countConfigured: number;
    totalBaseSalary: number;
    totalBonusMax: number;
    totalSalaryMax: number;
  };
  rows: Row[];
};

function currency(value: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "KS";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function toDigits(value: string) {
  return value.replace(/\D+/g, "");
}

function formatSalaryInput(value: string) {
  if (!value) return "";
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(number);
}

export function AdminEngineerSalaryClient() {
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [payload, setPayload] = useState<SalaryListResponse | null>(null);

  const [selectedUserId, setSelectedUserId] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(todayYmd());
  const [changeReason, setChangeReason] = useState("");

  const loadData = useCallback(
    async (nextSearch = search) => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/admin/engineers/salary?search=${encodeURIComponent(nextSearch)}`, { cache: "no-store" });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof json?.message === "string" ? json.message : "Không tải được dữ liệu lương kỹ sư");
        }
        setPayload(json as SalaryListResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Không tải được dữ liệu lương kỹ sư");
        setPayload(null);
      } finally {
        setLoading(false);
      }
    },
    [search],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedRow = useMemo(() => payload?.rows.find((row) => row.id === selectedUserId) ?? null, [payload?.rows, selectedUserId]);

  useEffect(() => {
    if (!selectedRow) return;
    setSalaryMax(selectedRow.config ? String(Math.round(selectedRow.config.salaryMax)) : "");
    setEffectiveFrom(selectedRow.config?.effectiveFrom || todayYmd());
  }, [selectedRow]);

  const previewSalaryMax = Number(salaryMax || "0");
  const previewBase = previewSalaryMax / 2;
  const previewBonus = previewSalaryMax / 2;

  function pickEngineer(userId: string) {
    setSelectedUserId(userId);
    setMessage(null);
    setError(null);
  }

  function resetForm() {
    setSelectedUserId("");
    setSalaryMax("");
    setEffectiveFrom(todayYmd());
    setChangeReason("");
    setError(null);
    setMessage(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedUserId) {
      setError("Vui lòng chọn kỹ sư");
      return;
    }

    if (!salaryMax || Number(salaryMax) <= 0) {
      setError("Lương max phải lớn hơn 0");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/engineers/${selectedUserId}/salary-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salaryMax: Number(salaryMax),
          effectiveFrom,
          changeReason: changeReason.trim() || null,
        }),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof json?.message === "string" ? json.message : "Không lưu được cấu hình lương");
      }

      setMessage("Đã lưu cấu hình lương");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được cấu hình lương");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
        <div className="text-sm font-semibold text-[#d9def3]">Tổng quan quỹ lương kỹ sư</div>
        {payload ? (
          <div className="mt-3 space-y-1.5 text-sm text-[#c8d0ef]">
            <div className="flex items-center justify-between border-b border-[#252840] pb-1.5">
              <span>Số kỹ sư</span>
              <b className="text-[#f97316]">{payload.totals.engineerCount}</b>
            </div>
            <div className="flex items-center justify-between border-b border-[#252840] pb-1.5">
              <span>Đã cấu hình</span>
              <b className="text-[#f97316]">{payload.totals.countConfigured}</b>
            </div>
            <div className="flex items-center justify-between border-b border-[#252840] pb-1.5">
              <span>Tổng lương cứng</span>
              <b className="text-[#f97316]">{currency(payload.totals.totalBaseSalary)}</b>
            </div>
            <div className="flex items-center justify-between border-b border-[#252840] pb-1.5">
              <span>Tổng thưởng max</span>
              <b className="text-[#f97316]">{currency(payload.totals.totalBonusMax)}</b>
            </div>
            <div className="flex items-center justify-between text-base font-semibold">
              <span>Quỹ lương tối đa</span>
              <b className="text-[#f97316]">{currency(payload.totals.totalSalaryMax)}</b>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs text-[#98a0c2]">Tìm kỹ sư</label>
            <div className="mt-1 flex gap-2">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tên hoặc email"
                className="w-full rounded-xl border border-[#3a446d] bg-[#0f1424] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#f97316]"
              />
              <button
                type="button"
                onClick={() => loadData(search)}
                className="rounded-xl bg-[#283150] px-3 py-2 text-xs font-semibold text-[#d9def3]"
              >
                Lọc
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-[#98a0c2]">Kỹ sư đang chỉnh</label>
            <select
              value={selectedUserId}
              onChange={(event) => pickEngineer(event.target.value)}
              className="mt-1 w-full rounded-xl border border-[#3a446d] bg-[#0f1424] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#f97316]"
            >
              <option value="">-- Chọn kỹ sư --</option>
              {(payload?.rows || []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.fullName} ({row.email})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {(payload?.rows || []).map((row) => (
          <div key={row.id} className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#f97316] text-sm font-extrabold text-white">
                {getInitials(row.fullName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-[#f0f2ff]">{row.fullName}</div>
                <div className="truncate text-xs text-[#98a0c2]">{row.email}</div>
              </div>
              <button
                type="button"
                onClick={() => pickEngineer(row.id)}
                className="rounded-lg border border-[#f97316]/25 bg-[#f97316]/10 px-3 py-1.5 text-xs font-bold text-[#f97316]"
              >
                Sửa lương
              </button>
            </div>

            {row.config ? (
              <>
                <div className="mt-3 rounded-xl border-l-4 border-[#f97316] bg-gradient-to-r from-[#f97316]/10 to-transparent p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[1px] text-[#98a0c2]">Lương max</div>
                  <div className="mt-1 text-xl font-extrabold text-[#f97316]">{currency(row.config.salaryMax)}</div>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <div className="rounded-lg bg-[#11182d] p-2.5 text-xs">
                    <div className="text-[#98a0c2]">Lương cứng</div>
                    <div className="mt-1 font-bold text-[#f0f2ff]">{currency(row.config.baseSalary)}</div>
                  </div>
                  <div className="rounded-lg bg-[#11182d] p-2.5 text-xs">
                    <div className="text-[#98a0c2]">Thưởng KPI max</div>
                    <div className="mt-1 font-bold text-[#f0f2ff]">{currency(row.config.bonusMax)}</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-3 text-sm text-[#ffd9a8]">Chưa cấu hình lương</div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
          <div className="mb-3 text-xs font-bold uppercase tracking-[1.5px] text-[#98a0c2]">Cấu hình lương</div>
          <div className="text-sm font-bold text-[#f0f2ff]">Lương max của kỹ sư</div>
          <div className="mt-2 rounded-lg bg-blue-500/10 px-3 py-2 text-xs leading-5 text-[#9ab8ff]">
            Đây là tổng lương khi KPI 100%. Hệ thống tự chia: <b>50% cứng đảm bảo</b> + <b>50% thưởng theo KPI</b>.
          </div>

          <div className="relative mt-3">
            <input
              type="text"
              inputMode="numeric"
              value={formatSalaryInput(salaryMax)}
              onChange={(event) => setSalaryMax(toDigits(event.target.value))}
              placeholder="18,000,000"
              className="w-full rounded-xl border border-[#3a446d] bg-[#0f1424] px-4 py-4 pr-10 text-2xl font-extrabold text-[#f0f2ff] outline-none focus:border-[#f97316]"
              required
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#4a5568]">đ</span>
          </div>
        </div>

        <div className="rounded-2xl border border-[#f97316]/30 bg-gradient-to-br from-[#f97316]/12 to-transparent p-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-[1px] text-[#f97316]">Tự động chia 50/50</div>
          <div className="space-y-1.5 text-sm text-[#d9def3]">
            <div className="flex items-center justify-between">
              <span>✓ Lương cứng (50%)</span>
              <b className="text-[#f97316]">{currency(previewBase)}</b>
            </div>
            <div className="flex items-center justify-between">
              <span>⚡ Thưởng KPI max (50%)</span>
              <b className="text-[#f97316]">{currency(previewBonus)}</b>
            </div>
            <div className="border-t border-dashed border-[#f97316]/40 pt-1.5 text-xs text-[#98a0c2]">
              KPI 0% vẫn nhận {currency(previewBase)} · KPI 100% nhận {currency(previewSalaryMax)}
            </div>
            <div className="mt-2 flex items-center justify-between rounded-lg bg-[#f97316] px-3 py-2 text-white">
              <span className="text-sm font-semibold">Lương tối đa/tháng</span>
              <b className="text-lg font-extrabold">{currency(previewSalaryMax)}</b>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
          <div className="mb-3 text-xs font-bold uppercase tracking-[1.5px] text-[#98a0c2]">Lý do thay đổi</div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-[#d9def3]">Lý do</label>
              <textarea
                value={changeReason}
                onChange={(event) => setChangeReason(event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-[#3a446d] bg-[#0f1424] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#f97316]"
                placeholder="VD: Tăng lương Q2 2026"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#d9def3]">Áp dụng từ ngày</label>
              <input
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
                className="mt-1 w-full rounded-xl border border-[#3a446d] bg-[#0f1424] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#f97316]"
                required
              />
            </div>
          </div>
        </div>

        {selectedRow?.config ? (
          <div className="rounded-xl border border-[#34406b] bg-[#11182d] p-3 text-xs text-[#b9c4e8]">
            Hiện tại: max <b>{currency(selectedRow.config.salaryMax)}</b> · cứng <b>{currency(selectedRow.config.baseSalary)}</b> · thưởng max <b>{currency(selectedRow.config.bonusMax)}</b>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <button
            type="button"
            onClick={resetForm}
            className="rounded-xl border border-[#2f3555] bg-[#131a30] px-4 py-2 text-sm font-semibold text-[#d9def3]"
          >
            Hủy
          </button>
          <button
            disabled={saving}
            type="submit"
            className="rounded-xl bg-[#f97316] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 md:col-span-2"
          >
            {saving ? "Đang lưu..." : "Lưu thay đổi"}
          </button>
        </div>
      </form>

      {loading ? <div className="text-sm text-[#98a0c2]">Đang tải danh sách kỹ sư...</div> : null}
      {error ? <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}
      {message ? <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</div> : null}
    </div>
  );
}
