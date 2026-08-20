"use client";

import { useState } from "react";
import type { EstimateDetail } from "@/lib/estimate-detail";
import { EstimateDetailSection } from "./estimate-detail-section";
import { QuoteItemsEditor } from "./quote-items-editor";
import { QuoteOverview } from "./quote-overview";

type Tab = "hm" | "kl" | "gv" | "bg";

// Menu 3 màn dùng chung hạng mục: Khối lượng · Giá vốn · Báo giá.
export function DuToanTabs({
  contractId,
  customerName,
  detail,
  dtTong,
  hmTho,
  hmHt,
  locked,
}: {
  contractId: string;
  customerName: string;
  detail: EstimateDetail;
  dtTong: number;
  hmTho: string[];
  hmHt: string[];
  locked?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("hm");
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  // nonce: bấm lại cùng 1 hạng mục vẫn re-trigger cuộn.
  const [scrollNonce, setScrollNonce] = useState(0);
  // Từ màn Hạng mục bấm cột → sang màn tương ứng + cuộn tới đúng hạng mục.
  const goto = (t: "kl" | "gv" | "bg", hangMuc?: string) => {
    if (hangMuc) { setScrollTarget(hangMuc); setScrollNonce((n) => n + 1); }
    setTab(t);
  };
  const btn = (t: Tab, label: string) => (
    <button
      type="button"
      className={`dtm-tab${tab === t ? " on" : ""}`}
      onClick={() => setTab(t)}
    >
      {label}
    </button>
  );

  return (
    <div className="dtm">
      <div className="dtm-head">
        <h1 className="dtm-title">Dự toán — {customerName}</h1>
        <div className="dtm-menu">
          {btn("hm", "📋 Hạng mục")}
          {btn("kl", "📐 Khối lượng")}
          {btn("gv", "💰 Giá vốn")}
          {btn("bg", "🧾 Báo giá")}
        </div>
      </div>

      {tab === "hm" && <QuoteOverview detail={detail} dtTong={dtTong} hmTho={hmTho} hmHt={hmHt} onGoto={goto} />}
      {tab === "kl" && <EstimateDetailSection contractId={contractId} detail={detail} hmTho={hmTho} hmHt={hmHt} scrollTarget={scrollTarget} scrollNonce={scrollNonce} />}
      {tab === "gv" && <QuoteItemsEditor contractId={contractId} detail={detail} dtTong={dtTong} hmTho={hmTho} hmHt={hmHt} locked={locked} scrollTarget={scrollTarget} scrollNonce={scrollNonce} />}
      {tab === "bg" && (
        <>
          <p className="dtm-bgnote">
            Báo giá đầy đủ (chủng loại vật tư, thanh toán) — dùng chung app báo giá.{" "}
            <a href={`/bao-gia-app.html?contract=${contractId}`} target="_blank" rel="noopener noreferrer">Mở tab mới ↗</a>
          </p>
          <iframe key={`bg-${scrollNonce}`} title="Báo giá" src={`/bao-gia-app.html?contract=${contractId}${scrollTarget ? `&goto=${encodeURIComponent(scrollTarget)}` : ""}`} className="dtm-frame" />
        </>
      )}

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.dtm{color-scheme:light}
/* Ép mọi ô nhập trong dự toán sáng — globals.css là dark theme làm input đen + chữ ẩn */
.dtm input,.dtm select,.dtm textarea{background:#fff !important;color:#241d18 !important;-webkit-text-fill-color:#241d18 !important;caret-color:#cf5a12;opacity:1 !important;border:1px solid #e6cdae}
.dtm select option{background:#fff;color:#241d18}
.dtm input::placeholder{color:#b7a894 !important;-webkit-text-fill-color:#b7a894}
.dtm-head{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;border-bottom:1px solid #ecdfce;padding:10px 0 12px;margin-bottom:18px;position:sticky;top:0;z-index:30;background:#fbf6ee}
.dtm-title{margin:0;font-size:22px;font-weight:800;color:#b0561f}
.dtm-menu{display:flex;gap:6px;flex-wrap:wrap;background:#f6efe4;padding:4px;border-radius:12px}
.dtm-tab{border:0;background:transparent;color:#8a7a6b;border-radius:9px;padding:8px 16px;font-size:14px;font-weight:700;cursor:pointer}
.dtm-tab:hover{background:#fbf5ec}
.dtm-tab.on{background:#fff;color:#b0561f;box-shadow:0 1px 3px rgba(120,70,20,.12)}
.dtm-frame{width:100%;height:82vh;border:1px solid #ecdfce;border-radius:12px;background:#fff}
.dtm-bgnote{font-size:12.5px;color:#8a7a6b;margin:0 0 8px}
.dtm-bgnote a{color:#b0561f;font-weight:700}
`;
