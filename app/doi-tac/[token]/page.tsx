import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildPartnerStatement, findPartnerByToken } from "@/lib/partner-statement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KT_PHONE = "0974828375";
const KT_PHONE_LABEL = "0974 828 375";

function money(v: number) {
  return new Intl.NumberFormat("vi-VN").format(Math.round(v));
}
function fmtDate(d: Date | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}
function fmtDateTime(d: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(d);
}

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const partner = await findPartnerByToken(params.token);
  const title = partner ? `Đối chiếu công nợ · ${partner.name} — Huỳnh Gia` : "Đối chiếu công nợ — Huỳnh Gia";
  return {
    title,
    description: "Bảng đối chiếu công nợ và thanh toán giữa hai bên.",
    // Link riêng tư gửi cho đối tác — không cho search engine index.
    robots: { index: false, follow: false },
  };
}

export default async function PartnerStatementPage({ params }: { params: { token: string } }) {
  const partner = await findPartnerByToken(params.token);
  if (!partner) notFound();

  const st = await buildPartnerStatement(partner);
  const isSupplier = st.kind === "supplier";
  const debitLabel = isSupplier ? "Tổng hàng đã nhận" : "Tổng giá trị hợp đồng";

  return (
    <main style={S.page}>
      <div style={S.wrap}>
        <header style={S.head}>
          <div style={S.brand}>CÔNG TY XÂY DỰNG HUỲNH GIA</div>
          <h1 style={S.h1}>Bảng đối chiếu công nợ</h1>
          <div style={S.partner}>
            {st.name}
            <span style={S.code}> · {st.code}</span>
          </div>
          <div style={S.muted}>{isSupplier ? "Nhà cung cấp" : "Nhà thầu phụ"} · Số liệu đến {fmtDateTime(st.generatedAt)}</div>
        </header>

        <section style={S.sumWrap}>
          <div style={S.sumCell}>
            <div style={S.sumKey}>{debitLabel}</div>
            <div style={{ ...S.sumVal, color: "#1f2937" }}>{money(st.totals.debit)}</div>
          </div>
          <div style={S.sumCell}>
            <div style={S.sumKey}>Đã thanh toán</div>
            <div style={{ ...S.sumVal, color: "#15803d" }}>{money(st.totals.credit)}</div>
          </div>
          <div style={S.sumCell}>
            <div style={S.sumKey}>Còn lại</div>
            <div style={{ ...S.sumVal, color: st.totals.balance > 0 ? "#b4472a" : "#15803d" }}>
              {money(st.totals.balance)}
            </div>
          </div>
        </section>

        {st.projects.length === 0 ? (
          <div style={S.empty}>Chưa có phát sinh công nợ.</div>
        ) : (
          st.projects.map((p) => (
            <section key={p.projectId} style={S.proj}>
              <div style={S.projHead}>
                <div>
                  <div style={S.projName}>{p.projectName}</div>
                  <div style={S.muted}>{p.projectCode}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={S.muted}>Còn lại</div>
                  <div style={{ ...S.projBal, color: p.balance > 0 ? "#b4472a" : "#15803d" }}>{money(p.balance)}</div>
                </div>
              </div>

              <div style={S.block}>
                <div style={S.blockTitle}>
                  {isSupplier ? "Hàng đã nhận" : "Hợp đồng"}
                  <span style={S.blockSum}>{money(p.debit)}</span>
                </div>
                {p.debitLines.map((l, i) => (
                  <div key={`d${i}`} style={S.row}>
                    <div style={S.rowLeft}>
                      <div style={S.rowLabel}>{l.label}</div>
                      <div style={S.rowSub}>
                        {fmtDate(l.date)}
                        {l.sub ? ` · ${l.sub}` : ""}
                      </div>
                    </div>
                    <div style={S.rowAmt}>{money(l.amount)}</div>
                  </div>
                ))}
              </div>

              <div style={S.block}>
                <div style={S.blockTitle}>
                  Đã thanh toán
                  <span style={{ ...S.blockSum, color: "#15803d" }}>{money(p.credit)}</span>
                </div>
                {p.creditLines.length === 0 ? (
                  <div style={S.rowEmpty}>Chưa có thanh toán.</div>
                ) : (
                  p.creditLines.map((l, i) => (
                    <div key={`c${i}`} style={S.row}>
                      <div style={S.rowLeft}>
                        <div style={S.rowLabel}>{l.label}</div>
                        <div style={S.rowSub}>
                          {fmtDate(l.date)}
                          {l.sub ? ` · ${l.sub}` : ""}
                        </div>
                      </div>
                      <div style={{ ...S.rowAmt, color: "#15803d" }}>{money(l.amount)}</div>
                    </div>
                  ))
                )}
              </div>
            </section>
          ))
        )}

        <footer style={S.foot}>
          <div>
            Số liệu lấy trực tiếp từ hệ thống ERP Huỳnh Gia, cập nhật theo thời gian thực.
            Nếu có sai lệch, vui lòng liên hệ kế toán{" "}
            <a href={`tel:${KT_PHONE}`} style={S.link}>{KT_PHONE_LABEL}</a> để đối chiếu.
          </div>
          <div style={{ marginTop: 8, color: "#9ca3af" }}>Trang chỉ để xem · Không chia sẻ link cho bên thứ ba.</div>
        </footer>
      </div>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f5f2ea", padding: "20px 12px 40px", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", color: "#1f2937" },
  wrap: { maxWidth: 720, margin: "0 auto" },
  head: { textAlign: "center", marginBottom: 18 },
  brand: { fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#8a3d1c" },
  h1: { fontSize: 22, margin: "8px 0 6px", fontWeight: 700 },
  partner: { fontSize: 17, fontWeight: 600 },
  code: { fontSize: 13, color: "#6b7280", fontWeight: 400 },
  muted: { fontSize: 12, color: "#6b7280" },
  sumWrap: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 18 },
  sumCell: { background: "#fff", border: "1px solid #e5e0d5", borderRadius: 12, padding: "12px 10px", textAlign: "center" },
  sumKey: { fontSize: 11, color: "#6b7280", marginBottom: 4 },
  sumVal: { fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums" },
  proj: { background: "#fff", border: "1px solid #e5e0d5", borderRadius: 14, padding: 14, marginBottom: 14 },
  projHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, paddingBottom: 10, borderBottom: "1px solid #eee8dc" },
  projName: { fontSize: 15, fontWeight: 700 },
  projBal: { fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums" },
  block: { marginTop: 12 },
  blockTitle: { display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#6b7280", marginBottom: 6 },
  blockSum: { fontVariantNumeric: "tabular-nums", color: "#1f2937" },
  row: { display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: "1px solid #f3efe6" },
  rowLeft: { minWidth: 0 },
  rowLabel: { fontSize: 13.5, fontWeight: 600 },
  rowSub: { fontSize: 11.5, color: "#6b7280", marginTop: 2 },
  rowAmt: { fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  rowEmpty: { fontSize: 12.5, color: "#9ca3af", padding: "6px 0" },
  empty: { background: "#fff", border: "1px solid #e5e0d5", borderRadius: 14, padding: 24, textAlign: "center", color: "#6b7280" },
  foot: { marginTop: 18, fontSize: 12, color: "#6b7280", lineHeight: 1.6, textAlign: "center" },
  link: { color: "#8a3d1c", fontWeight: 600 },
};
