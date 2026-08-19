export const BOARD_ROWS = 6;
export const BOARD_COLUMNS = 5;
export const SCORE_TO_WIN = 3;
export const MAX_STAGED = BOARD_COLUMNS;
export const MAX_PER_TYPE = Object.freeze({
  tank: 2,
  dps: 2,
  ranged: 2,
  healer: 1,
});
export const CRITICAL_CHANCE = 0.2;

export const PIECE_TYPES = Object.freeze({
  tank: {
    name: "Tank",
    short: "T",
    maxHp: 10,
    description: "1 damage across the 3 tiles ahead; taunts Arcs",
  },
  dps: {
    name: "Arc",
    short: "A",
    maxHp: 5,
    description: "2 damage across the 3 tiles ahead",
  },
  ranged: {
    name: "Ranger",
    short: "R",
    maxHp: 5,
    description: "1 damage ahead and 3 damage two tiles ahead",
  },
  healer: {
    name: "Healer",
    short: "H",
    maxHp: 3,
    description: "Heals adjacent non-healers by 2",
  },
});

const PLAYER_IDS = ["p1", "p2"];

export function createInitialState() {
  return {
    board: Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLUMNS).fill(null)),
    players: {
      p1: {
        name: "Player 1",
        score: 0,
        played: emptyPieceCounts(),
        staging: Array(BOARD_COLUMNS).fill(null),
        ready: false,
      },
      p2: {
        name: "Player 2",
        score: 0,
        played: emptyPieceCounts(),
        staging: Array(BOARD_COLUMNS).fill(null),
        ready: false,
      },
    },
    round: 1,
    shufflePasses: 0,
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
          played: { ...state.players[playerId].played },
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
  if (
    !PIECE_TYPES[type] ||
    !isColumn(column) ||
    isStagingColumnBlocked(state, playerId, column)
  ) return state;

  const next = copyState(state);
  const staging = next.players[playerId].staging;
  if (staging[column]) return state;

  const total = staging.filter(Boolean).length;
  const ofType = staging.filter(
    (slot) => slot?.type === type && slot.status === "draft",
  ).length;
  if (total >= MAX_STAGED || ofType >= MAX_PER_TYPE[type]) return state;

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

  for (let column = 0; column < BOARD_COLUMNS; column += 1) {
    if (staging[column]?.status === "draft") staging[column] = null;
  }

  for (let column = 0; column < BOARD_COLUMNS; column += 1) {
    if (staging[column] || isStagingColumnBlocked(next, playerId, column)) continue;
    const availableTypes = Object.keys(PIECE_TYPES).filter(
      (type) => counts[type] < MAX_PER_TYPE[type],
    );
    const roll = Math.max(0, Math.min(0.999999, Number(random()) || 0));
    const type = availableTypes[Math.floor(roll * availableTypes.length)];
    staging[column] = { type, status: "draft" };
    counts[type] += 1;
  }

  next.lastEvent = `${next.players[playerId].name} generated a random staging row.`;
  return next;
}

