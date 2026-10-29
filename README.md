# Doctor Who Chronology PWA

A static progressive web app for a personal Doctor Who chronology catalogue. It reads the published CSV from Google Sheets, so the spreadsheet remains the source of truth.

## Deploy or update on GitHub Pages

1. Download and unzip this package.
2. In your existing GitHub repository, upload/replace the files at the repository root: `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `icon.svg`, and `README.md`.
3. Commit the changes. GitHub Pages should rebuild the site automatically.
4. Reload the site. If an older version remains cached, do a hard refresh or close and reopen the installed PWA.

## Google Sheet columns

The app recognises these headers (case-insensitive): `ID`, `TITLE`, `GROUP`, `ERA`, `RANGE`, `RELEASE`, `LIBRARY`, `RELEASE DATE`, `DOCTOR`, `COVER ART`, and `SYNOPSIS`.

- Add `DOCTOR` for the Doctor associated with an entry.
- Add `COVER ART` with a direct, publicly accessible `https://` image URL. Cover art appears only in the entry details panel, not in the chronology table.
- Column order does not matter; the app reads values by header name.
- Entries whose `ID` contains `TBD`, an en dash (`–`) or em dash (`—`), or whose ID is just a hyphen (`-`), are retained in the spreadsheet but excluded from the visible catalogue.

## Features

- Search and filters for Group, Era, Range, Doctor, and Library.
- Chronology grouped by Group and Era, with natural alphanumeric ID ordering.
- Details panel with metadata, optional cover art, and synopsis.
- Titles containing a colon automatically display the text before the first colon in bold, with the text after it on a new line in regular weight.
- Manual refresh and cached fallback when the network is unavailable.
- Dark-blue archive theme and Calibri-style sans-serif typography.
