import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PayCountdown } from "./countdown";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KT_PHONE = "0974828375";
const KT_PHONE_LABEL = "0974 828 375";

export const metadata: Metadata = {
  title: "Theo dõi thanh toán — Huỳnh Gia",
  robots: { index: false, follow: false },
};

function money(v: number) {
  return new Intl.NumberFormat("vi-VN").format(Math.round(v));
}
function fmtDate(d: Date | null) {
  if (!d) return "";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}
function fmtDateTime(d: Date | null) {
  if (!d) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(d);
}

const CSS = `
  .pay-body{font-family:-apple-system,"Segoe UI",Roboto,sans-serif;background:#FDF9F1;color:#4a3428;
    min-height:100dvh;margin:0;-webkit-font-smoothing:antialiased}
  .pay-body *{box-sizing:border-box}
  .pay-wrap{max-width:960px;margin:0 auto;padding:0 18px 48px}
  .pay-header{background:#fff;border-bottom:3px solid #D94E1E}
  .pay-hd{max-width:960px;margin:0 auto;padding:14px 18px;display:flex;align-items:center;gap:13px}
  .pay-hd img{height:38px;width:auto}
  .pay-hd .tag{font-size:11px;color:#9a8b78;font-weight:700;border-left:1.5px solid #ece2d2;padding-left:12px;line-height:1.3}
  .pay-hd .right{margin-left:auto;text-align:right;font-size:11px;color:#9a8b78}
  .pay-hd .right b{display:block;font-size:13px;color:#5a2d18}
  .pay-status{display:flex;align-items:center;gap:11px;padding:15px 18px;border-radius:14px;font-weight:800;font-size:16px;margin:22px 0 18px}
  .pay-status .dot{width:12px;height:12px;border-radius:50%}
  .pay-status .spread{margin-left:auto;font-size:12px;font-weight:600;opacity:.85}
  .st-wait{background:#fff3e2;color:#a85410;border:1px solid #f4d3a8}
  .st-wait .dot{background:#D94E1E}
  .st-paid{background:#e6f6ec;color:#127a45;border:1px solid #aee0c2}
  .st-paid .dot{background:#1fae5f}
  .st-cancel{background:#f3ecec;color:#9a3b3b;border:1px solid #e0c2c2}
  .st-cancel .dot{background:#c15}
  .pay-grid{display:grid;grid-template-columns:1fr;gap:16px}
  @media(min-width:760px){.pay-grid{grid-template-columns:1.1fr .9fr;align-items:start}}
  .pay-card{background:#fff;border:1px solid #ece2d2;border-radius:16px;padding:20px;box-shadow:0 2px 12px rgba(90,45,24,.05)}
  .pay-code{font-size:12px;color:#9a8b78;font-weight:700;letter-spacing:.6px}
  .pay-amount{font-size:34px;font-weight:800;color:#5a2d18;margin:8px 0 4px;letter-spacing:-.5px}
  .pay-amount .cur{font-size:16px;color:#C49A3A;font-weight:700}
  .pay-kv{display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-top:1px solid #f3ece0;font-size:14px}
  .pay-kv:first-of-type{border-top:none}
  .pay-kv .k{color:#9a8b78;white-space:nowrap}
  .pay-kv .v{color:#4a3428;font-weight:700;text-align:right}
  .pay-kv .v.phone{color:#D94E1E}
  .pay-sec{font-size:12px;font-weight:800;color:#5a2d18;text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px;display:flex;align-items:center;gap:7px}
  .pay-sec::before{content:"";width:14px;height:2px;background:#D94E1E;display:inline-block}
  .pay-contact{background:linear-gradient(135deg,#fff7ef,#fff);border-color:#f4dcc4}
  .pay-kt{display:flex;align-items:center;gap:13px;margin-top:2px}
  .pay-kt .av{width:46px;height:46px;border-radius:50%;background:#D94E1E;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px}
  .pay-kt .who{font-size:12px;color:#9a8b78}
  .pay-kt .who b{display:block;font-size:15px;color:#5a2d18}
  .pay-call{margin-top:14px}
  .pay-count{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:2px 0 12px;padding:9px 13px;border-radius:11px;background:#fff2e6;border:1px solid #f4cba3}
  .pay-count .lbl{font-size:12px;color:#9a6b45;font-weight:600}
  .pay-count .clk{font-size:19px;font-weight:800;color:#D94E1E;font-variant-numeric:tabular-nums;letter-spacing:.5px}
  .pay-count.over{background:#fdecec;border-color:#f3b4b4;color:#c0392b;font-size:12.5px;font-weight:700;justify-content:center;text-align:center}
  .pay-call.zalo{margin-top:9px}
  .pay-call a{display:block;text-align:center;padding:13px;border-radius:12px;font-weight:800;font-size:15px;text-decoration:none;background:#D94E1E;color:#fff}
  .pay-call.zalo a{background:#0068FF}
  .pay-paidline{font-size:13px;color:#127a45;font-weight:700;margin-bottom:14px;display:flex;align-items:center;gap:7px;flex-wrap:wrap}
  .pay-bills{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}
  @media(max-width:520px){.pay-bills{grid-template-columns:repeat(2,1fr)}}
  .pay-bill{position:relative;display:block;aspect-ratio:3/4;border-radius:11px;border:1px solid #ece2d2;overflow:hidden;background:#f2e6d3}
  .pay-bill img{width:100%;height:100%;object-fit:cover;display:block}
  .pay-bill .tag{position:absolute;top:6px;left:6px;background:#1fae5f;color:#fff;font-size:9px;font-weight:800;padding:2px 7px;border-radius:6px}
  .pay-note{text-align:center;color:#9a8b78;font-size:13px;padding:26px 20px}
  .pay-foot{text-align:center;font-size:11px;color:#9a8b78;margin-top:26px;line-height:1.6}
`;

