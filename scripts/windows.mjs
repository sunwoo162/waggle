import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  console.error("Windows 빌드·OS 보호 검사는 Windows에서 실행해주세요.");
  process.exit(1);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const local = path.join(root, ".tools", "dotnet", "dotnet.exe");
const command = existsSync(local) ? local : "dotnet";
const cwd = path.join(root, "apps", "windows");
const mode = process.argv[2];
const steps = {
  build: [
    ["restore", "Waggle.slnx", "--locked-mode"],
    ["build", "Waggle.slnx", "-c", "Release", "--no-restore"],
  ],
  check: [
    ["restore", "Waggle.slnx", "--locked-mode"],
    ["build", "Waggle.slnx", "-c", "Release", "--no-restore"],
    ["test", "Waggle.Tests/Waggle.Tests.csproj", "-c", "Release", "--no-build", "--no-restore"],
    ["format", "whitespace", "Waggle.slnx", "--verify-no-changes", "--no-restore"],
  ],
  run: [
    [
      "run",
      "--project",
      "Waggle.Windows/Waggle.Windows.csproj",
      "-c",
      "Release",
      "--no-launch-profile",
    ],
  ],
}[mode];
if (!steps) process.exit(1);
for (const args of steps) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" },
  });
  if (result.error || result.status !== 0) {
    if (result.error)
      console.error(
        ".NET 10 SDK를 확인해주세요. apps/windows/README.md에 설치·실행 안내가 있습니다.",
      );
    process.exit(result.status || 1);
  }
}
