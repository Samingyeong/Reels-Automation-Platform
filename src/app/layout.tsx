import type { Metadata, Viewport } from "next";
import "../../styles/global.css";
import { isTemporaryInlineMode } from "@/server/runtime-mode";

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
      <body className="min-h-dvh font-sans">
        {isTemporaryInlineMode() ? (
          <div className="bg-amber-500/15 px-4 py-2 text-center text-xs text-amber-300" data-testid="temporary-mode-banner">
            임시 실행 모드: 작업 서버(Trigger.dev) 연결 전이라 웹 서버에서 직접 실행합니다. 최종 MP4 렌더는 작업 서버 연결 후 진행됩니다.
          </div>
        ) : null}
        {children}
      </body>
    </html>
  );
}
