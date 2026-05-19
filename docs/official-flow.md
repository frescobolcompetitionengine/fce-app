# FCE Official Workflow

This document defines the official way to work on the FCE project and publish it to production.

## Roles of each environment

### Windows

Use Windows for development only.

Typical tasks:

- write and edit code
- test UI and logic
- run type checks
- run builds
- prepare commits

Useful commands:

```bash
npm run dev:all
npm run typecheck
npm run build
```

### GitHub private repository

Use the private GitHub repository as the central handoff point.

Rules:

- the repository must be private
- all approved changes should be committed and pushed here
- Windows and Raspberry should stay synchronized through Git

Typical commands:

```bash
git add .
git commit -m "your message"
git push
```

### Raspberry Pi

Use the Raspberry Pi as production.

Rules:

- it should run the app automatically
- it should not be used for normal development
- it should pull updates from GitHub
- it should serve the compiled frontend together with the API

Useful commands:

```bash
git pull
npm install
npm run build
sudo systemctl restart fce-app
sudo systemctl status fce-app --no-pager
```

## Official workflow

### During development

1. Make changes on Windows.
2. Test locally with `npm run dev:all`.
3. Run `npm run typecheck`.
4. Run `npm run build`.
5. Commit the result.
6. Push to the private GitHub repository.

### During Raspberry deployment

1. Pull the latest code on the Raspberry Pi.
2. Install dependencies if needed.
3. Build the frontend.
4. Restart the service.
5. Verify the app in the browser.

## First Raspberry installation

1. Install Node.js, npm and Git.
2. Copy or clone the project to `/opt/fce-app`.
3. Run the Raspberry installer script.
4. Enable the system service.
5. Open the app at `http://<raspberry-ip>:8787/`.

## Update policy

- Windows is the source of changes.
- GitHub private is the source of truth.
- Raspberry only receives changes through Git.
- Avoid editing code directly on the Raspberry unless it is an emergency.

## Safety rules

- Create backups before destructive actions.
- Keep the last few system backups.
- Test restore procedures periodically.
- Never rely on browser storage for critical data.

## One-line summary

Develop on Windows, publish to private GitHub, and run production on Raspberry Pi.
