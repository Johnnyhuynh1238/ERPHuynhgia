"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  Receipt,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Truck,
  Zap,
} from "lucide-react";
import { PopupOrderMaterial } from "./popup-order-material";
import { PopupPettyCash } from "./popup-petty-cash";

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
    workOrderOutputsToday: number;
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
  "6.9": {
    title: "6.9 Yêu cầu chi mua lẻ",
    body: "Mua nhanh ngoài đề xuất (vật tư phát sinh, cơm thợ, xe ôm…). Nhập số tiền + ghi chú + ảnh hoá đơn → TPTC duyệt → KT chi.",
  },
};

export function KsQlTodayClient({ user, projects, selectedProjectId }: Props) {
  const [now, setNow] = useState<Date | null>(null);
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hintOpen, setHintOpen] = useState<{ sop: string; anchor: DOMRect } | null>(null);
  const [showOrderPopup, setShowOrderPopup] = useState(false);
  const [showPettyCashPopup, setShowPettyCashPopup] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const reloadTodayData = useCallback(() => {
    if (!selectedProjectId) return;
    fetch(`/api/ks-ql/today?projectId=${selectedProjectId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setData(j))
      .catch(() => {});
  }, [selectedProjectId]);

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
      <div className="rounded-2xl border border-[#2a221c] bg-[#181410] p-8 text-center">
        <HardHat className="mx-auto mb-3 h-8 w-8 text-[#9a8f80]" />
        <div className="text-base font-medium text-[#f5ede4]">Chưa có dự án nào</div>
        <p className="mt-1 text-sm text-[#9a8f80]">Liên hệ TPTC để được phân dự án.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section>
        <div className="text-sm text-[#9a8f80]">{now ? `${vnGreeting(hour)}, ${firstName}.` : "..."}</div>
        <h1
          className="mt-0.5 text-[26px] font-semibold tracking-tight"
          style={{
            background: "linear-gradient(90deg, #f5ede4 0%, #E0B855 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Hôm nay
        </h1>
        <div className="mt-0.5 text-xs text-[#9a8f80]">{now ? vnDate(now) : ""}</div>
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
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                  active
                    ? "border-[#E0B855]/50 bg-[#E0B855]/15 text-[#E0B855]"
                    : "border-[#2a221c] bg-[#181410] text-[#d4c8b8] hover:border-[#3a2d22] hover:bg-[#221b15]"
                }`}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      ) : null}

      {project ? (
        <Link
          href={`/ks-ql/project/${project.id}`}
          className="group block overflow-hidden rounded-2xl border border-[#2a221c] p-4 transition-all hover:-translate-y-px hover:border-[#E0B855]/40 hover:shadow-[0_4px_16px_-8px_rgba(210,122,82,0.4)]"
          style={{
            background:
              "linear-gradient(135deg, #1f1812 0%, #181410 50%, #120e0b 100%)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ background: "rgba(210,122,82,0.15)", color: "#D27A52" }}
                >
                  {project.code}
                </span>
                <span
                  className="text-[10px] uppercase tracking-wider"
                  style={{ color: project.status === "in_progress" ? "#6FA677" : "#E0B855" }}
                >
                  {project.status === "in_progress" ? "Đang thi công" : "Đang chuẩn bị"}
                </span>
              </div>
              <div className="mt-1 truncate text-[17px] font-semibold text-[#f5ede4]">{project.name}</div>
              {project.address ? (
                <div className="mt-0.5 truncate text-xs text-[#9a8f80]">{project.address}</div>
              ) : null}
              <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[#E0B855] opacity-80 transition-opacity group-hover:opacity-100">
                <span>Mở chi tiết dự án</span>
                <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </div>
            </div>
          </div>
        </Link>
      ) : null}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-2xl border border-[#2a221c] bg-[#181410]"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      ) : data ? (
        <>
          {data.alerts.length > 0 ? (
            <section
              className="overflow-hidden rounded-2xl border p-4"
              style={{
                borderColor: "rgba(210,107,107,0.35)",
                background:
                  "linear-gradient(135deg, rgba(210,107,107,0.12) 0%, rgba(224,184,85,0.05) 100%)",
              }}
            >
              <div className="mb-2 flex items-center gap-2" style={{ color: "#D26B6B" }}>
                <AlertTriangle className="h-4 w-4" />
                <span className="text-[11px] font-semibold uppercase tracking-wider">Cần xử lý ngay</span>
              </div>
              <ul className="space-y-1.5">
                {data.alerts.map((a) => (
                  <li key={a.id} className="flex items-start gap-2 text-sm text-[#f5ede4]">
                    <span
                      className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: "#D26B6B" }}
                    />
                    <span>{a.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <QuickActions
            cards={[
              {
                Icon: Package,
                title: "Đặt VT/Máy",
                status: "Bất cứ lúc nào · KT lên đơn",
                statusTone: "muted",
                cta: "Đặt",
                sop: "6.4",
                onClick: selectedProjectId ? () => setShowOrderPopup(true) : undefined,
              },
              {
                Icon: Truck,
                title: "Nhận VT/MM",
                status:
                  data.morning.materialsIncoming === 0
                    ? "Chưa có hàng được duyệt cấp"
                    : `${data.morning.materialsIncoming} món đã duyệt cấp`,
                statusTone: data.morning.materialsIncoming === 0 ? "muted" : "warn",
                cta: data.morning.materialsIncoming === 0 ? "Xem" : "Nhận",
                sop: "6.5",
                muted: data.morning.materialsIncoming === 0,
                onClick: selectedProjectId ? () => setShowOrderPopup(true) : undefined,
              },
              {
                Icon: Receipt,
                title: "Yêu cầu chi mua lẻ",
                status: "Mua nhanh tại công trình · TPTC duyệt → KT chi",
                statusTone: "muted",
                cta: "Yêu cầu",
                sop: "6.9",
                onClick: selectedProjectId ? () => setShowPettyCashPopup(true) : undefined,
              },
            ]}
            onHint={(sop, anchor) => setHintOpen({ sop, anchor })}
          />

          <PhaseSection
            id="morning"
            title="Đầu ngày"
            sub="6:00 – 8:00"
            Icon={Sunrise}
            accent="gold"
            isCurrent={slot === "morning"}
            cards={[
              {
                Icon: ListTodo,
                title: "Chấm công thợ",
                status: data.morning.attendanceDone ? "Đã chấm" : "Chưa làm",
                statusTone: data.morning.attendanceDone ? "done" : "todo",
                cta: data.morning.attendanceDone ? "Sửa" : "Chấm",
                sop: "6.1",
                href: selectedProjectId
                  ? `/cham-cong-tho/${selectedProjectId}?session=${slot === "morning" ? "morning" : "afternoon"}&back=/ks-ql/today?p=${selectedProjectId}`
                  : undefined,
              },
              {
                Icon: Camera,
                title: "Ảnh tổ hôm nay",
                status: data.morning.teamPhotoDone ? "Đã chụp" : "Chưa chụp",
                statusTone: data.morning.teamPhotoDone ? "done" : "todo",
                cta: "Chụp",
                sop: "6.1",
              },
            ]}
            onHint={(sop, anchor) => setHintOpen({ sop, anchor })}
          />

          <PhaseSection
            id="midday"
            title="Trong ngày"
            sub="8:00 – 16:00"
            Icon={Sun}
            accent="terra"
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
                Icon: Flag,
                title: "Gắn cờ sự cố",
                status: "Khi có vấn đề",
                statusTone: "muted",
                cta: "Mở",
                sop: "6.8",
              },
            ]}
            onHint={(sop, anchor) => setHintOpen({ sop, anchor })}
          />

          <PhaseSection
            id="evening"
            title="Cuối ngày"
            sub="16:00 – 19:00"
            Icon={Sunset}
            accent="green"
            isCurrent={slot === "evening"}
            cards={[
              {
                Icon: Sparkles,
                title: "Rải công + % tiến độ",
                status:
                  data.evening.workOrdersToday === 0
                    ? "Chưa có phiếu giao việc"
                    : data.evening.assignDone
                      ? `Đã rải ${data.evening.workOrderOutputsToday}/${data.evening.workOrdersToday} phiếu`
                      : `${data.evening.workOrderOutputsToday}/${data.evening.workOrdersToday} phiếu đã rải`,
                statusTone:
                  data.evening.workOrdersToday === 0
                    ? "muted"
                    : data.evening.assignDone
                      ? "done"
                      : "todo",
                cta: data.evening.assignDone ? "Sửa" : "Rải",
                sop: "6.2",
                muted: data.evening.workOrdersToday === 0,
                href: selectedProjectId
                  ? `/projects/${selectedProjectId}/eod?back=/ks-ql/today?p=${selectedProjectId}`
                  : undefined,
              },
              {
                Icon: Package,
                title: "Kiểm VT/MM cho ngày mai",
                status: "Xem đã đặt đủ cho việc mai chưa",
                statusTone: "muted",
                cta: "Mở",
                sop: "6.4",
                onClick: selectedProjectId ? () => setShowOrderPopup(true) : undefined,
              },
            ]}
            onHint={(sop, anchor) => setHintOpen({ sop, anchor })}
          />

          <section className="rounded-2xl border border-[#2a221c] bg-[#181410] p-4">
            <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#9a8f80]">
              <Info className="h-3.5 w-3.5" />
              KPI giai đoạn
            </div>
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
              <div>
                <div className="text-xs text-[#9a8f80]">Giai đoạn</div>
                <div className="text-sm font-medium text-[#f5ede4]">{data.kpi.phaseLabel ?? "Chưa mở GĐ"}</div>
              </div>
              <div>
                <div className="text-xs text-[#9a8f80]">Tiến độ</div>
                <div className="text-sm font-semibold text-[#f5ede4]">{data.kpi.progressPercent}%</div>
              </div>
              <div>
                <div className="text-xs text-[#9a8f80]">Công dôi/vượt</div>
                <div
                  className="text-sm font-semibold"
                  style={{ color: data.kpi.laborDelta >= 0 ? "#6FA677" : "#D26B6B" }}
                >
                  {data.kpi.laborDelta >= 0 ? `+${data.kpi.laborDelta}` : data.kpi.laborDelta}
                </div>
              </div>
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-2xl border border-[#2a221c] bg-[#181410] p-10 text-center text-[#9a8f80]">
          Chưa có dữ liệu.
        </div>
      )}

      {showOrderPopup && selectedProjectId && project ? (
        <PopupOrderMaterial
          projectId={selectedProjectId}
          projectName={project.name}
          currentUserId={user.id}
          onClose={() => {
            setShowOrderPopup(false);
            reloadTodayData();
          }}
        />
      ) : null}

      {showPettyCashPopup && selectedProjectId && project ? (
        <PopupPettyCash
          projectId={selectedProjectId}
          projectName={project.name}
          onClose={() => setShowPettyCashPopup(false)}
        />
      ) : null}

      {hintOpen && SOP_HINTS[hintOpen.sop] ? (
        <SopBubble
          hint={SOP_HINTS[hintOpen.sop]}
          anchor={hintOpen.anchor}
          onClose={() => setHintOpen(null)}
        />
      ) : null}
    </div>
  );
}

function SopBubble({
  hint,
  anchor,
  onClose,
}: {
  hint: { title: string; body: string };
  anchor: DOMRect;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    placement: "above" | "below";
    tailLeft: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const box = ref.current.getBoundingClientRect();
    const W = box.width;
    const H = box.height;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;
    const triggerCx = anchor.left + anchor.width / 2;

    let left = triggerCx - W / 2;
    left = Math.max(margin, Math.min(left, vw - W - margin));
    const tailLeft = Math.max(20, Math.min(triggerCx - left, W - 20));

    const spaceAbove = anchor.top - margin;
    const spaceBelow = vh - (anchor.top + anchor.height) - margin;
    const placement: "above" | "below" =
      spaceAbove >= H + 12 || spaceAbove > spaceBelow ? "above" : "below";

    if (placement === "above") {
      setPos({ left, bottom: vh - anchor.top + 10, placement, tailLeft });
    } else {
      setPos({ left, top: anchor.top + anchor.height + 10, placement, tailLeft });
    }
  }, [anchor]);

  useEffect(() => {
    if (!pos) return;
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [pos]);

  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onEsc);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  const tailVisible = !!pos;

  return (
    <div
      ref={ref}
      role="tooltip"
      className="fixed z-50 w-72 max-w-[calc(100vw-1.5rem)]"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top,
        bottom: pos?.bottom,
        visibility: pos ? "visible" : "hidden",
        transformOrigin: pos
          ? `${pos.tailLeft}px ${pos.placement === "above" ? "100%" : "0%"}`
          : "center",
        animation: mounted ? "ks-bubble-inflate 520ms cubic-bezier(0.16, 1, 0.3, 1) both" : "none",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative rounded-2xl border border-[#3a2d22] bg-[#1f1812] p-3.5 shadow-2xl">
        <div
          className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "#D27A52" }}
        >
          <HelpCircle className="h-3 w-3" />
          SOP 11 — gợi ý nhanh
        </div>
        <div className="mt-1 text-[14px] font-semibold leading-snug text-[#f5ede4]">
          {hint.title}
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-[#d4c8b8]">{hint.body}</p>
        {tailVisible && pos ? (
          <span
            aria-hidden
            className="absolute block h-3 w-3 rotate-45 border bg-[#1f1812]"
            style={{
              left: pos.tailLeft - 6,
              borderColor: "#3a2d22",
              ...(pos.placement === "above"
                ? { bottom: -7, borderTopColor: "transparent", borderLeftColor: "transparent" }
                : { top: -7, borderBottomColor: "transparent", borderRightColor: "transparent" }),
            }}
          />
        ) : null}
      </div>
      <style jsx>{`
        @keyframes ks-bubble-inflate {
          0%   { transform: scale(0.04); opacity: 0; }
          40%  { opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
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
  href?: string;
  onClick?: () => void;
};

const ACCENT_STYLES: Record<
  string,
  { borderColor: string; bgGrad: string; iconBg: string; iconColor: string; chipBg: string; chipColor: string }
> = {
  gold: {
    borderColor: "rgba(224,184,85,0.4)",
    bgGrad: "linear-gradient(135deg, rgba(224,184,85,0.08) 0%, transparent 60%), #181410",
    iconBg: "rgba(224,184,85,0.15)",
    iconColor: "#E0B855",
    chipBg: "rgba(224,184,85,0.18)",
    chipColor: "#E0B855",
  },
  terra: {
    borderColor: "rgba(210,122,82,0.4)",
    bgGrad: "linear-gradient(135deg, rgba(210,122,82,0.08) 0%, transparent 60%), #181410",
    iconBg: "rgba(210,122,82,0.15)",
    iconColor: "#D27A52",
    chipBg: "rgba(210,122,82,0.18)",
    chipColor: "#D27A52",
  },
  green: {
    borderColor: "rgba(111,166,119,0.4)",
    bgGrad: "linear-gradient(135deg, rgba(111,166,119,0.08) 0%, transparent 60%), #181410",
    iconBg: "rgba(111,166,119,0.15)",
    iconColor: "#6FA677",
    chipBg: "rgba(111,166,119,0.18)",
    chipColor: "#6FA677",
  },
};

function QuickActions({
  cards,
  onHint,
}: {
  cards: CardDef[];
  onHint: (sop: string, anchor: DOMRect) => void;
}) {
  return (
    <section
      className="overflow-hidden rounded-2xl border p-3 sm:p-4"
      style={{
        borderColor: "rgba(167,139,250,0.35)",
        background:
          "linear-gradient(135deg, rgba(167,139,250,0.08) 0%, transparent 60%), #181410",
      }}
    >
      <div
        className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider"
        style={{ color: "#a78bfa" }}
      >
        <Zap className="h-3.5 w-3.5" />
        Hành động nhanh
      </div>
      <div className="space-y-1.5">
        {cards.map((c, i) => (
          <ActionCard key={i} card={c} onHint={onHint} />
        ))}
      </div>
    </section>
  );
}

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
  accent: "gold" | "terra" | "green";
  isCurrent: boolean;
  cards: CardDef[];
  onHint: (sop: string, anchor: DOMRect) => void;
}) {
  const [open, setOpen] = useState(isCurrent);

  useEffect(() => {
    setOpen(isCurrent);
  }, [isCurrent]);

  const styles = ACCENT_STYLES[accent];

  return (
    <section
      data-slot={id}
      className="overflow-hidden rounded-2xl border transition-all duration-300"
      style={{
        borderColor: isCurrent ? styles.borderColor : "#2a221c",
        background: isCurrent ? styles.bgGrad : "#181410",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid h-10 w-10 place-items-center rounded-xl transition-transform"
            style={{ background: styles.iconBg, color: styles.iconColor }}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-[#f5ede4]">{title}</span>
              {isCurrent ? (
                <span
                  className="relative overflow-hidden rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ background: styles.chipBg, color: styles.chipColor }}
                >
                  <span className="relative z-10">Đang</span>
                  <span
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)",
                      animation: "ks-shimmer 2.4s linear infinite",
                    }}
                  />
                </span>
              ) : null}
            </div>
            <div className="text-xs text-[#9a8f80]">{sub}</div>
          </div>
        </div>
        <span className="text-[#9a8f80] transition-transform duration-200" style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}>
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-[#2a221c] p-2 sm:p-3">
            <div className="space-y-1.5">
              {cards.map((c, i) => (
                <ActionCard key={i} card={c} onHint={onHint} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes ks-shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </section>
  );
}

const TONE_BADGE: Record<Tone, string> = {
  done: "text-[#6FA677]",
  todo: "text-[#E0B855]",
  warn: "text-[#D26B6B]",
  muted: "text-[#6e6457]",
};

function ActionCard({
  card,
  onHint,
}: {
  card: CardDef;
  onHint: (sop: string, anchor: DOMRect) => void;
}) {
  const Icon = card.Icon;
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <div
      className={`group flex items-center gap-3 rounded-xl border border-[#2a221c] bg-[#120e0b] p-3 transition-all ${
        card.muted
          ? "opacity-60"
          : "hover:-translate-y-px hover:border-[#3a2d22] hover:bg-[#1a1612] hover:shadow-[0_4px_16px_-8px_rgba(210,122,82,0.4)]"
      }`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[#2a221c] bg-[#181410] text-[#d4c8b8]">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-[#f5ede4]">{card.title}</div>
        <div className={`truncate text-xs ${TONE_BADGE[card.statusTone]}`}>{card.status}</div>
      </div>
      <button
        ref={triggerRef}
        aria-label="Gợi ý SOP"
        onClick={() => {
          const r = triggerRef.current?.getBoundingClientRect();
          if (r) onHint(card.sop, r);
        }}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#2a221c] text-[#9a8f80] transition-all hover:scale-105 hover:bg-[#221b15] hover:text-[#f5ede4]"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      {card.onClick ? (
        <button
          className="shrink-0 rounded-lg px-3.5 py-1.5 text-sm font-medium text-[#0d0b09] transition-all hover:brightness-110 hover:shadow-[0_4px_12px_-4px_rgba(224,184,85,0.5)]"
          style={{ background: "linear-gradient(135deg, #E0B855 0%, #D27A52 100%)" }}
          onClick={card.onClick}
        >
          {card.cta}
        </button>
      ) : card.href ? (
        <Link
          href={card.href}
          className="shrink-0 rounded-lg px-3.5 py-1.5 text-sm font-medium text-[#0d0b09] transition-all hover:brightness-110 hover:shadow-[0_4px_12px_-4px_rgba(224,184,85,0.5)]"
          style={{ background: "linear-gradient(135deg, #E0B855 0%, #D27A52 100%)" }}
        >
          {card.cta}
        </Link>
      ) : (
        <button
          className="shrink-0 rounded-lg px-3.5 py-1.5 text-sm font-medium text-[#0d0b09] transition-all hover:brightness-110 hover:shadow-[0_4px_12px_-4px_rgba(224,184,85,0.5)]"
          style={{ background: "linear-gradient(135deg, #E0B855 0%, #D27A52 100%)" }}
          onClick={() => alert(`[MVP] Mở "${card.title}" — sẽ nối route ở bước sau.`)}
        >
          {card.cta}
        </button>
      )}
    </div>
  );
}
