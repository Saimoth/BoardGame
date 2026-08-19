import {
  BOARD_SIZE,
  MAX_PER_TYPE,
  PIECE_TYPES,
  SCORE_TO_WIN,
  canPlayTurn,
  createInitialState,
  isColumnFull,
  playTurn,
  queuePiece,
  removeQueuedPiece,
  requiredStagingSlots,
  stagingCounts,
} from "./game.js";

let state = createInitialState();
const selectedType = { p1: "tank", p2: "tank" };

const boardElement = document.querySelector("#board");
const turnLabel = document.querySelector("#turn-label");
const eventLog = document.querySelector("#event-log");
const rulesDialog = document.querySelector("#rules-dialog");

document.querySelector("#rules-button").addEventListener("click", () => rulesDialog.showModal());
document.querySelector("#reset-button").addEventListener("click", () => {
  if (window.confirm("Reset the current match?")) {
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

  const currentName = state.players[state.currentPlayer].name;
  turnLabel.textContent = state.winner
    ? `${state.players[state.winner].name} wins`
    : `Turn ${state.turn} · ${currentName}`;
  eventLog.textContent = state.lastEvent;
  document.body.dataset.turn = state.currentPlayer;
}

function renderPlayer(playerId) {
  const player = state.players[playerId];
  const isActive = playerId === state.currentPlayer && !state.winner;
  const counts = stagingCounts(state, playerId);
  const remaining = requiredStagingSlots(state, playerId);
  const turnReady = canPlayTurn(state, playerId);
  const panel = document.querySelector(`#player-${playerId}`);

  panel.classList.toggle("is-active", isActive);
  panel.innerHTML = `
    <div class="player-heading">
      <div class="player-identity">
        <span class="player-dot" aria-hidden="true"></span>
        <div>
          <strong>${player.name}</strong>
          <span>${playerId === "p1" ? "Advances upward" : "Advances downward"}</span>
        </div>
      </div>
      <div class="score" aria-label="${player.score} of ${SCORE_TO_WIN} breakthroughs">
        <strong>${player.score}</strong><span>/${SCORE_TO_WIN}</span>
      </div>
    </div>
    <div class="piece-picker" role="group" aria-label="${player.name} unit selection">
      ${Object.entries(PIECE_TYPES)
        .map(([type, piece]) => pickerButton(playerId, type, piece, counts[type], isActive))
        .join("")}
    </div>
    <button class="play-button" type="button" ${turnReady ? "" : "disabled"}>
      <span>${
        state.winner
          ? "Match over"
          : !isActive
            ? "Waiting"
            : remaining > 0
              ? `Fill ${remaining} more ${remaining === 1 ? "slot" : "slots"}`
              : "Play turn"
      }</span>
      <span class="play-arrow" aria-hidden="true">${playerId === "p1" ? "↑" : "↓"}</span>
    </button>
  `;

  panel.querySelectorAll("[data-piece-type]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedType[playerId] = button.dataset.pieceType;
      renderPlayer(playerId);
    });
  });

  panel.querySelector(".play-button").addEventListener("click", () => {
    state = playTurn(state);
    render();
  });
}

function pickerButton(playerId, type, piece, count, isActive) {
  const isSelected = selectedType[playerId] === type;
  const atLimit = count >= MAX_PER_TYPE;
  return `
    <button
      class="piece-choice ${isSelected ? "is-selected" : ""}"
      data-piece-type="${type}"
      type="button"
      title="${piece.description}"
      aria-pressed="${isSelected}"
      ${!isActive || atLimit ? "disabled" : ""}
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
      cell.setAttribute("aria-label", unit ? unitLabel(unit, rowIndex, columnIndex) : `Empty, row ${rowIndex + 1}, column ${columnIndex + 1}`);
      if (unit) cell.append(createToken(unit));
      boardElement.append(cell);
    });
  });
}

function renderStaging(playerId) {
  const element = document.querySelector(`#staging-${playerId}`);
  const player = state.players[playerId];
  const isActive = state.currentPlayer === playerId && !state.winner;
  element.innerHTML = "";

  player.staging.forEach((slot, column) => {
    const columnFull = isColumnFull(state, column);
    const button = document.createElement("button");
    button.className = "staging-cell";
    button.type = "button";
    button.disabled = !isActive || slot?.status === "ready" || (!slot && columnFull);
    button.dataset.status = slot?.status ?? (columnFull ? "blocked" : "empty");
    button.setAttribute(
      "aria-label",
      slot
        ? `${PIECE_TYPES[slot.type].name}, column ${column + 1}, ${slot.status}`
        : columnFull
          ? `Column ${column + 1} is full; staging is blocked`
        : `Place ${PIECE_TYPES[selectedType[playerId]].name} in column ${column + 1}`,
    );

    if (slot) {
      button.append(createStagingToken(playerId, slot));
    } else {
      const marker = document.createElement("span");
      marker.className = columnFull ? "slot-marker slot-marker--blocked" : "slot-marker";
      marker.textContent = columnFull ? "FULL" : "+";
      button.append(marker);
    }

    button.addEventListener("click", () => {
      state = slot
        ? removeQueuedPiece(state, playerId, column)
        : queuePiece(state, playerId, column, selectedType[playerId]);
      render();
    });
    element.append(button);
  });
}

function createToken(unit) {
  const piece = PIECE_TYPES[unit.type];
  const token = document.createElement("div");
  token.className = `unit-token owner-${unit.owner} piece-${unit.type}`;
  token.innerHTML = `
    <span class="unit-letter">${piece.short}</span>
    <span class="health" aria-hidden="true">${unit.hp}</span>
  `;
  return token;
}

function createStagingToken(playerId, slot) {
  const piece = PIECE_TYPES[slot.type];
  const token = document.createElement("span");
  token.className = `staged-token owner-${playerId} piece-${slot.type}`;
  token.innerHTML = `<span>${piece.short}</span><small>${slot.status === "ready" ? "READY" : "DRAFT"}</small>`;
  return token;
}

function unitLabel(unit, row, column) {
  return `${state.players[unit.owner].name} ${PIECE_TYPES[unit.type].name}, ${unit.hp} health, row ${row + 1}, column ${column + 1}`;
}

render();
