# Raspberry Pi Installer

This folder contains the production install flow for the FCE app on a Raspberry Pi.

## What the installer does

The installer script:

1. installs npm dependencies
2. builds the frontend
3. copies the systemd unit into `/etc/systemd/system`
4. reloads systemd
5. enables and restarts the service

## Required layout

Place the project in:

```bash
/opt/fce-app
```

## Run

From the project root on the Raspberry Pi:

```bash
chmod +x deploy/raspberry/install.sh
deploy/raspberry/install.sh
```

If the app is stored in a different directory:

```bash
PROJECT_DIR=/path/to/fce-app deploy/raspberry/install.sh
```

## Service file

The systemd unit used by the installer is:

```bash
deploy/raspberry/fce-app.service
```

## After install

- The app should be reachable at `http://<raspberry-ip>:8787/`
- Check service status:

```bash
sudo systemctl status fce-app --no-pager
```

- Follow logs:

```bash
sudo journalctl -u fce-app -f
```
