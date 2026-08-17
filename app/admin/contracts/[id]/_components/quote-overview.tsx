"use client";

import { itemCost, thoSummary, DEFAULT_MARKUP_THO, type EstimateDetail } from "@/lib/estimate-detail";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const norm = (s: string) => (s || "").trim().toLowerCase();

// Màn Hạng mục = MỤC LỤC. NGUỒN hạng mục = báo giá khách (thoPhanBaoGia/hoanThien).
// Công tác nội bộ gộp vào từng hạng mục theo item.hangMuc. Số chảy ngược → đơn giá m².
export function QuoteOverview({
  detail,
  dtTong,
  hmTho,
  hmHt,
  onGoto,
}: {
  detail: EstimateDetail;
  dtTong: number;
  hmTho: string[]; // tên hạng mục thô (từ khách)
  hmHt: string[]; // tên hạng mục hoàn thiện (từ khách)
  onGoto?: (tab: "kl" | "gv" | "bg") => void;
}) {
  const markup = detail?.markupTho ?? DEFAULT_MARKUP_THO;
  const items = detail?.items ?? [];
  const s = thoSummary(detail, dtTong);

  const rollup = (names: string[], part: "tho" | "ht") => {
    const used = new Set<string>();
    const rows = names.map((name) => {
      const cong = items.filter((it) => norm(it.hangMuc || "") === norm(name));
      cong.forEach((it) => used.add(it.id));
      const von = cong.reduce((a, it) => a + itemCost(it.cost).total, 0);
      const ban = Math.round(von * (1 + markup));
      return { name, cong, von, ban };
    });
    // Công tác chưa gắn hạng mục (thuộc phần này) → gom 1 dòng cảnh báo.
    const orphan = items.filter(
      (it) => (it.part ?? "tho") === part && !used.has(it.id) && !it.noNum,
    );
    return { rows, orphan };
  };

  const section = (label: string, names: string[], part: "tho" | "ht") => {
    const { rows, orphan } = rollup(names, part);
    const vonSum = rows.reduce((a, r) => a + r.von, 0) + orphan.reduce((a, it) => a + itemCost(it.cost).total, 0);
    const banSum = Math.round(vonSum * (1 + markup));
    return (
      <>
        <div className="ov-sec">
          <h2>{label}</h2>
          <span className="ov-cnt">{names.length} hạng mục · vốn {fmt(vonSum)}đ</span>
        </div>
        <div className="ov-card">
          <table>
            <thead>
              <tr>
                <th className="no">#</th>
                <th>Hạng mục</th>
                <th className="n">Công tác ›</th>
                <th className="n">Vốn (VT+NC) ›</th>
                <th className="n">Giá bán ›</th>
              </tr>
            </thead>
            <tbody>
              {names.length === 0 && (
                <tr><td colSpan={5} className="ov-empty">Chưa có hạng mục — thêm ở tab 🧾 Báo giá khách.</td></tr>
              )}
              {rows.map((r, i) => (
                <tr key={r.name}>
                  <td className="no"><b>{i + 1}</b></td>
                  <td className="nm">{r.name}</td>
                  <td className="n mut clik" title="Mở màn Khối lượng" onClick={() => onGoto?.("kl")}>
                    {r.cong.length > 0 ? `${r.cong.length} công tác` : <span className="warn">chưa bóc</span>}
                  </td>
                  <td className="n von clik" title="Mở màn Giá vốn" onClick={() => onGoto?.("gv")}>{fmt(r.von)}</td>
                  <td className="n ban clik" title="Mở màn Báo giá khách" onClick={() => onGoto?.("bg")}>{fmt(r.ban)}</td>
                </tr>
              ))}
              {orphan.length > 0 && (
                <tr className="orphan">
                  <td className="no">!</td>
                  <td className="nm">⚠ Công tác chưa gắn hạng mục ({orphan.length})</td>
                  <td className="n mut">{orphan.map((o) => o.name).join(", ").slice(0, 60)}…</td>
                  <td className="n von">{fmt(orphan.reduce((a, it) => a + itemCost(it.cost).total, 0))}</td>
                  <td className="n">—</td>
                </tr>
              )}
            </tbody>
            {names.length > 0 && (
              <tfoot>
                <tr><td /><td>Cộng {label.toLowerCase()}</td><td /><td className="n">{fmt(vonSum)}</td><td className="n">{fmt(banSum)}</td></tr>
              </tfoot>
            )}
          </table>
        </div>
      </>
    );
  };

  return (
    <div className="ov">
      <div className="ov-lead">
        Mục lục hạng mục — <b>nguồn từ báo giá khách</b>. Công tác chi tiết bóc ở Khối lượng / Giá vốn. Bấm số ở cột để mở màn.
      </div>

      {section("PHẦN THÔ", hmTho, "tho")}
      {section("PHẦN HOÀN THIỆN", hmHt, "ht")}

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
          Sửa % lãi + giá vốn ở tab <button type="button" className="lk" onClick={() => onGoto?.("gv")}>💰 Giá vốn</button> · Thêm/sửa hạng mục + chủng loại ở tab <button type="button" className="lk" onClick={() => onGoto?.("bg")}>🧾 Báo giá khách</button>.
        </div>
      </div>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.ov{--orange:#cf5a12;--brown:#974706;--browntx:#7a3b08;--ink:#241d18;--mute:#8a7c6f;--line:#eee2d3;--soft:#faf3ea;--titlebg:#fbeada;--green:#1f8a4c;--greenbg:#eaf6ee;--red:#b3261e;color:var(--ink)}
.ov-lead{font-size:13px;color:var(--mute);margin:0 0 20px}
.ov-lead b{color:var(--brown)}
.ov-sec{display:flex;align-items:center;gap:10px;margin:0 0 10px}
.ov-sec h2{font-size:14px;font-weight:800;color:var(--brown);letter-spacing:.4px;margin:0}
.ov-cnt{font-size:12px;color:var(--mute);font-weight:600}
.ov-card{background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:0 3px 12px rgba(60,40,20,.05);margin-bottom:22px}
.ov table{width:100%;border-collapse:collapse;font-size:13.5px}
.ov thead th{background:var(--titlebg);color:var(--browntx);text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.3px;font-weight:800;padding:11px 14px;border-bottom:1px solid #efd9bd}
.ov thead th.n{text-align:right;color:var(--brown)}
.ov tbody td{padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:middle}
.ov tbody tr:last-child td{border-bottom:0}
.ov tbody tr:hover{background:var(--soft)}
.ov td.no{width:38px}
.ov .no b{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--soft);border:1px solid var(--line);color:var(--brown);font-weight:800;font-size:12px}
.ov td.nm{font-weight:700}
.ov td.n{text-align:right;font-variant-numeric:tabular-nums}
.ov td.mut{color:var(--mute)}
.ov td.von{font-weight:800;color:var(--brown)}
.ov td.ban{font-weight:800;color:var(--ink)}
.ov td.clik{cursor:pointer}
.ov td.clik:hover{background:var(--soft);text-decoration:underline;text-underline-offset:3px}
.ov .warn{color:var(--red);font-style:italic}
.ov tr.orphan td{background:#fbeceb}
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
