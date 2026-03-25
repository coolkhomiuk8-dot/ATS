# Driver CRM - Netlify Ready

This project was split from a single-file prototype into a modular React architecture using Vite.

## Stack

- React 18
- Zustand (state management)
- Firebase Firestore + Auth (drivers data + roles)
- Google Drive (documents storage via backend endpoint)
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
- VITE_FIREBASE_MESSAGING_SENDER_ID
- VITE_FIREBASE_APP_ID
- VITE_DRIVE_UPLOAD_ENDPOINT
- VITE_DRIVE_DELETE_ENDPOINT

Data behavior:

- Driver profiles, stage, notes, flags, docs checklist are stored in Firestore collection `drivers`.
- Files are uploaded to Google Drive through a secure backend endpoint.
- Firestore stores only file metadata (URL, name, size, driveFileId).
- On each page load, drivers are loaded from Firestore in real time.

## Roles for files

Only `admin` and `root` can upload or delete files.
`user` can only view and open file links.

Role source:

- Firestore document `user_roles/{email}` with field `role`

## Google Drive backend requirements

This repo already includes serverless backend in `netlify/functions`:

- `driveUpload` uploads file to Google Drive
- `driveDelete` deletes file from Google Drive
- both endpoints verify Firebase ID token and allow only `admin`/`root`

By default frontend calls:

- `/.netlify/functions/driveUpload`
- `/.netlify/functions/driveDelete`

No separate backend service is required.

## Where to store JSON keys

Never store JSON keys in git.

Store both JSON keys in Netlify Site Settings -> Environment variables:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`

Additional variables:

- `GOOGLE_DRIVE_ROOT_FOLDER_NAME=ats-storage`
- `GOOGLE_DRIVE_ROOT_PARENT_ID=root`

## Google Drive folder structure

Files are uploaded into:

- `ats-storage/{name_surname_phonenumber}/file.ext`

The `{name_surname_phonenumber}` key matches the driver document key used in Firestore.

## How to create Google Drive key

1. Open Google Cloud Console.
2. Enable Google Drive API in your project.
3. Go to IAM & Admin -> Service Accounts.
4. Create a new Service Account.
5. Open it -> Keys -> Add key -> Create new key -> JSON.
6. Copy JSON content into Netlify env var `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`.
7. In Google Drive, create folder `ats-storage`.
8. Share folder `ats-storage` with service account email (Editor).

## How to create Firebase Admin key

1. Firebase Console -> Project Settings -> Service accounts.
2. Generate new private key (JSON).
3. Copy JSON content into Netlify env var `FIREBASE_SERVICE_ACCOUNT_JSON`.

## Deploy to Netlify

1. Push this folder to GitHub.
2. In Netlify, create new site from Git.
3. Build command: npm run build
4. Publish directory: dist

`netlify.toml` already contains these settings and a redirect rule for SPA routing.
