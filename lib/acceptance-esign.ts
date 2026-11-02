/**
 * BB nghiệm thu KÝ ONLINE (chỉ đạo 02/11/2026) — thay ký giấy:
 *  - Chủ nhà : link Zalo → KS điền kết quả từng công tác + ảnh + ký trên màn hình → máy gửi link
 *              cho khách → khách đọc BB, bấm Ký, ký trên màn hình → tự ghép PDF đính vào mốc.
 *              Khách "Chưa đồng ý" → trả về KS kèm ý kiến, KS sửa + ký lại.
 *  - Đội khoán: chỉ KS ký → tự ghép PDF đính vào mốc + gửi PDF qua Zalo cho đội khoán.
 * Link không đăng nhập: /ky/<token> (32 hex ngẫu nhiên, mỗi bên 1 token, lưu DB).
 * Nội dung công tác chụp từ Bộ tài liệu giám sát (lib/data/bo-giam-sat.json) lúc tạo.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getObjectFromMinio, putObjectToMinio } from "@/lib/minio";
import { lookupZaloUserByPhone, sendZaloBridge } from "@/lib/zalo-notify";
import { readAcceptancePhotos, type AcceptancePhoto } from "@/lib/acceptance-photos";
import { buildEsignPdf } from "@/lib/acceptance-esign-pdf";
import BO_GIAM_SAT from "@/lib/data/bo-giam-sat.json";

const SITE_URL = (process.env.NEXTAUTH_URL || "https://erp.huynhgia6.com").replace(/\/$/, "");

/** chot = đang ghép PDF (khoá chống bấm 2 lần), lỗi thì trả lại trạng thái trước. */
export type EsignStatus = "ks_draft" | "cho_khach" | "chot" | "xong" | "huy";
export type EsignKind = "chu_nha" | "thau_phu";

export type EsignCt = { no: number; name: string; lv: string; tc: string[]; ck: string[]; dk: string[] };
export type EsignContent = {
  title: string; // tên mốc
  group: string; // "Mục 3. GIẰNG MÓNG" / "Nhóm 3. Giằng móng"
  time: string | null; // thời điểm nghiệm thu
  projectName: string;
  projectCode: string;
  address: string;
  partyLabel: string; // "Chủ nhà" | "Đội khoán"
  contractCode: string | null; // HĐ khoán
  cts: EsignCt[];
};
export type EsignKq = "dat" | "khong_ad";
export type EsignItem = { kq: EsignKq; ngay: string; note: string };
export type EsignPhoto = { key: string; contentType: string };
export type EsignKsData = { items?: Record<string, EsignItem>; note?: string; photos?: EsignPhoto[] };
type LogEv = { at: string; ev: string; ok?: boolean; note?: string };

export const ESIGN_MAX_PHOTOS = 12;
/**
 * Ký online với chủ nhà: MỞ (sếp 02/11/2026) — trước GĐ 6 tin chào Zalo phải tới được khách (SOP-22 bước 9b).
 * Cần khoá lại (vd Zalo cty lỗi) = đổi false → KS bấm sẽ được báo dùng BB giấy.
 */
export const ESIGN_CHU_NHA_ON = true;
export const ESIGN_MAX_SIG_CHARS = 400_000; // data URL PNG chữ ký

type Ct = EsignCt;
type Part = { no: number; title: string; time: string; cts: Ct[] };
const PARTS = BO_GIAM_SAT as Part[];
const ALL_CTS: { part: Part; ct: Ct }[] = PARTS.flatMap((part) => part.cts.map((ct) => ({ part, ct })));

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Tên NT đội khoán khác tên CT trong Bộ tài liệu giám sát (số NT không trùng số CT từ NT-64).
 * 02/11/2026 tách "Móng và giằng móng" thành Móng (từ cổ cột trở xuống, CT2–8) + Giằng móng (CT9–13),
 * đánh lại số CT1–67: tên NT cũ có chữ "giằng" trỏ về CT móng mới.
 */
const NT_ALIAS: Record<string, string> = {
  "ve sinh nha": "ve sinh cong trinh",
  "cop pha mong giang mong": "cop pha mong co cot",
  "cot thep mong giang thep cho cot": "cot thep mong co cot thep cho cot",
};

// ───────────────────────────── token / link ─────────────────────────────

const newToken = () => randomBytes(16).toString("hex");

