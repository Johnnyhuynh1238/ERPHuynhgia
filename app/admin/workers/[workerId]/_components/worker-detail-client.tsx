"use client";

import { confirmDialog } from "@/components/confirm-dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  GRADE_HISTORY_STATUS_LABEL,
  GRADE_LABEL,
  WORKER_STATUS_LABEL,
  WORKER_STATUS_OPTIONS,
} from "@/lib/worker-management";

type GradeProposal = {
  id: string;
  fromGrade: number | null;
  toGrade: number;
  reason: string;
  evidenceUrl: string | null;
  status: "pending" | "approved" | "rejected";
  rejectReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  proposedBy: { id: string; fullName: string } | null;
  approvedBy: { id: string; fullName: string } | null;
};

type Worker = {
  id: string;
  fullName: string;
  phone: string | null;
  cccd: string | null;
  bankAccount: string | null;
  bankName: string | null;
  role: "tho" | "phu";
  grade: number | null;
  workerStatus: keyof typeof WORKER_STATUS_LABEL;
  dailyRate: number | null;
  rating: number | null;
  notes: string | null;
  onboardedAt: string | null;
  project: { id: string; name: string } | null;
  gradeHistory: GradeProposal[];
};

type Props = {
  worker: Worker;
  projects: { id: string; name: string }[];
  rates: { grade: number; dailyRate: number; note: string | null }[];
  canManage: boolean;
  canPropose: boolean;
  canApprove: boolean;
};

function fmtVnd(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("vi-VN").format(n);
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString("vi-VN");
}

