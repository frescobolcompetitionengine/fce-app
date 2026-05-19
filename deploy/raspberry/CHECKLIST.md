# Raspberry Pi First-Time Checklist

This guide is written for a first-time user. It assumes no prior experience with Linux, terminals, Node.js, npm or Git.

If you are using a Raspberry Pi with a screen and keyboard, open the terminal app first.
If you are connecting from another computer, open SSH to the Raspberry Pi instead.

## What the tools mean

- `Node.js`: the engine that runs the backend.
- `npm`: the package manager used to install and run the project.
- `Git`: the tool used to download and update the project from a repository.
- `Terminal`: the place where you type commands.
- `systemd`: the Linux service manager that keeps the app running automatically.

## 0. Prepare the Raspberry Pi

Do this only once.

- [ ] Make sure the Raspberry Pi is connected to power.
- [ ] Prefer an SSD over a microSD card if this will be used in production.
- [ ] Connect the Raspberry Pi to the internet.
- [ ] If possible, give it a fixed IP address or a DHCP reservation on your router.
- [ ] Enable SSH if you want to manage it remotely.

If you still need to install the operating system:

- [ ] Use Raspberry Pi Imager on another computer.
- [ ] Choose **Raspberry Pi OS Lite** or a minimal Debian-based OS.
- [ ] Enable SSH during imaging.
- [ ] Set the username and password.
- [ ] Configure Wi-Fi if you will not use a cable.
- [ ] Write the image to the SD card or SSD.

## 1. Open the terminal

If you are on the Raspberry Pi desktop:

- [ ] Open the terminal app from the menu.
- [ ] Or press `Ctrl + Alt + T` if it works on your setup.

If you are connecting from another computer:

- [ ] Open your SSH client.
- [ ] Connect to the Raspberry Pi IP address.
- [ ] Log in with the username and password you configured.

## 2. Update the system

This makes sure the package lists are fresh before installing anything.

Run these commands one by one:

```bash
sudo apt update
sudo apt upgrade -y
```

What this does:

- `apt update` refreshes the list of available packages.
- `apt upgrade -y` installs newer versions of packages already installed.

## 3. Install Git, curl and certificates

These are needed to download the project and install Node safely.

Run:

```bash
sudo apt install -y git curl ca-certificates
```

What this does:

- `git` downloads and updates the project.
- `curl` downloads the Node.js setup script.
- `ca-certificates` lets the system trust secure downloads.

## 4. Install Node.js and npm

We recommend installing the current long-term support release from NodeSource.

Run these commands one by one:

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
```

What this does:

- downloads the official NodeSource setup script
- adds the Node.js repository
- installs Node.js and npm together

Verify the installation:

```bash
node -v
npm -v
```

If both commands print a version number, the installation worked.

## 5. Create the application folder

We recommend storing the app in `/opt/fce-app`.

Run:

```bash
sudo mkdir -p /opt/fce-app
sudo chown -R $USER:$USER /opt/fce-app
```

What this does:

- creates the folder if it does not exist
- gives your current user permission to copy files there

## 6. Put the project on the Raspberry Pi

You can do this in one of two ways:

### Option A. Clone from Git

If your project is in a repository:

```bash
git clone <YOUR_REPOSITORY_URL> /opt/fce-app
```

Replace `<YOUR_REPOSITORY_URL>` with the actual address of your repository.

### Option B. Copy the files manually

If you already have the project on a USB drive or copied some other way:

- [ ] Copy the entire `FCE-APP` folder into `/opt/fce-app`.
- [ ] Make sure the folder contains `package.json`.
- [ ] Make sure the folder contains `server/index.mjs`.
- [ ] Make sure the folder contains `deploy/raspberry/install.sh`.
- [ ] Make sure the folder contains `deploy/raspberry/fce-app.service`.

## 7. Enter the project folder

Run:

```bash
cd /opt/fce-app
```

What this does:

- moves the terminal into the project folder so the next commands work in the correct place

## 8. Make the installer executable

Run:

```bash
chmod +x deploy/raspberry/install.sh
```

What this does:

- allows Linux to run the installer script

## 9. Run the installer

Run:

```bash
deploy/raspberry/install.sh
```

What the installer does:

1. installs project dependencies
2. builds the frontend
3. copies the `systemd` service file
4. reloads `systemd`
5. enables the service
6. starts the service

If the project is stored somewhere else, use:

```bash
PROJECT_DIR=/path/to/fce-app deploy/raspberry/install.sh
```

## 10. Check that the service is running

Run:

```bash
sudo systemctl status fce-app --no-pager
```

What you want to see:

- the service should be `active (running)`
- if it is not, read the error message shown below

## 11. Test the API

Run:

```bash
curl http://127.0.0.1:8787/api/health
```

Expected result:

- a JSON response with `"ok": true`

If that fails, the backend is not ready yet.

## 12. Open the app in the browser

On the Raspberry Pi itself, open a browser and go to:

```text
http://<raspberry-ip>:8787/
```

Replace `<raspberry-ip>` with the real IP address of the Pi.

If you do not know the IP address, run:

```bash
hostname -I
```

## 13. Validate the basic workflow

Go through these tests:

- [ ] Log in.
- [ ] Open `GameSetup`.
- [ ] Create a match.
- [ ] Confirm `SpeedMeter` opens.
- [ ] Confirm backups load.
- [ ] Confirm uploads work.
- [ ] Refresh the browser and confirm the app still opens.

## 14. Check the logs if something fails

If the app does not start or the browser shows an error:

```bash
sudo journalctl -u fce-app -f
```

What this does:

- shows the live logs of the app
- helps identify why the service failed

To restart the service:

```bash
sudo systemctl restart fce-app
```

To stop it temporarily:

```bash
sudo systemctl stop fce-app
```

To start it again:

```bash
sudo systemctl start fce-app
```

## 15. Maintenance after the first install

- [ ] Create a full system backup before big changes.
- [ ] Keep recent safety backups.
- [ ] Test restoring a backup at least once.
- [ ] Write down the Raspberry Pi IP address.
- [ ] Write down the login username and password somewhere safe.

## 16. What success looks like

You are done when:

- the app starts automatically after reboot
- you do not need to type manual commands every time
- the backend is reachable on port `8787`
- the frontend loads from the same server
- backups and restores work
- a normal user can use the app without developer help
