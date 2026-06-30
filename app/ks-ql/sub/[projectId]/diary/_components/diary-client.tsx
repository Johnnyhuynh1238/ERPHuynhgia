"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  Users,
  ListChecks,
  Camera,
  Building2,
  AlertTriangle,
  Save,
  Loader2,
  X,
  Upload,
  CheckCircle2,
  History,
  Pencil,
  Plus,
} from "lucide-react";

type Photo = { key: string; contentType: string };

type Activity = {
  kind: "proposal" | "receive";
  at: string;
  label: string;
  href: string;
  sub?: string;
};

type DiaryDay = {
  id: string;
  workerCount: number;
  tasksDone: string;
  issues: string | null;
  taskPhotos: Photo[];
  sitePhotos: Photo[];
  savedAt: string | null;
  updatedAt: string;
};

type DiaryResponse = {
  project: { id: string; name: string };
  entryDate: string;
  diary: DiaryDay | null;
  activities: Activity[];
};

type HistoryItem = {
  id: string;
  entryDate: string;
  workerCount: number;
  tasksDone: string;
  issues: string | null;
  taskCount: number;
  siteCount: number;
  savedAt: string | null;
};

function fmtDateVn(ymd: string) {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function fmtTimeVn(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function photoSrc(projectId: string, key: string) {
  return `/api/ks-ql/projects/${projectId}/diary/photos/file?key=${encodeURIComponent(key)}`;
}

export function DiaryClient({
  projectId,
  todayYmd,
}: {
  projectId: string;
  todayYmd: string;
}) {
  const [data, setData] = useState<DiaryResponse | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [workerCount, setWorkerCount] = useState(0);
  const [tasksDone, setTasksDone] = useState("");
  const [issues, setIssues] = useState("");

  const taskFileRef = useRef<HTMLInputElement>(null);
  const siteFileRef = useRef<HTMLInputElement>(null);
  const [uploadingTask, setUploadingTask] = useState(false);
  const [uploadingSite, setUploadingSite] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [detailDate, setDetailDate] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch(`/api/ks-ql/projects/${projectId}/diary?date=${todayYmd}`, { cache: "no-store" }),
        fetch(`/api/ks-ql/projects/${projectId}/diary/list?take=14`, { cache: "no-store" }),
      ]);
      if (r1.ok) {
        const d: DiaryResponse = await r1.json();
        setData(d);
        if (d.diary) {
          setWorkerCount(d.diary.workerCount);
          setTasksDone(d.diary.tasksDone);
          setIssues(d.diary.issues || "");
        }
      }
      if (r2.ok) {
        const j = await r2.json();
        setHistory(j.items || []);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, todayYmd]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const flash = (type: "ok" | "err", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3000);
  };

  const upsertDiary = async (finalize: boolean) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/ks-ql/projects/${projectId}/diary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: todayYmd,
          workerCount,
          tasksDone,
          issues,
          finalize,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        flash("err", j.message || "Lưu thất bại");
        return false;
      }
      flash("ok", finalize ? "Đã chốt nhật ký hôm nay" : "Đã lưu nháp");
      await loadAll();
      if (finalize) setShowModal(false);
      return true;
    } finally {
      setSaving(false);
    }
  };

  const uploadPhotos = async (kind: "task" | "site", files: FileList | null) => {
    if (!files || !files.length) return;
    const setUploading = kind === "task" ? setUploadingTask : setUploadingSite;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append("files", f);
      const res = await fetch(
        `/api/ks-ql/projects/${projectId}/diary/photos?kind=${kind}&date=${todayYmd}`,
        { method: "POST", body: fd },
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        flash("err", j.message || "Upload thất bại");
        return;
      }
      await loadAll();
    } finally {
      setUploading(false);
    }
  };

  const deletePhoto = async (kind: "task" | "site", key: string) => {
    if (!confirm("Xoá ảnh này?")) return;
    const res = await fetch(
      `/api/ks-ql/projects/${projectId}/diary/photos?kind=${kind}&date=${todayYmd}&key=${encodeURIComponent(key)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      flash("err", j.message || "Xoá thất bại");
      return;
    }
    await loadAll();
  };

  const taskPhotos = data?.diary?.taskPhotos ?? [];
  const sitePhotos = data?.diary?.sitePhotos ?? [];
  const finalized = !!data?.diary?.savedAt;

  const canFinalize = useMemo(() => {
    return workerCount > 0 && tasksDone.trim().length > 0;
  }, [workerCount, tasksDone]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[#8892b0]">
        <Loader2 className="h-8 w-8 animate-spin text-orange-300" />
        <p className="mt-3 text-sm">Đang tải nhật ký…</p>
      </div>
    );
  }

  return (
    <>
      {msg ? (
        <div
          className={`fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl px-4 py-2 text-sm font-medium shadow-lg ${
            msg.type === "ok"
              ? "bg-[#6FA677] text-black"
              : "bg-[#D26B6B] text-white"
          }`}
        >
          {msg.text}
        </div>
      ) : null}

      <TodayCard
        todayYmd={todayYmd}
        diary={data?.diary ?? null}
        onOpen={() => setShowModal(true)}
      />

      {showModal ? (
        <DiaryModal onClose={() => setShowModal(false)} title={`Nhật ký ${fmtDateVn(todayYmd)}`}>

      <Section icon={<Users className="h-5 w-5" />} idx={1} title="Hôm nay thợ có mấy người?">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setWorkerCount((n) => Math.max(0, n - 1))}
            className="h-12 w-12 rounded-xl bg-[#252840] text-2xl font-bold text-[#f5ede4] active:scale-95"
          >
            −
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={workerCount}
            onChange={(e) =>
              setWorkerCount(Math.max(0, Math.min(500, Number(e.target.value) || 0)))
            }
            className="h-12 w-24 rounded-xl border-2 border-[#252840] bg-[#0f1320] text-center text-2xl font-bold text-orange-300"
          />
          <button
            type="button"
            onClick={() => setWorkerCount((n) => Math.min(500, n + 1))}
            className="h-12 w-12 rounded-xl bg-[#252840] text-2xl font-bold text-[#f5ede4] active:scale-95"
          >
            +
          </button>
          <span className="text-sm text-[#8892b0]">người</span>
        </div>
      </Section>

      <Section
        icon={<ListChecks className="h-5 w-5" />}
        idx={2}
        title="Hôm nay thợ làm được những gì?"
      >
        <textarea
          value={tasksDone}
          onChange={(e) => setTasksDone(e.target.value.slice(0, 4000))}
          rows={4}
          placeholder="VD: Tô tường tầng 2 phòng ngủ chính + chống thấm sân thượng…"
          className="w-full rounded-xl border-2 border-[#252840] bg-[#0f1320] px-3 py-3 text-base text-[#f5ede4] outline-none focus:border-[#ff8a3d]"
        />
        <p className="mt-1 text-right text-xs text-[#8892b0]">{tasksDone.length}/4000</p>
      </Section>

      <Section
        icon={<Camera className="h-5 w-5" />}
        idx={3}
        title="Ảnh các hạng mục làm hôm nay"
        right={`${taskPhotos.length}/20`}
      >
        <PhotoGrid
          projectId={projectId}
          photos={taskPhotos}
          onDelete={(k) => deletePhoto("task", k)}
        />
        <input
          ref={taskFileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => {
            uploadPhotos("task", e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={uploadingTask || taskPhotos.length >= 20}
          onClick={() => taskFileRef.current?.click()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#ff8a3d]/40 bg-[#1a1d2e] px-4 py-3 text-sm font-medium text-orange-300 active:scale-[0.99] disabled:opacity-50"
        >
          {uploadingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Tải ảnh hạng mục
        </button>
      </Section>

      <Section
        icon={<Building2 className="h-5 w-5" />}
        idx={4}
        title="Ảnh toàn công trình"
        right={`${sitePhotos.length}/20`}
      >
        <PhotoGrid
          projectId={projectId}
          photos={sitePhotos}
          onDelete={(k) => deletePhoto("site", k)}
        />
        <input
          ref={siteFileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => {
            uploadPhotos("site", e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={uploadingSite || sitePhotos.length >= 20}
          onClick={() => siteFileRef.current?.click()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#ff8a3d]/40 bg-[#1a1d2e] px-4 py-3 text-sm font-medium text-orange-300 active:scale-[0.99] disabled:opacity-50"
        >
          {uploadingSite ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Tải ảnh toàn cảnh
        </button>
      </Section>

      <Section
        icon={<AlertTriangle className="h-5 w-5" />}
        idx={5}
        title="Vấn đề phát sinh & rút kinh nghiệm"
      >
        <textarea
          value={issues}
          onChange={(e) => setIssues(e.target.value.slice(0, 4000))}
          rows={3}
          placeholder="Để trống nếu không có…"
          className="w-full rounded-xl border-2 border-[#252840] bg-[#0f1320] px-3 py-3 text-base text-[#f5ede4] outline-none focus:border-[#ff8a3d]"
        />
        <p className="mt-1 text-right text-xs text-[#8892b0]">{issues.length}/4000</p>
      </Section>

      <div className="flex flex-col gap-2 rounded-2xl border-2 border-[#ff8a3d]/40 bg-[#1a1d2e] p-3 shadow-xl">
        <button
          type="button"
          onClick={() => upsertDiary(true)}
          disabled={saving || !canFinalize}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#ff8a3d] px-4 py-4 text-base font-bold text-black active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
          {finalized ? "Cập nhật & chốt lại" : "Lưu nhật ký hôm nay"}
        </button>
        {!canFinalize ? (
          <p className="text-center text-xs text-[#E0B855]">
            Cần điền số thợ &gt; 0 và mục công việc trước khi chốt.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => upsertDiary(false)}
            disabled={saving}
            className="w-full rounded-xl border border-[#252840] bg-[#0f1320] px-4 py-2 text-sm text-[#8892b0] active:scale-[0.99] disabled:opacity-50"
          >
            Lưu nháp (chưa chốt)
          </button>
        )}
      </div>
        </DiaryModal>
      ) : null}

      <div className="rounded-2xl border-2 border-[#252840] bg-[#13151f] p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-orange-300">
          <History className="h-4 w-4" />
          Lịch sử các ngày
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-[#8892b0]">Chưa có bản ghi nào.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((h) => (
                <li
                  key={h.id}
                  onClick={() => setDetailDate(h.entryDate)}
                  className="cursor-pointer rounded-xl border border-[#252840] bg-[#0f1320] px-3 py-3 transition-colors hover:border-[#ff8a3d]/40 active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-bold text-[#f5ede4]">{fmtDateVn(h.entryDate)}</div>
                      {h.entryDate === todayYmd && (
                        <span className="rounded-full bg-[#ff8a3d]/20 px-2 py-0.5 text-[10px] font-semibold text-orange-300">
                          Hôm nay
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {h.savedAt ? (
                        <span className="rounded-full bg-[#6FA677]/20 px-2 py-0.5 text-[#a3d3a8]">
                          Đã chốt
                        </span>
                      ) : (
                        <span className="rounded-full bg-[#E0B855]/20 px-2 py-0.5 text-[#E0B855]">
                          Nháp
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-[#8892b0]">
                    <div>
                      <div className="text-[10px] uppercase">Thợ</div>
                      <div className="text-sm font-semibold text-[#f5ede4]">{h.workerCount}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase">Ảnh hạng mục</div>
                      <div className="text-sm font-semibold text-[#f5ede4]">{h.taskCount}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase">Ảnh toàn cảnh</div>
                      <div className="text-sm font-semibold text-[#f5ede4]">{h.siteCount}</div>
                    </div>
                  </div>
                  {h.tasksDone ? (
                    <p className="mt-2 line-clamp-2 text-sm text-[#f5ede4]">{h.tasksDone}</p>
                  ) : null}
                  {h.issues ? (
                    <p className="mt-1 line-clamp-2 text-xs text-[#D26B6B]">⚠ {h.issues}</p>
                  ) : null}
                </li>
              ))}
          </ul>
        )}
      </div>

      {detailDate ? (
        <HistoryDetailModal
          projectId={projectId}
          date={detailDate}
          onClose={() => setDetailDate(null)}
        />
      ) : null}
    </>
  );
}

function TodayCard({
  todayYmd,
  diary,
  onOpen,
}: {
  todayYmd: string;
  diary: DiaryDay | null;
  onOpen: () => void;
}) {
  const has = !!diary;
  const finalized = !!diary?.savedAt;
  return (
    <div
      className={`rounded-2xl border-2 p-4 ${
        finalized
          ? "border-[#6FA677]/40 bg-[#152418]"
          : has
            ? "border-[#E0B855]/40 bg-[#1f1a14]"
            : "border-[#ff8a3d]/40 bg-[#1a1d2e]"
      }`}
    >
      <div className="flex items-center gap-2 text-sm">
        {finalized ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-[#a3d3a8]" />
        ) : has ? (
          <Pencil className="h-5 w-5 shrink-0 text-[#E0B855]" />
        ) : (
          <Plus className="h-5 w-5 shrink-0 text-orange-300" />
        )}
        <div className="flex-1">
          <div className="font-semibold text-[#f5ede4]">
            Nhật ký {fmtDateVn(todayYmd)}
          </div>
          <div
            className={`text-xs ${
              finalized ? "text-[#a3d3a8]" : has ? "text-[#E0B855]" : "text-[#8892b0]"
            }`}
          >
            {finalized
              ? `Đã chốt lúc ${diary?.savedAt ? fmtTimeVn(diary.savedAt) : "—"}`
              : has
                ? "Đang là nháp — chưa chốt"
                : "Hôm nay chưa có nhật ký"}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-bold active:scale-[0.99] ${
          has
            ? "border-2 border-[#ff8a3d]/60 bg-transparent text-orange-300"
            : "bg-[#ff8a3d] text-black"
        }`}
      >
        {has ? <Pencil className="h-4 w-4" /> : <Plus className="h-5 w-5" />}
        {has ? "Cập nhật nhật ký hôm nay" : "Tạo nhật ký hôm nay"}
      </button>
    </div>
  );
}

