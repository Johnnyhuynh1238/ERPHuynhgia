"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type TaskItem = { id: string; code: string; name: string };
type Grouped = { projectId: string; projectName: string; groups: { overdue: TaskItem[]; in_progress: TaskItem[]; starting_today: TaskItem[]; upcoming: TaskItem[] } };

export default function CheckinPage() {
  const [data, setData] = useState<Grouped[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const router = useRouter();

  useEffect(() => {
    fetch("/api/reports/today/checkin-options").then((r) => r.json()).then((j) => setData(j.projects || []));
  }, []);

  async function submit() {
    const taskIds = Object.keys(picked).filter((k) => picked[k]);
    await fetch("/api/reports/today/checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskIds }) });
    router.push("/reports");
  }

  return <main className="mx-auto max-w-4xl px-4 py-4 space-y-4"><h1 className="text-lg font-semibold">Check-in sáng</h1>{data.map((p) => <section key={p.projectId} className="rounded-xl border p-3"><div className="font-medium mb-2">{p.projectName}</div>{Object.entries(p.groups).map(([k, items]) => <div key={k} className="mb-2"><div className="text-xs text-muted-foreground mb-1">{k}</div><div className="space-y-1">{items.map((t) => <label key={t.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!picked[t.id]} onChange={(e) => setPicked((s) => ({ ...s, [t.id]: e.target.checked }))} />{t.code} - {t.name}</label>)}</div></div>)}</section>)}<button className="rounded-md bg-orange-600 px-3 py-2 text-sm text-white" onClick={submit}>Submit check-in</button></main>;
}
