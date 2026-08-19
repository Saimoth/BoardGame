export const BOARD_SIZE = 6;
export const SCORE_TO_WIN = 5;
export const MAX_STAGED = 6;
export const MAX_PER_TYPE = 2;

export const PIECE_TYPES = Object.freeze({
  tank: {
    name: "Tank",
    short: "T",
    maxHp: 5,
    description: "2 damage directly ahead",
  },
  dps: {
    name: "Arc",
    short: "A",
    maxHp: 3,
    description: "1 damage across the 3 tiles ahead",
  },
  ranged: {
    name: "Ranger",
    short: "R",
    maxHp: 2,
    description: "2 damage exactly 2 tiles ahead",
  },
  healer: {
    name: "Healer",
    short: "H",
    maxHp: 3,
    description: "Heals adjacent allies by 1",
  },
});

const PLAYER_IDS = ["p1", "p2"];

export function createInitialState() {
  return {
    board: Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null)),
    players: {
      p1: { name: "Player 1", score: 0, staging: Array(BOARD_SIZE).fill(null) },
      p2: { name: "Player 2", score: 0, staging: Array(BOARD_SIZE).fill(null) },
    },
    currentPlayer: "p1",
    turn: 1,
    nextUnitId: 1,
    winner: null,
    lastEvent: "Player 1: choose pieces, place them in the lower staging row, then play.",
  };
}

function copyState(state) {
  return {
    ...state,
    board: state.board.map((row) => row.map((unit) => (unit ? { ...unit } : null))),
    players: Object.fromEntries(
      PLAYER_IDS.map((playerId) => [
        playerId,
        {
          ...state.players[playerId],
          staging: state.players[playerId].staging.map((slot) =>
            slot ? { ...slot } : null,
          ),
        },
      ]),
    ),
  };
}

export function queuePiece(state, playerId, column, type) {
  if (state.winner) return state;
  if (playerId !== state.currentPlayer) return state;
  if (!PIECE_TYPES[type] || !isColumn(column)) return state;

  const next = copyState(state);
  const staging = next.players[playerId].staging;
  if (staging[column]) return state;

  const total = staging.filter(Boolean).length;
  const ofType = staging.filter((slot) => slot?.type === type).length;
  if (total >= MAX_STAGED || ofType >= MAX_PER_TYPE) return state;

  staging[column] = { type, status: "draft" };
  next.lastEvent = `${next.players[playerId].name} staged a ${PIECE_TYPES[type].name} in column ${column + 1}.`;
  return next;
}

export function removeQueuedPiece(state, playerId, column) {
  if (state.winner || playerId !== state.currentPlayer || !isColumn(column)) return state;
  const slot = state.players[playerId].staging[column];
  if (!slot || slot.status !== "draft") return state;

  const next = copyState(state);
  next.players[playerId].staging[column] = null;
  next.lastEvent = `${next.players[playerId].name} cleared column ${column + 1}.`;
  return next;
}

export function playTurn(state) {
  if (state.winner) return state;

  const next = copyState(state);
  const activePlayer = next.currentPlayer;
  const events = [];

  const abilityResult = resolveAbilities(next, activePlayer);
  if (abilityResult.damage > 0) events.push(`${abilityResult.damage} damage`);
  if (abilityResult.healing > 0) events.push(`${abilityResult.healing} healing`);
  if (abilityResult.defeated > 0) events.push(`${abilityResult.defeated} defeated`);

  const movementResult = advanceUnits(next, activePlayer);
  if (movementResult.moved > 0) events.push(`${movementResult.moved} advanced`);
  if (movementResult.scored > 0) events.push(`${movementResult.scored} breakthrough`);

  for (const slot of next.players[activePlayer].staging) {
    if (slot?.status === "draft") slot.status = "ready";
  }

  if (next.players[activePlayer].score >= SCORE_TO_WIN) {
    next.winner = activePlayer;
    next.lastEvent = `${next.players[activePlayer].name} wins with ${next.players[activePlayer].score} breakthroughs!`;
    return next;
  }

  next.currentPlayer = otherPlayer(activePlayer);
  next.turn += 1;
  const deployed = deployReadyUnits(next, next.currentPlayer);
  const summary = events.length ? events.join(" · ") : "no units activated";
  const deploySummary = deployed ? ` · ${deployed} deployed for ${next.players[next.currentPlayer].name}` : "";
  next.lastEvent = `${next.players[activePlayer].name}: ${summary}${deploySummary}.`;
  return next;
}

export function stagingCounts(state, playerId) {
  const staging = state.players[playerId].staging;
  return Object.fromEntries(
    Object.keys(PIECE_TYPES).map((type) => [
      type,
      staging.filter((slot) => slot?.type === type).length,
    ]),
  );
}

