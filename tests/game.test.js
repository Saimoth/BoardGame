import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_PER_TYPE,
  PIECE_TYPES,
  canReadyPlayer,
  controlledColumns,
  createInitialState,
  isColumnFull,
  isStagingColumnBlocked,
  queuePiece,
  randomizeStaging,
  readyPlayer,
  removeQueuedPiece,
  requiredStagingSlots,
  stagingCounts,
} from "../src/game.js";

function unit(id, owner, type, hp = PIECE_TYPES[type].maxHp) {
  return { id, owner, type, hp };
}

const FULL_ROW = ["tank", "tank", "tank", "tank", "dps", "dps", "healer"];
const NO_CRIT = () => 0.99;

function fillStaging(state, playerId) {
  return FULL_ROW.reduce(
    (next, type, column) => queuePiece(next, playerId, column, type),
    state,
  );
}

function resolveRound(state, random = NO_CRIT) {
  let next = fillStaging(state, "p1");
  next = fillStaging(next, "p2");
  next = readyPlayer(next, "p1");
  return readyPlayer(next, "p2", random);
}

test("per-turn limits allow four Tanks but only one Healer", () => {
  let state = createInitialState();
  state = queuePiece(state, "p1", 0, "tank");
  state = queuePiece(state, "p1", 1, "tank");
  state = queuePiece(state, "p1", 2, "tank");
  state = queuePiece(state, "p1", 3, "tank");
  const tankBlocked = queuePiece(state, "p1", 4, "tank");

  assert.equal(tankBlocked.players.p1.staging[4], null);
  state = queuePiece(state, "p1", 4, "healer");
  const healerBlocked = queuePiece(state, "p1", 5, "healer");
  assert.equal(healerBlocked.players.p1.staging[5], null);
});

test("a player cannot ready until every available staging slot is populated", () => {
  let state = createInitialState();
  state = queuePiece(state, "p1", 0, "tank");

  assert.equal(requiredStagingSlots(state, "p1"), 6);
  assert.equal(canReadyPlayer(state, "p1"), false);
  assert.equal(readyPlayer(state, "p1"), state);

  state = fillStaging(createInitialState(), "p1");
  assert.equal(canReadyPlayer(state, "p1"), true);
});

test("the first ready player locks while the other continues planning", () => {
  let state = fillStaging(createInitialState(), "p1");
  state = readyPlayer(state, "p1");

  assert.equal(state.round, 1);
  assert.equal(state.players.p1.ready, true);
  assert.equal(state.players.p2.ready, false);
  assert.equal(removeQueuedPiece(state, "p1", 0), state);
  assert.equal(queuePiece(state, "p1", 0, "healer"), state);
});

test("the round resolves only after both players are ready", () => {
  let state = fillStaging(createInitialState(), "p1");
  state = fillStaging(state, "p2");
  state = readyPlayer(state, "p1");

  assert.equal(state.round, 1);
  state = readyPlayer(state, "p2");
  assert.equal(state.round, 2);
  assert.equal(state.players.p1.ready, false);
  assert.equal(state.players.p2.ready, false);
});

test("random placement fills a legal row within each unit's limit", () => {
  const state = randomizeStaging(createInitialState(), "p1", () => 0);
  const counts = stagingCounts(state, "p1");

  assert.equal(state.players.p1.staging.filter(Boolean).length, 7);
  assert.ok(Object.entries(counts).every(([type, count]) => count <= MAX_PER_TYPE[type]));
  assert.equal(canReadyPlayer(state, "p1"), true);
});

test("a completely full column is skipped by random placement and counts as satisfied", () => {
  let state = createInitialState();
  for (let row = 0; row < 6; row += 1) {
    state.board[row][0] = unit(row + 1, row % 2 ? "p1" : "p2", "tank");
  }
  state.nextUnitId = 7;
  state = randomizeStaging(state, "p1", () => 0.5);

  assert.equal(isColumnFull(state, 0), true);
  assert.equal(state.players.p1.staging[0], null);
  assert.equal(state.players.p1.staging.slice(1).filter(Boolean).length, 6);
  assert.equal(requiredStagingSlots(state, "p1"), 0);
  assert.equal(canReadyPlayer(state, "p1"), true);
});

test("an occupied entry remains draftable when its piece will move next round", () => {
  let state = createInitialState();
  state.board[5][0] = unit(1, "p1", "healer");
  state.nextUnitId = 2;

  assert.equal(isColumnFull(state, 0), false);
  assert.equal(isStagingColumnBlocked(state, "p1", 0), false);
  state = queuePiece(state, "p1", 0, "tank");
  assert.equal(state.players.p1.staging[0].type, "tank");
});

test("random placement fills every staging slot predicted to open", () => {
  let state = createInitialState();
  state.board[5][0] = unit(1, "p1", "tank");
  state.board[4][0] = unit(2, "p2", "tank");
  state.board[5][1] = unit(3, "p1", "healer");
  state.nextUnitId = 4;
  state = randomizeStaging(state, "p1", () => 0.25);

  assert.equal(isStagingColumnBlocked(state, "p1", 0), true);
  assert.equal(state.players.p1.staging[0], null);
  for (let column = 1; column < 7; column += 1) {
    assert.ok(state.players.p1.staging[column]);
  }
  assert.equal(requiredStagingSlots(state, "p1"), 0);
});

