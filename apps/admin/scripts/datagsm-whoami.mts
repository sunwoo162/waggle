// Prints the operator's own DataGSM account id after one sign-in. Stores nothing.
import { spawn } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import http from "node:http";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { readOwnAccountId, whoamiAuthorizeUrl } from "../src/server/auth/whoami";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
nextEnv.loadEnvConfig(appRoot);
const clientId = process.env.DATAGSM_CLIENT_ID?.trim() ?? "";
const base = new URL(process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3000");
if (!clientId) {
  console.error("apps/admin/.env.local에 DATAGSM_CLIENT_ID를 먼저 입력하세요.");
  process.exit(1);
}
if (base.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(base.hostname)) {
  console.error("이 명령은 로컬 개발 주소(http://localhost:포트)에서만 사용합니다.");
  process.exit(1);
}
const redirectUri = `${base.origin}/api/auth/callback/datagsm`;
const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const state = randomBytes(24).toString("base64url");
const url = whoamiAuthorizeUrl({ clientId, redirectUri, state, challenge });

const page = (text: string) =>
  `<!doctype html><meta charset="utf-8"><title>와글</title><p style="font:16px sans-serif">${text}</p>`;
let done = false;
const server = http.createServer(async (request, response) => {
  const incoming = new URL(request.url ?? "/", base.origin);
  if (incoming.pathname !== "/api/auth/callback/datagsm") {
    response.writeHead(404).end();
    return;
  }
  const got = Buffer.from(incoming.searchParams.get("state") ?? "");
  const code = incoming.searchParams.get("code");
  const expected = Buffer.from(state);
  // A request without this run's state (a stray link, a reload after finishing) never ends the run.
  if (done || got.length !== expected.length || !timingSafeEqual(got, expected)) {
    response.writeHead(400, { "cache-control": "no-store" }).end();
    return;
  }
  done = true;
  const id = code ? await readOwnAccountId(fetch, { code, clientId, redirectUri, verifier }) : null;
  response
    .writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" })
    .end(
      page(id ? "확인했습니다. 터미널로 돌아가세요." : "확인하지 못했습니다. 터미널을 확인하세요."),
    );
  if (id) {
    console.log(`\nDataGSM 계정 ID: ${id}`);
    console.log("apps/admin/.env.local의 WAGGLE_ADMIN_DATAGSM_ID= 뒤에 이 숫자를 넣으세요.");
  } else {
    console.error(
      "\n계정 ID를 확인하지 못했습니다. 클라이언트 ID·리다이렉트 URL 등록을 확인하세요.",
    );
    process.exitCode = 1;
  }
  server.close();
});
server.on("error", (error: NodeJS.ErrnoException) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `${base.port || 80}번 포트를 쓸 수 없습니다. 실행 중인 와글 서버(npm run dev)를 끄고 다시 실행하세요.`
      : `${base.port || 80}번 포트에서 대기하지 못했습니다(${error.code ?? "알 수 없음"}).`,
  );
  process.exit(1);
});
server.listen(Number(base.port || 80), "127.0.0.1", () => {
  console.log("브라우저에서 DataGSM 로그인을 마치세요. 5분 안에 끝내야 합니다.");
  console.log(`브라우저가 열리지 않으면 이 주소를 여세요:\n${url}`);
  if (process.platform === "win32")
    spawn("rundll32", ["url.dll,FileProtocolHandler", url], {
      stdio: "ignore",
      detached: true,
    }).unref();
});
setTimeout(() => {
  console.error("시간이 지나 종료했습니다. 다시 실행하세요.");
  process.exit(1);
}, 5 * 60_000).unref();
