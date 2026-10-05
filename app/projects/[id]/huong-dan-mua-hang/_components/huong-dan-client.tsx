"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { GuideAdjust, GuideGroup, PurchaseGuide } from "@/lib/purchase-guide";
import "./huong-dan.css";

type Tab = "all" | "tho" | "ht" | "kc";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "tho", label: "Phần thô" },
  { key: "ht", label: "Hoàn thiện" },
  { key: "kc", label: "Khách cấp" },
];

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("vi-VN") : "—");
const fmtQty = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
const srcOf = (a: GuideAdjust) => a.source || "Phụ lục";

export function HuongDanClient({
  projectCode,
  projectName,
  customerName,
  contractId,
  signedAt,
  quoteUpdatedAt,
  guide,
  isAdmin,
  backHref,
}: {
  projectCode: string;
  projectName: string;
  customerName: string | null;
  contractId: string | null;
  signedAt: string | null;
  quoteUpdatedAt: string | null;
  guide: PurchaseGuide | null;
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

  const stats = useMemo(() => {
    if (!guide) return { total: 0, kc: 0, doi: 0 };
    let total = 0;
    let kc = 0;
    let doi = 0;
    for (const g of [...guide.tho, ...guide.ht]) {
      for (const r of g.rows) {
        total++;
        const m = r.adjust?.mode ?? g.adjust?.mode;
        if (m === "khach_cap") kc++;
        else if (m === "doi" || m === "them") doi++;
      }
    }
    return { total: total + guide.extras.length, kc, doi: doi + guide.extras.length };
  }, [guide]);

  // lọc theo tab + ô tìm (tên/hãng/quy cách/hạng mục)
  const filterGroups = (groups: GuideGroup[]) => {
    const nq = norm(q.trim());
    return groups
      .map((g) => {
        let rows = g.rows;
        if (tab === "kc")
          rows = rows.filter((r) => (r.adjust?.mode ?? g.adjust?.mode) === "khach_cap");
        if (nq && !norm(g.name).includes(nq))
          rows = rows.filter((r) =>
            norm(
              [r.ten, r.loai, r.quycach, r.adjust?.loai, r.adjust?.quycach, r.adjust?.note].join(" "),
            ).includes(nq),
          );
        return { ...g, rows };
      })
      .filter((g) => g.rows.length > 0 || (!nq && tab !== "kc" && g.qty.length > 0));
  };

  const tho = guide && (tab === "all" || tab === "tho" || tab === "kc") ? filterGroups(guide.tho) : [];
  const ht = guide && (tab === "all" || tab === "ht" || tab === "kc") ? filterGroups(guide.ht) : [];
  const showExcluded = guide && guide.excluded.length > 0 && tab === "all" && !q.trim();
  // đang tìm → mở hết card khớp
  const isOpen = (key: string) => !!q.trim() || open === key;

  return (
    <div className="hdm-app" data-theme={theme}>
      <div className="hdm-wrap">
        <div className="hdm-top">
          <Link href={backHref} className="hdm-back">
            ‹ {projectCode}
          </Link>
          <div className="hdm-acts">
            {guide && (
              <button type="button" className="hdm-btn" onClick={() => window.print()}>
                In
              </button>
            )}
            <button type="button" className="hdm-btn" onClick={toggleTheme} aria-label="Đổi nền">
              ◑
            </button>
          </div>
        </div>

        <div className="hdm-eyebrow">Hướng dẫn mua hàng</div>
        <h1 className="hdm-h1">{projectName}</h1>
        <div className="hdm-meta">
          {customerName ? `Chủ đầu tư: ${customerName} · ` : ""}
          Căn cứ: phụ lục vật tư HĐ ký {fmtDate(signedAt)}
          {quoteUpdatedAt ? ` (báo giá cập nhật ${fmtDate(quoteUpdatedAt)})` : ""}
          {guide ? ` · ${stats.total} vật tư` : ""}
          {stats.kc ? ` · ${stats.kc} khách cấp` : ""}
          {stats.doi ? ` · ${stats.doi} cập nhật theo phụ lục` : ""}
        </div>

        <div className="hdm-who hdm-noprint">
          <div>
            <b>Kế toán — khi mua</b>
            Đặt đúng <u>chủng loại / thương hiệu</u> và <u>quy cách</u> bên dưới. Dòng “Khách tự cấp” thì KHÔNG
            mua. Muốn đổi hãng phải có phụ lục / admin duyệt.
          </div>
          <div>
            <b>Giám sát — khi nhận hàng</b>
            Đối chiếu nhãn, hãng, quy cách thực tế với bảng. Sai chủng loại → không nhận, báo admin + kế toán.
          </div>
        </div>

        {!guide ? (
          <div className="hdm-empty">
            {contractId ? (
              <>Hợp đồng gắn dự án này chưa có báo giá / phụ lục vật tư.</>
            ) : (
              <>Dự án chưa gắn hợp đồng có phụ lục vật tư.</>
            )}{" "}
            {isAdmin ? (
              <>
                Vào <Link href={contractId ? `/admin/contracts/${contractId}` : "/admin/contracts"}>Hợp đồng</Link>{" "}
                để lập báo giá / gắn dự án — hướng dẫn mua hàng tự lấy từ đó.
              </>
            ) : (
              <>Liên hệ admin để bổ sung.</>
            )}
          </div>
        ) : (
          <>
            <div className="hdm-tools hdm-noprint">
              <input
                className="hdm-search"
                placeholder="Tìm vật tư, hãng, quy cách…"
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

            {tho.length > 0 && <div className="hdm-sec">Vật tư phần thô</div>}
            {tho.map((g) => (
              <GroupCard key={g.key} g={g} open={isOpen(g.key)} onToggle={() => toggle(g.key)} />
            ))}

            {ht.length > 0 && <div className="hdm-sec">Vật tư hoàn thiện</div>}
            {ht.map((g) => (
              <GroupCard key={g.key} g={g} open={isOpen(g.key)} onToggle={() => toggle(g.key)} />
            ))}

            {guide.extras.length > 0 && tab !== "kc" && (
              <>
                <div className="hdm-sec">Thêm theo phụ lục</div>
                <Card
                  id="extras"
                  title="Vật tư thêm theo phụ lục"
                  count={`${guide.extras.length} VT`}
                  tags={uniqSrc(guide.extras)}
                  open={isOpen("extras")}
                  onToggle={() => toggle("extras")}
                >
                  <table className="hdm-tbl">
                    <colgroup>
                      <col className="c1" />
                      <col className="c2" />
                      <col className="c3" />
                    </colgroup>
                    <tbody>
                      {guide.extras.map((a) => (
                        <tr key={a.itemKey}>
                          <td className="t">
                            {a.ten}
                            {a.groupName && <span className="used">{a.groupName}</span>}
                            <span className="hdm-tag doi">{srcOf(a)}</span>
                          </td>
                          <td>
                            <span className="brand">{a.loai || "—"}</span>
                          </td>
                          <td>
                            {a.quycach || "—"}
                            {a.note && <span className="hdm-anote">{a.note}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </>
            )}

            {showExcluded && (
              <>
                <div className="hdm-sec">Không bao gồm trong HĐ — không mua</div>
                <Card
                  id="excluded"
                  title="Không bao gồm"
                  count={`${guide.excluded.length} mục`}
                  open={isOpen("excluded")}
                  onToggle={() => toggle("excluded")}
                >
                  <ul className="hdm-ex">
                    {guide.excluded.map((x, i) => (
                      <li key={i}>
                        {x.ten}
                        {x.ghi && <span>{x.ghi}</span>}
                      </li>
                    ))}
                  </ul>
                </Card>
              </>
            )}
          </>
        )}
      </div>

    </div>
  );
}

// nguồn phụ lục (không trùng) của các điều chỉnh → nhãn trên đầu card
function uniqSrc(list: (GuideAdjust | null | undefined)[]) {
  return Array.from(new Set(list.filter((a): a is GuideAdjust => !!a).map(srcOf)));
}

function Card({
  id,
  title,
  count,
  tags,
  kc,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  count: string;
  tags?: string[];
  kc?: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={"hdm-card" + (open ? " open" : "") + (kc ? " off" : "")} data-hdm-card={id}>
      <button type="button" className="hdm-ch" onClick={onToggle} aria-expanded={open}>
        <span className="hdm-cht">
          <span className="nm">{title}</span>
          <span className="hdm-chtags">
            <span className="n">{count}</span>
            {kc && <span className="hdm-tag kc">Khách tự cấp</span>}
            {tags?.map((t) => (
              <span key={t} className="hdm-tag doi">
                {t}
              </span>
            ))}
          </span>
        </span>
        <span className="hdm-chev" aria-hidden>
          ›
        </span>
      </button>
      <div className="hdm-cb">{children}</div>
    </div>
  );
}

function GroupCard({ g, open, onToggle }: { g: GuideGroup; open: boolean; onToggle: () => void }) {
  const ga = g.adjust;
  const groupKc = ga?.mode === "khach_cap";
  return (
    <Card
      id={g.key}
      title={g.name}
      count={`${g.rows.length} VT`}
      tags={uniqSrc([ga, ...g.rows.map((r) => r.adjust)])}
      kc={groupKc}
      open={open}
      onToggle={onToggle}
    >
      {ga && <GroupBanner a={ga} />}
      {g.rows.length > 0 && (
        <table className="hdm-tbl">
          <colgroup>
            <col className="c1" />
            <col className="c2" />
            <col className="c3" />
          </colgroup>
          <thead>
            <tr>
              <th>Vật tư</th>
              <th>Chủng loại / Hãng</th>
              <th>Quy cách</th>
            </tr>
          </thead>
          <tbody>
            {g.rows.map((r) => {
              const a = r.adjust;
              const kc = groupKc || a?.mode === "khach_cap";
              // chỉ hiện bản mới nhất: điều chỉnh có giá trị thì thay giá trị gốc
              const loai = (a?.mode !== "khach_cap" && a?.loai) || r.loai;
              const quycach = (a?.mode !== "khach_cap" && a?.quycach) || r.quycach;
              return (
                <tr key={r.key} className={kc ? "kc" : ""}>
                  <td className="t">
                    <span className="nm">{r.ten}</span>
                    {r.usedIn.length > 0 && <span className="used">{r.usedIn.join(", ")}</span>}
                    {a?.mode === "khach_cap" && <span className="hdm-tag kc">Khách tự cấp — KHÔNG mua</span>}
                    {a && <span className={"hdm-tag " + (a.mode === "khach_cap" ? "kc" : "doi")}>{srcOf(a)}</span>}
                  </td>
                  <td>
                    <span className="brand">{loai || "—"}</span>
                  </td>
                  <td>
                    {quycach || "—"}
                    {a?.note && <span className="hdm-anote">{a.note}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {g.qty.length > 0 && (
        <div className="hdm-qty">
          <b>Khối lượng theo HĐ</b>
          <ul>
            {g.qty.map((x, i) => (
              <li key={i}>
                <span>{x.ten}</span>
                <span>
                  {fmtQty(x.kl)} {x.dvt}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {g.notes.length > 0 && (
        <div className="hdm-notes">
          {g.notes.map((n, i) => (
            <p key={i}>• {n}</p>
          ))}
        </div>
      )}
    </Card>
  );
}

function GroupBanner({ a }: { a: GuideAdjust }) {
  if (a.mode === "khach_cap")
    return (
      <div className="hdm-banner kc">
        <b>Khách tự cấp cả hạng mục — KHÔNG mua ({srcOf(a)}).</b>
        {a.note ? ` ${a.note}` : ""}
      </div>
    );
  return (
    <div className="hdm-banner doi">
      <b>Theo {srcOf(a)}:</b> {[a.loai, a.quycach].filter(Boolean).join(" — ")}
      {a.note ? `. ${a.note}` : ""}
    </div>
  );
}