test("both staged rows deploy for the following round", () => {
  const state = resolveRound(createInitialState());

  assert.equal(state.round, 2);
  assert.equal(state.players.p1.staging.filter(Boolean).length, 0);
  assert.equal(state.players.p2.staging.filter(Boolean).length, 0);
  assert.equal(state.board[5].filter((piece) => piece?.owner === "p1").length, 7);
  assert.equal(state.board[0].filter((piece) => piece?.owner === "p2").length, 7);
});

test("directly opposing tanks damage simultaneously and remain blocked", () => {
  let state = createInitialState();
  state.board[3][2] = unit(1, "p1", "tank");
  state.board[2][2] = unit(2, "p2", "tank");
  state.nextUnitId = 3;
  state = resolveRound(state);

  assert.equal(state.board[3][2].owner, "p1");
  assert.equal(state.board[3][2].hp, 8);
  assert.equal(state.board[2][2].owner, "p2");
  assert.equal(state.board[2][2].hp, 8);
});

test("a direct killer takes the defeated square and pulls its friendly column forward", () => {
  let state = createInitialState();
  state.board[2][2] = unit(1, "p2", "dps", 2);
  state.board[3][2] = unit(2, "p1", "tank");
  state.board[4][2] = unit(3, "p1", "healer");
  state.board[5][2] = unit(4, "p1", "ranged");
  state.nextUnitId = 5;
  state = resolveRound(state);

  assert.equal(state.board[2][2].id, 2);
  assert.equal(state.board[3][2].id, 3);
  assert.equal(state.board[4][2].id, 4);
});

test("a ranged kill does not teleport the attacker into the defeated square", () => {
  let state = createInitialState();
  state.board[2][3] = unit(1, "p2", "healer", 2);
  state.board[4][3] = unit(2, "p1", "ranged");
  state.nextUnitId = 3;
  state = resolveRound(state);

  assert.equal(state.board[2][3], null);
  assert.equal(state.board[3][3].id, 2);
});

test("odd-round initiative closes a contested one-square gap for Player 1", () => {
  let state = createInitialState();
  state.board[4][1] = unit(1, "p1", "healer");
  state.board[2][1] = unit(2, "p2", "healer");
  state.nextUnitId = 3;
  state = resolveRound(state);

  assert.equal(state.board[3][1].owner, "p1");
  assert.equal(state.board[2][1].owner, "p2");
});

test("even-round initiative closes a contested one-square gap for Player 2", () => {
  let state = createInitialState();
  state.round = 2;
  state.board[4][1] = unit(1, "p1", "healer");
  state.board[2][1] = unit(2, "p2", "healer");
  state.nextUnitId = 3;
  state = resolveRound(state);

  assert.equal(state.board[4][1].owner, "p1");
  assert.equal(state.board[3][1].owner, "p2");
});

test("ranged damage and opposing movement use the same starting board", () => {
  let state = createInitialState();
  state.board[4][1] = unit(1, "p1", "ranged");
  state.board[2][1] = unit(2, "p2", "tank");
  state.nextUnitId = 3;
  state = resolveRound(state);

  assert.equal(state.board[3][1].type, "ranged");
  assert.equal(state.board[2][1].type, "tank");
  assert.equal(state.board[2][1].hp, 7);
});

test("healing resolves before simultaneous movement", () => {
  let state = createInitialState();
  state.board[4][2] = unit(1, "p1", "healer");
  state.board[3][2] = unit(2, "p1", "tank", 3);
  state.nextUnitId = 3;
  state = resolveRound(state);

  assert.equal(state.board[2][2].type, "tank");
  assert.equal(state.board[2][2].hp, 5);
  assert.equal(state.board[3][2].type, "healer");
});

test("lethal damage removes a unit before adjacent healing is applied", () => {
  let state = createInitialState();
  state.board[2][2] = unit(1, "p2", "tank");
  state.board[3][2] = unit(2, "p1", "tank", 1);
  state.board[4][1] = unit(3, "p1", "healer");
  state.nextUnitId = 4;
  state = resolveRound(state);

  assert.equal(state.board[3][2].owner, "p2");
  assert.equal(state.board[3][2].id, 1);
});

test("a healer defeated during damage cannot heal another friendly unit", () => {
  let state = createInitialState();
  state.board[2][1] = unit(1, "p2", "tank");
  state.board[3][1] = unit(2, "p1", "healer", 1);
  state.board[4][1] = unit(3, "p1", "tank", 1);
  state.nextUnitId = 4;
  state = resolveRound(state);

  assert.equal(state.board[4][1].id, 3);
  assert.equal(state.board[4][1].hp, 1);
});

test("a healer cannot heal itself", () => {
  let state = createInitialState();
  state.board[4][4] = unit(1, "p1", "healer", 2);
  state.nextUnitId = 2;
  state = resolveRound(state);

  assert.equal(state.board[3][4].hp, 2);
});