function HistoryDetailModal({
  projectId,
  date,
  onClose,
}: {
  projectId: string;
  date: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [diary, setDiary] = useState<DiaryDay | null>(null);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetch(`/api/ks-ql/projects/${projectId}/diary?date=${date}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: DiaryResponse | null) => {
        if (cancel) return;
        setDiary(j?.diary ?? null);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [projectId, date]);

  return (
    <DiaryModal onClose={onClose} title={`Nhật ký ${fmtDateVn(date)}`}>
      {loading ? (
        <div className="flex items-center justify-center py-10 text-[#8892b0]">
          <Loader2 className="h-6 w-6 animate-spin text-orange-300" />
        </div>
      ) : !diary ? (
        <div className="rounded-xl border border-[#252840] bg-[#13151f] p-4 text-center text-sm text-[#8892b0]">
          Không có dữ liệu cho ngày này.
        </div>
      ) : (
        <>
          <div
            className={`flex items-center gap-2 rounded-xl border-2 px-4 py-3 text-sm ${
              diary.savedAt
                ? "border-[#6FA677]/40 bg-[#152418] text-[#a3d3a8]"
                : "border-[#E0B855]/40 bg-[#1f1a14] text-[#E0B855]"
            }`}
          >
            {diary.savedAt ? (
              <CheckCircle2 className="h-5 w-5 shrink-0" />
            ) : (
              <Pencil className="h-5 w-5 shrink-0" />
            )}
            <span>
              {diary.savedAt
                ? `Đã chốt lúc ${fmtTimeVn(diary.savedAt)}`
                : "Đang là nháp — chưa chốt"}
            </span>
          </div>

          <DetailRow
            icon={<Users className="h-4 w-4" />}
            label="Số thợ trong ngày"
            value={`${diary.workerCount} người`}
          />
          <DetailRow
            icon={<ListChecks className="h-4 w-4" />}
            label="Công việc đã làm"
            value={diary.tasksDone || "—"}
            multiline
          />
          <DetailRow
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Vấn đề phát sinh"
            value={diary.issues || "Không có"}
            multiline
            warn={!!diary.issues}
          />

          <DetailPhotos
            projectId={projectId}
            title="Ảnh hạng mục"
            icon={<Camera className="h-4 w-4" />}
            photos={diary.taskPhotos}
          />
          <DetailPhotos
            projectId={projectId}
            title="Ảnh toàn cảnh"
            icon={<Building2 className="h-4 w-4" />}
            photos={diary.sitePhotos}
          />
        </>
      )}
    </DiaryModal>
  );
}

function DetailRow({
  icon,
  label,
  value,
  multiline,
  warn,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  multiline?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#252840] bg-[#13151f] p-3">
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#8892b0]">
        <span className="text-orange-300">{icon}</span>
        {label}
      </div>
      <div
        className={`text-sm ${warn ? "text-[#D26B6B]" : "text-[#f5ede4]"} ${
          multiline ? "whitespace-pre-wrap" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function DetailPhotos({
  projectId,
  title,
  icon,
  photos,
}: {
  projectId: string;
  title: string;
  icon: React.ReactNode;
  photos: Photo[];
}) {
  return (
    <div className="rounded-xl border border-[#252840] bg-[#13151f] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#8892b0]">
        <span className="text-orange-300">{icon}</span>
        {title}
        <span className="ml-auto text-[10px] normal-case text-[#8892b0]">{photos.length} ảnh</span>
      </div>
      {photos.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-[#252840] bg-[#0f1320] px-4 py-4 text-xs text-[#8892b0]">
          Không có ảnh
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <a
              key={p.key}
              href={photoSrc(projectId, p.key)}
              target="_blank"
              rel="noreferrer"
              className="relative aspect-square overflow-hidden rounded-lg border border-[#252840] bg-[#0f1320]"
            >
              <Image
                src={photoSrc(projectId, p.key)}
                alt=""
                fill
                sizes="33vw"
                className="object-cover"
                unoptimized
              />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function DiaryModal({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-3"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-2xl border border-[#252840] bg-[#0f1320] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[#252840] px-4 py-3">
          <div className="text-base font-bold text-[#f5ede4]">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[#8892b0] hover:bg-[#252840] hover:text-[#f5ede4]"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col gap-3 overflow-y-auto p-3">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function Section({
  icon,
  idx,
  title,
  right,
  children,
}: {
  icon: React.ReactNode;
  idx: number;
  title: string;
  right?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border-2 border-[#252840] bg-[#13151f] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ff8a3d]/20 text-sm font-bold text-orange-300">
          {idx}
        </span>
        <div className="text-orange-300">{icon}</div>
        <h3 className="flex-1 text-sm font-semibold text-[#f5ede4]">{title}</h3>
        {right ? <span className="text-xs text-[#8892b0]">{right}</span> : null}
      </div>
      {children}
    </div>
  );
}

function PhotoGrid({
  projectId,
  photos,
  onDelete,
}: {
  projectId: string;
  photos: Photo[];
  onDelete: (key: string) => void;
}) {
  if (!photos.length) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed border-[#252840] bg-[#0f1320] px-4 py-6 text-xs text-[#8892b0]">
        Chưa có ảnh
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {photos.map((p) => (
        <div
          key={p.key}
          className="relative aspect-square overflow-hidden rounded-xl border border-[#252840] bg-[#0f1320]"
        >
          <Image
            src={photoSrc(projectId, p.key)}
            alt=""
            fill
            sizes="33vw"
            className="object-cover"
            unoptimized
          />
          <button
            type="button"
            onClick={() => onDelete(p.key)}
            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white active:scale-95"
            aria-label="Xoá"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