/** Không neo `$`: Zalo hay dính chữ dòng sau vào link → chỉ lấy 32 hex đầu. */
export function cleanEsignToken(raw: string): string | null {
  const m = /^[0-9a-f]{32}/.exec(raw || "");
  return m ? m[0] : null;
}

export const esignLink = (token: string) => `${SITE_URL}/ky/${token}`;

// ───────────────────────────── nội dung BB ─────────────────────────────

/** Công tác của mốc: chủ nhà theo "CTa–b" trong mô tả (hoặc tên mục); đội khoán theo tên NT-xx. */
export function ctsForMilestone(m: { kind: string; title: string; description: string | null }): {
  cts: Ct[];
  group: string;
  time: string | null;
} {
  const desc = m.description ?? "";
  if (m.kind === "thau_phu") {
    const name = norm(m.title.includes("·") ? m.title.split("·").slice(1).join("·") : m.title);
    const hit =
      ALL_CTS.find((x) => norm(x.ct.name) === name) ??
      ALL_CTS.find((x) => norm(x.ct.name) === NT_ALIAS[name]) ??
      ALL_CTS.find((x) => name.length > 6 && (norm(x.ct.name).includes(name) || name.includes(norm(x.ct.name))));
    const group = desc.split("\n")[0] || (hit ? `Nhóm ${hit.part.no}. ${hit.part.title}` : "");
    if (hit) return { cts: [hit.ct], group, time: hit.part.time };
    return {
      cts: [{ no: 0, name: m.title.replace(/^NT-\d+\s*·\s*/, ""), lv: "NGHIỆM THU", tc: [], ck: [], dk: [] }],
      group,
      time: null,
    };
  }
  const r = /CT\s*(\d+)(?:\s*[–-]\s*(?:CT\s*)?(\d+))?/.exec(desc);
  if (r) {
    const a = Number(r[1]);
    const b = r[2] ? Number(r[2]) : a;
    const list = ALL_CTS.filter((x) => x.ct.no >= a && x.ct.no <= b);
    if (list.length) {
      const part = list[0].part;
      return { cts: list.map((x) => x.ct), group: `Mục ${part.no}. ${part.title}`, time: part.time };
    }
  }
  const part = PARTS.find((p) => norm(p.title) === norm(m.title));
  if (part) return { cts: part.cts, group: `Mục ${part.no}. ${part.title}`, time: part.time };
  return {
    cts: [{ no: 0, name: m.title, lv: "NGHIỆM THU", tc: desc ? [desc] : [], ck: [], dk: [] }],
    group: "",
    time: null,
  };
}

async function resolveParty(project: { id: string; customerName: string; customerPhone: string | null }, m: {
  kind: string;
  description: string | null;
}) {
  if (m.kind !== "thau_phu") {
    return { partyName: project.customerName, partyPhone: project.customerPhone, contractCode: null as string | null };
  }
  const code = /HDNC\d+/.exec(m.description ?? "")?.[0] ?? null;
  const subs = await prisma.subContract.findMany({
    where: { projectId: project.id, status: { not: "cancelled" } },
    select: { code: true, title: true, status: true, subcontractor: { select: { name: true, phone: true } } },
    orderBy: { createdAt: "desc" },
  });
  const sub =
    (code && subs.find((s) => s.code === code)) ||
    subs.find((s) => /khoán/i.test(s.title) && s.status !== "completed") ||
    subs.find((s) => /khoán/i.test(s.title)) ||
    null;
  return {
    partyName: sub?.subcontractor?.name ?? null,
    partyPhone: sub?.subcontractor?.phone ?? null,
    contractCode: sub?.code ?? code,
  };
}

/** KS phụ trách: người bấm (nếu là KS) → KS dự án (pm_engineer) → KS chính. */
async function resolveKs(projectId: string, actor?: { id: string; role: string } | null) {
  const select = { id: true, fullName: true, phone: true, zaloThreadId: true } as const;
  if (actor && actor.role === "engineer") {
    const u = await prisma.user.findUnique({ where: { id: actor.id }, select });
    if (u) return u;
  }
  const a = await prisma.projectMemberAssignment.findFirst({
    where: { projectId, role: "pm_engineer", user: { isActive: true } },
    select: { user: { select } },
  });
  if (a) return a.user;
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { mainEngineerId: true } });
  return p?.mainEngineerId ? prisma.user.findUnique({ where: { id: p.mainEngineerId }, select }) : null;
}

