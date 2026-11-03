'use strict';

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRHeYBfAFZj_bhEH4ncnGPwccoF8JaAxsRYzuaeJguThQXLWldk87ewRZhrwm5eH5yZs_iKCdBx3pEf/pub?output=csv';
const CACHE_KEY = 'dw-chronology-csv-v5';
// Set this to the published CSV URL for the RANGE COLOURS tab. See README.md.
const RANGE_COLOURS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRHeYBfAFZj_bhEH4ncnGPwccoF8JaAxsRYzuaeJguThQXLWldk87ewRZhrwm5eH5yZs_iKCdBx3pEf/pub?gid=92377743&single=true&output=csv';
const $ = (id) => document.getElementById(id);
const savedViewMode = localStorage.getItem('dw-chronology-view-mode') || (localStorage.getItem('dw-chronology-compact-view') === 'true' ? 'compact' : 'standard');
const state = { rows: [], headers: [], selected: null, loading: false, rangeColours: new Map(), viewMode: ['standard', 'compact', 'covers'].includes(savedViewMode) ? savedViewMode : 'standard' };

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
  // Keep TBD and other placeholder IDs excluded. En-dash IDs are visible but styled as unresolved.
  return id.includes('TBD') || id.includes('—') || id === '-';
}
// Supports both the original flat sheet and the new editing layout, where GROUP
// and ERA are dedicated heading rows and subsequent catalogue records leave them blank.
function normalizeCatalogueRows(records) {
  let currentGroup = '';
  let currentEra = '';
  let groupSection = 0;
  let eraSection = 0;
  const output = [];
  for (const source of records) {
    const row = { ...source };
    const group = field(row, 'GROUP');
    const era = field(row, 'ERA');
    const id = field(row, 'ID');
    const title = field(row, 'TITLE');

    // Dedicated GROUP heading rows always begin a new section, even when the
    // same group name appeared earlier in the sheet.
    if (!id && !title && group) {
      currentGroup = group;
      currentEra = '';
      groupSection++;
      eraSection++;
      continue;
    }
    if (!id && !title && era) {
      currentEra = era;
      eraSection++;
      continue;
    }
    // Ignore fully empty/non-catalogue rows.
    if (!id && !title) continue;

    // Also support flat sheets: a changed GROUP or ERA value starts a new
    // consecutive section. Repeated names later in the sheet remain distinct.
    if (group && group !== currentGroup) {
      currentGroup = group;
      currentEra = '';
      groupSection++;
      eraSection++;
    }
    if (era && era !== currentEra) {
      currentEra = era;
      eraSection++;
    }

    const groupKey = Object.keys(row).find(k => normalizeHeader(k) === 'GROUP') || 'GROUP';
    const eraKey = Object.keys(row).find(k => normalizeHeader(k) === 'ERA') || 'ERA';
    if (!group) row[groupKey] = currentGroup;
    if (!era) row[eraKey] = currentEra;

    // Internal section markers preserve the exact sequence of heading blocks.
    row.__groupSection = groupSection;
    row.__eraSection = eraSection;
    output.push(row);
  }
  return output;
}
function naturalCompare(a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }); }
function uniqueValues(rows, name) {
  return [...new Set(rows.map(r => field(r, name)).filter(Boolean))].sort(naturalCompare);
}
// Writer and publisher cells may contain several credits separated by semicolons.
// Treat each trimmed credit as its own searchable term while preserving the
// original combined value for display in the details pop-up.
function splitCredits(value) {
  return String(value ?? '').split(';').map(name => name.trim()).filter(Boolean);
}
// Accept common variants of the writer column heading so the separate writer
// search still works if the sheet labels the field WRITERS, AUTHOR, etc.
function writerCredits(row) {
  const aliases = ['WRITER', 'WRITERS', 'AUTHOR', 'AUTHORS', 'SCRIPT WRITER', 'SCRIPTWRITER', 'WRITTEN BY'];
  for (const name of aliases) {
    const key = Object.keys(row).find(k => normalizeHeader(k) === name);
    if (key && String(row[key] ?? '').trim()) return splitCredits(row[key]);
  }
  return [];
}

