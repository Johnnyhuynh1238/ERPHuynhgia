"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { GuideAdjust, GuideGroup, GuideMode, GuideRow, PurchaseGuide } from "@/lib/purchase-guide";
import "./huong-dan.css";

type Tab = "all" | "tho" | "ht" | "kc";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "tho", label: "Phần thô" },
  { key: "ht", label: "Hoàn thiện" },
  { key: "kc", label: "Khách cấp" },
];

const MODE_LABEL: Record<GuideMode, string> = {
  khach_cap: "Khách tự cấp — KHÔNG mua",
  doi: "Đổi theo phụ lục",
  them: "Thêm theo phụ lục",
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("vi-VN") : "—");
const fmtQty = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");

// Popup điều chỉnh: target = 1 dòng VT, 1 nhóm/hạng mục, hoặc thêm VT mới (row=null, group=null)
type EditTarget =
  | { kind: "row"; group: GuideGroup; row: GuideRow }
  | { kind: "group"; group: GuideGroup }
  | { kind: "new" };

export function HuongDanClient({
  projectId,
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
  projectId: string;
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
  const [edit, setEdit] = useState<EditTarget | null>(null);
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
  const groupNames = guide ? [...guide.tho, ...guide.ht].map((g) => g.name) : [];

  return (
    <div className="hdm-app" data-theme={theme}>
      <div className="hdm-wrap">
        <div className="hdm-top">
          <Link href={backHref} className="hdm-back">
            ‹ {projectCode}
          </Link>
          <div className="hdm-acts">
            {isAdmin && guide && (
              <button type="button" className="hdm-btn" onClick={() => setEdit({ kind: "new" })}>
                + VT theo phụ lục
              </button>
            )}
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
          {stats.doi ? ` · ${stats.doi} điều chỉnh theo phụ lục` : ""}
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
              <GroupCard key={g.key} g={g} isAdmin={isAdmin} onEdit={setEdit} />
            ))}

            {ht.length > 0 && <div className="hdm-sec">Vật tư hoàn thiện</div>}
            {ht.map((g) => (
              <GroupCard key={g.key} g={g} isAdmin={isAdmin} onEdit={setEdit} />
            ))}

            {guide.extras.length > 0 && tab !== "kc" && (
              <>
                <div className="hdm-sec">Thêm theo phụ lục</div>
                <div className="hdm-card">
                  <table className="hdm-tbl">
                    <colgroup>
                      <col className="c1" />
                      <col className="c2" />
                      <col className="c3" />
                    </colgroup>
                    <tbody>
                      {guide.extras.map((a) => (
                        <tr
                          key={a.itemKey}
                          className={isAdmin ? "click" : ""}
                          onClick={
                            isAdmin
                              ? () =>
                                  setEdit({
                                    kind: "row",
                                    group: { key: "", kind: "ht", name: a.groupName || "", rows: [], qty: [], notes: [], adjust: null },
                                    row: { key: a.itemKey, ten: a.ten || "", loai: "", quycach: "", usedIn: [], adjust: a },
                                  })
                              : undefined
                          }
                        >
                          <td className="t">
                            {a.ten}
                            {a.groupName && <span className="used">{a.groupName}</span>}
                            <span className="hdm-tag them">{a.source || "Phụ lục"}</span>
                          </td>
                          <td>
                            <span className="brand">{a.loai}</span>
                          </td>
                          <td>
                            {a.quycach}
                            {a.note && <span className="hdm-anote">{a.note}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {showExcluded && (
              <>
                <div className="hdm-sec">Không bao gồm trong HĐ — không mua</div>
                <div className="hdm-card hdm-ex">
                  <ul>
                    {guide.excluded.map((x, i) => (
                      <li key={i}>
                        {x.ten}
                        {x.ghi && <span>{x.ghi}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {edit && (
        <EditSheet
          projectId={projectId}
          target={edit}
          groupNames={groupNames}
          theme={theme}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}

function GroupCard({
  g,
  isAdmin,
  onEdit,
}: {
  g: GuideGroup;
  isAdmin: boolean;
  onEdit: (t: EditTarget) => void;
}) {
  const ga = g.adjust;
  return (
    <div className={"hdm-card" + (ga?.mode === "khach_cap" ? " off" : "")}>
      <div className="hdm-ch">
        <h3>
          {g.name}
          <span className="n">{g.rows.length} VT</span>
        </h3>
        {isAdmin && (
          <button type="button" className="hdm-edit" onClick={() => onEdit({ kind: "group", group: g })}>
            {ga ? "Sửa điều chỉnh" : "Điều chỉnh"}
          </button>
        )}
      </div>
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
            {g.rows.map((r) => (
              <Row key={r.key} r={r} groupKc={ga?.mode === "khach_cap"} onClick={isAdmin ? () => onEdit({ kind: "row", group: g, row: r }) : undefined} />
            ))}
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
    </div>
  );
}

function GroupBanner({ a }: { a: GuideAdjust }) {
  const src = a.source ? ` (${a.source})` : "";
  if (a.mode === "khach_cap")
    return (
      <div className="hdm-banner kc">
        <b>Khách tự cấp cả hạng mục — KHÔNG mua{src}.</b>
        {a.note ? ` ${a.note}` : ""}
      </div>
    );
  return (
    <div className="hdm-banner doi">
      <b>Đổi theo phụ lục{src}:</b> {[a.loai, a.quycach].filter(Boolean).join(" — ")}
      {a.note ? `. ${a.note}` : ""}
    </div>
  );
}

function Row({ r, groupKc, onClick }: { r: GuideRow; groupKc: boolean; onClick?: () => void }) {
  const a = r.adjust;
  const kc = groupKc || a?.mode === "khach_cap";
  const doi = a?.mode === "doi" || a?.mode === "them";
  const src = a?.source ? ` · ${a.source}` : "";
  return (
    <tr className={(onClick ? "click " : "") + (kc ? "kc" : "")} onClick={onClick}>
      <td className="t">
        <span className="nm">{r.ten}</span>
        {r.usedIn.length > 0 && <span className="used">{r.usedIn.join(", ")}</span>}
        {a && <span className={"hdm-tag " + (a.mode === "khach_cap" ? "kc" : "doi")}>{MODE_LABEL[a.mode]}{src}</span>}
      </td>
      <td>
        {doi && a?.loai ? (
          <>
            {r.loai && <span className="old">{r.loai}</span>}
            <span className="brand new">{a.loai}</span>
          </>
        ) : (
          <span className="brand">{r.loai || "—"}</span>
        )}
      </td>
      <td>
        {doi && a?.quycach ? (
          <>
            {r.quycach && <span className="old">{r.quycach}</span>}
            <span className="new">{a.quycach}</span>
          </>
        ) : (
          r.quycach || "—"
        )}
        {a?.note && <span className="hdm-anote">{a.note}</span>}
      </td>
    </tr>
  );
}

function EditSheet({
  projectId,
  target,
  groupNames,
  theme,
  onClose,
}: {
  projectId: string;
  target: EditTarget;
  groupNames: string[];
  theme: string | undefined;
  onClose: () => void;
}) {
  const router = useRouter();
  const cur: GuideAdjust | null =
    target.kind === "row" ? target.row.adjust : target.kind === "group" ? target.group.adjust : null;
  const isNew = target.kind === "new";
  const isExtra = target.kind === "row" && target.row.key.startsWith("extra|");
  const itemKey = target.kind === "row" ? target.row.key : target.kind === "group" ? target.group.key : "";

  const [mode, setMode] = useState<GuideMode | "">(isNew || isExtra ? "them" : cur?.mode ?? "");
  const [ten, setTen] = useState(cur?.ten ?? "");
  const [groupName, setGroupName] = useState(cur?.groupName ?? groupNames[0] ?? "");
  const [loai, setLoai] = useState(cur?.loai ?? "");
  const [quycach, setQuycach] = useState(cur?.quycach ?? "");
  const [note, setNote] = useState(cur?.note ?? "");
  const [source, setSource] = useState(cur?.source ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title =
    target.kind === "row" ? target.row.ten : target.kind === "group" ? `Cả hạng mục: ${target.group.name}` : "Thêm VT theo phụ lục";
  const orig =
    target.kind === "row" && !isExtra
      ? [target.row.loai, target.row.quycach].filter(Boolean).join(" — ")
      : "";

  const save = async () => {
    setErr("");
    // "Theo HĐ gốc" = bỏ điều chỉnh
    if (mode === "") return remove(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/purchase-guide`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemKey,
          mode,
          groupName: isNew || isExtra ? groupName : target.kind === "group" ? target.group.name : target.kind === "row" ? target.group.name : null,
          ten: isNew || isExtra ? ten : target.kind === "row" ? target.row.ten : null,
          loai: mode === "khach_cap" ? "" : loai,
          quycach: mode === "khach_cap" ? "" : quycach,
          note,
          source,
        }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { message?: string }).message || `Lỗi ${res.status}`);
      onClose();
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (confirmFirst: boolean) => {
    if (!cur) return onClose();
    if (confirmFirst && !window.confirm(isExtra ? "Xoá VT thêm theo phụ lục này?" : "Bỏ điều chỉnh, quay về theo phụ lục HĐ gốc?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/purchase-guide?itemKey=${encodeURIComponent(itemKey)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Lỗi ${res.status}`);
      onClose();
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const modes: { v: GuideMode | ""; label: string; hint: string }[] =
    isNew || isExtra
      ? []
      : [
          { v: "", label: "Theo HĐ gốc", hint: "Mua đúng như phụ lục vật tư HĐ" },
          { v: "khach_cap", label: "Khách tự cấp", hint: "KT không mua; giám sát nhận hàng khách mang tới" },
          { v: "doi", label: "Đổi chủng loại / quy cách", hint: "Theo phụ lục điều chỉnh đã ký" },
        ];

  return createPortal(
    <div className="hdm-portal" data-theme={theme} onClick={onClose}>
      <div className="hdm-sheet" onClick={(e) => e.stopPropagation()}>
        <h4>{title}</h4>
        <div className="sub">{orig ? `HĐ gốc: ${orig}` : "Điều chỉnh theo phụ lục hợp đồng đã ký với khách."}</div>

        {modes.length > 0 && (
          <div className="hdm-modes">
            {modes.map((m) => (
              <label key={m.v || "orig"} className={mode === m.v ? "on" : ""}>
                <input type="radio" name="hdm-mode" checked={mode === m.v} onChange={() => setMode(m.v)} />
                <span>
                  {m.label}
                  <small>{m.hint}</small>
                </span>
              </label>
            ))}
          </div>
        )}

        {(isNew || isExtra) && (
          <>
            <label className="hdm-f">
              <span>Thuộc hạng mục</span>
              <select value={groupName} onChange={(e) => setGroupName(e.target.value)}>
                {groupNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                <option value="">— Khác —</option>
              </select>
            </label>
            <label className="hdm-f">
              <span>Tên vật tư</span>
              <input value={ten} onChange={(e) => setTen(e.target.value)} />
            </label>
          </>
        )}

        {(mode === "doi" || mode === "them") && (
          <>
            <label className="hdm-f">
              <span>Chủng loại / thương hiệu {mode === "doi" ? "mới" : ""}</span>
              <input value={loai} onChange={(e) => setLoai(e.target.value)} placeholder="VD: Hoa Sen" />
            </label>
            <label className="hdm-f">
              <span>Quy cách {mode === "doi" ? "mới" : ""}</span>
              <textarea value={quycach} onChange={(e) => setQuycach(e.target.value)} placeholder="VD: Tôn lạnh 4,5 zem mạ kẽm, sóng tròn" />
            </label>
          </>
        )}

        {mode !== "" && (
          <>
            <label className="hdm-f">
              <span>Căn cứ</span>
              <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="VD: PL-01 ngày 16/09/2026" />
            </label>
            <label className="hdm-f">
              <span>Ghi chú</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </>
        )}

        {err && <div className="hdm-err">{err}</div>}
        <div className="hdm-foot">
          <div>
            {cur && (
              <button type="button" className="hdm-btn danger" disabled={busy} onClick={() => remove(true)}>
                {isExtra ? "Xoá" : "Bỏ điều chỉnh"}
              </button>
            )}
          </div>
          <div>
            <button type="button" className="hdm-btn" onClick={onClose} disabled={busy}>
              Huỷ
            </button>
            <button type="button" className="hdm-btn pri" onClick={save} disabled={busy}>
              {busy ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
