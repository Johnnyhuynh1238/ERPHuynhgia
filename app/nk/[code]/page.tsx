import type { Metadata, Viewport } from "next";
import { loadDiaryLinkView, ymdToVn } from "@/lib/customer-diary-link";

export const dynamic = "force-dynamic";
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };
export const metadata: Metadata = { title: "Huỳnh Gia · Nhật ký thi công", robots: { index: false, follow: false } };

// CSS nhúng inline (trang public, không qua AppShell). Brand giấy ngà / terracotta.
const NK_CSS = `
.nk-body{color-scheme:light;position:fixed;inset:0;overflow-y:auto;background:#f5efe1;color:#2e140a;
  font-family:"IBM Plex Sans",system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
.nk-wrap{max-width:640px;margin:0 auto;padding:22px 16px 60px}
.nk-eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8a3d1c;font-weight:600}
.nk-wrap h1{font-size:22px;line-height:1.3;margin:6px 0 4px;font-weight:700;overflow-wrap:anywhere}
.nk-sub{font-size:14px;color:rgba(46,20,10,.62)}
.nk-card{background:#fbf7ec;border:1px solid rgba(46,20,10,.12);border-radius:12px;padding:14px;margin-top:14px}
.nk-card h2{font-size:15px;margin:0 0 10px;font-weight:700}
.nk-row{display:flex;align-items:center;gap:10px;padding:5px 0;font-size:14px}
.nk-row span:first-child{min-width:0;flex:1;overflow-wrap:anywhere}
.nk-row b{flex-shrink:0;white-space:nowrap}
.nk-track{height:6px;border-radius:99px;background:rgba(46,20,10,.1);overflow:hidden;margin-top:2px}
.nk-fill{height:100%;border-radius:99px;background:#e36122}
.nk-photos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.nk-photo{display:block;aspect-ratio:1;border-radius:10px;overflow:hidden;background:#eadfca}
.nk-photo img{width:100%;height:100%;object-fit:cover;display:block}
.nk-note{margin-top:14px;font-size:13px;color:rgba(46,20,10,.55)}
.nk-banner{margin-top:14px;padding:12px 14px;border-radius:10px;font-size:15px;line-height:1.5;
  background:rgba(227,97,34,.12);color:#8a3d1c;font-weight:600}
`;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="nk-body">
      <style dangerouslySetInnerHTML={{ __html: NK_CSS }} />
      <div className="nk-wrap">
        <div className="nk-eyebrow">Huỳnh Gia · Nhật ký thi công</div>
        {children}
      </div>
    </div>
  );
}

function pct(n: number) {
  return Math.max(0, Math.min(100, n));
}

/**
 * Link nhật ký 1 ngày gửi chủ nhà qua Zalo (lib/customer-diary-link): không mật khẩu, CHỈ ĐỌC, hết hạn 7 ngày.
 * Chỉ hiện ảnh + % hạng mục lớn — không nội dung chi tiết/khối lượng, không tiền.
 */
export default async function DiaryLinkPage({ params }: { params: { code: string } }) {
  const view = await loadDiaryLinkView(params.code, { withProgress: true });

  if (view.state === "invalid") {
    return (
      <Shell>
        <h1>Link không hợp lệ</h1>
        <div className="nk-sub">Anh/chị mở lại đúng link Zalo Huỳnh Gia đã gửi, hoặc vào Cổng chủ nhà, mục Nhật ký.</div>
      </Shell>
    );
  }

  if (view.state === "expired") {
    return (
      <Shell>
        <h1>Link đã hết hạn</h1>
        <div className="nk-banner">
          Link xem nhật ký ngày {ymdToVn(view.entryDate)} chỉ mở được trong 7 ngày. Anh/chị vào Cổng chủ nhà Huỳnh Gia
          (đăng nhập bằng mật khẩu đã được cấp), mục Nhật ký, để xem lại nhật ký ngày này.
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1>{view.projectName}</h1>
      <div className="nk-sub">Nhật ký ngày {ymdToVn(view.entryDate)}</div>

      {view.groups.length > 0 ? (
        <section className="nk-card">
          <h2>Tiến độ các hạng mục (cập nhật mới nhất)</h2>
          <div className="nk-row">
            <span>Tổng tiến độ công trình</span>
            <b>{view.totalPct}%</b>
          </div>
          <div className="nk-track">
            <div className="nk-fill" style={{ width: `${pct(view.totalPct)}%` }} />
          </div>
          {view.groups.map((g) => (
            <div key={g.label} style={{ marginTop: 8 }}>
              <div className="nk-row">
                <span>{g.label}</span>
                <b>{g.percent}%</b>
              </div>
              <div className="nk-track">
                <div className="nk-fill" style={{ width: `${pct(g.percent)}%` }} />
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="nk-card">
        <h2>Ảnh thi công trong ngày</h2>
        {!view.hasDiary ? (
          <div className="nk-sub">Nhật ký ngày này đang được kỹ sư cập nhật lại. Anh/chị mở lại link sau ít phút.</div>
        ) : view.photos.length === 0 ? (
          <div className="nk-sub">Ngày này chưa có ảnh.</div>
        ) : (
          <div className="nk-photos">
            {view.photos.map((_, i) => (
              <a key={i} className="nk-photo" href={`/nk/${params.code}/anh/${i}`} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/nk/${params.code}/anh/${i}`} alt={`Ảnh ${i + 1}`} loading="lazy" />
              </a>
            ))}
          </div>
        )}
      </section>

      <div className="nk-note">
        Link chỉ để xem, mở được đến hết{" "}
        {view.expiresAt.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}. Xem đầy đủ các ngày khác trong Cổng chủ nhà.
      </div>
    </Shell>
  );
}