// Editable range-to-colour associations are loaded from a second published CSV tab.
function normalizeHexColour(value) {
  let hex = String(value ?? '').trim();
  if (!hex) return '';
  if (!hex.startsWith('#')) hex = `#${hex}`;
  if (/^#[0-9a-f]{3}$/i.test(hex)) hex = '#' + [...hex.slice(1)].map(ch => ch + ch).join('');
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toUpperCase() : '';
}
function darkenHexColour(hex, factor = 0.34) {
  const normalized = normalizeHexColour(hex);
  if (!normalized) return '';
  const channels = [1, 3, 5].map(i => Math.round(parseInt(normalized.slice(i, i + 2), 16) * factor));
  return '#' + channels.map(value => value.toString(16).padStart(2, '0')).join('');
}
function normalizeRangeName(value) {
  return String(value ?? '').normalize('NFKC').replace(/\\s+/g, ' ').trim().toLocaleLowerCase();
}
function rangeColour(row) {
  return state.rangeColours.get(normalizeRangeName(field(row, 'RANGE'))) || '';
}
function titleColourStyle(row) {
  const colour = rangeColour(row);
  return colour ? ` style="--range-colour:${colour}"` : '';
}
async function loadRangeColours() {
  if (!RANGE_COLOURS_CSV_URL) return;
  try {
    const response = await fetch(`${RANGE_COLOURS_CSV_URL}${RANGE_COLOURS_CSV_URL.includes('?') ? '&' : '?'}_=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Range colour sheet returned HTTP ${response.status}`);
    const parsed = parseCSV(await response.text());
    const next = new Map();
    for (const row of parsed.records) {
      const name = field(row, 'RANGE');
      const colour = normalizeHexColour(field(row, 'COLOUR'));
      if (name && colour) next.set(normalizeRangeName(name), colour);
    }
    state.rangeColours = next;
    console.info(`Range colours loaded: ${next.size} valid mappings`, [...next.entries()]);
    if (!next.size) console.warn('Range colour CSV loaded, but no valid RANGE/COLOUR mappings were found. Check the published tab headers and hex values.');
  } catch (error) {
    console.warn('Could not load range colour associations:', error);
  }
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
  const writers = [...new Set(state.rows.flatMap(row => writerCredits(row)))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  setOptions($('writerFilter'), writers, 'All writers');
}
function filteredRows() {
  const q = $('searchInput').value.trim().toLocaleLowerCase();
  const writerQuery = $('writerFilter').value.trim().toLocaleLowerCase();
  return state.rows.filter(row => {
    if ($('groupFilter').value && field(row, 'GROUP') !== $('groupFilter').value) return false;
    if ($('eraFilter').value && field(row, 'ERA') !== $('eraFilter').value) return false;
    if ($('rangeFilter').value && field(row, 'RANGE') !== $('rangeFilter').value) return false;
    if ($('doctorFilter').value && field(row, 'DOCTOR') !== $('doctorFilter').value) return false;
    if ($('libraryFilter').value && field(row, 'LIBRARY') !== $('libraryFilter').value) return false;
    if (writerQuery && !writerCredits(row).some(name => name.toLocaleLowerCase() === writerQuery)) return false;
    if (q) {
      const haystack = [
        field(row, 'ID'), field(row, 'TITLE'), field(row, 'GROUP'), field(row, 'ERA'),
        field(row, 'RANGE'), field(row, 'RELEASE'), field(row, 'LIBRARY'),
        field(row, 'RELEASE DATE'), field(row, 'DOCTOR'),
        ...writerCredits(row),
        ...splitCredits(field(row, 'PUBLISHER')),
        field(row, 'SYNOPSIS')
      ].join(' ').toLocaleLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}
function renderCatalogue() {
  const rows = filteredRows();
  $('countText').textContent = `${rows.length.toLocaleString()} item${rows.length === 1 ? '' : 's'}`;
  if (!rows.length) {
    $('catalogue').innerHTML = '<div class="empty-state">No catalogue entries match those filters.</div>';
    return;
  }
  // Build consecutive Group > Era sections in source-sheet order.
  // Do not use a global Map keyed by the displayed names: a group or era name
  // may legitimately appear again later and must remain a separate section.
  const groups = [];
  let currentGroup = null;
  let currentEra = null;
  for (const row of rows) {
    const groupName = field(row, 'GROUP') || 'Uncategorised';
    const eraName = field(row, 'ERA') || 'Unspecified era';
    const groupKey = row.__groupSection ?? groupName;
    const eraKey = row.__eraSection ?? eraName;

    if (!currentGroup || currentGroup.key !== groupKey) {
      currentGroup = { key: groupKey, name: groupName, eras: [] };
      groups.push(currentGroup);
      currentEra = null;
    }
    if (!currentEra || currentEra.key !== eraKey) {
      currentEra = { key: eraKey, name: eraName, rows: [] };
      currentGroup.eras.push(currentEra);
    }
    currentEra.rows.push(row);
  }
  $('catalogue').innerHTML = groups.map(group => `
    <section class="group-section">
      <div class="group-heading"><p class="eyebrow">CHRONOLOGY GROUP</p><h2>${escapeHtml(group.name)}</h2></div>
      ${group.eras.map(era => `
        <div class="era-block">
          <div class="era-heading"><span>${escapeHtml(era.name)}</span><span class="era-count">${era.rows.length} item${era.rows.length === 1 ? '' : 's'}</span></div>
          <div class="table-wrap"><table class="catalogue-table${state.viewMode !== 'standard' ? ' compact-table' : ''}">
            ${state.viewMode === 'compact'
              ? '<colgroup><col style="width:18%"><col style="width:82%"></colgroup>'
              : state.viewMode === 'covers'
                ? '<colgroup><col style="width:76px"><col style="width:auto"></colgroup>'
                : '<colgroup><col style="width:8%"><col style="width:25%"><col style="width:16%"><col style="width:15%"><col style="width:16%"><col style="width:20%"></colgroup>'}
            <thead><tr>${state.viewMode === 'compact'
              ? '<th scope="col">ID</th><th scope="col">Title</th>'
              : state.viewMode === 'covers'
                ? '<th scope="col">Cover</th><th scope="col">Title</th>'
                : '<th scope="col">ID</th><th scope="col">Title</th><th scope="col">Range</th><th scope="col">Release</th><th scope="col">Library</th><th scope="col">Release date</th>'}</tr></thead>
            <tbody>${era.rows.map(row => `<tr class="${field(row, 'ID').includes('–') && !normalizeRangeName(field(row, 'RANGE')).includes('occurs here') ? 'unresolved-id' : ''}">
              ${state.viewMode === 'covers'
                ? `<td class="cover-thumb-cell"><button type="button" class="cover-thumb-button" data-record-id="${escapeHtml(field(row, 'ID'))}" aria-label="Open details for ${escapeHtml(field(row, 'TITLE') || 'this item')}">${(safeImageUrl(field(row, 'COVER ART')) || safeImageUrl(field(row, 'COVERART')) || safeImageUrl(field(row, 'COVER'))) ? `<img class="cover-thumb" src="${escapeHtml(safeImageUrl(field(row, 'COVER ART')) || safeImageUrl(field(row, 'COVERART')) || safeImageUrl(field(row, 'COVER')))}" alt="" loading="lazy">` : '<span class="cover-thumb-placeholder" aria-hidden="true"><span>NO<br>COVER</span></span>'}</button></td>`
                : state.viewMode === 'compact'
                  ? `<td class="id-cell">${escapeHtml(field(row, 'ID') || '—')}</td>`
                  : `<td class="id-cell">${escapeHtml(field(row, 'ID') || '—')}</td>`}
              <td><button type="button" class="title-button"${titleColourStyle(row)} data-record-id="${escapeHtml(field(row, 'ID'))}">${formatTitle(field(row, 'TITLE') || 'Untitled')}</button></td>
              ${state.viewMode === 'standard' ? `<td>${field(row, 'RANGE') ? `<span class="tag"${rangeColour(row) ? ` style="--range-colour:${rangeColour(row)};--range-bg:${darkenHexColour(rangeColour(row))}"` : ''}>${escapeHtml(field(row, 'RANGE'))}</span>` : '—'}</td>` : ''}
              ${state.viewMode === 'standard' ? `<td>${escapeHtml(field(row, 'RELEASE') || '—')}</td>
              <td>${escapeHtml(field(row, 'LIBRARY') || '—')}</td>
              <td>${escapeHtml(field(row, 'RELEASE DATE') || '—')}</td>` : ''}
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
function resetDetailPalette() {
  const panel = $('detailPanel');
  panel.style.setProperty('--detail-bg', '#12213d');
  panel.style.setProperty('--detail-surface', '#172846');
  panel.style.setProperty('--detail-border', '#2a3b59');
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  return { h: (h + 360) % 360, s: s * 100, l: l * 100 };
}
function applyCoverPalette(image) {
  try {
    const canvas = document.createElement('canvas');
    const size = 36;
    canvas.width = size; canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.drawImage(image, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size).data;
    const hueBins = Array.from({ length: 12 }, () => ({ count: 0, h: 0, s: 0 }));
    let greyCount = 0, greyL = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 180) continue;
      const color = rgbToHsl(pixels[i], pixels[i + 1], pixels[i + 2]);
      // Ignore near-black and near-white pixels when selecting the cover's accent hue.
      if (color.l > 7 && color.l < 91 && color.s >= 13) {
        const index = Math.floor(color.h / 30) % 12;
        hueBins[index].count++;
        hueBins[index].h += color.h;
        hueBins[index].s += color.s;
      } else {
        greyCount++;
        greyL += color.l;
      }
    }
    const dominant = hueBins.reduce((best, bin) => bin.count > best.count ? bin : best, { count: 0, h: 0, s: 0 });
    let hue = dominant.count ? dominant.h / dominant.count : 215;
    // Keep a hint of the artwork's hue, but deliberately keep the modal dark and readable.
    let saturation = dominant.count ? Math.max(22, Math.min(48, dominant.s / dominant.count * 0.8)) : 28;
    if (dominant.count < 8 && greyCount > size * size * 0.65) { hue = 215; saturation = 28; }
    const panel = $('detailPanel');
    panel.style.setProperty('--detail-bg', `hsl(${Math.round(hue)} ${Math.round(saturation)}% 9%)`);
    panel.style.setProperty('--detail-surface', `hsl(${Math.round(hue)} ${Math.round(saturation)}% 13%)`);
    panel.style.setProperty('--detail-border', `hsl(${Math.round(hue)} ${Math.round(Math.min(42, saturation + 4))}% 25%)`);
  } catch (_) {
    // Canvas sampling can be blocked by cross-origin image hosts. Keep the default navy palette.
  }
}
function sampleCoverPalette(url) {
  if (!url) return;
  // Use a separate CORS-enabled image for sampling so a host that blocks canvas access
  // cannot prevent the regular cover image from displaying in the modal.
  const sampler = new Image();
  sampler.crossOrigin = 'anonymous';
  sampler.onload = () => applyCoverPalette(sampler);
  sampler.onerror = () => {}; // Graceful fallback: the modal remains navy.
  sampler.src = url;
}
function showDetail(row) {
  state.selected = row;
  resetDetailPalette();
  const details = ['DOCTOR', 'ID', 'GROUP', 'ERA', 'RANGE', 'RELEASE', 'RELEASE DATE', 'WRITER', 'PUBLISHER', 'COLLECTION', 'LIBRARY'];
  const cover = safeImageUrl(field(row, 'COVER ART')) || safeImageUrl(field(row, 'COVERART')) || safeImageUrl(field(row, 'COVER'));
  const meta = details.map(name => {
    const value = field(row, name);
    const label = name === 'RELEASE DATE' ? 'Release date' : name[0] + name.slice(1).toLowerCase();
    if (name === 'COLLECTION') {
      const collections = splitCredits(value);
      return `<div class="meta-item"><dt>Collection</dt><dd>${collections.length ? collections.map(item => `<span class="tag collection-tag">${escapeHtml(item)}</span>`).join(' ') : '—'}</dd></div>`;
    }
    if (name === 'LIBRARY') {
      const status = value.toLocaleLowerCase();
      const statusClass = status === 'yes' ? 'library-status-yes' : status === 'no' ? 'library-status-no' : status === 'cd only' ? 'library-status-cd' : '';
      return `<div class="meta-item"><dt>${label}</dt><dd>${value ? `<span class="library-status ${statusClass}">${escapeHtml(value)}</span>` : '—'}</dd></div>`;
    }
    if (name === 'RANGE' && value) {
      const colour = rangeColour(row);
      const pillStyle = colour ? ` style="--range-colour:${colour};--range-bg:${darkenHexColour(colour)}"` : '';
      return `<div class="meta-item"><dt>${escapeHtml(label)}</dt><dd><span class="tag"${pillStyle}>${escapeHtml(value)}</span></dd></div>`;
    }
    return `<div class="meta-item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || '—')}</dd></div>`;
  }).join('');
  const synopsis = field(row, 'SYNOPSIS');
  const synopsisContent = synopsis ? escapeHtml(synopsis).replace(/\r?\n/g, '<br>') : '<span class="synopsis-empty">No synopsis supplied yet. Add text to the <strong>SYNOPSIS</strong> column in your Google Sheet.</span>';
  $('detailPanel').innerHTML = `
    <section class="detail-hero" aria-labelledby="detailTitle">
      ${cover ? `<img class="detail-hero-image" src="${escapeHtml(cover)}" alt="Cover art for ${escapeHtml(field(row, 'TITLE') || 'this item')}" loading="eager">` : `<div class="detail-hero-placeholder">No cover art supplied yet.<span>Add a direct image URL in the COVER ART column.</span></div>`}
      <div class="detail-hero-shade" aria-hidden="true"></div>
      <div class="detail-top"><p class="detail-kicker">${escapeHtml(field(row, 'DOCTOR') || 'Doctor Who')} · Catalogue entry</p><button id="closeDetail" class="button button-secondary" type="button" aria-label="Close details">✕</button></div>
      <header class="detail-heading"${titleColourStyle(row)}><h2 id="detailTitle" class="detail-title">${formatTitle(field(row, 'TITLE') || 'Untitled')}</h2></header>
    </section>
    <div class="detail-content">
      ${field(row, 'QUOTE') ? `<blockquote class="story-quote">${escapeHtml(field(row, 'QUOTE')).replace(/\\r?\\n/g, '<br>')}</blockquote>` : ''}
      <section class="synopsis-section" aria-labelledby="synopsisHeading"><h3 id="synopsisHeading">Synopsis</h3><p class="synopsis-text">${synopsisContent}</p></section>
      <div class="detail-divider" role="separator" aria-hidden="true"></div>
      <section class="story-details" aria-labelledby="storyDetailsHeading"><h3 id="storyDetailsHeading">Story details</h3><dl class="detail-meta">${meta}</dl></section>
    </div>`;
  if (!$('detailPanel').open) $('detailPanel').showModal();
  $('closeDetail').addEventListener('click', () => $('detailPanel').close());
  const img = $('detailPanel').querySelector('img');
  if (img) img.addEventListener('error', () => { const figure = img.closest('figure'); figure.innerHTML = '<div class="cover-placeholder detail-error">Cover art could not be loaded. Check that the URL points directly to a publicly accessible image.</div>'; }, { once: true });
  sampleCoverPalette(cover);
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
    state.rows = normalizeCatalogueRows(parsed.records).filter(row => !isExcluded(row));
    await loadRangeColours();
    localStorage.setItem(CACHE_KEY, text);
    populateFilters();
    renderCatalogue();
    const hasWriterColumn = state.headers.some(h => ['WRITER', 'WRITERS', 'AUTHOR', 'AUTHORS', 'SCRIPT WRITER', 'SCRIPTWRITER', 'WRITTEN BY'].includes(normalizeHeader(h)));
    const colourStatus = state.rangeColours.size
      ? ` · ${state.rangeColours.size} range colours loaded`
      : ' · no range colours loaded (check RANGE COLOURS tab publication)';
    $('statusText').textContent = (hasWriterColumn
      ? `Connected to Google Sheets · Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : 'Connected, but writer search has no data: add a WRITER column to the published sheet, then republish it.') + colourStatus;
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
      state.rows = normalizeCatalogueRows(parsed.records).filter(row => !isExcluded(row));
      await loadRangeColours();
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
['writerFilter', 'groupFilter', 'eraFilter', 'rangeFilter', 'doctorFilter', 'libraryFilter'].forEach(id => $(id).addEventListener('change', renderCatalogue));
$('searchInput').addEventListener('input', renderCatalogue);
$('viewModeSelect').value = state.viewMode;
$('viewModeSelect').addEventListener('change', () => {
  state.viewMode = $('viewModeSelect').value;
  localStorage.setItem('dw-chronology-view-mode', state.viewMode);
  localStorage.setItem('dw-chronology-compact-view', String(state.viewMode === 'compact'));
  renderCatalogue();
});
$('detailPanel').addEventListener('close', () => { state.selected = null; });
$('detailPanel').addEventListener('click', event => { if (event.target === $('detailPanel')) $('detailPanel').close(); });
$('refreshButton').addEventListener('click', () => loadCatalogue({ manual: true }));
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
loadCatalogue();
