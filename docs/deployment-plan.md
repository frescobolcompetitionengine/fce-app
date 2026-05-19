# FCE Deployment Plan

This document defines the migration path from the current local development setup to a production-style server-first deployment on a Raspberry Pi.

## Goals

- Separate frontend and backend as different responsibilities.
- Keep the backend as the source of truth for users, sessions, settings, backups, matches and uploads.
- Avoid manual startup in daily use.
- Support a simple local development workflow and a production workflow.
- Keep the Raspberry Pi as the first production host without changing the app architecture again later.

## Current state

- Frontend: React + Vite
- Backend: Node API + SQLite
- File storage: local `data/` directory
- Production mode: backend serves the compiled frontend

## Development workflow

Use this during active coding:

1. `npm run dev:all`
   - Starts backend and frontend together.
   - Opens the browser automatically on Windows.
   - Keeps the two processes tied together.

2. `npm run backend`
   - Starts only the API.
   - Useful for API debugging.

3. `npm run dev`
   - Starts only the frontend.
   - Useful for UI-only work.

## Production workflow

Use this for local production simulation and on Raspberry Pi:

1. `npm run prod`
   - Builds the frontend.
   - Starts the backend serving the compiled frontend.
   - Uses the server as the single source of truth.

2. `npm run start:prod`
   - Starts the backend in production mode without rebuilding.
   - Intended for system services after the build already exists.

## Raspberry Pi deployment

Recommended steps:

1. Install Node.js and npm on the Raspberry Pi.
2. Copy the repository to a stable location such as `/opt/fce-app`.
3. Install dependencies with `npm install`.
4. Build the frontend with `npm run build`.
5. Configure the backend as a `systemd` service.
6. Enable the service so the app starts on boot.
7. Verify health with `/api/health`.
8. Open the browser against the Raspberry Pi IP or hostname.

## Operational rules

- The browser must never be the source of truth for core data.
- Browser storage can only be used as short-lived cache or compatibility fallback.
- Any destructive action should create a safety backup before it runs.
- Full system backups are used for migration and machine recovery.

## Maintenance policy

- Use automatic safety backups for destructive operations.
- Use manual full-system backups before updates, migrations or Raspberry Pi changes.
- Keep the last few backups only, and prune older ones regularly.
- Test restores periodically.

## Rollout strategy

1. Finish moving remaining browser state into server-backed storage.
2. Keep the current dev workflow for day-to-day coding.
3. Use production local mode for validation.
4. Deploy the same production mode to Raspberry Pi.
5. Monitor health, logs and backups.

## Acceptance criteria

- No critical app state depends on long-term browser storage.
- The backend can start independently and serve the compiled frontend.
- The app can be launched on Raspberry Pi without manual browser-specific setup.
- Backups and restores work in both normal operation and disaster recovery.
