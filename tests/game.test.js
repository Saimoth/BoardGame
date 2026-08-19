import test from "node:test";
import assert from "node:assert/strict";

import {
  PIECE_TYPES,
  canReadyPlayer,
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

const FULL_ROW = ["tank", "tank", "dps", "dps", "ranged", "ranged"];

function fillStaging(state, playerId) {
  return FULL_ROW.reduce(
    (next, type, column) => queuePiece(next, playerId, column, type),
    state,
  );
}

function resolveRound(state) {
  let next = fillStaging(state, "p1");
  next = fillStaging(next, "p2");
  next = readyPlayer(next, "p1");
  return readyPlayer(next, "p2");
}

test("each player may draft no more than two units of one type", () => {
  let state = createInitialState();
  state = queuePiece(state, "p1", 0, "tank");
  state = queuePiece(state, "p1", 1, "tank");
  const unchanged = queuePiece(state, "p1", 2, "tank");

  assert.equal(unchanged.players.p1.staging[2], null);
  assert.equal(queuePiece(state, "p2", 0, "tank").players.p2.staging[0].type, "tank");
});

test("a player cannot ready until every available staging slot is populated", () => {
  let state = createInitialState();
  state = queuePiece(state, "p1", 0, "tank");

  assert.equal(requiredStagingSlots(state, "p1"), 5);
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

test("random placement fills a legal row with no more than two of a type", () => {
  const state = randomizeStaging(createInitialState(), "p1", () => 0);
  const counts = stagingCounts(state, "p1");

  assert.equal(state.players.p1.staging.filter(Boolean).length, 6);
  assert.ok(Object.values(counts).every((count) => count <= 2));
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
  assert.equal(state.players.p1.staging.slice(1).filter(Boolean).length, 5);
  assert.equal(requiredStagingSlots(state, "p1"), 0);
  assert.equal(canReadyPlayer(state, "p1"), true);
});

test("a full column remains draftable when its entry will open next round", () => {
  let state = createInitialState();
  for (let row = 0; row < 6; row += 1) {
    state.board[row][0] = unit(row + 1, "p1", "healer");
  }
  state.nextUnitId = 7;

  assert.equal(isColumnFull(state, 0), true);
  assert.equal(isStagingColumnBlocked(state, "p1", 0), false);
  state = queuePiece(state, "p1", 0, "tank");
  assert.equal(state.players.p1.staging[0].type, "tank");
});

test("both staged rows deploy for the following round", () => {
  const state = resolveRound(createInitialState());

  assert.equal(state.round, 2);
  assert.equal(state.players.p1.staging.filter(Boolean).length, 0);
  assert.equal(state.players.p2.staging.filter(Boolean).length, 0);
  assert.equal(state.board[5].filter((piece) => piece?.owner === "p1").length, 6);
  assert.equal(state.board[0].filter((piece) => piece?.owner === "p2").length, 6);
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
  assert.equal(state.board[2][2].hp, 4);
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

test("simultaneous fifth breakthroughs produce a draw", () => {
  let state = createInitialState();
  state.players.p1.score = 4;
  state.players.p2.score = 4;
  state.board[0][0] = unit(1, "p1", "healer");
  state.board[5][5] = unit(2, "p2", "healer");
  state.nextUnitId = 3;
  state = resolveRound(state);

  assert.equal(state.players.p1.score, 5);
  assert.equal(state.players.p2.score, 5);
  assert.equal(state.winner, "draw");
});

