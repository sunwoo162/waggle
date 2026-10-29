import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./auth.css";

export const metadata: Metadata = {
  title: { default: "와글 관리자", template: "%s · 와글" },
  description: "학교의 전파는 즐겁게. 와글 프로젝트 관리 공간입니다.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
