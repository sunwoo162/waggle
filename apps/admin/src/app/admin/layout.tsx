import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin-shell";
import { requireAdmin } from "@/server/auth/guard";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const operator = await requireAdmin();
  return <AdminShell operatorName={operator.name}>{children}</AdminShell>;
}
