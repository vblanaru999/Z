# Trailer Check-In

A small warehouse app for recording information when a trailer arrives, and for adding to it
as the trailer is worked (door assignment, unloading, damage, shortages, departure).

## Features
- **Check in** a trailer: trailer #, carrier, driver, load type (live/drop), door, BOL, PO #s,
  seal # / intact, pallet count, reefer temp, condition, arrival time, optional first note.
- **Add info later**: update status (arrived → at door → unloading → unloaded → departed), door,
  condition, seal, pallets, temp, and append free-text notes.
- **History**: every status change and note is logged with time and the user's name.
- **Find trailers**: search by trailer, carrier, BOL, PO or driver; filter by status.
- Works on phones/tablets (large touch targets, responsive layout, dark mode).

> This app lives in `trailer-checkin/`, separate from the Claim app at the repo root. Run all commands from this folder (`cd trailer-checkin`).

## Run
Requires Node.js >= 22.13 (uses the built-in `node:sqlite`; **no npm dependencies**).

```bash
npm start            # http://localhost:3000
PORT=8080 DB_PATH=/var/data/trailers.db npm start
```
Data is stored in SQLite at `data/trailers.db` by default.

## Test
```bash
npm test             # node:test with coverage report
```

## API
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/trailers?q=&status=` | list / search |
| POST | `/api/trailers` | check in a trailer |
| GET | `/api/trailers/:id` | trailer with notes/history |
| PATCH | `/api/trailers/:id` | update fields (status changes are logged) |
| DELETE | `/api/trailers/:id` | remove a trailer |
| POST | `/api/trailers/:id/notes` | add a note `{ "body": "..." }` |

Send an `X-User-Name` header to attribute history entries (the UI does this from the "Your name" box).
There is no authentication — run it on a trusted network or put it behind your own auth proxy.
