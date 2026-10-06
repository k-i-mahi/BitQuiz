# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Email is optional: without a configured email service, the verify-email banner is hidden and "Forgot password" explains that reset links can't be sent.

### Added

- `npm run admin:set-password -w server -- <email>` to reset an organizer's password directly in the database when email isn't available.

## [1.1.0] - 2026-10-06

### Fixed

- Emails (invitations, verification, password resets) now work on Render's free plan, which blocks SMTP ports: email is sent through Brevo's HTTPS API, with SMTP kept for self-hosting.
- An invitation is no longer lost when email fails: the owner always gets a shareable invitation link.
- The console counted answers against connected phones instead of joined participants.
- The admin header no longer overflows on phones; the console shows its controls first on small screens.

### Added

- "Send test email" and email delivery status in Team & access.
- Logging of failed and slow API requests, a friendly error page with reload after deploys, link-preview tags and image, and `robots.txt`.
- Archived competitions can be permanently deleted (removing their participants and answers).
- MIT license, contributing guide, issue templates and README screenshots.
- Organizer accounts with real email: invite-only sign-up (owners invite by email, invitees set their own password), email verification, and "forgot password" reset links. Emails are sent through any SMTP server (Gmail app password supported) and logged when email is not configured.
- Team & access page for owners: change roles, suspend or reactivate, sign out everywhere, remove members, and resend or revoke invitations. At least one active owner is always kept.
- Per-email login throttle in addition to the per-IP limit.
- The console shows the join QR code and link in the lobby.

### Changed

- Projector controls appear only once a projector screen is connected; the projector link moved to a Projector button in the console header. Less projector-specific text on the landing page and console.
- Real-time updates rebuilt for small servers: one shared cached snapshot per change, answers refresh only the console and projector counters, and updates per competition never overlap. 300 simulated players now pass on 0.1 CPU (p95 0.7 s, previously 6.8 s at 100 players).
- Answer submission uses one read and one write; verified device tokens are cached briefly in memory.
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
