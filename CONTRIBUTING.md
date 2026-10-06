# Contributing to BitQuiz

Thanks for helping improve BitQuiz. This guide covers the local setup and the checks every change must pass.

## Local setup

```bash
cp .env.example .env            # set SESSION_SECRET and the SEED_* values
docker compose up -d db         # PostgreSQL (set DB_PORT in .env if 5432 is taken)
npm install
npm run db:migrate
npm run db:seed -w server       # add `npm run db:seed:demo -w server` for a sample quiz
npm run dev                     # http://localhost:5173
```

Email is optional locally: without `BREVO_API_KEY` or `SMTP_*`, emails (invitations, password resets) are printed in the server log, so you can open the links from there.

## Before opening a pull request

```bash
npm run lint
npm run format:check
npm run typecheck
npm test            # integration tests run when DATABASE_URL points to a database
npm run build
```

CI runs the same steps on every push and pull request.

## Guidelines

- **Server is the source of truth.** Clients never decide scores, timing or state; they render what the server sends.
- **Shared rules live in `shared/`.** Validation, scoring and state transitions are used by both server and browser. Change them there, with unit tests.
- **Database changes** need a Prisma migration (`npm run db:migrate -- --name <change>`), committed with the code.
- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `build:`, `refactor:`, `perf:`.
- **Keep it fast on small servers.** Anything sent per answer or per participant must stay cheap; run `npm run loadtest` for real-time changes.
- **Security issues** go to the maintainer privately; see [SECURITY.md](SECURITY.md).
