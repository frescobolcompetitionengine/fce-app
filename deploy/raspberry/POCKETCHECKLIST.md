# Pocket Checklist

This is the short version for a fast Raspberry Pi installation.

## 1. Update the Pi

```bash
sudo apt update
sudo apt upgrade -y
```

## 2. Install tools

```bash
sudo apt install -y git curl ca-certificates
```

## 3. Install Node.js and npm

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 4. Prepare the folder

```bash
sudo mkdir -p /opt/fce-app
sudo chown -R $USER:$USER /opt/fce-app
```

## 5. Get the project

If cloning from Git:

```bash
git clone <YOUR_REPOSITORY_URL> /opt/fce-app
```

If copying manually:

- copy the project to `/opt/fce-app`

## 6. Install and start the app

```bash
cd /opt/fce-app
chmod +x deploy/raspberry/install.sh
deploy/raspberry/install.sh
```

If needed:

```bash
PROJECT_DIR=/path/to/fce-app deploy/raspberry/install.sh
```

## 7. Check it worked

```bash
sudo systemctl status fce-app --no-pager
curl http://127.0.0.1:8787/api/health
```

## 8. Open in browser

```text
http://<raspberry-ip>:8787/
```

## 9. If something fails

```bash
sudo journalctl -u fce-app -f
sudo systemctl restart fce-app
```
