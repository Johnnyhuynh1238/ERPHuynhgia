import Link from "next/link";
import "./ketoan-project-hub.css";

const statusLabel: Record<string, string> = {
  planning: "Planning",
  in_progress: "Đang thi công",
  completed: "Hoàn thành",
  paused: "Tạm ngưng",
};

const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n));

type Props = {
  projectId: string;
  code: string;
  name: string;
  customerName: string;
  status: string;
  orderCount: number;
  orderTotal: number;
  pendingCount: number;
  nccCount: number;
  tongNo: number;
  daTra: number;
  conLai: number;
};

// Màn kế toán vào dự án: brand ngà, CHỈ Mua hàng + Công nợ NCC (không tile thi công/tài chính khác).
export function KetoanProjectHub({
  projectId,
  code,
  name,
  customerName,
  status,
  orderCount,
  orderTotal,
  pendingCount,
  nccCount,
  tongNo,
  daTra,
  conLai,
}: Props) {
  const base = `/projects/${projectId}`;
  return (
    <div className="kph">
      <div className="kph-wrap">
        <div className="kph-top">
          <Link href="/projects" className="kph-back">
            ← Dự án
          </Link>
          <span className="kph-chip">Kế toán</span>
        </div>

        <div className="kph-eyebrow">
          {code} · {statusLabel[status] ?? status}
        </div>
        <div className="kph-h1">{name}</div>
        <div className="kph-meta">Chủ nhà: {customerName}</div>

        <div className="kph-sum">
          <div className="k">Công nợ NCC còn lại</div>
          <div className="tot kph-num">
            {fmt(conLai)}
            <span className="u">đ</span>
          </div>
          <div className="kph-split">
            <div className="c a">
              <div className="sk">Tổng nợ NCC</div>
              <div className="sv kph-num">{fmt(tongNo)}</div>
            </div>
            <div className="c b">
              <div className="sk">Đã trả</div>
              <div className="sv kph-num">{fmt(daTra)}</div>
            </div>
            <div className="c c">
              <div className="sk">Còn lại</div>
              <div className="sv kph-num">{fmt(conLai)}</div>
            </div>
          </div>
        </div>

        <div className="kph-blabel">Tài chính · Vật tư</div>
        <div className="kph-nav">
          <Link href={`${base}/mua-hang`} className="kph-navrow">
            <span className="kph-ic">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="21" r="1" />
                <circle cx="19" cy="21" r="1" />
                <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
              </svg>
            </span>
            <span className="kph-nb">
              <span className="nt">
                Mua hàng
                {pendingCount > 0 && <span className="pill">{pendingCount} chờ nhận</span>}
              </span>
              <span className="ns">
                {orderCount} đơn · tổng <b>{fmt(orderTotal)}đ</b>
                {pendingCount === 0 ? " — đã nhận đủ" : ` — ${pendingCount} đơn chờ nhận hàng`}
              </span>
            </span>
            <span className="kph-chev">›</span>
          </Link>

          <Link href={`${base}/cong-no`} className="kph-navrow">
            <span className="kph-ic">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
                <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
              </svg>
            </span>
            <span className="kph-nb">
              <span className="nt">Quản lý NCC</span>
              <span className="ns">
                {nccCount} NCC · còn nợ <b>{fmt(conLai)}đ</b> — công nợ · thầu phụ
              </span>
            </span>
            <span className="kph-chev">›</span>
          </Link>
        </div>

        <div className="kph-foot">Kế toán · chỉ mua hàng &amp; công nợ NCC</div>
      </div>
    </div>
  );
}
