# Frontline 6

A mobile-first, two-player turn-based tactics prototype played on a shared 6×6 board.

## Current prototype

- Portrait phone layout with safe padding around every screen edge.
- Simultaneous two-player planning on a single hot-seat device.
- Six staging slots per player, with both rows visible for debugging.
- Up to two Tanks, two Arcs, two Rangers, and two Healers staged at a time.
- Every available staging slot must be filled before a turn can be played.
- A completely full board column blocks its staging slot until space opens again; blocked slots do not prevent the turn.
- Each player locks their row independently; the round resolves only after both are ready.
- One-round deployment delay: both staged rows enter together for the following round.
- Simultaneous abilities and movement prevent either player from gaining turn-order advantage.
- Optional per-player random automation supports solo debugging or a full one-round-per-second simulation.
- First player to score five breakthroughs wins.

## Unit rules

| Unit | Health | Ability |
| --- | ---: | --- |
| Tank | 5 | Deals 2 damage to the tile directly ahead. |
| Arc | 3 | Deals 1 damage to the three forward-facing tiles. |
| Ranger | 2 | Deals 2 damage exactly two tiles ahead. |
| Healer | 3 | Restores 1 health to friendly units in the eight surrounding tiles. |

Both armies resolve abilities together before movement. Surviving units then attempt to advance one tile from the same board snapshot. Directly opposing units block each other until one is defeated, and two units targeting the same empty tile both hold position. Crossing the opponent's edge scores a breakthrough.

## Run locally

The game has no runtime dependencies. Serve the repository with any static HTTP server and open `index.html`.

Run the rules tests with:

```sh
npm test
```

## Project structure

- `index.html` — accessible application shell and rules dialog.
- `styles.css` — mobile-first interface and safe-area handling.
- `src/game.js` — deterministic game state and turn rules.
- `src/ui.js` — board rendering and touch interactions.
- `tests/game.test.js` — rules regression tests.
- `.github/workflows/deploy-pages.yml` — GitHub Pages deployment.

## Next decisions

The working title, unit names, health values, damage values, scoring target, and activation order are intentionally easy to change as playtesting reveals what feels good.
