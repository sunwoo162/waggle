import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../docs/handbook");
const source = await readFile(path.join(root, "index.html"), "utf8");
const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const pages = new Set([...source.matchAll(/data-page="([^"]+)"/g)].map((match) => match[1]));
assert.equal(ids.length, new Set(ids).size, "중복 HTML ID");
assert.equal(pages.size, 14, "프로젝트 홈 + 문서 13개");
assert.equal([...source.matchAll(/class="screen-detail"/g)].length, 34, "화면 명세 34개");
assert.ok(!/@@[A-Z]+@@/.test(source), "남은 템플릿 변수");
const links = [...source.matchAll(/href="([^"]+)"/g)].map((match) =>
  match[1].replaceAll("&amp;", "&"),
);
for (const link of links) {
  if (link.startsWith("#")) {
    const [page, anchor] = decodeURIComponent(link.slice(1)).split("~");
    assert.ok(pages.has(page), `없는 문서 ${link}`);
    if (anchor) assert.ok(ids.includes(anchor), `없는 목차 ${link}`);
  } else if (!/^(?:https?:|mailto:|data:)/.test(link)) {
    await access(path.resolve(root, decodeURIComponent(link.split("#")[0])));
  }
}
console.log(`Documents check passed (13 documents, 34 screens, ${links.length} links).`);