function pushLog(log: unknown, ev: LogEv): Prisma.InputJsonValue {
  const arr = Array.isArray(log) ? (log as LogEv[]) : [];
  return [...arr, ev].slice(-50) as unknown as Prisma.InputJsonValue;
}

// ───────────────────────────── tạo / tìm ─────────────────────────────

/** Phiên ký đang mở của mốc (chưa xong) — có thì dùng lại, chưa có thì tạo mới. */
export async function ensureEsign(milestoneId: string, actor?: { id: string; role: string } | null) {
  const open = await prisma.acceptanceEsign.findFirst({
    where: { milestoneId, status: { in: ["ks_draft", "cho_khach", "chot"] } },
    orderBy: { createdAt: "desc" },
  });
  if (open) return { esign: open, created: false };

  const m = await prisma.acceptanceMilestone.findUnique({
    where: { id: milestoneId },
    include: {
      project: { select: { id: true, code: true, name: true, address: true, customerName: true, customerPhone: true } },
    },
  });
  if (!m) throw new Error("not-found");
  const { cts, group, time } = ctsForMilestone(m);
  const party = await resolveParty(m.project, m);
  const ks = await resolveKs(m.projectId, actor);
  const content: EsignContent = {
    title: m.kind === "chu_nha" ? `Đợt ${m.seq} · ${m.title}` : m.title,
    group,
    time,
    projectName: m.project.name,
    projectCode: m.project.code,
    address: m.project.address,
    partyLabel: m.kind === "thau_phu" ? "Đội khoán" : "Chủ nhà",
    contractCode: party.contractCode,
    cts,
  };
  const esign = await prisma.acceptanceEsign.create({
    data: {
      milestoneId: m.id,
      projectId: m.projectId,
      kind: m.kind === "thau_phu" ? "thau_phu" : "chu_nha",
      ksToken: newToken(),
      partyToken: newToken(),
      content: content as unknown as Prisma.InputJsonValue,
      ksUserId: ks?.id ?? null,
      ksName: ks?.fullName ?? null,
      ksZaloId: ks?.zaloThreadId ?? null,
      partyName: party.partyName,
      partyPhone: party.partyPhone,
      createdBy: actor?.id ?? null,
    },
  });
  return { esign, created: true };
}

export type EsignRow = NonNullable<Awaited<ReturnType<typeof prisma.acceptanceEsign.findFirst>>>;

export async function findEsignByToken(raw: string): Promise<{ esign: EsignRow; role: "ks" | "party" } | null> {
  const token = cleanEsignToken(raw);
  if (!token) return null;
  const esign = await prisma.acceptanceEsign.findFirst({ where: { OR: [{ ksToken: token }, { partyToken: token }] } });
  if (!esign || esign.status === "huy") return null;
  return { esign, role: esign.ksToken === token ? "ks" : "party" };
}

export const esignContent = (e: { content: unknown }) => e.content as EsignContent;
export const esignKsData = (e: { ksData: unknown }) => (e.ksData ?? {}) as EsignKsData;

// ───────────────────────────── Zalo ─────────────────────────────

async function zaloIdOf(e: EsignRow, who: "ks" | "party"): Promise<string | null> {
  if (who === "ks") {
    if (e.ksZaloId) return e.ksZaloId;
    if (!e.ksUserId) return null;
    const u = await prisma.user.findUnique({ where: { id: e.ksUserId }, select: { phone: true, zaloThreadId: true } });
    const id = u?.zaloThreadId ?? (u?.phone ? await lookupZaloUserByPhone(u.phone) : null);
    if (id) await prisma.acceptanceEsign.update({ where: { id: e.id }, data: { ksZaloId: id } });
    return id;
  }
  if (e.partyZaloId) return e.partyZaloId;
  let id = e.partyPhone ? await lookupZaloUserByPhone(e.partyPhone) : null;
  let phone = e.partyPhone;
  if (!id) {
    // SĐT chụp lúc tạo phiếu có thể trống/sai (điền vào dự án sau) → lấy SĐT hiện tại của chủ nhà/đội khoán.
    const [project, m] = await Promise.all([
      prisma.project.findUnique({ where: { id: e.projectId }, select: { id: true, customerName: true, customerPhone: true } }),
      prisma.acceptanceMilestone.findUnique({ where: { id: e.milestoneId }, select: { kind: true, description: true } }),
    ]);
    const cur = project && m ? (await resolveParty(project, m)).partyPhone : null;
    if (cur && cur !== e.partyPhone) {
      phone = cur;
      id = await lookupZaloUserByPhone(cur);
    }
  }
  if (id) await prisma.acceptanceEsign.update({ where: { id: e.id }, data: { partyZaloId: id, partyPhone: phone } });
  return id;
}

