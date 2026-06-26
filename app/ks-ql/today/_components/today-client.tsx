"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  ChevronRight,
  ClipboardCheck,
  Coins,
  Flag,
  HardHat,
  HelpCircle,
  ListTodo,
  Package,
  Receipt,
  Sparkles,
  Truck,
  UserCircle,
  Wrench,
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

          <ResponsibilitySection
            id="labor"
            title="Kiểm soát nhân công"
            sub="Chấm công, rải công, ảnh tổ"
            Icon={HardHat}
            accent="gold"
            summary={
              data.morning.attendanceDone
                ? data.evening.workOrdersToday === 0
                  ? "Đã chấm công · chưa có phiếu giao việc"
                  : data.evening.assignDone
                    ? `Đã chấm công · đã rải ${data.evening.workOrderOutputsToday}/${data.evening.workOrdersToday} phiếu`
                    : `Đã chấm công · còn ${data.evening.workOrdersToday - data.evening.workOrderOutputsToday} phiếu chưa rải`
                : "Chưa chấm công hôm nay"
            }
            badgeTone={data.morning.attendanceDone ? "ok" : "todo"}
            cards={[
              {
                Icon: ListTodo,
                title: "Chấm công thợ",
                status: data.morning.attendanceDone ? "Đã chấm" : "Chưa làm",
                statusTone: data.morning.attendanceDone ? "done" : "todo",
                cta: data.morning.attendanceDone ? "Sửa" : "Chấm",
                sop: "6.1",
                href: selectedProjectId
                  ? `/cham-cong-tho/${selectedProjectId}?session=${hour < 13 ? "morning" : "afternoon"}&back=/ks-ql/today?p=${selectedProjectId}`
                  : undefined,
                needsAction: !data.morning.attendanceDone,
              },
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
                count:
                  data.evening.workOrdersToday > 0 && !data.evening.assignDone
                    ? data.evening.workOrdersToday - data.evening.workOrderOutputsToday
                    : undefined,
                needsAction:
                  data.evening.workOrdersToday > 0 && !data.evening.assignDone,
              },
              {
                Icon: Camera,
                title: "Ảnh tổ hôm nay",
                status: data.morning.teamPhotoDone ? "Đã chụp" : "Chưa chụp",
                statusTone: data.morning.teamPhotoDone ? "done" : "todo",
                cta: "Chụp",
                sop: "6.1",
                href: "/reports",
                needsAction: !data.morning.teamPhotoDone,
              },
            ]}
            onHint={(sop, anchor) => setHintOpen({ sop, anchor })}
          />

          <ResponsibilitySection
            id="quality"
            title="Kiểm soát chất lượng"
            sub="QC hold-point, sự cố"
            Icon={ClipboardCheck}
            accent="terra"
            summary={
              data.midday.qcHoldPoints > 0
                ? `${data.midday.qcHoldPoints} điểm QC cần tick`
                : "Không có điểm QC chờ"
            }
            badgeTone={data.midday.qcHoldPoints > 0 ? "warn" : "ok"}
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
                href: selectedProjectId
                  ? `/projects/${selectedProjectId}/qc-mapping`
                  : undefined,
                count: data.midday.qcHoldPoints > 0 ? data.midday.qcHoldPoints : undefined,
                needsAction: data.midday.qcHoldPoints > 0,
              },
              {
                Icon: Flag,
                title: "Gắn cờ sự cố",
                status: "Khi có vấn đề",
                statusTone: "muted",
                cta: "Mở",
                sop: "6.8",
                href: "/reports",
              },
            ]}
            onHint={(sop, anchor) => setHintOpen({ sop, anchor })}
          />

          <ResponsibilitySection
            id="material"
            title="Kiểm soát vật tư & máy"
            sub="Đặt, nhận, kiểm, mua lẻ"
            Icon={Package}
            accent="green"
            summary={
              data.morning.materialsIncoming > 0
                ? `${data.morning.materialsIncoming} món VT đã duyệt cấp · chờ nhận`
                : "Chưa có VT về"
            }
            badgeTone={data.morning.materialsIncoming > 0 ? "warn" : "ok"}
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
                count: data.morning.materialsIncoming > 0 ? data.morning.materialsIncoming : undefined,
                needsAction: data.morning.materialsIncoming > 0,
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
              {
                Icon: Wrench,
                title: "Sổ máy + trạng thái",
                status: "Cập nhật khi đổi máy",
                statusTone: "muted",
                cta: "Mở",
                sop: "6.6",
                href: selectedProjectId
                  ? `/projects/${selectedProjectId}/log?entity=equipment`
                  : undefined,
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

          <ResponsibilitySection
            id="finance"
            title="Kiểm soát hiệu quả"
            sub="Dự toán giai đoạn vs thực tế"
            Icon={Coins}
            accent="purple"
            summary="Đang phát triển — sẽ hiện cảnh báo vượt dự toán"
            badgeTone="muted"
            customContent={
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <MetricBox label="Dự toán nhân công" value="--" />
                  <MetricBox label="Thực tế nhân công" value="--" />
                  <MetricBox label="Dự toán vật tư" value="--" />
                  <MetricBox label="Thực tế vật tư" value="--" />
                </div>
                <div className="rounded-lg border border-[#2a221c] bg-[#120e0b] p-3 text-xs text-[#9a8f80]">
                  Cảnh báo vượt dự toán nhân công / vật tư sẽ hiện ở đây khi có
                  dữ liệu thực tế.
                </div>
                {selectedProjectId ? (
                  <Link
                    href={`/projects/${selectedProjectId}/budget`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#E0B855] hover:underline"
                  >
                    Xem dự toán chi tiết
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                ) : null}
              </div>
            }
          />

          <ResponsibilitySection
            id="kpi"
            title="KPI cá nhân"
            sub="Chấm công, lương của bạn"
            Icon={UserCircle}
            accent="blue"
            summary="Đang phát triển — chấm công bản thân + lương tháng"
            badgeTone="muted"
            customContent={
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <MetricBox label="Công tháng này" value="--" />
                  <MetricBox label="Lương dự kiến" value="--" />
                </div>
                <div className="rounded-lg border border-[#2a221c] bg-[#120e0b] p-3 text-xs text-[#9a8f80]">
                  Trang chấm công bản thân + lương cá nhân sẽ nối vào đây.
                </div>
                <Link
                  href="/me/kpi"
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#60a5fa] hover:underline"
                >
                  Mở KPI cá nhân
                  <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            }
          />
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

      <style jsx global>{`
        @keyframes ks-icon-glow-pulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(224, 184, 85, 0.55), 0 0 12px 2px rgba(224, 184, 85, 0.25);
          }
          50% {
            box-shadow: 0 0 0 5px rgba(224, 184, 85, 0), 0 0 18px 4px rgba(224, 184, 85, 0.45);
          }
        }
        .ks-icon-glow {
          animation: ks-icon-glow-pulse 1.8s ease-in-out infinite;
        }
        @keyframes ks-icon-shimmer-sweep {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(120%); }
        }
        .ks-icon-shimmer::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            115deg,
            transparent 30%,
            rgba(255, 236, 200, 0.0) 42%,
            rgba(255, 236, 200, 0.55) 50%,
            rgba(255, 236, 200, 0.0) 58%,
            transparent 70%
          );
          animation: ks-icon-shimmer-sweep 2.4s ease-in-out infinite;
        }
      `}</style>
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
        animation: mounted ? "ks-ipad-zoom 480ms cubic-bezier(0.22, 1.1, 0.36, 1) both" : "none",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {tailVisible && pos ? (
        <span
          aria-hidden
          className="ks-tail-glow pointer-events-none absolute block"
          style={{
            left: pos.tailLeft - 30,
            width: 60,
            height: 60,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(255,221,150,0.85) 0%, rgba(224,184,85,0.55) 28%, rgba(210,122,82,0.25) 55%, transparent 75%)",
            ...(pos.placement === "above" ? { bottom: -30 } : { top: -30 }),
          }}
        />
      ) : null}
      <div className="relative overflow-hidden rounded-2xl border border-[#3a2d22] bg-[#1f1812] p-3.5 shadow-2xl">
        <span
          aria-hidden
          className="ks-shine pointer-events-none absolute -inset-y-2 -left-1/2 block w-3/5"
          style={{
            background:
              "linear-gradient(115deg, transparent 35%, rgba(255,236,200,0.18) 48%, rgba(255,221,150,0.28) 50%, rgba(255,236,200,0.18) 52%, transparent 65%)",
          }}
        />
        <div className="relative">
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
        </div>
      </div>
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
      <style jsx>{`
        @keyframes ks-ipad-zoom {
          0% {
            transform: scale(0.05);
            opacity: 0;
            filter: blur(6px);
          }
          22% {
            opacity: 1;
          }
          55% {
            filter: blur(0);
          }
          74% {
            transform: scale(1.025);
          }
          100% {
            transform: scale(1);
            filter: blur(0);
            opacity: 1;
          }
        }
        @keyframes ks-tail-burst {
          0% {
            transform: scale(0.25);
            opacity: 0.95;
          }
          55% {
            opacity: 0.5;
          }
          100% {
            transform: scale(3.2);
            opacity: 0;
          }
        }
        .ks-tail-glow {
          animation: ks-tail-burst 560ms cubic-bezier(0.22, 1, 0.36, 1) both;
          will-change: transform, opacity;
        }
        @keyframes ks-shine-sweep {
          0% {
            transform: translateX(-30%) rotate(0deg);
            opacity: 0;
          }
          20% {
            opacity: 1;
          }
          80% {
            opacity: 1;
          }
          100% {
            transform: translateX(360%) rotate(0deg);
            opacity: 0;
          }
        }
        .ks-shine {
          animation: ks-shine-sweep 1100ms cubic-bezier(0.22, 1, 0.36, 1) 140ms both;
          will-change: transform, opacity;
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
  count?: number;
  needsAction?: boolean;
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
  purple: {
    borderColor: "rgba(167,139,250,0.4)",
    bgGrad: "linear-gradient(135deg, rgba(167,139,250,0.08) 0%, transparent 60%), #181410",
    iconBg: "rgba(167,139,250,0.15)",
    iconColor: "#a78bfa",
    chipBg: "rgba(167,139,250,0.18)",
    chipColor: "#a78bfa",
  },
  blue: {
    borderColor: "rgba(96,165,250,0.4)",
    bgGrad: "linear-gradient(135deg, rgba(96,165,250,0.08) 0%, transparent 60%), #181410",
    iconBg: "rgba(96,165,250,0.15)",
    iconColor: "#60a5fa",
    chipBg: "rgba(96,165,250,0.18)",
    chipColor: "#60a5fa",
  },
};

type BadgeTone = "ok" | "warn" | "todo" | "alert" | "muted";

const BADGE_STYLES: Record<BadgeTone, { bg: string; color: string; label: string }> = {
  ok: { bg: "rgba(111,166,119,0.18)", color: "#6FA677", label: "Ổn" },
  warn: { bg: "rgba(224,184,85,0.18)", color: "#E0B855", label: "Cần xem" },
  todo: { bg: "rgba(224,184,85,0.18)", color: "#E0B855", label: "Cần làm" },
  alert: { bg: "rgba(210,107,107,0.18)", color: "#D26B6B", label: "Cảnh báo" },
  muted: { bg: "rgba(154,143,128,0.15)", color: "#9a8f80", label: "—" },
};

function ResponsibilitySection({
  id,
  title,
  sub,
  Icon,
  accent,
  summary,
  badgeTone,
  cards,
  customContent,
  onHint,
}: {
  id: string;
  title: string;
  sub: string;
  Icon: React.ComponentType<{ className?: string }>;
  accent: "gold" | "terra" | "green" | "purple" | "blue";
  summary?: string;
  badgeTone?: BadgeTone;
  cards?: CardDef[];
  customContent?: React.ReactNode;
  onHint?: (sop: string, anchor: DOMRect) => void;
}) {
  const styles = ACCENT_STYLES[accent];
  const badge = badgeTone ? BADGE_STYLES[badgeTone] : null;

  return (
    <section
      data-section={id}
      className="overflow-hidden rounded-2xl border"
      style={{
        borderColor: styles.borderColor,
        background: styles.bgGrad,
      }}
    >
      <div className="flex min-w-0 items-center gap-3 px-4 py-3.5">
        <span
          className="grid h-10 w-10 place-items-center rounded-xl"
          style={{ background: styles.iconBg, color: styles.iconColor }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-[#f5ede4]">{title}</span>
            {badge && badgeTone !== "muted" ? (
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{ background: badge.bg, color: badge.color }}
              >
                {badge.label}
              </span>
            ) : null}
          </div>
          <div className="truncate text-xs text-[#9a8f80]">{summary || sub}</div>
        </div>
      </div>
      <div className="border-t border-[#2a221c] p-2 sm:p-3">
        {customContent ? (
          customContent
        ) : cards && onHint ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
            {cards.map((c, i) => (
              <IconTile key={i} tile={c} onHint={onHint} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#2a221c] bg-[#120e0b] p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-[#9a8f80]">{label}</div>
      <div className="mt-0.5 text-base font-semibold text-[#f5ede4]">{value}</div>
    </div>
  );
}

const TONE_DOT: Record<Tone, string | null> = {
  done: "#6FA677",
  todo: "#E0B855",
  warn: "#D26B6B",
  muted: null,
};

function IconTile({
  tile,
  onHint,
}: {
  tile: CardDef;
  onHint: (sop: string, anchor: DOMRect) => void;
}) {
  const Icon = tile.Icon;
  const helpRef = useRef<HTMLButtonElement>(null);
  const dotColor = TONE_DOT[tile.statusTone];

  const tileClass = `group flex w-full flex-col items-center gap-1.5 rounded-xl p-2 transition-all ${
    tile.muted
      ? "opacity-50"
      : "hover:-translate-y-px active:scale-95"
  }`;

  const showCount = typeof tile.count === "number" && tile.count > 0;
  const inner = (
    <>
      <span
        className={`relative grid h-12 w-12 place-items-center rounded-2xl border border-[#2a221c] bg-[#1a1612] text-[#d4c8b8] transition-colors group-hover:border-[#3a2d22] group-hover:bg-[#221b15] ${
          tile.needsAction ? "ks-icon-glow" : ""
        }`}
      >
        <Icon className="h-5 w-5" />
        {tile.needsAction ? (
          <span aria-hidden className="ks-icon-shimmer pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" />
        ) : null}
        {showCount ? (
          <span
            className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[#181410]"
            style={{ background: "#FF3B30", height: 18 }}
          >
            {tile.count! > 99 ? "99+" : tile.count}
          </span>
        ) : !showCount && dotColor ? (
          <span
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#181410]"
            style={{ background: dotColor }}
          />
        ) : null}
      </span>
      <span className="line-clamp-2 text-center text-[11px] leading-tight text-[#d4c8b8]">
        {tile.title}
      </span>
    </>
  );

  return (
    <div className="relative">
      {tile.onClick ? (
        <button type="button" className={tileClass} onClick={tile.onClick}>
          {inner}
        </button>
      ) : tile.href ? (
        <Link href={tile.href} className={tileClass}>
          {inner}
        </Link>
      ) : (
        <button
          type="button"
          className={tileClass}
          onClick={() => alert(`[MVP] Mở "${tile.title}" — sẽ nối route ở bước sau.`)}
        >
          {inner}
        </button>
      )}
      <button
        ref={helpRef}
        type="button"
        aria-label="Gợi ý SOP"
        onClick={(e) => {
          e.stopPropagation();
          const r = helpRef.current?.getBoundingClientRect();
          if (r) onHint(tile.sop, r);
        }}
        className="absolute right-0.5 top-0.5 z-10 grid h-5 w-5 place-items-center rounded-full text-[#6e6457] transition-colors hover:bg-[#221b15] hover:text-[#f5ede4]"
      >
        <HelpCircle className="h-3 w-3" />
      </button>
    </div>
  );
}
