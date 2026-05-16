import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const token = params.token;
  const scope = `/cn/${token}/`;
  const startUrl = `/cn/${token}/dashboard`;

  const body = {
    name: "Huỳnh Gia – Theo dõi nhà",
    short_name: "Nhà của tôi",
    description: "Theo dõi tiến độ thi công nhà của bạn",
    id: scope,
    start_url: startUrl,
    scope,
    display: "standalone",
    background_color: "#0f1015",
    theme_color: "#f97316",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };

  return new NextResponse(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
