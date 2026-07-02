"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  BookOpenText,
  Camera,
  CheckCircle2,
  ChevronDown,
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
    if (!confirm("Bỏ duyệt để KS sửa lại nhật ký này?")) return;
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {msg ? (
        <div
          className={`fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl px-4 py-2 text-sm font-medium shadow-lg ${
            msg.type === "ok" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
          }`}
        >
          {msg.text}
        </div>
      ) : null}

      <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-3">
        <BookOpenText className="h-5 w-5 text-slate-500" />
        <h3 className="text-base font-semibold text-slate-900">Duyệt nhật ký thi công</h3>
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <span>Tổng: {summary.total}</span>
          <span className="text-emerald-700">Đã duyệt: {summary.approved}</span>
          <span className="text-amber-700">Chờ duyệt: {summary.pending}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">Chưa có nhật ký nào.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="w-6 py-2 text-left"></th>
                <th className="py-2 text-left">Ngày</th>
                <th className="py-2 text-left">KS</th>
                <th className="py-2 text-right">Thợ</th>
                <th className="py-2 text-left">Công việc</th>
                <th className="py-2 text-right">Ảnh</th>
                <th className="py-2 text-left">Trạng thái</th>
                <th className="py-2 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const isOpen = expandedId === it.id;
                const totalPhotos = it.taskPhotos.length + it.sitePhotos.length;
                return (
                  <Fragment key={it.id}>
                    <tr
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                    >
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => setExpandedId(isOpen ? null : it.id)}
                          className="text-slate-400 hover:text-slate-700"
                          aria-label="Mở chi tiết"
                        >
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="py-2 font-medium text-slate-900">{fmtDate(it.entryDate)}</td>
                      <td className="py-2">
                        <span className="inline-flex items-center gap-1 text-slate-700">
                          <UserRound className="h-3.5 w-3.5 text-slate-400" />
                          {it.ksName}
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-700">
                        {it.workerCount}
                      </td>
                      <td className="py-2 max-w-xs truncate text-slate-700">
                        {it.tasksDone || <em className="text-slate-400">—</em>}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-500">
                        {totalPhotos}
                      </td>
                      <td className="py-2">
                        {it.approvedAt ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                            <ShieldCheck className="h-3 w-3" />
                            Đã duyệt
                          </span>
                        ) : it.savedAt ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" />
                            Đã chốt
                          </span>
                        ) : (
                          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700">
                            Chưa chốt
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {it.approvedAt ? (
                          <button
                            type="button"
                            onClick={() => unapprove(it.id)}
                            disabled={busyId === it.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            {busyId === it.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Undo2 className="h-3 w-3" />
                            )}
                            Bỏ duyệt
                          </button>
                        ) : it.savedAt ? (
                          <button
                            type="button"
                            onClick={() => approve(it.id)}
                            disabled={busyId === it.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                          >
                            {busyId === it.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ShieldCheck className="h-3 w-3" />
                            )}
                            Duyệt
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr className="border-b border-slate-100 last:border-0 bg-slate-50/50">
                        <td colSpan={8} className="px-2 py-3">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <div className="text-xs font-semibold uppercase text-slate-500">
                                Công việc đã làm
                              </div>
                              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                                {it.tasksDone || <em className="text-slate-400">Trống</em>}
                              </p>
                              {it.issues ? (
                                <>
                                  <div className="mt-3 text-xs font-semibold uppercase text-rose-600">
                                    Vấn đề phát sinh
                                  </div>
                                  <p className="mt-1 whitespace-pre-wrap text-sm text-rose-700">
                                    {it.issues}
                                  </p>
                                </>
                              ) : null}
                              <div className="mt-3 space-y-0.5 text-xs text-slate-500">
                                {it.savedAt ? (
                                  <div>Chốt lúc: {fmtTime(it.savedAt)} ({fmtDate(it.entryDate)})</div>
                                ) : null}
                                {it.approvedAt ? (
                                  <div className="text-blue-700">
                                    Duyệt bởi {it.approvedByName || "?"} lúc {fmtTime(it.approvedAt)}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <div>
                              <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-slate-500">
                                <Camera className="h-3.5 w-3.5" /> Ảnh hạng mục ({it.taskPhotos.length})
                              </div>
                              <PhotoStrip
                                projectId={projectId}
                                photos={it.taskPhotos}
                                onOpen={(idx) => setViewer({ items: it.taskPhotos, index: idx })}
                              />
                              <div className="mt-2 mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-slate-500">
                                <Camera className="h-3.5 w-3.5" /> Ảnh toàn cảnh ({it.sitePhotos.length})
                              </div>
                              <PhotoStrip
                                projectId={projectId}
                                photos={it.sitePhotos}
                                onOpen={(idx) => setViewer({ items: it.sitePhotos, index: idx })}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
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
      <div className="rounded-lg border border-dashed border-slate-200 py-3 text-center text-xs text-slate-400">
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
          className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
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
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        aria-label="Đóng"
      >
        <X className="h-5 w-5" />
      </button>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
        {index + 1} / {photos.length}
      </div>
      <div className="relative h-full w-full" onClick={(e) => e.stopPropagation()}>
        <Image
          src={photoSrc(projectId, photo.key)}
          alt=""
          fill
          className="object-contain"
          unoptimized
        />
      </div>
    </div>,
    document.body,
  );
}
