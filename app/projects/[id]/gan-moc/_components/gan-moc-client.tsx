"use client";

import { plexSans, plexMono } from "@/lib/fonts";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import "./gan-moc.css";

type Work = {
  id: string;
  name: string;
  sectionId: string | null;
  sectionName: string;
  value: number;
  done: boolean;
  doneAt: string | null;
};

type MsState = "da_ky" | "chua_gan" | "den_han" | "dang_lam" | "chua_toi";
type PayState = "da_thu" | "chua_gan" | "du_dieu_kien" | "chua_du";

type Milestone = {
  id: string;
  kind: "chu_nha" | "thau_phu";
  seq: number;
  title: string;
  group: string;
  status: string;
  workIds: string[];
  readiness: { state: MsState; done: number; total: number; dueSince: string | null };
  suggest: string[];
};

type Payment = {
  id: string;
  phaseNumber: number;
  milestoneDescription: string;
  amount: number;
  date: string | null;
  status: string;
  workIds: string[];
  milestoneIds: string[];
  workPctRequired: number;
  readiness: { state: PayState; pct: number; pctRequired: number; worksLeft: string[]; milestonesLeft: string[] };
  suggest: { workIds: string[]; milestoneIds: string[]; workPctRequired: number };
};

type SubPay = {
  id: string;
  stage: number;
  description: string;
  contract: string;
  amount: number;
  date: string;
  status: string;
  workIds: string[];
};

type Tab = "thau_phu" | "chu_nha" | "payment" | "sub";
type EditKind = "milestone" | "payment" | "sub_payment";

const MS_LABEL: Record<MsState, string> = {
  da_ky: "Đã ký",
  chua_gan: "Chưa gán",
  den_han: "Đến hạn NT",
  dang_lam: "Đang làm",
  chua_toi: "Chưa tới",
};
const PAY_LABEL: Record<PayState, string> = {
  da_thu: "Đã thu",
  chua_gan: "Chưa gán",
  du_dieu_kien: "Đủ ĐK thu",
  chua_du: "Chưa đủ",
};
const STATE_CLS: Record<string, string> = {
  da_ky: "ok",
  da_thu: "ok",
  den_han: "hot",
  du_dieu_kien: "hot",
  dang_lam: "mid",
  chua_du: "mid",
  chua_toi: "mut",
  chua_gan: "bad",
};

const fmtMoney = (v: number) => `${Math.round(v).toLocaleString("vi-VN")} đ`;
const fmtDay = (iso: string | null) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "—");
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

