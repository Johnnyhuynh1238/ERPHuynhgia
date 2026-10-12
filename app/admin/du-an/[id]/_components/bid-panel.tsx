"use client";

import { useCallback, useEffect, useState } from "react";
import { copyText } from "@/lib/copy-text";
import { PUBLIC_SITE_URL } from "@/lib/pipeline";

type Bid = {
  slug: string | null;
  publishedAt: string | null;
  note: string;
  docKeys: string[];
};
type Doc = { key: string; folder: string; fileName: string };

// Mời thầu nhân công (GĐ 4–5): link huynhgia6.com/moi-thau-<mã> cho nhà thầu xem thông tin dự án,
// bản vẽ, phối cảnh, mô tả, HĐ thầu phụ mẫu — chỉ xem, không tải. Bật/tắt + đổi mã để thu hồi.
export function BidPanel({ pipelineId }: { pipelineId: string }) {
  const [bid, setBid] = useState<Bid | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [note, setNote] = useState("");
  const [keys, setKeys] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const apply = (b: Bid) => {
    setBid(b);
    setNote(b.note);
    setKeys(b.docKeys);
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/pipeline/${pipelineId}/bid`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setError(json.message || "Không tải được mời thầu");
      const b: Bid = json.bid;
      const list: Doc[] = json.docs || [];
      setDocs(list);
      apply(b);
      // Lần đầu: chọn sẵn HĐ giao khoán (PDF) trong thư mục "Khoán Nhân công".
      if (!b.slug && !b.docKeys.length)
        setKeys(list.filter((d) => /kho[aá]n/i.test(d.folder) && /\.pdf$/i.test(d.fileName)).map((d) => d.key));
    } catch {
      setError("Lỗi mạng, thử lại");
    }
  }, [pipelineId]);

  useEffect(() => {
    load();
  }, [load]);

  const call = async (body: Record<string, unknown>, done?: string) => {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch(`/api/admin/pipeline/${pipelineId}/bid`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setError(json.message || "Không lưu được");
      apply(json.bid);
      if (done) setMsg(done);
    } catch {
      setError("Lỗi mạng, thử lại");
    } finally {
      setBusy(false);
    }
  };

  const url = bid?.slug ? `${PUBLIC_SITE_URL}/${bid.slug}` : "";
  const live = Boolean(bid?.publishedAt);
  const dirty = bid ? note !== bid.note || keys.join("|") !== bid.docKeys.join("|") : false;

  const togglePublish = () => {
    if (live) {
      if (!window.confirm("Đóng link mời thầu? Nhà thầu đang giữ link sẽ không xem được nữa.")) return;
      call({ published: false }, "Đã đóng link");
    } else {
      call({ published: true, note, docKeys: keys }, "Đã mở link — chép gửi nhà thầu");
    }
  };

  const newLink = () => {
    if (!window.confirm("Đổi link mới? Link cũ đã gửi sẽ hỏng ngay (dùng khi muốn thu hồi).")) return;
    call({ newLink: true }, "Đã đổi link mới");
  };

  const copy = async () => {
    if (url && (await copyText(url))) setMsg("Đã chép link");
  };

  const folders = Array.from(new Set(docs.map((d) => d.folder)));

  return (
    <div className="pl-bid">
      <button type="button" className="pl-bidhead" onClick={() => setOpen((v) => !v)}>
        <span>
          <b>📣 Mời thầu nhân công</b>
          <small className={live ? "on" : ""}>{live ? "● Link đang mở" : bid?.slug ? "Link đang đóng" : "Chưa tạo link"}</small>
        </span>
        <span className="chev">{open ? "▴" : "▾"}</span>
      </button>
      {open ? (
        <div className="pl-bidbody">
          {error ? <div className="pl-err">{error}</div> : null}
          {msg ? <div className="pl-ok">{msg}</div> : null}
          <p className="pl-bidhint">
            Nhà thầu xem: thông tin công trình (không có tên/SĐT chủ nhà, không có giá HĐ), bản vẽ + phối cảnh đã tải ở GĐ 4, mô tả mới nhất, HĐ thầu phụ mẫu bên dưới. Tất cả chỉ xem dạng ảnh có dấu chìm, không tải được.
          </p>

          {url ? (
            <div className="pl-bidurl">
              <code>{url}</code>
              <div className="pl-dsact">
                <button type="button" className="pl-btn ghost" onClick={copy} disabled={!live}>
                  📋 Chép link
                </button>
                <a className="pl-btn ghost" href={`/mo-ta/${bid?.slug}`} target="_blank" rel="noreferrer">
                  Xem trước ↗
                </a>
                <button type="button" className="pl-btn danger" onClick={newLink} disabled={busy}>
                  Đổi link
                </button>
              </div>
            </div>
          ) : null}

          <label className="pl-bidlb">Phạm vi &amp; yêu cầu mời thầu (nhà thầu đọc ở mục Thông tin)</label>
          <textarea
            className="pl-bidnote"
            rows={5}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={"VD: Khoán nhân công trọn gói thô + hoàn thiện, Huỳnh Gia cấp vật tư.\nTiến độ 120 ngày. Gửi giá trước 20/10.\nLiên hệ: Anh Cường 09xx xxx xxx"}
          />

          <label className="pl-bidlb">HĐ thầu phụ mẫu (từ Tài liệu chung — chỉ PDF / ảnh)</label>
          {docs.length ? (
            <div className="pl-biddocs">
              {folders.map((f) => (
                <div key={f || "-"}>
                  {f ? <div className="fd">{f}</div> : null}
                  {docs
                    .filter((d) => d.folder === f)
                    .map((d) => (
                      <label key={d.key} className="it">
                        <input
                          type="checkbox"
                          checked={keys.includes(d.key)}
                          onChange={(e) =>
                            setKeys((cur) => (e.target.checked ? [...cur, d.key] : cur.filter((k) => k !== d.key)))
                          }
                        />
                        <span>{d.fileName}</span>
                      </label>
                    ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="pl-bidhint">Tài liệu chung chưa có file PDF / ảnh.</div>
          )}

          <div className="pl-bidfoot">
            {bid?.slug ? (
              <button
                type="button"
                className="pl-btn ghost"
                disabled={busy || !dirty}
                onClick={() => call({ note, docKeys: keys }, "Đã lưu")}
              >
                Lưu
              </button>
            ) : null}
            <button type="button" className={`pl-btn${live ? " ghost" : ""}`} disabled={busy} onClick={togglePublish}>
              {live ? "Đóng link" : bid?.slug ? "✓ Mở link cho nhà thầu" : "✓ Tạo & mở link"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
