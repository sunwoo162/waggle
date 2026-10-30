"use client";

import { BookOpen, KeyRound, LayoutDashboard, MapPin, Radio, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", title: "프로젝트 시작", icon: LayoutDashboard },
  { href: "/admin/networks", title: "네트워크", icon: Radio },
  { href: "/admin/access-points", title: "AP 위치", icon: MapPin },
  { href: "/admin/characters", title: "도감 관리", icon: Sparkles },
  { href: "/admin/invites", title: "개인 코드", icon: KeyRound },
  { href: "/admin/documents", title: "프로젝트 문서", icon: BookOpen },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="관리자 메뉴">
      {items.map(({ href, title, icon: Icon }) => (
        <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
          <Icon size={18} aria-hidden="true" />
          <span>{title}</span>
        </Link>
      ))}
    </nav>
  );
}
