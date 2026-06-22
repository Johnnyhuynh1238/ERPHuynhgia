"use client";

import { useEffect, useMemo, useState } from "react";

type Project = {
  id: string;
  code: string;
  name: string;
  status: string;
  address: string | null;
};

type TodayData = {
  alerts: { id: string; text: string; href?: string }[];
  morning: {
    attendanceDone: boolean;
    teamPhotoDone: boolean;
    materialsIncoming: number;
    machinesWaiting: number;
  };
  midday: {
    qcHoldPoints: number;
    materialReceiveToday: number;
  };
  evening: {
    workOrdersToday: number;
    assignDone: boolean;
    materialRequestForTomorrow: boolean;
  };
  kpi: {
    phaseLabel: string | null;
    progressPercent: number;
    laborDelta: number;
  };
};

type Props = {
  user: { id: string; name: string; role: string };
  projects: Project[];
  selectedProjectId: string | null;
};

type Slot = "morning" | "midday" | "evening";

function currentSlot(hour: number): Slot {
  // SOP 11: Đầu ngày 6-8h · Trong ngày 8-16h · Cuối ngày 16h+
  if (hour < 8) return "morning";
  if (hour < 16) return "midday";
  return "evening";
}

function vnDate(d: Date) {
  const weekdays = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return `${weekdays[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function vnTime(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const SOP_HINTS: Record<string, { title: string; body: string }> = {
  "6.1": {
    title: "6.1 Chấm công thợ",
    body: "Đầu ngày, điểm danh từng thợ (có/nửa buổi/vắng) + chụp 1 ảnh tổ. App ra tổng công ngày để rải ở mục 6.2.",
  },
  "6.2": {
    title: "6.2 Rải công + % tiến độ",
    body: "Cuối ngày, rải tổng công vào các công tác đã đụng tới (không theo thợ). Σ công rải = tổng chấm công, app chặn nếu lệch.",
  },
  "6.3": {
    title: "6.3 QC hold-point",
    body: "Mở card QC của công tác, tick đạt/không + ảnh bắt buộc, gửi TPTC duyệt. Không cho công đoạn sau che lấp nếu chưa duyệt.",
  },
  "6.4": {
    title: "6.4 Yêu cầu VT/Máy",
    body: "Cuối ngày đặt cho ngày mai, hoặc khi phát sinh. Đặt trước đủ thời gian để hàng/máy về kịp.",
  },
  "6.5": {
    title: "6.5 Nhận & kiểm VT",
    body: "Đếm số lượng + kiểm đúng loại/quy cách + chụp ảnh + nhận hoặc từ chối. Sai chất lượng → trả ngay.",
  },
  "6.6": {
    title: "6.6 Sổ máy + trạng thái",
    body: "Máy vào ghi sổ (sở hữu/thuê, giá thuê/ngày, hạn). Đổi trạng thái khi thay đổi: dùng/chờ/hỏng. Hết nhu cầu → trả máy thuê.",
  },
};

export function KsQlTodayClient({ user, projects, selectedProjectId }: Props) {
  const [now, setNow] = useState<Date | null>(null);
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hintKey, setHintKey] = useState<string | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/ks-ql/today?projectId=${selectedProjectId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) {
          setData(j);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  const slot: Slot = useMemo(() => currentSlot(now ? now.getHours() : 7), [now]);
  const project = projects.find((p) => p.id === selectedProjectId) ?? null;

  if (projects.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center">
        <h1 className="text-xl font-semibold text-white">App KS — Hôm nay</h1>
        <p className="mt-4 text-[#8892b0]">Chưa được gán dự án nào. Liên hệ TPTC để được phân dự án.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:px-6">
      <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-[#8892b0]">App KS Quản Lý</div>
          <h1 className="text-2xl font-semibold text-white">Hôm nay</h1>
          <div className="mt-1 text-sm text-[#8892b0]">
            {user.name} · {now ? `${vnDate(now)} · ${vnTime(now)}` : ""}
          </div>
        </div>
        {projects.length > 1 ? (
          <select
            className="rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white"
            value={selectedProjectId ?? ""}
            onChange={(e) => {
              const url = new URL(window.location.href);
              url.searchParams.set("p", e.target.value);
              window.location.href = url.toString();
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        ) : null}
      </header>

      {project ? (
        <div className="mb-4 rounded-lg border border-[#2a2a2a] bg-[#111] px-4 py-3">
          <div className="text-xs uppercase tracking-wider text-[#8892b0]">Dự án</div>
          <div className="mt-0.5 text-base font-medium text-white">{project.name}</div>
          {project.address ? <div className="mt-0.5 text-xs text-[#8892b0]">{project.address}</div> : null}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#111] p-8 text-center text-[#8892b0]">Đang tải…</div>
      ) : data ? (
        <>
          {data.alerts.length > 0 ? (
            <section className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-red-300">Cần xử lý ngay</div>
              <ul className="space-y-1 text-sm text-red-100">
                {data.alerts.map((a) => (
                  <li key={a.id}>• {a.text}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <PhaseSection
            title="Đầu ngày"
            sub="6:00 – 8:00"
            slot="morning"
            current={slot}
            cards={[
              { icon: "▣", title: "Chấm công thợ", status: data.morning.attendanceDone ? "đã làm" : "chưa làm", cta: "Mở", sop: "6.1" },
              { icon: "📷", title: "Ảnh tổ hôm nay", status: data.morning.teamPhotoDone ? "đã chụp" : "chưa chụp", cta: "Chụp", sop: "6.1" },
              { icon: "📦", title: "VT đến hôm nay", status: `${data.morning.materialsIncoming} món`, cta: "Nhận", sop: "6.5", muted: data.morning.materialsIncoming === 0 },
              { icon: "🔧", title: "Máy chờ kiểm", status: `${data.morning.machinesWaiting} cái`, cta: "Xem", sop: "6.6", muted: data.morning.machinesWaiting === 0 },
            ]}
            onHint={setHintKey}
          />

          <PhaseSection
            title="Trong ngày"
            sub="8:00 – 16:00"
            slot="midday"
            current={slot}
            cards={[
              { icon: "✓", title: "QC hold-point", status: `${data.midday.qcHoldPoints} điểm cần tick`, cta: "Mở", sop: "6.3", muted: data.midday.qcHoldPoints === 0 },
              { icon: "📦", title: "VT về cần nhận", status: `${data.midday.materialReceiveToday} phiếu`, cta: "Nhận", sop: "6.5", muted: data.midday.materialReceiveToday === 0 },
              { icon: "🚩", title: "Gắn cờ sự cố", status: "khi phát sinh", cta: "Mở", sop: "6.3" },
            ]}
            onHint={setHintKey}
          />

          <PhaseSection
            title="Cuối ngày"
            sub="16:00 – 19:00"
            slot="evening"
            current={slot}
            cards={[
              { icon: "Σ", title: "Rải công + % tiến độ", status: data.evening.assignDone ? "đã rải" : `${data.evening.workOrdersToday} phiếu chờ`, cta: "Mở", sop: "6.2" },
              { icon: "📦", title: "Đặt VT/Máy ngày mai", status: data.evening.materialRequestForTomorrow ? "đã đặt" : "chưa đặt", cta: "Mở", sop: "6.4" },
            ]}
            onHint={setHintKey}
          />

          <section className="mt-6 rounded-lg border border-[#2a2a2a] bg-[#111] px-4 py-3 text-sm text-[#a0aec0]">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                KPI {data.kpi.phaseLabel ?? "GĐ chưa mở"}: tiến độ <span className="font-medium text-white">{data.kpi.progressPercent}%</span>
              </span>
              <span>
                Công {data.kpi.laborDelta >= 0 ? "dôi" : "vượt"}:{" "}
                <span className={data.kpi.laborDelta >= 0 ? "font-medium text-emerald-300" : "font-medium text-orange-300"}>
                  {data.kpi.laborDelta >= 0 ? `+${data.kpi.laborDelta}` : data.kpi.laborDelta}
                </span>
              </span>
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#111] p-8 text-center text-[#8892b0]">
          Chưa có dữ liệu hôm nay.
        </div>
      )}

      {hintKey && SOP_HINTS[hintKey] ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setHintKey(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 text-xs uppercase tracking-wider text-[#8892b0]">SOP 11 — gợi ý nhanh</div>
            <div className="mb-1 text-base font-semibold text-white">{SOP_HINTS[hintKey].title}</div>
            <p className="text-sm leading-relaxed text-[#a0aec0]">{SOP_HINTS[hintKey].body}</p>
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => setHintKey(null)}
                className="rounded-md bg-[#2a2a2a] px-3 py-1.5 text-sm text-white hover:bg-[#333]"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

type CardDef = {
  icon: string;
  title: string;
  status: string;
  cta: string;
  sop: keyof typeof SOP_HINTS | string;
  muted?: boolean;
};

function PhaseSection({
  title,
  sub,
  slot,
  current,
  cards,
  onHint,
}: {
  title: string;
  sub: string;
  slot: Slot;
  current: Slot;
  cards: CardDef[];
  onHint: (key: string) => void;
}) {
  const isCurrent = slot === current;
  const [open, setOpen] = useState(isCurrent);

  useEffect(() => {
    setOpen(isCurrent);
  }, [isCurrent]);

  return (
    <section className={`mb-4 rounded-lg border ${isCurrent ? "border-[#3a3a3a] bg-[#161616]" : "border-[#2a2a2a] bg-[#111]"}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <div className={`text-sm font-semibold ${isCurrent ? "text-white" : "text-[#a0aec0]"}`}>
            {title} <span className="ml-1 text-xs font-normal text-[#8892b0]">{sub}</span>
            {isCurrent ? <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] uppercase text-emerald-300">Đang</span> : null}
          </div>
        </div>
        <span className="text-[#8892b0]">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <div className="border-t border-[#2a2a2a] px-2 py-2 sm:px-3">
          {cards.map((c, i) => (
            <ActionCard key={i} card={c} onHint={onHint} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ActionCard({ card, onHint }: { card: CardDef; onHint: (key: string) => void }) {
  return (
    <div className={`flex items-center justify-between gap-2 rounded-md px-2 py-2 ${card.muted ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="text-xl">{card.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-white">{card.title}</div>
          <div className="truncate text-xs text-[#8892b0]">{card.status}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          className="rounded-md bg-emerald-500/20 px-3 py-1.5 text-sm font-medium text-emerald-300 hover:bg-emerald-500/30"
          onClick={() => alert(`[MVP] Mở "${card.title}" — sẽ nối route ở bước sau.`)}
        >
          {card.cta}
        </button>
        <button
          aria-label="Gợi ý SOP"
          className="rounded-md border border-[#2a2a2a] px-2 py-1.5 text-xs text-[#8892b0] hover:bg-[#1a1a1a]"
          onClick={() => onHint(card.sop)}
        >
          ?
        </button>
      </div>
    </div>
  );
}