async function zaloSend(
  e: EsignRow,
  who: "ks" | "party",
  ev: string,
  text: string,
  file?: { base64: string; name: string },
): Promise<boolean> {
  const threadId = await zaloIdOf(e, who);
  const ok = threadId
    ? await sendZaloBridge({ threadId, text, fileBase64: file?.base64 ?? null, fileName: file?.name ?? null })
    : false;
  const cur = await prisma.acceptanceEsign.findUnique({ where: { id: e.id }, select: { log: true } });
  await prisma.acceptanceEsign.update({
    where: { id: e.id },
    data: {
      log: pushLog(cur?.log, {
        at: new Date().toISOString(),
        ev,
        ok,
        note: ok ? undefined : threadId ? "bridge lỗi" : "không tìm thấy Zalo theo SĐT",
      }),
    },
  });
  if (!ok) {
    // Không gửi được (khách chưa có Zalo / chặn người lạ) → báo sếp để gửi tay, kèm link.
    const c = esignContent(e);
    const link = who === "ks" ? esignLink(e.ksToken) : esignLink(e.partyToken);
    await sendZaloBridge({
      to: "admin",
      text:
        `⚠️ Chưa gửi được Zalo ${who === "ks" ? `KS ${e.ksName ?? ""}` : `${c.partyLabel.toLowerCase()} ${e.partyName ?? ""}`}` +
        ` (BB ${c.title} · ${c.projectName}). Sếp gửi tay link này:\n${link}`,
    });
  }
  return ok;
}

/** Gửi link cho KS điền + ký. */
export async function sendKsLink(e: EsignRow, opts?: { returned?: string }) {
  const c = esignContent(e);
  const head = opts?.returned
    ? `↩️ ${c.partyLabel} chưa đồng ý BB nghiệm thu ${c.title} · ${c.projectName}\nÝ kiến: ${opts.returned}\nAnh sửa lại rồi ký lại:\n`
    : `✍️ BB nghiệm thu ${c.title} · ${c.projectName}\n` +
      (e.kind === "thau_phu"
        ? `Anh mở link, điền kết quả + chụp ảnh rồi ký. Ký xong máy tự gửi PDF cho đội khoán:\n`
        : `Anh mở link, điền kết quả từng công tác + chụp ảnh rồi ký. Ký xong máy tự gửi khách ký:\n`);
  // Link để CUỐI tin: Zalo gộp chữ dòng sau vào link.
  return zaloSend(e, "ks", opts?.returned ? "ks_link_tra_ve" : "ks_link", head + esignLink(e.ksToken));
}

// ───────────────────────────── KS lưu + ký ─────────────────────────────

const DATA_URL_PNG = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

export function validSignature(sig: unknown): sig is string {
  return typeof sig === "string" && sig.length < ESIGN_MAX_SIG_CHARS && DATA_URL_PNG.test(sig);
}

function cleanItems(cts: EsignCt[], raw: unknown): Record<string, EsignItem> | null {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, Partial<EsignItem>>;
  const out: Record<string, EsignItem> = {};
  for (const ct of cts) {
    const it = src[String(ct.no)] ?? {};
    const kq = it.kq === "dat" || it.kq === "khong_ad" ? it.kq : null;
    if (!kq) return null;
    const ngay = typeof it.ngay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(it.ngay) ? it.ngay : "";
    if (kq === "dat" && !ngay) return null;
    out[String(ct.no)] = { kq, ngay, note: String(it.note ?? "").slice(0, 1000) };
  }
  return out;
}

