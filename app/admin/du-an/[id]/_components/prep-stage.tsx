"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PREP_GROUPS, PREP_STEPS, type PrepStepKey } from "@/lib/prep-steps";

type Info = Record<string, { text: string; warn?: boolean }>;
type SubDoc = {
  id: string;
  code: string;
  title: string;
  subcontractor: string;
  value: number;
  files: { id: string; fileName: string; pdf: boolean; url: string }[];
};

function dateVn(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  });
}

// GĐ 5 Chuẩn bị: checklist trước thi công (menu cây + chốt từng mục như GĐ 4).
// Mỗi mục mở màn có sẵn của dự án; chốt đủ hết mới được sang GĐ 6 Thi công (API chặn).
export function PrepStage({ projectId }: { projectId: string }) {
  const [done, setDone] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<Info>({});
  const [contracts, setContracts] = useState<SubDoc[]>([]);
  const [docs, setDocs] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<PrepStepKey | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/prep`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message || "Không tải được checklist");
        return;
      }
      const d: Record<string, string> = json.done || {};
      setDone(d);
      setInfo(json.info || {});
      setContracts(json.contracts || []);
      setDocs(json.docs || {});
      // Mở sẵn mục đầu tiên chưa chốt.
      setSel(
        (cur) =>
          cur ?? (PREP_STEPS.find((s) => !d[s.key])?.key || PREP_STEPS[0].key),
      );
    } catch {
      setError("Lỗi mạng, thử lại");
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (key: PrepStepKey, label: string) => {
    const next = !done[key];
    if (
      !window.confirm(
        next ? `Chốt mục "${label}" — đã chuẩn bị xong?` : `Mở lại mục "${label}"?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/prep`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: key, done: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message || "Không lưu được");
        return;
      }
      const d: Record<string, string> = json.done || {};
      setDone(d);
      if (next) {
        const after = PREP_STEPS.find((s) => !d[s.key]);
        if (after) setSel(after.key);
      }
    } catch {
      setError("Lỗi mạng, thử lại");
    } finally {
      setBusy(false);
    }
  };

  const doneCount = PREP_STEPS.filter((s) => done[s.key]).length;

  const treeItem = (key: PrepStepKey, label: string, sub: boolean) => (
    <button
      type="button"
      key={key}
      className={`pl-dsnode${sub ? " sub" : ""}${sel === key ? " on" : ""}${done[key] ? " ok" : ""}`}
      onClick={() => setSel(key)}
    >
      <span className="dot">{done[key] ? "✓" : ""}</span>
      <span className="lb">{label}</span>
      <small className="pl-num">{done[key] ? dateVn(done[key]) : ""}</small>
    </button>
  );

  const step = PREP_STEPS.find((s) => s.key === sel) || null;
  const group = step ? PREP_GROUPS.find((g) => g.group === step.group) : null;
  const groupSize = step
    ? PREP_STEPS.filter((s) => s.group === step.group).length
    : 0;
  const locked = step ? Boolean(done[step.key]) : false;
  const stepInfo = step ? info[step.key] : undefined;
  // Mục hồ sơ = file thô làm tay (PDF), không nối số liệu: chưa có file thì trống.
  // Thầu phụ = file HĐ đính ở hợp đồng; Nhân sự = không file, giữ dòng tóm tắt + nút mở.
  const isDoc = step ? step.key !== "nhan_su" : false;
  const docUrl = step ? `/api/projects/${projectId}/prep/doc/${step.key}` : "";

  return (
    <div className="pl-design">
      {error ? <div className="pl-err">{error}</div> : null}
      <div
        className={doneCount === PREP_STEPS.length ? "pl-ok" : "pl-prepbar"}
      >
        {doneCount === PREP_STEPS.length
          ? "✓ Đã chuẩn bị đủ — có thể chốt sang Thi công."
          : `Đã chốt ${doneCount}/${PREP_STEPS.length} mục — chốt đủ mới được sang Thi công.`}
      </div>

      <div className="pl-dsgrid">
        <nav className="pl-dstree">
          {PREP_GROUPS.map((g) => {
            const steps = PREP_STEPS.filter((s) => s.group === g.group);
            if (steps.length === 1) return treeItem(steps[0].key, g.title, false);
            const allDone = steps.every((s) => done[s.key]);
            return (
              <div key={g.group}>
                <div className={`pl-dsnode head${allDone ? " ok" : ""}`}>
                  <span className="dot">{allDone ? "✓" : ""}</span>
                  <span className="lb">{g.title}</span>
                </div>
                {steps.map((s) => treeItem(s.key, s.label, true))}
              </div>
            );
          })}
        </nav>

        {step ? (
          <section className="pl-dsgroup">
            <h3>
              {group && groupSize > 1 ? `${group.title} · ${step.label}` : group?.title}
            </h3>
            <div className="pl-dsrow">
              <div className="pl-dshead">
                {locked ? (
                  <span className="pl-dsok">✓ Đã chốt {dateVn(done[step.key])}</span>
                ) : (
                  <span />
                )}
                <div className="pl-dsact">
                  {isDoc ? null : (
                    <Link className="pl-btn ghost" href={`/projects/${projectId}/${step.path}`}>
                      Mở {step.label} ›
                    </Link>
                  )}
                  <button
                    type="button"
                    className={`pl-btn${locked ? " ghost" : ""}`}
                    onClick={() => toggle(step.key, step.label)}
                    disabled={busy}
                  >
                    {locked ? "Mở lại" : "✓ Chốt"}
                  </button>
                </div>
              </div>
              {isDoc ? null : (
                <div className={`pl-prepinfo${stepInfo?.warn ? " warn" : ""}`}>
                  {stepInfo?.text || "…"}
                </div>
              )}
              {isDoc && step.key !== "thau_phu" && docs[step.key] ? (
                <div className="pl-subdoc">
                  <div className="pl-subdoc-h">
                    <b>{step.label}</b>
                    <a href={docUrl} target="_blank" rel="noreferrer">
                      Mở toàn màn hình ›
                    </a>
                  </div>
                  <iframe className="pl-subdoc-pdf" src={docUrl} title={step.label} />
                </div>
              ) : null}
              {step.key === "thau_phu"
                ? contracts.map((c) => {
                    const pdf = c.files.find((f) => f.pdf);
                    if (!pdf) return null;
                    return (
                      <div className="pl-subdoc" key={c.id}>
                        <div className="pl-subdoc-h">
                          <b>{c.code}</b> · {c.subcontractor}
                          <a href={pdf.url} target="_blank" rel="noreferrer">
                            Mở toàn màn hình ›
                          </a>
                        </div>
                        <iframe className="pl-subdoc-pdf" src={pdf.url} title={pdf.fileName} />
                      </div>
                    );
                  })
                : null}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
