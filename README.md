# TG Analytics

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![pywebview](https://img.shields.io/badge/pywebview-5.0%2B-4B8BBE?style=flat-square)](https://pywebview.flowrl.com)
[![Telethon](https://img.shields.io/badge/Telethon-1.36%2B-2CA5E0?style=flat-square&logo=telegram&logoColor=white)](https://docs.telethon.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-9cf?style=flat-square)]()
[![Release](https://img.shields.io/github/v/release/Igor-Shelloff/tg-analytics?style=flat-square&color=4ade80)](https://github.com/Igor-Shelloff/tg-analytics/releases/latest)

**A modern open-source desktop app for Telegram channel analytics.** Track subscriber growth, engagement rates, top posts, best posting times and content mix — for your own channels and any public channel. Analytics data and settings are stored locally on your machine.

[Features](#-features) • [Screenshots](#-screenshots) • [Installation](#-installation) • [Usage](#-usage) • [Privacy](#-privacy) • [FAQ](#-faq) • [Support](#-support-the-project)

---

## About

**TG Analytics** is a free, open-source desktop application that helps Telegram channel owners, marketers and content creators understand their audience.

Unlike SaaS analytics platforms (TGStat, Telemetr), TG Analytics:

- **Has no proprietary analytics backend** — there is no server that receives your data
- **Analyzes any public channel** — track competitors without admin rights
- **Works offline after initial sync** — all charts and reports render from the local database
- **Is completely free** — no subscriptions, no limits, no ads, no telemetry

Perfect for:

- **Channel owners** — monitor growth, engagement, and find the best time to post
- **Content teams** — understand which content types perform best
- **Marketers** — research competitors and benchmark against industry peers
- **Agencies** — generate beautiful PDF reports for clients

The app connects directly to the official [Telegram API](https://my.telegram.org/) through Telethon. There is no intermediary server — your requests go straight from your machine to Telegram.

---

## ✨ Features

### 📊 Analytics
- **Subscriber growth** — daily/hourly chart with automatic granularity (raw → hourly → daily)
- **Engagement rate (ER)** — average views ÷ subscribers, per period and per content type
- **Best posting time** — 7×24 heatmap of average views by weekday and hour
- **Top posts** — ranking by views, reactions and forwards
- **Content mix** — text / photo / video / documents with per-type ER

### 📡 Channel tracking
- **Your own channels** — auto-detects channels where you're an admin or owner
- **Any public channel** — add by `@username`, `t.me/...` link or numeric ID
- **Background collection** — configurable interval (15 min – 6 hours or manual)
- **Import history** — up to 100 latest posts per channel on first sync

### 🔍 Comparison
- **Side-by-side metrics** — compare up to 6 channels on one screen
- **Multi-line growth chart** — one line per channel with shared timeline
- **Average views & ER bars** — instant visual comparison

### 📤 Export
- **PDF report** — beautifully typeset A4 report with charts and branding
- **JSON** — full structured dump (snapshots + posts + metrics)
- **CSV** — raw post data, Excel-friendly (UTF-8-BOM, `;` delimiter)

### 🎨 Interface
- **Modern dark / light / system theme** — follows OS by default
- **English + Русский + Español + Português + Deutsch** — instantly switchable
- **Smooth animations, zero flicker** — built on HTML/CSS/JS via pywebview
- **Responsive layout** — sidebar fixed, only content scrolls

### 🔒 Local-first
- **No analytics backend** — the developer of TG Analytics does not receive your data
- **No telemetry** — the app has no usage tracking, no crash reporting to any server
- **Open source** — audit every line

---

## 🔐 Privacy

TG Analytics is designed **local-first**: analytics data, settings and exports are stored on your machine. The app has no proprietary backend and no telemetry. It talks directly to the official Telegram API for authentication and data collection — nothing goes through a middleman.

**What stays local:**

- SQLite database with channels, snapshots and posts → `~/.tg_analytics/analytics.db`
- Configuration (including API credentials and phone number) → `~/.tg_analytics/config.json`
- Telegram session file → `~/.tg_analytics/sessions/`
- Exports (PDF / JSON / CSV) → user-chosen folder
- Logs → `~/.tg_analytics/logs/`

**What leaves your machine:**

- Authentication requests, channel metadata and post data — sent **directly to Telegram** servers, because that's how the Telegram API works
- Nothing else. There is no analytics endpoint, no error reporter, no update pings to any developer server

**What is not encrypted by the app:**

- The Telegram **session file** is not encrypted on disk (Telethon default). Anyone with read access to that file can potentially access your authorized Telegram account.
- `config.json` stores `api_id`, `api_hash` and phone number in plain text.
- The SQLite database is not encrypted.

**What this means in practice:**

- Use TG Analytics on a device you control and trust.
- If you are concerned about the session file, consider using a **dedicated Telegram account** for analytics rather than your main account with sensitive chats and administrative access.
- You can revoke a session at any time from **Telegram → Settings → Devices**.
- Full technical detail is available in the source code on GitHub — every file is open.

---

## 📸 Screenshots

Dashboard | Channels
---|---
![Dashboard](docs/screenshots/dashboard.png) | ![Channels](docs/screenshots/channels.png)

Compare | Login
---|---
![Compare](docs/screenshots/compare.png) | ![Login](docs/screenshots/login.png)

---

## 🚀 Installation

### Option 1: Download prebuilt executable _(recommended)_

Grab the latest release for your OS from the [Releases page](https://github.com/Igor-Shelloff/tg-analytics/releases/latest):

- **Windows** — `TGAnalytics-Windows.exe`
- **Linux** — `TGAnalytics-Linux` (make it executable with `chmod +x`)
- **macOS** — `TGAnalytics-macOS.zip` (unzip and drag `TG Analytics.app` into Applications)

Each release asset includes a **SHA-256 checksum** published by GitHub — you can verify the download.

> ⚠️ **Windows SmartScreen:** The executable is not code-signed. Windows may show a warning — click **More info** → **Run anyway**. You can also build from source if you prefer.
>
> ⚠️ **macOS:** The app is not notarized with an Apple Developer certificate. On first launch, open Terminal and run:
>
> ```bash
> xattr -cr "/Applications/TG Analytics.app"
> ```
>
> Or right-click the app → **Open** → **Open** in the dialog.

No Python installation required.

### Option 2: Run from source

**Requirements:** Python 3.10 or newer.

```bash
git clone https://github.com/Igor-Shelloff/tg-analytics.git
cd tg-analytics
python -m venv venv

# Windows
venv\Scripts\activate

# Linux / macOS
source venv/bin/activate

pip install -r requirements.txt
python main.py
```

---

## 📖 Usage

### 1. Get your Telegram API credentials

1. Go to [my.telegram.org](https://my.telegram.org)
2. Log in with your phone number
3. Open **API Development Tools** and create a new app
4. Copy your **API ID** and **API Hash**

### 2. Sign in

Open the app, paste your **API ID**, **API Hash** and phone number — or scan the QR code with the Telegram mobile app.

### 3. Track channels

- **Your own channels** — the **Channels** tab automatically lists every channel where you're an admin
- **Any public channel** — click **Add public channel**, paste a `@username` or `t.me/...` link

Click **Track** to start monitoring. The app fetches the latest 100 posts immediately, then updates on schedule.

### 4. Explore the dashboard

Open **Dashboard** and pick a channel. Choose period 7d / 30d / 90d / all time. Explore:

- Subscriber growth chart
- Average views, ER and posts per period
- Best posting time heatmap
- Top 10 posts
- Content type breakdown

### 5. Compare and export

- **Compare** — pick 2–6 channels, see metrics side by side
- **Export** — generate a PDF report, JSON dump or CSV of raw posts

### 6. Configure collection

Open **Settings** to:

- Set auto-collect interval (15 min – 6 h or manual)
- Choose data retention (30 days – forever)
- Switch language and theme
- Open the logs folder

---

## ❓ FAQ

<details>
<summary><b>Is this really free?</b></summary>

Yes. MIT-licensed, no subscriptions, no feature gates. You can also build it yourself from source.
</details>

<details>
<summary><b>Where is my data stored?</b></summary>

Everything is stored locally in `~/.tg_analytics/`:

- `analytics.db` — SQLite database with channels, snapshots and posts
- `config.json` — settings including API credentials and phone number (plain text)
- `sessions/` — Telegram session files
- `exports/` — your exported reports
- `logs/` — application logs

See the [Privacy](#-privacy) section for details on what stays local and what is sent to Telegram.
</details>

<details>
<summary><b>Is my Telegram session encrypted?</b></summary>

No — the session file is stored in Telethon's default format and is not encrypted by the app. Anyone with read access to `~/.tg_analytics/sessions/` can potentially access your authorized Telegram account.

If this concerns you:

- Use the app on a device you control.
- Consider a **dedicated Telegram account** for analytics instead of your main account.
- You can revoke a session any time in **Telegram → Settings → Devices**.
</details>

<details>
<summary><b>Can I track public channels I don't own?</b></summary>

Yes. Click **Add public channel**, paste `@username` or a `t.me/...` link. The app will resolve and track it just like your own channels.
</details>

<details>
<summary><b>Why does the growth chart show only today?</b></summary>

Subscriber counts are **not available historically** — the app can only record them from the moment you start tracking. The chart will fill in over days and weeks. Posts, views and reactions, on the other hand, are fetched from Telegram's history immediately.
</details>

<details>
<summary><b>Do old posts keep their views up to date?</b></summary>

Partially. The app refreshes views, reactions and forwards for the most recent posts on every collection cycle. Older posts keep the values captured when they were last in the update window. This means top-post rankings for older posts may slightly lag behind the current reality. If this matters for your workflow, use manual collection before generating reports.
</details>

<details>
<summary><b>The app was flagged by my antivirus — why?</b></summary>

PyInstaller-built executables are sometimes flagged as false positives. The full source is open — you can build it yourself or add an exception in your antivirus. Release assets include SHA-256 checksums you can verify.
</details>

<details>
<summary><b>Does it work behind a proxy?</b></summary>

Yes. Telethon supports SOCKS5, SOCKS4 and HTTP proxies. Proxy settings are on the roadmap — meanwhile, you can set a system-level proxy for the Telegram API.
</details>

<details>
<summary><b>How do I reset everything?</b></summary>

Delete the `~/.tg_analytics/` folder. That removes sessions, database and all cached data.
</details>

---

## 🚀 What about publishing?

TG Analytics answers **"what works?"** — but if you also want to **act on it**, check out **Telegram AutoPoster** by the same team → [tgautoposter.com](https://tgautoposter.com)

AutoPoster is a desktop tool for **automated publishing and audience growth** on Telegram. What it does:

- **Scheduled auto-posting** — templates, variables, time windows, per-day scheduling
- **Multi-account management** — run one or hundreds of accounts from a single UI
- **Bulk group joining** — mass-join groups and channels from invite links
- **Story campaigns** — auto-publish stories on schedule
- **Subscriber outreach** — collect audience from groups, send personalized DMs with `{name}`, `{username}` and other variables
- **Auto-stop protection** — instantly halts on PEER_FLOOD, consecutive errors or FloodWait spikes
- **Per-account proxies** — SOCKS5, SOCKS4, HTTP support
- **Forward from Saved Messages** — repost content from your saved messages with one click
- **Telegram reports** — daily / weekly digests sent straight to your chat
- **Auto-updates** — seamless version upgrades
- **12 UI languages** — English, Русский, 한국어, हिन्दी, Español, Deutsch, Français, Italiano, Português, Bahasa Indonesia, العربية, Tiếng Việt

**Free trial available.** All proceeds from AutoPoster support the ongoing development of TG Analytics and other open-source tools.

👉 [tgautoposter.com](https://tgautoposter.com)

---

## 💖 Support the project

TG Analytics is a passion project — free, open-source, and ad-free. If it saves you time, here's how to say thanks:

- ⭐ **Star the repo** — helps more people discover it
- 🐛 **Report bugs** — open an [issue](https://github.com/Igor-Shelloff/tg-analytics/issues)
- 💡 **Suggest features** — start a [discussion](https://github.com/Igor-Shelloff/tg-analytics/discussions)
- ☕ **Buy me a coffee** — [boosty.to/igorshelloffdev](https://boosty.to/igorshelloffdev)
- 📣 **Tell a friend** — share on Twitter / Reddit / Telegram

---

## 🛠 Tech stack

- **[pywebview](https://pywebview.flowrl.com)** — native desktop window with HTML/CSS/JS UI
- **[Telethon](https://docs.telethon.dev)** — async Telegram client
- **[cryptg](https://github.com/Lonami/cryptg)** — fast crypto backend
- **[SQLite](https://sqlite.org)** — local database (WAL mode)
- **[matplotlib](https://matplotlib.org)** — charts in PDF reports
- **[reportlab](https://www.reportlab.com)** — PDF generation
- **[qrcode](https://github.com/lincolnloop/python-qrcode)** — QR login

## 📁 Project structure

```
tg-analytics/
├── main.py                  # entry point
├── build.py                 # PyInstaller build script
├── requirements.txt
├── README.md
├── LICENSE
├── .github/workflows/       # CI: build + release
├── app/                     # Python backend
│   ├── config.py            # paths, AppConfig
│   ├── database.py          # SQLite wrapper
│   ├── telegram_client.py   # Telethon worker (own event loop)
│   ├── collector.py         # background data collection
│   ├── analytics.py         # pure computation (ER, growth, heatmap)
│   ├── api.py               # JS ↔ Python bridge
│   ├── logger.py            # file + crash logging
│   └── exports/
│       └── pdf_report.py    # PDF generator
└── web/                     # Frontend (HTML/CSS/JS)
    ├── index.html
    ├── css/main.css         # design system
    ├── js/                  # app, router, api, charts, pages
    └── locales/             # en.json, ru.json, es.json, pt.json, de.json
```

---

## 🤝 Contributing

Pull requests are welcome. For big changes, please open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create a branch: `git checkout -b feature/awesome-thing`
3. Commit: `git commit -m "Add awesome thing"`
4. Push: `git push origin feature/awesome-thing`
5. Open a Pull Request

---

## 📄 License

[MIT](LICENSE) © Igor Shilov

---

<p align="center">
  Made with ❤️ for the Telegram community
</p>
