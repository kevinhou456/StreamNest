# StreamNest 🎥

**A self-hosted multi-stream viewer — watch up to 16 live streams simultaneously in a grid layout.**

Manage your personal collection of YouTube live streams with tags, filters, and drag-and-drop ordering. Perfect for bird cams, sports multi-view, nature cameras, and any live content you follow regularly.

> Built for people who watch the same streams repeatedly and want a persistent, organized dashboard — not just a one-time multi-stream session.

---

## Why StreamNest?

Most multi-stream tools (ViewGrid, Streamyyy, MultiTwitch) are **stateless** — you add streams, watch, close the tab, and start over next time. StreamNest is different:

- Your stream list **persists** — add once, always there
- **Tag and categorize** streams (species, sport, region, anything)
- **Filter and switch** between groups instantly
- **Drag-and-drop** to set your preferred order, saved per view
- **Self-hosted** — your data stays on your machine

---

## Features

- **Grid layouts**: 2×2 / 3×3 / 4×4 (4, 9, or 16 streams)
- **Click to expand**: full-size view with sound; grid streams are muted
- **Persistent library**: streams saved in a local SQLite database
- **Tags**: create color-coded tags to group streams any way you like
- **Species filter**: if you track bird cams, species are auto-extracted as filter chips
- **Drag-and-drop ordering**: per-view ordering saved independently
- **Pagination**: browse collections of 100+ streams
- **Offline detection**: periodic background checks; offline streams show a placeholder
- **Bilingual UI**: switch between English and Chinese (中/EN)
- **Self-hosted**: runs on your machine or home server (NAS, Raspberry Pi, etc.)

---

## Use Cases

| Who | How they use it |
|-----|----------------|
| 🐦 Bird watchers | Monitor multiple nest cams simultaneously, filter by species |
| 🏎️ F1 / sports fans | Watch multiple onboard or regional streams at once |
| 🌿 Nature enthusiasts | Follow wildlife cams from different locations |
| 📡 Live event followers | Keep an eye on several streams from the same event |

---

## Quick Start

**Requirements**: [Node.js](https://nodejs.org/) v18+

```bash
git clone https://github.com/kevinhou456/streamnest.git
cd streamnest/server
npm install
npm start
```

Open **http://localhost:3000** in your browser.

### Adding a stream

1. Click **+ Add Nest** in the top-right corner
2. Paste a YouTube live stream URL:
   - `https://www.youtube.com/watch?v=VIDEO_ID`
   - `https://youtu.be/VIDEO_ID`
   - `https://www.youtube.com/@id/streams`
3. Fill in a name, optional metadata, and tags
4. Click **Add**

---

## Usage

| Action | How |
|--------|-----|
| Expand a stream (with sound) | Click on it |
| Close expanded view | `ESC` or click outside |
| Favorite / Edit / Delete | Right-click on a stream |
| Reorder streams | Click **⠿ Arrange** → drag → **Done** |
| Filter by species | Click a species chip in the toolbar |
| Filter by tag | Click a tag chip in the toolbar |
| Next / previous page | Click **◀ ▶** or press `←` `→` |
| Switch language | Click **中 / EN** in the toolbar |

---

## Self-Hosting on a NAS or Home Server

StreamNest works great as a 24/7 service on a NAS (Synology, QNAP) or any Linux box.

### Docker (recommended for always-on use)

```bash
git clone https://github.com/YOUR_USERNAME/streamnest.git
cd streamnest
docker-compose up -d --build
```

Access from any device on your network: **http://YOUR_SERVER_IP:3000**

### Data persistence

All data is stored in `data/birdnest.db` (SQLite). Back up this single file to keep your entire stream library.

---

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: SQLite (via better-sqlite3) — no database server needed
- **Frontend**: Vue 3 (CDN) + SortableJS — no build step
- **Deployment**: Docker or plain Node.js

---

## Roadmap / Ideas

- [ ] Import/export stream list (JSON)
- [ ] Support for Twitch streams
- [ ] Custom stream thumbnails
- [ ] Keyboard shortcuts for grid navigation

Pull requests welcome.

---

## License

MIT — free to use, modify, and share.

---

*Keywords: multi stream viewer, YouTube multiview, multiple live streams, live stream grid, self-hosted stream viewer, bird cam viewer, sports multiview, stream mosaic, multiview dashboard, live cam grid*