export function WorkerDetailClient({
  worker,
  projects,
  rates,
  canManage,
  canPropose,
  canApprove,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [showPropose, setShowPropose] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pending = worker.gradeHistory.find((g) => g.status === "pending");

  const onAction = async (proposalId: string, action: "approve" | "reject") => {
    setErr(null);
    let rejectReason: string | null = null;
    if (action === "reject") {
      const r = window.prompt("Lý do từ chối (tùy chọn):");
      if (r === null) return;
      rejectReason = r.trim() || null;
    } else if (
      !await confirmDialog("Duyệt đề xuất này? Bậc và công nhật sẽ cập nhật ngay.")
    ) {
      return;
    }
    const res = await fetch(
      `/api/admin/workers/${worker.id}/grade-proposals/${proposalId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rejectReason }),
      },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(json.message || `Lỗi ${res.status}`);
      return;
    }
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Link href="/admin/workers" className="text-sm text-white/60 hover:text-white">
          ← Danh sách thợ
        </Link>
      </div>

      <section className="rounded-lg bg-white/5 p-5 ring-1 ring-white/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-white">{worker.fullName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/70">
              <span>
                {worker.grade ? GRADE_LABEL[worker.grade] : "Chưa xếp bậc"}
              </span>
              <span>·</span>
              <span>{WORKER_STATUS_LABEL[worker.workerStatus]}</span>
              <span>·</span>
              <span>{worker.phone ?? "—"}</span>
            </div>
          </div>
          <div className="flex gap-2">
            {canPropose && !pending && (
              <button
                type="button"
                onClick={() => setShowPropose(true)}
                className="rounded bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-400"
              >
                Đề xuất đổi bậc
              </button>
            )}
            {canManage && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded bg-white/10 px-3 py-2 text-sm text-white ring-1 ring-white/10"
              >
                Sửa hồ sơ
              </button>
            )}
          </div>
        </div>

        {pending && (
          <div className="mt-4 rounded border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                Đang chờ duyệt đổi bậc:{" "}
                <strong>
                  {pending.fromGrade ? `B${pending.fromGrade}` : "—"} → B
                  {pending.toGrade}
                </strong>{" "}
                — đề xuất bởi {pending.proposedBy?.fullName ?? "?"}
              </div>
              {canApprove && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void onAction(pending.id, "approve")}
                    className="rounded bg-emerald-500 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-400"
                  >
                    Duyệt
                  </button>
                  <button
                    type="button"
                    onClick={() => void onAction(pending.id, "reject")}
                    className="rounded bg-rose-500 px-3 py-1 text-xs font-medium text-white hover:bg-rose-400"
                  >
                    Từ chối
                  </button>
                </div>
              )}
            </div>
            <div className="mt-1 text-xs text-amber-100/80">
              Lý do: {pending.reason}
            </div>
          </div>
        )}

        <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Info label="Công nhật">{fmtVnd(worker.dailyRate)} đ</Info>
          <Info label="Công trình">
            {worker.project?.name ?? "— Chưa gắn —"}
          </Info>
          <Info label="CCCD">{worker.cccd ?? "—"}</Info>
          <Info label="STK ngân hàng">
            {worker.bankAccount ? `${worker.bankAccount} (${worker.bankName ?? "?"})` : "—"}
          </Info>
          <Info label="Onboarded">{fmtDate(worker.onboardedAt)}</Info>
          <Info label="Rating">
            {worker.rating != null ? worker.rating.toFixed(2) : "—"}
          </Info>
          {worker.notes && (
            <div className="sm:col-span-2">
              <Info label="Ghi chú">{worker.notes}</Info>
            </div>
          )}
        </dl>
      </section>

      <section className="rounded-lg bg-white/5 p-5 ring-1 ring-white/10">
        <h2 className="text-base font-semibold text-white">Lịch sử bậc</h2>
        {worker.gradeHistory.length === 0 ? (
          <p className="mt-2 text-sm text-white/50">Chưa có đề xuất nào.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {worker.gradeHistory.map((h) => (
              <li
                key={h.id}
                className="rounded border border-white/10 bg-black/20 p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-white">
                    {h.fromGrade ? `B${h.fromGrade}` : "—"} → B{h.toGrade}
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] ring-1 ${
                      h.status === "approved"
                        ? "bg-emerald-500/20 text-emerald-200 ring-emerald-400/40"
                        : h.status === "rejected"
                        ? "bg-rose-500/20 text-rose-200 ring-rose-400/40"
                        : "bg-amber-500/20 text-amber-200 ring-amber-400/40"
                    }`}
                  >
                    {GRADE_HISTORY_STATUS_LABEL[h.status]}
                  </span>
                </div>
                <div className="mt-1 text-xs text-white/60">
                  Lý do: {h.reason}
                </div>
                <div className="mt-1 text-xs text-white/50">
                  Đề xuất: {h.proposedBy?.fullName ?? "?"} ·{" "}
                  {fmtDate(h.createdAt)}
                </div>
                {h.status !== "pending" && (
                  <div className="text-xs text-white/50">
                    {h.status === "approved" ? "Duyệt" : "Từ chối"} bởi{" "}
                    {h.approvedBy?.fullName ?? "?"} · {fmtDate(h.approvedAt)}
                    {h.rejectReason ? ` — ${h.rejectReason}` : ""}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {err && <p className="text-sm text-rose-300">{err}</p>}

      {editing && canManage && (
        <EditWorkerModal
          worker={worker}
          projects={projects}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      )}

      {showPropose && canPropose && (
        <ProposeGradeModal
          workerId={worker.id}
          currentGrade={worker.grade}
          rates={rates}
          onClose={() => setShowPropose(false)}
          onSaved={() => {
            setShowPropose(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-white/40">
        {label}
      </dt>
      <dd className="text-white">{children}</dd>
    </div>
  );
}

function EditWorkerModal({
  worker,
  projects,
  onClose,
  onSaved,
}: {
  worker: Worker;
  projects: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(worker.fullName);
  const [phone, setPhone] = useState(worker.phone ?? "");
  const [cccd, setCccd] = useState(worker.cccd ?? "");
  const [bankAccount, setBankAccount] = useState(worker.bankAccount ?? "");
  const [bankName, setBankName] = useState(worker.bankName ?? "");
  const [workerStatus, setWorkerStatus] = useState<string>(worker.workerStatus);
  const [projectId, setProjectId] = useState<string>(worker.project?.id ?? "");
  const [notes, setNotes] = useState(worker.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/workers/${worker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          phone,
          cccd,
          bankAccount,
          bankName,
          workerStatus,
          projectId: projectId || null,
          notes,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json.message || `Lỗi ${res.status}`);
        return;
      }
      onSaved();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/60 p-4">
      <div className="mt-10 w-full max-w-lg rounded-lg bg-neutral-900 p-5 ring-1 ring-white/10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Sửa hồ sơ</h2>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white">
            ✕
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Họ tên">
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
          <Field label="STK">
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
            disabled={submitting}
            className="rounded bg-white/5 px-4 py-2 text-sm text-white ring-1 ring-white/10"
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

function ProposeGradeModal({
  workerId,
  currentGrade,
  rates,
  onClose,
  onSaved,
}: {
  workerId: string;
  currentGrade: number | null;
  rates: { grade: number; dailyRate: number; note: string | null }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [toGrade, setToGrade] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const targetRate = toGrade
    ? rates.find((r) => r.grade === Number(toGrade))?.dailyRate ?? null
    : null;

  const submit = async () => {
    setErr(null);
    if (!toGrade) {
      setErr("Cần chọn bậc đích");
      return;
    }
    if (reason.trim().length < 5) {
      setErr("Lý do cần ít nhất 5 ký tự");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/workers/${workerId}/grade-proposals`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toGrade: Number(toGrade), reason: reason.trim() }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json.message || `Lỗi ${res.status}`);
        return;
      }
      onSaved();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/60 p-4">
      <div className="mt-10 w-full max-w-md rounded-lg bg-neutral-900 p-5 ring-1 ring-white/10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Đề xuất đổi bậc</h2>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white">
            ✕
          </button>
        </div>
        <div className="space-y-3">
          <Field label="Bậc hiện tại">
            <div className="rounded bg-white/5 px-3 py-2 text-sm text-white/70 ring-1 ring-white/10">
              {currentGrade ? GRADE_LABEL[currentGrade] : "Chưa xếp"}
            </div>
          </Field>
          <Field label="Bậc đề xuất">
            <select
              value={toGrade}
              onChange={(e) => setToGrade(e.target.value)}
              className="w-full rounded bg-white/5 px-3 py-2 text-sm text-white ring-1 ring-white/10"
            >
              <option value="">— Chọn —</option>
              {[1, 2, 3, 4, 5]
                .filter((g) => g !== currentGrade)
                .map((g) => (
                  <option key={g} value={g}>
                    {GRADE_LABEL[g]}
                  </option>
                ))}
            </select>
            {targetRate != null && (
              <p className="mt-1 text-[11px] text-white/50">
                Công nhật mới: {fmtVnd(targetRate)} đ
              </p>
            )}
          </Field>
          <Field label="Lý do (kèm số liệu nếu có)">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded bg-white/5 px-3 py-2 text-sm text-white ring-1 ring-white/10"
              placeholder="VD: 4 tuần sản lượng +20%, 0 lỗi QC."
            />
          </Field>
        </div>
        {err && <p className="mt-3 text-sm text-rose-300">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded bg-white/5 px-4 py-2 text-sm text-white ring-1 ring-white/10"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-400 disabled:opacity-60"
          >
            {submitting ? "Đang gửi…" : "Gửi đề xuất"}
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
