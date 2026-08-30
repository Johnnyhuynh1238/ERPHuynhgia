"use client";

// Popup "Lệnh chi mới" dùng CHUNG cho: màn /expenses, popup HĐ thầu phụ (/projects/[id]/cong-no),
// màn thầu phụ (/sub-contracts/[id]). Tách ra 1 nguồn để sửa form lệnh chi 1 chỗ ăn cả 3 nơi.
// Style scope dưới .lc-scope (expenses.css) + render qua portal ra body (thoát transform AppShell).

import "./expenses.css";
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { MoneyInput } from "@/components/money-input";
import { VN_BANKS, findBankByBin } from "@/lib/vn-banks";
import { parseVietQrString } from "@/lib/vietqr";

export type ProjectOption = { id: string; code: string; name: string };
export type CategoryOption = { id: string; code: string; name: string; scope: string | null };
export type DesignContractOption = { id: string; customerName: string; signedAt: string };

export type ExpenseCreatePrefill = Partial<{
  projectId: string;
  designContractId: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  amount: string;
  payee: string;
  payeePhone: string;
  paymentMethod: "cash" | "transfer";
  priority: "normal" | "urgent";
  note: string;
  payeeBankBin: string;
  payeeAccountNumber: string;
  payeeAccountName: string;
  sourceType: string;
  sourceId: string;
  subPaymentId: string;
}>;

type CreatedExpense = { id: string; code: string; status: string; message?: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (r: CreatedExpense) => void;
  role: string;
  prefill?: ExpenseCreatePrefill;
  // Khoá ngữ cảnh "Chi cho" (vd popup HĐ thầu phụ): ẩn dropdown, hiện nhãn cố định.
  lockContext?: string | null;
  // Dữ liệu tham chiếu. lockContext → không cần projects/designContracts.
  projects?: ProjectOption[];
  categories?: CategoryOption[];
  designContracts?: DesignContractOption[];
};

type CreateForm = {
  projectId: string;
  designContractId: string;
  categoryId: string;
  amount: string;
  payee: string;
  payeePhone: string;
  paymentMethod: "cash" | "transfer";
  priority: "normal" | "urgent";
  note: string;
  attachmentUrls: string[];
  payeeBankBin: string;
  payeeAccountNumber: string;
  payeeAccountName: string;
  sourceType: string;
  sourceId: string;
  subPaymentId: string;
};

const emptyCreate: CreateForm = {
  projectId: "",
  designContractId: "",
  categoryId: "",
  amount: "",
  payee: "",
  payeePhone: "",
  paymentMethod: "transfer",
  priority: "normal",
  note: "",
  attachmentUrls: [],
  payeeBankBin: "",
  payeeAccountNumber: "",
  payeeAccountName: "",
  sourceType: "",
  sourceId: "",
  subPaymentId: "",
};

function money(v: number | null | undefined) {
  return `${(v || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} đ`;
}

function formFromPrefill(prefill: ExpenseCreatePrefill | undefined, categories: CategoryOption[]): CreateForm {
  const p = prefill || {};
  let categoryId = p.categoryId || "";
  if (!categoryId && p.categoryCode) categoryId = categories.find((c) => c.code === p.categoryCode)?.id || "";
  if (!categoryId && p.categoryName) categoryId = categories.find((c) => c.name === p.categoryName)?.id || "";
  return {
    ...emptyCreate,
    projectId: p.projectId || "",
    designContractId: p.designContractId || "",
    categoryId,
    amount: p.amount || "",
    payee: p.payee || "",
    payeePhone: p.payeePhone || "",
    paymentMethod: p.paymentMethod || "transfer",
    priority: p.priority || "normal",
    note: p.note || "",
    payeeBankBin: p.payeeBankBin || "",
    payeeAccountNumber: p.payeeAccountNumber || "",
    payeeAccountName: p.payeeAccountName || "",
    sourceType: p.sourceType || "",
    sourceId: p.sourceId || "",
    subPaymentId: p.subPaymentId || "",
  };
}

