import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import '@/src/styles/hg-design-system.css'

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "ERP Huỳnh Gia",
  description: "Hệ thống quản lý nội bộ công ty xây dựng",
  manifest: "/manifest.webmanifest",
  themeColor: "#0f1015",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={beVietnamPro.variable}>
      <body className="font-sans bg-black text-zinc-100">
        <div className="hg-page-enter">{children}</div>
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
