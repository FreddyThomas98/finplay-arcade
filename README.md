# 🎮 FinPlay Arcade — Finance & Accounting Games Portal

A fun-filled, classroom-ready web app portal hosting **5 interactive finance & accounting HTML5 games**, built for **30+ simultaneous students** on **Render Free** + **PostgreSQL**.

## ✨ Features
- **Gmail Signup & Login:** First-time students sign up with Full Name, Gmail address, password, and a fun arcade avatar. Returning students log right back in.
- **5 Playable Finance Games** (themed in FinPlay Arcade's neon-carnival palette with original rules & gameplay untouched):
  1. 🐤 **Flappy Finance** — Fly through the right accounting gates
  2. 🔤 **Finance Hangman** — Decode 5 levels of accounting terminology
  3. 🎯 **Finance Blaster** — Aim & blast the correct account category
  4. 🪙 **Cash Collector** — 4-stage accounting platformer
  5. 🧩 **Accounting Crossword** — 15-word timed accounting puzzle
- **3-Attempt Limit per Game:** Enforced atomically server-side on Start (prevents infinite F5 refresh retries), keeping each student's **Best Score** across attempts.
- **Live Scorecard & Toppers Podium:** Animated Gold / Silver / Bronze champions podium + searchable Overall and Per-Game leaderboards.
- **Admin Command Center:**
  - Reset attempts for **one student** (single game or all 5 games)
  - Reset attempts for **all students** (single game or all 5 games)
  - Optional checkbox to also wipe saved scores on reset
  - Adjust global retry limit (default `3`)
  - Export complete scorecard to **CSV**

---

## 💻 Running Locally

```bash
npm install
npm start
```

Open **http://localhost:3000**

- When `DATABASE_URL` is not set locally, the server automatically uses built-in persistent local PostgreSQL (`PGlite` in `./data/local-pg`), so you don't need to install Postgres locally to test!
- **Default Admin Login (Local Dev):**
  - Gmail: `admin@gmail.com`
  - Password: `Admin@123`

### Run the 35-Concurrent-Student Load Test
```bash
npm run test:load
```

---

## 🚀 Deploying to Render (Free Web Service + Free PostgreSQL)

### Option A: One-Click Blueprint (`render.yaml` included!)
1. Push this folder to a **GitHub** repository (free account).
2. Go to [dashboard.render.com](https://dashboard.render.com) -> click **New +** -> **Blueprint**.
3. Connect your GitHub repo — Render automatically detects `render.yaml` and sets up:
   - **Web Service (`finplay-arcade`)** on Free plan
   - **PostgreSQL (`finplay-db`)** on Free plan
4. When prompted for `ADMIN_PASSWORD`, enter your chosen strong admin password (and optionally edit `ADMIN_EMAIL` to your Gmail).
5. Click **Apply** and wait ~2 minutes. Your live URL (`https://finplay-arcade.onrender.com`) is ready!

### Important Render Free-Tier Tips
- **Wake-up before class:** Render's free web service sleeps after 15 minutes of inactivity (~30–50s first load). Open the link 1 minute before students join so it's instant for everyone.
- **30-Day Free Postgres Limit:** Render's free PostgreSQL database expires 30 days after creation.
  - Great for a workshop, competition, or 1-month course.
  - If you want it to stay free **permanently**, create a free PostgreSQL database on [Neon](https://neon.tech) or [Supabase](https://supabase.com), copy its `DATABASE_URL`, and paste it into your Render Web Service **Environment Variables** — zero code changes required!
