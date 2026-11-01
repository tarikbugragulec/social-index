# SOCIAL INDEX — Multi-Platform Account, Posts, Stories & Reels Explorer

**SOCIAL INDEX** is a zero-dependency Node.js web application that aggregates public profile metrics, posts, stories, highlights, reels, and repositories across **7 major platforms** from a single username search:

- **GitHub** (Repositories, Public Events/Commits, Top Starred Repos, Gists & Auto-Discovered Social Links)
- **Instagram** (Posts, Active Stories, Story Highlights, Reels & Live Profile Grid)
- **Threads** (Public Threads, Media/Videos & Linked Meta Stories/Highlights)
- **X (Twitter)** (Recent Tweets, Media/Videos & Top Liked Highlights)
- **TikTok** (Public Videos, TikTok Stories & Top Viral Highlights)
- **YouTube** (Uploaded Videos, YouTube Shorts & Channel Statistics)
- **Bluesky** (ATProto Author Feed, Media/Video Posts & Top Posts)

---

## Features

- **Zero External Dependencies:** Built purely with standard Node.js (`http`, `fs`, `path`, native `fetch`) and vanilla HTML/CSS/JS.
- **Official Developer API Gateway + Automatic Fallback:**
  - Supports official tokens for **Meta Graph API v22.0** (`developers.facebook.com`), **Threads Graph API v1.0**, **YouTube Data API v3**, **X API v2**, **TikTok API v2**, and **GitHub REST API v3**.
  - Works out-of-the-box **without any API keys** using public endpoints, RSS/XML feeds, ATProto XRPC, and embed/MCP layers.
- **Privacy & Git-Safe Configuration:**
  - Local API keys are stored in `.env` or `api-config.json` (both excluded via `.gitignore` and blocked from static HTTP access).

---

## Quick Start

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd social-index
   ```

2. Start the server (requires Node.js 18+):
   ```bash
   npm start
   # or
   node server.js
   ```

3. Open in your browser:
   ```
   http://localhost:3000
   ```

---

## Optional API Configuration

You can configure official developer API keys in two ways:
1. **Via the Web UI:** Click the **`⚙️ Resmi API Ayarları`** button in the top-right corner of the app.
2. **Via `.env` file:** Copy `.env.example` to `.env` and fill in any keys you wish to use:
   ```bash
   cp .env.example .env
   ```

## License

MIT

