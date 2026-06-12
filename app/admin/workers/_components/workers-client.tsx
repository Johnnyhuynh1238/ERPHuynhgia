"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GRADE_LABEL,
  WORKER_STATUS_LABEL,
  WORKER_STATUS_OPTIONS,
} from "@/lib/worker-management";

type ProjectOption = { id: string; name: string };
type GradeRate = { grade: number; dailyRate: number; note: string | null };

type WorkerRow = {
  id: string;
  fullName: string;
  phone: string | null;
  cccd: string | null;
  role: "tho" | "phu";
  grade: number | null;
  workerStatus: keyof typeof WORKER_STATUS_LABEL;
  dailyRate: number | null;
  rating: number | null;
  onboardedAt: string | null;
  project: { id: string; name: string } | null;
};

type Props = {
  projects: ProjectOption[];
  rates: GradeRate[];
  canManage: boolean;
  userRole: string;
};

function fmtVnd(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("vi-VN").format(n);
}

function statusChipCls(s: WorkerRow["workerStatus"]) {
  switch (s) {
    case "trial":
      return "bg-amber-500/20 text-amber-200 ring-amber-400/40";
    case "active":
      return "bg-emerald-500/20 text-emerald-200 ring-emerald-400/40";
    case "standby":
      return "bg-sky-500/20 text-sky-200 ring-sky-400/40";
    case "inactive":
      return "bg-white/10 text-white/60 ring-white/20";
    case "blacklist":
      return "bg-rose-500/20 text-rose-200 ring-rose-400/40";
  }
}

