"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type JournalEntry = {
  id: string;
  completionPercent: number | null;
  actualWork: string | null;
  issues: string | null;
  rating: string | null;
  explanation: string | null;
  stillPaused: boolean | null;
  actualWorkIfStarted: string | null;
  taskPhotos: { id: string; photoUrl: string; thumbnailUrl: string; caption: string | null }[];
  eveningReport: {
    reportDate: string;
    submittedAt: string | null;
    issues: string | null;
    overallRating: string;
    overallNote: string | null;
    reporter: { fullName: string; email: string };
    sitePhotos: { id: string; photoUrl: string; thumbnailUrl: string; caption: string | null }[];
  };
};

function fmtDate(dateIso: string | null) {
  if (!dateIso) return "-";
  const d = new Date(dateIso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

function Field({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === "") return null;
  return <div><div className="text-[11px] font-semibold uppercase text-[#8891aa]">{label}</div><div className="mt-1 whitespace-pre-wrap text-sm text-[#f0f2f8]">{String(value)}</div></div>;
}

export function JournalSection({ taskId }: { taskId: string }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<JournalEntry | null>(null);
  const [fullPhoto, setFullPhoto] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/tasks/${taskId}/journal`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || "Không tải được nhật ký");
        if (!cancelled) setEntries(json.entries || []);
      })
      .catch((err) => toast.error(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [taskId]);

  const photos = selected ? [...selected.taskPhotos, ...selected.eveningReport.sitePhotos] : [];

  return (
    <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4">
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[#8891aa]">Nhật ký báo cáo chiều</div>
      {loading ? <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-4 text-sm text-[#8891aa]">Đang tải nhật ký...</div> : null}
      {!loading && entries.length === 0 ? <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-4 text-sm text-[#8891aa]">Chưa có báo cáo chiều cho task này.</div> : null}
      <div className="space-y-2">
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-xl border border-[#2e3347] bg-[#222637] p-3">
            <div className="text-sm font-bold">{fmtDate(entry.eveningReport.reportDate)}</div>
            <div className="mt-1 text-xs text-[#8891aa]">Báo cáo chiều · {entry.eveningReport.reporter.fullName}</div>
            <button className="mt-2 text-xs font-semibold text-amber-400 underline" onClick={() => setSelected(entry)}>Xem chi tiết</button>
          </div>
        ))}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={() => setSelected(null)}>
          <div className="max-h-[88vh] w-full max-w-2xl overflow-auto rounded-t-2xl border border-[#2e3347] bg-[#1a1d27] p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div><div className="text-lg font-bold">Nhật ký {fmtDate(selected.eveningReport.reportDate)}</div><div className="text-sm text-[#8891aa]">Người lập: {selected.eveningReport.reporter.fullName}</div></div>
              <button className="rounded-lg border border-[#2e3347] px-3 py-1 text-sm" onClick={() => setSelected(null)}>Đóng</button>
            </div>
            <div className="grid gap-3">
              <Field label="% hoàn thành" value={selected.completionPercent} />
              <Field label="Công việc thực tế" value={selected.actualWork} />
              <Field label="Vướng mắc task" value={selected.issues} />
              <Field label="Đánh giá task" value={selected.rating} />
              <Field label="Giải trình" value={selected.explanation} />
              <Field label="Còn tạm dừng" value={selected.stillPaused === null ? null : selected.stillPaused ? "Có" : "Không"} />
              <Field label="Việc thực tế nếu bắt đầu" value={selected.actualWorkIfStarted} />
              <Field label="Vướng mắc chung" value={selected.eveningReport.issues} />
              <Field label="Đánh giá chung" value={selected.eveningReport.overallRating} />
              <Field label="Ghi chú chung" value={selected.eveningReport.overallNote} />
              {photos.length > 0 ? <div><div className="mb-2 text-[11px] font-semibold uppercase text-[#8891aa]">Ảnh báo cáo</div><div className="grid grid-cols-3 gap-2">{photos.map((photo) => <button key={photo.id} className="overflow-hidden rounded-xl border border-[#2e3347]" onClick={() => setFullPhoto(photo.photoUrl)}><Image src={photo.thumbnailUrl} alt={photo.caption || "report photo"} width={180} height={180} className="h-24 w-full object-cover" /></button>)}</div></div> : null}
            </div>
          </div>
        </div>
      ) : null}
      {fullPhoto ? <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onClick={() => setFullPhoto(null)}><Image src={fullPhoto} alt="full" width={1200} height={900} className="max-h-[84vh] w-auto rounded-xl" /></div> : null}
    </div>
  );
}
