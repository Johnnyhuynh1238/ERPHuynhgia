"use client";

import { useEffect, useState } from "react";
import { hangMucAnchor, type EDItem, type EstimateDetail } from "@/lib/estimate-detail";

function drawingUrl(contractId: string, key: string) {
  return `/api/admin/design-contracts/${contractId}/estimate-drawing?key=${encodeURIComponent(key)}`;
}
const norm = (s: string) => (s || "").trim().toLowerCase();

// Khối lượng — GỘP theo hạng mục. Mỗi công tác: bảng thông số bóc KL + bản vẽ đối chiếu.
export function EstimateDetailSection({
  contractId,
  detail,
  hmTho,
  hmHt,
  scrollTarget,
  scrollNonce,
}: {
  contractId: string;
  detail: EstimateDetail;
  hmTho?: string[];
  hmHt?: string[];
  scrollTarget?: string | null;
  scrollNonce?: number;
}) {
  const items = detail?.items ?? [];
  // Danh sách hạng mục: ưu tiên tên từ khách; thiếu thì tự suy từ items.hangMuc (thứ tự xuất hiện).
  const namesFrom = (part: "tho" | "ht") => {
    const seen: string[] = [];
    for (const it of items) {
      if ((it.part ?? "tho") !== part) continue;
      const h = (it.hangMuc || "").trim();
      if (h && !seen.some((x) => norm(x) === norm(h))) seen.push(h);
    }
    return seen;
  };
  const thoNames = hmTho && hmTho.length ? hmTho : namesFrom("tho");
  const htNames = hmHt && hmHt.length ? hmHt : namesFrom("ht");
  const fullDrawings = detail?.fullDrawings ?? [];
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setHidden((h) => ({ ...h, [id]: !h[id] }));
  // Mặc định xếp gọn — bấm tiêu đề card mới mở nội dung.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggleOpen = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  // Cuộn tới hạng mục. Hạng mục cuối (Ốp lát) hay trượt vì ảnh bản vẽ lazy-load phía trên
  // load sau → layout xô xuống. Fix: re-scroll theo lịch DÀI + mỗi khi có ảnh trong section load xong.
  useEffect(() => {
    if (!scrollTarget) return;
    // Nhảy tới hạng mục nào thì tự MỞ card của hạng mục đó (đang xếp gọn mặc định).
    setOpen((o) => {
      const n = { ...o };
      for (const it of items) if (norm(it.hangMuc || "") === norm(scrollTarget)) n[it.id] = true;
      return n;
    });
    const anchor = hangMucAnchor(scrollTarget);
    let cancelled = false;
    const doScroll = () => {
      if (cancelled) return;
      document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    doScroll();
    const timers = [120, 350, 700, 1200, 2000, 3000, 4200].map((ms) => setTimeout(doScroll, ms));
    // Ảnh chưa load xong → nghe 'load' để chỉnh lại vị trí sau khi layout ổn định.
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(".edt img"));
    const onImg = () => doScroll();
    imgs.forEach((im) => { if (!im.complete) im.addEventListener("load", onImg); });
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      imgs.forEach((im) => im.removeEventListener("load", onImg));
    };
  }, [scrollTarget, scrollNonce]);

  const hasAny = items.some((it) => (it.rows?.length ?? 0) > 0);
  if (!hasAny) {
    return <div className="edt-empty">Chưa có dữ liệu bóc khối lượng cho hợp đồng này.</div>;
  }

  const congCard = (it: EDItem, label: string) => {
    const hasTbl = (it.rows?.length ?? 0) > 0;
    const isHidden = !!hidden[it.id];
    const isOpen = !!open[it.id];
    return (
      <div className="edt-card" key={it.id}>
        <div className="edt-hd edt-hd-click" onClick={() => toggleOpen(it.id)} role="button" aria-expanded={isOpen}>
          <span className="edt-nm"><span className="edt-caret">{isOpen ? "▾" : "▸"}</span> {label} · {it.name}{it.tag && <span className="edt-badge">{it.tag}</span>}</span>
          <span className="edt-hd-right">
            {it.result && <span className="edt-kq">= {it.result}</span>}
            {isOpen && it.drawings.length > 0 && (
              <button type="button" className="edt-toggle" onClick={(e) => { e.stopPropagation(); toggle(it.id); }}>
                {isHidden ? `▸ Bản vẽ (${it.drawings.length})` : "▾ Ẩn bản vẽ"}
              </button>
            )}
          </span>
        </div>
        {isOpen && (
        <div className="edt-scroll">
        <div className={`edt-grid${isHidden || it.drawings.length === 0 ? " nodraw" : ""}`}>
          <div className="edt-calc">
            {hasTbl ? (
              <>
                <h4>Thông số &amp; công thức</h4>
                <div className="edt-tblwrap">
                  <table>
                    <thead><tr>{it.cols.map((c, k) => <th key={k} className={k === 0 ? "" : "n"}>{c}</th>)}</tr></thead>
                    <tbody>
                      {it.rows.map((r, ri) => {
                        const isSum = typeof r[0] === "string" && /^cộng|^tổng/i.test(r[0]);
                        return <tr key={ri} className={isSum ? "sum" : ""}>{r.map((cell, ci) => <td key={ci} className={ci === 0 ? "" : "n"}>{cell}</td>)}</tr>;
                      })}
                    </tbody>
                  </table>
                </div>
                {it.formula && <div className="edt-ct" dangerouslySetInnerHTML={{ __html: mdBold(it.formula) }} />}
                {it.note && <div className="edt-note-in">{it.note}</div>}
              </>
            ) : (
              <div className="edt-lump">Khoán trọn gói{it.note ? ` — ${it.note}` : ""}.</div>
            )}
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
        )}
      </div>
    );
  };

  const section = (names: string[]) =>
    names.map((name, hi) => {
      const cong = items.filter((it) => norm(it.hangMuc || "") === norm(name) && !it.noNum);
      return (
        <div className="edt-hm" id={hangMucAnchor(name)} key={name}>
          <div className="edt-hm-h"><span className="edt-hm-no">{hi + 1}</span><h2>{name}</h2></div>
          {cong.length === 0 && <div className="edt-hm-empty">Chưa bóc công tác cho hạng mục này.</div>}
          {cong.map((it, ci) => congCard(it, `${hi + 1}-${ci + 1}`))}
        </div>
      );
    });

  return (
    <div className="edt">
      <div className="edt-bar">
        <div className="edt-title">
          Bóc khối lượng theo hạng mục
          <span className="edt-sub">Số đo đối chiếu trực tiếp bản vẽ bên phải</span>
        </div>
        <div className="edt-full">
          {fullDrawings.map((d) => (
            <a key={d.key} className="edt-fullbtn" href={drawingUrl(contractId, d.key)} target="_blank" rel="noreferrer">📐 {d.name}</a>
          ))}
        </div>
      </div>

      {thoNames.length > 0 && <div className="edt-part">PHẦN THÔ</div>}
      {section(thoNames)}
      {htNames.length > 0 && <div className="edt-part">PHẦN HOÀN THIỆN</div>}
      {section(htNames)}

      <style>{CSS}</style>
    </div>
  );
}

