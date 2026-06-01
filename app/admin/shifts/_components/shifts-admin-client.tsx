"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DAYS_OF_WEEK, dayLabels } from "@/lib/shifts";

type Candidate = {
  id: string;
  fullName: string;
  email: string;
  role: string;
};

type ShiftRow = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  isActive: boolean;
  note: string | null;
  assignedCount: number;
};

type Assignment = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: string;
  userActive: boolean;
  daysOfWeek: number[];
  isActive: boolean;
};

const ALL_DAYS = DAYS_OF_WEEK.map((d) => d.value);

function roleLabel(role: string) {
  if (role === "engineer") return "KS";
  if (role === "accountant") return "Kế toán";
  return role;
}

export function ShiftsAdminClient({ candidates }: { candidates: Candidate[] }) {
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ShiftRow | null>(null);

  const loadShifts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/shifts", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Không tải được ca");
      setShifts(data.shifts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi không xác định");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAssignments = useCallback(async (shiftId: string) => {
    setAssignLoading(true);
    try {
      const res = await fetch(`/api/admin/shifts/${shiftId}/assignments`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Không tải được danh sách gán");
      setAssignments(data.assignments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi không xác định");
      setAssignments([]);
    } finally {
      setAssignLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  useEffect(() => {
    if (selectedId) loadAssignments(selectedId);
    else setAssignments([]);
  }, [selectedId, loadAssignments]);

  const selectedShift = useMemo(
    () => shifts.find((s) => s.id === selectedId) || null,
    [shifts, selectedId],
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-white">Ca làm việc</h1>
        <p className="text-sm text-white/60">
          Kế toán cấu hình ca làm việc, giờ vào/ra và gán KS / kế toán vào từng ca.
        </p>
      </header>

      {error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Danh sách ca</h2>
            <Button onClick={() => setShowCreate(true)}>+ Thêm ca</Button>
          </div>
          {loading ? (
            <div className="py-6 text-center text-sm text-white/50">Đang tải…</div>
          ) : shifts.length === 0 ? (
            <div className="py-6 text-center text-sm text-white/50">
              Chưa có ca nào. Bấm “Thêm ca” để tạo.
            </div>
          ) : (
            <ul className="divide-y divide-white/10">
              {shifts.map((s) => {
                const active = s.id === selectedId;
                return (
                  <li
                    key={s.id}
                    className={`flex items-center justify-between gap-3 py-3 ${
                      active ? "bg-white/5 -mx-4 px-4 rounded" : ""
                    }`}
                  >
                    <button
                      onClick={() => setSelectedId(s.id)}
                      className="flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{s.name}</span>
                        {!s.isActive ? (
                          <span className="rounded bg-white/10 px-1.5 text-[10px] uppercase text-white/60">
                            Ngưng
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-white/60">
                        {s.startTime} → {s.endTime} · trễ {s.graceMinutes}′ ·{" "}
                        {s.assignedCount} người
                      </div>
                      {s.note ? (
                        <div className="text-[11px] text-white/40">{s.note}</div>
                      ) : null}
                    </button>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditing(s)}
                        className="rounded border border-white/15 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                      >
                        Sửa
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm(`Xóa ca "${s.name}"? Mọi gán sẽ bị gỡ.`)) return;
                          const res = await fetch(`/api/admin/shifts/${s.id}`, {
                            method: "DELETE",
                          });
                          if (!res.ok) {
                            const data = await res.json().catch(() => ({}));
                            alert(data?.message || "Xóa thất bại");
                            return;
                          }
                          if (selectedId === s.id) setSelectedId(null);
                          loadShifts();
                        }}
                        className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-200 hover:bg-red-500/10"
                      >
                        Xóa
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-base font-semibold text-white">
            {selectedShift ? `Gán người vào "${selectedShift.name}"` : "Chọn 1 ca ở bên trái"}
          </h2>
          {!selectedShift ? (
            <div className="py-8 text-center text-sm text-white/40">
              Chọn 1 ca để xem & chỉnh danh sách KS / kế toán.
            </div>
          ) : (
            <AssignmentEditor
              shiftId={selectedShift.id}
              assignments={assignments}
              loading={assignLoading}
              candidates={candidates}
              onChanged={() => {
                loadAssignments(selectedShift.id);
                loadShifts();
              }}
            />
          )}
        </section>
      </div>

      {showCreate ? (
        <ShiftFormModal
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            loadShifts();
          }}
        />
      ) : null}

      {editing ? (
        <ShiftFormModal
          mode="edit"
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadShifts();
          }}
        />
      ) : null}
    </div>
  );
}

function AssignmentEditor({
  shiftId,
  assignments,
  loading,
  candidates,
  onChanged,
}: {
  shiftId: string;
  assignments: Assignment[];
  loading: boolean;
  candidates: Candidate[];
  onChanged: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [newUserId, setNewUserId] = useState<string>("");
  const [newDays, setNewDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const assignedIds = useMemo(
    () => new Set(assignments.map((a) => a.userId)),
    [assignments],
  );

  const available = candidates.filter((c) => !assignedIds.has(c.id));

  async function save() {
    if (!newUserId) {
      setErr("Chọn người để gán");
      return;
    }
    if (newDays.length === 0) {
      setErr("Chọn ít nhất 1 ngày");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/shifts/${shiftId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: newUserId, daysOfWeek: newDays }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Gán thất bại");
      setNewUserId("");
      setNewDays([1, 2, 3, 4, 5, 6]);
      setPicking(false);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  async function updateDays(userId: string, daysOfWeek: number[]) {
    setBusy(true);
    try {
      await fetch(`/api/admin/shifts/${shiftId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, daysOfWeek }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function removeAssignment(userId: string) {
    if (!confirm("Gỡ người này khỏi ca?")) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/shifts/${shiftId}/assignments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="py-6 text-center text-sm text-white/50">Đang tải…</div>
      ) : assignments.length === 0 ? (
        <div className="rounded border border-dashed border-white/10 p-4 text-center text-sm text-white/40">
          Chưa có ai trong ca này.
        </div>
      ) : (
        <ul className="divide-y divide-white/10">
          {assignments.map((a) => (
            <li key={a.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-white/70">
                      {roleLabel(a.role)}
                    </span>
                    <span className="font-medium text-white">{a.fullName}</span>
                    {!a.userActive ? (
                      <span className="rounded bg-amber-500/20 px-1.5 text-[10px] text-amber-200">
                        ngưng việc
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-white/50">{a.email}</div>
                </div>
                <button
                  onClick={() => removeAssignment(a.userId)}
                  disabled={busy}
                  className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-200 hover:bg-red-500/10 disabled:opacity-50"
                >
                  Gỡ
                </button>
              </div>
              <DayPicker
                value={a.daysOfWeek}
                onChange={(days) => updateDays(a.userId, days)}
                disabled={busy}
              />
              <div className="text-[11px] text-white/40">
                Ngày làm: {a.daysOfWeek.length ? dayLabels(a.daysOfWeek) : "—"}
              </div>
            </li>
          ))}
        </ul>
      )}

      {picking ? (
        <div className="space-y-3 rounded border border-white/10 bg-slate-900/40 p-3">
          <div className="text-sm font-medium text-white">Gán người mới</div>
          <select
            value={newUserId}
            onChange={(e) => setNewUserId(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-white"
          >
            <option value="">— Chọn KS / kế toán —</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                [{roleLabel(c.role)}] {c.fullName} ({c.email})
              </option>
            ))}
          </select>
          <DayPicker value={newDays} onChange={setNewDays} disabled={busy} />
          {err ? <div className="text-xs text-red-300">{err}</div> : null}
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy}>
              {busy ? "Đang lưu…" : "Lưu"}
            </Button>
            <button
              onClick={() => {
                setPicking(false);
                setErr(null);
              }}
              className="rounded border border-white/15 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
            >
              Hủy
            </button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          className="w-full border-white/15 bg-slate-900"
          onClick={() => setPicking(true)}
          disabled={available.length === 0}
        >
          {available.length === 0 ? "Đã gán tất cả người có thể" : "+ Gán người vào ca"}
        </Button>
      )}
    </div>
  );
}

function DayPicker({
  value,
  onChange,
  disabled,
}: {
  value: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
}) {
  const set = new Set(value);
  return (
    <div className="flex flex-wrap gap-1.5">
      {DAYS_OF_WEEK.map((d) => {
        const on = set.has(d.value);
        return (
          <button
            key={d.value}
            type="button"
            disabled={disabled}
            onClick={() => {
              const next = new Set(value);
              if (on) next.delete(d.value);
              else next.add(d.value);
              onChange(Array.from(next).sort((a, b) => a - b));
            }}
            className={`rounded-md border px-2 py-1 text-xs ${
              on
                ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-100"
                : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10"
            } disabled:opacity-50`}
          >
            {d.label}
          </button>
        );
      })}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(value.length === ALL_DAYS.length ? [] : ALL_DAYS)}
        className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/60 hover:bg-white/10 disabled:opacity-50"
      >
        {value.length === ALL_DAYS.length ? "Bỏ hết" : "Cả tuần"}
      </button>
    </div>
  );
}

function ShiftFormModal({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: ShiftRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [startTime, setStartTime] = useState(initial?.startTime ?? "08:00");
  const [endTime, setEndTime] = useState(initial?.endTime ?? "17:00");
  const [graceMinutes, setGraceMinutes] = useState(initial?.graceMinutes ?? 5);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [note, setNote] = useState(initial?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        name: name.trim(),
        startTime,
        endTime,
        graceMinutes: Number(graceMinutes) || 0,
        isActive,
        note: note.trim(),
      };
      const url =
        mode === "create" ? "/api/admin/shifts" : `/api/admin/shifts/${initial!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Lưu thất bại");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-xl border border-white/10 bg-slate-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white">
          {mode === "create" ? "Tạo ca mới" : `Sửa ca "${initial?.name}"`}
        </h3>
        <label className="block space-y-1 text-sm">
          <span className="text-white/70">Tên ca</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Ca sáng / Hành chính / Ca chiều"
            className="w-full rounded-md border border-white/10 bg-slate-800 px-3 py-2 text-white"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1 text-sm">
            <span className="text-white/70">Giờ vào</span>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-slate-800 px-3 py-2 text-white"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-white/70">Giờ ra</span>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-slate-800 px-3 py-2 text-white"
            />
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-white/70">Cho phép trễ (phút)</span>
          <input
            type="number"
            min={0}
            max={60}
            value={graceMinutes}
            onChange={(e) => setGraceMinutes(Number(e.target.value))}
            className="w-full rounded-md border border-white/10 bg-slate-800 px-3 py-2 text-white"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-white/70">Ghi chú</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-slate-800 px-3 py-2 text-white"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Đang sử dụng
        </label>
        {err ? <div className="text-sm text-red-300">{err}</div> : null}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-white/15 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
          >
            Hủy
          </button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Đang lưu…" : "Lưu"}
          </Button>
        </div>
      </div>
    </div>
  );
}
