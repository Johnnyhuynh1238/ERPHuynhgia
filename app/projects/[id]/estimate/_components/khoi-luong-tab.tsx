"use client";

import { ChevronDown, ChevronRight, Flag, Loader2, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { EditableText } from "./editable-text";
import { api, type CongTac, fmtQty, fmtVnd, type Group, type Item, type Vt } from "./estimate-data";

const pad2 = (n: number) => String(n + 1).padStart(2, "0");

// Ô nhập nhanh 1 dòng
function AddInline({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => Promise<void> }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const name = v.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await onAdd(name);
      setV("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="est-add">
      <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} placeholder={placeholder} />
      <button className="go" onClick={() => void submit()} disabled={busy} aria-label="Thêm">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// Ô số sửa tại chỗ (mono, phải)
function NumCell({ value, onSave }: { value: number | null; onSave: (n: number | null) => Promise<void> }) {
  return (
    <EditableText
      value={value == null ? "" : String(value)}
      className="est-ed-num"
      placeholder="—"
      onSave={async (v) => {
        const t = v.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
        if (t === "") return onSave(null);
        const n = Number(t);
        if (!Number.isFinite(n) || n < 0) {
          toast.error("Số không hợp lệ");
          return;
        }
        await onSave(n);
      }}
    />
  );
}

const vtTotal = (line: CongTac) => line.vtChildren.reduce((s, vt) => s + vt.quantity * (vt.directUnitPrice ?? 0), 0);

export function KhoiLuongTab({ projectId }: { projectId: string }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const inited = useRef(false);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const reload = useCallback(async () => {
    try {
      const data = await api(`/api/projects/${projectId}/estimate/lines`);
      setGroups(data.groups);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Mới mở → thu gọn hết
  useEffect(() => {
    if (groups && !inited.current) {
      inited.current = true;
      setCollapsed(new Set(groups.map((g) => g.id)));
    }
  }, [groups]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (groups === null) {
    return (
      <div className="est-empty">
        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
      </div>
    );
  }

  let detail: { line: CongTac; itemName: string } | null = null;
  for (const g of groups) for (const it of g.items) for (const l of it.lines) if (l.id === detailId) detail = { line: l, itemName: it.name };

  const grand = groups.reduce((s, g) => s + g.items.reduce((s2, it) => s2 + it.lines.reduce((s3, l) => s3 + vtTotal(l), 0), 0), 0);

  return (
    <div>
      {groups.length === 0 && <div className="est-empty">Chưa có khối lượng. Thêm nhóm → hạng mục → công tác, gắn vật tư dùng cho từng công tác.</div>}

      {groups.map((g, gi) => {
        const gCollapsed = collapsed.has(g.id);
        const gTotal = g.items.reduce((s, it) => s + it.lines.reduce((s2, l) => s2 + vtTotal(l), 0), 0);
        return (
          <section className="est-phase" key={g.id}>
            <div className="est-phase-h">
              <button className="tgl" onClick={() => toggle(g.id)} aria-label="Thu gọn">
                {gCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              <span className="idx">{pad2(gi)}</span>
              <button className="nm" onClick={() => toggle(g.id)}>{g.name}</button>
              <span className="tot">{gTotal > 0 ? fmtVnd(Math.round(gTotal)) : ""}</span>
              <button
                className="x"
                onClick={async () => {
                  if (await confirmDialog({ title: "Xoá nhóm?", message: `${g.name} + toàn bộ bên trong`, confirmText: "Xoá" }))
                    void run(() => api(`/api/estimate/groups/${g.id}`, { method: "DELETE" }));
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {!gCollapsed && (
              <div>
                {g.items.map((it) => (
                  <ItemBlock key={it.id} item={it} projectId={projectId} run={run} onOpen={setDetailId} />
                ))}
                <AddInline placeholder="+ hạng mục" onAdd={(name) => run(() => api(`/api/estimate/groups/${g.id}/items`, { method: "POST", body: JSON.stringify({ name }) }))} />
              </div>
            )}
          </section>
        );
      })}

      <div style={{ marginTop: 22 }}>
        <AddInline placeholder="+ nhóm (VD: Phần thô)" onAdd={(name) => run(() => api(`/api/projects/${projectId}/estimate/groups`, { method: "POST", body: JSON.stringify({ name }) }))} />
      </div>

      {grand > 0 && (
        <div className="est-grand">
          <div className="gw">
            <div>
              <div className="k">Tổng vật tư dự kiến</div>
              <div className="n">Theo giá mua dự kiến · chưa gồm VAT</div>
            </div>
            <div className="v num">
              {fmtVnd(Math.round(grand))}
              <span className="u">đ</span>
            </div>
          </div>
        </div>
      )}

      {detail && <LineDetailModal line={detail.line} itemName={detail.itemName} projectId={projectId} run={run} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function ItemBlock({ item, projectId, run, onOpen }: { item: Item; projectId: string; run: (fn: () => Promise<unknown>) => Promise<void>; onOpen: (id: string) => void }) {
  return (
    <div>
      <div className="est-itemhdr">
        <span className="nm">
          <EditableText value={item.name} onSave={(v) => run(() => api(`/api/estimate/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ name: v }) }))} />
        </span>
        <button
          className="est-iconbtn"
          onClick={async () => {
            if (await confirmDialog({ title: "Xoá hạng mục?", message: `${item.name} + bên trong`, confirmText: "Xoá" }))
              void run(() => api(`/api/estimate/items/${item.id}`, { method: "DELETE" }));
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {item.lines.map((line) => {
        const total = vtTotal(line);
        return (
          <button key={line.id} className="est-row" onClick={() => onOpen(line.id)}>
            {line.fixRequest && <Flag className="est-flag h-3.5 w-3.5" fill="currentColor" />}
            <div className="body">
              <div className="name">{line.name}</div>
              <div className="calc num">
                {fmtQty(line.quantity)} {line.unit}
                {line.vtChildren.length > 0 && <span> · {line.vtChildren.length} vật tư</span>}
              </div>
            </div>
            <div className="amt num">
              {total > 0 ? (
                <>
                  {fmtVnd(Math.round(total))}
                  <span className="u">đ</span>
                </>
              ) : (
                <span style={{ color: "var(--mut2)" }}>—</span>
              )}
            </div>
            <ChevronRight className="chev h-4 w-4" />
          </button>
        );
      })}

      <AddInline
        placeholder="+ công tác"
        onAdd={(name) => run(() => api(`/api/projects/${projectId}/estimate/lines`, { method: "POST", body: JSON.stringify({ kind: "cong-tac", itemId: item.id, name, unit: "m³", quantity: 0 }) }))}
      />
    </div>
  );
}

// Popup chi tiết công tác
function LineDetailModal({
  line,
  itemName,
  projectId,
  run,
  onClose,
}: {
  line: CongTac;
  itemName: string;
  projectId: string;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const patch = (body: Record<string, unknown>) => run(() => api(`/api/estimate/lines/${line.id}`, { method: "PATCH", body: JSON.stringify(body) }));
  const patchVt = (vt: Vt, body: Record<string, unknown>) => run(() => api(`/api/estimate/lines/${vt.id}`, { method: "PATCH", body: JSON.stringify(body) }));
  const total = vtTotal(line);

  if (!mounted) return null;

  return createPortal(
    <div className="est-ov" onClick={onClose}>
      <div className="est-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="est-sheet-h">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow">{itemName}</div>
            <div className="ttl">
              <EditableText value={line.name} onSave={(v) => patch({ name: v })} />
            </div>
            <div className="sub">
              <span style={{ color: "var(--mut2)" }}>KL</span>
              <span className="est-ed-num" style={{ minWidth: 40 }}>
                <NumCell value={line.quantity} onSave={(n) => patch({ quantity: n ?? 0 })} />
              </span>
              <EditableText value={line.unit} onSave={(v) => patch({ unit: v })} />
            </div>
          </div>
          <button className="est-iconbtn" onClick={onClose} style={{ padding: 6 }} aria-label="Đóng">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="est-sheet-body">
          <section className="est-sec">
            <h4>Diễn giải (bằng lời)</h4>
            <div className="est-box">
              <EditableText value={line.note ?? ""} multiline placeholder="Mô tả công tác này bằng lời dễ hiểu…" onSave={(v) => patch({ note: v })} />
            </div>
          </section>

          <section className="est-sec">
            <h4>Cách tính khối lượng</h4>
            <div className="est-box num">
              <EditableText value={line.formula ?? ""} multiline placeholder="VD: (dài × rộng × cao) × số cấu kiện…" onSave={(v) => patch({ formula: v })} />
            </div>
          </section>

          <section className="est-sec">
            <h4>
              Vật tư sử dụng
              {total > 0 && (
                <span style={{ marginLeft: "auto", fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--mut)" }}>
                  Tạm tính <b className="num" style={{ color: "var(--orange)" }}>{fmtVnd(Math.round(total))}đ</b>
                </span>
              )}
            </h4>
            <div className="est-box" style={{ padding: "4px 12px" }}>
              {line.vtChildren.length === 0 && <div style={{ padding: "8px 0", color: "var(--mut2)", fontSize: 12 }}>Chưa có vật tư</div>}
              {line.vtChildren.map((vt) => (
                <div className="est-vt" key={vt.id}>
                  <div className="vname">
                    <EditableText value={vt.name} onSave={(v) => patchVt(vt, { name: v })} />
                    <div className="num" style={{ fontSize: 11.5, color: "var(--mut)", marginTop: 2 }}>
                      <span className="est-ed-num" style={{ display: "inline-block", minWidth: 30 }}>
                        <NumCell value={vt.quantity} onSave={(n) => patchVt(vt, { quantity: n ?? 0 })} />
                      </span>{" "}
                      <EditableText value={vt.unit} onSave={(v) => patchVt(vt, { unit: v })} className="inline" /> ×{" "}
                      <span className="est-ed-num" style={{ display: "inline-block", minWidth: 48 }}>
                        <NumCell value={vt.directUnitPrice} onSave={(n) => patchVt(vt, { directUnitPrice: n })} />
                      </span>
                    </div>
                  </div>
                  <div className="vamt num">{vt.directUnitPrice != null ? `${fmtVnd(Math.round(vt.quantity * vt.directUnitPrice))}đ` : "—"}</div>
                  <button
                    className="est-iconbtn"
                    onClick={async () => {
                      if (await confirmDialog({ title: "Xoá vật tư?", message: vt.name, confirmText: "Xoá" })) void run(() => api(`/api/estimate/lines/${vt.id}`, { method: "DELETE" }));
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <AddInline
              placeholder="+ vật tư"
              onAdd={(name) => run(() => api(`/api/projects/${projectId}/estimate/lines`, { method: "POST", body: JSON.stringify({ kind: "vt", parentLineId: line.id, name, unit: line.unit || "cái", quantity: 0 }) }))}
            />
          </section>

          <section className="est-sec fix">
            <h4>
              <Flag className="h-3.5 w-3.5" /> Yêu cầu chỉnh sửa
            </h4>
            <div className={`est-box ${line.fixRequest ? "fixon" : ""}`}>
              <EditableText value={line.fixRequest ?? ""} multiline placeholder="Ghi điều cần sửa để đánh dấu — rồi nhắn Claude vào sửa…" onSave={(v) => patch({ fixRequest: v })} />
            </div>
            <p className="est-hint">Đánh dấu ở đây; công tác sẽ hiện cờ ngoài danh sách.</p>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
