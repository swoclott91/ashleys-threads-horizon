#!/usr/bin/env python3
"""Remove v3 color_scheme keys from theme JSON and settings_schema badge fields."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

STRIP_KEYS = {
    "color_scheme",
    "inherit_color_scheme",
    "color_scheme_navigation_bar",
    "color_scheme_top",
    "color_scheme_bottom",
    "color_scheme_transparent",
    "home_color_scheme",
    "product_color_scheme",
    "collection_color_scheme",
}

STRIP_PREFIX_SUFFIX = ("badge_custom_", "_color_scheme")


def strip_object(obj):
    if isinstance(obj, dict):
        cleaned = {}
        for key, value in obj.items():
            if key in STRIP_KEYS:
                continue
            if key.startswith(STRIP_PREFIX_SUFFIX[0]) and key.endswith(STRIP_PREFIX_SUFFIX[1]):
                continue
            cleaned[key] = strip_object(value)
        return cleaned
    if isinstance(obj, list):
        return [strip_object(item) for item in obj]
    return obj


def load_json_text(text: str):
    stripped = text.lstrip()
    if stripped.startswith("/*"):
        end = stripped.find("*/")
        if end != -1:
            stripped = stripped[end + 2 :].lstrip()
    return json.loads(stripped)


def migrate_json_file(path: Path) -> bool:
    original = path.read_text(encoding="utf-8")
    data = load_json_text(original)
    cleaned = strip_object(data)
    if cleaned == data:
        return False
    prefix = ""
    if original.lstrip().startswith("/*"):
        end = original.find("*/")
        if end != -1:
            prefix = original[: end + 2] + "\n"
    path.write_text(prefix + json.dumps(cleaned, indent=2) + "\n", encoding="utf-8")
    return True


def migrate_settings_schema(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    pattern = re.compile(
        r"\n\s*\{\n"
        r'\s*"type": "color_scheme",\n'
        r'\s*"id": "badge_custom_\d+_color_scheme",\n'
        r'(?:[^\n]*\n)*?'
        r"\s*\},?",
        re.MULTILINE,
    )
    updated, count = pattern.subn("", text)
    if count == 0:
        return False
    path.write_text(updated, encoding="utf-8")
    return True


def main() -> None:
    changed: list[str] = []

    json_dirs = [ROOT / "templates", ROOT / "sections"]
    for directory in json_dirs:
        for path in sorted(directory.glob("*.json")):
            if migrate_json_file(path):
                changed.append(str(path.relative_to(ROOT)))

    schema_path = ROOT / "config" / "settings_schema.json"
    if migrate_settings_schema(schema_path):
        changed.append(str(schema_path.relative_to(ROOT)))

    data_path = ROOT / "config" / "settings_data.json"
    if migrate_json_file(data_path):
        changed.append(str(data_path.relative_to(ROOT)))

    print(f"Updated {len(changed)} file(s):")
    for item in changed:
        print(f"  - {item}")


if __name__ == "__main__":
    main()
