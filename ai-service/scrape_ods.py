#!/usr/bin/env python3
"""
Crawl NIH ODS Dietary Supplement Fact Sheets -> one Markdown file per sheet (with front matter)

Usage:
  python scrape_ods.py                              # all Health Professional sheets
  python scrape_ods.py --limit 2                    # test with the first 2 sheets
  python scrape_ods.py --type Consumer              # Consumer versions
  python scrape_ods.py --type both                  # HealthProfessional + Consumer
  python scrape_ods.py --only VitaminD,Iron,Zinc    # only some sheets (by slug in URL, case-insensitive)
  python scrape_ods.py --year 2025                  # force "year" (otherwise auto-detect, fallback = current year)
  python scrape_ods.py --prefix ods                 # id prefix (default "ods")
  python scrape_ods.py --force                      # re-download existing files
  python scrape_ods.py --keep-refs                  # keep "References" section + [1] citation markers
  python scrape_ods.py --no-summary                 # drop the per-section "Summary:" boxes
  python scrape_ods.py --delay 1.5 --out my-dir
  python scrape_ods.py --offline ods-bundle.json    # no network: read pages saved from your browser (.json bundle or a folder of .html)

Output (default ./ods-data):
  sheets/<id>.md    e.g. sheets/ods_vitamin_d_health_professional.md
  failed.txt        URLs that failed (if any)

Install:  pip install requests beautifulsoup4 markdownify
If you get HTTP 403:  pip install curl_cffi   (used automatically as a fallback)
"""
import argparse
import datetime
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from markdownify import markdownify as to_md

# ====== EDIT HERE: front matter values ======
FRONT = {
    "org": "NIH Office of Dietary Supplements (ODS)",
    "chunk_profile": "structured",
    "by_type": {
        "HealthProfessional": {"lang": "eng", "audience_group": "professional"},
        "Consumer": {"lang": "eng", "audience_group": "general"},
        "DatosEnEspanol": {"lang": "spa", "audience_group": "general"},
    },
}
# ============================================

BASE = "https://ods.od.nih.gov"
LIST_URL = f"{BASE}/factsheets/list-all/"
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://ods.od.nih.gov/",
    "Upgrade-Insecure-Requests": "1",
}
SESSION = requests.Session()
SESSION.headers.update(HEADERS)
try:  # optional fallback for sites that fingerprint TLS: pip install curl_cffi
    from curl_cffi import requests as curl_requests
except Exception:
    curl_requests = None
TYPE_CANON = {"consumer": "Consumer", "healthprofessional": "HealthProfessional", "datosenespanol": "DatosEnEspanol"}

SHEET_HREF_RE = re.compile(r"^/factsheets/([A-Za-z0-9]+)-(Consumer|HealthProfessional|DatosEnEspanol)/?$", re.I)
CITATION_RE = re.compile(r'\s*\[(?:\s*<a\b[^>]*href="#en[^"]*"[^>]*>[^<]*</a>\s*,?\s*)+\]', re.I)
BOILERPLATE_P = [re.compile(r"^This is a (fact sheet|general overview)", re.I),
                 re.compile(r"^For information on .*COVID-19", re.I)]
YEAR_RE = re.compile(r"(?:Updated|Reviewed)\s*:\s*(?:[A-Za-z]+\.?\s+(?:\d{1,2},\s*)?)?((?:19|20)\d{2})")
REMOVE_SELECTOR = ("script,style,noscript,nav,header,footer,form,iframe,svg,img,picture,button,aside,"
                   ".factsheet-toc,.reading-level,.share,.breadcrumbs,.skip,a[href*='exit_disclaimer']")


# ---------- helpers ----------
def humanize(s: str) -> str:
    s = re.sub(r"([a-z])([A-Z0-9])", r"\1 \2", s)
    return re.sub(r"([0-9])([A-Z])", r"\1 \2", s)