export function readyPlayer(state, playerId, random = Math.random) {
  if (!canReadyPlayer(state, playerId)) return state;

  const next = copyState(state);
  next.players[playerId].ready = true;

  if (PLAYER_IDS.every((id) => next.players[id].ready)) {
    return resolveRound(next, random);
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

export function isStagingColumnBlocked(state, playerId, column) {
  if (!state.players[playerId] || !isColumn(column)) return true;
  const entryRow = playerId === "p1" ? BOARD_ROWS - 1 : 0;
  if (!state.board[entryRow][column]) return false;

  const preview = copyState(state);
  const abilityResult = resolveAbilities(preview, () => 1);
  const followThrough = followThroughDefeats(preview, abilityResult.defeats);
  advanceUnitsSimultaneously(preview, followThrough.movedUnitIds);
  compactFriendlyColumns(preview);
  return Boolean(preview.board[entryRow][column]);
}

export function requiredStagingSlots(state, playerId) {
  return state.players[playerId].staging.reduce(
    (remaining, slot, column) =>
      remaining + (!slot && !isStagingColumnBlocked(state, playerId, column) ? 1 : 0),
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

export function shouldAutoReadyPlayer(state, playerId) {
  return (
    canReadyPlayer(state, playerId) &&
    state.players[playerId].staging.every((slot) => slot?.status !== "draft")
  );
}

function resolveRound(state, random) {
  const next = copyState(state);
  const resolvedRound = next.round;
  const events = [];

  const abilityResult = resolveAbilities(next, random);
  if (abilityResult.criticals > 0) events.push(`${abilityResult.criticals} critical`);
  if (abilityResult.damage > 0) events.push(`${abilityResult.damage} damage`);
  if (abilityResult.healing > 0) events.push(`${abilityResult.healing} healing`);
  if (abilityResult.defeated > 0) events.push(`${abilityResult.defeated} defeated`);

  const followThrough = followThroughDefeats(next, abilityResult.defeats);
  if (followThrough.moved > 0) events.push(`${followThrough.moved} followed through`);

  const movementResult = advanceUnitsSimultaneously(next, followThrough.movedUnitIds);
  const totalMoved = followThrough.moved + movementResult.moved;
  if (totalMoved > 0) events.push(`${totalMoved} advanced`);
  const shuffleResult = compactFriendlyColumns(next);
  let shuffled = shuffleResult.moved;
  let shufflePasses = shuffleResult.passes;
  next.shufflePasses = shufflePasses;

  for (const playerId of PLAYER_IDS) {
    next.players[playerId].score = controlledColumns(next, playerId);
  }

  const p1Won = next.players.p1.score === SCORE_TO_WIN;
  const p2Won = next.players.p2.score === SCORE_TO_WIN;
  if (p1Won && p2Won) next.winner = "draw";
  else if (p1Won) next.winner = "p1";
  else if (p2Won) next.winner = "p2";

  if (next.winner) {
    next.lastEvent =
      next.winner === "draw"
        ? `Round ${resolvedRound}: both players occupy all ${SCORE_TO_WIN} goal columns. The match is a draw.`
        : `Round ${resolvedRound}: ${next.players[next.winner].name} wins by occupying all ${SCORE_TO_WIN} goal columns!`;
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

  const deploymentShuffle = compactFriendlyColumns(next);
  shuffled += deploymentShuffle.moved;
  shufflePasses += deploymentShuffle.passes;
  next.shufflePasses = shufflePasses;
  if (shuffled > 0) events.push(`${shuffled} shuffled (${shufflePasses} passes)`);

  for (const playerId of PLAYER_IDS) next.players[playerId].ready = false;
  next.round += 1;
  const summary = events.length ? events.join(" · ") : "no units activated";
  next.lastEvent = `Round ${resolvedRound}: ${summary}. Plan round ${next.round}.`;
  return next;
}

export function controlledColumns(state, playerId) {
  if (!state.players[playerId]) return 0;
  const goalRow = playerId === "p1" ? 0 : BOARD_ROWS - 1;
  return state.board[goalRow].filter((unit) => unit?.owner === playerId).length;
}

function deployReadyUnits(state, playerId) {
  const row = playerId === "p1" ? BOARD_ROWS - 1 : 0;
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
    state.players[playerId].played[slot.type] += 1;
    deployed += 1;
  });

  return deployed;
}

function emptyPieceCounts() {
  return Object.fromEntries(Object.keys(PIECE_TYPES).map((type) => [type, 0]));
}

function resolveAbilities(state, random) {
  const damageEffects = new Map();
  const arcFocus = arcFocusTargets(state);
  let criticals = 0;

  forEachUnit(state.board, (unit, row, column) => {
    if (unit.type === "healer") return;

    if (unit.type === "dps") {
      const focus = arcFocus.get(unit.id);
      const targets = focus
        ? [{ row: focus.row, column: focus.column, kind: "damage", amount: 3 }]
        : targetsFor(unit, row, column);
      for (const target of targets) {
        if (!isOnBoard(target.row, target.column)) continue;
        const targetUnit = state.board[target.row][target.column];
        if (!targetUnit || targetUnit.owner === unit.owner) continue;
        const multiplier = criticalMultiplier(random);
        addEffect(damageEffects, targetUnit.id, target.amount * multiplier, 0, {
          id: unit.id,
          owner: unit.owner,
          row,
          column,
        });
        if (multiplier === 2) criticals += 1;
      }
      return;
    }

    const multiplier = criticalMultiplier(random);
    let applied = false;
    for (const target of targetsFor(unit, row, column)) {
      if (target.kind !== "damage") continue;
      if (!isOnBoard(target.row, target.column)) continue;
      const targetUnit = state.board[target.row][target.column];
      if (targetUnit && targetUnit.owner !== unit.owner) {
        addEffect(damageEffects, targetUnit.id, target.amount * multiplier, 0, {
          id: unit.id,
          owner: unit.owner,
          row,
          column,
        });
        applied = true;
      }
    }
    if (applied && multiplier === 2) criticals += 1;
  });

  let damage = 0;
  let healing = 0;
  let defeated = 0;
  const defeats = [];

  forEachUnit(state.board, (unit, row, column) => {
    const effect = damageEffects.get(unit.id);
    if (!effect) return;
    const finalHp = unit.hp - effect.damage;
    damage += Math.min(unit.hp, effect.damage);
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

  const healingEffects = new Map();
  forEachUnit(state.board, (unit, row, column) => {
    if (unit.type !== "healer") return;
    const multiplier = criticalMultiplier(random);
    let applied = false;
    for (const target of targetsFor(unit, row, column)) {
      if (target.kind !== "heal" || !isOnBoard(target.row, target.column)) continue;
      const targetUnit = state.board[target.row][target.column];
      if (
        targetUnit &&
        targetUnit.type !== "healer" &&
        targetUnit.owner === unit.owner
      ) {
        addEffect(healingEffects, targetUnit.id, 0, target.amount * multiplier);
        applied = true;
      }
    }
    if (applied && multiplier === 2) criticals += 1;
  });

  forEachUnit(state.board, (unit) => {
    const effect = healingEffects.get(unit.id);
    if (!effect) return;
    const maxHp = PIECE_TYPES[unit.type].maxHp;
    const healedHp = Math.min(maxHp, unit.hp + effect.healing);
    healing += healedHp - unit.hp;
    unit.hp = healedHp;
  });

  return { damage, healing, defeated, defeats, criticals };
}

function arcFocusTargets(state) {
  const focused = new Map();

  forEachUnit(state.board, (unit, row, column) => {
    if (unit.type !== "tank") return;
    for (const target of targetsFor(unit, row, column)) {
      if (!isOnBoard(target.row, target.column)) continue;
      const arc = state.board[target.row][target.column];
      if (!arc || arc.type !== "dps" || arc.owner === unit.owner) continue;

      const candidate = {
        id: unit.id,
        row,
        column,
        alignment: Math.abs(column - target.column),
      };
      const current = focused.get(arc.id);
      if (
        !current ||
        candidate.alignment < current.alignment ||
        (candidate.alignment === current.alignment && candidate.column < current.column)
      ) {
        focused.set(arc.id, candidate);
      }
    }
  });

  return focused;
}

function criticalMultiplier(random) {
  const roll = Math.max(0, Math.min(0.999999, Number(random()) || 0));
  return roll < CRITICAL_CHANCE ? 2 : 1;
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
  const positions = new Map();
  const emptyTargetOwners = new Map();

  snapshot.forEach((row, rowIndex) => {
    row.forEach((unit, column) => {
      if (!unit) return;
      positions.set(unit.id, { row: rowIndex, column });
      if (alreadyMoved.has(unit.id)) return;
      const step = unit.owner === "p1" ? -1 : 1;
      const targetRow = rowIndex + step;
      if (!isOnBoard(targetRow, column) || snapshot[targetRow][column]) return;
      const key = `${targetRow}:${column}`;
      const owners = emptyTargetOwners.get(key) ?? new Set();
      owners.add(unit.owner);
      emptyTargetOwners.set(key, owners);
    });
  });

  const initiativeOwner = state.round % 2 === 1 ? "p1" : "p2";
  const memo = new Map();
  const canMove = (unit) => {
    if (memo.has(unit.id)) return memo.get(unit.id);
    if (alreadyMoved.has(unit.id)) return false;

    const { row, column } = positions.get(unit.id);
    const step = unit.owner === "p1" ? -1 : 1;
    const targetRow = row + step;
    if (!isOnBoard(targetRow, column)) {
      memo.set(unit.id, false);
      return false;
    }

    const occupant = snapshot[targetRow][column];
    if (occupant) {
      const result = occupant.owner === unit.owner && canMove(occupant);
      memo.set(unit.id, result);
      return result;
    }

    const owners = emptyTargetOwners.get(`${targetRow}:${column}`);
    const result = owners?.size !== 2 || unit.owner === initiativeOwner;
    memo.set(unit.id, result);
    return result;
  };

  const successfulMoves = [];
  snapshot.forEach((row, rowIndex) => {
    row.forEach((unit, column) => {
      if (!unit || !canMove(unit)) return;
      const step = unit.owner === "p1" ? -1 : 1;
      const targetRow = rowIndex + step;
      successfulMoves.push({ unit, row: rowIndex, column, targetRow });
    });
  });

  for (const move of successfulMoves) state.board[move.row][move.column] = null;
  for (const move of successfulMoves) state.board[move.targetRow][move.column] = move.unit;

  return {
    moved: successfulMoves.length,
    initiativeOwner,
  };
}

function compactFriendlyColumns(state) {
  let moved = 0;
  let passes = 0;

  while (passes < BOARD_ROWS) {
    const snapshot = state.board.map((row) => row.slice());
    const moves = [];

    forEachUnit(snapshot, (unit, row, column) => {
      const step = unit.owner === "p1" ? -1 : 1;
      const targetRow = row + step;
      if (!isOnBoard(targetRow, column) || snapshot[targetRow][column]) return;

      for (let lookAhead = targetRow + step; isOnBoard(lookAhead, column); lookAhead += step) {
        const leader = snapshot[lookAhead][column];
        if (!leader) continue;
        if (leader.owner === unit.owner) moves.push({ unit, row, column, targetRow });
        break;
      }
    });

    if (!moves.length) break;
    for (const move of moves) state.board[move.row][move.column] = null;
    for (const move of moves) state.board[move.targetRow][move.column] = move.unit;
    moved += moves.length;
    passes += 1;
  }

  return { moved, passes };
}

function targetsFor(unit, row, column) {
  const step = unit.owner === "p1" ? -1 : 1;
  if (unit.type === "tank") {
    return [-1, 0, 1].map((offset) => ({
      row: row + step,
      column: column + offset,
      kind: "damage",
      amount: 1,
    }));
  }
  if (unit.type === "dps") {
    return [-1, 0, 1].map((offset) => ({
      row: row + step,
      column: column + offset,
      kind: "damage",
      amount: 2,
    }));
  }
  if (unit.type === "ranged") {
    return [
      { row: row + step, column, kind: "damage", amount: 1 },
      { row: row + step * 2, column, kind: "damage", amount: 3 },
    ];
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
      amount: 2,
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
  return Number.isInteger(column) && column >= 0 && column < BOARD_COLUMNS;
}

function isOnBoard(row, column) {
  return row >= 0 && row < BOARD_ROWS && column >= 0 && column < BOARD_COLUMNS;
}

