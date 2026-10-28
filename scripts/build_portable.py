"""
Builds the self-contained single-file portable version `KindleNotesOrganizer-Portable.html`
from the modular `src/` ES modules and `index.html`.
Zero external dependencies required.
"""

import os
import re

MODULE_ORDER = [
    "src/data/defaultClippings.js",
    "src/core/parser.js",
    "src/core/deduplicator.js",
    "src/core/epubReader.js",
    "src/core/syncManager.js",
    "src/exporters/exportViewModel.js",
    "src/exporters/markdownExporter.js",
    "src/exporters/zipWriter.js",
    "src/exporters/docxExporter.js",
    "src/exporters/pdfExporter.js",
    "src/ui/app.js",
]


def strip_es_module_syntax(js_code: str) -> str:
    # Remove import statements (multiline and single-line)
    js_code = re.sub(
        r"^\s*import\s+[\s\S]*?from\s+['\"][^'\"]+['\"];?\s*$",
        "",
        js_code,
        flags=re.MULTILINE,
    )
    # Replace export关键字 before function/const/let/async
    js_code = re.sub(
        r"^(\s*)export\s+(async\s+function|function|const|let|var|class)\b",
        r"\1\2",
        js_code,
        flags=re.MULTILINE,
    )
    return js_code


def build():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(root, "index.html"), "r", encoding="utf-8") as f:
        html = f.read()

    with open(os.path.join(root, "src/styles/main.css"), "r", encoding="utf-8") as f:
        css = f.read()

    js_parts = ["(function() {\n'use strict';\n"]
    for mod_path in MODULE_ORDER:
        full_path = os.path.join(root, mod_path)
        with open(full_path, "r", encoding="utf-8") as f:
            raw_js = f.read()
        cleaned_js = strip_es_module_syntax(raw_js)
        js_parts.append(f"\n// === MODULE: {mod_path} ===\n{cleaned_js}\n")
    js_parts.append("\n})();\n")
    combined_js = "".join(js_parts)

    #Also write a bundled JS file `src/bundle.js` so `index.html` works on BOTH file:// and http://!
    bundle_js_path = os.path.join(root, "src", "bundle.js")
    with open(bundle_js_path, "w", encoding="utf-8") as f:
        f.write(combined_js)

    # Update portable HTML with inline CSS and inline JS (allowing 'unsafe-inline' in script-src for single-file portability)
    portable_html = html.replace(
        "script-src 'self';",
        "script-src 'self' 'unsafe-inline';",
    )
    portable_html = portable_html.replace(
        '<link rel="stylesheet" href="./src/styles/main.css" />',
        f"<style>\n{css}\n</style>",
    )
    # Safely inject combined_js without regex backreference issues
    script_tag_target = '<script type="module" src="./src/ui/app.js"></script>'
    if script_tag_target not in portable_html:
        script_tag_target = '<script src="./src/bundle.js"></script>'
    portable_html = portable_html.replace(
        script_tag_target,
        f"<script>\n{combined_js}\n</script>",
    )

    portable_path = os.path.join(root, "KindleNotesOrganizer-Portable.html")
    with open(portable_path, "w", encoding="utf-8") as f:
        f.write(portable_html)

    # Also update index.html to use `./src/bundle.js` so index.html works via file:// AND http://
    index_updated = html.replace(
        '<script type="module" src="./src/ui/app.js"></script>',
        '<script src="./src/bundle.js"></script>',
    )
    with open(os.path.join(root, "index.html"), "w", encoding="utf-8") as f:
        f.write(index_updated)

    print(f"Built {portable_path} ({os.path.getsize(portable_path):,} bytes)")
    print(f"Built {bundle_js_path} ({os.path.getsize(bundle_js_path):,} bytes)")


if __name__ == "__main__":
    build()
