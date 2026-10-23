#!/usr/bin/env python3
"""Split the store catalog by county using store-index.json (Python 3 stdlib)."""
import argparse
import json
from pathlib import Path


BASE = Path(__file__).resolve().parent.parent / "public/puma_oshen_wave"


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def split_catalog(source, index):
    if not isinstance(source, dict) or not isinstance(source.get("stores"), list):
        raise ValueError("來源必須是包含 stores 陣列的 JSON 物件")
    if not isinstance(index, dict) or not index:
        raise ValueError("總表必須是非空 JSON 物件")
    names, filenames = {}, set()
    for code, entry in index.items():
        filename = entry["store_file"]
        if (not isinstance(code, str) or len(code) != 5
                or not code.isascii() or not code.isdigit()
                or filename != f"tw_{code}_store.json"):
            raise ValueError(f"總表須以五碼 COUNTYCODE 為索引，檔名須為 tw_{{countycode}}_store.json：{code}")
        name = entry["store_name"].replace("台", "臺")
        if (not isinstance(filename, str) or Path(filename).name != filename
                or not filename.endswith(".json") or filename in filenames
                or name in names or not name):
            raise ValueError(f"總表名稱或檔名無效／重複：{code}")
        filenames.add(filename)
        names[name] = code
    # Preserve all top-level metadata and every store field, including disabled.
    groups = ("stores", "pendingStores") if "pendingStores" in source else ("stores",)
    output = {code: {**source, **{key: [] for key in groups}} for code in index}
    errors = []
    for key in groups:
        if not isinstance(source[key], list):
            raise ValueError(f"{key} 必須為陣列")
        for pos, store in enumerate(source[key]):
            address = store.get("address", "") if isinstance(store, dict) else ""
            normalized = address.replace("台", "臺") if isinstance(address, str) else ""
            matches = [code for name, code in names.items() if name in normalized]
            if len(matches) != 1:
                errors.append(f"{key}[{pos}] 無法唯一判斷縣市：{address!r}")
            else:
                output[matches[0]][key].append(store)
    if errors:
        raise ValueError("\n".join(errors))
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=BASE / "stores.json")
    parser.add_argument("--index", type=Path, default=BASE / "data/store-index.json")
    parser.add_argument("--output-dir", type=Path, default=BASE / "data/stores")
    args = parser.parse_args()
    try:
        source, index = read_json(args.source), read_json(args.index)
        catalogs = split_catalog(source, index)
        targets = {code: args.output_dir / index[code]["store_file"] for code in index}
        for path in targets.values():
            if path.resolve() in (args.source.resolve(), args.index.resolve()):
                raise ValueError("輸出不可覆寫來源或總表")
        args.output_dir.mkdir(parents=True, exist_ok=True)
        for code, catalog in catalogs.items():
            targets[code].write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"{targets[code].name}: stores={len(catalog['stores'])}, pendingStores={len(catalog.get('pendingStores', []))}")
    except (ValueError, OSError, KeyError, TypeError) as exc:
        parser.exit(1, f"轉檔失敗：{exc}\n")


if __name__ == "__main__":
    main()
