"use client";

import { useState } from "react";
import type { EstimateDetail } from "@/lib/estimate-detail";

function drawingUrl(contractId: string, key: string) {
  return `/api/admin/design-contracts/${contractId}/estimate-drawing?key=${encodeURIComponent(key)}`;
}

export function EstimateDetailSection({
  contractId,
  detail,
}: {
  contractId: string;
  detail: EstimateDetail;
}) {
  const items = detail?.items ?? [];
  const fullDrawings = detail?.fullDrawings ?? [];
  // Mặc định hiện bản vẽ từng mục; toggle ẩn/hiện.
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setHidden((h) => ({ ...h, [id]: !h[id] }));

  if (items.length === 0) {
    return (
      <div className="edt-empty">
        Chưa có dữ liệu dự toán chi tiết cho hợp đồng này.
      </div>
    );
  }

  return (
    <div className="edt">
      <div className="edt-bar">
        <div className="edt-title">
          Dự toán chi tiết — bóc khối lượng
          <span className="edt-sub">Số liệu kích thước đối chiếu trực tiếp với bản vẽ kèm bên phải</span>
        </div>
        <div className="edt-full">
          {fullDrawings.map((d) => (
            <a
              key={d.key}
              className="edt-fullbtn"
              href={drawingUrl(contractId, d.key)}
              target="_blank"
              rel="noreferrer"
            >
              📐 {d.name}
            </a>
          ))}
        </div>
      </div>

      {items.map((it, i) => {
        const isHidden = !!hidden[it.id];
        return (
          <div className="edt-card" key={it.id}>
            <div className="edt-hd">
              <span className="edt-nm">
                {i + 1} · {it.name}
                {it.tag && <span className="edt-badge">{it.tag}</span>}
              </span>
              <span className="edt-hd-right">
                {it.result && <span className="edt-kq">= {it.result}</span>}
                {it.drawings.length > 0 && (
                  <button type="button" className="edt-toggle" onClick={() => toggle(it.id)}>
                    {isHidden ? `▸ Hiện bản vẽ (${it.drawings.length})` : "▾ Ẩn bản vẽ"}
                  </button>
                )}
              </span>
            </div>
            <div className={`edt-grid${isHidden ? " nodraw" : ""}`}>
              <div className="edt-calc">
                <h4>Thông số &amp; công thức</h4>
                <div className="edt-tblwrap">
                  <table>
                    <thead>
                      <tr>
                        {it.cols.map((c, k) => (
                          <th key={k} className={k === 0 ? "" : "n"}>
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {it.rows.map((r, ri) => {
                        const isSum = typeof r[0] === "string" && /^cộng|^tổng/i.test(r[0]);
                        return (
                          <tr key={ri} className={isSum ? "sum" : ""}>
                            {r.map((cell, ci) => (
                              <td key={ci} className={ci === 0 ? "" : "n"}>
                                {cell}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {it.formula && (
                  <div className="edt-ct" dangerouslySetInnerHTML={{ __html: mdBold(it.formula) }} />
                )}
                {it.note && <div className="edt-note-in">{it.note}</div>}
              </div>

              {!isHidden && it.drawings.length > 0 && (
                <div className="edt-dw">
                  <h4>Bản vẽ đối chiếu ({it.drawings.length})</h4>
                  {it.drawings.map((d) => (
                    <figure className="edt-fig" key={d.key}>
                      <a href={drawingUrl(contractId, d.key)} target="_blank" rel="noreferrer" title="Mở lớn">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={drawingUrl(contractId, d.key)} alt={d.name} loading="lazy" />
                      </a>
                      <figcaption>{d.name}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <style>{CSS}</style>
    </div>
  );
}

// Chuyển **x** → <b>x</b> và \n → <br> cho ô công thức.
function mdBold(s: string) {
  const esc = s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
}

const CSS = `
.edt{--pa:#c9622a;--pa2:#b0561f;--ink:#2a2018;--mut:#8a7a6b;--card:#fff;--line:#e7dac9;--soft:#faf4ec;--hd:#f6e7d4;--gr:#1f8a4c;--grbg:#eaf6ee;color:var(--ink)}
.edt-empty{padding:20px;color:var(--mut);font-style:italic}
.edt-bar{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap;margin:6px 0 16px}
.edt-title{font-size:17px;font-weight:800;color:var(--pa2)}
.edt-sub{display:block;font-size:12.5px;font-weight:400;color:var(--mut);margin-top:2px}
.edt-full{display:flex;gap:8px;flex-wrap:wrap}
.edt-fullbtn{display:inline-block;background:#fff;color:#b0561f;border:1px solid #e6c8a8;font-weight:700;font-size:13px;padding:7px 14px;border-radius:9px;text-decoration:none;white-space:nowrap}
.edt-fullbtn:hover{background:#fbf5ec}
.edt-card{background:var(--card);border:1px solid var(--line);border-radius:15px;overflow:hidden;margin-bottom:18px;box-shadow:0 3px 12px rgba(120,70,20,.05)}
.edt-hd{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 18px;background:#fff;border-bottom:1px solid var(--line);flex-wrap:wrap}
.edt-nm{font-weight:700;color:#2a2018;font-size:15.5px}
.edt-badge{display:inline-block;background:var(--grbg);color:var(--gr);font-weight:800;font-size:11px;padding:2px 9px;border-radius:999px;margin-left:8px;vertical-align:middle}
.edt-hd-right{display:flex;align-items:center;gap:10px}
.edt-kq{font-weight:800;color:var(--pa2);font-variant-numeric:tabular-nums;background:#fff;border:1px solid #e6c8a8;border-radius:999px;padding:4px 13px;white-space:nowrap}
.edt-toggle{border:1px solid var(--line);background:#fff;color:var(--pa2);border-radius:8px;padding:5px 11px;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap}
.edt-toggle:hover{background:var(--soft)}
.edt-grid{display:grid;grid-template-columns:1.15fr 1fr;gap:0}
.edt-grid.nodraw{grid-template-columns:1fr}
@media(max-width:820px){.edt-grid{grid-template-columns:1fr}}
.edt-calc{padding:15px 18px;border-right:1px solid var(--line)}
.edt-grid.nodraw .edt-calc,@media(max-width:820px){.edt-calc{border-right:none}}
.edt-calc h4,.edt-dw h4{margin:0 0 9px;font-size:11px;letter-spacing:.4px;text-transform:uppercase;color:var(--mut);font-weight:800}
.edt-tblwrap{overflow-x:auto}
.edt table{width:100%;border-collapse:collapse;font-size:13px}
.edt th,.edt td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.edt th{color:var(--mut);font-size:10.5px;text-transform:uppercase;letter-spacing:.3px;font-weight:800}
.edt td.n,.edt th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.edt tr.sum td{font-weight:800;background:var(--soft);border-top:2px solid var(--line)}
.edt-ct{margin-top:11px;padding:10px 13px;background:var(--soft);border-radius:9px;font-size:12.5px;color:#5c4c3d;line-height:1.6}
.edt-ct b{color:var(--pa2)}
.edt-note-in{margin-top:8px;font-size:12px;color:var(--mut);font-style:italic}
.edt-dw{padding:15px 18px;background:#fdfbf7;border-left:1px solid var(--line)}
@media(max-width:820px){.edt-dw{border-left:none;border-top:1px solid var(--line)}}
.edt-fig{margin:0 0 14px}
.edt-fig img{width:100%;height:auto;border:1px solid var(--line);border-radius:8px;background:#fff;display:block;cursor:zoom-in}
.edt-fig figcaption{margin-top:6px;font-size:12px;color:var(--mut);font-style:italic}
`;