export async function ksSubmit(
  raw: string,
  input: {
    items?: unknown;
    note?: unknown;
    keepPhotos?: unknown;
    signature?: unknown;
    newPhotos: { type: string; body: Buffer }[];
    ip: string | null;
    ua: string | null;
  },
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const found = await findEsignByToken(raw);
  if (!found || found.role !== "ks") return { ok: false, message: "Link không hợp lệ." };
  const e = found.esign;
  if (e.status !== "ks_draft") return { ok: false, message: "Biên bản đã ký, không sửa được nữa." };
  const c = esignContent(e);
  const items = cleanItems(c.cts, input.items);
  if (!items) return { ok: false, message: "Anh chọn kết quả + ngày đạt cho đủ từng công tác." };
  if (!validSignature(input.signature)) return { ok: false, message: "Anh ký vào ô chữ ký trước khi gửi." };

  const old = esignKsData(e).photos ?? [];
  const keep = Array.isArray(input.keepPhotos) ? old.filter((p) => (input.keepPhotos as unknown[]).includes(p.key)) : old;
  if (keep.length + input.newPhotos.length > ESIGN_MAX_PHOTOS) {
    return { ok: false, message: `Tối đa ${ESIGN_MAX_PHOTOS} ảnh.` };
  }
  const photos = [...keep];
  for (const p of input.newPhotos) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(p.type)) return { ok: false, message: "Chỉ nhận ảnh." };
    const key = `acceptance/${e.projectId}/${e.milestoneId}/site/${randomUUID()}-ky-online.jpg`;
    await putObjectToMinio({ key, body: p.body, contentType: p.type });
    photos.push({ key, contentType: p.type });
  }

  const ksData: EsignKsData = { items, note: String(input.note ?? "").slice(0, 2000), photos };
  const next: EsignStatus = "cho_khach";
  // Khoá theo status: 2 lần bấm / 2 máy cùng lúc chỉ 1 lần ăn.
  const upd = await prisma.acceptanceEsign.updateMany({
    where: { id: e.id, status: "ks_draft" },
    data: {
      ksData: ksData as unknown as Prisma.InputJsonValue,
      ksSignature: input.signature,
      ksSignedAt: new Date(),
      ksIp: input.ip,
      ksUa: input.ua?.slice(0, 400) ?? null,
      status: e.kind === "thau_phu" ? "chot" : next, // đội khoán: xong sau khi PDF đính thành công
      partySignature: null,
      partySignedAt: null,
    },
  });
  if (!upd.count) return { ok: false, message: "Biên bản đã ký, không sửa được nữa." };
  const fresh = (await prisma.acceptanceEsign.findUnique({ where: { id: e.id } }))!;

  if (e.kind === "thau_phu") {
    await finalizeOrRevert(fresh, "ks_draft");
    return { ok: true, message: "Đã ký. PDF đã đính lên ERP." };
  }
  const sent = await zaloSend(
    fresh,
    "party",
    "party_link",
    `📝 Huỳnh Gia gửi ${xungHo(fresh.partyName)} biên bản nghiệm thu ${c.title} · ${c.projectName}.\n` +
      `Kỹ sư giám sát ${fresh.ksName ?? ""} đã kiểm tra và ký. Anh/chị bấm link để đọc biên bản, đọc xong bấm Ký để ký trực tiếp trên màn hình:\n` +
      esignLink(fresh.partyToken),
  );
  return {
    ok: true,
    message: sent
      ? "Đã ký. Máy đã gửi Zalo cho khách ký."
      : "Đã ký. Chưa gửi được Zalo cho khách — đã báo văn phòng gửi tay.",
  };
}

// ───────────────────────────── khách ký / trả về ─────────────────────────────

export async function partySign(
  raw: string,
  input: { name?: unknown; signature?: unknown; note?: unknown; agree?: unknown; ip: string | null; ua: string | null },
) {
  const found = await findEsignByToken(raw);
  if (!found || found.role !== "party" || found.esign.kind !== "chu_nha") return { ok: false as const, message: "Link không hợp lệ." };
  const e = found.esign;
  if (e.status !== "cho_khach") {
    return { ok: false as const, message: e.status === "xong" ? "Biên bản đã ký rồi." : "Biên bản đang được kỹ sư sửa lại." };
  }
  const name = String(input.name ?? "").trim().slice(0, 120);
  if (!name) return { ok: false as const, message: "Anh/chị ghi họ tên." };
  if (input.agree !== true) return { ok: false as const, message: "Anh/chị tích ô đồng ý nghiệm thu." };
  if (!validSignature(input.signature)) return { ok: false as const, message: "Anh/chị ký vào ô chữ ký." };
  const upd = await prisma.acceptanceEsign.updateMany({
    where: { id: e.id, status: "cho_khach" },
    data: {
      status: "chot",
      partyName: name,
      partySignature: input.signature,
      partySignedAt: new Date(),
      partyIp: input.ip,
      partyUa: input.ua?.slice(0, 400) ?? null,
      partyNote: String(input.note ?? "").trim().slice(0, 1000) || null,
    },
  });
  if (!upd.count) return { ok: false as const, message: "Biên bản đã ký rồi." };
  const fresh = (await prisma.acceptanceEsign.findUnique({ where: { id: e.id } }))!;
  await finalizeOrRevert(fresh, "cho_khach");
  return { ok: true as const, message: "Cảm ơn anh/chị đã ký. Biên bản đã lưu." };
}

