# BitQuiz

A real-time quiz competition platform. The Game Master runs every question live from one console, a projector shows it to the hall, and participants answer from their phones. Faster correct answers earn more points.

Built for IEEE CS KUET. Designed for 100–300 participants in one hall.

## Features

- **Three live screens kept in sync:** Game Master console, projector, participant phones. Refreshing any screen restores it; nothing lives only in the browser.
- **Join with Name and Roll.** Each roll can join once. A participant who changes phones gets back in after the Game Master clicks _Reset device_, and keeps their points.
- **Server-authoritative timer.** Every phone counts down to the same server deadline, whatever its own clock says. A 1-second grace window absorbs network delay.
- **Speed scoring with a floor.** A correct answer earns between `minPoints` (at the deadline) and `maxPoints` (instant). Optional negative marking per round. Each phone's network delay is measured and subtracted from its answer time (capped at 0.5 s).
- **Safe live control.** Every command carries the state revision it was issued against, so a double-click never skips a question and a backup laptop can stay open.
- **Fix mistakes live:** void a question, correct the answer key (regrade), duplicate a question to re-ask it, edit names, remove participants.
- **Leaderboard** with ties broken by correct count, then answer time. Can be frozen for a suspenseful final round.
- **Text and code questions** (2–6 options, True/False included), entered in a form or imported from CSV with row-by-row validation.
- **Exports:** final results CSV and a per-answer CSV for disputes.

## Tech stack

| Layer    | Choice                                                        |
| -------- | ------------------------------------------------------------- |
| Language | TypeScript (npm workspaces: `shared`, `server`, `web`)        |
| Backend  | Node.js 22, Express 5, Socket.IO 4, Zod                       |
| Database | PostgreSQL 16, Prisma 6                                       |
| Frontend | React 19, Vite 7, Tailwind CSS 4, Motion, React Router 7      |
| Tests    | Vitest, Supertest, socket.io-client, load-test script         |
| Delivery | Docker (multi-stage, non-root), GitHub Actions, Render + Neon |

One server process serves the API, the WebSocket connections and the built website from a single origin.

## Getting started

Requirements: Node.js 22+, Docker (for PostgreSQL).

```bash
cp .env.example .env            # then set SESSION_SECRET and the SEED_* values
docker compose up -d db         # PostgreSQL on 127.0.0.1:${DB_PORT:-5432}
npm install
npm run db:migrate              # create tables
npm run db:seed                 # organization + first owner account
npm run dev                     # API on :3000, website on http://localhost:5173
```

Add `npm run db:seed:demo -w server` for a three-question demo competition.

During development, phones on the same Wi-Fi can open `http://<your-computer-ip>:5173`.

### Scripts

| Command                             | What it does                                                       |
| ----------------------------------- | ------------------------------------------------------------------ |
| `npm run dev`                       | Server (watch mode) and Vite dev server                            |
| `npm run build`                     | Production web bundle and Prisma client                            |
| `npm start`                         | Run the server (serves `web/dist` when built)                      |
| `npm test`                          | Unit tests; integration tests too when `DATABASE_URL` is set       |
| `npm run typecheck`                 | TypeScript across all workspaces                                   |
| `npm run db:migrate` / `db:deploy`  | Create a migration in development / apply migrations in production |
| `npm run loadtest -- --players 300` | Simulated competition against a running server (see below)         |

### Environment variables

| Name                                                       | Default                 | Purpose                                                      |
| ---------------------------------------------------------- | ----------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`                                             | —                       | PostgreSQL connection string                                 |
| `SESSION_SECRET`                                           | —                       | Signs admin session cookies; at least 32 random characters   |
| `PUBLIC_URL`                                               | `http://localhost:5173` | Base URL used in the join link and QR code                   |
| `PORT`                                                     | `3000`                  | HTTP port                                                    |
| `ANSWER_GRACE_MS`                                          | `1000`                  | Extra time after the deadline for answers already in flight  |
| `LATENCY_CAP_MS`                                           | `500`                   | Maximum network-delay compensation                           |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ORG_NAME` | —                       | First owner account, created by the seed if it doesn't exist |
| `DB_PORT`                                                  | `5432`                  | Host port for the docker-compose database                    |

## Running a competition

1. **Organizer login → New competition.** Set the roll format (e.g. exactly 7 digits).
2. **Add questions.** Use the form, or download the CSV template, fill it in Excel or Google Sheets and import it.
3. **Open console → Open lobby.** Open the projector link on the projector laptop and press _Go fullscreen_. It shows the QR code and join code.
4. **Start quiz.** Press **Space** for the next step: show → open (timer starts) → close → reveal → next. `L` shows the leaderboard, `Q` the question, `H` a hold message.
5. **Finish quiz**, then download the results from the Results page.

### CSV format

One row per question. Required columns: `round`, `question`, `option_a`, `option_b`, `correct`.

```csv
round,order,question,code,code_language,option_a,option_b,option_c,option_d,option_e,option_f,correct,max_points,min_points,time_limit,explanation
1,1,"Which algorithm finds shortest paths with non-negative weights?",,,DFS,Dijkstra,Prim,Kruskal,,,B,100,50,20,"Dijkstra uses a priority queue."
1,2,"Dijkstra can handle negative edge weights.",,,True,False,,,,,B,,,15,
```

Empty `max_points`, `min_points` and `time_limit` use the round defaults. The import shows every problem by row number and saves either all rows or none.

## Deployment

### Render + Neon (free)

The repository includes a Render Blueprint ([`render.yaml`](render.yaml)): one free Docker web service in Singapore, with the database on Neon's free plan. Step-by-step guide, free-plan behaviour and the pre-event load test: **[docs/DEPLOY_RENDER.md](docs/DEPLOY_RENDER.md)**.

In short: create a Neon project, copy its pooled and direct connection strings, then in Render choose **New → Blueprint**, pick this repository and fill in `DATABASE_URL`, `DIRECT_URL`, `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`. Keep a single instance: timers and live connections live in that one process.

### Docker Compose (VPS or a laptop on the venue network)

```bash
cp .env.example .env    # set SESSION_SECRET, PUBLIC_URL, SEED_*
docker compose --profile app up -d --build
```

On a laptop, phones on the same router open `http://<laptop-ip>:3000` (set `PUBLIC_URL` to that address so the QR code points there). This works without internet. Put a reverse proxy with HTTPS (for example Caddy) in front of it on a public VPS.

### Backups

Enable the database host's automatic backups, take a `pg_dump` before the event, and download the results CSV after every round.

## Testing

- `npm test` runs unit tests for scoring, ranking, timing rules, CSV parsing and validation, plus a check that correct answers never reach phones or the projector before reveal.
- With a database configured, an integration test drives a full competition over HTTP and WebSocket: join rules, live answering, reveal, regrade, early close, void, finish and kick.
- `npm run loadtest -- --url <server> --email <admin> --password <password> --players 300 --questions 5` simulates a full competition and fails unless 95% of state updates reach phones within 1 s and every accepted answer is stored. Run it against the deployed server before the event.

## Project structure

```text
shared/   Rules shared by server and browser: scoring, state transitions, validation, CSV
server/   Express API, Socket.IO hub, game engine and timers, Prisma schema and migrations
web/      React app: landing, participant (/play), console, projector (/screen), admin
tools/    Load-test script
docs/     Project plan, event checklist and deployment guide
```

See [docs/PLAN.md](docs/PLAN.md) for the design and the event-day checklist.