// Gán mốc (GĐ5): mỗi mốc nghiệm thu / đợt thu chọn công tác tiến độ. Bấm 1 dòng → chọn công tác.
export function GanMocClient({
  projectId,
  projectCode,
  projectName,
}: {
  projectId: string;
  projectCode: string;
  projectName: string;
}) {
  const [works, setWorks] = useState<Work[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [subPays, setSubPays] = useState<SubPay[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("thau_phu");
  const [edit, setEdit] = useState<{ kind: EditKind; id: string } | null>(null);
  const [selWorks, setSelWorks] = useState<string[]>([]);
  const [selMs, setSelMs] = useState<string[]>([]);
  const [pctReq, setPctReq] = useState(100);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("tiendo-theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {}
  }, []);
  const toggleTheme = () =>
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("tiendo-theme", next);
      } catch {}
      return next;
    });

  const load = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/gan-moc`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast.error(j.message || "Không tải được");
      setLoading(false);
      return;
    }
    setWorks(j.works);
    setMilestones(j.milestones);
    setPayments(j.payments);
    setSubPays(j.subPayments ?? []);
    setLoading(false);
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

  const worksById = useMemo(() => new Map(works.map((w) => [w.id, w])), [works]);
  const sections = useMemo(() => {
    const out: { name: string; works: Work[] }[] = [];
    for (const w of works) {
      const last = out[out.length - 1];
      if (last && last.name === w.sectionName) last.works.push(w);
      else out.push({ name: w.sectionName, works: [w] });
    }
    return out;
  }, [works]);
  const chuNha = milestones.filter((m) => m.kind === "chu_nha");
  const rows = tab === "payment" || tab === "sub" ? [] : milestones.filter((m) => m.kind === tab);

  const count = (t: Tab) =>
    t === "sub"
      ? { tot: subPays.length, gan: subPays.filter((p) => p.workIds.length).length }
      : t === "payment"
      ? { tot: payments.length, gan: payments.filter((p) => p.workIds.length || p.milestoneIds.length).length }
      : {
          tot: milestones.filter((m) => m.kind === t).length,
          gan: milestones.filter((m) => m.kind === t && m.workIds.length).length,
        };

  const openMs = (m: Milestone) => {
    setEdit({ kind: "milestone", id: m.id });
    setSelWorks(m.workIds.length ? m.workIds : m.suggest);
  };
  const openPay = (p: Payment) => {
    setEdit({ kind: "payment", id: p.id });
    const empty = !p.workIds.length && !p.milestoneIds.length;
    setSelWorks(empty ? p.suggest.workIds : p.workIds);
    setSelMs(empty ? p.suggest.milestoneIds : p.milestoneIds);
    setPctReq(empty ? p.suggest.workPctRequired : p.workPctRequired);
  };

  const openSub = (p: SubPay) => {
    if (p.status === "paid") return;
    setEdit({ kind: "sub_payment", id: p.id });
    setSelWorks(p.workIds);
  };

  const put = async (body: object) => {
    const r = await fetch(`/api/projects/${projectId}/gan-moc`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Lưu lỗi");
  };

  const save = async () => {
    if (!edit) return;
    setSaving(true);
    try {
      await put(
        edit.kind === "milestone" || edit.kind === "sub_payment"
          ? { target: edit.kind, id: edit.id, workIds: selWorks }
          : { target: "payment", id: edit.id, workIds: selWorks, milestoneIds: selMs, workPctRequired: pctReq },
      );
      toast.success("Đã lưu");
      setEdit(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Áp gợi ý cho các mốc/đợt CHƯA gán ở tab đang xem (không đụng mốc đã gán).
  const applySuggestAll = async () => {
    if (tab === "sub") {
      toast.info("Đợt khoán chưa có gợi ý — bấm từng đợt chọn công tác theo PL03 HĐ khoán");
      return;
    }
    const jobs =
      tab === "payment"
        ? payments
            .filter((p) => !p.workIds.length && !p.milestoneIds.length && (p.suggest.workIds.length || p.suggest.milestoneIds.length))
            .map((p) => ({ target: "payment", id: p.id, ...p.suggest }))
        : rows
            .filter((m) => !m.workIds.length && m.suggest.length && m.status !== "signed")
            .map((m) => ({ target: "milestone", id: m.id, workIds: m.suggest }));
    if (!jobs.length) {
      toast.info("Không còn mốc chưa gán nào có gợi ý");
      return;
    }
    if (!window.confirm(`Áp gợi ý cho ${jobs.length} mốc chưa gán? Mốc đã gán giữ nguyên. Soát lại từng mốc sau khi áp.`)) return;
    setSaving(true);
    let ok = 0;
    for (const j of jobs) {
      try {
        await put(j);
        ok++;
      } catch {}
    }
    setSaving(false);
    toast.success(`Đã áp gợi ý ${ok}/${jobs.length} mốc`);
    await load();
  };

  const toggle = (arr: string[], id: string) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const workNames = (ids: string[]) =>
    ids
      .map((id) => worksById.get(id))
      .filter((w): w is Work => !!w)
      .map((w) => (w.done ? "✓ " : "") + w.name);

  const editing =
    edit?.kind === "milestone"
      ? milestones.find((m) => m.id === edit.id)
      : edit?.kind === "payment"
        ? payments.find((p) => p.id === edit.id)
        : edit?.kind === "sub_payment"
          ? subPays.find((p) => p.id === edit.id)
          : undefined;
  const editSuggest =
    edit?.kind === "milestone"
      ? (editing as Milestone | undefined)?.suggest
      : edit?.kind === "payment"
        ? (editing as Payment | undefined)?.suggest.workIds
        : undefined;

  return (
    <div className={`gmdoc -mx-4 -mt-4 md:-mx-6 md:-mt-6 ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
      <div className="wrap">
        <div className="topbar">
          <div className="brand">
            <div className="mark">HG</div>
            <div>
              <b>HUỲNH GIA</b>
              <span>Gán mốc · GĐ5</span>
            </div>
          </div>
          <div className="tbtns">
            <button className="iconbtn" onClick={toggleTheme} type="button" aria-label="Đổi nền sáng/tối">
              ◑
            </button>
            <Link href={`/projects/${projectId}/tien-do`} className="iconbtn" aria-label="Quay lại tiến độ">
              ‹
            </Link>
          </div>
        </div>

        <h1 className="ttl">Gán mốc nghiệm thu & đợt thu</h1>
        <div className="meta">
          <span className="num">{projectCode}</span> · {projectName} · <span className="num">{works.length}</span> công tác tiến độ
        </div>
        <p className="lead">
          Mỗi mốc chọn các công tác tiến độ mà <b>xong hết</b> thì mốc <b>đến hạn nghiệm thu</b>. Đợt thu: công tác
          xong đủ % + mốc NT chủ nhà đã ký → <b>đủ điều kiện thu</b>. KS tick tiến độ hằng ngày, ERP tự báo. Đợt thu +
          đợt khoán NC đã gán: <b>ngày dự kiến tự tính theo tiến độ</b> (công tác xong trễ nhất), muốn đổi ngày → đổi ở Tiến độ.
        </p>

        <div className="tabs">
          {(["thau_phu", "chu_nha", "payment", "sub"] as Tab[]).map((t) => {
            const c = count(t);
            return (
              <button key={t} type="button" className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                {t === "thau_phu" ? "NT đội khoán" : t === "chu_nha" ? "NT chủ nhà" : t === "payment" ? "Đợt thu" : "Đợt khoán NC"}
                <span className={`num ${c.gan < c.tot ? "warn" : ""}`}>
                  {c.gan}/{c.tot}
                </span>
              </button>
            );
          })}
        </div>

        <div className="acts">
          <button type="button" className="btn" disabled={saving || loading} onClick={() => void applySuggestAll()}>
            ✨ Áp gợi ý cho mốc chưa gán
          </button>
        </div>

        {loading ? <div className="empty">Đang tải…</div> : null}
        {!loading && !works.length ? (
          <div className="empty">Dự án chưa có công tác tiến độ (Dự toán → công tác). Lập tiến độ trước rồi mới gán mốc.</div>
        ) : null}

        {!loading && (tab === "thau_phu" || tab === "chu_nha") ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Mốc</th>
                <th>Đến hạn khi xong</th>
                <th>Tình trạng</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m, i) => {
                const g = m.group;
                const head = tab === "thau_phu" && g && (i === 0 || rows[i - 1].group !== g);
                const names = workNames(m.workIds);
                return [
                  head ? (
                    <tr key={`g-${m.id}`} className="grp">
                      <td colSpan={3}>{g}</td>
                    </tr>
                  ) : null,
                  <tr key={m.id} onClick={() => openMs(m)} className="row">
                    <td className="mc">
                      <b>{m.kind === "chu_nha" ? `Mục ${m.seq} · ${m.title}` : m.title}</b>
                    </td>
                    <td className="wc">
                      {names.length ? names.join(" · ") : <i className="mut">— bấm để chọn —</i>}
                    </td>
                    <td>
                      <span className={`st ${STATE_CLS[m.readiness.state]}`}>{MS_LABEL[m.readiness.state]}</span>
                      {m.readiness.total ? (
                        <small className="num">
                          {m.readiness.done}/{m.readiness.total}
                          {m.readiness.dueSince ? ` · từ ${fmtDay(m.readiness.dueSince)}` : ""}
                        </small>
                      ) : null}
                    </td>
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        ) : null}

        {!loading && tab === "payment" ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Đợt thu</th>
                <th>Điều kiện (công tác · NT chủ nhà)</th>
                <th>Tình trạng</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const names = workNames(p.workIds);
                const ms = chuNha.filter((m) => p.milestoneIds.includes(m.id)).map((m) => `NT Mục ${m.seq}`);
                return (
                  <tr key={p.id} onClick={() => openPay(p)} className="row">
                    <td className="mc">
                      <b>
                        Đợt {p.phaseNumber} · {p.milestoneDescription}
                      </b>
                      <small className="num">
                        {fmtMoney(p.amount)} · {fmtDay(p.date)}
                      </small>
                    </td>
                    <td className="wc">
                      {names.length || ms.length ? (
                        <>
                          {p.workPctRequired < 100 ? <b className="num">≥{p.workPctRequired}% · </b> : null}
                          {[...names, ...ms].join(" · ")}
                        </>
                      ) : (
                        <i className="mut">— bấm để chọn (đặt cọc/bảo hành để trống) —</i>
                      )}
                    </td>
                    <td>
                      <span className={`st ${STATE_CLS[p.readiness.state]}`}>{PAY_LABEL[p.readiness.state]}</span>
                      {p.workIds.length ? <small className="num">{p.readiness.pct}%</small> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}

        {!loading && tab === "sub" ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Đợt khoán</th>
                <th>Chi khi xong công tác</th>
                <th>Ngày chi</th>
              </tr>
            </thead>
            <tbody>
              {subPays.map((p, i) => {
                const names = workNames(p.workIds);
                const head = i === 0 || subPays[i - 1].contract !== p.contract;
                return [
                  head ? (
                    <tr key={`g-${p.id}`} className="grp">
                      <td colSpan={3}>{p.contract}</td>
                    </tr>
                  ) : null,
                  <tr key={p.id} onClick={() => openSub(p)} className="row">
                    <td className="mc">
                      <b>
                        Đợt {p.stage} · {p.description}
                      </b>
                      <small className="num">{fmtMoney(p.amount)}</small>
                    </td>
                    <td className="wc">
                      {names.length ? names.join(" · ") : <i className="mut">— bấm để chọn (ngày nhập tay) —</i>}
                    </td>
                    <td>
                      {p.status === "paid" ? <span className="st ok">Đã chi</span> : null}
                      <small className="num">
                        {fmtDay(p.date)}
                        {p.workIds.length && p.status !== "paid" ? " · theo tiến độ" : ""}
                      </small>
                    </td>
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        ) : null}
      </div>

      {edit && editing
        ? createPortal(
        // Portal ra body: khung app có transform → position:fixed bên trong bị neo sai.
        <div className={`gmdoc gmportal ${plexSans.variable} ${plexMono.variable}`} data-theme={theme}>
        <div className="sheet-bg" onClick={() => !saving && setEdit(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sh-top">
              <b>
                {edit.kind === "milestone"
                  ? (editing as Milestone).title
                  : edit.kind === "sub_payment"
                    ? `${(editing as SubPay).contract} · Đợt ${(editing as SubPay).stage}`
                    : `Đợt ${(editing as Payment).phaseNumber} · ${(editing as Payment).milestoneDescription}`}
              </b>
              <button type="button" className="iconbtn" onClick={() => setEdit(null)} aria-label="Đóng">
                ✕
              </button>
            </div>
            <div className="sh-acts">
              {editSuggest ? (
                <button type="button" className="btn" onClick={() => setSelWorks(editSuggest)}>
                  ✨ Gợi ý
                </button>
              ) : null}
              <button type="button" className="btn" onClick={() => setSelWorks([])}>
                Bỏ hết
              </button>
              <span className="mut num">{selWorks.length} công tác</span>
            </div>

            {edit.kind === "payment" ? (
              <div className="paycfg">
                <label>
                  Công tác xong tối thiểu{" "}
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={pctReq}
                    onChange={(e) => setPctReq(Math.min(100, Math.max(1, Number(e.target.value) || 100)))}
                    className="num"
                  />{" "}
                  %
                </label>
                <div className="mslist">
                  <span className="mut">NT chủ nhà phải ký:</span>
                  {chuNha.map((m) => (
                    <label key={m.id} className={`chip ${selMs.includes(m.id) ? "on" : ""}`}>
                      <input type="checkbox" checked={selMs.includes(m.id)} onChange={() => setSelMs(toggle(selMs, m.id))} />
                      Mục {m.seq}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="wlist">
              {sections.map((s) => (
                <div key={s.name} className="wsec">
                  <div className="wsh">{s.name}</div>
                  {s.works.map((w) => (
                    <label key={w.id} className={`wrow ${selWorks.includes(w.id) ? "on" : ""}`}>
                      <input type="checkbox" checked={selWorks.includes(w.id)} onChange={() => setSelWorks(toggle(selWorks, w.id))} />
                      <span className="wn">{w.name}</span>
                      {w.done ? <span className="st ok">Xong</span> : null}
                    </label>
                  ))}
                </div>
              ))}
            </div>

            <div className="sh-foot">
              <button type="button" className="btn" onClick={() => setEdit(null)} disabled={saving}>
                Huỷ
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => void save()}
                disabled={
                  saving ||
                  (edit.kind === "milestone" && sameSet(selWorks, (editing as Milestone).workIds)) ||
                  (edit.kind === "sub_payment" && sameSet(selWorks, (editing as SubPay).workIds)) ||
                  (edit.kind === "payment" &&
                    sameSet(selWorks, (editing as Payment).workIds) &&
                    sameSet(selMs, (editing as Payment).milestoneIds) &&
                    pctReq === (editing as Payment).workPctRequired)
                }
              >
                {saving ? "Đang lưu…" : "Lưu"}
              </button>
            </div>
          </div>
        </div>
        </div>,
            document.body,
          )
        : null}
    </div>
  );
}
