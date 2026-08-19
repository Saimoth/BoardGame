import test from "node:test";
import assert from "node:assert/strict";

import {
  PIECE_TYPES,
  canPlayTurn,
  createInitialState,
  isColumnFull,
  playTurn,
  queuePiece,
  removeQueuedPiece,
  requiredStagingSlots,
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

test("a player may stage no more than two units of one type", () => {
  let state = createInitialState();
  state = queuePiece(state, "p1", 0, "tank");
  state = queuePiece(state, "p1", 1, "tank");
  const unchanged = queuePiece(state, "p1", 2, "tank");

  assert.equal(unchanged.players.p1.staging[0].type, "tank");
  assert.equal(unchanged.players.p1.staging[1].type, "tank");
  assert.equal(unchanged.players.p1.staging[2], null);
});

test("a draft unit can be removed before its turn is played", () => {
  let state = createInitialState();
  state = queuePiece(state, "p1", 3, "healer");
  state = removeQueuedPiece(state, "p1", 3);
  assert.equal(state.players.p1.staging[3], null);
});

test("a player cannot play until every available staging slot is populated", () => {
  let state = createInitialState();
  state = queuePiece(state, "p1", 0, "tank");

  assert.equal(requiredStagingSlots(state, "p1"), 5);
  assert.equal(canPlayTurn(state, "p1"), false);
  assert.equal(playTurn(state), state);

  state = fillStaging(createInitialState(), "p1");
  assert.equal(requiredStagingSlots(state, "p1"), 0);
  assert.equal(canPlayTurn(state, "p1"), true);
});

test("staged units wait one full cycle before entering the board", () => {
  let state = createInitialState();
  state = fillStaging(state, "p1");
  state = playTurn(state);

  assert.equal(state.players.p1.staging[0].status, "ready");
  assert.equal(state.board[5][0], null);

  state = fillStaging(state, "p2");
  state = playTurn(state);
  assert.equal(state.currentPlayer, "p1");
  assert.equal(state.players.p1.staging[0], null);
  assert.equal(state.board[5][0].type, "tank");
});

test("a tank damages the enemy directly ahead and remains blocked", () => {
  let state = createInitialState();
  state.board[3][2] = unit(1, "p1", "tank");
  state.board[2][2] = unit(2, "p2", "tank");
  state.nextUnitId = 3;
  state = fillStaging(state, "p1");

  const next = playTurn(state);
  assert.equal(next.board[2][2].hp, 3);
  assert.equal(next.board[3][2].owner, "p1");
});

test("a ranger attacks exactly two tiles ahead", () => {
  let state = createInitialState();
  state.board[4][1] = unit(1, "p1", "ranged");
  state.board[2][1] = unit(2, "p2", "tank");
  state.nextUnitId = 3;
  state = fillStaging(state, "p1");

  const next = playTurn(state);
  assert.equal(next.board[2][1].hp, 3);
  assert.equal(next.board[3][1].type, "ranged");
});

test("a healer restores adjacent allies before movement", () => {
  let state = createInitialState();
  state.board[4][2] = unit(1, "p1", "healer");
  state.board[3][2] = unit(2, "p1", "tank", 3);
  state.nextUnitId = 3;
  state = fillStaging(state, "p1");

  const next = playTurn(state);
  assert.equal(next.board[2][2].type, "tank");
  assert.equal(next.board[2][2].hp, 4);
  assert.equal(next.board[3][2].type, "healer");
});

test("a fifth breakthrough ends the match", () => {
  let state = createInitialState();
  state.players.p1.score = 4;
  state.board[0][4] = unit(1, "p1", "dps");
  state.nextUnitId = 2;
  state = fillStaging(state, "p1");

  const next = playTurn(state);
  assert.equal(next.players.p1.score, 5);
  assert.equal(next.winner, "p1");
});

test("a completely full board column blocks its staging position", () => {
  let state = createInitialState();
  for (let row = 0; row < 6; row += 1) {
    state.board[row][0] = unit(row + 1, row % 2 ? "p1" : "p2", "tank");
  }
  state.nextUnitId = 7;

  assert.equal(isColumnFull(state, 0), true);
  assert.equal(queuePiece(state, "p1", 0, "healer"), state);

  for (let column = 1; column < 6; column += 1) {
    const type = ["tank", "tank", "dps", "dps", "ranged"][column - 1];
    state = queuePiece(state, "p1", column, type);
  }

  assert.equal(requiredStagingSlots(state, "p1"), 0);
  assert.equal(canPlayTurn(state, "p1"), true);
});
