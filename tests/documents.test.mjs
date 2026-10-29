import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { validateHandbook } from "../scripts/check-docs.mjs";
import { prepareDocs } from "../scripts/prepare-docs.mjs";

test("문서·그림을 복사하고 코드·비밀·QA 자료를 제외한다", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "waggle-docs-test-"));
  try {
    const source = path.join(temp, "docs");
    const output = path.join(temp, "public", "project-docs");
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
    await unlink(path.join(source, "handbook/pages/01-overview.md"));
    await prepareDocs(source, output);
    await assert.rejects(access(path.join(output, "handbook/pages/01-overview.md")));
  } finally {
    assert.ok(path.resolve(temp).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(temp, { recursive: true, force: true });
  }
});

test("원문이 없으면 빈 문서 사이트를 만들지 않는다", async () => {
  await assert.rejects(prepareDocs("missing-waggle-docs", "missing-waggle-output"), /index\.html/);
});

test("관리 출력 디렉터리가 아니면 기존 파일을 정리하지 않는다", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "waggle-output-test-"));
  try {
    const source = path.join(temp, "docs");
    const unmanaged = path.join(temp, "other-work");
    await mkdir(path.join(source, "handbook"), { recursive: true });
    await mkdir(unmanaged);
    await writeFile(path.join(source, "handbook/index.html"), "<h1>와글</h1>");
    await writeFile(path.join(unmanaged, "keep.md"), "keep");
    await assert.rejects(prepareDocs(source, unmanaged), /public\/project-docs/);
    assert.equal(await readFile(path.join(unmanaged, "keep.md"), "utf8"), "keep");
  } finally {
    assert.ok(path.resolve(temp).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(temp, { recursive: true, force: true });
  }
});

test("원본에만 있고 공개 대상에서 제외된 링크는 실패한다", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "waggle-links-test-"));
  try {
    const source = path.join(temp, "docs");
    const output = path.join(temp, "public", "project-docs");
    await mkdir(path.join(source, "handbook"), { recursive: true });
    await mkdir(path.join(source, "superpowers/plans"), { recursive: true });
    const linked =
      '<section id="page-home" data-page="home"><a href="../superpowers/plans/internal.md">계획</a></section>';
    await writeFile(path.join(source, "handbook/index.html"), linked);
    await writeFile(path.join(source, "superpowers/plans/internal.md"), "# 내부 작업 계획");
    await prepareDocs(source, output);
    await assert.rejects(validateHandbook(path.join(output, "handbook")), /internal\.md/);
    await writeFile(
      path.join(source, "handbook/index.html"),
      '<section id="page-home" data-page="home"><a href="#home">홈</a></section>',
    );
    await prepareDocs(source, output);
    assert.equal((await validateHandbook(path.join(output, "handbook"))).links, 1);
  } finally {
    assert.ok(path.resolve(temp).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(temp, { recursive: true, force: true });
  }
});
