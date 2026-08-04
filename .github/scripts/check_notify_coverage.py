import re
import sys
from pathlib import Path

WORKFLOWS_DIR = Path(".github/workflows")
NOTIFY_FILE = WORKFLOWS_DIR / "fail&passcheck.yml"


def get_name(path):
    text = path.read_text(encoding="utf-8")
    match = re.search(r"^name:\s*(.+)$", text, re.MULTILINE)
    return match.group(1).strip() if match else None


def get_watched_names():
    text = NOTIFY_FILE.read_text(encoding="utf-8")
    match = re.search(r"workflows:\s*\n((?:\s*-\s*.+\n)+)", text)
    if not match:
        return set()
    return set(re.findall(r'-\s*"([^"]+)"', match.group(1)))


def main():
    all_names = {}

    for path in sorted(WORKFLOWS_DIR.glob("*.yml")):
        if path.name == NOTIFY_FILE.name:
            continue
        name = get_name(path)
        if name:
            all_names[name] = path.name

    watched = get_watched_names()
    missing = set(all_names) - watched

    if missing:
        print("::error::The following pipelines are NOT in fail&passcheck.yml's failure-notification watch list:")
        for name in sorted(missing):
            print(f'::error::  - "{name}" ({all_names[name]})')
        print("::error::Add each one to the 'workflows:' list in .github/workflows/fail&passcheck.yml so its failures notify the dev team.")
        sys.exit(1)

    print(f"OK - all {len(all_names)} pipeline(s) are covered by the failure notifier.")


if __name__ == "__main__":
    main()
