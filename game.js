// ── Constants ───────────────────────────────────────────────────────────────

const COLOR_HEX = {
  yellow: '#f4a7bf',  // rose pink
  green:  '#7ecec4',  // seafoam
  blue:   '#89b8e8',  // ocean blue
  purple: '#c4a8e8',  // lavender
  gray:   '#c8d4dc',  // pearl
};

const TEXT_COLOR = {
  yellow: '#4a2535',
  green:  '#1a3d3a',
  blue:   '#1a2e45',
  purple: '#2e1a45',
  gray:   '#3a4550',
};

const VALID_COLORS = new Set(Object.keys(COLOR_HEX));

// ── State ────────────────────────────────────────────────────────────────────

const state = {
  puzzle:      [],          // all groups from puzzle.json
  remaining:   [],          // groups not yet solved
  solved:      [],          // groups solved so far
  selected:    new Set(),   // currently selected word strings
  mistakes:    3,           // remaining mistake tokens
  gameOver:    false,
  animating:   false,
  pyramidRows: [],          // [{ size, words: string[], solvedGroup: null | group }]
};

// ── Entry point ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', loadPuzzle);

// ── Data loading & validation ────────────────────────────────────────────────

async function loadPuzzle() {
  try {
    const res = await fetch('./puzzle.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    validatePuzzle(data);
    decodeWords(data);

    if (data.description) {
      const el = document.getElementById('description');
      el.textContent = data.description;
      el.hidden = false;
    }

    initGame(data.groups);
  } catch (err) {
    console.error('Puzzle load error:', err);
    const el = document.getElementById('error-message');
    el.textContent = err.message.startsWith('Virheellinen')
      ? 'Virheellinen palapeli. Tarkista puzzle.json.'
      : 'Peli ei latautunut. Päivitä sivu.';
    el.hidden = false;
  }
}

function decodeWords(data) {
  const dec = new TextDecoder();
  function b64dec(b64) {
    return dec.decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
  }
  for (const g of data.groups) {
    if (g.category !== null) g.category = b64dec(g.category);
    g.words = g.words.map(b64dec);
  }
}

function validatePuzzle(data) {
  if (!data.groups || !Array.isArray(data.groups)) {
    throw new Error('Virheellinen: groups-kenttä puuttuu');
  }
  if (data.groups.length !== 5) {
    throw new Error('Virheellinen: tarvitaan tasan 5 ryhmää');
  }

  const sizes = data.groups.map(g => (g.words || []).length).sort((a, b) => a - b);
  if (JSON.stringify(sizes) !== JSON.stringify([1, 2, 3, 4, 5])) {
    throw new Error('Virheellinen: ryhmäkoot pitää olla 1, 2, 3, 4 ja 5');
  }

  const allWords = data.groups.flatMap(g => g.words || []);
  if (allWords.length !== 15) {
    throw new Error('Virheellinen: sanoja pitää olla tasan 15');
  }

  const lower = allWords.map(w => w.toLowerCase());
  if (new Set(lower).size !== 15) {
    throw new Error('Virheellinen: duplikaattisanoja löytyi');
  }

  const nullGroups = data.groups.filter(g => g.category === null);
  if (nullGroups.length !== 1) {
    throw new Error('Virheellinen: tasan yksi ryhmä saa olla null-kategoria');
  }
  if (nullGroups[0].words.length !== 1) {
    throw new Error('Virheellinen: null-kategoriaryhmässä pitää olla tasan 1 sana');
  }

  for (const g of data.groups) {
    if (!VALID_COLORS.has(g.color)) {
      throw new Error(`Virheellinen väri: "${g.color}"`);
    }
  }
}

// ── Game initialisation ──────────────────────────────────────────────────────

function initGame(groups) {
  state.puzzle      = groups;
  state.remaining   = [...groups];
  state.solved      = [];
  state.selected    = new Set();
  state.mistakes    = 3;
  state.gameOver    = false;
  state.animating   = false;

  // Fisher-Yates shuffle of all 15 words
  const allWords = groups.flatMap(g => g.words);
  shuffle(allWords);

  // Distribute to pyramid rows: top (1) → bottom (5)
  const rowSizes = [1, 2, 3, 4, 5];
  let idx = 0;
  state.pyramidRows = rowSizes.map(size => ({
    size,
    words:       allWords.slice(idx, (idx += size)),
    solvedGroup: null,
  }));

  renderPyramid();
  renderMistakes();
  updateSubmitBtn();
  setHint(null);
  document.getElementById('end-message').hidden = true;
}

// ── Shuffle (Fisher-Yates) ───────────────────────────────────────────────────

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ── Rendering ────────────────────────────────────────────────────────────────

function renderPyramid() {
  const container = document.getElementById('pyramid');
  container.innerHTML = '';

  for (const row of state.pyramidRows) {
    const rowEl = document.createElement('div');
    rowEl.classList.add('pyramid-row');
    rowEl.dataset.size = row.size;

    if (row.solvedGroup) {
      renderSolvedRow(rowEl, row.solvedGroup);
    } else {
      renderUnsolvedRow(rowEl, row);
    }

    container.appendChild(rowEl);
  }
}

function renderSolvedRow(rowEl, group) {
  rowEl.classList.add('solved-row');
  rowEl.style.backgroundColor = COLOR_HEX[group.color];
  rowEl.style.color = TEXT_COLOR[group.color];

  if (group.category !== null) {
    const catEl = document.createElement('div');
    catEl.classList.add('solved-category');
    catEl.textContent = group.category;
    rowEl.appendChild(catEl);
  }

  const wordsEl = document.createElement('div');
  wordsEl.classList.add('solved-words');
  wordsEl.textContent = group.words.join('  ·  ');
  rowEl.appendChild(wordsEl);
}

function renderUnsolvedRow(rowEl, row) {
  const visibleWords = getVisibleWordsForRow(row);

  if (visibleWords.length === 0) {
    rowEl.classList.add('empty-row');
    return;
  }

  for (const word of visibleWords) {
    const tile = document.createElement('button');
    tile.classList.add('tile');
    tile.textContent = word;
    tile.dataset.word = word;
    if (state.selected.has(word)) tile.classList.add('selected');
    tile.addEventListener('click', () => handleTileClick(word));
    rowEl.appendChild(tile);
  }
}

function renderMistakes(justLost = false) {
  const el = document.getElementById('mistakes');
  el.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const span = document.createElement('span');
    span.textContent = i < state.mistakes ? '🩷' : '🤍';
    if (justLost && i === state.mistakes) span.classList.add('heart-lost');
    el.appendChild(span);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Returns the words in this row that have not yet been claimed by a solved group
function getVisibleWordsForRow(row) {
  const remaining = new Set(
    state.remaining.flatMap(g => g.words)
  );
  return row.words.filter(w => remaining.has(w));
}

function updateSubmitBtn() {
  const btn = document.getElementById('submit-btn');
  btn.disabled = state.gameOver || state.animating || !isSubmitValid();
}

function isSubmitValid() {
  if (state.selected.size === 0) return false;
  return state.remaining.some(g => g.words.length === state.selected.size);
}

function setHint(text) {
  const el = document.getElementById('hint-message');
  if (text) {
    el.textContent = text;
    el.hidden = false;
  } else {
    el.textContent = '';
    el.hidden = true;
  }
}

// ── Interaction handlers ─────────────────────────────────────────────────────

function handleTileClick(word) {
  if (state.gameOver || state.animating) return;
  setHint(null); // clear hint on any interaction

  if (state.selected.has(word)) {
    state.selected.delete(word);
  } else {
    state.selected.add(word);
  }

  // Update tile highlight without full re-render
  document.querySelectorAll('.tile').forEach(tile => {
    tile.classList.toggle('selected', state.selected.has(tile.dataset.word));
  });

  updateSubmitBtn();
}

document.getElementById('submit-btn').addEventListener('click', handleSubmit);

function handleSubmit() {
  if (state.gameOver || state.animating) return;

  const matched = checkGuess();
  if (matched) {
    revealGroup(matched);
  } else {
    handleMistake();
  }
}

// ── Guess checking ────────────────────────────────────────────────────────────

function checkGuess() {
  const sel = [...state.selected];
  for (const group of state.remaining) {
    if (group.words.length !== sel.length) continue;
    const groupSet = new Set(group.words.map(w => w.toLowerCase()));
    if (sel.every(w => groupSet.has(w.toLowerCase()))) return group;
  }
  return null;
}

// ── Correct guess ─────────────────────────────────────────────────────────────

function revealGroup(group) {
  state.animating = true;
  updateSubmitBtn();

  // Animate selected tiles (scattered across rows)
  document.querySelectorAll('.tile.selected').forEach(t => t.classList.add('solving'));

  setTimeout(() => {
    // Find the pyramid row whose size matches this group
    const row = state.pyramidRows.find(r => r.size === group.words.length);
    row.solvedGroup = group;

    // Remove group from remaining
    state.remaining = state.remaining.filter(g => g !== group);
    state.solved.push(group);
    state.selected.clear();
    state.animating = false;

    // Redistribute remaining words so unsolved rows stay full
    redistributeWords();

    setHint(null);
    renderPyramid();
    launchEmojis();
    updateSubmitBtn();

    if (state.remaining.length === 0) {
      setTimeout(() => endGame(true), 200);
    }
  }, 420);
}

// Shuffle remaining words back into unsolved rows so there are no gaps
function redistributeWords() {
  const words = state.remaining.flatMap(g => g.words);
  shuffle(words);
  let idx = 0;
  for (const row of state.pyramidRows) {
    if (!row.solvedGroup) {
      row.words = words.slice(idx, idx + row.size);
      idx += row.size;
    }
  }
}

// ── Emoji celebration ────────────────────────────────────────────────────────

function launchEmojis() {
  const pool = ['🎉', '💫', '🎈', '🚀'];
  const count = 8;
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight * 0.55;

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.classList.add('emoji-particle');
    el.textContent = pool[Math.floor(Math.random() * pool.length)];

    const startX = cx + (Math.random() - 0.5) * 80;
    const startY = cy + (Math.random() - 0.5) * 60;

    const angle = Math.random() * Math.PI * 2;
    const dist  = 180 + Math.random() * 220;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 120; // bias upward

    el.style.left      = startX + 'px';
    el.style.top       = startY + 'px';
    el.style.fontSize  = (30 + Math.random() * 26) + 'px';
    el.style.animationDelay = (Math.random() * 180) + 'ms';
    el.style.setProperty('--dx',  dx + 'px');
    el.style.setProperty('--dy',  dy + 'px');
    el.style.setProperty('--rot', (Math.random() - 0.5) * 600 + 'deg');

    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

// ── Win confetti ──────────────────────────────────────────────────────────────

function launchConfetti() {
  const pool = ['✨','🌟','✨','⭐','💛','❤️‍🔥','🩵','💜','💖'];
  const count = 40;
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.classList.add('confetti-particle');
    el.textContent = pool[Math.floor(Math.random() * pool.length)];

    const startX = cx + (Math.random() - 0.5) * 120;
    const startY = cy + (Math.random() - 0.5) * 80;
    const angle  = Math.random() * Math.PI * 2;
    const dist   = 250 + Math.random() * 350;

    el.style.left     = startX + 'px';
    el.style.top      = startY + 'px';
    el.style.fontSize = (36 + Math.random() * 32) + 'px';
    el.style.animationDelay = (Math.random() * 400) + 'ms';
    el.style.setProperty('--dx',  (Math.cos(angle) * dist) + 'px');
    el.style.setProperty('--dy',  (Math.sin(angle) * dist - 200) + 'px');
    el.style.setProperty('--rot', (Math.random() - 0.5) * 720 + 'deg');

    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

// ── Incorrect guess ───────────────────────────────────────────────────────────

function handleMistake() {
  state.mistakes--;
  state.animating = true;
  updateSubmitBtn();

  // Compute hint before clearing selection
  const hint = getNearMissHint();

  // Shake selected tiles
  document.querySelectorAll('.tile.selected').forEach(t => {
    t.classList.add('shake');
    t.addEventListener('animationend', () => t.classList.remove('shake'), { once: true });
  });

  setHint(hint);

  setTimeout(() => {
    state.animating = false;
    renderPyramid();
    renderMistakes(true);
    updateSubmitBtn();

    if (state.mistakes <= 0) {
      setTimeout(() => endGame(false), 300);
    }
  }, 420);
}

// ── Near-miss hints ───────────────────────────────────────────────────────────

function getNearMissHint() {
  if (state.selected.size <= 1) return null;

  const sel = [...state.selected];

  for (const group of state.remaining) {
    const groupSet = new Set(group.words.map(w => w.toLowerCase()));
    const hit     = sel.filter(w => groupSet.has(w.toLowerCase())).length;
    const excess  = sel.length - hit;
    const missing = group.words.length - hit;

    // Right count but one word swapped
    if (hit === group.words.length - 1 && excess === 1 && missing === 1) {
      return 'Yksi väärin';
    }
    // All selected words are correct, just need one more
    if (hit === sel.length && missing === 1) {
      return 'Lisää vielä yksi';
    }
    // All group words selected plus one extra
    if (hit === group.words.length && excess === 1) {
      return 'Yksi ylimääräinen';
    }
  }

  return null;
}

// ── Game over ─────────────────────────────────────────────────────────────────

function endGame(win) {
  state.gameOver = true;
  updateSubmitBtn();

  // Disable all remaining tiles
  document.querySelectorAll('.tile').forEach(t => (t.disabled = true));

  if (win) launchConfetti();

  const el = document.getElementById('end-message');
  el.textContent = win ? 'Voitit! 🤩' : 'Hävisit 😭';
  el.hidden = false;
}
