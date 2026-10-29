"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { authClient } from "./auth-client";

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  async function signOut() {
    setPending(true);
    setFailed(false);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("sign_out_failed");
      window.location.replace("/sign-in");
    } catch {
      setFailed(true);
      setPending(false);
    }
  }
  return (
    <div className="logout-control">
      <button
        type="button"
        onClick={signOut}
        disabled={pending}
        aria-label={pending ? "로그아웃 중" : "로그아웃"}
      >
        <LogOut size={15} aria-hidden="true" />
      </button>
      {failed ? <span role="status">다시 시도해주세요</span> : null}
    </div>
  );
}
