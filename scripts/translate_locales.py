#!/usr/bin/env python3

"""

translate_locales.py

====================

Synchronises the widget-app locale JSON files (widget-app/locales/)

with en.json by machine-translating any value that is missing from a target

locale or needs to be refreshed.

By default only fills keys that are absent from the target file. Pass

--overwrite to replace all existing values, or use --key to narrow the scope

to specific top-level keys.

WHAT GETS TRANSLATED

--------------------

Every string value in the JSON tree, including:

  - Top-level flat strings

  - Strings inside nested dicts (e.g. chatControl, unreadMessages, sourcesCount)

USAGE

-----

Fill missing keys in all locales:

    python3 translate_locales.py

Fill missing keys in one locale:

    python3 translate_locales.py --only fr

Fill missing keys in multiple locales:

    python3 translate_locales.py --only fr de es

Re-translate everything in one locale (overwrite existing values):

    python3 translate_locales.py --only fr --overwrite

Re-translate specific top-level keys:

    python3 translate_locales.py --only fr --key chatControl unreadMessages --overwrite

REQUIREMENTS

------------

    pip install openai

    export OPENAI_API_KEY=sk-...

Uses the OpenAI Chat Completions API (model defined by TRANSLATION_MODEL

below) — mirrors the runtime helper in agent/lib/openaiTranslate.ts so

behaviour is consistent across the build-time script and the live widget

proxy. For large runs the script saves progress after every top-level key

so Ctrl+C is safe.

LANGUAGE CODE MAPPING

---------------------

Project locale codes that differ from the codes we send to the model are

listed in LANG_MAP at the top of this file (e.g. nb -> no for Norwegian

Bokmål — matches the mapping in lib/openaiTranslate.ts).

"""

import argparse

import glob

import json

import os

import re

import time

from openai import OpenAI

# ---------------------------------------------------------------------------

# Load .env file (chatWidget/.env) into os.environ for keys not already set.

# This means an explicit export in the shell always wins over the file.

# ---------------------------------------------------------------------------

def _load_dotenv() -> None:

    script_dir = os.path.dirname(os.path.abspath(__file__))

    env_path = os.path.normpath(os.path.join(script_dir, "..", ".env"))

    if not os.path.exists(env_path):

        return

    with open(env_path, "r", encoding="utf-8") as f:

        for line in f:

            line = line.strip()

            if not line or line.startswith("#"):

                continue

            match = re.match(r'^([A-Za-z_][A-Za-z0-9_]*)=(.*)$', line)

            if match:

                key, value = match.group(1), match.group(2).strip()

                # Strip optional surrounding quotes

                if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):

                    value = value[1:-1]

                if key not in os.environ:

                    os.environ[key] = value

_load_dotenv()

# ---------------------------------------------------------------------------

# Config

# ---------------------------------------------------------------------------

# Map project locale codes to the codes we send to the translation model

# where they differ. Kept aligned with mapLang() in lib/openaiTranslate.ts.

LANG_MAP = {

    "nb": "no",

}

# Keys whose values should NOT be translated (technical identifiers, placeholders, etc.)

SKIP_KEYS = set()

# Delay between translation requests (seconds). OpenAI tolerates much higher

# RPM than the old free Google tier did, but a tiny pause keeps us well clear

# of per-minute limits on the cheaper accounts.

REQUEST_DELAY = 0.05

# Matches TRANSLATION_MODEL in agent/lib/openaiTranslate.ts so the script

# and the live widget proxy produce comparable output.

TRANSLATION_MODEL = "gpt-4o-mini"

# ---------------------------------------------------------------------------

# OpenAI client (lazy — only instantiated when a translation is requested)

# ---------------------------------------------------------------------------

_client: OpenAI | None = None

def _get_client() -> OpenAI:

    global _client

    if _client is not None:

        return _client

    if not os.environ.get("OPENAI_API_KEY"):

        raise RuntimeError(

            "OPENAI_API_KEY is not set — export it before running this script."

        )

    _client = OpenAI()

    return _client

# ---------------------------------------------------------------------------

# Translation helpers

# ---------------------------------------------------------------------------

def translate_text(text: str, target: str, retries: int = 3) -> str | None:

    """Translate a single string. Returns None if all attempts fail."""

    src = "en"

    tgt = target

    prompt = (

        f"Translate the following text from {src} to {tgt} (ISO 639-1 codes). "

        "Only return the translated text, with no commentary or quoting.\n\n"

        f"{text}"

    )

    for attempt in range(retries):

        try:

            response = _get_client().chat.completions.create(

                model=TRANSLATION_MODEL,

                messages=[

                    {"role": "system", "content": "You are a translation engine."},

                    {"role": "user", "content": prompt},

                ],

                temperature=0.2,

                max_tokens=2000,

            )

            content = response.choices[0].message.content or ""

            return content.strip()

        except Exception as exc:

            wait = 2 ** attempt

            print(f"      translate error (attempt {attempt + 1}/{retries}): {exc}")

            if attempt < retries - 1:

                print(f"      retrying in {wait}s...")

                time.sleep(wait)

    return None

