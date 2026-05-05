"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type TaskItem = { id: string; code: string; name: string; status: string };
type Grouped = { projectId: string; projectName: string; groups: { overdue: TaskItem[]; in_progress: TaskItem[]; starting_today: TaskItem[]; upcoming: TaskItem[] } };

const ORDER = ["overdue", "in_progress", "starting_today", "upcoming"] as const;
const LABEL: Record<(typeof ORDER)[number], string> = { overdue: "Quá hạn", in_progress: "Đang làm", starting_today: "Bắt đầu hôm nay", upcoming: "Sắp tới" };

export default function CheckinPage() {
  const [data, setData] = useState<Grouped[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/reports/today/checkin-options").then((r) => r.json()).then((j) => setData((j.projects || []).sort((a: Grouped, b: Grouped) => a.projectName.localeCompare(b.projectName, "vi"))));
  }, []);

  const totalPicked = useMemo(() => Object.values(picked).filter(Boolean).length, [picked]);

  const doneProjectCount = useMemo(() => {
    return data.filter((p) => {
      const all = ORDER.flatMap((k) => p.groups[k] || []);
      if (!all.length) return false;
      return all.every((t) => picked[t.id]);
    }).length;
  }, [data, picked]);

  async function submit() {
    const taskIds = Object.keys(picked).filter((k) => picked[k]);
    setLoading(true);
    await fetch("/api/reports/today/checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskIds }) });
    router.push("/reports");
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-4 space-y-4">
      <h1 className="text-lg font-semibold">Check-in task hôm nay</h1>
      <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">Đã chọn {totalPicked} task · Hoàn tất {doneProjectCount}/{data.length} dự án</div>

      {data.map((p) => (
        <section key={p.projectId} className="rounded-xl border p-3">
          <div className="mb-2 font-medium">{p.projectName}</div>
          {ORDER.map((groupKey) => {
            const items = p.groups[groupKey] || [];
            if (!items.length) return null;
            return (
              <div key={groupKey} className="mb-3 rounded-lg border p-2">
                <div className="mb-1 flex items-center justify-between text-xs"><span>{LABEL[groupKey]}</span><span className="rounded-full bg-slate-200 px-2 py-0.5">{items.length}</span></div>
                <div className="space-y-1">
                  {items.map((t) => (
                    <div key={t.id} className="flex items-center justify-between rounded-md border px-2 py-2 text-sm">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={!!picked[t.id]} onChange={(e) => setPicked((s) => ({ ...s, [t.id]: e.target.checked }))} />{t.code} - {t.name}</label>
                      <Link className="text-orange-600 text-xs" href={`/tasks/${t.id}?tab=progress`}>Vào task</Link>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ))}
      <button disabled={loading || totalPicked === 0} className="rounded-md bg-orange-600 px-3 py-2 text-sm text-white disabled:opacity-50" onClick={submit}>Submit check-in ({totalPicked})</button>
    </main>
  );
}
