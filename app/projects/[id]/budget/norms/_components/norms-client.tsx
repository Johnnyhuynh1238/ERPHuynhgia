"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { normCategoryLabel } from "@/lib/budget-suggested-components";

type MaterialItem = { name: string; unit: string; qtyPerUnit: number; note?: string | null };
type LaborItem = { grade: string; qtyPerUnit: number; note?: string | null };
type MachineItem = { name: string; qtyPerUnit: number; note?: string | null };

type Norm = {
  code: string;
  name: string;
  unit: string;
  category: string | null;
  materialItems: MaterialItem[];
  laborItems: LaborItem[];
  machineItems: MachineItem[];
  kMaterial: number;
  kLabor: number;
  kMachine: number;
  source: string | null;
  note: string | null;
  usageCount: number;
};

type Props = {
  projectId: string;
  projectName: string;
  projectCode: string;
  canEdit: boolean;
};

export function NormsClient({ projectId, projectName, projectCode, canEdit }: Props) {
  const [loading, setLoading] = useState(true);
  const [norms, setNorms] = useState<Norm[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [openCode, setOpenCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/norms?usage=1&projectId=${encodeURIComponent(projectId)}`);
      if (!r.ok) throw new Error("Tải định mức thất bại");
      const data = await r.json();
      setNorms(data.norms as Norm[]);
      setCategories(data.categories as string[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return norms.filter((n) => {
      if (categoryFilter !== "all" && (n.category ?? "") !== categoryFilter) return false;
      if (!q) return true;
      return (
        n.code.toLowerCase().includes(q) ||
        n.name.toLowerCase().includes(q)
      );
    });
  }, [norms, search, categoryFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, Norm[]>();
    for (const n of filtered) {
      const key = n.category ?? "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const openNorm = openCode ? norms.find((n) => n.code === openCode) ?? null : null;

  const updateNormLocal = useCallback((code: string, patch: Partial<Norm>) => {
    setNorms((prev) => prev.map((n) => (n.code === code ? { ...n, ...patch } : n)));
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/projects/${projectId}/budget`}
          className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          ← Dự toán
        </Link>
        <div className="text-right">
          <div className="text-xs text-zinc-500">{projectCode}</div>
          <h1 className="text-sm font-semibold text-zinc-100 sm:text-base">📋 Định mức — {projectName}</h1>
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3 text-[11px] text-zinc-400">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Định mức dùng chung toàn hệ thống (nguồn: TT 12/2021 BXD)</span>
          <span className="font-mono text-zinc-200">{norms.length} mã</span>
        </div>
        {canEdit ? (
          <div className="mt-1 text-[10px] text-zinc-500">TPTC chỉnh hệ số K (VT/NC/MM) để khớp thực tế; hao phí gốc giữ nguyên.</div>
        ) : (
          <div className="mt-1 text-[10px] text-zinc-500">View-only — liên hệ TPTC để chỉnh hệ số K.</div>
        )}
      </div>

      <div className="space-y-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm mã hoặc tên định mức…"
          className="w-full rounded-xl border border-[#252840] bg-[#1a1d2e] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-orange-500/40 focus:outline-none"
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={`rounded-full px-2.5 py-1 text-[11px] ${categoryFilter === "all" ? "bg-orange-500/20 text-orange-200 ring-1 ring-orange-500/40" : "bg-zinc-800 text-zinc-400"}`}
          >
            Tất cả
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategoryFilter(c)}
              className={`rounded-full px-2.5 py-1 text-[11px] ${categoryFilter === c ? "bg-orange-500/20 text-orange-200 ring-1 ring-orange-500/40" : "bg-zinc-800 text-zinc-400"}`}
            >
              {normCategoryLabel(c)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-zinc-500">Đang tải…</div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-zinc-500">Không có định mức khớp</div>
      ) : (
        grouped.map(([cat, list]) => (
          <section key={cat || "khac"} className="space-y-1.5">
            <div className="px-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              {normCategoryLabel(cat)} <span className="text-zinc-600">· {list.length}</span>
            </div>
            <div className="overflow-hidden rounded-2xl border border-[#252840] bg-[#1a1d2e]">
              {list.map((n, i) => (
                <button
                  key={n.code}
                  type="button"
                  onClick={() => setOpenCode(n.code)}
                  className={`flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left active:bg-zinc-800/40 ${i > 0 ? "border-t border-[#252840]" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">{n.code}</span>
                      <span className="text-[10px] text-zinc-500">/ {n.unit}</span>
                      {n.usageCount > 0 && (
                        <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-300">
                          {n.usageCount} công tác
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[13px] font-medium text-zinc-100">{n.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
                      <KBadge label="VT" value={n.kMaterial} tone="emerald" />
                      <KBadge label="NC" value={n.kLabor} tone="amber" />
                      <KBadge label="MM" value={n.kMachine} tone="violet" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      {openNorm && (
        <NormDetailSheet
          norm={openNorm}
          canEdit={canEdit}
          onClose={() => setOpenCode(null)}
          onPatched={(patch) => updateNormLocal(openNorm.code, patch)}
        />
      )}
    </div>
  );
}

function KBadge({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "violet" }) {
  const active = Math.abs(value - 1) > 1e-6;
  const base =
    tone === "emerald"
      ? active
        ? "bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-500/40"
        : "bg-emerald-500/10 text-emerald-300/70"
      : tone === "amber"
        ? active
          ? "bg-amber-500/25 text-amber-200 ring-1 ring-amber-500/40"
          : "bg-amber-500/10 text-amber-300/70"
        : active
          ? "bg-violet-500/25 text-violet-200 ring-1 ring-violet-500/40"
          : "bg-violet-500/10 text-violet-300/70";
  return (
    <span className={`rounded px-1.5 py-0.5 font-mono ${base}`}>
      K_{label} ×{value.toFixed(2)}
    </span>
  );
}

function NormDetailSheet({
  norm,
  canEdit,
  onClose,
  onPatched,
}: {
  norm: Norm;
  canEdit: boolean;
  onClose: () => void;
  onPatched: (patch: Partial<Norm>) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl border border-[#252840] bg-[#1a1d2e] p-4 sm:max-w-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">{norm.code}</span>
              <span className="text-[10px] text-zinc-500">/ {norm.unit}</span>
              {norm.category && (
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                  {normCategoryLabel(norm.category)}
                </span>
              )}
            </div>
            <div className="mt-1 text-sm font-semibold text-zinc-100">{norm.name}</div>
            {norm.source && <div className="mt-0.5 text-[10px] text-zinc-500">Nguồn: {norm.source}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
          >
            Đóng
          </button>
        </div>

        <KEditor norm={norm} canEdit={canEdit} onPatched={onPatched} />

        <BreakdownSection
          title="Vật tư"
          tone="emerald"
          k={norm.kMaterial}
          unit={norm.unit}
          rows={(norm.materialItems ?? []).map((m) => ({
            primary: m.name,
            unit: m.unit,
            qty: Number(m.qtyPerUnit),
            note: m.note ?? null,
          }))}
        />
        <BreakdownSection
          title="Nhân công"
          tone="amber"
          k={norm.kLabor}
          unit={norm.unit}
          rows={(norm.laborItems ?? []).map((l) => ({
            primary: `Bậc ${l.grade}`,
            unit: "công",
            qty: Number(l.qtyPerUnit),
            note: l.note ?? null,
          }))}
        />
        <BreakdownSection
          title="Máy thi công"
          tone="violet"
          k={norm.kMachine}
          unit={norm.unit}
          rows={(norm.machineItems ?? []).map((m) => ({
            primary: m.name,
            unit: "ca",
            qty: Number(m.qtyPerUnit),
            note: m.note ?? null,
          }))}
        />

        {norm.note && (
          <div className="mt-3 rounded-xl border border-[#252840] bg-[#11131f] p-2.5 text-[11px] text-zinc-400">
            <div className="mb-0.5 text-[10px] uppercase tracking-wide text-zinc-500">Ghi chú</div>
            {norm.note}
          </div>
        )}
      </div>
    </div>
  );
}

function KEditor({
  norm,
  canEdit,
  onPatched,
}: {
  norm: Norm;
  canEdit: boolean;
  onPatched: (patch: Partial<Norm>) => void;
}) {
  const [vt, setVt] = useState(norm.kMaterial.toString());
  const [nc, setNc] = useState(norm.kLabor.toString());
  const [mm, setMm] = useState(norm.kMachine.toString());
  const [saving, setSaving] = useState<null | "vt" | "nc" | "mm">(null);

  useEffect(() => {
    setVt(norm.kMaterial.toString());
    setNc(norm.kLabor.toString());
    setMm(norm.kMachine.toString());
  }, [norm.code, norm.kMaterial, norm.kLabor, norm.kMachine]);

  async function save(field: "vt" | "nc" | "mm", raw: string, currentValue: number) {
    if (!canEdit) return;
    const v = Number(raw.replace(",", "."));
    if (!Number.isFinite(v) || v < 0 || v > 10) {
      toast.error("Hệ số K phải nằm trong [0, 10]");
      if (field === "vt") setVt(currentValue.toString());
      else if (field === "nc") setNc(currentValue.toString());
      else setMm(currentValue.toString());
      return;
    }
    if (Math.abs(v - currentValue) < 1e-6) return;
    setSaving(field);
    try {
      const body =
        field === "vt"
          ? { kMaterial: v }
          : field === "nc"
            ? { kLabor: v }
            : { kMachine: v };
      const r = await fetch(`/api/norms/${encodeURIComponent(norm.code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message || "Lưu thất bại");
      }
      const patch: Partial<Norm> =
        field === "vt"
          ? { kMaterial: v }
          : field === "nc"
            ? { kLabor: v }
            : { kMachine: v };
      onPatched(patch);
      toast.success("Đã lưu hệ số K");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi lưu");
      if (field === "vt") setVt(currentValue.toString());
      else if (field === "nc") setNc(currentValue.toString());
      else setMm(currentValue.toString());
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mb-3 grid grid-cols-3 gap-2">
      <KInput
        label="K_VT"
        tone="emerald"
        value={vt}
        onChange={setVt}
        onCommit={() => save("vt", vt, norm.kMaterial)}
        disabled={!canEdit}
        saving={saving === "vt"}
      />
      <KInput
        label="K_NC"
        tone="amber"
        value={nc}
        onChange={setNc}
        onCommit={() => save("nc", nc, norm.kLabor)}
        disabled={!canEdit}
        saving={saving === "nc"}
      />
      <KInput
        label="K_MM"
        tone="violet"
        value={mm}
        onChange={setMm}
        onCommit={() => save("mm", mm, norm.kMachine)}
        disabled={!canEdit}
        saving={saving === "mm"}
      />
    </div>
  );
}

function KInput({
  label,
  tone,
  value,
  onChange,
  onCommit,
  disabled,
  saving,
}: {
  label: string;
  tone: "emerald" | "amber" | "violet";
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  disabled: boolean;
  saving: boolean;
}) {
  const ring =
    tone === "emerald"
      ? "focus:border-emerald-500/50 focus:ring-emerald-500/30"
      : tone === "amber"
        ? "focus:border-amber-500/50 focus:ring-amber-500/30"
        : "focus:border-violet-500/50 focus:ring-violet-500/30";
  return (
    <label className="block rounded-xl border border-[#252840] bg-[#11131f] p-2">
      <div className="flex items-center justify-between text-[10px] text-zinc-500">
        <span>{label}</span>
        {saving && <span className="text-orange-300">…</span>}
      </div>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        disabled={disabled}
        className={`mt-0.5 w-full rounded bg-transparent text-center font-mono text-sm text-zinc-100 outline-none ${ring} disabled:text-zinc-400`}
      />
    </label>
  );
}

function BreakdownSection({
  title,
  tone,
  k,
  unit,
  rows,
}: {
  title: string;
  tone: "emerald" | "amber" | "violet";
  k: number;
  unit: string;
  rows: { primary: string; unit: string; qty: number; note: string | null }[];
}) {
  if (rows.length === 0) return null;
  const kActive = Math.abs(k - 1) > 1e-6;
  const accent =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "amber"
        ? "text-amber-300"
        : "text-violet-300";
  return (
    <div className="mt-3 rounded-xl border border-[#252840] bg-[#11131f] p-2.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className={`font-medium ${accent}`}>{title}</span>
        <span className="text-[10px] text-zinc-500">
          hao phí cho 1 {unit}
          {kActive ? <span className="ml-1 text-zinc-400">· đã × K {k.toFixed(2)}</span> : null}
        </span>
      </div>
      <div className="mt-1.5 divide-y divide-[#252840]">
        {rows.map((r, i) => {
          const effective = r.qty * k;
          return (
            <div key={i} className="flex items-baseline justify-between gap-2 py-1.5 text-[12px]">
              <div className="min-w-0 flex-1">
                <div className="truncate text-zinc-200">{r.primary}</div>
                {r.note && <div className="text-[10px] text-zinc-500">{r.note}</div>}
              </div>
              <div className="shrink-0 text-right font-mono">
                <div className="text-zinc-400">
                  {r.qty} {r.unit}
                </div>
                {kActive && (
                  <div className={accent}>
                    → {Number(effective.toFixed(4))} {r.unit}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
