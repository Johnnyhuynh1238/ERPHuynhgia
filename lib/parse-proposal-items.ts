// Parse mô tả vật tư tự do của KS sang danh sách [{ten, sl, dvt}] qua OpenAI JSON mode.
// Best-effort: fail → return null, kế toán vẫn thấy raw text trên UI.

import OpenAI from "openai";

export type ParsedItem = {
  ten: string;
  sl: number;
  dvt: string;
};

const PARSE_SYSTEM_PROMPT = `Bạn là bộ parser tách danh sách vật tư từ tin nhắn tự do của Kỹ sư công trình tiếng Việt.

NHIỆM VỤ: Nhận 1 đoạn mô tả vật tư, tách thành danh sách JSON {items: [{ten, sl, dvt}]}.

QUY TẮC:
- "ten": tên vật tư ngắn gọn, viết thường, không kèm số lượng/đơn vị (ví dụ: "cát", "gạch ống", "xi măng holcim").
- "sl": số lượng dạng number (5, 200, 1.5). Nếu KS nói "vài", "ít" → bỏ qua item đó.
- "dvt": đơn vị tính chuẩn hóa: "khối", "bao", "viên", "kg", "tấn", "cây", "tấm", "thùng", "m", "m2", "lít", "cái". Nếu không rõ → "cái".
- Nếu KS không nêu rõ vật tư cụ thể → trả về {items: []}.
- KHÔNG bịa thêm vật tư, KHÔNG suy diễn số lượng.

VÍ DỤ:
Input: "5 khối cát + 200 viên gạch ống"
Output: {"items":[{"ten":"cát","sl":5,"dvt":"khối"},{"ten":"gạch ống","sl":200,"dvt":"viên"}]}

Input: "10 bao xi măng holcim, 2 tấn sắt phi 10"
Output: {"items":[{"ten":"xi măng holcim","sl":10,"dvt":"bao"},{"ten":"sắt phi 10","sl":2,"dvt":"tấn"}]}

Input: "vài viên gạch"
Output: {"items":[]}`;

export async function parseProposalItems(description: string): Promise<ParsedItem[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const baseURL = process.env.OPENAI_BASE_URL;
  if (!apiKey) return null;

  const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  try {
    const completion = await client.chat.completions.create({
      model,
      max_tokens: 500,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PARSE_SYSTEM_PROMPT },
        { role: "user", content: description },
      ],
    });
    const raw = completion.choices[0]?.message?.content || "";
    const obj = JSON.parse(raw);
    if (!obj || !Array.isArray(obj.items)) return null;
    const items: ParsedItem[] = [];
    for (const it of obj.items) {
      if (!it || typeof it !== "object") continue;
      const ten = String(it.ten ?? "").trim().slice(0, 100);
      const sl = Number(it.sl);
      const dvt = String(it.dvt ?? "").trim().slice(0, 20);
      if (!ten || !Number.isFinite(sl) || sl <= 0 || !dvt) continue;
      items.push({ ten, sl, dvt });
    }
    return items;
  } catch (err: any) {
    console.error("[parse-proposal-items] error", err?.message || err);
    return null;
  }
}
