from pathlib import Path
import base64
import html
import json
import os
import re
import shutil
import subprocess
from handbook_content import build_pages

HERE = Path(__file__).resolve().parent
DOCS = HERE.parent
WORKSPACE = DOCS.parent
NODE = os.environ.get("NODE_BINARY", "node")

def escape(value):
    return html.escape(str(value), quote=True)

def main():
    pages, screen_records = build_pages(DOCS)
    inputs = [page["markdown"] for page in pages] + [s["body"] for s in screen_records]
    result = subprocess.run([NODE, str(HERE / "render-markdown.mjs")],
                            input=json.dumps(inputs, ensure_ascii=False),
                            capture_output=True, text=True, encoding="utf-8", check=True)
    rendered = json.loads(result.stdout)
    assert len(rendered) == len(inputs)
    page_map = {page["id"]: page for page in pages}
    route_by_source = {
        str((DOCS / "product/project-planning.md").resolve()): "overview",
        str((DOCS / "superpowers/specs/2026-10-29-campus-wifi-design.md").resolve()): "policies",
        str((DOCS / "design/design-system.md").resolve()): "design",
        str((DOCS / "design/2026-10-29-figma-screen-brief.md").resolve()): "screens",
        str((DOCS / "research/2026-10-29-datagsm-data.md").resolve()): "research",
    }
    groups = ["기획", "설계", "진행과 운영", "참고"]
    glyphs = {"overview":"◻", "features":"≡", "policies":"§", "architecture":"◇", "api":"⌘",
              "screens":"▦", "design":"◉", "validation":"✓", "roadmap":"↗",
              "operations":"▤", "decisions":"☷", "research":"◌", "resources":"↗"}

    def base_file(page):
        return DOCS / page["source"] if page.get("source") else HERE / "_inline.md"

    def local_path(url, page):
        return (base_file(page).parent / url).resolve()

    def convert_link(match, page):
        raw = html.unescape(match.group(1))
        if raw.startswith(("https://", "http://")):
            return 'href="' + escape(raw) + '" target="_blank" rel="noopener noreferrer"'
        if raw.startswith(("#", "mailto:", "data:")):
            return 'href="' + escape(raw) + '"'
        resolved = local_path(raw, page)
        if str(resolved) in route_by_source:
            return 'href="#' + route_by_source[str(resolved)] + '"'
        relative = os.path.relpath(resolved, HERE).replace("\\", "/")
        return 'href="' + escape(relative) + '"'

    def wrap_tables(body):
        return re.sub(r"(<table>[\s\S]*?</table>)", r'<div class="table-wrap">\1</div>', body)

    def decorate(body, page):
        body = re.sub(r'href="([^"]+)"', lambda match: convert_link(match, page), body)
        body = wrap_tables(body)
        toc = []
        def heading(match):
            level, text = match.group(1), match.group(2)
            anchor = "section-" + page["id"] + "-" + str(len(toc) + 1)
            label = html.unescape(re.sub("<[^>]+>", "", text))
            toc.append(dict(level=level, label=label, anchor=anchor))
            return "<h" + level + ' id="' + anchor + '">' + text + "</h" + level + ">"
        body = re.sub(r"<h([23])>([\s\S]*?)</h\1>", heading, body)
        return body, toc

    article_html, navigation = [], []
    export_dir = HERE / "pages"
    export_dir.mkdir(parents=True, exist_ok=True)
    for index, page in enumerate(pages):
        if page["id"] == "screens":
            body = '<aside class="doc-note proposed"><span>구성안</span><p>기본 화면 34종과 상태 변형입니다. 항목을 누르면 설명을 펼칠 수 있습니다.</p></aside>'
            names = {"M": "Android 학생 앱 17종", "W": "Windows 학생 앱 6종", "A": "관리자 웹 11종"}
            for prefix, group_name in names.items():
                body += "<h2>" + group_name + '</h2><div class="screen-list">'
                for record_index, record in enumerate(screen_records):
                    if not record["id"].startswith(prefix):
                        continue
                    details = wrap_tables(rendered[len(pages) + record_index])
                    body += '<details class="screen-detail" id="screen-' + record["id"] + '"><summary><span class="screen-code">' + record["id"] + "</span><span>" + escape(record["title"]) + '</span><span class="screen-plus" aria-hidden="true">+</span></summary><div class="screen-body">' + details + "</div></details>"
                body += "</div>"
        else:
            body = rendered[index]

        if page["id"] == "design":
            swatches = [("Canvas", "#ffffff"), ("Prime 500", "#0bb7ae"), ("Pink", "#fc6589"), ("Foreground", "#233237")]
            body = '<div class="swatches">' + "".join('<div class="swatch"><div class="swatch-color" style="--swatch:' + value + '"></div><div class="swatch-label"><b>' + label + "</b><span>" + value + "</span></div></div>" for label, value in swatches) + "</div>" + body

        body, toc = decorate(body, page)
        toc_html = "".join('<a class="level' + t["level"] + '" href="#' + page["id"] + "~" + t["anchor"] + '">' + escape(t["label"]) + "</a>" for t in toc)
        source_link = ""
        if page.get("source"):
            relative = os.path.relpath(DOCS / page["source"], HERE).replace("\\", "/")
            source_link = ' · <a href="' + escape(relative) + '">기획 원문 ↗</a>'
        file_name = "{:02d}-{}.md".format(index + 1, page["id"])
        export_body = page["markdown"]
        def export_link(match):
            url = match.group(2)
            if url.startswith(("http://", "https://", "#", "mailto:")):
                return match.group(0)
            target = local_path(url, page)
            return "[" + match.group(1) + "](" + os.path.relpath(target, export_dir).replace("\\", "/") + ")"
        export_body = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", export_link, export_body)
        export_body = re.sub(r'<aside class="doc-note [^"]+"><span>(.*?)</span><p>(.*?)</p></aside>',
                             lambda m: "> **" + m.group(1) + "** " + m.group(2), export_body)
        (export_dir / file_name).write_text("# " + page["title"] + "\n\n" + page["summary"] + "\n\n" + export_body, encoding="utf-8")

        header = '<header class="doc-header"><div class="eyebrow">' + page["eyebrow"] + "</div><h1>" + escape(page["title"]) + '</h1><p class="doc-summary">' + escape(page["summary"]) + '</p><div class="doc-meta"><span class="status-badge neutral">' + escape(page["badge"]) + '</span><span>2026.10.29 기준' + source_link + "</span></div></header>"
        end = '<footer class="doc-end"><a href="#home">← 프로젝트 홈</a><a href="pages/' + file_name + '">Markdown 원문 보기 ↗</a></footer>'
        article_html.append('<div class="reading-grid" data-page="' + page["id"] + '" id="page-' + page["id"] + '" hidden><article class="document">' + header + '<div class="prose">' + body + "</div>" + end + '</article><nav class="toc" aria-label="현재 문서 목차"><h2>이 문서에서</h2>' + toc_html + "</nav></div>")
        page["file"] = file_name

    for group in groups:
        links = ""
        for page in pages:
            if page["group"] == group:
                terms = page["title"] + " " + page["summary"]
                links += '<a class="nav-link" href="#' + page["id"] + '" data-nav="' + page["id"] + '" data-search="' + escape(terms) + '"><span class="nav-symbol" aria-hidden="true">' + glyphs[page["id"]] + "</span>" + escape(page["title"]) + "</a>"
        navigation.append('<section class="nav-group"><h2>' + group + "</h2>" + links + "</section>")

    home_groups = ""
    for group_index, group in enumerate(groups):
        links = ""
        for page in pages:
            if page["group"] == group:
                links += '<a class="doc-link" href="#' + page["id"] + '"><span><b>' + escape(page["title"]) + "</b><small>" + escape(page["badge"]) + '</small></span><span class="arrow" aria-hidden="true">↗</span></a>'
        home_groups += '<section class="doc-group"><h2><span class="group-index">0' + str(group_index + 1) + "</span>" + group + '</h2><div class="doc-links">' + links + "</div></section>"

    assets = HERE / "assets"
    assets.mkdir(exist_ok=True)
    source_art = WORKSPACE / ".superpowers/brainstorm/1581-1793232928/content/assets/wifi-mascots.png"
    art_file = assets / "wifi-characters.png"
    if source_art.exists():
        shutil.copy2(source_art, art_file)
    if not art_file.exists():
        raise FileNotFoundError("Character reference image missing")
    art_uri = "data:image/png;base64," + base64.b64encode(art_file.read_bytes()).decode("ascii")

    metadata = {page["id"]: {key:page[key] for key in ("title", "group", "badge")} for page in pages}
    document = (HERE / "template.html").read_text(encoding="utf-8")
    replacements = {"@@ART@@":art_uri, "@@NAV@@":"".join(navigation), "@@HOMEGROUPS@@":home_groups,
                    "@@ARTICLES@@":"".join(article_html), "@@META@@":json.dumps(metadata, ensure_ascii=False).replace("</", "<\\/")}
    for key, value in replacements.items():
        document = document.replace(key, value)
    if re.search(r"@@[A-Z]+@@", document):
        raise RuntimeError("Unresolved template placeholder")
    ids = re.findall(r'\bid="([^"]+)"', document)
    if len(ids) != len(set(ids)):
        raise RuntimeError("Duplicate HTML element IDs")
    (HERE / "index.html").write_text(document, encoding="utf-8")

    links = ["# 와글 프로젝트 문서", "", "기준일 2026-10-29 · 기획 검토안", "",
             "브라우저용 [문서 허브](index.html)를 열면 목차와 하위 문서를 탐색할 수 있습니다. 완성된 HTML은 캐릭터 그림과 내용을 포함해 별도 설치 없이 열 수 있습니다.", "",
             "## 문서 목록", ""]
    for group in groups:
        links.extend(["### " + group, ""])
        for page in pages:
            if page["group"] == group:
                links.append("- [" + page["title"] + "](pages/" + page["file"] + ") · " + page["badge"])
        links.append("")
    links.extend(["## 문서 갱신", "", "루트에서 npm ci 후 npm run docs:build로 재생성합니다. Python 3.11+와 Node.js 22를 사용하며, Markdown 변환은 잠금 파일에 고정된 marked 패키지를 사용합니다. 기획·디자인 원문과 handbook_content.py가 편집 원본이고 pages 폴더는 내보내기 결과입니다.", "",
                  "원본 구성 참고: [TEAM GSM SERVER](https://app.notion.com/p/TEAM-GSM-SERVER-c0993fbd192d823a9ca201733be710ab?source=copy_link)", ""])
    (HERE / "README.md").write_text("\n".join(links), encoding="utf-8")
    print(json.dumps(dict(documents=len(pages), screens=len(screen_records), html_bytes=len(document.encode("utf-8")), output=str(HERE / "index.html")), ensure_ascii=False))

if __name__ == "__main__":
    main()

