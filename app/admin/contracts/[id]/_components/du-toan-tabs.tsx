"use client";

import { useState } from "react";
import type { EstimateDetail } from "@/lib/estimate-detail";
import { EstimateDetailSection } from "./estimate-detail-section";
import { CostDetailSection } from "./cost-detail-section";
import { QuoteItemsEditor } from "./quote-items-editor";

type Tab = "ed" | "kl" | "gv" | "bg";

// Menu 3 màn dùng chung hạng mục: Khối lượng · Giá vốn · Báo giá.
export function DuToanTabs({
  contractId,
  customerName,
  detail,
  dtTong,
  locked,
}: {
  contractId: string;
  customerName: string;
  detail: EstimateDetail;
  dtTong: number;
  locked?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("ed");
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
          {btn("ed", "✏️ Hạng mục")}
          {btn("kl", "📐 Khối lượng")}
          {btn("gv", "💰 Giá vốn")}
          {btn("bg", "🧾 Báo giá")}
        </div>
      </div>

      {tab === "ed" && <QuoteItemsEditor contractId={contractId} detail={detail} dtTong={dtTong} locked={locked} />}
      {tab === "kl" && <EstimateDetailSection contractId={contractId} detail={detail} />}
      {tab === "gv" && <CostDetailSection contractId={contractId} detail={detail} dtTong={dtTong} locked={locked} />}
      {tab === "bg" && (
        <>
          <p className="dtm-bgnote">
            Báo giá đầy đủ (chủng loại vật tư, thanh toán) — dùng chung app báo giá.{" "}
            <a href={`/bao-gia-app.html?contract=${contractId}`} target="_blank" rel="noopener noreferrer">Mở tab mới ↗</a>
          </p>
          <iframe title="Báo giá" src={`/bao-gia-app.html?contract=${contractId}`} className="dtm-frame" />
        </>
      )}

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.dtm-head{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;border-bottom:1px solid #ecdfce;padding-bottom:12px;margin-bottom:18px}
.dtm-title{margin:0;font-size:22px;font-weight:800;color:#b0561f}
.dtm-menu{display:flex;gap:6px;flex-wrap:wrap;background:#f6efe4;padding:4px;border-radius:12px}
.dtm-tab{border:0;background:transparent;color:#8a7a6b;border-radius:9px;padding:8px 16px;font-size:14px;font-weight:700;cursor:pointer}
.dtm-tab:hover{background:#fbf5ec}
.dtm-tab.on{background:#fff;color:#b0561f;box-shadow:0 1px 3px rgba(120,70,20,.12)}
.dtm-frame{width:100%;height:82vh;border:1px solid #ecdfce;border-radius:12px;background:#fff}
.dtm-bgnote{font-size:12.5px;color:#8a7a6b;margin:0 0 8px}
.dtm-bgnote a{color:#b0561f;font-weight:700}
`;
