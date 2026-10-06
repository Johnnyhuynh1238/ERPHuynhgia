"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CgItem, ConstructionGuide } from "@/lib/construction-guide";
// dùng chung giao diện ngà của HD mua hàng (.hdm-*), phần riêng HD thi công là .hdt-*
import "../../huong-dan-mua-hang/_components/huong-dan.css";
import "./hd-thi-cong.css";

type Tab = "all" | "tho" | "ht";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "tho", label: "Phần thô" },
  { key: "ht", label: "Hoàn thiện" },
];

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("vi-VN") : "—");
const pad = (n: number) => String(n).padStart(2, "0");
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");

export function HdThiCongClient({
  projectId,
  projectCode,
  projectName,
  customerName,
  contractId,
  signedAt,
  guide,
  isAdmin,
  backHref,
}: {
  projectId: string;
  projectCode: string;
  projectName: string;
  customerName: string;
  contractId: string | null;
  signedAt: string | null;
  guide: ConstructionGuide | null;
  isAdmin: boolean;
  backHref: string;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  // card hạng mục: mặc định thu gọn; bấm mở 1 card, bấm ra ngoài card đó tự thu lại
  const [open, setOpen] = useState<string | null>(null);
  const [theme, setTheme] = useState<string | undefined>(undefined);

  useEffect(() => {
    try {
      const t = localStorage.getItem("hdm-theme");
      if (t === "light" || t === "dark") setTheme(t);
    } catch {}
  }, []);
  const toggleTheme = () => {
    const dark =
      theme === "dark" || (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const next = dark ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("hdm-theme", next);
    } catch {}
  };

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const card = (e.target as Element | null)?.closest?.("[data-hdm-card]")?.getAttribute("data-hdm-card");
      setOpen((cur) => (cur && card === cur ? cur : null));
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);
  const toggle = (key: string) => setOpen((cur) => (cur === key ? null : key));

  // In = mở bản A4 (bìa + từng hạng mục + biên bản ký tay) ở tab mới, tự bật hộp thoại in
  const printDoc = () => window.open(`/hd-thi-cong/${projectId}?in=1`, "_blank");

  const stageCount = useMemo(() => (guide ? guide.items.reduce((s, it) => s + it.stages.length, 0) : 0), [guide]);

  const nq = norm(q.trim());
  const items = (guide?.items ?? []).filter((it) => {
    if (tab !== "all" && it.kind !== tab) return false;
    if (!nq) return true;
    return norm(
      [
        it.name,
        ...it.scope,
        ...it.vt.map((v) => `${v.ten} ${v.loai} ${v.quycach}`),
        ...it.stages.map((s) => `${s.title} ${s.steps.join(" ")} ${s.items.map((c) => c.noi).join(" ")}`),
      ].join(" "),
    ).includes(nq);
  });
  const tho = items.filter((it) => it.kind === "tho");
  const ht = items.filter((it) => it.kind === "ht");
  const isOpen = (key: string) => !!nq || open === key;

  return (
    <div className="hdm-app" data-theme={theme}>
      <div className="hdm-wrap">
        <div className="hdm-top">
          <Link href={backHref} className="hdm-back">
            ‹ {projectCode}
          </Link>
          <div className="hdm-acts">
            <Link href="/ky-thuat-thi-cong" className="hdm-btn" title="Thư viện mẫu kỹ thuật thi công — nguồn điểm dừng của HD này">
              📚<span className="hdt-lbl"> Mẫu kỹ thuật</span>
            </Link>
            {guide && (
              <button type="button" className="hdm-btn hdt-print" onClick={printDoc}>
                🖨 In cho giám sát
              </button>
            )}
            <button type="button" className="hdm-btn" onClick={toggleTheme} aria-label="Đổi nền">
              ◑
            </button>
          </div>
        </div>

        <div className="hdm-eyebrow">HD thi công &amp; nghiệm thu</div>
        <h1 className="hdm-h1">{projectName}</h1>
        <div className="hdm-meta">
          {customerName ? `Chủ đầu tư: ${customerName} · ` : ""}
          Căn cứ: HĐ ký {fmtDate(signedAt)}
          {guide ? ` · ${guide.items.length} hạng mục · ${stageCount} điểm dừng nghiệm thu` : ""}
        </div>

        <div className="hdm-who">
          <div>
            <b>1 · Vật tư đúng HĐ</b>
            Nhận hàng đối chiếu hãng, chủng loại, quy cách với bảng vật tư từng hạng mục. Sai → không nhận, báo admin.
          </div>
          <div>
            <b>2 · Nghiệm thu đúng tiêu chí</b>
            Mỗi điểm dừng kiểm đủ tiêu chí rồi mới ký biên bản cho đội thi công làm bước tiếp. Biên bản ký tay trên bản in.
          </div>
        </div>

        {!guide ? (
          <div className="hdm-empty">
            {contractId ? <>Hợp đồng gắn dự án này chưa có báo giá / phụ lục vật tư.</> : <>Dự án chưa gắn hợp đồng.</>}{" "}
            {isAdmin ? (
              <>
                Vào <Link href={contractId ? `/admin/contracts/${contractId}` : "/admin/contracts"}>Hợp đồng</Link>{" "}
                để lập báo giá / gắn dự án — HD thi công tự lấy hạng mục từ đó.
              </>
            ) : (
              <>Liên hệ admin để bổ sung.</>
            )}
          </div>
        ) : (
          <>
            <div className="hdm-tools">
              <input
                className="hdm-search"
                placeholder="Tìm hạng mục, vật tư, tiêu chí…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <div className="hdm-tabs">
                {TABS.map((t) => (
                  <button key={t.key} type="button" className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {tho.length > 0 && <div className="hdm-sec">Phần thô</div>}
            {tho.map((it) => (
              <ItemCard key={it.no} it={it} total={guide.items.length} open={isOpen(`i${it.no}`)} onToggle={() => toggle(`i${it.no}`)} />
            ))}
            {ht.length > 0 && <div className="hdm-sec">Hoàn thiện</div>}
            {ht.map((it) => (
              <ItemCard key={it.no} it={it} total={guide.items.length} open={isOpen(`i${it.no}`)} onToggle={() => toggle(`i${it.no}`)} />
            ))}
            {items.length === 0 && <div className="hdm-empty">Không có hạng mục khớp.</div>}

            {guide.excluded.length > 0 && tab === "all" && !nq && (
              <>
                <div className="hdm-sec">Không thuộc phạm vi HĐ</div>
                <div className={"hdm-card" + (isOpen("excluded") ? " open" : "")} data-hdm-card="excluded">
                  <button type="button" className="hdm-ch" onClick={() => toggle("excluded")} aria-expanded={isOpen("excluded")}>
                    <span className="hdm-cht">
                      <span className="nm">Không bao gồm — đội không làm, giám sát không nghiệm thu</span>
                      <span className="hdm-chtags">
                        <span className="n">{guide.excluded.length} mục</span>
                      </span>
                    </span>
                    <span className="hdm-chev" aria-hidden>
                      ›
                    </span>
                  </button>
                  <div className="hdm-cb">
                    <ul className="hdm-ex">
                      {guide.excluded.map((x, i) => (
                        <li key={i}>
                          {x.ten}
                          {x.ghi && <span>{x.ghi}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ItemCard({ it, total, open, onToggle }: { it: CgItem; total: number; open: boolean; onToggle: () => void }) {
  const id = `i${it.no}`;
  const kcAll = it.vt.length > 0 && it.vt.every((v) => v.khachCap);
  const srcs = Array.from(new Set(it.vt.map((v) => v.src).filter(Boolean)));
  return (
    <div className={"hdm-card" + (open ? " open" : "")} data-hdm-card={id}>
      <button type="button" className="hdm-ch" onClick={onToggle} aria-expanded={open}>
        <span className="hdt-no">
          {pad(it.no)}
          <small>/{pad(total)}</small>
        </span>
        <span className="hdm-cht hdt-grow">
          <span className="nm">{it.name}</span>
          <span className="hdm-chtags">
            <span className="n">
              {it.vt.length} vật tư · {it.stages.length} điểm dừng
            </span>
            {!it.tech && <span className="hdm-tag warn">Chưa có mẫu kỹ thuật</span>}
            {kcAll && <span className="hdm-tag kc">Chủ nhà cấp vật tư</span>}
            {srcs.map((s) => (
              <span key={s} className="hdm-tag doi">
                {s}
              </span>
            ))}
          </span>
        </span>
        <span className="hdm-chev" aria-hidden>
          ›
        </span>
      </button>
      <div className="hdm-cb">
        {it.scope.length > 0 && (
          <div className="hdt-scope">
            <b>Phạm vi theo HĐ</b>
            {it.scope.map((s, i) => (
              <p key={i}>{s}</p>
            ))}
          </div>
        )}

        <div className="hdt-h">A · Vật tư sử dụng</div>
        {it.vt.length === 0 ? (
          <div className="hdt-none">HĐ không ghi vật tư riêng cho hạng mục này.</div>
        ) : (
          <table className="hdm-tbl hdt-vt">
            <colgroup>
              <col className="c1" />
              <col className="c2" />
              <col className="c3" />
            </colgroup>
            <thead>
              <tr>
                <th>Vật tư</th>
                <th>Chủng loại · quy cách</th>
                <th>Kiểm tra khi nhận</th>
              </tr>
            </thead>
            <tbody>
              {it.vt.map((v, i) => (
                <tr key={i} className={v.khachCap ? "kc" : ""}>
                  <td className="t">
                    <span className="nm">{v.ten}</span>
                    {v.khachCap && <span className="hdm-tag kc">Chủ nhà cấp{v.src ? ` · ${v.src}` : ""}</span>}
                    {!v.khachCap && v.src && <span className="hdm-tag doi">Đổi · {v.src}</span>}
                  </td>
                  <td>
                    <span className="brand">{v.loai || "—"}</span>
                    {v.quycach && <span className="hdm-anote">{v.quycach}</span>}
                  </td>
                  <td>
                    {v.khachCap ? (
                      <span className="hdm-anote">Chủ nhà giao — kiểm số lượng, tình trạng, ghi nhận vào nhật ký</span>
                    ) : (
                      <ul className="hdt-chk">
                        {v.check.map((c, j) => (
                          <li key={j}>{c}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="hdt-h">B · Điểm dừng nghiệm thu</div>
        {it.stages.map((s) => (
          <div key={s.no} className="hdt-stage">
            <div className="hdt-sh">
              <span className="hdt-badge">{s.no}</span>
              <span className="hdt-st">{s.title}</span>
              <span className="hdt-bb">ký BB {s.no}</span>
            </div>
            {s.steps.length > 0 && (
              <div className="hdt-steps">
                <b>Trình tự thi công</b>
                <ol>
                  {s.steps.map((x, j) => (
                    <li key={j}>{x}</li>
                  ))}
                </ol>
              </div>
            )}
            {s.notes.length > 0 && (
              <div className="hdt-steps warn">
                <b>Lưu ý</b>
                {s.notes.map((x, j) => (
                  <p key={j}>• {x}</p>
                ))}
              </div>
            )}
            <ol className="hdt-crit">
              {s.items.map((c, j) => (
                <li key={j}>
                  <b>{c.noi}</b>
                  <span>{c.yc}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}

        {it.notes.length > 0 && (
          <div className="hdm-notes">
            {it.notes.map((n, i) => (
              <p key={i}>• {n}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
