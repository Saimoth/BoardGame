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
      p1: {
        name: "Player 1",
        score: 0,
        staging: Array(BOARD_SIZE).fill(null),
        ready: false,
      },
      p2: {
        name: "Player 2",
        score: 0,
        staging: Array(BOARD_SIZE).fill(null),
        ready: false,
      },
    },
    round: 1,
    nextUnitId: 1,
    winner: null,
    lastEvent: "Round 1: both players must fill their staging row and press ready.",
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
  if (state.winner || state.players[playerId]?.ready) return state;
  if (!PIECE_TYPES[type] || !isColumn(column) || isColumnFull(state, column)) return state;

  const next = copyState(state);
  const staging = next.players[playerId].staging;
  if (staging[column]) return state;

  const total = staging.filter(Boolean).length;
  const ofType = staging.filter(
    (slot) => slot?.type === type && slot.status === "draft",
  ).length;
  if (total >= MAX_STAGED || ofType >= MAX_PER_TYPE) return state;

  staging[column] = { type, status: "draft" };
  next.lastEvent = `${next.players[playerId].name} staged a ${PIECE_TYPES[type].name} in column ${column + 1}.`;
  return next;
}

export function removeQueuedPiece(state, playerId, column) {
  if (state.winner || state.players[playerId]?.ready || !isColumn(column)) return state;
  const slot = state.players[playerId]?.staging[column];
  if (!slot || slot.status !== "draft") return state;

  const next = copyState(state);
  next.players[playerId].staging[column] = null;
  next.lastEvent = `${next.players[playerId].name} cleared column ${column + 1}.`;
  return next;
}

export function randomizeStaging(state, playerId, random = Math.random) {
  if (state.winner || state.players[playerId]?.ready) return state;

  const next = copyState(state);
  const staging = next.players[playerId].staging;
  const counts = Object.fromEntries(Object.keys(PIECE_TYPES).map((type) => [type, 0]));

  for (let column = 0; column < BOARD_SIZE; column += 1) {
    if (staging[column]?.status === "draft") staging[column] = null;
  }

  for (let column = 0; column < BOARD_SIZE; column += 1) {
    if (staging[column] || isColumnFull(next, column)) continue;
    const availableTypes = Object.keys(PIECE_TYPES).filter(
      (type) => counts[type] < MAX_PER_TYPE,
    );
    const roll = Math.max(0, Math.min(0.999999, Number(random()) || 0));
    const type = availableTypes[Math.floor(roll * availableTypes.length)];
    staging[column] = { type, status: "draft" };
    counts[type] += 1;
  }

  next.lastEvent = `${next.players[playerId].name} generated a random staging row.`;
  return next;
}

export function readyPlayer(state, playerId) {
  if (!canReadyPlayer(state, playerId)) return state;

  const next = copyState(state);
  next.players[playerId].ready = true;

  if (PLAYER_IDS.every((id) => next.players[id].ready)) {
    return resolveRound(next);
  }

  const waitingFor = PLAYER_IDS.find((id) => !next.players[id].ready);
  next.lastEvent = `${next.players[playerId].name} is ready. Waiting for ${next.players[waitingFor].name}.`;
  return next;
}

export function stagingCounts(state, playerId) {
  const staging = state.players[playerId].staging;
  return Object.fromEntries(
    Object.keys(PIECE_TYPES).map((type) => [
      type,
      staging.filter((slot) => slot?.type === type && slot.status === "draft").length,
    ]),
  );
}

export function isColumnFull(state, column) {
  if (!isColumn(column)) return false;
  return state.board.every((row) => Boolean(row[column]));
}

export function requiredStagingSlots(state, playerId) {
  return state.players[playerId].staging.reduce(
    (remaining, slot, column) =>
      remaining + (!slot && !isColumnFull(state, column) ? 1 : 0),
    0,
  );
}

export function canReadyPlayer(state, playerId) {
  return (
    !state.winner &&
    Boolean(state.players[playerId]) &&
    !state.players[playerId].ready &&
    requiredStagingSlots(state, playerId) === 0
  );
}

