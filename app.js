const STORAGE_KEY = "name-flashcards-v3-decks";
const PRONUNCIATIONS = {
  "5459": "IN-der-jeet",
  "4148": "chuh-RUN-jeet",
  "4980": "ik-BAHL",
  "3561": "mook-tee-AR",
  "3591": "Ahs-Pee",
};

const learningDeck = document.getElementById("learning-deck");
const knowDeck = document.getElementById("know-deck");
const learningCount = document.getElementById("learning-count");
const knowCount = document.getElementById("know-count");
const installDialog = document.getElementById("install-dialog");
const installLink = document.getElementById("install-link");
const copyStatus = document.getElementById("copy-status");

const peopleById = new Map();
let people = [];
let learningIds = [];
let knowIds = [];
let drag = null;

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function loadDecks(people) {
  const allIds = people.map((person) => person.id);
  const known = new Set(allIds);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { learning: allIds, know: [] };
    const parsed = JSON.parse(raw);
    const learning = (parsed.learning || []).filter((id) => known.has(id));
    const know = (parsed.know || []).filter((id) => known.has(id) && !learning.includes(id));
    const placed = new Set([...learning, ...know]);
    const newcomers = allIds.filter((id) => !placed.has(id));
    return { learning: [...learning, ...newcomers], know };
  } catch {
    return { learning: allIds, know: [] };
  }
}

function saveDecks() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ learning: learningIds, know: knowIds })
  );
}

function photoHTML(person) {
  if (person.photo) {
    return `<img src="${escapeHTML(person.photo)}" alt="" />`;
  }
  const letter = escapeHTML((person.firstName || "?").slice(0, 1).toUpperCase());
  return `<div class="initials">${letter}</div>`;
}

function cardHTML(person) {
  const say = person.pronunciation
    ? `<div class="card-say">${escapeHTML(person.pronunciation)}</div>`
    : "";
  return `
    <div class="card-photo">${photoHTML(person)}</div>
    <div class="card-name">${escapeHTML(person.firstName)}</div>
    ${say}
  `;
}

function bindCard(cardEl) {
  cardEl.draggable = true;
  cardEl.addEventListener("pointerdown", onPointerDown);
  cardEl.addEventListener("dragstart", (event) => {
    drag = { id: cardEl.dataset.id, cardEl, mode: "html5" };
    cardEl.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", cardEl.dataset.id);
  });
  cardEl.addEventListener("dragend", () => {
    cardEl.classList.remove("dragging");
    setDeckTarget(null);
    if (drag?.mode === "html5") drag = null;
  });
}

function createCard(person) {
  const cardEl = document.createElement("article");
  cardEl.className = "card";
  cardEl.dataset.id = person.id;
  cardEl.setAttribute("role", "button");
  cardEl.setAttribute("aria-label", `Move ${person.firstName}`);
  cardEl.innerHTML = cardHTML(person);
  bindCard(cardEl);
  return cardEl;
}

function renderDeck(container, ids, emptyMarkup) {
  container.replaceChildren();
  if (!ids.length) {
    container.insertAdjacentHTML("afterbegin", emptyMarkup);
    return;
  }
  const fragment = document.createDocumentFragment();
  ids.forEach((id) => {
    const person = peopleById.get(id);
    if (person) fragment.appendChild(createCard(person));
  });
  container.appendChild(fragment);
}

function render() {
  renderDeck(
    learningDeck,
    learningIds,
    '<div class="empty-state"><div class="empty-icon">✓</div><div>All done!</div></div>'
  );
  renderDeck(
    knowDeck,
    knowIds,
    '<div class="empty-state"><div class="empty-icon">→</div><div>Start dragging!</div></div>'
  );
  learningCount.textContent = String(learningIds.length);
  knowCount.textContent = String(knowIds.length);
}

function moveCard(id, toDeck) {
  const fromLearning = learningIds.includes(id);
  const alreadyThere =
    (toDeck === "learning" && fromLearning) || (toDeck === "know" && !fromLearning);
  if (alreadyThere) return;

  if (fromLearning) {
    learningIds = learningIds.filter((item) => item !== id);
    knowIds.push(id);
  } else {
    knowIds = knowIds.filter((item) => item !== id);
    learningIds.push(id);
  }
  saveDecks();
  render();
}

