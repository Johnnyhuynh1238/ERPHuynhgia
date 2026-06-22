"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Camera,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Flag,
  HardHat,
  HelpCircle,
  Info,
  ListTodo,
  Package,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Truck,
  Wrench,
} from "lucide-react";

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
  if (hour < 8) return "morning";
  if (hour < 16) return "midday";
  return "evening";
}

function vnGreeting(hour: number) {
  if (hour < 11) return "Chào buổi sáng";
  if (hour < 14) return "Chào buổi trưa";
  if (hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

function vnDate(d: Date) {
  const weekdays = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
  return `${weekdays[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
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
  "6.8": {
    title: "6.8 Sự cố / ngoại lệ",
    body: "Bất cứ khi nào có vấn đề (chậm, thiếu, lỗi, máy hỏng, nghi thất thoát, thời tiết): gắn cờ + chọn loại + mô tả + ảnh.",
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

  const hour = now ? now.getHours() : 7;
  const slot: Slot = useMemo(() => currentSlot(hour), [hour]);
  const project = projects.find((p) => p.id === selectedProjectId) ?? null;
  const firstName = (user.name || "KS").split(" ").pop() || user.name;

  if (projects.length === 0) {
    return (
      <div className="rounded-2xl border border-[#1f2536] bg-[#131722] p-8 text-center">
        <HardHat className="mx-auto mb-3 h-8 w-8 text-[#7b8499]" />
        <div className="text-base font-medium text-white">Chưa có dự án nào</div>
        <p className="mt-1 text-sm text-[#7b8499]">Liên hệ TPTC để được phân dự án.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section>
        <div className="text-sm text-[#7b8499]">{now ? `${vnGreeting(hour)}, ${firstName}.` : "..."}</div>
        <h1 className="mt-0.5 text-[26px] font-semibold tracking-tight text-white">Hôm nay</h1>
        <div className="mt-0.5 text-xs text-[#7b8499]">{now ? vnDate(now) : ""}</div>
      </section>

      {projects.length > 1 ? (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {projects.map((p) => {
            const active = p.id === selectedProjectId;
            return (
              <button
                key={p.id}
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.set("p", p.id);
                  window.location.href = url.toString();
                }}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-orange-500/40 bg-orange-500/15 text-orange-300"
                    : "border-[#1f2536] bg-[#131722] text-[#a0aec0] hover:bg-[#1a1f2e]"
                }`}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      ) : null}

      {project ? (
        <section className="overflow-hidden rounded-2xl border border-[#1f2536] bg-gradient-to-br from-[#13182a] to-[#0f1320] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-300">
                  {project.code}
                </span>
                <span
                  className={`text-[10px] uppercase tracking-wider ${
                    project.status === "in_progress" ? "text-emerald-300" : "text-amber-300"
                  }`}
                >
                  {project.status === "in_progress" ? "Đang thi công" : "Đang chuẩn bị"}
                </span>
              </div>
              <div className="mt-1 truncate text-[17px] font-semibold text-white">{project.name}</div>
              {project.address ? <div className="mt-0.5 truncate text-xs text-[#7b8499]">{project.address}</div> : null}
            </div>
          </div>
        </section>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-[#1f2536] bg-[#131722] p-10 text-center text-[#7b8499]">Đang tải…</div>
      ) : data ? (
        <>
          {data.alerts.length > 0 ? (
            <section className="overflow-hidden rounded-2xl border border-rose-500/30 bg-gradient-to-br from-rose-500/10 to-amber-500/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-rose-300">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-[11px] font-semibold uppercase tracking-wider">Cần xử lý ngay</span>
              </div>
              <ul className="space-y-1.5">
                {data.alerts.map((a) => (
                  <li key={a.id} className="flex items-start gap-2 text-sm text-rose-50">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                    <span>{a.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <PhaseSection
            id="morning"
            title="Đầu ngày"
            sub="6:00 – 8:00"
            Icon={Sunrise}
            accent="amber"
            isCurrent={slot === "morning"}
            cards={[
              {
                Icon: ListTodo,
                title: "Chấm công thợ",
                status: data.morning.attendanceDone ? "Đã chấm" : "Chưa làm",
                statusTone: data.morning.attendanceDone ? "done" : "todo",
                cta: "Mở",
                sop: "6.1",
              },
              {
                Icon: Camera,
                title: "Ảnh tổ hôm nay",
                status: data.morning.teamPhotoDone ? "Đã chụp" : "Chưa chụp",
                statusTone: data.morning.teamPhotoDone ? "done" : "todo",
                cta: "Chụp",
                sop: "6.1",
              },
              {
                Icon: Truck,
                title: "VT đến hôm nay",
                status:
                  data.morning.materialsIncoming === 0
                    ? "Chưa có"
                    : `${data.morning.materialsIncoming} món chờ nhận`,
                statusTone: data.morning.materialsIncoming === 0 ? "muted" : "warn",
                cta: "Nhận",
                sop: "6.5",
                muted: data.morning.materialsIncoming === 0,
              },
              {
                Icon: Wrench,
                title: "Máy chờ kiểm",
                status: data.morning.machinesWaiting === 0 ? "Không có" : `${data.morning.machinesWaiting} cái`,
                statusTone: data.morning.machinesWaiting === 0 ? "muted" : "warn",
                cta: "Xem",
                sop: "6.6",
                muted: data.morning.machinesWaiting === 0,
              },
            ]}
            onHint={setHintKey}
          />

          <PhaseSection
            id="midday"
            title="Trong ngày"
            sub="8:00 – 16:00"
            Icon={Sun}
            accent="orange"
            isCurrent={slot === "midday"}
            cards={[
              {
                Icon: ClipboardCheck,
                title: "QC hold-point",
                status:
                  data.midday.qcHoldPoints === 0
                    ? "Không có điểm chờ"
                    : `${data.midday.qcHoldPoints} điểm cần tick`,
                statusTone: data.midday.qcHoldPoints === 0 ? "muted" : "warn",
                cta: "Mở",
                sop: "6.3",
                muted: data.midday.qcHoldPoints === 0,
              },
              {
                Icon: Package,
                title: "VT về cần nhận",
                status:
                  data.midday.materialReceiveToday === 0
                    ? "Chưa có"
                    : `${data.midday.materialReceiveToday} phiếu`,
                statusTone: data.midday.materialReceiveToday === 0 ? "muted" : "warn",
                cta: "Nhận",
                sop: "6.5",
                muted: data.midday.materialReceiveToday === 0,
              },
              {
                Icon: Flag,
                title: "Gắn cờ sự cố",
                status: "Khi có vấn đề",
                statusTone: "muted",
                cta: "Mở",
                sop: "6.8",
              },
            ]}
            onHint={setHintKey}
          />

          <PhaseSection
            id="evening"
            title="Cuối ngày"
            sub="16:00 – 19:00"
            Icon={Sunset}
            accent="indigo"
            isCurrent={slot === "evening"}
            cards={[
              {
                Icon: Sparkles,
                title: "Rải công + % tiến độ",
                status: data.evening.assignDone
                  ? "Đã rải"
                  : `${data.evening.workOrdersToday} phiếu giao việc`,
                statusTone: data.evening.assignDone ? "done" : "todo",
                cta: "Mở",
                sop: "6.2",
              },
              {
                Icon: Package,
                title: "Đặt VT/Máy ngày mai",
                status: data.evening.materialRequestForTomorrow ? "Đã đặt" : "Chưa đặt",
                statusTone: data.evening.materialRequestForTomorrow ? "done" : "todo",
                cta: "Mở",
                sop: "6.4",
              },
            ]}
            onHint={setHintKey}
          />

          <section className="rounded-2xl border border-[#1f2536] bg-[#131722] p-4">
            <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#7b8499]">
              <Info className="h-3.5 w-3.5" />
              KPI giai đoạn
            </div>
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
              <div>
                <div className="text-xs text-[#7b8499]">Giai đoạn</div>
                <div className="text-sm font-medium text-white">{data.kpi.phaseLabel ?? "Chưa mở GĐ"}</div>
              </div>
              <div>
                <div className="text-xs text-[#7b8499]">Tiến độ</div>
                <div className="text-sm font-semibold text-white">{data.kpi.progressPercent}%</div>
              </div>
              <div>
                <div className="text-xs text-[#7b8499]">Công dôi/vượt</div>
                <div
                  className={`text-sm font-semibold ${
                    data.kpi.laborDelta >= 0 ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {data.kpi.laborDelta >= 0 ? `+${data.kpi.laborDelta}` : data.kpi.laborDelta}
                </div>
              </div>
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-2xl border border-[#1f2536] bg-[#131722] p-10 text-center text-[#7b8499]">
          Chưa có dữ liệu.
        </div>
      )}

      {hintKey && SOP_HINTS[hintKey] ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
          onClick={() => setHintKey(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-[#1f2536] bg-[#131722] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider text-orange-300">
              <HelpCircle className="h-3.5 w-3.5" />
              SOP 11 — gợi ý nhanh
            </div>
            <div className="mb-1.5 text-lg font-semibold text-white">{SOP_HINTS[hintKey].title}</div>
            <p className="text-[14px] leading-relaxed text-[#a0aec0]">{SOP_HINTS[hintKey].body}</p>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setHintKey(null)}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-400"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type Tone = "done" | "todo" | "warn" | "muted";

type CardDef = {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  status: string;
  statusTone: Tone;
  cta: string;
  sop: keyof typeof SOP_HINTS | string;
  muted?: boolean;
};

const ACCENT_STYLES: Record<string, { ring: string; iconBg: string; iconText: string; chip: string }> = {
  amber: {
    ring: "border-amber-400/40 bg-gradient-to-br from-amber-500/8 to-transparent",
    iconBg: "bg-amber-500/15",
    iconText: "text-amber-300",
    chip: "bg-amber-500/15 text-amber-300",
  },
  orange: {
    ring: "border-orange-500/40 bg-gradient-to-br from-orange-500/8 to-transparent",
    iconBg: "bg-orange-500/15",
    iconText: "text-orange-300",
    chip: "bg-orange-500/15 text-orange-300",
  },
  indigo: {
    ring: "border-indigo-400/40 bg-gradient-to-br from-indigo-500/8 to-transparent",
    iconBg: "bg-indigo-500/15",
    iconText: "text-indigo-300",
    chip: "bg-indigo-500/15 text-indigo-300",
  },
};

function PhaseSection({
  id,
  title,
  sub,
  Icon,
  accent,
  isCurrent,
  cards,
  onHint,
}: {
  id: string;
  title: string;
  sub: string;
  Icon: React.ComponentType<{ className?: string }>;
  accent: "amber" | "orange" | "indigo";
  isCurrent: boolean;
  cards: CardDef[];
  onHint: (key: string) => void;
}) {
  const [open, setOpen] = useState(isCurrent);

  useEffect(() => {
    setOpen(isCurrent);
  }, [isCurrent]);

  const styles = ACCENT_STYLES[accent];

  return (
    <section
      data-slot={id}
      className={`overflow-hidden rounded-2xl border transition-colors ${
        isCurrent ? styles.ring : "border-[#1f2536] bg-[#131722]"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className={`grid h-10 w-10 place-items-center rounded-xl ${styles.iconBg} ${styles.iconText}`}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-white">{title}</span>
              {isCurrent ? (
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${styles.chip}`}>
                  Đang
                </span>
              ) : null}
            </div>
            <div className="text-xs text-[#7b8499]">{sub}</div>
          </div>
        </div>
        <span className="text-[#7b8499]">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>
      {open ? (
        <div className="border-t border-[#1f2536] p-2 sm:p-3">
          <div className="space-y-1.5">
            {cards.map((c, i) => (
              <ActionCard key={i} card={c} onHint={onHint} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

const TONE_BADGE: Record<Tone, string> = {
  done: "text-emerald-300",
  todo: "text-amber-300",
  warn: "text-rose-300",
  muted: "text-[#7b8499]",
};

function ActionCard({ card, onHint }: { card: CardDef; onHint: (key: string) => void }) {
  const Icon = card.Icon;
  return (
    <div
      className={`group flex items-center gap-3 rounded-xl border border-[#1f2536] bg-[#0f1320] p-3 transition-colors ${
        card.muted ? "opacity-60" : "hover:border-[#2a3147] hover:bg-[#121626]"
      }`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[#1f2536] bg-[#131722] text-[#a0aec0]">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-white">{card.title}</div>
        <div className={`truncate text-xs ${TONE_BADGE[card.statusTone]}`}>{card.status}</div>
      </div>
      <button
        aria-label="Gợi ý SOP"
        onClick={() => onHint(card.sop)}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#1f2536] text-[#7b8499] transition-colors hover:bg-[#1a1f2e] hover:text-white"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      <button
        className="shrink-0 rounded-lg bg-orange-500 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-orange-400"
        onClick={() => alert(`[MVP] Mở "${card.title}" — sẽ nối route ở bước sau.`)}
      >
        {card.cta}
      </button>
    </div>
  );
}