def translate_string(s: str, target: str) -> str:

    """Translate a string, falling back to the English original on failure."""

    if not s or not s.strip():

        return s

    result = translate_text(s, target)

    time.sleep(REQUEST_DELAY)

    if result is None:

        print(f"      WARNING: translation failed — keeping English")

        return s

    return result

# ---------------------------------------------------------------------------

# Recursive value translator

# ---------------------------------------------------------------------------

def translate_value(key: str, value, target: str, overwrite: bool):

    """

    Recursively translate a JSON value.

    - str  → translate directly

    - dict → translate each value recursively

    `overwrite` controls whether existing non-empty strings are replaced.

    """

    if key in SKIP_KEYS:

        return value

    if isinstance(value, str):

        if not overwrite and value:

            return value  # already has a value, don't overwrite

        print(f"      string ({len(value)} chars)")

        return translate_string(value, target)

    if isinstance(value, dict):

        return {

            k: translate_value(k, v, target, overwrite)

            for k, v in value.items()

        }

    # numbers, booleans, null — pass through unchanged

    return value

# ---------------------------------------------------------------------------

# Main

# ---------------------------------------------------------------------------

def main():

    parser = argparse.ArgumentParser(

        description="Sync widget locale JSON files with en.json via machine translation.",

        formatter_class=argparse.RawDescriptionHelpFormatter,

        epilog="""

Examples:

  # Translate only missing keys in all locales

  python3 translate_locales.py

  # Translate only missing keys in French only

  python3 translate_locales.py --only fr

  # Translate only missing keys in French and German

  python3 translate_locales.py --only fr de

  # Re-translate everything in all locales (overwrite existing)

  python3 translate_locales.py --overwrite

  # Re-translate everything in French (overwrite existing)

  python3 translate_locales.py --only fr --overwrite

  # Re-translate specific top-level keys in all locales

  python3 translate_locales.py --key chatControl unreadMessages --overwrite

  # Re-translate specific top-level keys in French

  python3 translate_locales.py --only fr --key chatControl unreadMessages --overwrite

        """,

    )

    parser.add_argument(

        "--only",

        metavar="LOCALE",

        nargs="+",

        help="Only process these locale codes, space-separated (e.g. 'fr de es')",

        default=None,

    )

    parser.add_argument(

        "--overwrite",

        action="store_true",

        help="Overwrite existing translated values (default: only fill missing keys)",

    )

    parser.add_argument(

        "--key",

        metavar="KEY",

        nargs="+",

        help="Only translate these top-level keys, space-separated (e.g. --key chatControl unreadMessages)",

        default=None,

    )

    args = parser.parse_args()

    script_dir = os.path.dirname(os.path.abspath(__file__))

    base = os.path.normpath(os.path.join(script_dir, "..", "locales"))

    en_path = os.path.join(base, "en.json")

    if not os.path.exists(en_path):

        print(f"ERROR: {en_path} not found.")

        return

    with open(en_path, "r", encoding="utf-8") as f:

        en_data = json.load(f)

    # Validate --key

    if args.key:

        bad = [k for k in args.key if k not in en_data]

        if bad:

            print(f"ERROR: key(s) not found in en.json: {', '.join(bad)}")

            return

    # Collect target locale files

    all_files = sorted(glob.glob(os.path.join(base, "*.json")))

    locale_files = [p for p in all_files if os.path.basename(p) != "en.json"]

    if args.only:

        locale_files = []

        for code in args.only:

            only_path = os.path.join(base, f"{code}.json")

            if not os.path.exists(only_path):

                print(f"ERROR: no locale file for '{code}' at {only_path}")

                return

            locale_files.append(only_path)

    summary = {}

    for path in locale_files:

        lang = os.path.splitext(os.path.basename(path))[0]

        target = LANG_MAP.get(lang, lang)

        print(f"\n{'='*60}")

        print(f"  {os.path.basename(path)}  →  target language '{target}'")

        print(f"{'='*60}")

        with open(path, "r", encoding="utf-8") as f:

            data = json.load(f)

        keys_written = 0

        try:

            keys_to_process = args.key if args.key else list(en_data.keys())

            for key in keys_to_process:

                en_val = en_data[key]

                existing_val = data.get(key)

                # Skip if already present and not overwriting

                if existing_val is not None and not args.overwrite:

                    continue

                print(f"\n  [{key}]")

                # The outer filter above guarantees the target either has no

                # value yet or the user passed --overwrite, so we want to

                # translate the English source unconditionally. Passing

                # overwrite=False here would trip translate_value's

                # short-circuit (it inspects `value`, which is the source,

                # not the target's existing value) and write English back.

                translated_val = translate_value(key, en_val, target, overwrite=True)

                data[key] = translated_val

                keys_written += 1

                # Incremental save after each top-level key

                with open(path, "w", encoding="utf-8") as f:

                    json.dump(data, f, ensure_ascii=False, indent=2)

                    f.write("\n")

        except KeyboardInterrupt:

            print("\n\nInterrupted — progress has been saved.")

        summary[lang] = keys_written

        print(f"\n  {lang}: {keys_written} key(s) written")

    print(f"\n{'='*60}")

    print("Summary")

    print(f"{'='*60}")

    for lang, count in summary.items():

        print(f"  {lang}: {count} key(s) written")

if __name__ == "__main__":

    main()

