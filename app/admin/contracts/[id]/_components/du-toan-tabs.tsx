"use client";

import { useState } from "react";
import type { EstimateDetail } from "@/lib/estimate-detail";
import { EstimateDetailSection } from "./estimate-detail-section";
import { CostDetailSection } from "./cost-detail-section";

type Tab = "kl" | "gv" | "bg";

// Menu 3 màn dùng chung hạng mục: Khối lượng · Giá vốn · Báo giá.
export function DuToanTabs({
  contractId,
  customerName,
  detail,
}: {
  contractId: string;
  customerName: string;
  detail: EstimateDetail;
}) {
  const [tab, setTab] = useState<Tab>("kl");
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
          {btn("kl", "📐 Khối lượng")}
          {btn("gv", "💰 Giá vốn")}
          {btn("bg", "🧾 Báo giá")}
        </div>
      </div>

      {tab === "kl" && <EstimateDetailSection contractId={contractId} detail={detail} />}
      {tab === "gv" && <CostDetailSection detail={detail} />}
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
.dtm-head{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;border-bottom:2px solid #c9622a;padding-bottom:12px;margin-bottom:18px}
.dtm-title{margin:0;font-size:22px;font-weight:800;color:#a94e1f}
.dtm-menu{display:flex;gap:8px;flex-wrap:wrap}
.dtm-tab{border:1px solid #e7dac9;background:#fff;color:#a94e1f;border-radius:999px;padding:8px 16px;font-size:14px;font-weight:700;cursor:pointer}
.dtm-tab:hover{background:#faf4ec}
.dtm-tab.on{background:#c9622a;color:#fff;border-color:#c9622a}
.dtm-frame{width:100%;height:82vh;border:1px solid #e7dac9;border-radius:12px;background:#fff}
.dtm-bgnote{font-size:12.5px;color:#8a7a6b;margin:0 0 8px}
.dtm-bgnote a{color:#a94e1f;font-weight:700}
`;
