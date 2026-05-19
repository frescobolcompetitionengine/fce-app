# FCE Stabilization Plan

This document defines the final stabilization phase before the project is treated as operationally stable.

## Purpose

- Reduce remaining architectural noise.
- Keep the backend as the source of truth.
- Make production behavior predictable on Windows and Raspberry Pi.
- Avoid more large refactors unless they unblock stability.

## What is already finished

- Server-first session handling.
- Backend-backed settings and rule profiles.
- Protected `default` settings profile.
- SpeedMeter logic split into smaller helpers.
- Match history and spectator views simplified.
- Production local mode and Raspberry deployment path.
- Backups for users and full system recovery.
- Private GitHub workflow and official development flow.

## What is still in progress

- Final operational stabilization.
- Production validation on the Raspberry Pi.
- Small cleanup of any remaining duplicated UI-only logic if it appears again.

## What can wait

- New tournament module.
- New gameplay modules beyond the current scope.
- Further architectural refactors that do not improve safety or operability.

## Stabilization phases

### Phase 1. Freeze the core behavior

Goal:

- Stop adding structural changes unless they remove a real risk.

Tasks:

1. Keep `Settings`, `SpeedMeter`, `MatchHistory`, and `SpectatorHub` in their current cleaned shape.
2. Avoid introducing new browser storage for core data.
3. Avoid splitting more logic unless a bug or duplication demands it.

Exit criteria:

- The current flow is stable and understandable.
- No new major architectural decisions are pending.

### Phase 2. Validate on production local

Goal:

- Prove that the app behaves like a product, not a dev server.

Tasks:

1. Run `npm run prod`.
2. Verify login, settings, SpeedMeter, history, spectator, and backups.
3. Confirm `/api/health` and `/` are both available.
4. Confirm reports, backups, and restores still work.

Exit criteria:

- Local production starts cleanly.
- Core workflows work without manual patching.

### Phase 3. Validate on Raspberry Pi

Goal:

- Make the Raspberry Pi the first real deployment target.

Tasks:

1. Pull the latest code from the private GitHub repository.
2. Install dependencies if needed.
3. Build and restart the `systemd` service.
4. Confirm boot startup and browser access through the Pi IP address.
5. Test logout/login, SpeedMeter, Settings, backups, and reports.

Exit criteria:

- The service starts automatically.
- The app works after reboot.
- No manual browser-specific startup is needed.

### Phase 4. Lock the product behavior

Goal:

- Treat the current architecture as stable.

Tasks:

1. Keep changes small and traceable.
2. Move any new logic into shared helpers instead of page components.
3. Use backups before destructive actions or migrations.
4. Review only real regressions, not architectural preferences.

Exit criteria:

- The project can be maintained with low risk.
- The next major feature can be built on top of this base.

## Operational rules

- Persistent data belongs to the backend.
- The browser is only for UI and short-lived convenience state.
- `default` settings must remain protected.
- Backups are required before destructive operations.
- Raspberry updates must go through Git.

## Success definition

The product is considered stabilized when:

- Windows development remains smooth.
- Production local behaves the same as the Raspberry Pi deployment.
- Backups and restores are reliable.
- Core pages no longer contain business logic that should live elsewhere.
- Day-to-day operation does not require manual startup steps.

