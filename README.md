# Doctor Who Chronology — PWA starter

This is a static progressive web app tailored to the provided Doctor Who catalogue CSV. It reads the published Google Sheets feed directly and provides search, sorting, filters for GROUP/ERA/RANGE/LIBRARY, and record detail views.

## Files
- `index.html` — app structure
- `styles.css` — responsive editorial styling
- `app.js` — CSV fetching, parsing, search, sorting, filters and record details
- `manifest.webmanifest` — installable-app metadata
- `sw.js` — caches the app shell for offline loading
- `icon.svg` — starter app icon

## Deploy on GitHub Pages
1. Create a new GitHub repository.
2. Upload all files from this folder to the repository root.
3. In repository Settings → Pages, select Deploy from a branch, choose `main` and `/ (root)`, then save.
4. Wait for deployment, then open the provided Pages URL over HTTPS.
5. Install from the browser: on iPhone/iPad use Share → Add to Home Screen; in supported desktop browsers use the install icon/menu.

## Data
The CSV feed is configured in `app.js`. The app tries to fetch it when it loads and when Refresh is clicked. If fetching fails after a successful load, it shows the last saved CSV copy from that browser.

The published feed is public. Do not put private data in the published worksheet.

## Customising
- Edit the page title and introductory copy in `index.html`.
- Change colours and typography in `styles.css` under `:root`.
- The app is tailored to `GROUP`, `ERA`, `ID`, `TITLE`, `RANGE`, `RELEASE`, `LIBRARY`, and `RELEASE DATE`. Rows whose `ID` contains `TBD` remain in Google Sheets but are excluded from the app until assigned a definitive ID.
- The starter icon is `icon.svg`.

## Notes
- A service worker requires HTTPS or localhost; GitHub Pages supplies HTTPS.
- The service worker caches the app shell. The last successfully loaded CSV is cached in localStorage by the app.
- External CSV updates depend on Google's published-feed propagation and network availability.