export async function partyReject(raw: string, input: { note: unknown }) {
  const found = await findEsignByToken(raw);
  if (!found || found.role !== "party" || found.esign.kind !== "chu_nha") return { ok: false as const, message: "Link không hợp lệ." };
  const e = found.esign;
  const note = String(input.note ?? "").trim().slice(0, 1000);
  if (!note) return { ok: false as const, message: "Anh/chị ghi rõ chỗ chưa đồng ý." };
  // Trả về KS: mở lại form, bỏ chữ ký KS cũ (KS phải ký lại bản đã sửa).
  const upd = await prisma.acceptanceEsign.updateMany({
    where: { id: e.id, status: "cho_khach" },
    data: {
      status: "ks_draft",
      ksSignature: null,
      ksSignedAt: null,
      partyNote: note,
      log: pushLog(e.log, { at: new Date().toISOString(), ev: "khach_tra_ve", note }),
    },
  });
  if (!upd.count) return { ok: false as const, message: "Biên bản không còn chờ ký." };
  const fresh = (await prisma.acceptanceEsign.findUnique({ where: { id: e.id } }))!;
  await sendKsLink(fresh, { returned: note });
  return { ok: true as const, message: "Đã gửi ý kiến cho kỹ sư. Kỹ sư sửa xong sẽ gửi lại anh/chị ký." };
}

// ───────────────────────────── chốt: PDF + đính mốc + Zalo ─────────────────────────────

export async function esignPdfBytes(e: EsignRow): Promise<Uint8Array> {
  const photos: { bytes: Buffer; type: string }[] = [];
  for (const p of (esignKsData(e).photos ?? []).slice(0, ESIGN_MAX_PHOTOS)) {
    try {
      const o = await getObjectFromMinio(p.key);
      photos.push({ bytes: o.buffer, type: p.contentType });
    } catch {
      // ảnh lỗi → bỏ qua, BB vẫn ra
    }
  }
  return buildEsignPdf({
    id: e.id,
    kind: e.kind as EsignKind,
    content: esignContent(e),
    ksData: esignKsData(e),
    ks: { name: e.ksName, signature: e.ksSignature, at: e.ksSignedAt, ip: e.ksIp },
    party: { name: e.partyName, signature: e.partySignature, at: e.partySignedAt, ip: e.partyIp, note: e.partyNote },
    photos,
  });
}

function pdfFileName(c: EsignContent, at: Date) {
  const d = at.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }).replace(/\//g, "-");
  return `BB nghiem thu ${c.projectCode} ${c.title.replace(/[\\/:*?"<>|]/g, "").slice(0, 60)} ${d}.pdf`;
}

async function finalizeOrRevert(e: EsignRow, back: EsignStatus) {
  try {
    await finalizeEsign(e);
  } catch (err) {
    console.error("[esign finalize]", err);
    await prisma.acceptanceEsign.update({
      where: { id: e.id },
      data: back === "cho_khach" ? { status: back, partySignature: null, partySignedAt: null } : { status: back },
    });
    throw err;
  }
}

