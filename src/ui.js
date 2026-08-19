import {
  MAX_PER_TYPE,
  PIECE_TYPES,
  SCORE_TO_WIN,
  canReadyPlayer,
  createInitialState,
  isColumnFull,
  queuePiece,
  randomizeStaging,
  readyPlayer,
  removeQueuedPiece,
  requiredStagingSlots,
  stagingCounts,
} from "./game.js";

let state = createInitialState();
let autoTimer = null;
const selectedType = { p1: "tank", p2: "tank" };
const autoPlay = { p1: false, p2: false };

const boardElement = document.querySelector("#board");
const turnLabel = document.querySelector("#turn-label");
const eventLog = document.querySelector("#event-log");
const rulesDialog = document.querySelector("#rules-dialog");

document.querySelector("#rules-button").addEventListener("click", () => rulesDialog.showModal());
document.querySelector("#reset-button").addEventListener("click", () => {
  if (window.confirm("Reset the current match?")) {
    clearAutomation();
    autoPlay.p1 = false;
    autoPlay.p2 = false;
    state = createInitialState();
    render();
  }
});

function render() {
  renderPlayer("p2");
  renderBoard();
  renderStaging("p2");
  renderStaging("p1");
  renderPlayer("p1");

  turnLabel.textContent = roundStatus();
  eventLog.textContent = state.lastEvent;
  scheduleAutomation();
}

function renderPlayer(playerId) {
  const player = state.players[playerId];
  const isEditable = !player.ready && !state.winner;
  const counts = stagingCounts(state, playerId);
  const remaining = requiredStagingSlots(state, playerId);
  const canReady = canReadyPlayer(state, playerId);
  const panel = document.querySelector(`#player-${playerId}`);

  panel.classList.toggle("is-active", isEditable);
  panel.classList.toggle("is-ready", player.ready);
  panel.innerHTML = `
    <div class="player-heading">
      <div class="player-identity">
        <span class="player-dot" aria-hidden="true"></span>
        <div>
          <strong>${player.name}</strong>
          <span>${player.ready ? "Locked and ready" : playerId === "p1" ? "Advances upward" : "Advances downward"}</span>
        </div>
      </div>
      <div class="player-heading-actions">
        <label class="random-toggle" title="Automatically create a legal row and ready every second">
          <input type="checkbox" data-auto-player="${playerId}" ${autoPlay[playerId] ? "checked" : ""} ${state.winner ? "disabled" : ""} />
          <span>Random</span>
        </label>
        <div class="score" aria-label="${player.score} of ${SCORE_TO_WIN} breakthroughs">
          <strong>${player.score}</strong><span>/${SCORE_TO_WIN}</span>
        </div>
      </div>
    </div>
    <div class="piece-picker" role="group" aria-label="${player.name} unit selection">
      ${Object.entries(PIECE_TYPES)
        .map(([type, piece]) => pickerButton(playerId, type, piece, counts[type], isEditable))
        .join("")}
    </div>
    <button class="play-button ${player.ready ? "is-ready" : ""}" type="button" ${canReady ? "" : "disabled"}>
      <span>${
        state.winner
          ? "Match over"
          : player.ready
            ? "Ready ✓"
            : remaining > 0
              ? `Fill ${remaining} more ${remaining === 1 ? "slot" : "slots"}`
              : "Ready"
      }</span>
      <span class="play-arrow" aria-hidden="true">${player.ready ? "✓" : playerId === "p1" ? "↑" : "↓"}</span>
    </button>
  `;

  panel.querySelectorAll("[data-piece-type]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedType[playerId] = button.dataset.pieceType;
      renderPlayer(playerId);
    });
  });

  panel.querySelector(".play-button").addEventListener("click", () => {
    state = readyPlayer(state, playerId);
    render();
  });

  panel.querySelector("[data-auto-player]").addEventListener("change", (event) => {
    autoPlay[playerId] = event.currentTarget.checked;
    render();
  });
}

function pickerButton(playerId, type, piece, count, isEditable) {
  const isSelected = selectedType[playerId] === type;
  const atLimit = count >= MAX_PER_TYPE;
  return `
    <button
      class="piece-choice ${isSelected ? "is-selected" : ""}"
      data-piece-type="${type}"
      type="button"
      title="${piece.description}"
      aria-pressed="${isSelected}"
      ${!isEditable || atLimit ? "disabled" : ""}
    >
      <span class="choice-icon piece-${type}">${piece.short}</span>
      <span class="choice-copy"><strong>${piece.name}</strong><small>${piece.maxHp} HP</small></span>
      <span class="choice-count">${count}/${MAX_PER_TYPE}</span>
    </button>
  `;
}

