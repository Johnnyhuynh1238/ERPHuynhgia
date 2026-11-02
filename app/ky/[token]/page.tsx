import type { Metadata, Viewport } from "next";
import { cleanEsignToken, esignDemoView, esignView, findEsignByToken } from "@/lib/acceptance-esign";
import { KyClient } from "./ky-client";
import { KY_CSS } from "./styles";

export const dynamic = "force-dynamic";
// Trang BB dạng tờ A4: mở lại pinch-zoom (layout gốc khoá zoom toàn app).
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true };
export const metadata: Metadata = { title: "Huỳnh Gia · Biên bản nghiệm thu", robots: { index: false, follow: false } };

/**
 * BB nghiệm thu ký online — link Zalo, không đăng nhập. Token KS → điền + ký; token khách → đọc + ký;
 * token đội khoán → xem / tải PDF. Xem thử: /ky/demo-ks, demo-khach, demo-doi, demo-xong.
 */
export default async function KyPage({ params }: { params: { token: string } }) {
  const demo = esignDemoView(params.token);
  if (demo) return <KyClient view={demo} demo />;

  const token = cleanEsignToken(params.token);
  const found = token ? await findEsignByToken(token) : null;
  if (!found || !token) {
    return (
      <div className="ky-body">
        <style dangerouslySetInnerHTML={{ __html: KY_CSS }} />
        <div className="ky-wrap">
          <div className="ky-eyebrow">Huỳnh Gia</div>
          <h1>Link không hợp lệ</h1>
          <div className="ky-sub">Anh/chị mở lại đúng link Zalo Huỳnh Gia đã gửi.</div>
        </div>
      </div>
    );
  }
  return <KyClient view={esignView(found.esign, found.role, token)} />;
}
