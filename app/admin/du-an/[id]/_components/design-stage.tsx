"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExpenseCreateModal } from "@/app/expenses/_components/expense-create-modal";
import {
  DESIGN_GROUPS,
  DESIGN_STEPS,
  type DesignStepKey,
} from "@/lib/design-steps";

type DesignFile = {
  id: string;
  name: string;
  designStep: string;
  isImage: boolean;
  sizeBytes: number;
  viewUrl: string;
  thumbUrl: string;
  deleteUrl: string;
};

type DesignExpense = {
  id: string;
  code: string;
  amount: number;
  payee: string | null;
  note: string | null;
  status: string;
  step: string;
};

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
const DOC_ACCEPT = "application/pdf,image/jpeg,image/png";
const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

function money(n: number) {
  return n.toLocaleString("vi-VN");
}

function mb(n: number) {
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function statusText(s: string) {
  if (s === "paid") return "Đã chi";
  if (s === "cancelled") return "Đã huỷ";
  return "Chờ chi";
}

// GĐ 4 Thiết kế: anh chỉ tải file khi khách đã duyệt (không có trạng thái).
// Dùng lại hồ sơ có sẵn: mặt bằng + bản vẽ thi công → Hồ sơ dự án (bật khách xem, mục HỒ SƠ cổng chủ nhà);
// 3D phối cảnh → nhóm ảnh thiết kế "3D phối cảnh" (băng ảnh trang chủ cổng).
// Thuê ngoài: lệnh chi dùng chung, gắn sourceType thiet_ke_<bước>.
export function DesignStage({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const [files, setFiles] = useState<DesignFile[]>([]);
  const [expenses, setExpenses] = useState<DesignExpense[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyStep, setBusyStep] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [payStep, setPayStep] = useState<DesignStepKey | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<DesignStepKey | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadStep = useRef<DesignStepKey | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/design`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.message || "Không tải được dữ liệu thiết kế");
        return;
      }
      setFiles(json.files || []);
      setExpenses(json.expenses || []);
      const d: Record<string, string> = json.done || {};
      setDone(d);
      // Mở sẵn bước đầu tiên chưa chốt.
      setSel(
        (cur) =>
          cur ??
          (DESIGN_STEPS.find((s) => !d[s.key])?.key || DESIGN_STEPS[0].key),
      );
    } catch {
      setError("Lỗi mạng, thử lại");
    } finally {
      setLoaded(true);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const pick = (step: DesignStepKey) => {
    uploadStep.current = step;
    if (fileRef.current)
      fileRef.current.accept = step === "phoi_canh" ? PHOTO_ACCEPT : DOC_ACCEPT;
    fileRef.current?.click();
  };

  const uploadPhotos = async (arr: File[]) => {
    const g = await fetch(`/api/projects/${projectId}/design`, { method: "POST" });
    const gj = await g.json().catch(() => ({}));
    if (!g.ok || !gj.groupId) {
      setError(gj.message || "Không tạo được nhóm ảnh 3D");
      return;
    }
    for (const f of arr) {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch(
        `/api/projects/${projectId}/design-groups/${gj.groupId}/photos`,
        { method: "POST", body: fd },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.message || `Không tải lên được "${f.name}"`);
        return;
      }
    }
  };

  const uploadDocs = async (arr: File[], step: DesignStepKey) => {
    for (const f of arr) {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("title", f.name.replace(/\.[^.]+$/, ""));
      fd.append("category", "drawing");
      fd.append("designStep", step);
      const res = await fetch(`/api/projects/${projectId}/documents`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.message || `Không tải lên được "${f.name}"`);
        return;
      }
    }
  };

  const upload = async (list: FileList | null) => {
    const step = uploadStep.current;
    if (!list || !list.length || !step) return;
    const arr = Array.from(list);
    const limit = step === "phoi_canh" ? MAX_PHOTO_BYTES : MAX_BYTES;
    const big = arr.find((f) => f.size > limit);
    if (big) {
      setError(`File "${big.name}" quá ${limit / (1024 * 1024)} MB`);
      return;
    }
    setBusyStep(step);
    setError("");
    try {
      if (step === "phoi_canh") await uploadPhotos(arr);
      else await uploadDocs(arr, step);
    } catch {
      setError("Lỗi mạng, thử lại");
    } finally {
      setBusyStep(null);
      if (fileRef.current) fileRef.current.value = "";
      load();
    }
  };

  const remove = async (f: DesignFile) => {
    if (
      !window.confirm(
        `Xoá file "${f.name}"? Khách và KS sẽ không xem được file này nữa.`,
      )
    )
      return;
    setError("");
    const res = await fetch(f.deleteUrl, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.message || "Không xoá được");
    }
    load();
  };

  const toggleDone = async (key: DesignStepKey, label: string) => {
    const next = !done[key];
    if (
      !window.confirm(
        next
          ? `Chốt bước "${label}"? Sau khi chốt sẽ khoá tải/xoá file của bước này.`
          : `Mở lại bước "${label}" để sửa file?`,
      )
    )
      return;
    setError("");
    const res = await fetch(`/api/projects/${projectId}/design`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: key, done: next }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.message || "Không lưu được");
      return;
    }
    setDone(json.done || {});
    if (next) {
      const after = DESIGN_STEPS.find((s) => !(json.done || {})[s.key]);
      if (after) setSel(after.key);
    }
  };

  const live = expenses.filter((e) => e.status !== "cancelled");
  const paid = live
    .filter((e) => e.status === "paid")
    .reduce((s, e) => s + e.amount, 0);
  const waiting = live
    .filter((e) => e.status !== "paid")
    .reduce((s, e) => s + e.amount, 0);
  const payLabel = DESIGN_STEPS.find((s) => s.key === payStep)?.label || "";

  const dateVn = (iso: string) =>
    new Date(iso).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
    });

  const treeItem = (key: DesignStepKey, label: string, sub: boolean) => {
    const n = files.filter((f) => f.designStep === key).length;
    return (
      <button
        type="button"
        key={key}
        className={`pl-dsnode${sub ? " sub" : ""}${sel === key ? " on" : ""}${done[key] ? " ok" : ""}`}
        onClick={() => setSel(key)}
      >
        <span className="dot">{done[key] ? "✓" : ""}</span>
        <span className="lb">{label}</span>
        <small className="pl-num">
          {done[key] ? dateVn(done[key]) : n ? `${n} file` : ""}
        </small>
      </button>
    );
  };

  const step = DESIGN_STEPS.find((s) => s.key === sel) || null;
  const stepGroup = step
    ? DESIGN_GROUPS.find((g) => g.group === step.group)
    : null;
  const mine = step ? files.filter((f) => f.designStep === step.key) : [];
  const ex = step ? expenses.filter((e) => e.step === step.key) : [];
  const locked = step ? Boolean(done[step.key]) : false;

  return (
    <div className="pl-design">
      <input
        ref={fileRef}
        type="file"
        accept={DOC_ACCEPT}
        multiple
        hidden
        onChange={(e) => upload(e.target.files)}
      />
      {error ? <div className="pl-err">{error}</div> : null}

      <div className="pl-dsgrid">
        <nav className="pl-dstree">
          {DESIGN_GROUPS.map((g) => {
            const steps = DESIGN_STEPS.filter((s) => s.group === g.group);
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
              {stepGroup && stepGroup.group === 3
                ? `${stepGroup.title} · ${step.label}`
                : stepGroup?.title}
            </h3>
            <div className="pl-dsrow">
              <div className="pl-dshead">
                {locked ? (
                  <span className="pl-dsok">
                    ✓ Đã chốt {dateVn(done[step.key])}
                  </span>
                ) : (
                  <span />
                )}
                <div className="pl-dsact">
                  {!locked ? (
                    <button
                      type="button"
                      className="pl-btn ghost"
                      onClick={() => pick(step.key)}
                      disabled={busyStep !== null}
                    >
                      {busyStep === step.key ? "Đang tải…" : "⬆ Tải file"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="pl-btn ghost"
                    onClick={() => setPayStep(step.key)}
                  >
                    + Lệnh chi
                  </button>
                  <button
                    type="button"
                    className={`pl-btn${locked ? " ghost" : ""}`}
                    onClick={() => toggleDone(step.key, step.label)}
                    disabled={!locked && mine.length === 0}
                    title={
                      !locked && mine.length === 0
                        ? "Tải file trước khi chốt"
                        : undefined
                    }
                  >
                    {locked ? "Mở lại" : "✓ Chốt bước"}
                  </button>
                </div>
              </div>
              {mine.length ? (
                <ul className="pl-dsfiles">
                  {mine.map((f) => (
                    <li key={f.id}>
                      <a href={f.viewUrl} target="_blank" rel="noreferrer">
                        {f.isImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={f.thumbUrl} alt="" loading="lazy" />
                        ) : (
                          <span className="pl-dspdf">PDF</span>
                        )}
                        <span className="pl-dsname">{f.name}</span>
                      </a>
                      <small className="pl-num">{mb(f.sizeBytes)}</small>
                      {!locked ? (
                        <button
                          type="button"
                          className="pl-x"
                          title="Xoá file"
                          onClick={() => remove(f)}
                        >
                          ×
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="pl-dsempty">
                  {loaded ? "Chưa có file — khách duyệt xong mới tải lên." : "…"}
                </div>
              )}
              {ex.length ? (
                <table className="pl-dsex">
                  <tbody>
                    {ex.map((e) => (
                      <tr
                        key={e.id}
                        className={e.status === "cancelled" ? "off" : ""}
                      >
                        <td className="pl-num">{e.code}</td>
                        <td>{e.payee || "—"}</td>
                        <td className="pl-num r">{money(e.amount)}</td>
                        <td className={`st ${e.status}`}>
                          {statusText(e.status)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>

      <div className="pl-dstotal">
        Chi phí thiết kế thuê ngoài: đã chi <b className="pl-num">{money(paid)} đ</b>
        {waiting ? (
          <>
            {" "}
            · chờ chi <b className="pl-num">{money(waiting)} đ</b>
          </>
        ) : null}
      </div>

      <ExpenseCreateModal
        open={payStep !== null}
        onClose={() => setPayStep(null)}
        onCreated={() => {
          setPayStep(null);
          load();
        }}
        role="admin"
        lockContext={projectName}
        prefill={
          payStep
            ? {
                projectId,
                categoryCode: "THIETKE",
                note: `Thiết kế ${payLabel.toLowerCase()} – ${projectName}`,
                sourceType: `thiet_ke_${payStep}`,
                sourceId: projectId,
              }
            : undefined
        }
      />
    </div>
  );
}
