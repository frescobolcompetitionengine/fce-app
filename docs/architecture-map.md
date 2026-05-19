# FCE Architecture Map

This document is the working map for the current codebase. It describes what is already server-first, what still lives in the browser, and what should be finalized next to make the system safer and easier to operate.

## 1. Current Architecture

### 1.1 Backend

The backend is the source of truth for the main business data.

Responsibilities:

- authentication sessions
- users and user backups
- settings and rule profiles
- game sessions
- match history
- system backups
- analysis report persistence
- uploads and file storage
- SQLite persistence
- health checks and production serving

Main files:

- `server/index.mjs`
- `server/db.mjs`
- `src/services/apiClient.js`

### 1.2 Frontend

The frontend is the presentation and interaction layer.

Responsibilities:

- screens and routing
- forms and validation
- visual feedback
- navigation and protected routes
- timers and live UI updates
- tournament control surface
- report viewer

Main files:

- `src/App.jsx`
- `src/main.jsx`
- `src/pages/*`
- `src/components/*`

### 1.3 Browser-local state

The browser is no longer the primary source of truth, but some short-lived state still exists for compatibility and UX.

Current browser-local responsibilities:

- short session id for login recovery
- previous route tracking for back navigation
- tournament control channel between tabs/windows
- short-lived settings and language cache
- IndexedDB fallback for analysis reports
- temporary compatibility migration for legacy localStorage data

Main files:

- `src/lib/AuthContext.jsx`
- `src/lib/NavigationTracker.jsx`
- `src/lib/tournamentControlBus.js`
- `src/lib/i18n.js`
- `src/services/storage.js`
- `src/services/analysisReportsRepository.js`
- `src/services/usersRepository.js`
- `src/services/settingsRepository.js`
- `src/services/gameSessionRepository.js`

## 2. What Is Already Good

These areas are already close to the target server-first model:

- login/session handling
- production serving of the compiled frontend from the backend
- system backups and user backups
- Raspberry deployment scripts
- official development and production workflow docs
- private GitHub workflow
- safety backup before destructive actions

## 3. What Still Needs Finalization

The remaining work is mostly about reducing browser-side logic and making the system easier to operate.

### 3.1 Settings and rule profiles

Current state:

- profiles exist
- a protected `default` profile exists
- custom profiles can be created, saved and deleted
- profile selection is visible in Settings

Still to finalize:

- keep the `default` profile as the single canonical baseline
- make sure the selected profile is always obvious and unambiguous
- reduce duplicated settings logic across pages
- ensure the backend becomes the single source of truth for the active profile

### 3.2 Scoring and rules

Current state:

- scoring formulas already exist
- rule defaults already map to the current profile structure
- top 150 selection is already part of the logic

Still to finalize:

- centralize score logic so it is not spread across multiple UI files
- make the backend or a shared domain layer the canonical place for scoring rules
- keep the frontend as a display layer only

### 3.3 Browser fallbacks

Current state:

- fallbacks exist for compatibility and resilience

Still to finalize:

- review which fallbacks are still needed
- remove any fallback that is no longer required in production
- keep only the minimum compatibility layer needed for old installs

### 3.4 Repositories and data access

Current state:

- repositories exist for settings, sessions, users, backups, reports and storage

Still to finalize:

- standardize repository shape and naming
- reduce ad hoc logic inside page components
- make each repository responsible for one clear concern

### 3.5 Operational flow

Current state:

- Windows development flow exists
- private GitHub flow exists
- Raspberry service and install scripts exist

Still to finalize:

- keep the deploy path simple and repeatable
- decide what should be automated in future updates
- make the update process safe for non-technical operation

## 4. Safe Finalization Order

The recommended order is:

1. finalize settings/profile flow
2. centralize scoring and rule logic
3. reduce browser fallbacks to the minimum
4. standardize repositories and page responsibilities
5. freeze the remaining architecture
6. only then make larger app changes if needed

## 5. Rules Going Forward

- The backend should own persistent business data.
- The frontend should render and request, not decide core persistence.
- The browser should only keep short-lived convenience state.
- Any destructive operation should create a safety backup first.
- The Raspberry deployment should behave the same as local production.

## 6. Freeze Recommendation

Once the remaining items above are closed, the app should be treated as stable and ready for operational use.

At that point, any new feature work should happen on top of the finalized architecture rather than while the architecture is still shifting.
