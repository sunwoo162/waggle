import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAdminAccess } from "./runtime";

export const requireAdmin = cache(async () => {
  const access = await getAdminAccess(await headers());
  if (access.kind !== "authorized") {
    const reason =
      access.kind === "forbidden"
        ? "forbidden"
        : access.kind === "unconfigured"
          ? "setup"
          : access.kind === "unavailable"
            ? "unavailable"
            : "required";
    redirect(`/sign-in?reason=${reason}`);
  }
  return access.user;
});
