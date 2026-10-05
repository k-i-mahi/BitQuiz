# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Free hosting on Render (app) and Neon (database) replaces Railway; adds `render.yaml` and a deployment guide.
- `DIRECT_URL` added for migrations so the app can use Neon's connection pooler.
- Dependabot proposes only minor and patch updates; CI actions updated to current major versions.

## [1.0.0] - 2026-10-06

### Added

- Live quiz competitions with a Game Master console, projector screen and participant phones kept in sync over WebSockets.
- Name + Roll join with one device per roll and Game Master device reset.
- Server-authoritative timer with grace window and latency-compensated speed scoring with a minimum-points floor.
- Void, regrade, duplicate, freeze leaderboard, kick and edit-name controls.
- Text and code questions, CSV import with row-level validation, results and answers CSV exports.
- Docker image, Docker Compose stack, GitHub Actions CI, load-test script.
