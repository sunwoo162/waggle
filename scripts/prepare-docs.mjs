import { access, copyFile, lstat, mkdir, readdir } from "node:fs/promises";
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
  if (output === source || output.startsWith(source + path.sep))
    throw new Error("문서 출력 경로는 원본 밖이어야 합니다.");
  try {
    if ((await lstat(output)).isSymbolicLink())
      throw new Error("문서 출력 경로에 심볼릭 링크를 사용할 수 없습니다.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let copied = 0;
  async function walk(directory, relative = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || entry.name.startsWith(".") || entry.name.startsWith("_"))
        continue;
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), name);
      else if (entry.isFile() && isPublicDocument(name)) {
        const target = path.join(output, ...name.split("/"));
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(path.join(directory, entry.name), target);
        copied++;
      }
    }
  }
  await walk(source);
  return { copied };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await prepareDocs(
    path.join(projectRoot, "docs"),
    path.join(projectRoot, "apps/admin/public/project-docs"),
  );
  console.log(`Prepared ${result.copied} project documents and assets.`);
}
