'use strict';

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRHeYBfAFZj_bhEH4ncnGPwccoF8JaAxsRYzuaeJguThQXLWldk87ewRZhrwm5eH5yZs_iKCdBx3pEf/pub?output=csv';
const CACHE_KEY = 'dw-chronology-csv-v5';
const $ = (id) => document.getElementById(id);
const state = { rows: [], headers: [], selected: null, loading: false };

function normalizeHeader(value) { return String(value ?? '').replace(/^\uFEFF/, '').trim().toUpperCase(); }
function field(row, name) {
  const key = Object.keys(row).find(k => normalizeHeader(k) === normalizeHeader(name));
  return key ? String(row[key] ?? '').trim() : '';
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function parseCSV(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); if (row.some(v => v.trim())) rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, '')); if (row.some(v => v.trim())) rows.push(row); }
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows.shift().map(h => h.trim());
  const records = rows.map(values => Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? '').trim()])));
  return { headers, records };
}
function isExcluded(row) {
  const id = field(row, 'ID').toUpperCase();
  // Keep unresolved IDs in the Sheet, but don't import them into the visible app catalogue.
  return id.includes('TBD') || id.includes('–') || id.includes('—') || id === '-';
}
function naturalCompare(a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }); }
function uniqueValues(rows, name) {
  return [...new Set(rows.map(r => field(r, name)).filter(Boolean))].sort(naturalCompare);
}
function setOptions(select, values, defaultLabel) {
  const previous = select.value;
  select.innerHTML = `<option value="">${escapeHtml(defaultLabel)}</option>` + values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  if (values.includes(previous)) select.value = previous;
}
function populateFilters() {
  setOptions($('groupFilter'), uniqueValues(state.rows, 'GROUP'), 'All groups');
  setOptions($('eraFilter'), uniqueValues(state.rows, 'ERA'), 'All eras');
  setOptions($('rangeFilter'), uniqueValues(state.rows, 'RANGE'), 'All ranges');
  setOptions($('doctorFilter'), uniqueValues(state.rows, 'DOCTOR'), 'All Doctors');
  setOptions($('libraryFilter'), uniqueValues(state.rows, 'LIBRARY'), 'All items');
}
function filteredRows() {
  const q = $('searchInput').value.trim().toLocaleLowerCase();
  return state.rows.filter(row => {
    if ($('groupFilter').value && field(row, 'GROUP') !== $('groupFilter').value) return false;
    if ($('eraFilter').value && field(row, 'ERA') !== $('eraFilter').value) return false;
    if ($('rangeFilter').value && field(row, 'RANGE') !== $('rangeFilter').value) return false;
    if ($('doctorFilter').value && field(row, 'DOCTOR') !== $('doctorFilter').value) return false;
    if ($('libraryFilter').value && field(row, 'LIBRARY') !== $('libraryFilter').value) return false;
    if (q) {
      const haystack = [field(row, 'ID'), field(row, 'TITLE'), field(row, 'GROUP'), field(row, 'ERA'), field(row, 'RANGE'), field(row, 'RELEASE'), field(row, 'LIBRARY'), field(row, 'RELEASE DATE'), field(row, 'DOCTOR'), field(row, 'SYNOPSIS')].join(' ').toLocaleLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => naturalCompare(field(a, 'ID'), field(b, 'ID')));
}
function renderCatalogue() {
  const rows = filteredRows();
  $('countText').textContent = `${rows.length.toLocaleString()} item${rows.length === 1 ? '' : 's'}`;
  if (!rows.length) {
    $('catalogue').innerHTML = '<div class="empty-state">No catalogue entries match those filters.</div>';
    return;
  }
  // Preserve the archive's Group > Era hierarchy while sorting each section by ID.
  const groups = [];
  const groupMap = new Map();
  for (const row of rows) {
    const groupName = field(row, 'GROUP') || 'Uncategorised';
    if (!groupMap.has(groupName)) { const g = { name: groupName, eras: [], eraMap: new Map() }; groupMap.set(groupName, g); groups.push(g); }
    const g = groupMap.get(groupName);
    const eraName = field(row, 'ERA') || 'Unspecified era';
    if (!g.eraMap.has(eraName)) { const e = { name: eraName, rows: [] }; g.eraMap.set(eraName, e); g.eras.push(e); }
    g.eraMap.get(eraName).rows.push(row);
  }
  $('catalogue').innerHTML = groups.map(group => `
    <section class="group-section">
      <div class="group-heading"><p class="eyebrow">CHRONOLOGY GROUP</p><h2>${escapeHtml(group.name)}</h2></div>
      ${group.eras.map(era => `
        <div class="era-block">
          <div class="era-heading"><span>${escapeHtml(era.name)}</span><span class="era-count">${era.rows.length} item${era.rows.length === 1 ? '' : 's'}</span></div>
          <div class="table-wrap"><table>
            <colgroup><col style="width:9%"><col style="width:28%"><col style="width:13%"><col style="width:12%"><col style="width:12%"><col style="width:12%"><col style="width:14%"></colgroup>
            <thead><tr><th scope="col">ID</th><th scope="col">Title</th><th scope="col">Doctor</th><th scope="col">Range</th><th scope="col">Release</th><th scope="col">Library</th><th scope="col">Release date</th></tr></thead>
            <tbody>${era.rows.map(row => `<tr>
              <td class="id-cell">${escapeHtml(field(row, 'ID') || '—')}</td>
              <td><button type="button" class="title-button" data-record-id="${escapeHtml(field(row, 'ID'))}">${formatTitle(field(row, 'TITLE') || 'Untitled')}</button></td>
              <td>${escapeHtml(field(row, 'DOCTOR') || '—')}</td>
              <td>${field(row, 'RANGE') ? `<span class="tag">${escapeHtml(field(row, 'RANGE'))}</span>` : '—'}</td>
              <td>${escapeHtml(field(row, 'RELEASE') || '—')}</td>
              <td>${escapeHtml(field(row, 'LIBRARY') || '—')}</td>
              <td>${escapeHtml(field(row, 'RELEASE DATE') || '—')}</td>
            </tr>`).join('')}</tbody>
          </table></div>
        </div>`).join('')}
    </section>`).join('');
  $('catalogue').querySelectorAll('[data-record-id]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.recordId;
    const record = state.rows.find(r => field(r, 'ID') === id);
    if (record) showDetail(record);
  }));
}
function formatTitle(raw) {
  const title = String(raw ?? '').trim() || 'Untitled';
  const colon = title.indexOf(':');
  if (colon === -1) return `<span class="title-main">${escapeHtml(title)}</span>`;
  const main = title.slice(0, colon).trim();
  const subtitle = title.slice(colon + 1).trim();
  return `<span class="title-main">${escapeHtml(main)}</span>${subtitle ? `<span class="title-subtitle">${escapeHtml(subtitle)}</span>` : ''}`;
}
function safeImageUrl(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
}
function showDetail(row) {
  state.selected = row;
  const details = ['DOCTOR', 'GROUP', 'ERA', 'RANGE', 'RELEASE', 'RELEASE DATE', 'LIBRARY'];
  const cover = safeImageUrl(field(row, 'COVER ART')) || safeImageUrl(field(row, 'COVERART')) || safeImageUrl(field(row, 'COVER'));
  const meta = details.map(name => `<div class="meta-item"><dt>${escapeHtml(name === 'RELEASE DATE' ? 'Release date' : name[0] + name.slice(1).toLowerCase())}</dt><dd>${escapeHtml(field(row, name) || '—')}</dd></div>`).join('');
  const synopsis = field(row, 'SYNOPSIS');
  const synopsisContent = synopsis ? escapeHtml(synopsis).replace(/\r?\n/g, '<br>') : '<span class="synopsis-empty">No synopsis supplied yet. Add text to the <strong>SYNOPSIS</strong> column in your Google Sheet.</span>';
  $('detailPanel').innerHTML = `
    <div class="detail-top"><div><p class="detail-kicker">Catalogue entry</p><h2 id="detailTitle" class="detail-title">${formatTitle(field(row, 'TITLE') || 'Untitled')}</h2><p class="detail-id">Chronology ID: ${escapeHtml(field(row, 'ID') || '—')}</p></div><button id="closeDetail" class="button button-secondary" type="button">Close details ✕</button></div>
    <div class="detail-layout"><dl class="detail-meta">${meta}</dl><figure class="cover-art">${cover ? `<img src="${escapeHtml(cover)}" alt="Cover art for ${escapeHtml(field(row, 'TITLE') || 'this item')}" loading="lazy"><figcaption>Cover art</figcaption>` : `<div class="cover-placeholder">No cover art supplied yet.<br><span>Add a direct image URL in the <strong>COVER ART</strong> column.</span></div>`}</figure></div>
    <section class="synopsis-section" aria-labelledby="synopsisHeading"><h3 id="synopsisHeading">Synopsis</h3><p class="synopsis-text">${synopsisContent}</p></section>`;
  if (!$('detailPanel').open) $('detailPanel').showModal();
  $('closeDetail').addEventListener('click', () => $('detailPanel').close());
  const img = $('detailPanel').querySelector('img');
  if (img) img.addEventListener('error', () => { const figure = img.closest('figure'); figure.innerHTML = '<div class="cover-placeholder detail-error">Cover art could not be loaded. Check that the URL points directly to a publicly accessible image.</div>'; }, { once: true });
}
async function loadCatalogue({ manual = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  $('refreshButton').disabled = true;
  $('refreshButton').textContent = 'Refreshing…';
  $('statusText').textContent = 'Connecting to Google Sheets…';
  try {
    const response = await fetch(`${CSV_URL}${CSV_URL.includes('?') ? '&' : '?'}_=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Google Sheets returned HTTP ${response.status}`);
    const text = await response.text();
    if (!text.trim() || !text.includes(',')) throw new Error('The published sheet did not return a CSV file.');
    const parsed = parseCSV(text);
    if (!parsed.records.length || !parsed.headers.length) throw new Error('The CSV appears to be empty.');
    state.headers = parsed.headers;
    state.rows = parsed.records.filter(row => !isExcluded(row));
    localStorage.setItem(CACHE_KEY, text);
    populateFilters();
    renderCatalogue();
    $('statusText').textContent = `Connected to Google Sheets · Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if ($('detailPanel').open && state.selected) {
      const selectedId = field(state.selected, 'ID');
      const refreshed = state.rows.find(r => field(r, 'ID') === selectedId);
      if (refreshed) showDetail(refreshed); else $('detailPanel').close();
    }
  } catch (error) {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = parseCSV(cached);
      state.headers = parsed.headers;
      state.rows = parsed.records.filter(row => !isExcluded(row));
      populateFilters(); renderCatalogue();
      $('statusText').textContent = `Offline copy · Could not refresh from Google Sheets (${error.message})`;
    } else {
      $('statusText').textContent = `Could not load catalogue: ${error.message}. Check that the sheet is published as CSV and try again.`;
      $('catalogue').innerHTML = '<div class="empty-state">The catalogue could not be loaded. Check your connection, then select <strong>Refresh catalogue</strong>.</div>';
    }
  } finally {
    state.loading = false;
    $('refreshButton').disabled = false;
    $('refreshButton').innerHTML = '<span aria-hidden="true">↻</span> Refresh catalogue';
  }
}
['searchInput', 'groupFilter', 'eraFilter', 'rangeFilter', 'doctorFilter', 'libraryFilter'].forEach(id => $(id).addEventListener(id === 'searchInput' ? 'input' : 'change', renderCatalogue));
$('detailPanel').addEventListener('close', () => { state.selected = null; });
$('detailPanel').addEventListener('click', event => { if (event.target === $('detailPanel')) $('detailPanel').close(); });
$('refreshButton').addEventListener('click', () => loadCatalogue({ manual: true }));
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
loadCatalogue();
