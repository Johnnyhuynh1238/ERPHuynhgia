import Link from "next/link";
import { AlertTriangle, BellRing, ChevronRight } from "lucide-react";
import { loadUpcomingAcceptance, upcomingItemHref, upcomingItemLabel } from "@/lib/acceptance-reminders";

// Nhắc việc cho KS: BB nghiệm thu còn sót + sắp tới (logic ở lib/acceptance-reminders.ts).
export async function UpcomingAcceptance({ projects }: { projects: { id: string; name: string }[] }) {
  if (!projects.length) return null;
  const upcoming = await loadUpcomingAcceptance(projects.map((p) => p.id));
  const blocks = projects
    .map((p) => ({ project: p, items: upcoming.get(p.id) ?? [] }))
    .filter((b) => b.items.length > 0);
  if (!blocks.length) return null;

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-lg font-bold text-orange-300">
        <BellRing className="h-5 w-5" />
        Biên bản nghiệm thu sắp tới
      </div>
      {blocks.map(({ project, items }) => (
        <div key={project.id} className="rounded-2xl border-2 border-[#252840] bg-[#13151f] p-3">
          {projects.length > 1 ? (
            <div className="mb-2 px-1 text-base font-bold text-[#f0f2ff]">{project.name}</div>
          ) : null}
          <div className="flex flex-col gap-2">
            {items.map((m) => (
              <Link
                key={m.id}
                href={upcomingItemHref(m)}
                className={`ksql-tap flex items-center gap-3 rounded-xl px-3 py-3 ${m.missed ? "bg-[#2a1518]" : "bg-[#1a1d2e]"}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                    <span
                      className={`rounded-full px-2 py-0.5 ${m.kind === "thau_phu" ? "bg-[#252840] text-sky-300" : "bg-[#252840] text-emerald-300"}`}
                    >
                      {m.kind === "thau_phu" ? "Thầu phụ" : "Chủ nhà"}
                    </span>
                    {m.missed ? (
                      <span className="inline-flex items-center gap-1 text-[#f87171]">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Còn sót
                      </span>
                    ) : (
                      <span className="text-[#fbbf24]">Sắp tới</span>
                    )}
                  </div>
                  <div className="mt-1 break-words text-base text-[#f0f2ff]">{upcomingItemLabel(m)}</div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-[#8892b0]" />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
