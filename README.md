# Frontline 6

A mobile-first, two-player turn-based tactics prototype played on a shared 6×5 board.

## Current prototype

- Portrait phone layout with safe padding around every screen edge.
- Simultaneous two-player planning on a single hot-seat device.
- Five staging slots per player, with both rows visible for debugging.
- Up to two Tanks, two Arcs, two Rangers, and one Healer staged at a time.
- Every available staging slot must be filled before a turn can be played.
- A staging slot remains usable when its entry piece is predicted to advance during the next resolution; only an entry that will remain occupied blocks placement.
- Each player locks their row independently; the round resolves only after both are ready.
- One-round deployment delay: both staged rows enter together for the following round.
- Simultaneous abilities and movement prevent either player from gaining turn-order advantage.
- Optional per-player random automation supports solo debugging or a full one-round-per-second simulation.
- A piece reaching the opposite edge remains active there and blocks that opponent's staging column while it survives.
- First player to occupy at least three of the five opposite-edge columns at once wins.
- Every unit has a 20% critical chance. Arc spread attacks roll independently for each occupied target; other abilities roll once per activation.

## Unit rules

| Unit | Health | Ability |
| --- | ---: | --- |
| Tank | 10 | Deals 1 damage to the three tiles ahead and forces Arcs in that cone to focus it for 3 damage. |
| Arc | 5 | Deals 2 damage to the three forward-facing tiles. |
| Ranger | 5 | Deals 1 damage directly ahead and 3 damage exactly two tiles ahead. |
| Healer | 3 | After damage, restores 2 health to adjacent friendly non-healers. |

Damage resolves before healing, so lethal damage cannot be undone and defeated healers do not heal. Healers cannot heal themselves or other healers. Surviving friendly columns advance together into spaces vacated ahead, then bounded shuffle passes close internal friendly gaps without advancing the leading unit again. When opposing units target the same empty tile, White has initiative on odd rounds and Black on even rounds. A piece that reaches the opposite edge holds that goal column, remains active, and cannot advance farther. The match ends when one player simultaneously holds at least three of the five goal columns.

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

