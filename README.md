# Doctor Who Chronology PWA

A static progressive web app for a personal Doctor Who chronology catalogue. It reads the published CSV from Google Sheets, so the spreadsheet remains the source of truth.

## Deploy or update on GitHub Pages

1. Download and unzip this package.
2. In your existing GitHub repository, upload/replace the files at the repository root: `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `icon.svg`, and `README.md`.
3. Commit the changes. GitHub Pages should rebuild the site automatically.
4. Reload the site. If an older version remains cached, do a hard refresh or close and reopen the installed PWA.

## Google Sheet columns

The app recognises these headers (case-insensitive): `ID`, `TITLE`, `GROUP`, `ERA`, `RANGE`, `RELEASE`, `LIBRARY`, `RELEASE DATE`, `DOCTOR`, `COVER ART`, `BACKGROUND ART`, and `SYNOPSIS`.

- Add `DOCTOR` for the Doctor associated with an entry.
- Add `COVER ART` with a direct, publicly accessible `https://` image URL. It is used for the cover thumbnail and full-size cover lightbox in the entry details panel.
- Optionally add `BACKGROUND ART` with a direct, publicly accessible `https://` image URL. It is used for the large hero image at the top of the entry details panel. If the cell is blank, the app uses `COVER ART` for the hero image instead. If both are blank, the compact no-art header is shown.
- Column order does not matter; the app reads values by header name.
- Entries whose `ID` contains `TBD`, an en dash (`–`) or em dash (`—`), or whose ID is just a hyphen (`-`), are retained in the spreadsheet but excluded from the visible catalogue.

## Features

- Search and filters for Group, Era, Range, Doctor, and Library.
- Chronology grouped by Group and Era, with natural alphanumeric ID ordering.
- Details panel with metadata, optional cover art, and synopsis.
- Titles containing a colon automatically display the text before the first colon in bold, with the text after it on a new line in regular weight.
- Manual refresh and cached fallback when the network is unavailable.
- Dark-blue archive theme and Calibri-style sans-serif typography.


## Compact view (v12)

Use the **Compact view** checkbox above the catalogue to switch between the full table and a two-column view showing ID and Title. Group and Era remain as section headings separating the tables; they are not repeated as columns. The selection is remembered in this browser.


## Editable range colour associations (v23)

Create a second tab in the same Google spreadsheet named **RANGE COLOURS** with these exact headers:

| RANGE | COLOUR |
|---|---|
| First Doctor Era | #8B6EAA |
| Third Doctor Era | #4D9B83 |

Use one row per exact `RANGE` value from the catalogue. Colour values may be `#RGB` or `#RRGGBB` hexadecimal codes. Matching is case-insensitive. Rows without a valid colour, and catalogue ranges without a matching row, keep the normal appearance.

Publish the **RANGE COLOURS** tab as CSV and copy its published CSV URL. In `app.js`, paste that URL into `RANGE_COLOURS_CSV_URL` near the top of the file. The app applies the chosen colour to story title text (including subtitles) and uses a darkened version as the background of the rounded Range pill. The brighter colour is used for the pill text. The same styling appears in the details panel.

The published CSV URL is separate from the main catalogue CSV URL. The range-colour table is fetched whenever the catalogue is refreshed.
