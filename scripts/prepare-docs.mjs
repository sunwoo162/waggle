import { access, copyFile, lstat, mkdir, readdir, rmdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function isPublicDocument(relative) {
  if (relative.split("/").some((part) => part.startsWith(".") || part.startsWith("_")))
    return false;
  return (
    /^handbook\/(?:index\.html|README\.md|pages\/[^/]+\.md|assets\/[^/]+\.png)$/.test(relative) ||
    /^(?:design|product|research|development|superpowers\/specs)\/.+\.md$/.test(relative)
  );
}

export async function prepareDocs(sourceRoot, outputRoot) {
  const source = path.resolve(sourceRoot);
  const output = path.resolve(outputRoot);
  await access(path.join(source, "handbook/index.html"));
  if (path.basename(output) !== "project-docs" || path.basename(path.dirname(output)) !== "public")
    throw new Error("관리 대상 출력은 public/project-docs 디렉터리여야 합니다.");
  if (output === source || output.startsWith(source + path.sep))
    throw new Error("문서 출력 경로는 원본 밖이어야 합니다.");
  for (let current = output; ; current = path.dirname(current)) {
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error("문서 출력 경로에 심볼릭 링크를 사용할 수 없습니다.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (path.dirname(current) === current) break;
  }
  const allowed = new Set();
  async function walk(directory, relative = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || entry.name.startsWith(".") || entry.name.startsWith("_"))
        continue;
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), name);
      else if (entry.isFile() && isPublicDocument(name)) {
        allowed.add(name);
      }
    }
  }
  await walk(source);
  await mkdir(output, { recursive: true });
  async function reconcile(directory, relative = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.resolve(directory, entry.name);
      const contained = path.relative(output, target);
      if (contained.startsWith("..") || path.isAbsolute(contained))
        throw new Error("문서 출력 경로를 벗어났습니다.");
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) await unlink(target);
      else if (entry.isDirectory()) {
        await reconcile(target, name);
        if ((await readdir(target)).length === 0) await rmdir(target);
      } else if (!allowed.has(name)) await unlink(target);
    }
  }
  await reconcile(output);
  for (const name of allowed) {
    const target = path.join(output, ...name.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(source, ...name.split("/")), target);
  }
  return { copied: allowed.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await prepareDocs(
    path.join(projectRoot, "docs"),
    path.join(projectRoot, "apps/admin/public/project-docs"),
  );
  console.log(`Prepared ${result.copied} project documents and assets.`);
}