function shuffle(ids) {
  const next = [...ids];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function deckAtPoint(x, y) {
  const stack = document.elementsFromPoint(x, y);
  const node = stack.find((el) => el.closest && el.closest("[data-deck]"));
  return node ? node.closest("[data-deck]").dataset.deck : null;
}

function setDeckTarget(name) {
  document.querySelectorAll("[data-deck]").forEach((deck) => {
    deck.classList.toggle("is-target", Boolean(name) && deck.dataset.deck === name);
  });
}

function startDrag(cardEl, event) {
  const rect = cardEl.getBoundingClientRect();
  const ghost = cardEl.cloneNode(true);
  ghost.classList.add("card-ghost");
  ghost.style.width = `${rect.width}px`;
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  document.body.appendChild(ghost);
  cardEl.classList.add("dragging");
  document.body.classList.add("is-dragging");
  try {
    cardEl.setPointerCapture(event.pointerId);
  } catch {
    /* capture is unavailable for some synthetic events */
  }
  drag = {
    id: cardEl.dataset.id,
    cardEl,
    ghost,
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
  };
}

function moveGhost(event) {
  if (!drag) return;
  drag.ghost.style.left = `${event.clientX - drag.offsetX}px`;
  drag.ghost.style.top = `${event.clientY - drag.offsetY}px`;
  setDeckTarget(deckAtPoint(event.clientX, event.clientY));
}

function endDrag(event) {
  if (!drag) return;
  const target = deckAtPoint(event.clientX, event.clientY) ||
    (event.clientX < window.innerWidth / 2 ? "learning" : "know");
  const id = drag.id;
  drag.ghost.remove();
  drag.cardEl.classList.remove("dragging");
  document.body.classList.remove("is-dragging");
  setDeckTarget(null);
  try {
    drag.cardEl.releasePointerCapture(drag.pointerId);
  } catch {
    /* already released */
  }
  drag = null;
  if (target) moveCard(id, target);
}

function setupDropZones() {
  document.querySelectorAll("[data-deck]").forEach((deck) => {
    deck.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDeckTarget(deck.dataset.deck);
    });
    deck.addEventListener("dragleave", (event) => {
      if (!deck.contains(event.relatedTarget)) setDeckTarget(null);
    });
    deck.addEventListener("drop", (event) => {
      event.preventDefault();
      const id = drag?.id || event.dataTransfer.getData("text/plain");
      setDeckTarget(null);
      if (id) moveCard(id, deck.dataset.deck);
      drag = null;
    });
  });
}

function onPointerDown(event) {
  if (event.pointerType === "mouse") return;
  if (event.button !== 0 && event.pointerType === "mouse") return;
  const cardEl = event.currentTarget;
  const startX = event.clientX;
  const startY = event.clientY;
  let started = false;
  let aborted = false;

  const onMove = (moveEvent) => {
    if (aborted) return;
    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;
    if (!started) {
      if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) {
        aborted = true;
        cleanup();
        return;
      }
      if (Math.hypot(dx, dy) < 8) return;
      started = true;
      startDrag(cardEl, moveEvent);
    }
    moveEvent.preventDefault();
    moveGhost(moveEvent);
  };

  const onUp = (upEvent) => {
    cleanup();
    if (started) endDrag(upEvent);
  };

  const cleanup = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };

  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

document.getElementById("shuffle-btn").addEventListener("click", () => {
  learningIds = shuffle(learningIds);
  saveDecks();
  render();
});

document.getElementById("reset-btn").addEventListener("click", () => {
  learningIds = [...peopleById.keys()];
  knowIds = [];
  saveDecks();
  render();
});

if (installLink && installDialog) {
  installLink.addEventListener("click", () => {
    if (copyStatus) copyStatus.hidden = true;
    installDialog.showModal();
  });
}

const copyLinkBtn = document.getElementById("copy-link-btn");
if (copyLinkBtn) {
  copyLinkBtn.addEventListener("click", async () => {
    if (!copyStatus) return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      copyStatus.textContent = "Link copied. Open it in Safari on your iPhone.";
    } catch {
      copyStatus.textContent = window.location.href;
    }
    copyStatus.hidden = false;
  });
}

const downloadBtn = document.getElementById("download-btn");
if (downloadBtn) {
  downloadBtn.addEventListener("click", () => {
    downloadStandalone();
  });
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function downloadStandalone() {
  const button = document.getElementById("download-btn");
  button.disabled = true;
  copyStatus.hidden = false;
  copyStatus.textContent = "Preparing file…";
  try {
    const [css, script] = await Promise.all([
      fetch("./styles.css").then((response) => response.text()),
      fetch("./app.js").then((response) => response.text()),
    ]);
    const packed = [];
    for (let i = 0; i < people.length; i += 1) {
      const person = people[i];
      copyStatus.textContent = `Preparing file… ${i + 1}/${people.length}`;
      let photo = null;
      if (person.photo) {
        try {
          const blob = await fetch(person.photo).then((response) => {
            if (!response.ok) throw new Error("photo");
            return response.blob();
          });
          photo = await blobToDataURL(blob);
        } catch {
          photo = null;
        }
      }
      packed.push({ ...person, photo });
    }
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="Names" />
  <title>Name Flashcards</title>
  <style>${css}</style>
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
      <p class="install-lead">Open this page in Safari, tap Share, then Add to Home Screen.</p>
      <button class="shuffle-btn install-done" value="close" type="submit">Done</button>
    </form>
  </dialog>
  <script>window.EMBEDDED_PEOPLE = ${JSON.stringify(packed)};</script>
  <script>${script}</script>
</body>
</html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Name-Flashcards.html";
    link.click();
    URL.revokeObjectURL(url);
    copyStatus.textContent = "Downloaded Name-Flashcards.html";
  } catch (error) {
    console.error(error);
    copyStatus.textContent = "Could not build the file. Try again on this page.";
  } finally {
    button.disabled = false;
  }
}

if (isStandalone()) {
  document.body.classList.add("is-standalone");
}

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

async function loadPeople() {
  if (Array.isArray(window.EMBEDDED_PEOPLE)) return window.EMBEDDED_PEOPLE;
  const response = await fetch("./data/people.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load names");
  return response.json();
}

async function start() {
  try {
    people = await loadPeople();
    people.forEach((person) => {
      person.pronunciation = person.pronunciation || PRONUNCIATIONS[person.id] || "";
      peopleById.set(person.id, person);
    });
    const decks = loadDecks(people);
    learningIds = decks.learning;
    knowIds = decks.know;
    setupDropZones();
    render();
  } catch (error) {
    console.error(error);
    learningDeck.innerHTML =
      '<div class="empty-state"><div>Could not load names</div></div>';
  }
}

start();