async function finalizeEsign(e: EsignRow) {
  const c = esignContent(e);
  const now = new Date();
  const pdf = Buffer.from(await esignPdfBytes(e));
  const key = `acceptance/${e.projectId}/${e.milestoneId}/bien_ban/${randomUUID()}-bb-ky-online.pdf`;
  await putObjectToMinio({ key, body: pdf, contentType: "application/pdf" });

  const m = await prisma.acceptanceMilestone.findUniqueOrThrow({ where: { id: e.milestoneId } });
  const by = e.ksUserId ?? e.createdBy ?? m.createdBy;
  const iso = now.toISOString();
  const name = pdfFileName(c, now);
  const bb: AcceptancePhoto[] = [
    ...readAcceptancePhotos(m.bienBanPhotos),
    { key, contentType: "application/pdf", width: null, height: null, name, uploadedBy: by, uploadedAt: iso },
  ];
  const site: AcceptancePhoto[] = [
    ...readAcceptancePhotos(m.sitePhotos),
    ...(esignKsData(e).photos ?? []).map((p) => ({
      key: p.key,
      contentType: p.contentType,
      width: null,
      height: null,
      name: "Ảnh nghiệm thu",
      uploadedBy: by,
      uploadedAt: iso,
    })),
  ];
  await prisma.$transaction([
    prisma.acceptanceMilestone.update({
      where: { id: m.id },
      data: {
        bienBanPhotos: bb as unknown as Prisma.InputJsonValue,
        sitePhotos: site as unknown as Prisma.InputJsonValue,
        status: "signed",
        signedAt: now,
        signerName: e.kind === "chu_nha" ? e.partyName : e.ksName,
        customerNote: e.kind === "chu_nha" ? e.partyNote : m.customerNote,
      },
    }),
    prisma.acceptanceEsign.update({ where: { id: e.id }, data: { status: "xong", pdfKey: key } }),
  ]);
  const done = (await prisma.acceptanceEsign.findUnique({ where: { id: e.id } }))!;
  // BB đã chốt trong DB — Zalo lỗi không được làm hỏng (đã log + báo sếp trong zaloSend).
  // Chạy nền: upload PDF qua bridge có thể mất ~90s, không bắt người ký chờ.
  void notifyDone(done, c, pdf, name).catch((err) => console.error("[esign notify]", err));
}

/** "Anh Hiếu" → "anh Hiếu"; tên trần → "anh/chị Tên"; trống → "anh/chị". */
function xungHo(name: string | null): string {
  const n = (name ?? "").trim();
  if (!n) return "anh/chị";
  const m = /^(anh|chị|chú|cô|bác)\s+(.+)$/i.exec(n);
  return m ? `${m[1].toLowerCase()} ${m[2]}` : `anh/chị ${n}`;
}

async function notifyDone(done: EsignRow, c: EsignContent, pdf: Buffer, name: string) {
  if (done.kind === "thau_phu") {
    await zaloSend(
      done,
      "party",
      "party_pdf",
      `📄 Huỳnh Gia gửi ${done.partyName ?? "đội khoán"} biên bản nghiệm thu ${c.title} · ${c.projectName}` +
        `${c.contractCode ? ` (HĐ khoán ${c.contractCode})` : ""}, KS ${done.ksName ?? ""} đã ký đạt.\nXem / tải PDF:\n` +
        esignLink(done.partyToken),
      { base64: pdf.toString("base64"), name },
    );
    await zaloSend(done, "ks", "ks_xong", `✅ Đã đính BB ${c.title} · ${c.projectName} lên ERP.`);
    return;
  }
  await zaloSend(
    done,
    "party",
    "party_xong",
    `✅ Cảm ơn anh/chị đã ký biên bản nghiệm thu ${c.title}. Xem / tải bản PDF:\n${esignLink(done.partyToken)}`,
  );
  await zaloSend(done, "ks", "ks_xong", `✅ ${c.partyLabel} ${done.partyName ?? ""} đã ký BB ${c.title} · ${c.projectName}. PDF đã đính lên ERP.`);
}

// ───────────────────────────── cho màn staff ─────────────────────────────

export type EsignSummary = {
  id: string;
  status: EsignStatus;
  ksLink: string;
  partyLink: string;
  partyName: string | null;
  partyNote: string | null;
  ksSignedAt: string | null;
  updatedAt: string;
  lastLog: LogEv | null;
};

export function esignSummary(e: EsignRow): EsignSummary {
  const log = Array.isArray(e.log) ? (e.log as LogEv[]) : [];
  return {
    id: e.id,
    status: e.status as EsignStatus,
    ksLink: esignLink(e.ksToken),
    partyLink: esignLink(e.partyToken),
    partyName: e.partyName,
    partyNote: e.partyNote,
    ksSignedAt: e.ksSignedAt?.toISOString() ?? null,
    updatedAt: e.updatedAt.toISOString(),
    lastLog: log[log.length - 1] ?? null,
  };
}

// ───────────────────────────── cho trang /ky ─────────────────────────────

export type EsignView = {
  token: string;
  role: "ks" | "party";
  kind: EsignKind;
  status: EsignStatus;
  content: EsignContent;
  ksData: EsignKsData;
  photoUrls: { key: string; url: string }[];
  ksName: string | null;
  ksSignature: string | null;
  ksSignedAt: string | null;
  partyName: string | null;
  partyPhone: string | null;
  /** Chỉ trả cho KS: link khách, để gửi tay khi Zalo không tới. */
  partyLink: string | null;
  partySignature: string | null;
  partySignedAt: string | null;
  partyNote: string | null;
  hasPdf: boolean;
};

