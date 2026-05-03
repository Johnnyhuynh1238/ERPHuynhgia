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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedUserId) {
      setError("Vui lòng chọn kỹ sư");
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
        <div className="text-sm font-semibold text-[#d9def3]">Tổng quan lương kỹ sư</div>
        {payload ? (
          <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-[#c8d0ef] md:grid-cols-2">
            <div>Số KS: <b>{payload.totals.engineerCount}</b></div>
            <div>Đã cấu hình: <b>{payload.totals.countConfigured}</b></div>
            <div>Tổng lương cứng: <b>{currency(payload.totals.totalBaseSalary)}</b></div>
            <div>Tổng thưởng max: <b>{currency(payload.totals.totalBonusMax)}</b></div>
            <div>Quỹ lương tối đa: <b>{currency(payload.totals.totalSalaryMax)}</b></div>
          </div>
        ) : null}
      </div>

      <form onSubmit={submit} className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
        <div className="mb-3 text-sm font-semibold text-[#d9def3]">Cấu hình lương kỹ sư</div>

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
            <label className="text-xs text-[#98a0c2]">Kỹ sư</label>
            <select
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
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

          <div>
            <label className="text-xs text-[#98a0c2]">Lương max (VND)</label>
            <input
              type="number"
              min={0}
              step={1000}
              value={salaryMax}
              onChange={(event) => setSalaryMax(event.target.value)}
              className="mt-1 w-full rounded-xl border border-[#3a446d] bg-[#0f1424] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#f97316]"
              required
            />
          </div>

          <div>
            <label className="text-xs text-[#98a0c2]">Áp dụng từ</label>
            <input
              type="date"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
              className="mt-1 w-full rounded-xl border border-[#3a446d] bg-[#0f1424] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#f97316]"
              required
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="text-xs text-[#98a0c2]">Lý do thay đổi</label>
          <textarea
            value={changeReason}
            onChange={(event) => setChangeReason(event.target.value)}
            rows={2}
            className="mt-1 w-full rounded-xl border border-[#3a446d] bg-[#0f1424] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#f97316]"
          />
        </div>

        {selectedRow?.config ? (
          <div className="mt-3 rounded-xl border border-[#34406b] bg-[#11182d] p-3 text-xs text-[#b9c4e8]">
            Hiện tại: max <b>{currency(selectedRow.config.salaryMax)}</b> · cứng <b>{currency(selectedRow.config.baseSalary)}</b> · thưởng max <b>{currency(selectedRow.config.bonusMax)}</b>
          </div>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            disabled={saving}
            type="submit"
            className="rounded-xl bg-[#f97316] px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {saving ? "Đang lưu..." : "Lưu cấu hình"}
          </button>
        </div>
      </form>

      {loading ? <div className="text-sm text-[#98a0c2]">Đang tải danh sách kỹ sư...</div> : null}
      {error ? <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}
      {message ? <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</div> : null}

      <div className="space-y-2">
        {(payload?.rows || []).map((row) => (
          <div key={row.id} className="rounded-2xl border border-[#2f3555] bg-[#171c2f] p-4">
            <div className="text-sm font-semibold text-[#f0f2ff]">{row.fullName}</div>
            <div className="text-xs text-[#98a0c2]">{row.email}</div>
            {row.config ? (
              <div className="mt-2 text-sm text-[#d9def3]">
                Lương max: <b>{currency(row.config.salaryMax)}</b> · Cứng: <b>{currency(row.config.baseSalary)}</b> · Thưởng max: <b>{currency(row.config.bonusMax)}</b>
              </div>
            ) : (
              <div className="mt-2 text-sm text-[#ffd9a8]">Chưa cấu hình lương</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
