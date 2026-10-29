"use client";

import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { authClient } from "./auth-client";

export function LoginButton({ enabled }: { enabled: boolean }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  async function signIn() {
    setPending(true);
    setFailed(false);
    try {
      const result = await authClient.signIn.social({
        provider: "datagsm",
        callbackURL: "/admin",
        errorCallbackURL: "/sign-in?reason=provider",
      });
      if (result.error) {
        setFailed(true);
        setPending(false);
      }
    } catch {
      setFailed(true);
      setPending(false);
    }
  }
  return (
    <div className="login-action">
      <button
        className="login-provider-button"
        type="button"
        onClick={signIn}
        disabled={!enabled || pending}
      >
        <span className="dg-mark" aria-hidden="true">
          D
        </span>
        <span>{pending ? "DataGSM으로 이동 중" : "DataGSM으로 로그인"}</span>
        {pending ? (
          <LoaderCircle className="loading-icon" size={18} aria-hidden="true" />
        ) : (
          <ArrowUpRight size={18} aria-hidden="true" />
        )}
      </button>
      <p className="login-action-error" role="status" aria-live="polite">
        {failed ? "로그인을 시작하지 못했어요. 잠시 후 다시 시도해주세요." : ""}
      </p>
    </div>
  );
}
