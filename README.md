# BP Log

A static blood-pressure tracking app that can be published on GitHub Pages.

## What it does

- Saves morning, evening, and night sessions in the browser using IndexedDB.
- Automatically chooses Morning, Evening, or Night from the selected time, while still allowing manual slot changes.
- Stores 1-4 BP measurements per session and uses their rounded average for charts and status labels.
- Shows recent readings, daily completion, status labels, and a continuous pan/zoom graph.
- Exports CSV and full JSON backups.
- Optionally syncs to Supabase with login and row-level security.

## Run locally

Open `index.html` in a browser, or serve the folder with any static server.

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Publish on GitHub Pages

1. Push this folder to a GitHub repository.
2. Go to repository `Settings > Pages`.
3. Choose `Deploy from a branch`.
4. Select the branch and root folder.
5. Open the Pages URL after GitHub finishes deploying.

## Set up cloud database sync

GitHub Pages cannot store database records by itself, so this app uses Supabase for cloud backup.

1. Create a Supabase project.
2. Open the Supabase SQL editor.
3. Run the SQL in `supabase-schema.sql`.
4. In Supabase `Authentication > URL Configuration`, add your GitHub Pages URL to allowed redirect URLs.
5. In Supabase Authentication providers, keep Email enabled and allow email/password sign-ins.
6. Open the app, click the settings button, enter the Supabase project URL and anon key, then save.
7. Enter an email and password, then click Sign up once. After that, use Sign in.

If confirmation emails are unreliable, open Supabase `Authentication > Providers > Email` and turn off confirm-email requirements for this private family app, or create the user manually from `Authentication > Users > Add user` with auto-confirm enabled. Then use the app's Sign in button with that email and password.

For the most reliable GitHub Pages login callback, fill `app-config.js` with your Supabase URL and anon key before deploying. This makes fresh login tabs initialize Supabase immediately instead of depending on browser-local settings.

The anon key is safe to put in a static site only because row-level security is enabled in the schema.

## Medical note

The reference bands follow common AHA/AAP-style thresholds for adolescents aged 13 and older: normal below 120/80, elevated 120-129 and below 80, stage 1 at 130-139 or 80-89, and stage 2 at 140 or 90 and above. For each session, the app stores every measurement entered and graphs the average, matching the common recommendation to take repeated readings rather than rely on one value. This app is a tracking tool, not a diagnosis tool. A clinician should interpret the readings, especially for a 17-year-old with repeated high values.
