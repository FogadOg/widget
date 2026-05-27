#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

report_path = Path(__file__).resolve().parents[0] / 'locale_issues_report.json'
try:
    with open(report_path, 'r', encoding='utf-8-sig') as f:
        r = json.load(f)
except Exception as e:
    print(f"::warning::Could not read {report_path}: {e}")
    sys.exit(0)

total_empty = sum(v.get('empty_values_count', 0) for v in r.values())
total_untranslated = sum(v.get('untranslated_count', 0) for v in r.values())
total_placeholders = sum(v.get('placeholder_mismatches_count', 0) for v in r.values())

# Respect QUIET_LOCALE to avoid verbose console output during builds
QUIET = os.getenv('QUIET_LOCALE') in ('1', 'true', 'True')

if total_empty > 0:
    print(f"::warning::Found {total_empty} empty translation values across widget-app locales. See {report_path} for details.")
else:
    if not QUIET:
        print('No empty translation values found in widget-app locales')

if total_placeholders > 0:
    print(f"::warning::Found {total_placeholders} placeholder mismatches across widget-app locales. These are warnings only.")

if total_untranslated > 0:
    print(f"::warning::Found {total_untranslated} untranslated values across widget-app locales. These are warnings only.")

if not QUIET:
    print('\n--- Locale issues detail ---\n')

def _short_snip(s):
    if not isinstance(s, str):
        return ''
    sn = s.replace('\n', ' ').strip()
    return (sn[:80] + '...') if len(sn) > 80 else sn

if not QUIET:
    for locale, data in r.items():
        print(f"{locale}:")
        # untranslated
        for k in data.get('untranslated_sample', []):
            # `k` can be a string key or a dict containing a 'key' field.
            if isinstance(k, dict):
                key_str = k.get('key') or next((v for v in k.values() if isinstance(v, str)), None)
                if not key_str:
                    key_str = repr(k)
            else:
                key_str = k
            # print concise marker with key only
            print(f"::warning file=widget-app/locales/{locale},line=1::{locale} untranslated {key_str}")
        # placeholder mismatches
        for item in data.get('placeholder_mismatches_sample', []):
            k = item.get('key') if isinstance(item, dict) else item
            en_ph = item.get('en') if isinstance(item, dict) else []
            loc_ph = item.get('loc') if isinstance(item, dict) else []
            en_count = len(en_ph) if isinstance(en_ph, (list, tuple)) else 1
            loc_count = len(loc_ph) if isinstance(loc_ph, (list, tuple)) else 1
            print(f"::warning file=widget-app/locales/{locale},line=1::{locale} placeholder mismatch {k} - en:{en_count} loc:{loc_count}")

    print('\n--- end locale issues detail ---\n')