function resolveRound(state) {
  const next = copyState(state);
  const resolvedRound = next.round;
  const events = [];

  const abilityResult = resolveAbilities(next);
  if (abilityResult.damage > 0) events.push(`${abilityResult.damage} damage`);
  if (abilityResult.healing > 0) events.push(`${abilityResult.healing} healing`);
  if (abilityResult.defeated > 0) events.push(`${abilityResult.defeated} defeated`);

  const followThrough = followThroughDefeats(next, abilityResult.defeats);
  if (followThrough.moved > 0) events.push(`${followThrough.moved} followed through`);

  const movementResult = advanceUnitsSimultaneously(next, followThrough.movedUnitIds);
  const totalMoved = followThrough.moved + movementResult.moved;
  if (totalMoved > 0) events.push(`${totalMoved} advanced`);
  const totalScored = movementResult.scored.p1 + movementResult.scored.p2;
  if (totalScored > 0) events.push(`${totalScored} breakthrough${totalScored === 1 ? "" : "s"}`);

  const p1Won = next.players.p1.score >= SCORE_TO_WIN;
  const p2Won = next.players.p2.score >= SCORE_TO_WIN;
  if (p1Won && p2Won) next.winner = "draw";
  else if (p1Won) next.winner = "p1";
  else if (p2Won) next.winner = "p2";

  if (next.winner) {
    next.lastEvent =
      next.winner === "draw"
        ? `Round ${resolvedRound}: both players reached ${SCORE_TO_WIN}. The match is a draw.`
        : `Round ${resolvedRound}: ${next.players[next.winner].name} wins with ${next.players[next.winner].score} breakthroughs!`;
    return next;
  }

  for (const playerId of PLAYER_IDS) {
    for (const slot of next.players[playerId].staging) {
      if (slot?.status === "draft") slot.status = "ready";
    }
  }

  const deployed = PLAYER_IDS.reduce(
    (total, playerId) => total + deployReadyUnits(next, playerId),
    0,
  );
  if (deployed > 0) events.push(`${deployed} deployed`);

  for (const playerId of PLAYER_IDS) next.players[playerId].ready = false;
  next.round += 1;
  const summary = events.length ? events.join(" · ") : "no units activated";
  next.lastEvent = `Round ${resolvedRound}: ${summary}. Plan round ${next.round}.`;
  return next;
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

function resolveAbilities(state) {
  const effects = new Map();

  forEachUnit(state.board, (unit, row, column) => {
    for (const target of targetsFor(unit, row, column)) {
      if (!isOnBoard(target.row, target.column)) continue;
      const targetUnit = state.board[target.row][target.column];
      if (!targetUnit) continue;

      if (target.kind === "heal" && targetUnit.owner === unit.owner) {
        addEffect(effects, targetUnit.id, 0, target.amount);
      }
      if (target.kind === "damage" && targetUnit.owner !== unit.owner) {
        addEffect(effects, targetUnit.id, target.amount, 0, {
          id: unit.id,
          owner: unit.owner,
          row,
          column,
        });
      }
    }
  });

  let damage = 0;
  let healing = 0;
  let defeated = 0;
  const defeats = [];

  forEachUnit(state.board, (unit, row, column) => {
    const effect = effects.get(unit.id);
    if (!effect) return;
    const maxHp = PIECE_TYPES[unit.type].maxHp;
    const healedHp = Math.min(maxHp, unit.hp + effect.healing);
    healing += healedHp - unit.hp;
    const finalHp = healedHp - effect.damage;
    damage += Math.min(healedHp, effect.damage);
    if (finalHp <= 0) {
      defeats.push({
        unit: { ...unit },
        row,
        column,
        attackers: effect.attackers,
      });
      state.board[row][column] = null;
      defeated += 1;
    } else {
      unit.hp = finalHp;
    }
  });

  return { damage, healing, defeated, defeats };
}

function followThroughDefeats(state, defeats) {
  const movedUnitIds = new Set();
  let moved = 0;

  for (const defeat of defeats) {
    if (state.board[defeat.row][defeat.column]) continue;

    const directAttackers = defeat.attackers.filter((attacker) => {
      const step = attacker.owner === "p1" ? -1 : 1;
      return (
        attacker.column === defeat.column &&
        attacker.row + step === defeat.row &&
        state.board[attacker.row][attacker.column]?.id === attacker.id
      );
    });
    const attackingOwners = new Set(directAttackers.map((attacker) => attacker.owner));
    if (directAttackers.length !== 1 || attackingOwners.size !== 1) continue;

    const attacker = directAttackers[0];
    const step = attacker.owner === "p1" ? -1 : 1;
    const chain = [];
    for (
      let row = attacker.row;
      isOnBoard(row, defeat.column) && state.board[row][defeat.column]?.owner === attacker.owner;
      row -= step
    ) {
      chain.push({ row, unit: state.board[row][defeat.column] });
    }

    for (const entry of chain) state.board[entry.row][defeat.column] = null;
    for (const entry of chain) {
      state.board[entry.row + step][defeat.column] = entry.unit;
      movedUnitIds.add(entry.unit.id);
      moved += 1;
    }
  }

  return { moved, movedUnitIds };
}

function advanceUnitsSimultaneously(state, alreadyMoved = new Set()) {
  const snapshot = state.board.map((row) => row.slice());
  const exits = [];
  const intents = [];
  const targetCounts = new Map();

  snapshot.forEach((row, rowIndex) => {
    row.forEach((unit, column) => {
      if (!unit || alreadyMoved.has(unit.id)) return;
      const step = unit.owner === "p1" ? -1 : 1;
      const targetRow = rowIndex + step;
      if (targetRow < 0 || targetRow >= BOARD_SIZE) {
        exits.push({ unit, row: rowIndex, column });
        return;
      }
      if (snapshot[targetRow][column]) return;
      const key = `${targetRow}:${column}`;
      intents.push({ unit, row: rowIndex, column, targetRow, key });
      targetCounts.set(key, (targetCounts.get(key) ?? 0) + 1);
    });
  });

  const successfulMoves = intents.filter((intent) => targetCounts.get(intent.key) === 1);
  for (const exit of exits) {
    state.board[exit.row][exit.column] = null;
    state.players[exit.unit.owner].score += 1;
  }
  for (const move of successfulMoves) state.board[move.row][move.column] = null;
  for (const move of successfulMoves) state.board[move.targetRow][move.column] = move.unit;

  return {
    moved: successfulMoves.length,
    scored: {
      p1: exits.filter((exit) => exit.unit.owner === "p1").length,
      p2: exits.filter((exit) => exit.unit.owner === "p2").length,
    },
  };
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

function addEffect(effects, id, damage, healing, attacker = null) {
  const current = effects.get(id) ?? { damage: 0, healing: 0, attackers: [] };
  current.damage += damage;
  current.healing += healing;
  if (attacker && !current.attackers.some((source) => source.id === attacker.id)) {
    current.attackers.push(attacker);
  }
  effects.set(id, current);
}

function forEachUnit(board, callback) {
  board.forEach((row, rowIndex) =>
    row.forEach((unit, columnIndex) => {
      if (unit) callback(unit, rowIndex, columnIndex);
    }),
  );
}

function isColumn(column) {
  return Number.isInteger(column) && column >= 0 && column < BOARD_SIZE;
}

function isOnBoard(row, column) {
  return row >= 0 && row < BOARD_SIZE && column >= 0 && column < BOARD_SIZE;
}