function mdBold(s: string) {
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
}

const CSS = `
.edt{--orange:#cf5a12;--brown:#974706;--browntx:#7a3b08;--ink:#241d18;--mute:#8a7c6f;--line:#eee2d3;--soft:#faf3ea;--titlebg:#fbeada;--gr:#1f8a4c;--grbg:#eaf6ee;color:var(--ink)}
.edt-empty{padding:20px;color:var(--mute);font-style:italic}
.edt-bar{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap;margin:0 0 16px}
.edt-title{font-size:15px;font-weight:800;color:var(--brown)}
.edt-sub{display:block;font-size:12.5px;font-weight:400;color:var(--mute);margin-top:2px}
.edt-full{display:flex;gap:8px;flex-wrap:wrap}
.edt-fullbtn{display:inline-block;background:#fff;color:var(--brown);border:1px solid #e6c8a8;font-weight:700;font-size:12.5px;padding:7px 13px;border-radius:9px;text-decoration:none;white-space:nowrap}
.edt-fullbtn:hover{background:var(--soft)}
.edt-part{font-size:13px;font-weight:800;color:var(--brown);letter-spacing:.4px;margin:18px 0 10px}
.edt-part:first-of-type{margin-top:0}
.edt-hm{margin-bottom:8px;scroll-margin-top:14px}
.edt-hm-h{display:flex;align-items:center;gap:10px;margin:6px 0 11px}
.edt-hm-no{width:26px;height:26px;border-radius:50%;background:var(--brown);color:#fff;font-weight:800;font-size:12.5px;display:grid;place-items:center}
.edt-hm-h h2{font-size:14.5px;font-weight:800;color:var(--brown);letter-spacing:.3px;margin:0}
.edt-hm-empty{color:var(--mute);font-style:italic;font-size:12.5px;padding:4px 0 12px}
.edt-card{background:#fff;border:1px solid var(--line);border-radius:15px;overflow:hidden;margin-bottom:14px;box-shadow:0 3px 12px rgba(60,40,20,.05)}
.edt-hd{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 16px;background:#fff;border-bottom:1px solid var(--line);flex-wrap:wrap}
.edt-hd-click{cursor:pointer;user-select:none}
.edt-hd-click:hover{background:var(--soft)}
.edt-caret{display:inline-block;width:13px;color:var(--brown);font-size:11px}
.edt-nm{font-weight:700;color:var(--ink);font-size:14.5px}
.edt-badge{display:inline-block;background:var(--grbg);color:var(--gr);font-weight:800;font-size:11px;padding:2px 9px;border-radius:999px;margin-left:8px}
.edt-hd-right{display:flex;align-items:center;gap:10px}
.edt-kq{font-weight:800;color:var(--brown);font-variant-numeric:tabular-nums;background:#fff;border:1px solid #e6c8a8;border-radius:999px;padding:4px 13px;white-space:nowrap}
.edt-toggle{border:1px solid var(--line);background:#fff;color:var(--brown);border-radius:8px;padding:5px 11px;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap}
.edt-toggle:hover{background:var(--soft)}
.edt-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.edt-grid{display:grid;grid-template-columns:1.15fr 1fr}
.edt-grid.nodraw{grid-template-columns:1fr}
/* Điện thoại: giữ layout 2 cột y như PC (bảng + bản vẽ), cuộn ngang trong .edt-scroll */
@media(max-width:820px){.edt-grid:not(.nodraw){min-width:760px}}
.edt-calc{padding:14px 16px;border-right:1px solid var(--line)}
.edt-grid.nodraw .edt-calc{border-right:none}
.edt-calc h4,.edt-dw h4{margin:0 0 9px;font-size:10.5px;letter-spacing:.4px;text-transform:uppercase;color:var(--mute);font-weight:800}
.edt-lump{color:var(--mute);font-style:italic;font-size:13px}
.edt-tblwrap{overflow-x:auto}
.edt table{width:100%;border-collapse:collapse;font-size:12.5px}
.edt th,.edt td{text-align:left;padding:6px 7px;border-bottom:1px solid var(--line);vertical-align:top}
.edt th{color:var(--mute);font-size:9.5px;text-transform:uppercase;letter-spacing:.3px;font-weight:800}
.edt td.n,.edt th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.edt tr.sum td{font-weight:800;background:var(--soft);border-top:2px solid var(--line)}
.edt-ct{margin-top:11px;padding:9px 12px;background:var(--soft);border-radius:9px;font-size:12px;color:#5c4c3d;line-height:1.6}
.edt-ct b{color:var(--brown)}
.edt-note-in{margin-top:8px;font-size:12px;color:var(--mute);font-style:italic}
.edt-dw{padding:14px 16px;background:#fdfbf7;border-left:1px solid var(--line)}
.edt-fig{margin:0 0 14px}
.edt-fig img{width:100%;height:auto;border:1px solid var(--line);border-radius:8px;background:#fff;display:block;cursor:zoom-in}
.edt-fig figcaption{margin-top:6px;font-size:12px;color:var(--mute);font-style:italic}
`;
