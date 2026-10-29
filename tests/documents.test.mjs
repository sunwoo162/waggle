import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { prepareDocs } from "../scripts/prepare-docs.mjs";

test("문서·그림을 복사하고 코드·비밀·QA 자료를 제외한다", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "waggle-docs-test-"));
  try {
    const source = path.join(temp, "docs");
    const output = path.join(temp, "public");
    const files = {
      "handbook/index.html": "<h1>와글</h1>",
      "handbook/pages/01-overview.md": "# 소개",
      "handbook/assets/character.png": "image fixture",
      "product/project-planning.md": "# 기획",
      "handbook/_qa/preview.html": "test only",
      "handbook/template.html": "template only",
      "handbook/build_handbook.py": "print('not public')",
      "product/.env": "PRIVATE=hidden",
    };
    for (const [name, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(source, name)), { recursive: true });
      await writeFile(path.join(source, name), content);
    }
    assert.equal((await prepareDocs(source, output)).copied, 4);
    assert.equal(await readFile(path.join(output, "handbook/index.html"), "utf8"), "<h1>와글</h1>");
    await assert.rejects(access(path.join(output, "product/.env")));
    await assert.rejects(access(path.join(output, "handbook/_qa/preview.html")));
    await assert.rejects(access(path.join(output, "handbook/template.html")));
    await assert.rejects(access(path.join(output, "handbook/build_handbook.py")));
  } finally {
    assert.ok(path.resolve(temp).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(temp, { recursive: true, force: true });
  }
});

test("원문이 없으면 빈 문서 사이트를 만들지 않는다", async () => {
  await assert.rejects(prepareDocs("missing-waggle-docs", "missing-waggle-output"), /index\.html/);
});
