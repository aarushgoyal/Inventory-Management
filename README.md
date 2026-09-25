# Stock Manager — Oriflame Sub-Dealer

A simple, mobile-friendly stock/purchase/sales manager. Runs entirely as static
files (no server needed) and stores its data in your own free Supabase project.

Works on: iPhone Safari, Chrome (mobile & desktop). On phones, the five sections
sit in a horizontal tab bar fixed to the bottom of the screen; on desktop the
same bar sits under the header.

## Files
- `index.html` — the app
- `styles.css` — styling
- `app.js` — all the logic (talks to Supabase)
- `config.js` — **you edit this** with your Supabase project keys
- `schema.sql` — run this once inside Supabase to create the database tables

## 1. Create your Supabase project (free)
1. Go to https://supabase.com → sign up / log in → **New project**.
2. Pick a name and a database password (save the password somewhere), choose
   the region closest to you, and click **Create new project**. Wait ~2 minutes
   for it to finish setting up.

## 2. Create the database tables
1. In your new project, open **SQL Editor** (left sidebar) → **New query**.
2. Open `schema.sql` from this folder, copy all of it, paste it into the editor.
3. Click **Run**. You should see "Success. No rows returned."
4. Go to **Storage** (left sidebar) and confirm a bucket called
   `product-images` now exists and is marked **Public**. (The SQL script
   creates it for you — if for some reason it's missing, create it manually:
   **New bucket** → name it exactly `product-images` → toggle **Public bucket** on.)

## 3. Connect the app to your project
1. In Supabase, go to **Project Settings** (gear icon) → **API**.
2. Copy the **Project URL** and the **anon public** key.
3. Open `config.js` in this folder and paste them in:
   ```js
   const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
   const SUPABASE_ANON_KEY = "eyJhbGciOi...";
   ```
4. Save the file.

## 4. Publish to GitHub Pages
1. Create a new repository on GitHub (public or private — Pages works with both
   on paid plans; use **public** if you're on the free plan).
2. Upload all five files (`index.html`, `styles.css`, `app.js`, `config.js`,
   `schema.sql`) to the repository root — either by dragging them into the
   GitHub web UI ("Add file" → "Upload files") or via git:
   ```bash
   git init
   git add .
   git commit -m "Stock manager"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
   git push -u origin main
   ```
3. In the repository, go to **Settings** → **Pages**.
4. Under "Build and deployment", set **Source** to **Deploy from a branch**,
   branch **main**, folder **/ (root)** → **Save**.
5. After a minute, GitHub shows your live URL, something like:
   `https://YOUR-USERNAME.github.io/YOUR-REPO/`
6. Open it on your iPhone (Safari) or Chrome — it works the same everywhere.
   Add it to your home screen for one-tap access (Safari: Share → Add to Home
   Screen).

## Notes on how it works
- **Products**: name + optional photo (photos are stored in the
  `product-images` Supabase Storage bucket).
- **Stock**: quantity is stored directly on each product and updates
  automatically whenever you save a purchase or a sale bill. 3 units or fewer
  is shown in red as "Low stock."
- **Purchases**: one bill = dealer name, date, cash/credit, and one or more
  product lines (pick from your product list, enter quantity and price — the
  line amount and bill total calculate automatically). Saving a purchase adds
  to stock.
- **Sales**: one bill = buyer name, date, cash/credit, and one or more product
  lines (with an optional style/shade field). Saving a sale subtracts from
  stock.
- **Dashboard**: current month's sales and purchases split by cash/credit,
  a low-stock list, and recent activity. Deleting a bill automatically
  reverses its effect on stock.
- Everyone with the link and no password can use the app as-is (the anon key
  only unlocks these specific tables). If you want a login screen so only you
  can access it, that's a further step we can add later (Supabase Auth) —
  just ask.

## Updating the app later
Whenever you want a design or feature change, edit the files and re-upload
them to the same GitHub repository (or `git push` again) — GitHub Pages
redeploys automatically within a minute or two.
