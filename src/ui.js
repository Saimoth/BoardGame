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
            ? "Ready âœ“"
            : remaining > 0
              ? `Fill ${remaining} more ${remaining === 1 ? "slot" : "slots"}`
              : "Ready"
      }</span>
      <span class="play-arrow" aria-hidden="true">${player.ready ? "âœ“" : playerId === "p1" ? "â†‘" : "â†“"}</span>
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

function createStagingToken(playerId, slot, playerReady) {
  const piece = PIECE_TYPES[slot.type];
  const token = document.createElement("span");
  token.className = `staged-token owner-${playerId} piece-${slot.type}`;
  const status = playerReady && slot.status === "draft" ? "LOCKED" : slot.status === "ready" ? "WAIT" : "DRAFT";
  token.innerHTML = `<span>${piece.short}</span><small>${status}</small>`;
  return token;
}

function roundStatus() {
  if (state.winner === "draw") return "Match drawn";
  if (state.winner) return `${state.players[state.winner].name} wins`;
  const readyPlayers = ["p1", "p2"].filter((playerId) => state.players[playerId].ready);
  if (readyPlayers.length === 1) {
    const waitingFor = readyPlayers[0] === "p1" ? "p2" : "p1";
    return `Round ${state.round} Â· waiting for ${state.players[waitingFor].name}`;
  }
  return `Round ${state.round} Â· both players planning`;
}

function scheduleAutomation() {
  clearAutomation();
  if (state.winner) return;
  const automatedPlayers = ["p1", "p2"].filter(
    (playerId) => autoPlay[playerId] && !state.players[playerId].ready,
  );
  if (!automatedPlayers.length) return;

  autoTimer = window.setTimeout(() => {
    autoTimer = null;
    for (const playerId of automatedPlayers) {
      if (state.winner || state.players[playerId].ready || !autoPlay[playerId]) continue;
      state = randomizeStaging(state, playerId);
      if (canReadyPlayer(state, playerId)) state = readyPlayer(state, playerId);
    }
    render();
  }, 1000);
}

function clearAutomation() {
  if (autoTimer !== null) window.clearTimeout(autoTimer);
  autoTimer = null;
}

function unitLabel(unit, row, column) {
  return `${state.players[unit.owner].name} ${PIECE_TYPES[unit.type].name}, ${unit.hp} health, row ${row + 1}, column ${column + 1}`;
}

render();