// Chọn dòng tên chủ TK từ text OCR (chữ HOA ko dấu, VD "LE TIEN SI").
function pickPayeeName(text: string, accountNumber: string): string | null {
  const lines = text
    .split(/\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const isName = (l: string) => /^[A-Z][A-Z .]{2,}$/.test(l) && l.replace(/[ .]/g, "").length >= 3;
  const isNoise = (l: string) => /(BANK|NAPAS|VIETQR|QUET MA|CHUYEN TIEN|SCAN|TRANSFER)/.test(l.toUpperCase());
  // 1) Dòng chữ HOA ngay TRÊN dòng chứa số TK (layout VietQR chuẩn).
  const acc = accountNumber.replace(/\D/g, "");
  const idxAcc = acc ? lines.findIndex((l) => l.replace(/\D/g, "").includes(acc)) : -1;
  if (idxAcc > 0) {
    for (let i = idxAcc - 1; i >= 0; i--) {
      if (isName(lines[i]) && !isNoise(lines[i])) return lines[i];
    }
  }
  // 2) Fallback: dòng HOA dài nhất, loại nhãn NH/logo.
  const cands = lines.filter((l) => isName(l) && !isNoise(l));
  if (cands.length) return cands.sort((a, b) => b.length - a.length)[0];
  return null;
}

// OCR dải chữ quanh mã QR để lấy tên chủ TK (không nằm trong payload QR).
async function ocrPayeeName(
  img: HTMLImageElement,
  qrTopY: number,
  qrBottomY: number,
  accountNumber: string,
): Promise<string | null> {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const qrH = Math.max(0, qrBottomY - qrTopY);
  const up = iw < 900 ? Math.min(3, Math.max(1, Math.round(900 / iw))) : 1;

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/tesseract-core-simd-lstm.wasm.js",
    langPath: "/tesseract",
  });
  try {
    await worker.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .",
      preserve_interword_spaces: "1",
    });
    const readBand = async (top: number, height: number): Promise<string | null> => {
      const t = Math.max(0, Math.round(top));
      const h = Math.min(ih - t, Math.round(height));
      if (h < 20) return null;
      const canvas = document.createElement("canvas");
      canvas.width = iw * up;
      canvas.height = h * up;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, t, iw, h, 0, 0, canvas.width, canvas.height);
      const { data } = await worker.recognize(canvas);
      return pickPayeeName(data.text || "", accountNumber);
    };

    const belowH = qrH > 0 ? Math.round(qrH * 1.2) : Math.round(ih * 0.25);
    const below = await readBand(qrBottomY + 8, belowH);
    if (below) return below;

    if (qrTopY >= 40) {
      const above = await readBand(0, qrTopY);
      if (above) return above;
    }
    return null;
  } finally {
    await worker.terminate();
  }
}

