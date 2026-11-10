# Quest Stationery Store Portal

A browser-based inventory portal backed by a Node.js server and MySQL database.

## Run locally

1. Install Node.js 24 or newer and MySQL Server.
2. In MySQL, create a database with `CREATE DATABASE quest_stationery CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;` and create a database user that can read and write to it.
3. Copy `.env.example` to `.env` and enter your MySQL host, database, username, and password. Keep `.env` private; it is excluded from Git.
4. Run `npm install`, then `npm start` (or double-click `start.bat`). Open `http://localhost:3000` and create the administrator account on first launch.

Do not open `index.html` directly with a `file://` URL. The app needs the local server for its database and sign-in API.

## What is persisted

- Inventory, supplier details, quantities, prices, and reorder levels
- Stock issue history, issuing account, issue slips, and department/institution labels
- Department requisitions, decisions, and automatic stock issue on approval
- User profile photo and username
- Hashed passwords and server-side sign-in sessions
- Support questions, administrator replies, and open/resolved status
- Monthly consumption/spending, most-used items, and reorder analytics
- Per-account notification history, unread status, and activity across inventory, issues, requisitions, support, and account changes

The server creates its MySQL tables automatically when it starts. Back up the MySQL database regularly using MySQL Workbench or `mysqldump`.

## Move existing SQLite data to MySQL

1. Create a **new, empty** MySQL database and configure `.env` as above. Stop the old server before migrating so no new changes are made during the copy.
2. Run `npm install` if needed, then `npm run migrate:sqlite`. The migration reads `data/quest-stationery.sqlite` and copies accounts, profile images, password hashes, inventory, issue records, requisitions, support queries, notifications, and sessions. It stops if the target MySQL tables contain data, to avoid accidental duplicates.
3. Start the app with `npm start` and sign in using the same accounts. Keep the SQLite file as a backup until you confirm the migrated records.

Set `SQLITE_PATH` in `.env` if the existing SQLite file is stored somewhere else. Never put production database credentials in source control. For hosting, configure the same `MYSQL_*` values as private environment variables in the hosting provider and use a MySQL server reachable from that host.

## Accounts and access

Sign out from the header to switch accounts. The administrator opens **Settings** to create individual accounts:

- **Store administrator** — manages accounts, inventory, requisitions, and support.
- **Store staff** — can maintain inventory and issue supplies; can review department requests.
- **Read-only** — can view the dashboard and reports.
- **Department requester** — can submit requisitions and see their own request status.

Only the administrator can approve/reject requisitions. Approval deducts stock and creates a named issue record automatically. Issue history includes a **Print slip** action for a one-page Quest-branded audit slip. Reports include monthly consumption/spending by department, most-used items, and suggestions calculated from the prior 90 days of usage (aiming for roughly 60 days of stock). The notification bell stores events in SQLite, tracks unread items separately for each account, and refreshes every 12 seconds while signed in. It covers item additions/edits/removals, issues and low-stock transitions, requisitions and decisions, support queries/replies, account changes, and sample-data restoration. Use **Export Excel** for a workbook-compatible report or **Export CSV** for the inventory list. Passwords are salted and hashed on the server; they are never stored as plain text.

## Configuration

Required database environment variables (stored in `.env` locally):

- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_DATABASE`
- `MYSQL_CONNECTION_LIMIT` — maximum open database connections (default `10`)
- `SQLITE_PATH` — optional source-file override for the one-time migration

Other environment variables:

- `PORT` — HTTP port (default `3000`)
- `HOST` — bind address (default `127.0.0.1` locally; `0.0.0.0` in production)
- `SESSION_HOURS` — sign-in session duration (default `12`)
- `NODE_ENV=production` — marks session cookies Secure; serve the app behind HTTPS in production

For access by other devices, deploy the app and MySQL on trusted hosting, use a database network allowlist, and put the app behind HTTPS. A hosted database must allow connections from the app host.

## Deploy to Vercel

This project uses a Node.js server and MySQL; it is not a static-only site. Vercel detects the root `server.ts` entry point and runs the existing `server.mjs` implementation.

1. **Back up MySQL.** Export the current MySQL database and keep the backup outside the repository. Do not rely on the older SQLite file as the latest backup.
2. **Create a hosted MySQL database.** The database must be reachable from Vercel over TLS or the provider's supported secure connection method. Import the MySQL export into it. Do not use `127.0.0.1` or `localhost` for `MYSQL_HOST` in Vercel.
3. **Push this repository to GitHub.** Ensure `.env` and database backups are not committed. `.gitignore` excludes `.env` and the old SQLite files.
4. **Import the repository in Vercel.** Choose **Add New → Project**, connect GitHub, and select this repository. Its root directory is the repository root. The project has no build step; keep the framework setting as **Other** if Vercel asks.
5. **Set environment variables** in the Vercel project under **Settings → Environment Variables** for Production (and Preview if needed): `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_CONNECTION_LIMIT`, `SESSION_HOURS`, and `NODE_ENV=production`. Use the provider's connection details; never commit production credentials.
6. **Deploy and verify.** After deployment, open the generated URL, complete the first administrator setup if the imported database has no users, sign in, and confirm inventory and other records are present. Check Vercel logs and database network/TLS settings if requests fail.

Changes to Vercel environment variables require a new deployment. Vercel can host the app, but the database remains with the MySQL provider; Vercel does not copy or persist a local database automatically.

## Project files

- `index.html` — application markup
- `app.css` — styles
- `app.js` — browser behavior and API requests
- `server.mjs` — HTTP server, sign-in, and MySQL-backed JSON API
- `server.ts` — Vercel entry point for the existing server
- `migrate-sqlite-to-mysql.mjs` — one-time migration of the existing local database
- `data/` — existing SQLite file retained as a migration source/backup (excluded from source control)
- `quest-logo.webp` — Quest Group logo
