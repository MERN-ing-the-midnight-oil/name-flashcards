#!/usr/bin/env python3
"""Build a single-file Name-Flashcards.html with inlined photos."""

from __future__ import annotations

import base64
import json
import mimetypes
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def data_url(path: Path) -> str | None:
    if not path.is_file():
        return None
    mime = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def main() -> None:
    people = json.loads((ROOT / "data" / "people.json").read_text())
    packed = []
    for person in people:
        photo = None
        if person.get("photo"):
            photo = data_url(ROOT / person["photo"])
        packed.append({**person, "photo": photo})

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="Names" />
  <title>Name Flashcards</title>
  <style>{(ROOT / "styles.css").read_text()}</style>
</head>
<body>
  <div id="app">
    <header class="header">
      <h1>Transportation Names</h1>
      <p>Drag cards between decks</p>
    </header>
    <div class="controls">
      <button class="shuffle-btn" id="shuffle-btn" type="button">Shuffle</button>
      <button class="reset-btn" id="reset-btn" type="button">Reset all</button>
    </div>
    <div class="decks-container">
      <section class="deck deck-learning" data-deck="learning">
        <div class="deck-header">
          <div class="deck-title">Still Learning</div>
          <div class="deck-count"><span id="learning-count">0</span> cards</div>
        </div>
        <div class="deck-cards" id="learning-deck"></div>
      </section>
      <section class="deck deck-know" data-deck="know">
        <div class="deck-header">
          <div class="deck-title">Got It!</div>
          <div class="deck-count"><span id="know-count">0</span> cards</div>
        </div>
        <div class="deck-cards" id="know-deck"></div>
      </section>
    </div>
    <button class="install-link" id="install-link" type="button">Add to iPhone</button>
  </div>
  <dialog id="install-dialog">
    <form method="dialog" class="install-sheet">
      <h2>Put this on your iPhone</h2>
      <p class="install-lead">Open the website in Safari, tap Share, then Add to Home Screen.</p>
      <button class="shuffle-btn install-done" value="close" type="submit">Done</button>
    </form>
  </dialog>
  <script>window.EMBEDDED_PEOPLE = {json.dumps(packed)};</script>
  <script>{(ROOT / "app.js").read_text()}</script>
</body>
</html>
"""
    dest = Path.home() / "Downloads" / "Name-Flashcards.html"
    dest.write_text(html)
    print(f"Wrote {dest} ({dest.stat().st_size / 1_000_000:.1f} MB)")


if __name__ == "__main__":
    main()
