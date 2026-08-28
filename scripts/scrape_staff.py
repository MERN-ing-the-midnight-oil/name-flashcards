#!/usr/bin/env python3
"""Pull transportation staff names and photos from the public directory."""

from __future__ import annotations

import json
import re
import ssl
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

SOURCE_URL = (
    "https://www.bellinghamschools.org/about/departments/operations/"
    "transportation/transportation-staff"
)
BASE_URL = "https://www.bellinghamschools.org"
ROOT = Path(__file__).resolve().parents[1]
PHOTOS_DIR = ROOT / "photos"
DATA_PATH = ROOT / "data" / "people.json"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

CTX = ssl.create_default_context()


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, context=CTX, timeout=30) as response:
        return response.read()


def first_name(full_name: str) -> str:
    parts = full_name.split()
    if len(parts) >= 3 and parts[0] in {"Rae", "Mary", "Ann", "Anne"}:
        return f"{parts[0]} {parts[1]}"
    return parts[0] if parts else full_name


def parse_people(html: str) -> list[dict]:
    start = html.find('id="fsEl_34641"')
    section = html[start:] if start != -1 else html
    pieces = re.split(
        r'<div class="fsConstituentItem[^"]*" data-constituent-id="(\d+)">',
        section,
    )
    people: list[dict] = []
    for i in range(1, len(pieces), 2):
        person_id = pieces[i]
        block = pieces[i + 1]
        name_match = re.search(
            r'class="fsConstituentProfileLink"[^>]*>([^<]+)', block
        )
        title_match = re.search(
            r'<div class="fsTitles">\s*<strong>Titles:</strong>\s*([^<]+)',
            block,
        )
        photo_match = re.search(r'src="(/uploaded/[^"]+)"', block)
        if not name_match:
            continue
        full_name = re.sub(r"\s+", " ", name_match.group(1)).strip()
        title = title_match.group(1).strip() if title_match else ""
        photo_path = photo_match.group(1) if photo_match else None
        people.append(
            {
                "id": person_id,
                "fullName": full_name,
                "firstName": first_name(full_name),
                "title": title,
                "sourcePhoto": photo_path,
            }
        )
    return people


def download_photo(person: dict) -> str | None:
    source = person.get("sourcePhoto")
    if not source:
        return None
    ext = Path(source).suffix.lower() or ".jpg"
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        ext = ".jpg"
    dest = PHOTOS_DIR / f"{person['id']}{ext}"
    if dest.exists() and dest.stat().st_size > 0:
        return f"photos/{dest.name}"
    url = BASE_URL + source
    try:
        data = fetch(url)
    except Exception as error:
        print(f"skip {person['fullName']}: {error}")
        return None
    dest.write_bytes(data)
    return f"photos/{dest.name}"


def main() -> None:
    PHOTOS_DIR.mkdir(exist_ok=True)
    DATA_PATH.parent.mkdir(exist_ok=True)
    html = fetch(SOURCE_URL).decode("utf-8", errors="replace")
    people = parse_people(html)
    print(f"found {len(people)} staff")

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(download_photo, person): person for person in people}
        for future in as_completed(futures):
            person = futures[future]
            person["photo"] = future.result()
            person.pop("sourcePhoto", None)

    people.sort(key=lambda item: item["fullName"].lower())
    DATA_PATH.write_text(json.dumps(people, indent=2) + "\n")
    with_photos = sum(1 for person in people if person.get("photo"))
    print(f"saved {with_photos} photos -> {DATA_PATH}")


if __name__ == "__main__":
    main()
