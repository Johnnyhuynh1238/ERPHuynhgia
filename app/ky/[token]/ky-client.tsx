"use client";

import { useEffect, useRef, useState } from "react";
import type { EsignItem, EsignView } from "@/lib/acceptance-esign";
import { KY_CSS } from "./styles";

const MAX_PHOTOS = 12;

/** Nén ảnh điện thoại: cạnh dài ≤1600px, JPEG 0.8 (giống /nv). */
async function compress(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.8));
    return blob || file;
  } catch {
    return file;
  }
}

const today = () => {
  const d = new Date(Date.now() + 7 * 3600_000);
  return d.toISOString().slice(0, 10);
};
const fmtTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "";
const fmtDay = (s: string) => (s ? s.split("-").reverse().join("/") : "");

// ───────────────────────── ô ký (khung lớn) ─────────────────────────

/** Ô ký to: vẽ bằng ngón tay, xuất PNG đã cắt sát nét ký (để in vừa ô chữ ký trên tờ A4). */
function SigPad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current!;
    const fit = () => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      const ctx = c.getContext("2d")!;
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = "#1a2a6c";
      setEmpty(true);
      onChange(null);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const exportPng = () => {
    // Cắt sát nét ký + lề, thu về cạnh dài ≤600px để file nhỏ.
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let x0 = width,
      y0 = height,
      x1 = -1,
      y1 = -1;
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        if (data[(y * width + x) * 4 + 3] > 0) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return onChange(null);
    const pad = Math.round(14 * (window.devicePixelRatio || 1));
    x0 = Math.max(0, x0 - pad);
    y0 = Math.max(0, y0 - pad);
    x1 = Math.min(width, x1 + pad);
    y1 = Math.min(height, y1 + pad);
    const w = x1 - x0;
    const h = y1 - y0;
    const sc = Math.min(1, 600 / Math.max(w, h));
    const o = document.createElement("canvas");
    o.width = Math.max(1, Math.round(w * sc));
    o.height = Math.max(1, Math.round(h * sc));
    o.getContext("2d")!.drawImage(c, x0, y0, w, h, 0, 0, o.width, o.height);
    onChange(o.toDataURL("image/png"));
  };
  return (
    <div>
      <div className="ky-pad">
        <canvas
          ref={ref}
          onPointerDown={(e) => {
            e.preventDefault();
            ref.current!.setPointerCapture(e.pointerId);
            drawing.current = true;
            last.current = pos(e);
            const ctx = ref.current!.getContext("2d")!;
            ctx.beginPath();
            ctx.arc(last.current.x, last.current.y, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = "#1a2a6c";
            ctx.fill();
          }}
          onPointerMove={(e) => {
            if (!drawing.current || !last.current) return;
            const p = pos(e);
            const ctx = ref.current!.getContext("2d")!;
            ctx.beginPath();
            ctx.moveTo(last.current.x, last.current.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            last.current = p;
            if (empty) setEmpty(false);
          }}
          onPointerUp={() => {
            if (!drawing.current) return;
            drawing.current = false;
            last.current = null;
            setEmpty(false);
            exportPng();
          }}
          onPointerCancel={() => {
            drawing.current = false;
          }}
        />
        <div className="ky-pad-line" />
        {empty && <div className="ky-pad-hint">Ký bằng ngón tay vào khung này</div>}
      </div>
      <button
        type="button"
        className="ky-pad-clear"
        onClick={() => {
          const c = ref.current!;
          c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
          setEmpty(true);
          onChange(null);
        }}
      >
        ↺ Xoá ký lại
      </button>
    </div>
  );
}

/** Khung toàn màn hình (chọn kết quả, ý kiến, ảnh, ký). */
function Sheet({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="ky-modal">
      <div className="ky-wrap">
        <button className="ky-x" onClick={onClose}>
          ← Quay lại biên bản
        </button>
        {sub && <div className="ky-eyebrow">{sub}</div>}
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

// ───────────────────────── tờ biên bản A4 ─────────────────────────

const PAPER_W = 794; // A4 ở 96dpi
const COMPANY = "CÔNG TY TNHH KIẾN TRÚC XÂY DỰNG VÀ NỘI THẤT HUỲNH GIA";
const COMPANY_SUB = "2157 QL51, xã Phước Thái, Đồng Nai · ĐT 0931 316 513";

/** Thu tờ A4 vừa bề ngang màn hình; người xem vuốt 2 ngón để phóng to. */
function useFitZoom() {
  const [z, setZ] = useState<number | null>(null);
  useEffect(() => {
    const fit = () => setZ(Math.min(1, (document.documentElement.clientWidth - 16) / PAPER_W));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return z;
}

type SigInfo = { name: string | null; img: string | null; at: string | null };
type PaperProps = {
  v: EsignView;
  items: Record<string, EsignItem>;
  note: string;
  photos: { key: string; url: string }[];
  ks: SigInfo;
  party: SigInfo;
  partyNote?: string | null;
  /** Có = chế độ điền (KS): các ô vàng bấm được. */
  onCt?: (no: number) => void;
  onNote?: () => void;
  onPhotos?: () => void;
  onKsSign?: () => void;
  onPartySign?: () => void;
};

function SigCell({ label, s, onClick, hint }: { label: string; s: SigInfo; onClick?: () => void; hint: string }) {
  const empty = !s.img;
  return (
    <div className="pp-sig">
      <div className="pp-sig-l">{label}</div>
      <div
        className={`pp-sig-box${onClick ? " pp-fill" : ""}${onClick && empty ? " pp-sig-cta" : ""}`}
        onClick={onClick}
        role={onClick ? "button" : undefined}
      >
        {s.img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.img} alt="" />
        ) : onClick ? (
          <span>✍ {hint}</span>
        ) : (
          <span className="pp-mute">(chưa ký)</span>
        )}
      </div>
      <div className="pp-sig-n">{s.name ?? ""}</div>
      <div className="pp-sig-t">{s.at ? `Ký điện tử lúc ${fmtTime(s.at)}` : s.img ? "Ký khi gửi biên bản" : ""}</div>
    </div>
  );
}

function Paper(p: PaperProps) {
  const z = useFitZoom();
  const { v } = p;
  const c = v.content;
  const editing = !!p.onCt;
  const zoom = { zoom: z ?? 1, visibility: z ? "visible" : "hidden" } as React.CSSProperties;
  return (
    <div className="pp-stack">
      <div className="ky-paper" style={zoom}>
        <div className="pp-co">{COMPANY}</div>
        <div className="pp-co-sub">{COMPANY_SUB}</div>
        <div className="pp-qh">CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
        <div className="pp-qh2">Độc lập – Tự do – Hạnh phúc</div>
        <div className="pp-title">
          {v.kind === "thau_phu" ? "BIÊN BẢN NGHIỆM THU KHỐI LƯỢNG – ĐỘI KHOÁN" : "BIÊN BẢN NGHIỆM THU CÔNG VIỆC"}
        </div>
        <div className="pp-title2">{c.title}</div>

        <div className="pp-kv">
          <b>Công trình:</b> {c.projectName} ({c.projectCode})
        </div>
        <div className="pp-kv">
          <b>Địa chỉ:</b> {c.address || "—"}
        </div>
        {c.group && (
          <div className="pp-kv">
            <b>Hạng mục:</b> {c.group}
          </div>
        )}
        {c.time && (
          <div className="pp-kv">
            <b>Thời điểm nghiệm thu:</b> {c.time}
          </div>
        )}
        <div className="pp-kv">
          <b>Kỹ sư giám sát (Huỳnh Gia):</b> {p.ks.name ?? "—"}
        </div>
        <div className="pp-kv">
          <b>{c.partyLabel}:</b> {p.party.name ?? "—"}
        </div>
        {c.contractCode && (
          <div className="pp-kv">
            <b>Hợp đồng khoán:</b> {c.contractCode}
          </div>
        )}
        <hr />

        {c.cts.map((ct, i) => {
          const it = p.items[String(ct.no)];
          const filled = it && (it.kq === "dat" || it.kq === "khong_ad");
          return (
            <div className="pp-ct" key={ct.no}>
              <div className="pp-ct-h">
                {i + 1}. {ct.no ? `CT${ct.no} · ` : ""}
                {ct.name}
              </div>
              <div className="pp-ind pp-mute pp-sm">Mức kiểm soát: {ct.lv}</div>
              {ct.tc.length > 0 && (
                <>
                  <div className="pp-ind pp-b">Tiêu chuẩn đạt:</div>
                  <ul>
                    {ct.tc.map((t, j) => (
                      <li key={j}>{t}</li>
                    ))}
                  </ul>
                </>
              )}
              {ct.ck.length > 0 && (
                <>
                  <div className="pp-ind pp-b">Cách kiểm tra:</div>
                  <ul>
                    {ct.ck.map((t, j) => (
                      <li key={j}>{t}</li>
                    ))}
                  </ul>
                </>
              )}
              <div
                className={`pp-ind pp-kq${editing ? " pp-fill" : ""}${editing && !filled ? " pp-todo" : ""}`}
                onClick={editing ? () => p.onCt!(ct.no) : undefined}
                role={editing ? "button" : undefined}
              >
                {filled ? (
                  <>
                    <span className={it.kq === "dat" ? "pp-ok" : "pp-no"}>
                      Kết quả: {it.kq === "dat" ? "ĐẠT" : "KHÔNG ĐẠT – phải sửa"}
                      {it.ngay ? ` · ngày ${fmtDay(it.ngay)}` : ""}
                    </span>
                    {it.note && <div className="pp-note">Ghi chú: {it.note}</div>}
                  </>
                ) : editing ? (
                  <span>Kết quả: ☐ Đạt  ☐ Không đạt — bấm vào đây để chọn</span>
                ) : (
                  <span className="pp-mute">Kết quả: —</span>
                )}
              </div>
            </div>
          );
        })}

        {(p.note || editing) && (
          <>
            <hr />
            <div className="pp-b">Ý kiến kỹ sư giám sát:</div>
            <div
              className={`pp-pre${editing ? " pp-fill" : ""}`}
              onClick={editing ? p.onNote : undefined}
              role={editing ? "button" : undefined}
            >
              {p.note || (editing ? "Bấm để ghi ý kiến (nếu có)" : "")}
            </div>
          </>
        )}
        {p.partyNote && v.kind === "chu_nha" && (
          <>
            <div className="pp-b" style={{ marginTop: 8 }}>
              Ý kiến {c.partyLabel.toLowerCase()}:
            </div>
            <div className="pp-pre">{p.partyNote}</div>
          </>
        )}

        <hr />
        <div className="pp-sigs">
          {v.kind === "chu_nha" ? (
            <SigCell label={c.partyLabel.toUpperCase()} s={p.party} onClick={p.onPartySign} hint="Bấm vào đây để ký" />
          ) : (
            <div className="pp-sig pp-sig-doi">
              <b>
                {c.partyLabel}: {p.party.name ?? ""}
              </b>
              <div className="pp-mute pp-sm">(nhận bản PDF qua Zalo)</div>
            </div>
          )}
          <SigCell label="KỸ SƯ GIÁM SÁT" s={p.ks} onClick={p.onKsSign} hint="Bấm vào đây để ký" />
        </div>
        <div className="pp-foot">Ký điện tử trên ERP Huỳnh Gia</div>
      </div>

      {(p.photos.length > 0 || editing) && (
        <div className={`ky-paper${p.photos.length ? "" : " pp-short"}`} style={zoom}>
          <div className="pp-title2" style={{ textAlign: "left", marginTop: 0 }}>
            ẢNH NGHIỆM THU
          </div>
          {p.photos.length > 0 ? (
            <div className="pp-photos" onClick={editing ? p.onPhotos : undefined}>
              {p.photos.map((ph) =>
                editing ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={ph.key} src={ph.url} alt="" />
                ) : (
                  <a key={ph.key} href={ph.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ph.url} alt="" loading="lazy" />
                  </a>
                ),
              )}
            </div>
          ) : null}
          {editing && (
            <div className="pp-fill pp-addph" onClick={p.onPhotos} role="button">
              📷 Bấm để {p.photos.length ? "thêm / bớt" : "chụp / chọn"} ảnh nghiệm thu ({p.photos.length}/{MAX_PHOTOS})
            </div>
          )}
          <div className="pp-foot">Ký điện tử trên ERP Huỳnh Gia</div>
        </div>
      )}
    </div>
  );
}

function PdfButton({ v, demo }: { v: EsignView; demo?: boolean }) {
  if (demo) return <div className="ky-note">(Bản xem thử — bản thật có nút Tải PDF ở đây)</div>;
  if (!v.hasPdf) return null;
  return (
    <a className="ky-btn ok ky-a" href={`/ky/${v.token}/pdf`} target="_blank" rel="noreferrer">
      📄 Tải biên bản PDF
    </a>
  );
}

const ksSigOf = (v: EsignView): SigInfo => ({ name: v.ksName, img: v.ksSignature, at: v.ksSignedAt });
const partySigOf = (v: EsignView): SigInfo => ({ name: v.partyName, img: v.partySignature, at: v.partySignedAt });

// ───────────────────────── KS điền + ký ─────────────────────────

type NewPhoto = { blob: Blob; url: string };

function KsForm({ v, demo }: { v: EsignView; demo?: boolean }) {
  const cts = v.content.cts;
  const [items, setItems] = useState<Record<string, EsignItem>>(() => {
    const src = v.ksData.items ?? {};
    return Object.fromEntries(cts.map((ct) => [String(ct.no), src[String(ct.no)] ?? { kq: "" as never, ngay: today(), note: "" }]));
  });
  const [note, setNote] = useState(v.ksData.note ?? "");
  const [keep, setKeep] = useState(v.photoUrls);
  const [photos, setPhotos] = useState<NewPhoto[]>([]);
  const [sig, setSig] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"" | "note" | "photos" | "sign" | number>("");
  const [draftSig, setDraftSig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");

  const set = (no: number, patch: Partial<EsignItem>) =>
    setItems((s) => ({ ...s, [String(no)]: { ...s[String(no)], ...patch } }));

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const room = MAX_PHOTOS - keep.length - photos.length;
    const list = Array.from(files).slice(0, Math.max(0, room));
    const out: NewPhoto[] = [];
    for (const f of list) {
      const blob = await compress(f);
      out.push({ blob, url: URL.createObjectURL(blob) });
    }
    setPhotos((p) => [...p, ...out]);
  };

  const filled = cts.filter((ct) => {
    const k = items[String(ct.no)].kq;
    return k === "dat" || k === "khong_ad";
  }).length;
  const who = v.kind === "thau_phu" ? "gửi PDF cho đội khoán" : "gửi khách ký";

  const submit = async () => {
    setErr("");
    for (const ct of cts) {
      const it = items[String(ct.no)];
      if (it.kq !== "dat" && it.kq !== "khong_ad") {
        setSheet(ct.no);
        return;
      }
      if (it.kq === "dat" && !it.ngay) {
        setSheet(ct.no);
        return;
      }
    }
    if (!sig) {
      setDraftSig(null);
      setSheet("sign");
      return;
    }
    const bad = cts.some((ct) => items[String(ct.no)].kq === "khong_ad");
    if (!window.confirm(bad ? `Có công tác KHÔNG ĐẠT. Anh vẫn ký và ${who}?` : `Ký biên bản và ${who}?`)) return;
    if (demo) return setDone(`Bản xem thử: bấm thật sẽ ký xong và ${who}.`);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("data", JSON.stringify({ items, note, keepPhotos: keep.map((p) => p.key), signature: sig }));
      photos.forEach((p, i) => fd.append("photo", p.blob, `anh-${i + 1}.jpg`));
      const r = await fetch(`/ky/${v.token}/submit`, { method: "POST", body: fd });
      const j = await r.json().catch(() => ({ ok: false, message: "Máy chủ không trả lời." }));
      if (!j.ok) setErr(j.message || "Không gửi được.");
      else setDone(j.message);
    } catch {
      setErr("Mất mạng, anh bấm lại.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="ky-wrap">
        <div className="ky-banner ok">✓ {done}</div>
        <button className="ky-btn" onClick={() => location.reload()}>
          Xem lại biên bản
        </button>
      </div>
    );
  }

  const ct = typeof sheet === "number" ? cts.find((x) => x.no === sheet) : null;
  const it = ct ? items[String(ct.no)] : null;
  const allPhotos = [...keep, ...photos.map((p) => ({ key: p.url, url: p.url }))];

  return (
    <>
      <div className="ky-top">
        {v.partyNote ? (
          <div className="ky-banner warn">
            ↩ {v.content.partyLabel} chưa đồng ý, ý kiến:
            <small>{v.partyNote}</small>
            <small>Anh sửa theo ý kiến rồi ký lại, máy gửi lại khách.</small>
          </div>
        ) : (
          <div className="ky-banner off">
            Anh bấm vào các <span className="ky-hl">ô vàng</span> trên biên bản để điền kết quả, ý kiến, ảnh, rồi bấm ô chữ ký để ký.
          </div>
        )}
      </div>
      <Paper
        v={v}
        items={items}
        note={note}
        photos={allPhotos}
        ks={{ name: v.ksName, img: sig, at: null }}
        party={{ name: v.partyName, img: null, at: null }}
        onCt={(no) => setSheet(no)}
        onNote={() => setSheet("note")}
        onPhotos={() => setSheet("photos")}
        onKsSign={() => (setDraftSig(null), setSheet("sign"))}
      />
      <div className="ky-bar">
        <div className="in one">
          {err && <div className="ky-err" style={{ marginTop: 0, marginBottom: 8 }}>{err}</div>}
          <div className="ky-prog">
            Đã điền {filled}/{cts.length} công tác · {sig ? "đã ký" : "chưa ký"}
          </div>
          <button className="ky-btn" disabled={busy} onClick={submit}>
            {busy ? "Đang gửi…" : v.kind === "thau_phu" ? "✍ Ký + gửi PDF cho đội khoán" : "✍ Ký xong · gửi khách ký"}
          </button>
        </div>
      </div>

      {ct && it && (
        <Sheet title={`${ct.no ? `CT${ct.no} · ` : ""}${ct.name}`} sub="Kết quả kiểm tra" onClose={() => setSheet("")}>
          <div className="ky-kq">
            <button type="button" className={it.kq === "dat" ? "on-dat" : ""} onClick={() => set(ct.no, { kq: "dat" })}>
              ✓ Đạt
            </button>
            <button type="button" className={it.kq === "khong_ad" ? "on-khong" : ""} onClick={() => set(ct.no, { kq: "khong_ad" })}>
              ✗ Không đạt
            </button>
          </div>
          {it.kq === "dat" && (
            <>
              <label className="ky-lbl">Ngày đạt</label>
              <input className="ky-in" type="date" value={it.ngay} onChange={(e) => set(ct.no, { ngay: e.target.value })} />
            </>
          )}
          <label className="ky-lbl">{it.kq === "khong_ad" ? "Chỗ chưa đạt, cần sửa gì" : "Ghi chú (nếu có)"}</label>
          <textarea className="ky-ta" value={it.note} onChange={(e) => set(ct.no, { note: e.target.value })} />
          <button
            className="ky-btn"
            disabled={it.kq !== "dat" && it.kq !== "khong_ad"}
            onClick={() => {
              const next = cts.find((x) => {
                const k = items[String(x.no)].kq;
                return x.no !== ct.no && k !== "dat" && k !== "khong_ad";
              });
              setSheet(next ? next.no : "");
            }}
          >
            {cts.some((x) => x.no !== ct.no && items[String(x.no)].kq !== "dat" && items[String(x.no)].kq !== "khong_ad")
              ? "Xong · sang công tác tiếp"
              : "Xong"}
          </button>
        </Sheet>
      )}

      {sheet === "note" && (
        <Sheet title="Ý kiến kỹ sư giám sát" onClose={() => setSheet("")}>
          <textarea
            className="ky-ta"
            style={{ minHeight: 160 }}
            placeholder="Vd: thép, cốp pha đúng bản vẽ; đã đổ bê tông lót…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button className="ky-btn" onClick={() => setSheet("")}>
            Xong
          </button>
        </Sheet>
      )}

      {sheet === "photos" && (
        <Sheet title={`Ảnh nghiệm thu (${keep.length + photos.length}/${MAX_PHOTOS})`} onClose={() => setSheet("")}>
          <div className="ky-photos">
            {keep.map((p) => (
              <div className="ky-photo" key={p.key}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" />
                <button type="button" onClick={() => setKeep((k) => k.filter((x) => x.key !== p.key))}>
                  ×
                </button>
              </div>
            ))}
            {photos.map((p, i) => (
              <div className="ky-photo" key={p.url}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" />
                <button type="button" onClick={() => setPhotos((s) => s.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
            ))}
            {keep.length + photos.length < MAX_PHOTOS && (
              <label className="ky-add">
                + Chụp / chọn ảnh
                <input type="file" accept="image/*" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
              </label>
            )}
          </div>
          <button className="ky-btn" onClick={() => setSheet("")}>
            Xong
          </button>
        </Sheet>
      )}

      {sheet === "sign" && (
        <Sheet title={v.ksName ?? "Kỹ sư giám sát"} sub="Chữ ký kỹ sư giám sát" onClose={() => setSheet("")}>
          <SigPad onChange={setDraftSig} />
          <button
            className="ky-btn"
            disabled={!draftSig}
            onClick={() => {
              setSig(draftSig);
              setSheet("");
            }}
          >
            Đặt chữ ký vào biên bản
          </button>
          <div className="ky-note">Ký xong anh xem lại tờ biên bản rồi bấm “{v.kind === "thau_phu" ? "Ký + gửi PDF" : "Ký xong · gửi khách ký"}”.</div>
        </Sheet>
      )}
    </>
  );
}

// ───────────────────────── khách ký ─────────────────────────

function PartySign({ v, demo }: { v: EsignView; demo?: boolean }) {
  const [mode, setMode] = useState<"" | "sign" | "reject">("");
  const [name, setName] = useState(v.partyName ?? "");
  const [agree, setAgree] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");

  const send = async (action: "sign" | "reject") => {
    setErr("");
    if (action === "sign") {
      if (!sig) return setErr("Anh/chị ký vào khung trắng.");
      if (!name.trim()) return setErr("Anh/chị ghi họ tên.");
      if (!agree) return setErr("Anh/chị tích ô đồng ý nghiệm thu.");
    } else if (!note.trim()) return setErr("Anh/chị ghi rõ chỗ chưa đồng ý.");
    if (demo) {
      setMode("");
      return setDone(action === "sign" ? "Bản xem thử: bấm thật sẽ lưu chữ ký và ghép PDF." : "Bản xem thử: bấm thật sẽ gửi ý kiến cho kỹ sư.");
    }
    setBusy(true);
    try {
      const r = await fetch(`/ky/${v.token}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "sign" ? { action, name, agree, signature: sig, note } : { action, note }),
      });
      const j = await r.json().catch(() => ({ ok: false, message: "Máy chủ không trả lời." }));
      if (!j.ok) setErr(j.message || "Không gửi được.");
      else {
        setMode("");
        setDone(j.message);
      }
    } catch {
      setErr("Mất mạng, anh/chị bấm lại.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="ky-wrap">
        <div className="ky-banner ok">✓ {done}</div>
        {!demo && (
          <button className="ky-btn" onClick={() => location.reload()}>
            Xem biên bản
          </button>
        )}
      </div>
    );
  }

  const openSign = () => {
    setErr("");
    setSig(null);
    setMode("sign");
  };

  return (
    <>
      <div className="ky-top">
        <div className="ky-banner off">
          Kỹ sư giám sát đã kiểm tra và ký. Anh/chị đọc biên bản (vuốt 2 ngón để phóng to), đồng ý thì bấm vào <span className="ky-hl">ô ký</span> cuối
          biên bản.
        </div>
      </div>
      <Paper
        v={v}
        items={v.ksData.items ?? {}}
        note={v.ksData.note ?? ""}
        photos={v.photoUrls}
        ks={ksSigOf(v)}
        party={{ name: v.partyName, img: null, at: null }}
        onPartySign={openSign}
      />
      <div className="ky-bar">
        <div className="in">
          <button className="ky-btn sec" onClick={() => (setErr(""), setMode("reject"))}>
            Chưa đồng ý
          </button>
          <button className="ky-btn" style={{ height: 48 }} onClick={openSign}>
            ✍ Ký biên bản
          </button>
        </div>
      </div>

      {mode === "sign" && (
        <Sheet title={v.content.title} sub="Ký biên bản nghiệm thu" onClose={() => setMode("")}>
          <SigPad onChange={setSig} />
          <label className="ky-lbl">Họ tên người ký</label>
          <input className="ky-in" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="ky-lbl">Ý kiến thêm (nếu có)</label>
          <textarea className="ky-ta" value={note} onChange={(e) => setNote(e.target.value)} />
          <label className="ky-chk">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>
              Tôi đã đọc biên bản và đồng ý nghiệm thu <b>{v.content.title}</b> công trình {v.content.projectName}.
            </span>
          </label>
          {err && <div className="ky-err">{err}</div>}
          <button className="ky-btn" disabled={busy} onClick={() => send("sign")}>
            {busy ? "Đang lưu…" : "Xác nhận ký"}
          </button>
          <div className="ky-note">Chữ ký kèm thời gian và thiết bị ký được lưu vào biên bản PDF.</div>
        </Sheet>
      )}

      {mode === "reject" && (
        <Sheet title={v.content.title} sub="Chưa đồng ý nghiệm thu" onClose={() => setMode("")}>
          <label className="ky-lbl">Anh/chị chưa đồng ý chỗ nào?</label>
          <textarea
            className="ky-ta"
            style={{ minHeight: 140 }}
            placeholder="Vd: góc móng trục B còn rỗ, nhờ xử lý trước khi lấp đất"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {err && <div className="ky-err">{err}</div>}
          <button className="ky-btn" disabled={busy} onClick={() => send("reject")}>
            {busy ? "Đang gửi…" : "Gửi ý kiến cho kỹ sư"}
          </button>
          <div className="ky-note">Kỹ sư sửa xong sẽ gửi lại biên bản để anh/chị ký.</div>
        </Sheet>
      )}
    </>
  );
}

// ───────────────────────── gốc ─────────────────────────

function ReadOnly({ v, top }: { v: EsignView; top: React.ReactNode }) {
  return (
    <>
      <div className="ky-top">{top}</div>
      <Paper
        v={v}
        items={v.ksData.items ?? {}}
        note={v.ksData.note ?? ""}
        photos={v.photoUrls}
        ks={ksSigOf(v)}
        party={partySigOf(v)}
        partyNote={v.status === "xong" ? v.partyNote : null}
      />
    </>
  );
}

export function KyClient({ view: v, demo = false }: { view: EsignView; demo?: boolean }) {
  let body: React.ReactNode;
  if (v.status === "xong") {
    body = (
      <ReadOnly
        v={v}
        top={
          <>
            <div className="ky-banner ok">
              ✓ Biên bản đã ký xong{v.partySignedAt && v.kind === "chu_nha" ? ` lúc ${fmtTime(v.partySignedAt)}` : ""}.
            </div>
            <PdfButton v={v} demo={demo} />
          </>
        }
      />
    );
  } else if (v.role === "ks") {
    body =
      v.status === "ks_draft" ? (
        <KsForm v={v} demo={demo} />
      ) : (
        <ReadOnly
          v={v}
          top={
            <div className="ky-banner off">
              ✓ Anh đã ký lúc {fmtTime(v.ksSignedAt)}. Đang chờ {v.partyName ?? "khách"} ký.
              {v.partyLink && (
                <small>
                  Khách chưa nhận được Zalo thì anh gửi tay link này: <span style={{ overflowWrap: "anywhere" }}>{v.partyLink}</span>
                </small>
              )}
            </div>
          }
        />
      );
  } else if (v.kind === "chu_nha" && v.status === "cho_khach") {
    body = <PartySign v={v} demo={demo} />;
  } else {
    body = (
      <div className="ky-wrap">
        <div className="ky-banner off">Kỹ sư đang hoàn thiện biên bản, xong sẽ gửi lại anh/chị qua Zalo.</div>
      </div>
    );
  }
  return (
    <div className="ky-body">
      <style dangerouslySetInnerHTML={{ __html: KY_CSS }} />
      <div className="ky-head">
        <span>Huỳnh Gia · BB nghiệm thu</span>
        <span className="ky-head-hint">Vuốt 2 ngón để phóng to</span>
      </div>
      {demo && (
        <div className="ky-top">
          <div className="ky-banner off">Bản xem thử — dữ liệu giả, bấm nút không ghi vào ERP</div>
        </div>
      )}
      {body}
    </div>
  );
}
