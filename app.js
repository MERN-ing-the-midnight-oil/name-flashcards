const STORAGE_KEY = "name-flashcards-v2";
const LEGACY_KEY = "name-flashcards-v1";
const RECENT_LIMIT = 4;
const FAST_MS = 2500;
const UNSEEN_WEIGHT = 8;
const OOPS_WEIGHT = 10;
const PRONUNCIATIONS = {
  "5459": "IN-der-jeet",
  "4148": "chuh-RUN-jeet",
  "4980": "ik-BAHL",
  "3561": "mook-tee-AR",
  "3591": "Ahs-Pee",
};

const studyView = document.getElementById("study-view");
const namesView = document.getElementById("names-view");
const card = document.getElementById("card");
const photoWrap = document.getElementById("photo-wrap");
const photoWrapBack = document.getElementById("photo-wrap-back");
const revealedName = document.getElementById("revealed-name");
const revealedTitle = document.getElementById("revealed-title");
const revealedSay = document.getElementById("revealed-say");
const progressLabel = document.getElementById("progress-label");
const progressBar = document.getElementById("progress-bar");
const rosterEl = document.getElementById("roster");
const searchInput = document.getElementById("search");
const editDialog = document.getElementById("edit-dialog");
const editInput = document.getElementById("edit-input");
const editFullName = document.getElementById("edit-full-name");

let people = [];
let current = null;
let editingId = null;
let flipped = false;
let shownAt = 0;
let pausedAt = 0;
let pausedMs = 0;
let recentIds = [];
let unsureThisCard = false;