function renderBoard() {
  boardElement.innerHTML = "";
  state.board.forEach((row, rowIndex) => {
    row.forEach((unit, columnIndex) => {
      const cell = document.createElement("div");
      cell.className = "board-cell";
      cell.setAttribute("role", "gridcell");
      cell.dataset.row = rowIndex;
      cell.dataset.column = columnIndex;
      cell.setAttribute(
        "aria-label",
        unit
          ? unitLabel(unit, rowIndex, columnIndex)
          : `Empty, row ${rowIndex + 1}, column ${columnIndex + 1}`,
      );
      if (unit) cell.append(createToken(unit));
      boardElement.append(cell);
    });
  });
}

function renderStaging(playerId) {
  const element = document.querySelector(`#staging-${playerId}`);
  const player = state.players[playerId];
  const isEditable = !player.ready && !state.winner;
  element.innerHTML = "";

  player.staging.forEach((slot, column) => {
    const columnFull = isColumnFull(state, column);
    const button = document.createElement("button");
    button.className = "staging-cell";
    button.type = "button";
    button.disabled = !isEditable || slot?.status === "ready" || (!slot && columnFull);
    button.dataset.status =
      player.ready && slot?.status === "draft"
        ? "locked"
        : slot?.status ?? (columnFull ? "blocked" : "empty");
    button.setAttribute(
      "aria-label",
      slot
        ? `${PIECE_TYPES[slot.type].name}, column ${column + 1}, ${player.ready ? "locked" : slot.status}`
        : columnFull
          ? `Column ${column + 1} is full; staging is blocked`
          : `Place ${PIECE_TYPES[selectedType[playerId]].name} in column ${column + 1}`,
    );

    if (slot) {
      button.append(createStagingToken(playerId, slot, player.ready));
    } else {
      const marker = document.createElement("span");
      marker.className = columnFull ? "slot-marker slot-marker--blocked" : "slot-marker";
      marker.textContent = columnFull ? "FULL" : "+";
      button.append(ma…2037 tokens truncated…flow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.choice-copy strong {
  font-size: 0.62rem;
}

.choice-copy small {
  color: var(--muted);
  font-size: 0.52rem;
}

.choice-count {
  position: absolute;
  top: 3px;
  right: 4px;
  color: var(--muted);
  font-size: 0.48rem;
  font-weight: 800;
}

.piece-tank { color: #ffc85c; }
.piece-dps { color: #e78cff; }
.piece-ranged { color: #69b7ff; }
.piece-healer { color: #75e6a4; }

.play-button {
  width: 100%;
  min-height: 34px;
  margin-top: 7px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 0;
  border-radius: 9px;
  background: var(--active-color);
  color: #07111d;
  font-size: 0.72rem;
  font-weight: 950;
  letter-spacing: 0.02em;
  cursor: pointer;
}

.play-button:disabled {
  background: #1b2c3d;
  color: var(--muted);
  cursor: default;
}

.play-button.is-ready:disabled {
  background: color-mix(in srgb, var(--active-color) 24%, #152636);
  color: var(--active-color);
}

.play-arrow {
  font-size: 1rem;
}

.battlefield {
  position: relative;
  padding: 5px;
  border: 1px solid #34516a;
  border-radius: 18px;
  background: #091827;
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.22);
}

.board,
.staging-row {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
}

.board {
  aspect-ratio: 1;
  padding: 4px 0;
  grid-template-rows: repeat(6, minmax(0, 1fr));
}

.board-cell,
.staging-cell {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: grid;
  place-items: center;
  border-radius: 8px;
}

.board-cell {
  background: #12283a;
  box-shadow: inset 0 0 0 1px rgba(144, 181, 207, 0.08);
}

.board-cell:nth-child(12n + 2),
.board-cell:nth-child(12n + 4),
.board-cell:nth-child(12n + 6),
.board-cell:nth-child(12n + 7),
.board-cell:nth-child(12n + 9),
.board-cell:nth-child(12n + 11) {
  background: #102435;
}

.board-cell[data-row="0"] {
  box-shadow: inset 0 3px 0 rgba(255, 150, 120, 0.3);
}

.board-cell[data-row="5"] {
  box-shadow: inset 0 -3px 0 rgba(83, 216, 189, 0.3);
}

.staging-row {
  height: clamp(42px, 10vw, 54px);
}

.staging-cell {
  padding: 0;
  border: 1px dashed #3a5870;
  background: rgba(15, 36, 53, 0.8);
  cursor: pointer;
}

.staging-row--top .staging-cell {
  border-top-color: var(--p2);
}

.staging-row--top {
  --active-color: var(--p2);
}

.staging-row--bottom .staging-cell {
  border-bottom-color: var(--p1);
}

.staging-row--bottom {
  --active-color: var(--p1);
}

.staging-cell:disabled {
  cursor: default;
}

.staging-cell[data-status="ready"],
.staging-cell[data-status="locked"] {
  background: repeating-linear-gradient(135deg, #162b3d 0 7px, #102435 7px 14px);
}

.staging-cell[data-status="locked"] {
  border-style: solid;
  border-color: color-mix(in srgb, var(--active-color, var(--line)) 55%, var(--line));
}

.staging-cell[data-status="blocked"] {
  border-style: solid;
  border-color: #243b4e;
  background: repeating-linear-gradient(135deg, #0b1824 0 6px, #101f2d 6px 12px);
}

.slot-marker {
  color: #3b566c;
  font-size: 1rem;
  font-weight: 600;
}

.slot-marker--blocked {
  color: #60778b;
  font-size: 0.48rem;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.unit-token {
  position: relative;
  width: 78%;
  max-height: 78%;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border: 3px solid currentColor;
  border-radius: 50%;
  background: #0a1724;
  box-shadow: 0 5px 12px rgba(0, 0, 0, 0.3);
}

.owner-p1 {
  background-color: var(--p1-dark);
  box-shadow: 0 0 0 2px var(--p1), 0 5px 12px rgba(0, 0, 0, 0.3);
}

.owner-p2 {
  background-color: var(--p2-dark);
  box-shadow: 0 0 0 2px var(--p2), 0 5px 12px rgba(0, 0, 0, 0.3);
}

.unit-letter {
  font-size: clamp(0.72rem, 3.5vw, 1.1rem);
  font-weight: 950;
}

.health {
  position: absolute;
  right: -5px;
  bottom: -4px;
  min-width: 17px;
  height: 17px;
  padding: 0 3px;
  display: grid;
  place-items: center;
  border: 2px solid #07111d;
  border-radius: 9px;
  background: #f5fbff;
  color: #07111d;
  font-size: 0.56rem;
  font-weight: 950;
}

.staged-token {
  width: 74%;
  aspect-ratio: 1.15;
  display: grid;
  place-items: center;
  align-content: center;
  border: 2px solid currentColor;
  border-radius: 9px;
  font-size: 0.72rem;
  font-weight: 950;
}

.staged-token small {
  font-size: 0.34rem;
  letter-spacing: 0.08em;
}

.game-status {
  min-height: 42px;
  padding: 8px 10px;
  border-left: 3px solid var(--gold);
  border-radius: 0 9px 9px 0;
  background: rgba(13, 27, 42, 0.72);
}

.game-status span {
  display: block;
  color: var(--gold);
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.game-status p {
  margin-top: 2px;
  color: var(--muted);
  font-size: 0.62rem;
  line-height: 1.35;
}

.rules-dialog {
  width: min(calc(100% - 32px), 440px);
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: #0d1b2a;
  color: var(--text);
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.55);
}

.rules-dialog::backdrop {
  background: rgba(2, 8, 14, 0.82);
  backdrop-filter: blur(4px);
}

.rules-dialog form {
  padding: 20px;
}

.dialog-heading h2 {
  font-size: 1.25rem;
}

.rules-dialog ol {
  margin: 18px 0;
  padding-left: 22px;
  color: #c6d5e1;
  font-size: 0.82rem;
  line-height: 1.55;
}

.rules-dialog li + li {
  margin-top: 7px;
}

.debug-note {
  margin: 0;
  padding: 10px;
  border-radius: 9px;
  background: #14283a;
  color: var(--muted);
  font-size: 0.72rem;
}

@media (max-height: 760px) {
  body {
    padding-top: max(10px, env(safe-area-inset-top));
    padding-bottom: max(12px, env(safe-area-inset-bottom));
  }

  .game-app {
    gap: 6px;
  }

  .player-panel {
    padding: 7px;
  }

  .player-heading {
    margin-bottom: 5px;
  }

  .piece-choice {
    min-height: 40px;
  }

  .play-button {
    min-height: 30px;
    margin-top: 5px;
  }

  .staging-row {
    height: 38px;
  }
}

@media (max-width: 350px) {
  .choice-copy {
    display: none;
  }

  .piece-choice {
    grid-template-columns: 1fr;
  }

  .choice-icon {
    margin: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
