"use client";

import { confirmDialog } from "@/components/confirm-dialog";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShieldCheck,
  Undo2,
  UserRound,
  X,
} from "lucide-react";

type Photo = { key: string; contentType?: string };

type DiaryItem = {
  id: string;
  entryDate: string;
  workerCount: number;
  tasksDone: string;
  issues: string | null;
  taskPhotos: Photo[];
  sitePhotos: Photo[];
  savedAt: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  updatedAt: string;
  ksName: string;
  ksId: string;
};

function fmtDate(ymd: string) {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function photoSrc(projectId: string, key: string) {
  return `/api/ks-ql/projects/${projectId}/diary/photos/file?key=${encodeURIComponent(key)}`;
}

export function DiaryApprovalPanel({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<DiaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ items: Photo[]; index: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/projects/${projectId}/construction-diaries?take=30`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const j = await res.json();
        setItems(j.items || []);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (type: "ok" | "err", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3000);
  };

  const approve = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/construction-diaries/${id}/approve`, {
        method: "POST",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        flash("err", j.message || "Duyệt thất bại");
        return;
      }
      flash("ok", "Đã duyệt nhật ký");
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const unapprove = async (id: string) => {
    if (!await confirmDialog("Bỏ duyệt để KS sửa lại nhật ký này?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/construction-diaries/${id}/unapprove`, {
        method: "POST",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        flash("err", j.message || "Bỏ duyệt thất bại");
        return;
      }
      flash("ok", "Đã bỏ duyệt · KS có thể sửa lại");
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const summary = useMemo(() => {
    const total = items.length;
    const approved = items.filter((x) => x.approvedAt).length;
    const pending = items.filter((x) => x.savedAt && !x.approvedAt).length;
    const draft = items.filter((x) => !x.savedAt).length;
    return { total, approved, pending, draft };
  }, [items]);

  return (
    <div className="space-y-3">
      {msg ? (
        <div
          className={`fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl px-4 py-2 text-sm font-medium shadow-lg ${
            msg.type === "ok" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
          }`}
        >
          {msg.text}
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-[#252840] bg-[#13151f] p-3 text-center">
          <div className="text-lg font-bold text-[#f0f2ff]">{summary.total}</div>
          <div className="text-[10px] uppercase tracking-wide text-[#8892b0]">Tổng</div>
        </div>
        <div className="rounded-2xl border border-[#252840] bg-[#13151f] p-3 text-center">
          <div className="text-lg font-bold text-amber-400">{summary.pending}</div>
          <div className="text-[10px] uppercase tracking-wide text-[#8892b0]">Chờ duyệt</div>
        </div>
        <div className="rounded-2xl border border-[#252840] bg-[#13151f] p-3 text-center">
          <div className="text-lg font-bold text-emerald-400">{summary.approved}</div>
          <div className="text-[10px] uppercase tracking-wide text-[#8892b0]">Đã duyệt</div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-[#252840] bg-[#13151f] py-10 text-[#8892b0]">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-[#252840] bg-[#13151f] py-8 text-center text-sm text-[#8892b0]">
          Chưa có nhật ký nào.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const isOpen = expandedId === it.id;
            const totalPhotos = it.taskPhotos.length + it.sitePhotos.length;
            return (
              <div key={it.id} className="rounded-2xl border border-[#252840] bg-[#13151f]">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedId(isOpen ? null : it.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setExpandedId(isOpen ? null : it.id);
                  }}
                  className="flex w-full cursor-pointer items-start gap-2 p-3 text-left"
                >
                  <span className="mt-0.5 shrink-0 text-[#5a6080]">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-[#f0f2ff]">{fmtDate(it.entryDate)}</span>
                      {it.approvedAt ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-300">
                          <ShieldCheck className="h-3 w-3" /> Đã duyệt
                        </span>
                      ) : it.savedAt ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" /> Chờ duyệt
                        </span>
                      ) : (
                        <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-300">
                          Chưa chốt
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block truncate text-xs text-[#8892b0]">
                      <UserRound className="mr-1 inline h-3 w-3" />
                      {it.ksName} · {it.workerCount} thợ · {totalPhotos} ảnh
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[#cfd4e8]">
                      {it.tasksDone || "—"}
                    </span>
                  </span>
                  <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    {it.approvedAt ? (
                      <button
                        type="button"
                        onClick={() => unapprove(it.id)}
                        disabled={busyId === it.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#2d3249] px-2.5 py-1.5 text-xs text-[#8892b0] hover:text-[#f0f2ff] disabled:opacity-60"
                      >
                        {busyId === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                        Bỏ duyệt
                      </button>
                    ) : it.savedAt ? (
                      <button
                        type="button"
                        onClick={() => approve(it.id)}
                        disabled={busyId === it.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#ff8a3d] px-2.5 py-1.5 text-xs font-bold text-black disabled:opacity-60"
                      >
                        {busyId === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                        Duyệt
                      </button>
                    ) : null}
                  </span>
                </div>

                {isOpen ? (
                  <div className="border-t border-[#252840] px-3 py-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="text-xs font-semibold uppercase text-[#8892b0]">Công việc đã làm</div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-[#f0f2ff]">
                          {it.tasksDone || <em className="text-[#5a6080]">Trống</em>}
                        </p>
                        {it.issues ? (
                          <>
                            <div className="mt-3 text-xs font-semibold uppercase text-rose-400">Vấn đề phát sinh</div>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-rose-300">{it.issues}</p>
                          </>
                        ) : null}
                        <div className="mt-3 space-y-0.5 text-xs text-[#8892b0]">
                          {it.savedAt ? <div>Chốt lúc: {fmtTime(it.savedAt)} ({fmtDate(it.entryDate)})</div> : null}
                          {it.approvedAt ? (
                            <div className="text-blue-300">
                              Duyệt bởi {it.approvedByName || "?"} lúc {fmtTime(it.approvedAt)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-[#8892b0]">
                          <Camera className="h-3.5 w-3.5" /> Ảnh hạng mục ({it.taskPhotos.length})
                        </div>
                        <PhotoStrip
                          projectId={projectId}
                          photos={it.taskPhotos}
                          onOpen={(idx) => setViewer({ items: it.taskPhotos, index: idx })}
                        />
                        <div className="mt-2 mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-[#8892b0]">
                          <Camera className="h-3.5 w-3.5" /> Ảnh toàn cảnh ({it.sitePhotos.length})
                        </div>
                        <PhotoStrip
                          projectId={projectId}
                          photos={it.sitePhotos}
                          onOpen={(idx) => setViewer({ items: it.sitePhotos, index: idx })}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {viewer ? (
        <Lightbox
          projectId={projectId}
          photos={viewer.items}
          startIndex={viewer.index}
          onClose={() => setViewer(null)}
        />
      ) : null}
    </div>
  );
}
function PhotoStrip({
  projectId,
  photos,
  onOpen,
}: {
  projectId: string;
  photos: Photo[];
  onOpen: (index: number) => void;
}) {
  if (!photos.length) {
    return (
      <div className="rounded-lg border border-dashed border-[#2d3249] py-3 text-center text-xs text-[#5a6080]">
        Không có ảnh
      </div>
    );
  }
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {photos.map((p, i) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onOpen(i)}
          className="relative aspect-square overflow-hidden rounded-lg border border-[#2d3249] bg-[#0f1220]"
        >
          <Image
            src={photoSrc(projectId, p.key)}
            alt=""
            fill
            sizes="15vw"
            className="object-cover"
            unoptimized
          />
        </button>
      ))}
    </div>
  );
}

function Lightbox({
  projectId,
  photos,
  startIndex,
  onClose,
}: {
  projectId: string;
  photos: Photo[];
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(photos.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, photos.length]);
  if (!mounted) return null;
  const photo = photos[index];
  if (!photo) return null;
  const canPrev = index > 0;
  const canNext = index < photos.length - 1;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <div className="relative h-full w-full" onClick={(e) => e.stopPropagation()}>
        <Image
          src={photoSrc(projectId, photo.key)}
          alt=""
          fill
          className="object-contain"
          unoptimized
        />
      </div>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 z-[110] rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        aria-label="Đóng"
      >
        <X className="h-5 w-5" />
      </button>
      {canPrev ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIndex((i) => Math.max(0, i - 1));
          }}
          className="absolute left-3 top-1/2 z-[110] -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          aria-label="Ảnh trước"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      ) : null}
      {canNext ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIndex((i) => Math.min(photos.length - 1, i + 1));
          }}
          className="absolute right-3 top-1/2 z-[110] -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          aria-label="Ảnh sau"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      ) : null}
      <div className="absolute bottom-3 left-1/2 z-[110] -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
        {index + 1} / {photos.length}
      </div>
    </div>,
    document.body,
  );
}
