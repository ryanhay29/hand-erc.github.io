/* === Config (tailored to your CSV headers) === */
const CSV_PATH = window.CSV_PATH || "./data/commercial-robot-hands.csv";

// Exact column names in your CSV
const COL = {
  ACTUATORS: "# Actuators",
  NAME: "Hand name",
  COMPANY: "Company name",
  LINK: "Link to hand page",
  DESC: "Text description (important basic facts, things we particularly care about, and differentiating points, not all details)",
  PHOTO_FILE: "Photo filename (coming soon)",
  DATE_ADDED: "Date added",
  NOTES: "notes",
};

// If PHOTO_FILE has a filename, look for it in /assets/img/<filename>
const imageFromPhotoColumn = (v) => {
  v = (v ?? "").trim();
  if (!v) return "";
  // If the cell already contains a full URL, use it. Otherwise build a repo path.
  if (/^https?:\/\//i.test(v)) return v;
  return `./assets/img/${v}`;
};

/* === State & DOM === */
let rawRows = [];
let viewRows = [];
let columns = [];
let sortBy = null; // {key, dir: 1|-1}
let page = 1;
let perPage = 50;

const thead = document.getElementById("thead");
const tbody = document.getElementById("tbody");
const qInput = document.getElementById("q");
const pager  = document.getElementById("pager");
const rowsPerPage = document.getElementById("rows-per-page");
const toggleImages = document.getElementById("toggle-images");

/* === Utils === */
const debounce = (fn, ms=200) => { let t; return (...a) => { clearTimeout(t); t=setTimeout(() => fn(...a), ms); }; };
const isNumeric = (v) => v !== "" && !isNaN(v) && isFinite(Number(v));
const norm = (s) => (s ?? "").toString().trim();

/* === Rendering === */
function renderHeader() {
  // Removed Website + Notes from the header list
  const headers = [
    { key: "_image", label: "Image" },
    { key: COL.NAME, label: "Hand name" },
    { key: COL.COMPANY, label: "Company" },
    { key: COL.ACTUATORS, label: "# Actuators" },
    { key: COL.DESC, label: "Description" },
    { key: COL.DATE_ADDED, label: "Date added" },
  ];

  thead.innerHTML = "<tr>" + headers.map(h => {
    if (h.key === "_image" && toggleImages && !toggleImages.checked) return "";
    const arrow = (sortBy?.key === h.key) ? (sortBy.dir === 1 ? "▲" : "▼") : "";
    return `<th data-key="${h.key}">${h.label}<span class="sort">${arrow}</span></th>`;
  }).join("") + "</tr>";

  // click to sort (no sorting on the image pseudo-column)
  thead.querySelectorAll("th").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (!key || key === "_image") return;
      if (sortBy?.key === key) sortBy.dir = -sortBy.dir;
      else sortBy = { key, dir: 1 };
      applyTransforms(); render();
    });
  });
}

function renderBody() {
  const start = (page - 1) * perPage;
  const rows  = viewRows.slice(start, start + perPage);

  tbody.innerHTML = rows.map(r => {
    const name = norm(r[COL.NAME]);
    const company = norm(r[COL.COMPANY]);
    const actuators = norm(r[COL.ACTUATORS]);
    const link = norm(r[COL.LINK]);  // we'll use this to wrap the name
    const desc = norm(r[COL.DESC]);
    const dateAdded = norm(r[COL.DATE_ADDED]);

    const imgUrl = imageFromPhotoColumn(r[COL.PHOTO_FILE]);
    const imgCell = (toggleImages && !toggleImages.checked) ? "" :
      `<td>${imgUrl ? `<img class="thumb" src="${imgUrl}" alt="" loading="lazy" onerror="this.style.display='none';">` : ""}</td>`;

    const companyCell = company
      ? (company.length <= 24 ? `<span class="badge gray">${company}</span>` : company)
      : "";

    // NEW: make the hand name itself the link; if no link, just show the text
    const nameCell = link
      ? `<a href="${link}" target="_blank" rel="noopener">${name}</a>`
      : name;

    // Removed the "Website" column entirely and hid "Notes"
    return `<tr>
      ${imgCell}
      <td>${nameCell}</td>
      <td>${companyCell}</td>
      <td>${actuators}</td>
      <td class="wide">${desc}</td>
      <td>${dateAdded}</td>
    </tr>`;
  }).join("");
}

function renderPager() {
  const total = viewRows.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (page > pages) page = pages;

  const mk = (label, p, disabled=false) =>
    `<button ${disabled ? "disabled" : ""} data-page="${p}">${label}</button>`;

  pager.innerHTML = [
    mk("« First", 1, page === 1),
    mk("‹ Prev",  Math.max(1, page - 1), page === 1),
    `<span class="small muted" style="padding:.35rem .6rem">Page ${page} of ${pages} • ${total} rows</span>`,
    mk("Next ›",  Math.min(pages, page + 1), page === pages),
    mk("Last »",  pages, page === pages),
  ].join("");

  pager.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = Number(btn.dataset.page);
      if (p && p !== page) { page = p; renderBody(); renderPager(); }
    });
  });
}

function render() {
  renderHeader();
  renderBody();
  renderPager();
}

/* === Transforms === */
function applyTransforms() {
  const needle = norm(qInput.value).toLowerCase();

  // Filter across visible/important fields
  viewRows = rawRows.filter(r => {
    if (!needle) return true;
    const hay = [
      r[COL.NAME], r[COL.COMPANY], r[COL.DESC], r[COL.DATE_ADDED],
      // you can add r[COL.NOTES] here if you want search to include the hidden notes
    ].map(v => norm(v).toLowerCase()).join(" ");
    return hay.includes(needle);
  });

  // Sort (works on any visible column key)
  if (sortBy) {
    const { key, dir } = sortBy;
    viewRows.sort((a, b) => {
      const av = norm(a[key]);
      const bv = norm(b[key]);
      const an = isNumeric(av), bn = isNumeric(bv);
      if (an && bn) return (Number(av) - Number(bv)) * dir;
      return av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" }) * dir;
    });
  }
}

/* === Init === */
function initEvents() {
  qInput.addEventListener("input", debounce(() => { page = 1; applyTransforms(); render(); }, 120));
  rowsPerPage.addEventListener("change", () => { perPage = Number(rowsPerPage.value) || 50; page = 1; render(); });
  toggleImages.addEventListener("change", () => { render(); });
}

async function loadCSV() {
  const res = await fetch(CSV_PATH, { cache: "no-store" });
  const text = await res.text();
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });

  columns = parsed.meta.fields || [];
  rawRows = parsed.data.map(obj => {
    const out = {};
    columns.forEach(k => out[k] = norm(obj[k]));
    return out;
  });

  applyTransforms();
  render();
}

initEvents();
loadCSV().catch(err => {
  console.error("Failed to load CSV:", err);
  thead.innerHTML = "";
  tbody.innerHTML = `<tr><td>Failed to load <code>${CSV_PATH}</code>. Check the path and that GitHub Pages is enabled.</td></tr>`;
});
