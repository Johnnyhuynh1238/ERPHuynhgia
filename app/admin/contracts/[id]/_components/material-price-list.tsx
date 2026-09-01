"use client";

import type { EstimateDetail, EDItem } from "@/lib/estimate-detail";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const norm = (s: string) => (s || "").trim().toLowerCase();
// Số lượng giữ phần thập phân (KL bóc thường lẻ), bỏ đuôi .00 cho gọn.
const qty = (n: number) =>
  Number(n).toLocaleString("vi-VN", { maximumFractionDigits: 2 });

type Row = {
  ten: string;
  dvt: string;
  kl: number;
  gia: number;
  tt: number;
  hao: number; // % hao hụt của công tác chứa vật tư này
  congTac: string; // tên công tác (để khách biết vật tư dùng ở đâu)
};

// Bảng GIÁ VẬT TƯ — chỉ giá vốn vật tư, không nhân công, không lãi.
// Mục đích: khách đổi chủng loại thì có căn cứ bù trừ (đơn giá × số lượng).
export function MaterialPriceList({
  detail,
  hmTho,
  hmHt,
}: {
  detail: EstimateDetail;
  hmTho: string[];
  hmHt: string[];
}) {
  const items = detail?.items ?? [];

  const rowsOf = (its: EDItem[]): Row[] =>
    its.flatMap((it) => {
      const hao = Number(it.cost?.haoHutPct) || 0;
      return (it.cost?.materials ?? []).map((m) => {
        const kl = Number(m.kl) || 0;
        const gia = Number(m.gia) || 0;
        return {
          ten: m.ten ?? "",
          dvt: m.dvt ?? "",
          kl,
          gia,
          tt: Math.round(kl * gia * (1 + hao / 100)),
          hao,
          congTac: it.name ?? "",
        };
      });
    });

  const section = (label: string, names: string[], part: "tho" | "ht") => {
    const used = new Set<string>();
    const blocks = names.map((name) => {
      const its = items.filter((it) => norm(it.hangMuc || "") === norm(name));
      its.forEach((it) => used.add(it.id));
      const rows = rowsOf(its);
      return { name, rows, sum: rows.reduce((a, r) => a + r.tt, 0) };
    });
    // Công tác chưa gắn hạng mục → gom cuối, đánh dấu để không rơi mất vật tư.
    const orphanIts = items.filter(
      (it) => (it.part ?? "tho") === part && !used.has(it.id) && !it.noNum,
    );
    if (orphanIts.length) {
      const rows = rowsOf(orphanIts);
      blocks.push({
        name: "⚠️ Chưa gắn hạng mục",
        rows,
        sum: rows.reduce((a, r) => a + r.tt, 0),
      });
    }
    const total = blocks.reduce((a, b) => a + b.sum, 0);

    return (
      <div key={label}>
        <div className="mvt-sec">
          <h2>{label}</h2>
          <span className="mvt-cnt">
            {blocks.length} hạng mục · vật tư {fmt(total)}đ
          </span>
        </div>

        {blocks.map((b) => (
          <div className="mvt-card" key={b.name}>
            <div className="mvt-hm">
              <span className="mvt-hm-n">{b.name}</span>
              <span className="mvt-hm-s">{fmt(b.sum)}đ</span>
            </div>
            <div className="mvt-scroll">
              <table>
                <thead>
                  <tr>
                    <th className="no">#</th>
                    <th>Chủng loại vật tư</th>
                    <th className="ct">Dùng cho công tác</th>
                    <th className="n">ĐVT</th>
                    <th className="n">Số lượng</th>
                    <th className="n">Đơn giá</th>
                    <th className="n">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {b.rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="mvt-empty">
                        Hạng mục thuê ngoài trọn gói hoặc chưa nhập vật tư.
                      </td>
                    </tr>
                  )}
                  {b.rows.map((r, i) => (
                    <tr key={`${b.name}-${i}`}>
                      <td className="no">
                        <b>{i + 1}</b>
                      </td>
                      <td className="nm">{r.ten}</td>
                      <td className="ct mut">{r.congTac}</td>
                      <td className="n mut">{r.dvt}</td>
                      <td className="n">
                        {qty(r.kl)}
                        {r.hao > 0 && <i className="mvt-hao"> +{r.hao}% hao</i>}
                      </td>
                      <td className="n">{fmt(r.gia)}</td>
                      <td className="n tt">{fmt(r.tt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const allRows = rowsOf(items.filter((it) => (it.part ?? "tho") !== "opt"));
  const grand = allRows.reduce((a, r) => a + r.tt, 0);

  return (
    <div className="mvt">
      <div className="mvt-lead">
        Bảng <b>giá vật tư</b> — chỉ giá vốn vật tư, <b>không gồm nhân công và lãi</b>.
        Dùng làm căn cứ <b>bù trừ khi khách đổi chủng loại</b>: lấy số lượng nhân với
        chênh lệch đơn giá giữa loại cũ và loại mới.
      </div>

      {section("PHẦN THÔ", hmTho, "tho")}
      {section("PHẦN HOÀN THIỆN", hmHt, "ht")}

      <div className="mvt-bar">
        <div className="mvt-bar-t">Tổng giá vốn vật tư</div>
        <div className="mvt-bg">
          <div>
            <span className="k">Số dòng vật tư</span>
            <span className="v">{allRows.length}</span>
          </div>
          <div className="big">
            <span className="k">Tổng vật tư (đã gồm hao hụt)</span>
            <span className="v">{fmt(grand)} đ</span>
          </div>
        </div>
        <div className="mvt-note">
          Số lượng và đơn giá lấy từ tab 📐 Khối lượng / 💰 Giá vốn — sửa ở đó, bảng này
          tự cập nhật. Hạng mục thuê ngoài trọn gói (trần thạch cao, cửa, đá, vệ sinh)
          đơn giá đã gồm công lắp đặt.
        </div>
      </div>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.mvt{--orange:#cf5a12;--brown:#974706;--browntx:#7a3b08;--ink:#241d18;--mute:#8a7c6f;--line:#eee2d3;--soft:#faf3ea;--titlebg:#fbeada;color:var(--ink)}
.mvt-lead{font-size:13px;color:var(--mute);margin:0 0 20px;line-height:1.7}
.mvt-lead b{color:var(--brown)}
.mvt-sec{display:flex;align-items:center;gap:10px;margin:0 0 10px;flex-wrap:wrap}
.mvt-sec h2{font-size:14px;font-weight:800;color:var(--brown);letter-spacing:.4px;margin:0}
.mvt-cnt{font-size:12px;color:var(--mute);font-weight:600}
.mvt-card{background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:0 3px 12px rgba(60,40,20,.05);margin-bottom:14px}
.mvt-hm{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 14px;background:var(--titlebg);border-bottom:1px solid #efd9bd}
.mvt-hm-n{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.3px;color:var(--browntx);min-width:0}
.mvt-hm-s{font-size:13px;font-weight:800;color:var(--brown);font-variant-numeric:tabular-nums;white-space:nowrap;flex-shrink:0}
.mvt-scroll{overflow-x:auto}
.mvt table{width:100%;border-collapse:collapse;font-size:13.5px;min-width:660px}
.mvt thead th{background:var(--soft);color:var(--browntx);text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.3px;font-weight:800;padding:9px 14px;border-bottom:1px solid var(--line)}
.mvt thead th.n{text-align:right;color:var(--brown)}
.mvt tbody td{padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:top}
.mvt tbody tr:last-child td{border-bottom:0}
.mvt td.no{width:38px}
.mvt .no b{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--soft);border:1px solid var(--line);color:var(--brown);font-weight:800;font-size:11px}
.mvt td.nm{font-weight:700;min-width:200px}
.mvt td.ct{font-size:12px;max-width:180px}
.mvt td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.mvt td.mut{color:var(--mute)}
.mvt td.tt{font-weight:800;color:var(--brown)}
.mvt .mvt-hao{display:block;font-style:normal;font-size:10.5px;color:var(--orange);font-weight:700}
.mvt .mvt-empty{text-align:center;color:var(--mute);font-style:italic;padding:14px}
.mvt-bar{background:linear-gradient(180deg,#fff,#fdf7ee);border:1px solid #e6cdae;border-radius:16px;padding:16px 20px;box-shadow:0 3px 14px rgba(160,90,30,.07);margin-top:8px}
.mvt-bar-t{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--browntx);margin-bottom:13px}
.mvt-bg{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px 24px;align-items:end}
.mvt-bg>div{min-width:0}
.mvt-bg .k{display:block;font-size:10.5px;color:var(--mute);text-transform:uppercase;letter-spacing:.3px;margin-bottom:4px}
.mvt-bg .v{font-size:19px;font-weight:800;font-variant-numeric:tabular-nums}
.mvt-bg .big .v{font-size:26px;color:var(--brown)}
.mvt-note{font-size:12px;color:var(--mute);margin-top:14px;line-height:1.7}
@media (max-width:640px){
  .mvt td.ct,.mvt th.ct{display:none}
  .mvt table{min-width:480px}
}
`;
