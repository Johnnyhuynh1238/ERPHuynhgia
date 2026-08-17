"use client";

import { itemCost, thoSummary, DEFAULT_MARKUP_THO, type EDItem, type EstimateDetail } from "@/lib/estimate-detail";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

// Màn Hạng mục = MỤC LỤC tổng quan (không nhập liệu). Mỗi dòng dẫn tới màn Khối lượng / Giá vốn.
// Giá bán = vốn × (1 + % lãi). Phần thô chảy ngược ra đơn giá m².
export function QuoteOverview({
  detail,
  dtTong,
  onGoto,
}: {
  detail: EstimateDetail;
  dtTong: number;
  onGoto?: (tab: "kl" | "gv" | "bg") => void;
}) {
  const markup = detail?.markupTho ?? DEFAULT_MARKUP_THO;
  const all = detail?.items ?? [];
  const tho = all.filter((it) => (it.part ?? "tho") === "tho");
  const ht = all.filter((it) => it.part === "ht");
  const s = thoSummary(detail, dtTong);

  const rowVals = (it: EDItem) => {
    const von = itemCost(it.cost).total;
    const ban = Math.round(von * (1 + markup));
    return { von, ban, lai: ban - von };
  };
  const sum = (list: EDItem[]) =>
    list.reduce(
      (a, it) => {
        const v = rowVals(it);
        return { von: a.von + v.von, ban: a.ban + v.ban };
      },
      { von: 0, ban: 0 },
    );

  const tblSection = (label: string, list: EDItem[]) => {
    const st = sum(list);
    return (
      <>
        <div className="ov-sec">
          <h2>{label}</h2>
          <span className="ov-cnt">{list.length} hạng mục · vốn {fmt(st.von)}đ</span>
        </div>
        <div className="ov-card">
          <table>
            <thead>
              <tr>
                <th className="no">#</th>
                <th>Hạng mục</th>
                <th className="n">Khối lượng</th>
                <th className="n">Vốn (VT+NC)</th>
                <th className="n">Giá bán</th>
                <th className="c">Mở màn</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={6} className="ov-empty">Chưa có hạng mục — thêm ở tab Báo giá khách.</td></tr>
              )}
              {list.map((it, i) => {
                const v = rowVals(it);
                return (
                  <tr key={it.id}>
                    <td className="no"><b>{i + 1}</b></td>
                    <td className="nm">{it.name}{it.tag && <span className="tag">{it.tag}</span>}</td>
                    <td className="n mut">{it.result || "—"}</td>
                    <td className="n von">{fmt(v.von)}</td>
                    <td className="n ban">{fmt(v.ban)}</td>
                    <td className="lnk">
                      <button type="button" className="go kl" onClick={() => onGoto?.("kl")}>📐 KL ›</button>
                      <button type="button" className="go gv" onClick={() => onGoto?.("gv")}>💰 Vốn ›</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {list.length > 0 && (
              <tfoot>
                <tr><td /><td>Cộng {label.toLowerCase()}</td><td /><td className="n">{fmt(st.von)}</td><td className="n">{fmt(st.ban)}</td><td /></tr>
              </tfoot>
            )}
          </table>
        </div>
      </>
    );
  };

  return (
    <div className="ov">
      <div className="ov-lead">Mục lục hạng mục — tổng quan &amp; dẫn tới các màn. Bóc khối lượng, giá vốn, chủng loại vật tư làm ở tab tương ứng.</div>

      {tblSection("PHẦN THÔ", tho)}
      {tblSection("PHẦN HOÀN THIỆN", ht)}

      <div className="ov-bar">
        <div className="ov-bar-t">Tổng quan phần thô → đơn giá m² khách</div>
        <div className="ov-bg">
          <div><span className="k">Vốn thô (VT+NC)</span><span className="v">{fmt(s.von)}</span></div>
          <div><span className="k">% Lãi thô</span><span className="v mk">{Math.round(markup * 100)}%</span></div>
          <div><span className="k">Lãi thô</span><span className="v gr">{fmt(s.lai)}</span></div>
          <div><span className="k">Tổng bán thô</span><span className="v">{fmt(s.ban)}</span></div>
          <div className="big"><span className="k">Đơn giá m² khách ({fmt(dtTong)} m²)</span><span className="v">{fmt(s.donGiaM2)} đ/m²</span></div>
        </div>
        <div className="ov-note">
          Sửa % lãi + giá vốn ở tab <button type="button" className="lk" onClick={() => onGoto?.("gv")}>💰 Giá vốn</button> · Thêm/bớt hạng mục + chủng loại vật tư ở tab <button type="button" className="lk" onClick={() => onGoto?.("bg")}>🧾 Báo giá khách</button>.
        </div>
      </div>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.ov{--orange:#cf5a12;--brown:#974706;--browntx:#7a3b08;--ink:#241d18;--mute:#8a7c6f;--line:#eee2d3;--soft:#faf3ea;--titlebg:#fbeada;--green:#1f8a4c;--greenbg:#eaf6ee;color:var(--ink)}
.ov-lead{font-size:13px;color:var(--mute);margin:0 0 20px}
.ov-sec{display:flex;align-items:center;gap:10px;margin:0 0 10px}
.ov-sec h2{font-size:14px;font-weight:800;color:var(--brown);letter-spacing:.4px;margin:0}
.ov-cnt{font-size:12px;color:var(--mute);font-weight:600}
.ov-card{background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:0 3px 12px rgba(60,40,20,.05);margin-bottom:22px}
.ov table{width:100%;border-collapse:collapse;font-size:13.5px}
.ov thead th{background:var(--titlebg);color:var(--browntx);text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.3px;font-weight:800;padding:11px 14px;border-bottom:1px solid #efd9bd}
.ov thead th.n{text-align:right}
.ov thead th.c{text-align:center}
.ov tbody td{padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:middle}
.ov tbody tr:last-child td{border-bottom:0}
.ov tbody tr:hover{background:var(--soft)}
.ov td.no{width:38px}
.ov .no b{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--soft);border:1px solid var(--line);color:var(--brown);font-weight:800;font-size:12px}
.ov td.nm{font-weight:700}
.ov td.nm .tag{display:inline-block;margin-left:7px;background:var(--greenbg);color:var(--green);font-weight:800;font-size:10.5px;padding:2px 8px;border-radius:999px;vertical-align:middle}
.ov td.n{text-align:right;font-variant-numeric:tabular-nums}
.ov td.mut{color:var(--mute)}
.ov td.von{font-weight:800;color:var(--brown)}
.ov td.ban{font-weight:800;color:var(--ink)}
.ov td.lnk{text-align:right;white-space:nowrap}
.ov .go{border:1px solid var(--line);background:#fff;color:var(--browntx);border-radius:8px;padding:5px 10px;font-size:12px;font-weight:700;cursor:pointer;margin-left:6px}
.ov .go.gv{border-color:#cbe3d1;color:var(--green)}
.ov .go:hover{background:var(--soft)}
.ov .ov-empty{text-align:center;color:var(--mute);font-style:italic;padding:16px}
.ov tfoot td{padding:11px 14px;background:var(--soft);font-weight:800;border-top:2px solid var(--line)}
.ov tfoot td.n{text-align:right;font-variant-numeric:tabular-nums;color:var(--brown)}
.ov-bar{background:linear-gradient(180deg,#fff,#fdf7ee);border:1px solid #e6cdae;border-radius:16px;padding:16px 20px;box-shadow:0 3px 14px rgba(160,90,30,.07)}
.ov-bar-t{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--browntx);margin-bottom:13px}
.ov-bg{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:14px 24px;align-items:end}
.ov-bg .k{display:block;font-size:10.5px;color:var(--mute);text-transform:uppercase;letter-spacing:.3px;margin-bottom:4px}
.ov-bg .v{font-size:19px;font-weight:800;font-variant-numeric:tabular-nums}
.ov-bg .v.gr{color:var(--green)}
.ov-bg .v.mk{color:var(--brown)}
.ov-bg .big .v{font-size:26px;color:var(--brown)}
.ov-note{font-size:12px;color:var(--mute);margin-top:14px}
.ov-note .lk{border:0;background:none;color:var(--orange);font-weight:700;cursor:pointer;padding:0;font-size:12px}
`;
