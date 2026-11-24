#!/usr/bin/env python3
"""Build the Chrome extension package from src/ into dist/.

The archive root is src/, so manifest.json sits at the top level of the zip
(required by Chrome). The file name is derived from manifest.json's version,
e.g. dist/55-start-page-1.0.21.zip.
"""
import json
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
DIST = os.path.join(ROOT, "dist")

# Files/folders that must never be shipped in the extension archive.
EXCLUDE_NAMES = {"__pycache__", ".DS_Store", "Thumbs.db"}
EXCLUDE_SUFFIX = (".pyc", ".pyo")


def read_version():
    with open(os.path.join(SRC, "manifest.json"), "r", encoding="utf-8") as f:
        return json.load(f)["version"]


def collect_files():
    for base, dirs, files in os.walk(SRC):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_NAMES]
        for name in files:
            if name in EXCLUDE_NAMES or name.endswith(EXCLUDE_SUFFIX):
                continue
            full = os.path.join(base, name)
            rel = os.path.relpath(full, SRC)
            yield full, rel.replace(os.sep, "/")


def main():
    if not os.path.isfile(os.path.join(SRC, "manifest.json")):
        sys.exit("Error: src/manifest.json not found")
    os.makedirs(DIST, exist_ok=True)

    version = read_version()
    out = os.path.join(DIST, "55-start-page-%s.zip" % version)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for full, rel in sorted(collect_files()):
            zf.write(full, rel)

    with zipfile.ZipFile(out) as zf:
        names = zf.namelist()
    print("Built: %s" % os.path.relpath(out, ROOT))
    print("Files: %d" % len(names))
    for name in names:
        print("  " + name)


if __name__ == "__main__":
    main()
