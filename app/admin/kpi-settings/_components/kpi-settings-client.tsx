"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type KpiSettingRow = {
  id: string | null;
  weightTienDo: number;
  weightQc: number;
  weightBaoCao: number;
  weightChuNha: number;
  weightDongGop: number;
  effectiveFromMonth: string;
  changedBy: string | null;
  changedAt: string | null;
  reason: string | null;
  isFallback?: boolean;
  changer?: {
    id: string;
    fullName: string;
    email: string;
  } | null;
};

type Props = {
  initialData: {
    month: string;
    active: KpiSettingRow;
    history: KpiSettingRow[];
  };
};

const ITEMS = [
  { key: "weightTienDo", label: "Tiến độ", icon: "📅", color: "bg-sky-400" },
  { key: "weightQc", label: "Chất lượng QC", icon: "✅", color: "bg-emerald-400" },
  { key: "weightBaoCao", label: "Báo cáo", icon: "📝", color: "bg-violet-400" },
  { key: "weightChuNha", label: "Chủ nhà", icon: "😊", color: "bg-amber-400" },
  { key: "weightDongGop", label: "Đóng góp", icon: "⭐", color: "bg-rose-400" },
] as const;

type WeightKey = (typeof ITEMS)[number]["key"];

function nextMonthString() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("vi-VN");
}

export function KpiSettingsClient({ initialData }: Props) {
  const [active] = useState(initialData.active);
  const [history, setHistory] = useState(initialData.history);
  const [weights, setWeights] = useState<Record<WeightKey, number>>({
    weightTienDo: active.weightTienDo,
    weightQc: active.weightQc,
    weightBaoCao: active.weightBaoCao,
    weightChuNha: active.weightChuNha,
    weightDongGop: active.weightDongGop,
  });
  const [effectiveFromMonth, setEffectiveFromMonth] = useState(nextMonthString());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const total = useMemo(() => ITEMS.reduce((sum, item) => sum + weights[item.key], 0), [weights]);
  const canSave = total === 100 && Boolean(reason.trim()) && effectiveFromMonth >= nextMonthString() && !saving;

  function setWeight(key: WeightKey, value: string) {
    const next = Number(value);
    setWeights((prev) => ({ ...prev, [key]: Number.isFinite(next) ? Math.max(0, Math.min(100, next)) : 0 }));
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/kpi-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...weights,
          effectiveFromMonth,
          reason: reason.trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { message?: string; setting?: KpiSettingRow };
      if (!res.ok) {
        throw new Error(json.message || "Không lưu được cấu hình KPI");
      }
      if (json.setting) {
        setHistory((prev) => [json.setting!, ...prev.filter((row) => row.id !== json.setting!.id)]);
      }
      setReason("");
      toast.success(json.message || "Đã lưu cấu hình KPI mới");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không lưu được cấu hình KPI");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1117] px-4 py-6 text-[#f0f2f8]">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <div className="text-sm text-[#8891aa]">Admin</div>
          <h1 className="text-2xl font-bold">Cài đặt trọng số KPI</h1>
          <p className="mt-1 text-sm text-[#8891aa]">KPI tháng {initialData.month} đang dùng cấu hình hiệu lực từ {active.effectiveFromMonth}.</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-3xl border border-[#2e3347] bg-[#1a1d27] p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-[#8891aa]">Trọng số mới</div>
                <div className="text-sm text-[#c8d0e8]">Chỉ tạo record mới, không sửa lịch sử cũ.</div>
              </div>
              <div className={`rounded-2xl px-4 py-2 text-center ${total === 100 ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
                <div className="text-xs uppercase tracking-wide">Tổng</div>
                <div className="text-xl font-bold">{total}%</div>
              </div>
            </div>

            <div className="space-y-3">
              {ITEMS.map((item) => (
                <div key={item.key} className="grid gap-2 rounded-2xl border border-[#2e3347] bg-[#222637] p-3 md:grid-cols-[1fr_120px] md:items-center">
                  <div className="flex items-center gap-3">
                    <span className="text-xl" aria-hidden>{item.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{item.label}</div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#11131b]">
                        <div className={`${item.color} h-full rounded-full`} style={{ width: `${weights[item.key]}%` }} />
                      </div>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 justify-self-start md:justify-self-end">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={weights[item.key]}
                      onChange={(event) => setWeight(item.key, event.target.value)}
                      className="w-24 rounded-xl border border-[#3a4058] bg-[#11131b] px-3 py-2 text-right text-sm outline-none focus:border-amber-500"
                    />
                    <span className="text-sm text-[#8891aa]">%</span>
                  </label>
                </div>
              ))}
            </div>

            {total !== 100 ? <div className="mt-3 text-sm text-rose-300">Tổng trọng số phải đúng 100%.</div> : null}

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="block">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#8891aa]">Áp dụng từ tháng</div>
                <input
                  type="month"
                  min={nextMonthString()}
                  value={effectiveFromMonth}
                  onChange={(event) => setEffectiveFromMonth(event.target.value)}
                  className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2 text-sm outline-none focus:border-amber-500"
                />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#8891aa]">Lý do thay đổi *</div>
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Nhập lý do"
                  className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2 text-sm outline-none focus:border-amber-500"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end">
              <Button onClick={save} disabled={!canSave} className="bg-amber-500 text-[#0f1117] hover:bg-amber-600">
                {saving ? "Đang lưu..." : "Lưu thay đổi"}
              </Button>
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-3xl border border-[#2e3347] bg-[#1a1d27] p-5">
              <div className="text-xs font-bold uppercase tracking-wide text-[#8891aa]">Preview hiện tại vs mới</div>
              <div className="mt-4 space-y-3">
                {ITEMS.map((item) => {
                  const current = active[item.key];
                  const next = weights[item.key];
                  return (
                    <div key={item.key}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span>{item.label}</span>
                        <span className="text-[#8891aa]">{current}% → {next}%</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="h-2 overflow-hidden rounded-full bg-[#11131b]"><div className="h-full rounded-full bg-[#697089]" style={{ width: `${current}%` }} /></div>
                        <div className="h-2 overflow-hidden rounded-full bg-[#11131b]"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${next}%` }} /></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-3xl border border-[#2e3347] bg-[#1a1d27] p-5">
              <div className="text-xs font-bold uppercase tracking-wide text-[#8891aa]">Lịch sử thay đổi</div>
              <div className="mt-4 space-y-3">
                {history.length === 0 ? <div className="text-sm text-[#8891aa]">Chưa có lịch sử cấu hình</div> : null}
                {history.map((row) => (
                  <div key={row.id || row.effectiveFromMonth} className="rounded-2xl border border-[#2e3347] bg-[#222637] p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">{row.effectiveFromMonth}{row.effectiveFromMonth === active.effectiveFromMonth ? " · hiện tại" : ""}</div>
                      <div className="text-xs text-[#8891aa]">{formatDateTime(row.changedAt)}</div>
                    </div>
                    <div className="mt-1 text-[#c8d0e8]">
                      {row.weightTienDo}/{row.weightQc}/{row.weightBaoCao}/{row.weightChuNha}/{row.weightDongGop}
                    </div>
                    {row.reason ? <div className="mt-1 text-xs text-[#8891aa]">{row.reason}</div> : null}
                    {row.changer ? <div className="mt-1 text-xs text-[#8891aa]">Bởi {row.changer.fullName}</div> : null}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
