"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Session = "morning" | "afternoon";

type Worker = {
  id: string;
  fullName: string;
  phone: string | null;
  role: "tho" | "phu";
  sortRank: number;
  hasIdCardPhoto: boolean;
  present: boolean;
};

type Payload = {
  project: { id: string; code: string; name: string };
  session: Session;
  date: string;
  workers: Worker[];
};

const SESSION_LABEL: Record<Session, string> = {
  morning: "buổi sáng",
  afternoon: "buổi chiều",
};
const ROLE_LABEL: Record<"tho" | "phu", string> = { tho: "Thợ", phu: "Phụ" };

export function ChamCongThoClient({
  projectId,
  initialSession,
}: {
  projectId: string;
  initialSession: Session;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<Session>(initialSession);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  // workerId → timestamp tick gần nhất (để sort khối "đã tick" theo thứ tự tick mới nhất lên đầu)
  const [tickedAtMap, setTickedAtMap] = useState<Record<string, number>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<Worker | null>(null);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [deletingWorker, setDeletingWorker] = useState<Worker | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cham-cong-tho/${projectId}?session=${session}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Không tải được dữ liệu");
      setData(json);
      const initialTicked: Record<string, number> = {};
      (json.workers as Worker[]).forEach((w, idx) => {
        if (w.present) initialTicked[w.id] = -1000 + idx; // load từ DB → giữ thứ tự gốc, không nhảy lên
      });
      setTickedAtMap(initialTicked);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [projectId, session]);

  useEffect(() => {
    load();
  }, [load]);

  // đồng bộ URL khi đổi session
  useEffect(() => {
    const cur = searchParams.get("session");
    if (cur !== session) {
      router.replace(`/cham-cong-tho/${projectId}?session=${session}`);
    }
  }, [session, projectId, router, searchParams]);

  const toggle = (workerId: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const workers = prev.workers.map((w) =>
        w.id === workerId ? { ...w, present: !w.present } : w,
      );
      return { ...prev, workers };
    });
    setTickedAtMap((prev) => {
      const next = { ...prev };
      if (next[workerId]) {
        delete next[workerId];
      } else {
        next[workerId] = Date.now();
      }
      return next;
    });
  };

  const sortedWorkers = useMemo(() => {
    if (!data) return [];
    const ticked: Worker[] = [];
    const rest: Worker[] = [];
    for (const w of data.workers) {
      if (w.present) ticked.push(w);
      else rest.push(w);
    }
    ticked.sort((a, b) => (tickedAtMap[b.id] || 0) - (tickedAtMap[a.id] || 0));
    rest.sort((a, b) => {
      if (b.sortRank !== a.sortRank) return b.sortRank - a.sortRank;
      return a.fullName.localeCompare(b.fullName, "vi");
    });
    return [...ticked, ...rest];
  }, [data, tickedAtMap]);

  const presentCount = data?.workers.filter((w) => w.present).length || 0;
  const totalCount = data?.workers.length || 0;

  const handleUpdated = (updated: Worker) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            workers: prev.workers.map((w) =>
              w.id === updated.id ? { ...w, ...updated, present: w.present } : w,
            ),
          }
        : prev,
    );
    setEditingWorker(null);
  };

  const handleDelete = async () => {
    if (!deletingWorker) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/cham-cong-tho/${projectId}/workers/${deletingWorker.id}`,
        { method: "DELETE" },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || "Xoá thất bại");
      setData((prev) =>
        prev
          ? { ...prev, workers: prev.workers.filter((w) => w.id !== deletingWorker.id) }
          : prev,
      );
      setTickedAtMap((prev) => {
        const next = { ...prev };
        delete next[deletingWorker.id];
        return next;
      });
      setDeletingWorker(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi xoá thợ");
    } finally {
      setDeleting(false);
    }
  };

  const save = async () => {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const presentWorkerIds = data.workers.filter((w) => w.present).map((w) => w.id);
      const res = await fetch(`/api/cham-cong-tho/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, presentWorkerIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Lưu thất bại");
      setSavedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi lưu chấm công");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f1118] text-[#f0f2ff]">
      <header className="sticky top-0 z-10 border-b border-[#252840] bg-[#0f1118]/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div>
            <Link href="/reports" className="text-xs text-[#8892b0] hover:text-[#a78bfa]">
              ← Nhiệm vụ hôm nay
            </Link>
            <h1 className="mt-1 text-lg font-bold">
              Chấm công thợ {SESSION_LABEL[session]}
            </h1>
            {data?.project && (
              <p className="text-xs text-[#8892b0]">
                {data.project.code} · {data.project.name}
              </p>
            )}
          </div>
          <div className="text-right text-xs">
            <div className="text-[#a78bfa] font-semibold text-base">
              {presentCount}/{totalCount}
            </div>
            <div className="text-[#8892b0]">đã chấm</div>
          </div>
        </div>

        <div className="mx-auto max-w-2xl px-4 pb-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSession("morning")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                session === "morning"
                  ? "border-[#a78bfa] bg-[#1a1d2e] text-[#a78bfa]"
                  : "border-[#252840] text-[#8892b0]"
              }`}
            >
              Sáng
            </button>
            <button
              type="button"
              onClick={() => setSession("afternoon")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                session === "afternoon"
                  ? "border-[#a78bfa] bg-[#1a1d2e] text-[#a78bfa]"
                  : "border-[#252840] text-[#8892b0]"
              }`}
            >
              Chiều
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4 pb-32">
        {loading && <p className="text-center text-[#8892b0]">Đang tải…</p>}
        {error && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {!loading && data && (
          <>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="mb-4 w-full rounded-lg border border-dashed border-[#252840] py-3 text-sm text-[#a78bfa] hover:bg-[#1a1d2e]"
            >
              + Thêm thợ mới
            </button>

            {sortedWorkers.length === 0 && (
              <p className="text-center text-sm text-[#8892b0]">
                Chưa có thợ nào. Bấm &ldquo;Thêm thợ mới&rdquo; để bắt đầu.
              </p>
            )}

            <ul className="space-y-2">
              {sortedWorkers.map((w) => {
                const isTicked = w.present;
                return (
                  <li
                    key={w.id}
                    onClick={() => toggle(w.id)}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition-all ${
                      isTicked
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-[#252840] bg-[#1a1d2e]"
                    }`}
                  >
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 ${
                        isTicked ? "border-emerald-400 bg-emerald-500" : "border-[#3a3d52]"
                      }`}
                    >
                      {isTicked && (
                        <svg viewBox="0 0 16 16" className="h-4 w-4 text-white">
                          <path
                            d="M3 8.5l3 3 7-7"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{w.fullName}</div>
                      <div className="flex items-center gap-2 text-xs text-[#8892b0]">
                        <span>{ROLE_LABEL[w.role]}</span>
                        {w.phone && <span>· {w.phone}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActionsFor(w);
                      }}
                      aria-label="Tuỳ chọn thợ"
                      className="shrink-0 rounded-lg p-2 text-[#8892b0] hover:bg-[#0f1118] hover:text-[#f0f2ff]"
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                        <circle cx="5" cy="12" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="19" cy="12" r="2" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 border-t border-[#252840] bg-[#0f1118]/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="text-xs text-[#8892b0]">
            {savedAt
              ? `Đã lưu lúc ${savedAt.toLocaleTimeString("vi-VN")}`
              : "Tick xong nhấn Lưu chấm công"}
          </div>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? "Đang lưu…" : "Lưu chấm công"}
          </Button>
        </div>
      </footer>

      {addOpen && (
        <AddWorkerModal
          projectId={projectId}
          onClose={() => setAddOpen(false)}
          onCreated={(worker) => {
            setData((prev) =>
              prev ? { ...prev, workers: [worker, ...prev.workers] } : prev,
            );
            setAddOpen(false);
          }}
        />
      )}

      {actionsFor && (
        <WorkerActionSheet
          worker={actionsFor}
          onClose={() => setActionsFor(null)}
          onEdit={() => {
            setEditingWorker(actionsFor);
            setActionsFor(null);
          }}
          onDelete={() => {
            setDeletingWorker(actionsFor);
            setActionsFor(null);
          }}
        />
      )}

      {editingWorker && (
        <EditWorkerModal
          projectId={projectId}
          worker={editingWorker}
          onClose={() => setEditingWorker(null)}
          onUpdated={handleUpdated}
        />
      )}

      {deletingWorker && (
        <DeleteWorkerDialog
          worker={deletingWorker}
          submitting={deleting}
          onCancel={() => setDeletingWorker(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

function AddWorkerModal({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: (w: Worker) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"tho" | "phu">("tho");
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idCardInputRef = useRef<HTMLInputElement | null>(null);

  const submit = async () => {
    if (!fullName.trim()) {
      setError("Nhập họ tên");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("fullName", fullName.trim());
      fd.append("phone", phone.trim());
      fd.append("role", role);
      if (idCardFile) fd.append("idCard", idCardFile);
      const res = await fetch(`/api/cham-cong-tho/${projectId}/workers`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Tạo thợ thất bại");
      onCreated(json.worker);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tạo thợ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center">
      <div className="w-full max-w-lg rounded-t-2xl border border-[#252840] bg-[#0f1118] p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#f0f2ff]">Thêm thợ mới</h2>
          <button onClick={onClose} className="text-[#8892b0]">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-[#8892b0]">Họ và tên *</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#252840] bg-[#1a1d2e] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#a78bfa]"
              placeholder="Nguyễn Văn A"
              maxLength={100}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-[#8892b0]">Số điện thoại</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              className="mt-1 w-full rounded-lg border border-[#252840] bg-[#1a1d2e] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#a78bfa]"
              placeholder="09xx..."
              maxLength={20}
            />
          </div>
          <div>
            <label className="text-xs text-[#8892b0]">Chức danh *</label>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setRole("tho")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  role === "tho"
                    ? "border-[#a78bfa] bg-[#1a1d2e] text-[#a78bfa]"
                    : "border-[#252840] text-[#8892b0]"
                }`}
              >
                Thợ
              </button>
              <button
                type="button"
                onClick={() => setRole("phu")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  role === "phu"
                    ? "border-[#a78bfa] bg-[#1a1d2e] text-[#a78bfa]"
                    : "border-[#252840] text-[#8892b0]"
                }`}
              >
                Phụ
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-[#8892b0]">Ảnh CCCD</label>
            <input
              ref={idCardInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => setIdCardFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => idCardInputRef.current?.click()}
              className="mt-1 w-full rounded-lg border border-dashed border-[#252840] py-3 text-sm text-[#8892b0] hover:bg-[#1a1d2e]"
            >
              {idCardFile ? `✓ ${idCardFile.name}` : "📷 Chụp / chọn ảnh CCCD"}
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[#252840] py-2 text-sm text-[#8892b0]"
          >
            Huỷ
          </button>
          <Button onClick={submit} disabled={submitting} className="flex-1">
            {submitting ? "Đang lưu…" : "Thêm"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function WorkerActionSheet({
  worker,
  onClose,
  onEdit,
  onDelete,
}: {
  worker: Worker;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl border border-[#252840] bg-[#0f1118] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 px-1">
          <div className="text-sm font-semibold text-[#f0f2ff]">{worker.fullName}</div>
          <div className="text-xs text-[#8892b0]">
            {ROLE_LABEL[worker.role]}
            {worker.phone ? ` · ${worker.phone}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="w-full rounded-xl border border-[#252840] bg-[#1a1d2e] px-4 py-3 text-left text-sm font-medium text-[#f0f2ff] hover:bg-[#252840]"
        >
          ✏️ Sửa thông tin
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="mt-2 w-full rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-left text-sm font-medium text-red-300 hover:bg-red-500/20"
        >
          🗑 Xoá thợ
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-xl border border-[#252840] px-4 py-3 text-sm text-[#8892b0]"
        >
          Huỷ
        </button>
      </div>
    </div>
  );
}

function EditWorkerModal({
  projectId,
  worker,
  onClose,
  onUpdated,
}: {
  projectId: string;
  worker: Worker;
  onClose: () => void;
  onUpdated: (w: Worker) => void;
}) {
  const [fullName, setFullName] = useState(worker.fullName);
  const [phone, setPhone] = useState(worker.phone || "");
  const [role, setRole] = useState<"tho" | "phu">(worker.role);
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idCardInputRef = useRef<HTMLInputElement | null>(null);

  const submit = async () => {
    if (!fullName.trim()) {
      setError("Nhập họ tên");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("fullName", fullName.trim());
      fd.append("phone", phone.trim());
      fd.append("role", role);
      if (idCardFile) fd.append("idCard", idCardFile);
      const res = await fetch(`/api/cham-cong-tho/${projectId}/workers/${worker.id}`, {
        method: "PATCH",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || "Cập nhật thất bại");
      onUpdated(json.worker);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi cập nhật");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center">
      <div className="w-full max-w-lg rounded-t-2xl border border-[#252840] bg-[#0f1118] p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#f0f2ff]">Sửa thông tin thợ</h2>
          <button onClick={onClose} className="text-[#8892b0]">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-[#8892b0]">Họ và tên *</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#252840] bg-[#1a1d2e] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#a78bfa]"
              maxLength={100}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-[#8892b0]">Số điện thoại</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              className="mt-1 w-full rounded-lg border border-[#252840] bg-[#1a1d2e] px-3 py-2 text-sm text-[#f0f2ff] outline-none focus:border-[#a78bfa]"
              placeholder="09xx..."
              maxLength={20}
            />
          </div>
          <div>
            <label className="text-xs text-[#8892b0]">Chức danh *</label>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setRole("tho")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  role === "tho"
                    ? "border-[#a78bfa] bg-[#1a1d2e] text-[#a78bfa]"
                    : "border-[#252840] text-[#8892b0]"
                }`}
              >
                Thợ
              </button>
              <button
                type="button"
                onClick={() => setRole("phu")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  role === "phu"
                    ? "border-[#a78bfa] bg-[#1a1d2e] text-[#a78bfa]"
                    : "border-[#252840] text-[#8892b0]"
                }`}
              >
                Phụ
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-[#8892b0]">
              Ảnh CCCD {worker.hasIdCardPhoto && <span className="text-emerald-400">· đã có</span>}
            </label>
            <input
              ref={idCardInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => setIdCardFile(e.target.files?.[0] || null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => idCardInputRef.current?.click()}
              className="mt-1 w-full rounded-lg border border-dashed border-[#252840] py-3 text-sm text-[#8892b0] hover:bg-[#1a1d2e]"
            >
              {idCardFile
                ? `✓ ${idCardFile.name}`
                : worker.hasIdCardPhoto
                  ? "📷 Đổi ảnh CCCD"
                  : "📷 Chụp / chọn ảnh CCCD"}
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[#252840] py-2 text-sm text-[#8892b0]"
          >
            Huỷ
          </button>
          <Button onClick={submit} disabled={submitting} className="flex-1">
            {submitting ? "Đang lưu…" : "Lưu"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DeleteWorkerDialog({
  worker,
  submitting,
  onCancel,
  onConfirm,
}: {
  worker: Worker;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[#252840] bg-[#0f1118] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-[#f0f2ff]">Xoá thợ?</h2>
        <p className="mt-2 text-sm text-[#8892b0]">
          Xoá <span className="font-medium text-[#f0f2ff]">{worker.fullName}</span> khỏi danh sách
          chấm công của dự án. Lịch sử chấm công cũ vẫn được giữ.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 rounded-lg border border-[#252840] py-2 text-sm text-[#8892b0]"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 rounded-lg bg-red-500 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-60"
          >
            {submitting ? "Đang xoá…" : "Xoá"}
          </button>
        </div>
      </div>
    </div>
  );
}