test("healers cannot heal other healers", () => {
  let state = createInitialState();
  state.board[4][3] = unit(1, "p1", "healer", 1);
  state.board[3][3] = unit(2, "p1", "healer", 1);
  state.nextUnitId = 3;
  state = resolveRound(state);

  assert.equal(state.board[2][3].hp, 1);
  assert.equal(state.board[3][3].hp, 1);
});

test("a critical doubles a unit's entire damage activation", () => {
  let state = createInitialState();
  state.board[3][2] = unit(1, "p1", "tank");
  state.board[2][2] = unit(2, "p2", "tank");
  state.nextUnitId = 3;
  state = resolveRound(state, () => 0);

  assert.equal(state.board[3][2].hp, 6);
  assert.equal(state.board[2][2].hp, 6);
});

test("a healing critical restores 4 health to adjacent non-healers", () => {
  let state = createInitialState();
  state.board[4][2] = unit(1, "p1", "healer");
  state.board[3][2] = unit(2, "p1", "tank", 1);
  state.nextUnitId = 3;
  state = resolveRound(state, () => 0);

  assert.equal(state.board[2][2].hp, 5);
});

test("a roll of exactly 20 percent is not a critical", () => {
  let state = createInitialState();
  state.board[3][2] = unit(1, "p1", "tank");
  state.board[2][2] = unit(2, "p2", "tank");
  state.nextUnitId = 3;
  state = resolveRound(state, () => 0.2);

  assert.equal(state.board[3][2].hp, 8);
  assert.equal(state.board[2][2].hp, 8);
});

test("Arc deals 2 damage to forward-left, forward, and forward-right", () => {
  let state = createInitialState();
  state.board[3][2] = unit(1, "p1", "dps");
  state.board[2][1] = unit(2, "p2", "tank");
  state.board[2][2] = unit(3, "p2", "tank");
  state.board[2][3] = unit(4, "p2", "tank");
  state.nextUnitId = 5;
  state = resolveRound(state);

  for (const id of [2, 3, 4]) {
    const target = state.board.flat().find((piece) => piece?.id === id);
    assert.equal(target.hp, 8);
  }
});

test("Ranger deals 1 damage ahead and 3 damage two tiles ahead", () => {
  let state = createInitialState();
  state.board[4][2] = unit(1, "p1", "ranged");
  state.board[3][2] = unit(2, "p2", "tank");
  state.board[2][2] = unit(3, "p2", "tank");
  state.nextUnitId = 4;
  state = resolveRound(state);

  assert.equal(state.board[3][2].hp, 9);
  assert.equal(state.board[2][2].hp, 7);
});

test("unit health values match the revised balance", () => {
  assert.equal(PIECE_TYPES.tank.maxHp, 10);
  assert.equal(PIECE_TYPES.dps.maxHp, 5);
  assert.equal(PIECE_TYPES.ranged.maxHp, 5);
  assert.equal(PIECE_TYPES.healer.maxHp, 3);
});

test("a piece reaching the opposite edge remains active and cannot advance farther", () => {
  let state = createInitialState();
  state.board[1][0] = unit(1, "p1", "healer");
  state.board[2][0] = unit(2, "p1", "tank", 1);
  state.nextUnitId = 3;
  state = resolveRound(state);
  state = resolveRound(state);

  assert.equal(state.board[0][0].id, 1);
  assert.equal(state.board[1][0].id, 2);
  assert.equal(state.board[1][0].hp, 5);
  assert.equal(controlledColumns(state, "p1"), 1);
});

test("an enemy-held goal cell blocks staging until its occupant is removed", () => {
  const state = createInitialState();
  state.board[0][2] = unit(1, "p1", "tank");

  assert.equal(isStagingColumnBlocked(state, "p2", 2), true);
  state.board[0][2] = null;
  assert.equal(isStagingColumnBlocked(state, "p2", 2), false);
});

test("occupying four of seven opposite-edge columns wins the match", () => {
  let state = createInitialState();
  for (let column = 0; column < 4; column += 1) {
    state.board[1][column] = unit(column + 1, "p1", "healer");
  }
  state.nextUnitId = 7;
  state = resolveRound(state);

  assert.equal(state.players.p1.score, 4);
  assert.equal(state.winner, "p1");
});

test("holding three goal columns does not end the match", () => {
  let state = createInitialState();
  for (let column = 0; column < 3; column += 1) {
    state.board[0][column] = unit(column + 1, "p1", "healer");
  }
  state.nextUnitId = 6;
  state = resolveRound(state);

  assert.equal(state.players.p1.score, 3);
  assert.equal(state.winner, null);
});

test("simultaneously occupying four goal columns produces a draw", () => {
  let state = createInitialState();
  for (let column = 0; column < 4; column += 1) {
    state.board[0][column] = unit(column + 1, "p1", "healer");
    state.board[5][column] = unit(column + 7, "p2", "healer");
  }
  state.nextUnitId = 13;
  state = resolveRound(state);

  assert.equal(state.players.p1.score, 4);
  assert.equal(state.players.p2.score, 4);
  assert.equal(state.winner, "draw");
});

