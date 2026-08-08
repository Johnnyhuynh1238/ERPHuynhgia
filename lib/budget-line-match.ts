// Đoán HẠNG MỤC ngân sách từ tên vật tư (rule keyword — đồng nhất với seed).
// Trả về TÊN hạng mục chuẩn; caller map sang line.id theo tên dự án.

export function guessBudgetGroupName(name: string): string | null {
  const n = (name || "").toLowerCase();
  if (n.includes("sơn") || n.includes("bột bả") || n.includes("matit")) return "Sơn nước";
  if (n.includes("chống thấm") || n.includes("sika") || n.includes("raintite") || n.includes("topseal")) return "Chống thấm";
  if (n.includes("tôn") || n.includes("xà gồ") || n.includes("vì kèo") || n.includes("ống thoát nước mái")) return "Mái tôn & xà gồ";
  if (n.includes("trần thạch cao")) return "Trần thạch cao";
  if (n.includes("cửa") || n.includes("vách kính")) return "Cửa nhôm kính";
  if (n.includes("thiết bị vệ sinh")) return "Thiết bị vệ sinh";
  if (n.includes("đèn") || n.includes("ổ cắm") || n.includes("công tắc") || n.includes("aptomat") || n.includes("tủ điện") || n.includes("cb "))
    return "Thiết bị điện hoàn thiện";
  if (n.includes("dây điện") || n.includes("ống điện") || n.includes("ống cấp nước") || n.includes("ống thoát pvc") || n.includes("bịt ø") || n.includes("ppr"))
    return "ME thô (điện–nước)";
  if (n.includes("gạch lát") || n.includes("gạch ốp") || n.includes("len chân tường") || n.includes("granite")) return "Ốp lát";
  if (n.includes("thép") || n.includes("kẽm buộc")) return "Cốt thép";
  if (n.includes("gạch ống") || n.includes("gạch đinh") || n.includes("gạch đặc")) return "Xây tường";
  const btCtx = ["(bt", "đổ tay m250", "m250)", "cổ cột", "cột tầng", "giằng", "lanh tô", "đà kiềng", "móng đơn", "sàn mái", "đan nền", "vỉ móng", "bê tông", "đá 4x6", "đá 1x2"];
  const xayCtx = ["vữa xây", "bao móng"];
  const toCtx = ["vữa tô", "cán nền"];
  if (btCtx.some((k) => n.includes(k))) return "Bê tông";
  if (n.includes("xi măng") || n.includes("cát") || n.includes("đá") || n.includes("đinh")) {
    if (xayCtx.some((k) => n.includes(k))) return "Xây tường";
    if (toCtx.some((k) => n.includes(k))) return "Tô trát & cán nền";
    return "Bê tông";
  }
  return null;
}

/** Đoán line.id từ tên vật tư, dựa danh sách hạng mục của dự án. */
export function guessBudgetLineId(name: string, lines: { id: string; name: string }[]): string | null {
  const g = guessBudgetGroupName(name);
  if (!g) return null;
  return lines.find((l) => l.name === g)?.id ?? null;
}
