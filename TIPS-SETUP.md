# Community tips — Firebase setup

The tips form, the live "approved tips" on walk pages, and the admin page all
use a Firebase project (Firestore). The UI works without it (the form just says
"tips aren't set up yet"); follow these steps to switch it on.

## 1. Create the project
1. Go to https://console.firebase.google.com and **Add project** (free Spark plan is fine).
2. In the project, open **Build → Firestore Database → Create database** → start in **production mode** → pick a location (e.g. europe-west2).

## 2. Add a Web app and copy the config
1. Project settings (gear icon) → **Your apps** → **</>** (Web).
2. Register the app (no hosting needed).
3. Copy the `firebaseConfig` values and paste them into **`firebase-config.js`**
   in this repo (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId).
   These are safe to commit — access is controlled by the rules below, not by hiding them.

## 3. Publish the security rules
1. Firestore Database → **Rules**.
2. Replace the contents with **`firestore.rules`** from this repo → **Publish**.
   (These let anyone submit a *pending* tip, let everyone read *approved* tips,
   and let only the admin email approve/reject.)

## 4. (Phase 2 — admin page) Enable sign-in
1. Build → **Authentication → Get started → Google** → enable → save.
2. The admin email is set to **jademay01@gmail.com** in `firestore.rules` and on
   the admin page. Change it there if you want a different account.

That's it. Submit a test tip from a walk page → it appears in Firestore as
`status: "pending"` → approve it on the admin page → it shows on the walk page.
