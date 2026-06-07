import { NextResponse } from "next/server";
import { z } from "zod";

const ALLOWED_ORIGINS = new Set([
  "https://huynhgia6.com",
  "https://www.huynhgia6.com",
]);

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://huynhgia6.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    Vary: "Origin",
  };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

// === Server-side pricing formula (hidden from client) ===
const MONG_HE_SO: Record<string, number> = {
  don: 0.30,
  bang1: 0.50,
  bang2: 0.70,
  be: 1.00,
  coc: 0.50,
};

const MAI_HE_SO: Record<string, number> = {
  ton: 0.30,
  btct: 0.50,
  "ngoi-keo": 0.50,
  "ngoi-betong": 0.70,
  "ngoi-betong-keo": 1.00,
};

const CONDITION_FACTORS: Record<string, number> = {
  "hem-nho": 1.03,
  "hem-rat-nho": 1.07,
  "sat-nha": 1.04,
  "dat-doc": 1.03,
  "nen-yeu": 1.05,
  "san-lap": 1.04,
  "khong-tap-ket": 1.03,
  "chua-co-cong": 1.04,
};

const PRICES = {
  rawLow: 3_900_000,
  rawHigh: 4_600_000,
  designPerM2: 150_000,
};

const inputSchema = z.object({
  mongType: z.string().refine((v) => v in MONG_HE_SO, "mongType invalid"),
  floorArea: z.number().nonnegative().max(2000),
  numFloors: z.number().int().nonnegative().max(10),
  hasTumSanThuong: z.boolean(),
  tumArea: z.number().nonnegative().max(2000).default(0),
  sanThuongCoLam: z.boolean().default(false),
  maiType: z.string().refine((v) => v in MAI_HE_SO, "maiType invalid"),
  conditions: z
    .array(z.string().refine((v) => v in CONDITION_FACTORS, "condition invalid"))
    .max(10)
    .default([]),
});

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Body không hợp lệ" }, { status: 400, headers });
  }

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Dữ liệu không hợp lệ", errors: parsed.error.flatten() },
      { status: 400, headers },
    );
  }

  const d = parsed.data;
  const floorArea = d.floorArea;
  const numFloors = d.numFloors;

  // Raw construction breakdown (m² quy đổi)
  const b = {
    mong: floorArea * (MONG_HE_SO[d.mongType] ?? 0),
    tang: floorArea * numFloors,
    tum: 0,
    sanThuong: 0,
    mai: floorArea * (MAI_HE_SO[d.maiType] ?? 0),
  };
  if (d.hasTumSanThuong) {
    const tumArea = d.tumArea;
    const stArea = Math.max(0, floorArea - tumArea);
    b.tum = tumArea * 0.5;
    b.sanThuong = stArea * (d.sanThuongCoLam ? 0.7 : 0.5);
  }
  const totalArea = b.mong + b.tang + b.tum + b.sanThuong + b.mai;

  let conditionFactor = 1;
  for (const c of d.conditions) {
    conditionFactor *= CONDITION_FACTORS[c] ?? 1;
  }

  const giaLow = totalArea * PRICES.rawLow * conditionFactor;
  const giaHigh = totalArea * PRICES.rawHigh * conditionFactor;

  // Design fee — m² sàn = floorArea × numFloors + tum (hệ số 1)
  const tumSan = d.hasTumSanThuong ? d.tumArea : 0;
  const totalSan = Math.round(floorArea * numFloors + tumSan);

  return NextResponse.json(
    {
      ok: true,
      raw: {
        breakdown: b,
        totalArea,
        conditionFactor,
        giaLow,
        giaHigh,
        hasMongCoc: d.mongType === "coc",
      },
      design: {
        floorArea,
        numFloors,
        totalSan,
        perM2: PRICES.designPerM2,
        total: totalSan * PRICES.designPerM2,
      },
      prices: {
        rawLow: PRICES.rawLow,
        rawHigh: PRICES.rawHigh,
        designPerM2: PRICES.designPerM2,
      },
    },
    { status: 200, headers },
  );
}