export default async function PayTrackPage({ params }: { params: { token: string } }) {
  const token = params.token;
  const expense = await prisma.expense.findUnique({
    where: { publicToken: token },
    include: {
      project: { select: { name: true } },
      category: { select: { name: true } },
    },
  });
  if (!expense) notFound();

  const paid = expense.status === "paid";
  const cancelled = expense.status === "cancelled";
  const amount = Number(expense.amount);
  const paidAmount = expense.paidAmount != null ? Number(expense.paidAmount) : null;
  const bills = expense.paidReceiptUrls?.length
    ? expense.paidReceiptUrls
    : expense.paidReceiptUrl
      ? [expense.paidReceiptUrl]
      : [];

  return (
    <div className="pay-body">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <header className="pay-header">
        <div className="pay-hd">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pay-logo.png" alt="HuynhGia6.com" />
          <div className="tag">Theo dõi<br />thanh toán</div>
          <div className="right"><span>Mã lệnh</span><b>{expense.code}</b></div>
        </div>
      </header>

      <div className="pay-wrap">
        {cancelled ? (
          <div className="pay-status st-cancel"><span className="dot" /> Lệnh chi đã huỷ</div>
        ) : paid ? (
          <div className="pay-status st-paid">
            <span className="dot" /> Đã thanh toán
            <span className="spread">{fmtDateTime(expense.paidAt)}</span>
          </div>
        ) : (
          <div className="pay-status st-wait">
            <span className="dot" /> Đang chờ thanh toán
            <span className="spread">Cập nhật tự động</span>
          </div>
        )}

        <div className="pay-grid">
          <div style={{ display: "grid", gap: 16 }}>
            <div className="pay-card">
              <div className="pay-code">LỆNH CHI · {expense.code}</div>
              <div className="pay-amount">{money(amount)}<span className="cur"> đ</span></div>
              {expense.payee && (
                <div className="pay-kv"><span className="k">Người nhận</span><span className="v">{expense.payee}</span></div>
              )}
              {expense.payeePhone && (
                <div className="pay-kv"><span className="k">SĐT người nhận</span><span className="v phone">{expense.payeePhone}</span></div>
              )}
              <div className="pay-kv"><span className="k">Nội dung</span><span className="v">{expense.note || expense.category.name}</span></div>
              <div className="pay-kv"><span className="k">Ngày tạo</span><span className="v">{fmtDate(expense.createdAt)}</span></div>
            </div>

            {paid && bills.length > 0 && (
              <div className="pay-card">
                <div className="pay-paidline">
                  ✓ Đã chi {money(paidAmount ?? amount)}đ · {fmtDateTime(expense.paidAt)}
                </div>
                <div className="pay-sec">Ảnh chuyển khoản ({bills.length})</div>
                <div className="pay-bills">
                  {bills.map((_, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a key={i} className="pay-bill" href={`/pay/${token}/receipt?i=${i}`} target="_blank" rel="noreferrer">
                      <span className="tag">Bill {i + 1}</span>
                      <img src={`/pay/${token}/receipt?i=${i}`} alt={`Ảnh chuyển khoản ${i + 1}`} />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <div className="pay-card pay-contact">
              <div className="pay-sec">Liên hệ nếu chờ quá 30 phút</div>
              {!paid && !cancelled && (
                <PayCountdown deadlineMs={expense.createdAt.getTime() + 30 * 60 * 1000} />
              )}
              <div className="pay-kt">
                <div className="av">₫</div>
                <div className="who"><b>Kế toán Huỳnh Gia</b>Gọi để nhận thanh toán</div>
              </div>
              <div className="pay-call"><a href={`tel:${KT_PHONE}`}>📞 {KT_PHONE_LABEL}</a></div>
              <div className="pay-call zalo"><a href={`https://zalo.me/${KT_PHONE}`} target="_blank" rel="noreferrer">💬 Nhắn Zalo kế toán</a></div>
            </div>

            {!paid && !cancelled && (
              <div className="pay-card pay-note">
                ⏳ Kế toán chưa thanh toán.<br />Trang sẽ tự cập nhật + hiện ảnh chuyển khoản ngay khi chi xong.
              </div>
            )}
          </div>
        </div>

        <div className="pay-foot">
          Trang tra cứu chính thức của <b>Huỳnh Gia — House Design and Build</b>
        </div>
      </div>
    </div>
  );
}
