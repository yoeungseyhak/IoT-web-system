# Deploy Cotafer on AWS EC2 — Step by Step

---

## Step 1: Launch EC2 Instance

1. Go to **AWS Console** → **EC2** → **Launch Instance**
2. Configure:

| Setting | Value |
|---------|-------|
| **Name** | `cotafer-server` |
| **AMI** | Ubuntu 24.04 LTS (Free Tier eligible) |
| **Instance Type** | `t2.micro` (Free Tier — 1 vCPU, 1 GB RAM) |
| **Key Pair** | Create new → Download `.pem` file → **Save it safely!** |
| **Storage** | 8 GB gp3 (default is fine) |

3. Click **Launch Instance**

---

## Step 2: Configure Security Group (Firewall)

Go to **EC2 → Security Groups** → Select your instance's security group → **Edit Inbound Rules**:

| Type | Port | Source | Purpose |
|------|------|--------|---------|
| SSH | 22 | My IP | SSH access |
| HTTP | 80 | 0.0.0.0/0 | Website |
| HTTPS | 443 | 0.0.0.0/0 | Website (SSL) |
| Custom TCP | 5050 | 0.0.0.0/0 | Direct API/WebSocket (optional, can remove after Nginx setup) |

Click **Save Rules**

---

## Step 3: Connect via SSH

```bash
# Make your key file secure
chmod 400 ~/Downloads/your-key.pem

# Connect (replace with your EC2 Public IP)
ssh -i ~/Downloads/your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

---

## Step 4: Install Node.js & Tools

Run these commands on the EC2 server:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install build tools (needed for better-sqlite3)
sudo apt install -y build-essential python3

# Install PM2 (process manager — keeps app running forever)
sudo npm install -g pm2

# Install Nginx (reverse proxy)
sudo apt install -y nginx

# Verify
node -v    # v20.x.x
npm -v     # 10.x.x
pm2 -v     # 5.x.x
```

---

## Step 5: Upload Your Project

### Option A: From GitHub (Recommended)

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git cotafer
cd cotafer
```

### Option B: Upload directly from your Mac

```bash
# Run this on YOUR MAC (not the server)
scp -i ~/Downloads/your-key.pem -r /Users/hakk/Documents/Coding/web/car_parking_web ubuntu@YOUR_EC2_PUBLIC_IP:~/cotafer
```

---

## Step 6: Install, Build & Configure

```bash
cd ~/cotafer

# Install all dependencies & build frontend
cd client && npm install && npm run build && cd ..
cd server && npm install && cd ..

# Create environment file
cat > server/.env << 'EOF'
PORT=5050
JWT_SECRET=CHANGE_THIS_TO_A_LONG_RANDOM_STRING_abc123xyz
DEVICE_HEARTBEAT_TIMEOUT=15000
EOF
```

> [!IMPORTANT]
> Change `JWT_SECRET` to a random string. You can generate one with: `openssl rand -hex 32`

---

## Step 7: Test It Works

```bash
cd ~/cotafer/server
node src/server.js
```

You should see: `Cotafer Server running on port 5050`

Open your browser: `http://YOUR_EC2_PUBLIC_IP:5050` → You should see the login page!

Press `Ctrl+C` to stop the test.

---

## Step 8: Run with PM2 (Auto-restart, Runs Forever)

```bash
cd ~/cotafer/server

# Start with PM2
pm2 start src/server.js --name cotafer

# Make PM2 auto-start on server reboot
pm2 startup
pm2 save

# Useful PM2 commands:
pm2 status          # Check if running
pm2 logs cotafer    # View live logs
pm2 restart cotafer # Restart app
pm2 stop cotafer    # Stop app
```

---

## Step 9: Setup Nginx Reverse Proxy (Port 80 → 5050)

This lets users visit `http://your-ip` instead of `http://your-ip:5050`, and enables WebSocket proxying.

```bash
# Create Nginx config
sudo nano /etc/nginx/sites-available/cotafer
```

Paste this config:

```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:5050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket timeout (keep alive for long connections)
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

Save: `Ctrl+X` → `Y` → `Enter`

```bash
# Enable the site & restart Nginx
sudo ln -sf /etc/nginx/sites-available/cotafer /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t          # Test config (should say "OK")
sudo systemctl restart nginx
sudo systemctl enable nginx
```

Now visit: **`http://YOUR_EC2_PUBLIC_IP`** → Cotafer loads on port 80! 🎉

---

## Step 10 (Optional): Free SSL with Let's Encrypt

If you have a domain name (e.g., `cotafer.yourdomain.com`):

```bash
# Point your domain's DNS A record to your EC2 Public IP first!

# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get free SSL certificate
sudo certbot --nginx -d cotafer.yourdomain.com

# Auto-renew (certbot sets this up automatically)
sudo systemctl enable certbot.timer
```

Now your site is live at **`https://cotafer.yourdomain.com`** with free SSL! 🔒

---

## Quick Reference

| Action | Command |
|--------|---------|
| Start app | `pm2 start cotafer` |
| Stop app | `pm2 stop cotafer` |
| Restart app | `pm2 restart cotafer` |
| View logs | `pm2 logs cotafer` |
| Check status | `pm2 status` |
| Update code (GitHub) | `cd ~/cotafer && git pull && cd client && npm run build && cd .. && pm2 restart cotafer` |
| Update code (manual) | Upload files via SCP → `pm2 restart cotafer` |
| Check Nginx | `sudo systemctl status nginx` |
| Restart Nginx | `sudo systemctl restart nginx` |

---

## Architecture on EC2

```
Internet
   │
   ▼
┌──────────────────────────┐
│  AWS EC2 (t2.micro)      │
│                          │
│  Nginx (:80/:443)        │
│    │ reverse proxy       │
│    ▼                     │
│  Node.js (:5050)         │
│    ├── Express (REST API)│
│    ├── WebSocket Hub     │
│    ├── Static React App  │
│    └── SQLite DB         │
│                          │
│  PM2 (process manager)   │
└──────────────────────────┘
   ▲             ▲
   │             │
Web Browser    Device (IoT)
```

> [!TIP]
> The `t2.micro` free tier (750 hours/month for 12 months) is more than enough for Cotafer. After the free tier expires, it costs ~\$8.50/month, or you can switch to a `t4g.micro` which stays free tier eligible.