export function WorkersClient({ projects, rates, canManage }: Props) {
  const [tab, setTab] = useState<"all" | "standby">("all");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterGrade, setFilterGrade] = useState<string>("");
  const [filterProject, setFilterProject] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [rows, setRows] = useState<WorkerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (tab === "standby") {
      params.set("status", "standby");
    } else if (filterStatus) {
      params.set("status", filterStatus);
    }
    if (filterGrade) params.set("grade", filterGrade);
    if (filterProject) params.set("projectId", filterProject);
    if (q.trim()) params.set("q", q.trim());
    try {
      const res = await fetch(`/api/admin/workers?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      setRows(Array.isArray(json.workers) ? json.workers : []);
    } finally {
      setLoading(false);
    }
  }, [tab, filterStatus, filterGrade, filterProject, q]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const ratesMap = useMemo(() => {
    const m = new Map<number, GradeRate>();
    rates.forEach((r) => m.set(r.grade, r));
    return m;
  }, [rates]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Hồ sơ thợ</h1>
          <p className="text-sm text-white/60">
            Quản lý thợ công ty, bậc lương và danh sách gọi lại.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-400"
          >
            + Thêm thợ
          </button>
        )}
      </header>

      <div className="flex gap-2 border-b border-white/10">
        <button
          type="button"
          onClick={() => setTab("all")}
          className={`-mb-px border-b-2 px-3 py-2 text-sm ${
            tab === "all"
              ? "border-orange-400 text-orange-200"
              : "border-transparent text-white/60"
          }`}
        >
          Toàn bộ
        </button>
        <button
          type="button"
          onClick={() => setTab("standby")}
          className={`-mb-px border-b-2 px-3 py-2 text-sm ${
            tab === "standby"
              ? "border-orange-400 text-orange-200"
              : "border-transparent text-white/60"
          }`}
        >
          Danh sách gọi lại
        </button>
      </div>

      {tab === "all" && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded bg-white/5 px-3 py-2 text-sm text-white ring-1 ring-white/10"
          >
            <option value="">Mọi trạng thái</option>
            {WORKER_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={filterGrade}
            onChange={(e) => setFilterGrade(e.target.value)}
            className="rounded bg-white/5 px-3 py-2 text-sm text-white ring-1 ring-white/10"
          >
            <option value="">Mọi bậc</option>
            {[1, 2, 3, 4, 5].map((g) => (
              <option key={g} value={g}>
                {GRADE_LABEL[g]}
              </option>
            ))}
          </select>
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="rounded bg-white/5 px-3 py-2 text-sm text-white ring-1 ring-white/10"
          >
            <option value="">Mọi công trình</option>
            <option value="none">— Chưa gắn —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm tên/SĐT/CCCD"
            className="rounded bg-white/5 px-3 py-2 text-sm text-white ring-1 ring-white/10 placeholder:text-white/40"
          />
        </div>
      )}

      <div className="overflow-x-auto rounded-lg ring-1 ring-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-white/70">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Tên</th>
              <th className="px-3 py-2 text-left font-medium">SĐT</th>
              <th className="px-3 py-2 text-left font-medium">Bậc</th>
              <th className="px-3 py-2 text-left font-medium">Trạng thái</th>
              <th className="px-3 py-2 text-left font-medium">Công nhật</th>
              <th className="px-3 py-2 text-left font-medium">Công trình</th>
              <th className="px-3 py-2 text-left font-medium">Rating</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-white/50">
                  Đang tải…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-white/50">
                  Không có thợ nào.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((w) => (
                <tr key={w.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/workers/${w.id}`}
                      className="font-medium text-white hover:text-orange-300"
                    >
                      {w.fullName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-white/80">{w.phone ?? "—"}</td>
                  <td className="px-3 py-2 text-white/80">
                    {w.grade ? `B${w.grade}` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded px-2 py-0.5 text-[11px] ring-1 ${statusChipCls(
                        w.workerStatus,
                      )}`}
                    >
                      {WORKER_STATUS_LABEL[w.workerStatus]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-white/80">{fmtVnd(w.dailyRate)}</td>
                  <td className="px-3 py-2 text-white/80">
                    {w.project?.name ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-white/80">
                    {w.rating != null ? w.rating.toFixed(1) : "—"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showCreate && canManage && (
        <CreateWorkerModal
          projects={projects}
          rates={ratesMap}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void fetchList();
          }}
        />
      )}
    </div>
  );
}

function CreateWorkerModal({
  projects,
  rates,
  onClose,
  onCreated,
}: {
  projects: ProjectOption[];
  rates: Map<number, GradeRate>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [cccd, setCccd] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankName, setBankName] = useState("");
  const [grade, setGrade] = useState<string>("");
  const [workerStatus, setWorkerStatus] = useState<string>("trial");
  const [projectId, setProjectId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const suggestedRate = grade ? rates.get(Number(grade))?.dailyRate : null;

  const submit = async () => {
    setErr(null);
    if (!fullName.trim()) {
      setErr("Cần họ tên");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim() || null,
          cccd: cccd.trim() || null,
          bankAccount: bankAccount.trim() || null,
          bankName: bankName.trim() || null,
          grade: grade ? Number(grade) : null,
          workerStatus,
          projectId: projectId || null,
          notes: notes.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json.message || `Lỗi ${res.status}`);
        return;
      }
      onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/60 p-4">
      <div className="mt-10 w-full max-w-lg rounded-lg bg-neutral-900 p-5 ring-1 ring-white/10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Thêm thợ</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/60 hover:text-white"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Họ tên *">
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded bg-white/5 px-3 py-2 text-sm text-white ring-1 ring-white/10"
            />
          </Field>
          <Field label="SĐT">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded bg-white/5 px-3 py-2 text-sm text-white ring-1 ring-white/10"
            />
          </Field>
          <Field label="CCCD">
            <input
              value={cccd}
              onChange={(e) => setCccd(e.target.value)}
              className="w-full rounded bg-white/5 px-3 py-2 text-sm text-white ring-1 ring-white/10"
            />
          </Field>
          <Field label="STK ngân hàng">
            <input
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
              className="w-full rounded bg-white/5 px-3 py-2 text-sm text-white ring-1 ring-white/10"
            />
          </Field>
          <Field label="Ngân hàng">
            <input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="w-full rounded bg-white/5 px-3 py-2 text-sm text-white ring-1 ring-white/10"
            />
          </Field>
          <Field label="Bậc">
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="w-full rounded bg-white/5 px-3 py-2 text-sm text-white ring-1 ring-white/10"
            >
              <option value="">— Chưa xếp —</option>
              {[1, 2, 3, 4, 5].map((g) => (
                <option key={g} value={g}>
                  {GRADE_LABEL[g]}
                </option>
              ))}
            </select>
            {suggestedRate != null && (
              <p className="mt-1 text-[11px] text-white/50">
                Công nhật chuẩn: {fmtVnd(suggestedRate)} đ
              </p>
            )}
          </Field>
          <Field label="Trạng thái">
            <select
              value={workerStatus}
              onChange={(e) => setWorkerStatus(e.target.value)}
              className="w-full rounded bg-white/5 px-3 py-2 text-sm text-white ring-1 ring-white/10"
            >
              {WORKER_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Công trình">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded bg-white/5 px-3 py-2 text-sm text-white ring-1 ring-white/10"
            >
              <option value="">— Chưa gắn —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Ghi chú">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded bg-white/5 px-3 py-2 text-sm text-white ring-1 ring-white/10"
              />
            </Field>
          </div>
        </div>
        {err && <p className="mt-3 text-sm text-rose-300">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-white/5 px-4 py-2 text-sm text-white ring-1 ring-white/10"
            disabled={submitting}
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-400 disabled:opacity-60"
          >
            {submitting ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-white/50">
        {label}
      </span>
      {children}
    </label>
  );
}
