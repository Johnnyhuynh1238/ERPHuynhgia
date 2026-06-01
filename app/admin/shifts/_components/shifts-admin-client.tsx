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

type AssignmentForUser = {
  id: string;
  shiftId: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  shiftActive: boolean;
  daysOfWeek: number[];
  isActive: boolean;
};

type UserWithAssignments = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  assignments: AssignmentForUser[];
};

const ALL_DAYS = DAYS_OF_WEEK.map((d) => d.value);

function roleLabel(role: string) {
  if (role === "engineer") return "KS";
  if (role === "accountant") return "Kế toán";
  return role;
}

export function ShiftsAdminClient({ candidates }: { candidates: Candidate[] }) {
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [users, setUsers] = useState<UserWithAssignments[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ShiftRow | null>(null);
  const [roleFilter, setRoleFilter] = useState<"all" | "engineer" | "accountant">("all");

  const loadShifts = useCallback(async () => {
    setLoadingShifts(true);
    try {
      const res = await fetch("/api/admin/shifts", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Không tải được ca");
      setShifts(data.shifts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi không xác định");
    } finally {
      setLoadingShifts(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/admin/shift-assignments", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Không tải được nhân sự");
      setUsers(data.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi không xác định");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    loadShifts();
    loadUsers();
  }, [loadShifts, loadUsers]);

  const refreshAll = useCallback(() => {
    loadShifts();
    loadUsers();
  }, [loadShifts, loadUsers]);

  const filteredUsers = useMemo(() => {
    if (roleFilter === "all") return users;
    return users.filter((u) => u.role === roleFilter);
  }, [users, roleFilter]);

  const fallbackCandidates = useMemo(
    () =>
      candidates.map((c) => ({
        id: c.id,
        fullName: c.fullName,
        email: c.email,
        role: c.role,
        assignments: [] as AssignmentForUser[],
      })),
    [candidates],
  );

  const usersToShow = users.length > 0 || !loadingUsers ? filteredUsers : fallbackCandidates;

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

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Danh sách ca</h2>
            <Button onClick={() => setShowCreate(true)}>+ Thêm ca</Button>
          </div>
          {loadingShifts ? (
            <div className="py-6 text-center text-sm text-white/50">Đang tải…</div>
          ) : shifts.length === 0 ? (
            <div className="py-6 text-center text-sm text-white/50">
              Chưa có ca nào. Bấm “Thêm ca” để tạo.
            </div>
          ) : (
            <ul className="divide-y divide-white/10">
              {shifts.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex-1">
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
                  </div>
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
                        refreshAll();
                      }}
                      className="rounded border border-red-500/40 px-2 py-1 text-xs text-red-200 hover:bg-red-500/10"
                    >
                      Xóa
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-white">Gán nhân sự vào ca</h2>
            <div className="flex gap-1 rounded-md border border-white/10 bg-slate-900/40 p-0.5 text-xs">
              {([
                ["all", "Tất cả"],
                ["engineer", "KS"],
                ["accountant", "Kế toán"],
              ] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setRoleFilter(val)}
                  className={`rounded px-2 py-1 ${
                    roleFilter === val
                      ? "bg-white/10 text-white"
                      : "text-white/60 hover:bg-white/5"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loadingUsers && users.length === 0 ? (
            <div className="py-6 text-center text-sm text-white/50">Đang tải…</div>
          ) : usersToShow.length === 0 ? (
            <div className="py-6 text-center text-sm text-white/40">
              Không có nhân sự phù hợp.
            </div>
          ) : (
            <ul className="divide-y divide-white/10">
              {usersToShow.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  shifts={shifts}
                  onChanged={refreshAll}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {showCreate ? (
        <ShiftFormModal
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            refreshAll();
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
            refreshAll();
          }}
        />
      ) : null}
    </div>
  );
}

function UserRow({
  user,
  shifts,
  onChanged,
}: {
  user: UserWithAssignments;
  shifts: ShiftRow[];
  onChanged: () => void;
}) {
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const [busy, setBusy] = useState(false);

  const assignedShiftIds = new Set(user.assignments.map((a) => a.shiftId));
  const availableShifts = shifts.filter((s) => s.isActive && !assignedShiftIds.has(s.id));

  async function updateDays(shiftId: string, daysOfWeek: number[]) {
    if (daysOfWeek.length === 0) {
      alert("Phải chọn ít nhất 1 ngày");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/shifts/${shiftId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, daysOfWeek }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.message || "Lưu thất bại");
        return;
      }
      setEditingShiftId(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function removeAssignment(shiftId: string, shiftName: string) {
    if (!confirm(`Gỡ ${user.fullName} khỏi ca "${shiftName}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/shifts/${shiftId}/assignments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.message || "Gỡ thất bại");
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-white/70">
              {roleLabel(user.role)}
            </span>
            <span className="truncate font-medium text-white">{user.fullName}</span>
          </div>
          <div className="truncate text-[11px] text-white/50">{user.email}</div>
        </div>
        {availableShifts.length > 0 ? (
          <button
            onClick={() => setShowAssign((v) => !v)}
            disabled={busy}
            className="rounded border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {showAssign ? "Hủy" : user.assignments.length > 0 ? "+ Gán thêm" : "+ Gán ca"}
          </button>
        ) : (
          <span className="text-[11px] text-white/40">Đã ở tất cả ca</span>
        )}
      </div>

      {user.assignments.length === 0 && !showAssign ? (
        <div className="rounded border border-dashed border-white/10 px-3 py-2 text-xs text-white/40">
          Chưa được gán ca nào.
        </div>
      ) : null}

      {user.assignments.map((a) => {
        const isEditing = editingShiftId === a.shiftId;
        return (
          <div
            key={a.id}
            className="rounded-md border border-white/10 bg-slate-900/40 p-2.5 text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white">{a.shiftName}</span>
                  <span className="text-white/60">
                    {a.startTime}–{a.endTime}
                  </span>
                  {!a.shiftActive ? (
                    <span className="rounded bg-white/10 px-1.5 text-[10px] uppercase text-white/60">
                      Ca ngưng
                    </span>
                  ) : null}
                </div>
                <div className="text-[11px] text-white/50">
                  Ngày làm:{" "}
                  <span className="text-white/80">
                    {a.daysOfWeek.length ? dayLabels(a.daysOfWeek) : "—"}
                  </span>{" "}
                  · trễ {a.graceMinutes}′
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setEditingShiftId(isEditing ? null : a.shiftId)}
                  className="rounded border border-white/15 px-2 py-0.5 text-[11px] text-white/80 hover:bg-white/10"
                >
                  {isEditing ? "Đóng" : "Sửa ngày"}
                </button>
                <button
                  onClick={() => removeAssignment(a.shiftId, a.shiftName)}
                  disabled={busy}
                  className="rounded border border-red-500/40 px-2 py-0.5 text-[11px] text-red-200 hover:bg-red-500/10 disabled:opacity-50"
                >
                  Gỡ
                </button>
              </div>
            </div>
            {isEditing ? (
              <div className="mt-2 space-y-2">
                <DayPicker
                  value={a.daysOfWeek}
                  onChange={(days) => updateDays(a.shiftId, days)}
                  disabled={busy}
                />
                <div className="text-[10px] text-white/40">
                  Đổi ngày sẽ lưu ngay.
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      {showAssign && availableShifts.length > 0 ? (
        <AssignForm
          userId={user.id}
          shifts={availableShifts}
          busy={busy}
          onCancel={() => setShowAssign(false)}
          onSaved={() => {
            setShowAssign(false);
            onChanged();
          }}
        />
      ) : null}
    </li>
  );
}

function AssignForm({
  userId,
  shifts,
  busy,
  onCancel,
  onSaved,
}: {
  userId: string;
  shifts: ShiftRow[];
  busy: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [shiftId, setShiftId] = useState<string>(shifts[0]?.id ?? "");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!shiftId) {
      setErr("Chọn ca");
      return;
    }
    if (days.length === 0) {
      setErr("Chọn ít nhất 1 ngày");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/shifts/${shiftId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, daysOfWeek: days }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Gán thất bại");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-emerald-400/30 bg-emerald-500/5 p-3 text-xs">
      <label className="block space-y-1">
        <span className="text-white/70">Ca</span>
        <select
          value={shiftId}
          onChange={(e) => setShiftId(e.target.value)}
          className="w-full rounded-md border border-white/10 bg-slate-900 px-2 py-1.5 text-white"
        >
          {shifts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.startTime}–{s.endTime})
            </option>
          ))}
        </select>
      </label>
      <div className="space-y-1">
        <span className="text-white/70">Ngày trong tuần</span>
        <DayPicker value={days} onChange={setDays} disabled={saving || busy} />
      </div>
      {err ? <div className="text-red-300">{err}</div> : null}
      <div className="flex gap-2">
        <Button onClick={save} disabled={saving || busy}>
          {saving ? "Đang lưu…" : "Gán"}
        </Button>
        <button
          onClick={onCancel}
          className="rounded border border-white/15 px-3 py-1 text-white/80 hover:bg-white/10"
        >
          Hủy
        </button>
      </div>
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
