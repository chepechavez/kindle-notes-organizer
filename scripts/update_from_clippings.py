"""
Utility to embed a custom/personal My Clippings.txt into the bundle if explicitly requested.
Default distribution bundles are kept clean without personal data.
"""

import json
import os
import sys
from build_portable import build

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    clippings_path = os.path.join(root, "My Clippings.txt")
    
    if "--embed-personal" in sys.argv:
        if os.path.exists(clippings_path):
            with open(clippings_path, "r", encoding="utf-8-sig") as f:
                raw = f.read()
            data_dir = os.path.join(root, "src", "data")
            os.makedirs(data_dir, exist_ok=True)
            out_path = os.path.join(data_dir, "defaultClippings.js")
            with open(out_path, "w", encoding="utf-8") as out:
                out.write("// Personal embedded clippings\n")
                out.write("export const DEFAULT_MY_CLIPPINGS_RAW = " + json.dumps(raw, ensure_ascii=False) + ";\n")
            print("[INFO] Embedded personal clippings for private local use.")
    else:
        print("[INFO] Keeping default clippings clean. Pass --embed-personal if you specifically want to embed your local file.")
    build()

if __name__ == "__main__":
    main()
