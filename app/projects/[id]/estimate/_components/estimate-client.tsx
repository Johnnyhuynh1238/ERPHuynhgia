"use client";

import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import { useEffect, useState } from "react";
import { KhoanTab } from "./khoan-tab";
import { KhoiLuongTab } from "./khoi-luong-tab";
import { VatTuTab } from "./vat-tu-tab";
import "./estimate.css";

const plexSans = IBM_Plex_Sans({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });

type TabKey = "khoi-luong" | "vat-tu" | "khoan";

const TABS: { key: TabKey; label: string }[] = [
  { key: "khoi-luong", label: "Khối lượng" },
  { key: "vat-tu", label: "Vật tư" },
  { key: "khoan", label: "Khoán" },
];

type Props = {
  projectId: string;
  projectCode: string;
  projectName: string;
  initialTab?: string;
};

export function EstimateClient({ projectId, projectCode, projectName, initialTab }: Props) {
  const valid = TABS.some((t) => t.key === initialTab);
  const [tab, setTab] = useState<TabKey>(valid ? (initialTab as TabKey) : "khoi-luong");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Nhớ chế độ sáng/tối riêng cho màn dự toán
  useEffect(() => {
    const saved = localStorage.getItem("estimate-theme");
    if (saved === "dark" || saved === "light") setTheme(saved);
  }, []);
  const toggleTheme = () => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      localStorage.setItem("estimate-theme", next);
      return next;
    });
  };

  const selectTab = (key: TabKey) => {
    setTab(key);
    window.history.replaceState(null, "", `/projects/${projectId}/estimate?tab=${key}`);
  };

  return (
    <div className={`estdoc -mx-4 -mt-4 md:-mx-6 md:-mt-6 ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
      <div className="est-top">
        <div className="est-brand">
          <div className="est-mark">H6</div>
          <div>
            <b>HUỲNH GIA</b>
            <span>Dự toán</span>
          </div>
        </div>
        <div className="est-acts">
          <Link href={`/projects/${projectId}`} className="est-lnk">
            ← Dự án
          </Link>
          <button className="est-toggle" onClick={toggleTheme} aria-label="Đổi giao diện sáng/tối">
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </div>

      <div className="est-eyebrow">Dự toán · {projectCode}</div>
      <h1 className="est-h1">{projectName}</h1>
      <div className="est-meta">
        <span>Kiểm soát vật tư từ dự toán</span>
        <span className="d">·</span>
        <span>Giá mua dự kiến</span>
      </div>

      <div className="est-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`est-tab ${tab === t.key ? "active" : ""}`} onClick={() => selectTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 4 }}>
        {tab === "khoi-luong" && <KhoiLuongTab projectId={projectId} />}
        {tab === "vat-tu" && <VatTuTab projectId={projectId} />}
        {tab === "khoan" && <KhoanTab projectId={projectId} />}
      </div>

      <div className="est-foot">Đúng — Đẹp — Bền · Huỳnh Gia ERP</div>
    </div>
  );
}
