import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import "./globals.css";
import "./auth.css";
import "./management.css";

const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-pretendard",
});

export const metadata: Metadata = {
  title: { default: "와글 관리자", template: "%s · 와글" },
  description: "광주소프트웨어마이스터고등학교 전용 Wi-Fi 서비스, 와글의 관리 공간입니다.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body>{children}</body>
    </html>
  );
}
