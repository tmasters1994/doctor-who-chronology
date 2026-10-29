const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRHeYBfAFZj_bhEH4ncnGPwccoF8JaAxsRYzuaeJguThQXLWldk87ewRZhrwm5eH5yZs_iKCdBx3pEf/pub?output=csv";
const CACHE_KEY = "doctor-who-chronology-csv-v2";
const $ = id => document.getElementById(id);
let rows = [], columns = [];
const filterIds = { GROUP: "groupFilter", ERA: "eraFilter", RANGE: "rangeFilter", LIBRARY: "libraryFilter" };

function parseCSV(text) {
  const out = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell.length === 0) quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell.replace(/\r$/, "")); out.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, "")); out.push(row); }
  while (out.length && out[out.length - 1].every(v => !String(v).trim())) out.pop();
  if (!out.length) return { columns: [], rows: [] };
  const headers = out.shift().map((h, i) => h.trim() || `Column ${i + 1}`);
  const data = out.filter(r => r.some(v => String(v).trim())).map((r, index) => {
    const obj = { __index: index };
    headers.forEach((h, i) => obj[h] = (r[i] ?? "").trim());
    return obj;
  });
  return { columns: headers, rows: data };
}
const val = x => String(x ?? "");
const esc = x => val(x).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
function titleColumn() {
  return columns.find(c => /^TITLE$/i.test(c)) ||
    columns.find(c => /title|name|story|episode|item|serial|entry/i.test(c)) || columns[0];
}
function visibleRows() {
  const query = $("searchInput").value.trim().toLocaleLowerCase();
  return rows.filter(r => {
    const textMatch = !query || columns.some(c => val(r[c]).toLocaleLowerCase().includes(query));
    const filterMatch = Object.entries(filterIds).every(([col, id]) => {
      const selected = $(id).value;
      return !selected || val(r[col]) === selected;
    });
    return textMatch && filterMatch;
  }).sort((a,b) => {
    const key = $("sortSelect").value;
    if (key === "default") return a.__index - b.__index;
    return val(a[key]).localeCompare(val(b[key]), undefined, {numeric:true, sensitivity:"base"});
  });
}
function populateFilters() {
  for (const [column, id] of Object.entries(filterIds)) {
    const select = $(id);
    const previous = select.value;
    const firstLabel = ({GROUP:"All groups", ERA:"All eras", RANGE:"All ranges", LIBRARY:"All records"})[column];
    select.replaceChildren(new Option(firstLabel, ""));
    if (!columns.includes(column)) {
      select.disabled = true;
      continue;
    }
    select.disabled = false;
    [...new Set(rows.map(r => val(r[column])).filter(Boolean))]
      .sort((a,b) => a.localeCompare(b, undefined, {numeric:true, sensitivity:"base"}))
      .forEach(value => select.add(new Option(value, value)));
    if ([...select.options].some(o => o.value === previous)) select.value = previous;
  }
}
function populateSort() {
  const select = $("sortSelect"), previous = select.value;
  select.replaceChildren(new Option("Sheet order", "default"));
  columns.forEach(col => select.add(new Option(col, col)));
  if ([...select.options].some(o => o.value === previous)) select.value = previous;
}
function setStatus(message, error = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}
function render() {
  const list = visibleRows(), titleCol = titleColumn();
  const subCol = columns.find(c => c === "ERA") || columns.find(c => c === "GROUP") || columns.find(c => c !== titleCol);
  $("recordCount").textContent = `${rows.length.toLocaleString()} RECORDS`;
  $("resultSummary").textContent = `${list.length} SHOWN`;
  const container = $("records"); container.replaceChildren();
  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = rows.length ? "No records match these filters." : "No records found in the published sheet.";
    container.appendChild(empty); return;
  }
  const idCol = columns.find(c => c.trim().toUpperCase() === "ID");
  list.forEach((record, index) => {
    const button = document.createElement("button");
    button.type = "button"; button.className = "record";
    const title = val(record[titleCol]) || "(Untitled record)";
    const subtitle = subCol ? val(record[subCol]) : "";
    const category = [record.GROUP, record.RANGE].filter(Boolean).join(" · ");
    // Show the catalogue's ID code at the far left instead of a generated row number.
    const leftLabel = idCol && val(record[idCol]) ? val(record[idCol]) : String(index + 1).padStart(2, "0");
    button.innerHTML = `<span class="record-index">${esc(leftLabel)}</span><span><span class="record-title">${esc(title)}</span>${subtitle && subtitle !== title ? `<span class="record-subtitle">${esc(subtitle)}</span>` : ""}</span><span class="record-category">${esc(category)}</span><span class="record-arrow" aria-hidden="true">↗</span>`;
    button.addEventListener("click", () => showDetails(record, titleCol));
    container.appendChild(button);
  });
}
function showDetails(record, titleCol) {
  const content = $("detailContent"); content.replaceChildren();
  const title = document.createElement("h2");
  title.className = "detail-title"; title.textContent = val(record[titleCol]) || "(Untitled record)";
  content.appendChild(title);
  const dl = document.createElement("dl"); dl.className = "detail-fields";
  columns.forEach(col => {
    const value = val(record[col]); if (!value) return;
    const wrap = document.createElement("div"); wrap.className = "detail-field";
    const dt = document.createElement("dt"); dt.textContent = col;
    const dd = document.createElement("dd"); dd.textContent = value;
    wrap.append(dt, dd); dl.appendChild(wrap);
  });
  content.appendChild(dl);
  const dialog = $("detailDialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}
async function loadData() {
  const btn = $("refreshBtn"); btn.disabled = true; btn.innerHTML = '<span aria-hidden="true">↻</span> Loading…';
  setStatus("Loading chronology from Google Sheets…");
  try {
    const url = new URL(CSV_URL); url.searchParams.set("_refresh", String(Date.now()));
    const response = await fetch(url, {cache:"no-store"});
    if (!response.ok) throw new Error(`CSV feed returned ${response.status}`);
    const csv = await response.text();
    if (!csv.trim() || /<html|<!doctype/i.test(csv.slice(0,200))) throw new Error("The published URL did not return CSV.");
    const parsed = parseCSV(csv);
    if (!parsed.columns.length) throw new Error("No column headings found.");
    columns = parsed.columns;
    // Rows with TBD in the ID field are placeholders and remain in Sheets,
    // but are not displayed in the app until they receive a definitive ID.
    rows = parsed.rows.filter(r => !/TBD/i.test(val(r.ID)));
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({csv, fetchedAt:Date.now()})); } catch {}
    populateFilters(); populateSort(); render();
    $("updatedAt").textContent = `UPDATED ${new Date().toLocaleString([], {dateStyle:"medium", timeStyle:"short"})}`;
    setStatus("");
  } catch (error) {
    let cached = null; try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch {}
    if (cached?.csv) {
      const parsed = parseCSV(cached.csv); columns = parsed.columns;
      rows = parsed.rows.filter(r => !/TBD/i.test(val(r.ID)));
      populateFilters(); populateSort(); render();
      $("updatedAt").textContent = `CACHED · ${new Date(cached.fetchedAt).toLocaleDateString()}`;
      setStatus("Couldn't refresh. Showing the last saved catalogue copy.", true);
    } else {
      setStatus("Couldn't load the spreadsheet. Check that the CSV is published, then try Refresh.", true);
      console.error(error);
    }
  } finally { btn.disabled = false; btn.innerHTML = '<span aria-hidden="true">↻</span> Refresh'; }
}
$("searchInput").addEventListener("input", render);
$("sortSelect").addEventListener("change", render);
Object.values(filterIds).forEach(id => $(id).addEventListener("change", render));
$("refreshBtn").addEventListener("click", loadData);
$("closeDialog").addEventListener("click", () => $("detailDialog").close());
$("detailDialog").addEventListener("click", e => { if (e.target === $("detailDialog")) $("detailDialog").close(); });
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(console.warn));
}
loadData();
