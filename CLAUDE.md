# Project memory — Tidewell Plumbing Job Card

## Deployment decision (confirmed)
- **Ship as a PWA ("Add to Home Screen" web app) for the pilot.** No app store, no developer fees, one codebase for basic Android + iOS. This is the lightest path and directly satisfies the offline-first / 12-hour-offline requirement.
- **Graduation path (later, if needed):** wrap the same web app with Capacitor to put it on the App Store / Google Play — useful once photo & signature capture are added. Avoid fully-native unless the app becomes mission-critical.
- When building real deployment: implement PWA service worker + local storage (IndexedDB) for offline; add manifest for home-screen install.

## Security (must address before build — device loss is the top risk)
- PIN/biometric lock on open (lives on the login screen).
- Auto-logout after inactivity.
- Remote logout / wipe: manager revokes a technician's access → local data clears on next launch.

## Product context
- Offline-first field job-card app. 5 technicians + 1 manager (process owner) + 1 admin.
- Lifecycle/statuses: Draft → Finished → Synced / Sync Failed → Printed/Locked.
- Conflict policy: latest edit wins (Option A).
- Admin recaptures printed cards into **Sage Online** (manual today).
