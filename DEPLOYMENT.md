# Deployment — getting Jobtool to the user

Jobtool ships as a single Windows `.exe`. The user does **not** need Node.js,
npm, or any developer tools installed.

---

## Build the program

From the project folder:

```
npm install      # first time only
npm run package
```

This produces **`release/jobtoolAdmin.exe`** (~60 MB). It bundles the app, the
server, and the Node.js runtime into one file.

---

## Send it to the user

1. Take the file **`release/jobtoolAdmin.exe`**.
2. Put it in a folder on the user's PC, e.g. `C:\Jobtool\`.
   (A dedicated folder is best — the program creates a `data` folder next to
   itself for job records, and an `uploads` folder if OneDrive isn't set up.)
3. Optional: right-click the `.exe` → **Send to → Desktop (create shortcut)** so
   it's easy to launch.

How you deliver the file is up to you — USB stick, OneDrive/Google Drive link,
or email (note: some email systems block `.exe` attachments, so a cloud link is
usually easiest). The file is large, so a shared link is recommended.

---

## First run

1. The user double-clicks `jobtoolAdmin.exe`.
2. Windows SmartScreen may warn that the publisher is unknown (this is normal for
   an unsigned in-house app). Click **More info → Run anyway**.
3. The browser opens automatically at the app.

---

## Shipping an update later

1. Make your code changes.
2. Run `npm run package` again.
3. Send the new `release/jobtoolAdmin.exe`.
4. The user **replaces the old `.exe`** with the new one.

The `data` folder sitting next to the program is never touched — all job history
and settings carry over automatically.

---

## Folder layout on the user's PC

```
C:\Jobtool\
   jobtoolAdmin.exe     ← replace this on each update
   data\                ← job records + settings (created automatically, keep this)
   uploads\             ← local scan images (only if OneDrive is not configured)
```