export function esignView(e: EsignRow, role: "ks" | "party", token: string): EsignView {
  const ksData = esignKsData(e);
  return {
    token,
    role,
    kind: e.kind as EsignKind,
    status: e.status as EsignStatus,
    content: esignContent(e),
    ksData,
    photoUrls: (ksData.photos ?? []).map((p) => ({ key: p.key, url: `/ky/${token}/file?key=${encodeURIComponent(p.key)}` })),
    ksName: e.ksName,
    // Khách chỉ thấy chữ ký KS khi KS đã ký; KS đang sửa thì chữ ký cũ đã bị xoá.
    ksSignature: e.ksSignature,
    ksSignedAt: e.ksSignedAt?.toISOString() ?? null,
    partyName: e.partyName,
    partyPhone: role === "ks" ? e.partyPhone : null,
    partyLink: role === "ks" && e.kind === "chu_nha" ? esignLink(e.partyToken) : null,
    partySignature: e.partySignature,
    partySignedAt: e.partySignedAt?.toISOString() ?? null,
    partyNote: e.partyNote,
    hasPdf: !!e.pdfKey,
  };
}

/** Dữ liệu giả cho link xem thử /ky/demo-ks | demo-khach | demo-doi | demo-xong — không đụng DB. */
export function esignDemoView(which: string): EsignView | null {
  const kinds: Record<string, { role: "ks" | "party"; kind: EsignKind; status: EsignStatus }> = {
    "demo-ks": { role: "ks", kind: "chu_nha", status: "ks_draft" },
    "demo-khach": { role: "party", kind: "chu_nha", status: "cho_khach" },
    "demo-doi": { role: "ks", kind: "thau_phu", status: "ks_draft" },
    "demo-xong": { role: "party", kind: "chu_nha", status: "xong" },
  };
  const k = kinds[which];
  if (!k) return null;
  const m =
    k.kind === "chu_nha"
      ? { kind: "chu_nha", title: "Móng (từ cổ cột trở xuống)", description: "CT2–8 · Móng + cổ cột" }
      : { kind: "thau_phu", title: "NT-02 · Đào hố móng", description: "Nhóm 2. Móng (từ cổ cột trở xuống)\nHĐ khoán HDNC0024" };
  const { cts, group, time } = ctsForMilestone(m);
  const content: EsignContent = {
    title: k.kind === "chu_nha" ? "Đợt 2 · Móng (từ cổ cột trở xuống)" : m.title,
    group,
    time,
    projectName: "Nhà anh Hiếu (thử)",
    projectCode: "DA-2026-005",
    address: "Phước Thái, Đồng Nai",
    partyLabel: k.kind === "thau_phu" ? "Đội khoán" : "Chủ nhà",
    contractCode: k.kind === "thau_phu" ? "HDNC0024" : null,
    cts,
  };
  const signed = k.status !== "ks_draft";
  const items: Record<string, EsignItem> = {};
  if (signed) for (const ct of cts) items[String(ct.no)] = { kq: "dat", ngay: "2026-11-01", note: "" };
  // Chữ ký mẫu (SVG) cho bản xem thử.
  const demoSig = (d: string) =>
    `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="90"><path d="${d}" fill="none" stroke="#1a2a6c" stroke-width="3" stroke-linecap="round"/></svg>`,
    )}`;
  return {
    token: which,
    role: k.role,
    kind: k.kind,
    status: k.status,
    content,
    ksData: signed ? { items, note: "Thép, cốp pha đúng bản vẽ. Đã đổ bê tông lót đủ dày." } : {},
    photoUrls: [],
    ksName: "Nguyễn Văn Hoàng",
    ksSignature: signed ? demoSig("M20 60 C40 10 60 10 70 50 S100 80 120 40 S170 20 220 55") : null,
    ksSignedAt: signed ? "2026-11-01T09:30:00.000Z" : null,
    partyName: k.kind === "thau_phu" ? "A Sỹ" : "Anh Hiếu",
    partyPhone: null,
    partyLink: null,
    partySignature: k.status === "xong" ? demoSig("M15 50 Q40 5 55 60 T95 45 Q120 20 140 55 L200 35") : null,
    partySignedAt: k.status === "xong" ? "2026-11-01T11:05:00.000Z" : null,
    partyNote: null,
    hasPdf: false,
  };
}
