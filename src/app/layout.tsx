import type { Metadata, Viewport } from "next";
import "../../styles/global.css";

export const metadata: Metadata = {
  title: "Reels Studio",
  description: "AI 숏폼 제작·검수·Instagram Reels 예약 발행",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#17171c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="dark">
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