function deployReadyUnits(state, playerId) {
  const row = playerId === "p1" ? BOARD_SIZE - 1 : 0;
  let deployed = 0;

  state.players[playerId].staging.forEach((slot, column) => {
    if (slot?.status !== "ready" || state.board[row][column]) return;
    const piece = PIECE_TYPES[slot.type];
    state.board[row][column] = {
      id: state.nextUnitId++,
      owner: playerId,
      type: slot.type,
      hp: piece.maxHp,
    };
    state.players[playerId].staging[column] = null;
    deployed += 1;
  });

  return deployed;
}

function resolveAbilities(state, playerId) {
  const effects = new Map();

  forEachUnit(state.board, (unit, row, column) => {
    if (unit.owner !== playerId) return;
    for (const target of targetsFor(unit, row, column)) {
      if (!isOnBoard(target.row, target.column)) continue;
      const targetUnit = state.board[target.row][target.column];
      if (!targetUnit) continue;

      if (target.kind === "heal" && targetUnit.owner === playerId) {
        addEffect(effects, targetUnit.id, 0, target.amount);
      }
      if (target.kind === "damage" && targetUnit.owner !== playerId) {
        addEffect(effects, targetUnit.id, target.amount, 0);
      }
    }
  });

  let damage = 0;
  let healing = 0;
  let defeated = 0;

  forEachUnit(state.board, (unit, row, column) => {
    const effect = effects.get(unit.id);
    if (!effect) return;
    const maxHp = PIECE_TYPES[unit.type].maxHp;
    const healedHp = Math.min(maxHp, unit.hp + effect.healing);
    healing += healedHp - unit.hp;
    const finalHp = healedHp - effect.damage;
    damage += Math.min(healedHp, effect.damage);
    if (finalHp <= 0) {
      state.board[row][column] = null;
      defeated += 1;
    } else {
      unit.hp = finalHp;
    }
  });

  return { damage, healing, defeated };
}

function advanceUnits(state, playerId) {
  const step = playerId === "p1" ? -1 : 1;
  const rows = Array.from({ length: BOARD_SIZE }, (_, index) => index);
  if (playerId === "p2") rows.reverse();

  let moved = 0;
  let scored = 0;

  for (const row of rows) {
    for (let column = 0; column < BOARD_SIZE; column += 1) {
      const unit = state.board[row][column];
      if (!unit || unit.owner !== playerId) continue;
      const nextRow = row + step;
      if (nextRow < 0 || nextRow >= BOARD_SIZE) {
        state.board[row][column] = null;
        state.players[playerId].score += 1;
        scored += 1;
      } else if (!state.board[nextRow][column]) {
        state.board[nextRow][column] = unit;
        state.board[row][column] = null;
        moved += 1;
      }
    }
  }

  return { moved, scored };
}

function targetsFor(unit, row, column) {
  const step = unit.owner === "p1" ? -1 : 1;
  if (unit.type === "tank") {
    return [{ row: row + step, column, kind: "damage", amount: 2 }];
  }
  if (unit.type === "dps") {
    return [-1, 0, 1].map((offset) => ({
      row: row + step,
      column: column + offset,
      kind: "damage",
      amount: 1,
    }));
  }
  if (unit.type === "ranged") {
    return [{ row: row + step * 2, column, kind: "damage", amount: 2 }];
  }
  return [-1, 0, 1]
    .flatMap((rowOffset) =>
      [-1, 0, 1].map((columnOffset) => ({ rowOffset, columnOffset })),
    )
    .filter(({ rowOffset, columnOffset }) => rowOffset !== 0 || columnOffset !== 0)
    .map(({ rowOffset, columnOffset }) => ({
      row: row + rowOffset,
      column: column + columnOffset,
      kind: "heal",
      amount: 1,
    }));
}

function addEffect(effects, id, damage, healing) {
  const current = effects.get(id) ?? { damage: 0, healing: 0 };
  current.damage += damage;
  current.healing += healing;
  effects.set(id, current);
}

function forEachUnit(board, callback) {
  board.forEach((row, rowIndex) =>
    row.forEach((unit, columnIndex) => {
      if (unit) callback(unit, rowIndex, columnIndex);
    }),
  );
}

function otherPlayer(playerId) {
  return playerId === "p1" ? "p2" : "p1";
}

function isColumn(column) {
  return Number.isInteger(column) && column >= 0 && column < BOARD_SIZE;
}

function isOnBoard(row, column) {
  return row >= 0 && row < BOARD_SIZE && column >= 0 && column < BOARD_SIZE;
}