def snake(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", humanize(s).lower()).strip("_")


def make_id(prefix: str, slug: str, type_: str) -> str:
    return "_".join(p for p in (prefix, snake(slug), snake(type_)) if p)


def squash(s: str) -> str:
    return " ".join(s.split())


# ---------- network ----------
def _get(url: str) -> str:
    res = SESSION.get(url, timeout=30)
    if res.status_code == 403 and curl_requests is not None:
        res = curl_requests.get(url, impersonate="chrome", timeout=30,
                                headers={"Accept-Language": "en-US,en;q=0.9"})
    res.raise_for_status()
    return res.content.decode("utf-8", errors="replace")


def fetch_text(url: str, tries: int = 3) -> str:
    for t in range(1, tries + 1):
        try:
            return _get(url)
        except Exception as e:
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status == 403:  # retrying will not help
                hint = ("" if curl_requests is not None else
                        " Try: pip install curl_cffi  (the script will then use it automatically).")
                raise RuntimeError(f"403 Forbidden for {url} - the server is blocking this client.{hint}") from e
            if t == tries:
                raise
            time.sleep(1.5 * t)


# ---------- discover links ----------
def extract_sheet_links(html: str, types: list) -> list:
    soup = BeautifulSoup(html, "html.parser")
    found = {}
    for a in soup.select("a[href]"):
        u = urlparse(urljoin(LIST_URL, a["href"]))
        if u.hostname != "ods.od.nih.gov":
            continue
        m = SHEET_HREF_RE.match(u.path)
        if not m:
            continue
        slug, type_ = m.group(1), TYPE_CANON[m.group(2).lower()]
        if type_ not in types:
            continue
        key = f"{slug}-{type_}".lower()
        found.setdefault(key, {"slug": slug, "type": type_, "url": BASE + u.path.rstrip("/")})
    return list(found.values())


# ---------- html -> markdown ----------
def html_to_markdown(raw_html: str, slug: str = "", keep_refs: bool = False, no_summary: bool = False):
    html = raw_html if keep_refs else CITATION_RE.sub("", raw_html)
    soup = BeautifulSoup(html, "html.parser")

    m = YEAR_RE.search(squash(soup.get_text(" ")))
    year = m.group(1) if m else None

    h1 = soup.find("h1")
    title = squash(h1.get_text()) if h1 else ""
    if not title and soup.title:
        title = re.sub(r"\s*[-–—|:]\s*(Health Professional|Consumer|Datos|Fact Sheet|Office of Dietary).*$", "",
                       squash(soup.title.get_text()), flags=re.I).strip()
    if not title and slug:
        title = humanize(slug)

    root = None
    for sel in ("#fact-sheet", "#maincontent", "main", "#content", ".content", "article"):
        el = soup.select_one(sel)
        if el is not None and len(el.get_text().strip()) > 500:
            root = el
            break
    if root is None:
        root = soup.body or soup

    for el in root.select(REMOVE_SELECTOR):
        el.extract()
    for el in root.select("#ref, #disc"):
        if not re.fullmatch(r"h[1-6]", el.name or "", re.I):
            el.extract()
    for el in root.find_all("h1"):
        el.extract()
    for p in root.find_all("p")[:3]:
        t = squash(p.get_text())
        if any(r.search(t) for r in BOILERPLATE_P):
            p.extract()

    # per-section summary boxes
    for el in root.select(".factsheet-summary"):
        if no_summary:
            el.extract()
            continue
        p = soup.new_tag("p")
        strong = soup.new_tag("strong")
        strong.string = "Summary:"
        p.append(strong)
        p.append(" " + squash(el.get_text()))
        el.replace_with(p)

    # tables: caption -> bold line before, tfoot -> notes after, flat cells, header row
    for t in root.find_all("table"):
        cap_el = t.find("caption")
        cap = squash(cap_el.get_text()) if cap_el else ""
        notes = [squash(c.get_text()) for c in t.select("tfoot td, tfoot th")]
        notes = [n for n in notes if n]
        for el in t.select("caption, tfoot"):
            el.extract()
        for br in t.find_all("br"):
            br.replace_with(" ")
        for c in t.find_all(["th", "td"]):
            txt = squash(c.get_text()).replace("|", "/")
            c.clear()
            c.string = txt
        first = t.find("tr")
        if first is not None and not first.find("th"):
            for c in first.find_all("td"):
                c.name = "th"
        if cap:
            p = soup.new_tag("p")
            b = soup.new_tag("strong")
            b.string = cap
            p.append(b)
            t.insert_before(p)
        anchor = t
        for n in notes:
            p = soup.new_tag("p")
            p.string = n
            anchor.insert_after(p)
            anchor = p

    md = to_md(str(root), heading_style="ATX", bullets="-", strip=["a", "img"])
    md = md.replace("\u00a0", " ")
    md = re.sub(r"[ \t]+\n", "\n", md)
    md = re.sub(r"^(\s*)-\s{2,}", r"\1- ", md, flags=re.M)
    md = md.replace(",.", ".")
    md = re.sub(r"\n{3,}", "\n\n", md).strip()
    return title, md, year


def drop_section(md: str, name: str) -> str:
    lines = md.split("\n")
    pat = re.compile(rf"^#{{2,4}}\s*{name}\s*$", re.I)
    idx = next((i for i, l in enumerate(lines) if pat.match(l.strip())), -1)
    if idx < 0:
        return md
    level = len(re.match(r"^#+", lines[idx]).group(0))
    end = len(lines)
    for i in range(idx + 1, len(lines)):
        m = re.match(r"^(#{1,6})\s", lines[i])
        if m and len(m.group(1)) <= level:
            end = i
            break
    return "\n".join(lines[:idx] + lines[end:]).strip()


# ---------- output ----------
def q(v) -> str:
    return json.dumps(str(v), ensure_ascii=False)


def build_sheet_markdown(id_, title, md, url, type_, year, keep_refs=False) -> str:
    t = FRONT["by_type"][type_]
    front = "\n".join([
        "---",
        f"id: {id_}",
        f"title: {q(title)}",
        f"org: {q(FRONT['org'])}",
        f"year: {q(year)}",
        f"url: {q(url)}",
        f"lang: {t['lang']}",
        f"audience_group: {t['audience_group']}",
        f"chunk_profile: {FRONT['chunk_profile']}",
        "---",
        "",
    ])
    body = drop_section(md if keep_refs else drop_section(md, "references"), "disclaimer")
    return f"{front}\n# {title}\n\n{body}\n"


# ---------- offline input ----------
def load_offline(path: str) -> list:
    """Read pages saved from a browser: a .json bundle {"VitaminD-HealthProfessional": "<html>"} or a folder of
    files named like VitaminD-HealthProfessional.html"""
    p = Path(path)
    if p.is_dir():
        pairs = [(f.stem, f.read_text(encoding="utf-8", errors="replace")) for f in sorted(p.glob("*.htm*"))]
    else:
        pairs = list(json.loads(p.read_text(encoding="utf-8")).items())
    items = []
    for key, html in pairs:
        m = re.match(r"^([A-Za-z0-9]+)-(Consumer|HealthProfessional|DatosEnEspanol)$", key.strip(), re.I)
        if not m:
            print(f"skip '{key}': name must look like VitaminD-HealthProfessional", file=sys.stderr)
            continue
        slug, type_ = m.group(1), TYPE_CANON[m.group(2).lower()]
        items.append({"slug": slug, "type": type_, "url": f"{BASE}/factsheets/{slug}-{type_}", "html": html})
    return items


# ---------- main ----------
def parse_args(argv):
    ap = argparse.ArgumentParser(description="NIH ODS fact sheets -> Markdown")
    ap.add_argument("--type", default="HealthProfessional")
    ap.add_argument("--out", default="ods-data")
    ap.add_argument("--delay", type=float, default=1.0, help="seconds between requests")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--only", default=None, help="comma-separated slugs, e.g. VitaminD,Iron")
    ap.add_argument("--year", default=None)
    ap.add_argument("--prefix", default="ods")
    ap.add_argument("--keep-refs", action="store_true")
    ap.add_argument("--no-summary", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--offline", default=None, help="path to .json bundle or folder of .html (no network)")
    o = ap.parse_args(argv)
    t = o.type.lower()
    o.types = ["HealthProfessional", "Consumer"] if t == "both" else [TYPE_CANON.get(t)]
    if not o.types[0]:
        ap.error("--type must be HealthProfessional | Consumer | DatosEnEspanol | both")
    o.only = [s.strip().lower() for s in o.only.split(",") if s.strip()] if o.only else None
    return o


def main(argv=None):
    opt = parse_args(sys.argv[1:] if argv is None else argv)
    sheets_dir = Path(opt.out) / "sheets"
    sheets_dir.mkdir(parents=True, exist_ok=True)

    if opt.offline:
        print(f"Offline mode: reading {opt.offline}")
        links = [l for l in load_offline(opt.offline) if l["type"] in opt.types]
    else:
        print(f"Fetching index: {LIST_URL}")
        links = extract_sheet_links(fetch_text(LIST_URL), opt.types)
    if opt.only:
        links = [l for l in links if l["slug"].lower() in opt.only]
    if opt.limit is not None:
        links = links[: opt.limit]
    print(f"Found {len(links)} fact sheets ({'+'.join(opt.types)})")
    if not links:
        sys.exit("No links found. Page structure may have changed.")

    failed, no_year, ok = [], [], 0
    for i, l in enumerate(links, 1):
        id_ = make_id(opt.prefix, l["slug"], l["type"])
        file = sheets_dir / f"{id_}.md"
        tag = f"[{i}/{len(links)}] {id_}"
        if file.exists() and not opt.force:
            print(f"{tag} (cached)")
            continue
        try:
            html = l.get("html") or fetch_text(l["url"])
            title, md, found_year = html_to_markdown(html, slug=l["slug"], keep_refs=opt.keep_refs, no_summary=opt.no_summary)
            if len(md) < 500:
                raise ValueError(f"content too short ({len(md)} chars) - selector may be wrong")
            year = opt.year or found_year
            if not year:
                year = str(datetime.date.today().year)
                no_year.append(id_)
            file.write_text(build_sheet_markdown(id_, title, md, l["url"], l["type"], year, opt.keep_refs), encoding="utf-8")
            print(f"{tag} ok ({len(md)} chars, year {year})")
            ok += 1
        except Exception as e:
            print(f"{tag} FAILED: {e}", file=sys.stderr)
            failed.append(f"{l['url']}\t{e}")
        if not opt.offline:
            time.sleep(opt.delay)

    if failed:
        (Path(opt.out) / "failed.txt").write_text("\n".join(failed) + "\n", encoding="utf-8")
    print(f"\nDone: {ok} written, {len(failed)} failed -> {sheets_dir}/")
    if no_year:
        print(f'Note: no "Updated/Reviewed" date found on {len(no_year)} page(s); used current year. Use --year to override.')


if __name__ == "__main__":
    main()