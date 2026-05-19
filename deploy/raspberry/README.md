# Raspberry Pi Deployment

This directory contains the production service template and installer flow for running the FCE app on a Raspberry Pi.

## Recommended layout

- Copy the project to `/opt/fce-app`
- Use the provided installer script to build and register the service

## Quick install

From the project root on the Raspberry Pi:

```bash
chmod +x deploy/raspberry/install.sh
deploy/raspberry/install.sh
```

If the project lives somewhere else:

```bash
PROJECT_DIR=/path/to/fce-app deploy/raspberry/install.sh
```

## Service file

The installer uses:

```bash
deploy/raspberry/fce-app.service
```

## What the service does

- serves the compiled frontend from the same Node process
- exposes the API on port `8787`
- restarts automatically if the process crashes

## Operational note

The app is designed to run as a single server process in production. The browser only acts as the interface.

## More details

- Installation steps: [`INSTALL.md`](./INSTALL.md)
- Step-by-step checklist: [`CHECKLIST.md`](./CHECKLIST.md)
- Pocket checklist: [`POCKETCHECKLIST.md`](./POCKETCHECKLIST.md)
- Full deployment plan: [`../docs/deployment-plan.md`](../docs/deployment-plan.md)
- Official workflow: [`../docs/official-flow.md`](../docs/official-flow.md)