export function ExpenseCreateModal({
  open,
  onClose,
  onCreated,
  role,
  prefill,
  lockContext,
  projects = [],
  categories: categoriesProp,
  designContracts = [],
}: Props) {
  const isKt = role === "accountant";

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [theme, setTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    try {
      const s = window.localStorage.getItem("lc.theme");
      if (s === "light" || s === "dark") setTheme(s);
    } catch {}
  }, []);

  const [categories, setCategories] = useState<CategoryOption[]>(categoriesProp ?? []);
  useEffect(() => {
    if (categoriesProp && categoriesProp.length) setCategories(categoriesProp);
  }, [categoriesProp]);
  // Tự nạp danh mục nếu không được truyền (vd dùng trong popup thầu phụ).
  useEffect(() => {
    if (!open || categories.length) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/expense-categories", { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (alive && res.ok) setCategories(j.rows || []);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [open, categories.length]);

  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/treasury/summary", { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (alive && res.ok) setBalance(Number(j.currentBalance ?? 0));
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  const [form, setForm] = useState<CreateForm>(emptyCreate);
  const [creating, setCreating] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const qrInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  // Mở popup → nạp form từ prefill (reset mỗi lần mở).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setForm(formFromPrefill(prefill, categories));
    }
    wasOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Danh mục prefill theo code/name có thể chưa sẵn lúc mở (đang fetch) → resolve khi có.
  useEffect(() => {
    if (!open || form.categoryId || !categories.length) return;
    const code = prefill?.categoryCode;
    const name = prefill?.categoryName;
    if (!code && !name) return;
    const id = (code && categories.find((c) => c.code === code)?.id) || (name && categories.find((c) => c.name === name)?.id) || "";
    if (id) setForm((f) => (f.categoryId ? f : { ...f, categoryId: id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, categories, form.categoryId]);

  const balanceAfterForm = useMemo(() => {
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || balance == null) return null;
    return balance - amt;
  }, [form.amount, balance]);

  const chiScope: "project" | "company" = form.projectId || form.designContractId ? "project" : "company";
  const visibleCategories = useMemo(() => {
    const inScope = categories.filter((c) => c.scope === chiScope);
    const sel = categories.find((c) => c.id === form.categoryId);
    if (sel && !inScope.some((c) => c.id === sel.id)) return [sel, ...inScope];
    return inScope;
  }, [categories, chiScope, form.categoryId]);

  async function uploadOne(file: File): Promise<string | null> {
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast.error(`${file.name}: Chỉ hỗ trợ ảnh hoặc PDF`);
      return null;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error(`${file.name}: File quá lớn (tối đa 8MB)`);
      return null;
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", "attachment");
    const res = await fetch("/api/expenses/upload-receipt", { method: "POST", body: fd });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j.message || `${file.name}: Upload thất bại`);
      return null;
    }
    return j.url as string;
  }

  async function uploadAttachments(files: FileList | File[]) {
    const arr = Array.from(files);
    if (!arr.length) return;
    const remaining = 20 - form.attachmentUrls.length;
    if (remaining <= 0) {
      toast.error("Đã đính kèm tối đa 20 ảnh");
      return;
    }
    const slice = arr.slice(0, remaining);
    if (slice.length < arr.length) {
      toast.warning(`Chỉ thêm ${slice.length}/${arr.length} ảnh (giới hạn 20)`);
    }
    setUploadingAttachment(true);
    try {
      const results = await Promise.all(slice.map(uploadOne));
      const urls = results.filter((u): u is string => !!u);
      if (urls.length) {
        setForm((f) => ({ ...f, attachmentUrls: [...f.attachmentUrls, ...urls] }));
        toast.success(`Đã tải ${urls.length} ảnh hoá đơn`);
      }
    } finally {
      setUploadingAttachment(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    }
  }

  function removeAttachment(index: number) {
    setForm((f) => ({ ...f, attachmentUrls: f.attachmentUrls.filter((_, i) => i !== index) }));
  }

  async function decodeQrFile(file: File) {
    setDecoding(true);
    try {
      if (!file.type.startsWith("image/")) {
        toast.error("File không phải ảnh. Chọn JPG/PNG nhé");
        return;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error("Không decode được ảnh — có thể format HEIC, chuyển JPG nhé"));
        im.src = dataUrl;
      });

      const { readBarcodesFromImageData, prepareZXingModule } = await import("zxing-wasm/reader");
      prepareZXingModule({
        overrides: {
          locateFile: (path: string, prefix: string) =>
            path.endsWith(".wasm") ? "/zxing/zxing_reader.wasm" : prefix + path,
        },
      });

      const cap = 2600;
      const drawScale = Math.min(1, cap / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(64, Math.round(img.naturalWidth * drawScale));
      const h = Math.max(64, Math.round(img.naturalHeight * drawScale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        toast.error("Trình duyệt không hỗ trợ canvas");
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);

      const results = await readBarcodesFromImageData(imageData, {
        formats: ["QRCode"],
        tryHarder: true,
        tryInvert: true,
        maxNumberOfSymbols: 1,
      });
      const found = results.find((r) => r.isValid && r.text);
      if (!found) {
        toast.error(`Không đọc được QR (${img.naturalWidth}x${img.naturalHeight}). Thử ảnh rõ hơn hoặc screenshot nhé`);
        return;
      }
      const topYScaled = Math.min(found.position.topLeft.y, found.position.topRight.y);
      const botYScaled = Math.max(found.position.bottomLeft.y, found.position.bottomRight.y);
      const hit = {
        data: found.text,
        topY: Math.round(topYScaled / drawScale),
        bottomY: Math.round(botYScaled / drawScale),
      };

      const parsed = parseVietQrString(hit.data);
      if (!parsed) {
        toast.error("QR đọc được nhưng không phải chuẩn VietQR. Nhập tay STK nhé");
        return;
      }
      const bank = findBankByBin(parsed.bankBin);
      setForm((f) => ({
        ...f,
        payeeBankBin: parsed.bankBin,
        payeeAccountNumber: parsed.accountNumber,
        amount: parsed.amount && parsed.amount > 0 ? String(parsed.amount) : f.amount,
      }));
      toast.success(`Đã đọc QR: ${bank?.shortName ?? parsed.bankBin} · ${parsed.accountNumber}`);

      ocrPayeeName(img, hit.topY, hit.bottomY, parsed.accountNumber)
        .then((name) => {
          if (name) {
            setForm((f) => (f.payeeAccountName.trim() ? f : { ...f, payeeAccountName: name }));
            toast.success(`Đọc tên: ${name}`);
          }
        })
        .catch((e) => console.warn("OCR tên TK lỗi", e));
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Lỗi đọc QR");
    } finally {
      setDecoding(false);
      if (qrInputRef.current) qrInputRef.current.value = "";
    }
  }

  function close() {
    onClose();
    setForm(emptyCreate);
  }

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.categoryId) {
      toast.error("Chọn danh mục");
      return;
    }
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Nhập số tiền > 0");
      return;
    }
    if (!form.payeePhone.trim()) {
      toast.error("Nhập SĐT người nhận");
      return;
    }
    if ((form.payeeBankBin && !form.payeeAccountNumber.trim()) || (!form.payeeBankBin && form.payeeAccountNumber.trim())) {
      toast.error("Chọn ngân hàng và nhập STK hoặc bỏ trống cả 2");
      return;
    }
    setCreating(true);
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: form.projectId || null,
        designContractId: form.designContractId || null,
        categoryId: form.categoryId,
        amount: amt,
        payee: form.payee.trim() || null,
        payeePhone: form.payeePhone.trim() || null,
        paymentMethod: form.paymentMethod,
        priority: form.priority,
        note: form.note.trim() || null,
        attachmentUrls: form.attachmentUrls,
        payeeBankBin: form.payeeBankBin || null,
        payeeAccountNumber: form.payeeAccountNumber.trim() || null,
        payeeAccountName: form.payeeAccountName.trim() || null,
        sourceType: form.sourceType || null,
        sourceId: form.sourceId || null,
        subPaymentId: form.subPaymentId || null,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { message?: string; expense?: CreatedExpense };
    setCreating(false);
    if (!res.ok) {
      toast.error(j.message || "Không tạo được lệnh chi");
      return;
    }
    toast.success(j.message || "Đã tạo lệnh chi");
    onCreated?.({
      id: j.expense?.id || "",
      code: j.expense?.code || "",
      status: j.expense?.status || "",
      message: j.message,
    });
    close();
  }

  if (!open || !mounted) return null;

  const node: ReactNode = (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && close()}>
      <form className="sheet" onSubmit={submitCreate}>
        <div className="sheet-hd">
          <div>
            <h3 className="orange">+ Lệnh chi mới</h3>
            <div className="sub">
              Số dư quỹ: {balance == null ? "…" : money(balance)}
              {balanceAfterForm != null && Number(form.amount) > 0
                ? ` → sau chi: ${money(balanceAfterForm)}${balanceAfterForm < 0 ? " ⚠" : ""}`
                : ""}
            </div>
          </div>
          <button className="iconbtn" type="button" onClick={close} title="Đóng">
            ✕
          </button>
        </div>

        <div className="formgrid" style={{ marginBottom: 12 }}>
          {lockContext ? (
            <label className="fld" style={{ marginBottom: 0 }}>
              <span className="lbl">Chi cho hợp đồng</span>
              <input className="ctrl" value={lockContext} disabled readOnly />
            </label>
          ) : (
            <label className="fld" style={{ marginBottom: 0 }}>
              <span className="lbl">Chi cho hợp đồng</span>
              <select
                className="ctrl"
                value={form.projectId ? `p:${form.projectId}` : form.designContractId ? `d:${form.designContractId}` : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  const newScope: "project" | "company" = v.startsWith("p:") || v.startsWith("d:") ? "project" : "company";
                  const selCat = categories.find((c) => c.id === form.categoryId);
                  const keepCat = selCat && selCat.scope === newScope ? form.categoryId : "";
                  if (v.startsWith("p:")) setForm({ ...form, projectId: v.slice(2), designContractId: "", categoryId: keepCat });
                  else if (v.startsWith("d:")) setForm({ ...form, projectId: "", designContractId: v.slice(2), categoryId: keepCat });
                  else setForm({ ...form, projectId: "", designContractId: "", categoryId: keepCat });
                }}
              >
                <option value="">Chi chung công ty</option>
                <optgroup label="HĐ thi công">
                  {projects.map((p) => (
                    <option key={p.id} value={`p:${p.id}`}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="HĐ thiết kế">
                  {designContracts.map((c) => (
                    <option key={c.id} value={`d:${c.id}`}>
                      TK {c.signedAt} — {c.customerName}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
          )}
          <label className="fld" style={{ marginBottom: 0 }}>
            <span className="lbl">
              Danh mục <span className="req">*</span>
            </span>
            <select className="ctrl" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
              <option value="">— Chọn —</option>
              {visibleCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="fld" style={{ marginBottom: 0 }}>
            <span className="lbl">
              Số tiền <span className="req">*</span>
            </span>
            <div className="money-wrap">
              <MoneyInput value={form.amount} onChange={(raw) => setForm({ ...form, amount: raw })} required className="ctrl num" />
              <span className="cur">đ</span>
            </div>
          </label>
          <label className="fld" style={{ marginBottom: 0 }}>
            <span className="lbl">Người/đơn vị nhận</span>
            <input className="ctrl" value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} placeholder="VD: Cửa hàng VLXD Minh Anh" />
          </label>
          <label className="fld" style={{ marginBottom: 0 }}>
            <span className="lbl">
              SĐT người nhận <span className="req">*</span>
            </span>
            <input
              className="ctrl"
              type="tel"
              inputMode="tel"
              value={form.payeePhone}
              onChange={(e) => setForm({ ...form, payeePhone: e.target.value.replace(/[^0-9+ ]/g, "") })}
              placeholder="VD: 0912 345 678"
              required
            />
          </label>
          <label className="fld" style={{ marginBottom: 0 }}>
            <span className="lbl">Phương thức</span>
            <select
              className="ctrl"
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as "cash" | "transfer" })}
            >
              <option value="transfer">Chuyển khoản</option>
              <option value="cash">Tiền mặt</option>
            </select>
          </label>
        </div>

        {/* Ảnh hoá đơn */}
        <div className="fld">
          <span className="lbl">Ảnh hoá đơn / báo giá {form.attachmentUrls.length > 0 && `(${form.attachmentUrls.length}/20)`}</span>
          <input
            ref={attachmentInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) uploadAttachments(e.target.files);
            }}
          />
          <button
            type="button"
            className="attach"
            onClick={() => attachmentInputRef.current?.click()}
            disabled={uploadingAttachment || form.attachmentUrls.length >= 20}
          >
            {uploadingAttachment ? "Đang tải…" : form.attachmentUrls.length ? "📎 Thêm ảnh hoá đơn" : "📷 Kéo thả / bấm chọn ảnh hoá đơn"}
          </button>
          {form.attachmentUrls.length > 0 && (
            <div className="thumbs">
              {form.attachmentUrls.map((url, i) => {
                const isPdf = url.toLowerCase().endsWith(".pdf");
                const previewSrc = url.startsWith("minio://") ? `/api/expenses/upload-preview?url=${encodeURIComponent(url)}` : url;
                return (
                  <div key={`${url}-${i}`} className="thumb">
                    {isPdf ? (
                      <div className="pdf">📄 PDF</div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewSrc} alt={`bill-${i + 1}`} />
                    )}
                    <button type="button" className="rm" onClick={() => removeAttachment(i)} title="Xoá ảnh">
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tài khoản nhận (admin nhập cho KT chuyển) */}
        {!isKt && (
          <div className="fld">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span className="lbl">Tài khoản nhận (để KT bấm “Chuyển khoản”)</span>
              <input
                ref={qrInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) decodeQrFile(f);
                }}
              />
              <button type="button" className="actbtn a-link" onClick={() => qrInputRef.current?.click()} disabled={decoding}>
                {decoding ? "Đang đọc QR…" : "📷 Tải ảnh QR"}
              </button>
            </div>
            <div className="formgrid">
              <label className="fld" style={{ marginBottom: 0 }}>
                <span className="lbl">Ngân hàng</span>
                <select className="ctrl" value={form.payeeBankBin} onChange={(e) => setForm({ ...form, payeeBankBin: e.target.value })}>
                  <option value="">— Chọn ngân hàng —</option>
                  {VN_BANKS.map((b) => (
                    <option key={b.bin} value={b.bin}>
                      {b.shortName} ({b.name})
                    </option>
                  ))}
                </select>
              </label>
              <label className="fld" style={{ marginBottom: 0 }}>
                <span className="lbl">Số tài khoản</span>
                <input
                  className="ctrl"
                  value={form.payeeAccountNumber}
                  onChange={(e) => setForm({ ...form, payeeAccountNumber: e.target.value.replace(/[^0-9A-Za-z]/g, "") })}
                  placeholder="VD: 0123456789"
                />
              </label>
              <label className="fld full" style={{ marginBottom: 0 }}>
                <span className="lbl">Tên chủ TK</span>
                <input
                  className="ctrl"
                  value={form.payeeAccountName}
                  onChange={(e) => setForm({ ...form, payeeAccountName: e.target.value })}
                  placeholder="Hiện trên QR (tuỳ chọn)"
                />
              </label>
            </div>
            {form.payeeBankBin && form.payeeAccountNumber && (
              <div className="ok-line">✓ KT sẽ thấy nút “Chuyển khoản” mở thẳng app ngân hàng</div>
            )}
          </div>
        )}

        {/* Độ khẩn */}
        {!isKt && (
          <div className="fld">
            <span className="lbl">Độ khẩn</span>
            <div className="seg">
              <button type="button" className={form.priority === "normal" ? "on" : ""} onClick={() => setForm({ ...form, priority: "normal" })}>
                Thường (nhắc 15ph/lần)
              </button>
              <button
                type="button"
                className={form.priority === "urgent" ? "on urgent" : ""}
                onClick={() => setForm({ ...form, priority: "urgent" })}
              >
                🚨 Gấp (nhắc 1ph/lần)
              </button>
            </div>
          </div>
        )}

        <label className="fld">
          <span className="lbl">Ghi chú</span>
          <textarea
            className="ctrl"
            rows={2}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Nội dung chi (vd: mua mực in cho VP, xăng xe đi công trình…)"
          />
        </label>

        {isKt && <div className="kt-note">Lệnh chi do KT tạo sẽ chờ admin duyệt trước khi thanh toán.</div>}

        <div className="acts">
          <button className="btn ghost" type="button" onClick={close}>
            Huỷ
          </button>
          <button className="btn primary block" type="submit" disabled={creating}>
            {creating ? "Đang tạo…" : isKt ? "Gửi admin duyệt" : "Gửi KT thanh toán"}
          </button>
        </div>
      </form>
    </div>
  );

  return createPortal(<div className="lc-scope" data-theme={theme}>{node}</div>, document.body);
}