function emptyState() {
  return { names: {}, stats: {} };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { names: parsed.names || {}, stats: parsed.stats || {} };
    }
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (!legacyRaw) return emptyState();
    const legacy = JSON.parse(legacyRaw);
    const stats = {};
    Object.keys(legacy.known || {}).forEach((id) => {
      stats[id] = {
        gotItCount: 1,
        oopsCount: 0,
        avgMs: FAST_MS,
        lastResult: "got-it",
        lastSeenAt: 0,
      };
    });
    const migrated = { names: legacy.names || {}, stats };
    saveState(migrated);
    return migrated;
  } catch {
    return emptyState();
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function displayName(person) {
  return loadState().names[person.id] || person.firstName;
}

function personStats(id) {
  return loadState().stats[id] || {
    gotItCount: 0,
    oopsCount: 0,
    avgMs: 0,
    lastResult: null,
    lastSeenAt: 0,
  };
}

function updateStats(id, patch) {
  const state = loadState();
  state.stats[id] = { ...personStats(id), ...patch };
  saveState(state);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function elapsedMs() {
  if (!shownAt) return FAST_MS;
  const openPause = pausedAt ? Date.now() - pausedAt : 0;
  return clamp(Date.now() - shownAt - pausedMs - openPause, 400, 45000);
}

function pauseTimer() {
  if (!pausedAt) pausedAt = Date.now();
}

function resumeTimer() {
  if (!pausedAt) return;
  pausedMs += Date.now() - pausedAt;
  pausedAt = 0;
}

function cardWeight(person) {
  const stats = personStats(person.id);
  if (stats.lastResult === "oops") return OOPS_WEIGHT;
  if (!stats.gotItCount) return UNSEEN_WEIGHT;
  return clamp(stats.avgMs / FAST_MS, 0.4, 5);
}

function pickNext() {
  const hardExclude = new Set(recentIds.slice(-2));
  if (current) hardExclude.add(current.id);

  let candidates = people.filter((person) => !hardExclude.has(person.id));
  if (candidates.length < 8) {
    candidates = people.filter((person) => person.id !== current?.id);
  }
  if (!candidates.length) candidates = [...people];

  const weights = candidates.map((person) => cardWeight(person));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let ticket = Math.random() * total;
  for (let i = 0; i < candidates.length; i += 1) {
    ticket -= weights[i];
    if (ticket <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function initials(person) {
  return escapeHTML(displayName(person).slice(0, 1).toUpperCase());
}

function photoHTML(person, className = "") {
  if (person.photo) {
    return `<img class="${className}" src="${person.photo}" alt="" />`;
  }
  return `<div class="initials ${className}">${initials(person)}</div>`;
}

function formatSeconds(ms) {
  if (!ms) return "";
  return `${(ms / 1000).toFixed(1)}s`;
}

function updateProgress() {
  const state = loadState();
  const solid = people.filter((person) => state.stats[person.id]?.lastResult === "got-it").length;
  const total = people.length || 1;
  progressLabel.textContent = `${solid}/${people.length} solid`;
  progressBar.style.width = `${(solid / total) * 100}%`;
}

function showView(name) {
  studyView.classList.toggle("hidden", name !== "study");
  namesView.classList.toggle("hidden", name !== "names");
  document.getElementById("tab-study").classList.toggle("is-active", name === "study");
  document.getElementById("tab-names").classList.toggle("is-active", name === "names");
}

function showNameSide() {
  if (!current) return;
  photoWrapBack.innerHTML = photoHTML(current);
  revealedName.textContent = displayName(current);
  if (revealedSay) {
    revealedSay.textContent = current.pronunciation ? '"' + current.pronunciation + '"' : "";
  }
  revealedTitle.textContent = current.title || "";
}

function clearNameSide() {
  photoWrapBack.innerHTML = "";
  revealedName.textContent = "";
  if (revealedSay) revealedSay.textContent = "";
  revealedTitle.textContent = "";
}

function snapToPhotoSide() {
  flipped = false;
  card.classList.add("no-flip");
  card.classList.remove("is-flipped");
  clearNameSide();
  void card.offsetWidth;
}

function preloadPhoto(person) {
  if (!person.photo) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = resolve;
    img.onerror = resolve;
    img.src = person.photo;
  });
}

function flipToName() {
  showNameSide();
  flipped = true;
  card.classList.remove("no-flip");
  card.classList.add("is-flipped");
}

function renderCard() {
  if (!current) return;
  const person = current;
  shownAt = Date.now();
  pausedAt = 0;
  pausedMs = 0;
  unsureThisCard = false;
  snapToPhotoSide();
  photoWrap.innerHTML = "";
  preloadPhoto(person).then(() => {
    if (current !== person) return;
    photoWrap.innerHTML = photoHTML(person);
    requestAnimationFrame(() => card.classList.remove("no-flip"));
  });
}

function nextCard() {
  current = pickNext();
  if (!current) return;
  recentIds.push(current.id);
  if (recentIds.length > 12) recentIds = recentIds.slice(-RECENT_LIMIT * 3);
  showView("study");
  renderCard();
  updateProgress();
}

function recordGotIt() {
  if (!current) return;
  if (unsureThisCard) {
    nextCard();
    return;
  }
  const previous = personStats(current.id);
  const time = elapsedMs();
  const avgMs = previous.avgMs ? previous.avgMs * 0.65 + time * 0.35 : time;
  updateStats(current.id, {
    gotItCount: previous.gotItCount + 1,
    avgMs,
    lastMs: time,
    lastResult: "got-it",
    lastSeenAt: Date.now(),
  });
  nextCard();
}

function recordOops() {
  if (!current) return;
  if (!unsureThisCard) {
    const previous = personStats(current.id);
    updateStats(current.id, {
      oopsCount: previous.oopsCount + 1,
      lastResult: "oops",
      lastSeenAt: Date.now(),
    });
    unsureThisCard = true;
    updateProgress();
  }
  if (!flipped) {
    flipToName();
    return;
  }
  nextCard();
}

function openEditor(person) {
  editingId = person.id;
  pauseTimer();
  editFullName.textContent = person.fullName;
  editInput.value = displayName(person);
  editDialog.showModal();
  requestAnimationFrame(() => {
    editInput.focus();
    editInput.select();
  });
}

function rosterNote(person) {
  const stats = personStats(person.id);
  const bits = [person.fullName];
  if (person.title) bits[0] += ` · ${person.title}`;
  if (person.pronunciation) bits.push(person.pronunciation);
  if (stats.lastResult === "oops") bits.push("missed last time");
  else if (stats.avgMs) bits.push(`${formatSeconds(stats.avgMs)} avg`);
  return bits.join(" · ");
}

function renderRoster() {
  const query = searchInput.value.trim().toLowerCase();
  const rows = people.filter((person) => {
    const haystack = `${displayName(person)} ${person.fullName} ${person.title} ${person.pronunciation || ""}`.toLowerCase();
    return haystack.includes(query);
  });
  rosterEl.innerHTML = rows
    .map((person) => {
      const stats = personStats(person.id);
      const statusClass =
        stats.lastResult === "got-it" ? "is-known" : stats.lastResult === "oops" ? "is-oops" : "";
      return `
      <li class="person ${statusClass}">
        ${photoHTML(person)}
        <button class="name" type="button" data-edit="${escapeHTML(person.id)}">
          ${escapeHTML(displayName(person))}
          <span class="title">${escapeHTML(rosterNote(person))}</span>
        </button>
        <span class="known-dot"></span>
      </li>`;
    })
    .join("");
}

document.getElementById("tab-study").addEventListener("click", () => {
  resumeTimer();
  showView("study");
  if (!current) nextCard();
});

document.getElementById("tab-names").addEventListener("click", () => {
  pauseTimer();
  renderRoster();
  showView("names");
});

card.addEventListener("click", () => {
  flipped = !flipped;
  if (flipped) showNameSide();
  card.classList.remove("no-flip");
  card.classList.toggle("is-flipped", flipped);
});

document.getElementById("oops-btn").addEventListener("click", recordOops);
document.getElementById("got-it-btn").addEventListener("click", recordGotIt);
document.getElementById("shuffle-btn").addEventListener("click", nextCard);
document.getElementById("reset-btn").addEventListener("click", () => {
  const state = loadState();
  state.stats = {};
  saveState(state);
  recentIds = [];
  renderRoster();
  updateProgress();
});
document.getElementById("edit-btn").addEventListener("click", () => {
  if (current) openEditor(current);
});
document.getElementById("restore-btn").addEventListener("click", () => {
  const person = people.find((item) => item.id === editingId);
  if (person) editInput.value = person.firstName;
});

document.getElementById("edit-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!editingId) {
    editDialog.close();
    return;
  }
  const state = loadState();
  const value = editInput.value.trim();
  const person = people.find((item) => item.id === editingId);
  if (value && person && value !== person.firstName) state.names[editingId] = value;
  else delete state.names[editingId];
  saveState(state);
  if (current && current.id === editingId) revealedName.textContent = displayName(current);
  renderRoster();
  editDialog.close();
});

document.getElementById("cancel-edit-btn").addEventListener("click", () => {
  editDialog.close();
});

editDialog.addEventListener("close", () => {
  if (!namesView.classList.contains("hidden")) return;
  resumeTimer();
});

rosterEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit]");
  if (!button) return;
  const person = people.find((item) => item.id === button.dataset.edit);
  if (person) openEditor(person);
});

searchInput.addEventListener("input", renderRoster);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

async function start() {
  try {
    const response = await fetch("./data/people.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load names");
    people = await response.json();
    people.forEach((person) => {
      person.pronunciation = PRONUNCIATIONS[person.id] || "";
    });
    nextCard();
  } catch (error) {
    console.error(error);
    progressLabel.textContent = "Could not load names";
  }
}

start();
