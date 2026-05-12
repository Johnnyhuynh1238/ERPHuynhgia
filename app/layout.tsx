import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import '@/src/styles/hg-design-system.css'

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
    <html lang="vi">
      <body className="font-sans bg-black text-zinc-100">
        <div className="hg-page-enter">{children}</div>
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
