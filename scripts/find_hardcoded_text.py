#!/usr/bin/env python3
"""

Scan the agent app for hardcoded user-visible text in TSX/TS files.

Detects:

  1. JSX text content between tags:  >Some text<  or  >Some text{

  2. String prop values for common UI props: placeholder, title, label, aria-label, etc.

  3. Fallback strings in translations:  translations.someKey || "Fallback text"

Excludes:

  - Comments

  - Translation key lookups (translations.xxx)

  - Class names, hrefs, data-* values, import paths, test IDs

  - Pure numbers, symbols, abbreviations, URLs, single words (likely identifiers)

  - Strings inside __tests__ / node_modules

"""
import re
import sys
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
SCAN_DIRS = [
    ROOT / 'app',
    ROOT / 'pages',
    ROOT / 'components',
]
REPORT_PATH = Path(__file__).resolve().parent / 'hardcoded_text_report.json'
# Props whose string values are user-visible
UI_PROPS = {
    'placeholder', 'title', 'label', 'aria-label', 'aria-description',
    'tooltip', 'alt', 'content', 'description', 'emptyText', 'emptyMessage',
}
# Strings to skip outright (not user-visible)
SKIP_PATTERNS = [
    re.compile(r'^https?://'),                    # URLs
    re.compile(r'^/'),                             # paths
    re.compile(r'^\w+[-_]\w+$'),                  # kebab-case / snake_case identifiers
    re.compile(r'^[A-Z_]{2,}$'),                  # ALL_CAPS constants
    re.compile(r'^\d[\d.,\s%/-]*$'),              # numbers / ranges
    re.compile(r'^[+\-=<>/*#@!?|~^&%]{1,4}$'),   # symbols
    re.compile(r'^[a-z]+\.[a-z]'),                # dotted paths (e.g. org.slug)
    re.compile(r'^\w+\(\)$'),                     # function call strings
    re.compile(r'^#[0-9a-fA-F]{3,6}$'),          # hex colours
    re.compile(r'^(true|false|null|undefined)$'), # JS literals
]
MIN_WORDS = 2   # require at least 2 words to flag (avoids single-word identifiers)
SUFFIXES = {'.tsx', '.ts'}
EXCLUDE_DIRS = {'node_modules', '__tests__', '.next', 'coverage', 'dist'}


def should_skip(text: str) -> bool:
    text = text.strip()
    if not text or len(text) < 3:
        return True
    for p in SKIP_PATTERNS:
        if p.search(text):
            return True
    # Skip if it doesn't contain at least MIN_WORDS real words
    words = re.findall(r"[a-zA-Z]{2,}", text)
    if len(words) < MIN_WORDS:
        return True
    return False


def scan_file(path: Path) -> list[dict]:
    findings = []
    try:
        source = path.read_text(encoding='utf-8')
    except Exception:
        return findings
    rel = str(path.relative_to(ROOT))
    lines = source.splitlines()
    for lineno, line in enumerate(lines, start=1):
        stripped = line.strip()
        # Skip comment lines
        if stripped.startswith('//') or stripped.startswith('*') or stripped.startswith('/*'):
            continue
        # 1. JSX text content: >Some visible text<  or  >Some text{
        for m in re.finditer(r'>([^<>{}\n]{4,}?)(?=[<{])', line):
            text = m.group(1).strip()
            # Skip if it contains code-like characters
            if any(c in text for c in '{}()[];=\\'):
                continue
            if should_skip(text):
                continue
            findings.append({'file': rel, 'line': lineno, 'type': 'jsx_text', 'text': text})
        # 2. UI prop string values:  placeholder="Some text"  or  placeholder={'Some text'}
        for prop in UI_PROPS:
            for m in re.finditer(
                rf'''{re.escape(prop)}=(?:"([^"{{}}\\n]{{3,}})"|{{['"]([^'"{{}}\\\n]{{3,}})['"]}}|{{`([^`{{}}\\\n]{{3,}})`}})''',
                line,
            ):
                text = (m.group(1) or m.group(2) or m.group(3) or '').strip()
                if not text or 'translations.' in line[max(0, m.start()-20):m.start()]:
                    continue
                if should_skip(text):
                    continue
                findings.append({'file': rel, 'line': lineno, 'type': f'prop:{prop}', 'text': text})
        # 3. Fallback strings:  translations.someKey || "Fallback text"
        for m in re.finditer(r'translations\.\w+\s*\|\|\s*["\']([^"\']{4,})["\']', line):
            text = m.group(1).strip()
            if should_skip(text):
                continue
            findings.append({'file': rel, 'line': lineno, 'type': 'translation_fallback', 'text': text})
    return findings


def main():
    all_findings = []
    for scan_dir in SCAN_DIRS:
        if not scan_dir.exists():
            continue
        for path in scan_dir.rglob('*'):
            if path.suffix not in SUFFIXES:
                continue
            if any(part in EXCLUDE_DIRS for part in path.parts):
                continue
            all_findings.extend(scan_file(path))
    # Group by file for readability
    by_file: dict[str, list] = {}
    for f in all_findings:
        by_file.setdefault(f['file'], []).append(
            {'line': f['line'], 'type': f['type'], 'text': f['text']}
        )
    report = {
        'total': len(all_findings),
        'files_affected': len(by_file),
        'findings': by_file,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f"Scanned {sum(1 for _ in (p for d in SCAN_DIRS if d.exists() for p in d.rglob('*') if p.suffix in SUFFIXES and not any(x in EXCLUDE_DIRS for x in p.parts)))} files")
    print(f"Found {report['total']} potential hardcoded strings across {report['files_affected']} files")
    print(f"Report saved to {REPORT_PATH}")
    if '--summary' in sys.argv:
        for file, items in sorted(by_file.items(), key=lambda x: -len(x[1]))[:20]:
            print(f"\n  {file} ({len(items)} findings)")
            for item in items[:5]:
                print(f"    L{item['line']} [{item['type']}] {item['text'][:80]}")
    return 0 if report['total'] == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
