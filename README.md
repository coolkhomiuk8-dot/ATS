# Driver CRM - Netlify Ready

This project was split from a single-file prototype into a modular React architecture using Vite.

## Stack

- React 18
- Zustand (state management)
- Firebase Firestore + Storage (drivers data + documents)
- Vite (build/dev server)
- Netlify (deployment)

## Project structure

- src/App.jsx - app shell and view routing
- src/store/useDriversStore.js - Zustand state and actions
- src/constants/data.js - constants and seed data
- src/utils/date.js - date helpers
- src/utils/file.js - file-size formatter
- src/components - reusable UI and workflow components
- src/views - page-level views (Dashboard, Templates)
- src/styles/global.css - global styles
- netlify.toml - Netlify build and SPA redirect config

## Run locally

1. Install Node.js 20+ (includes npm).
2. Create `.env` from `.env.example` and fill Firebase values.
2. Install dependencies:
   npm install
3. Start development server:
   npm run dev
4. Build for production:
   npm run build

## Firebase setup

1. Create a Firebase project.
2. Enable Firestore Database (production or test mode).
3. Enable Firebase Storage.
4. In Project Settings -> Your apps -> Web app, copy config values into `.env`.

Required `.env` keys:

- VITE_FIREBASE_API_KEY
- VITE_FIREBASE_AUTH_DOMAIN
- VITE_FIREBASE_PROJECT_ID
- VITE_FIREBASE_STORAGE_BUCKET
- VITE_FIREBASE_MESSAGING_SENDER_ID
- VITE_FIREBASE_APP_ID

Data behavior:

- Driver profiles, stage, notes, flags, docs checklist are stored in Firestore collection `drivers`.
- Uploaded files are stored in Firebase Storage under `driver-files/{driverId}/...`.
- On first launch with empty Firestore, sample drivers are auto-seeded.
- On each page load, drivers are loaded from Firestore in real time.

## Storage rules for file uploads (admin/root)

Project includes [storage.rules](storage.rules) to allow uploads under `driver-files/*` only for users with role `admin` or `root`.
Role can be provided by either:

- Firebase custom claim `request.auth.token.role`
- Firestore document `user_roles/{email}` with field `role`

Deploy rules to Firebase:

1. Install Firebase CLI and login.
2. Run: `firebase use <your-project-id>`
3. Run: `firebase deploy --only storage`

## Deploy to Netlify

1. Push this folder to GitHub.
2. In Netlify, create new site from Git.
3. Build command: npm run build
4. Publish directory: dist

`netlify.toml` already contains these settings and a redirect rule for SPA routing.
