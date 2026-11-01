/* v1 churn scoring — RULE-BASED ONLY. No AI calls, no network, no paid services.
   Rules are transparent: every flag carries a human-readable reason.
   Reference date for uploaded CSVs = the latest last-order date IN THE FILE
   (documented, deterministic). Demo data is generated relative to today so the
   demo always reads sensibly. */

const DAY = 86400000;
const DEFAULT_PRICE = 30; // USD/month, used ONLY when the CSV has no price column. Labeled in UI.

function daysBetween(a, b) { return Math.floor((b - a) / DAY); }

function scoreSubscriber(row, refDate) {
  // row: { customer, plan, price, startDate, status, lastOrderDate }
  const status = (row.status || '').toLowerCase().trim();
  if (status === 'cancelled' || status === 'canceled' || status === 'churned') {
    return { risk: 'Churned', reason: 'Subscription already cancelled', action: '—' };
  }
  if (status === 'paused') {
    return { risk: 'Paused', reason: 'Subscription paused by customer', action: 'Offer a resume incentive' };
  }
  const last = row.lastOrderDate;
  if (!last || isNaN(last)) {
    return { risk: 'Watch', reason: 'No usable last-order date in row', action: 'Check data quality' };
  }
  let gap = daysBetween(last, refDate);
  if (gap < 0) gap = 0; // future-dated order treated as "just ordered"
  const tenure = row.startDate && !isNaN(row.startDate)
    ? daysBetween(row.startDate, refDate) : null;

  let risk, reason, action;
  if (gap <= 14)      { risk = 'Healthy'; reason = 'Ordered within the last 14 days'; action = 'No action'; }
  else if (gap <= 29) { risk = 'Watch';   reason = 'No order in 15–29 days'; action = 'Send a check-in message'; }
  else if (gap <= 45) { risk = 'Medium';  reason = 'No order in 30–45 days'; action = 'Send re-engagement email / suggest a product swap'; }
  else                { risk = 'High';    reason = 'No order in 45+ days'; action = 'Send win-back offer (discount or pause option)'; }

  // Transparent tenure bump (v1 rule): brand-new subscribers who stall early
  // churn at higher rates, so one tier up if tenure < 60 days and gap >= 15.
  if (tenure !== null && tenure < 60 && gap >= 15 && risk !== 'High') {
    const bump = { 'Watch': 'Medium', 'Medium': 'High' };
    if (bump[risk]) {
      reason += ' + new subscriber (< 60 days) — risk bumped one tier';
      risk = bump[risk];
      if (risk === 'High') action = 'Send win-back offer (discount or pause option)';
      if (risk === 'Medium') action = 'Send re-engagement email / suggest a product swap';
    }
  }
  return { risk, reason, action, gap };
}

function summarize(rows, refDate) {
  const scored = rows.map(r => ({ ...r, ...scoreSubscriber(r, refDate) }));
  const count = risk => scored.filter(s => s.risk === risk).length;
  const atRisk = scored.filter(s => s.risk === 'High' || s.risk === 'Medium');
  const mrrAtRisk = atRisk.reduce((sum, s) => sum + (s.price || DEFAULT_PRICE), 0);
  // Recoverable value assumes a 20% save rate on at-risk MRR — labeled assumption.
  const recoverable = Math.round(mrrAtRisk * 0.20);
  return { scored, total: scored.length, high: count('High'), medium: count('Medium'),
    watch: count('Watch'), healthy: count('Healthy'), paused: count('Paused'),
    churned: count('Churned'), mrrAtRisk, recoverable, atRisk: atRisk.length };
}

// ---------- demo data (relative to today, so the demo never goes stale) ----------
function demoRows() {
  const ago = d => new Date(Date.now() - d * DAY);
  const spec = [
    ['Ava Martinez', 'Glow Monthly', 29, 210, 'active', 3],
    ['Liam Chen', 'Protein+', 49, 180, 'active', 8],
    ['Sophia Rao', 'Meal Kit', 79, 95, 'active', 18],
    ['Noah Kim', 'Pet Food', 39, 140, 'active', 24],
    ['Mia Patel', 'Glow Monthly', 29, 40, 'active', 22],
    ['Ethan Wright', 'Protein+', 49, 300, 'active', 33],
    ['Isla Singh', 'Meal Kit', 79, 120, 'active', 38],
    ['Lucas Meyer', 'Pet Food', 39, 65, 'active', 41],
    ['Amara Osei', 'Glow Monthly', 29, 200, 'active', 52],
    ['Jonas Weber', 'Protein+', 49, 90, 'active', 67],
    ['Priya Nair', 'Meal Kit', 79, 160, 'paused', 30],
    ['Tom Becker', 'Pet Food', 39, 110, 'cancelled', 80],
  ];
  return spec.map(([customer, plan, price, tenureDays, status, gapDays]) => ({
    customer, plan, price, status,
    startDate: ago(tenureDays), lastOrderDate: ago(gapDays),
  }));
}

// ---------- CSV parsing (small, quote-aware) ----------
function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = ''; rows.push(row); row = [];
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

function normHeader(h) {
  return h.toLowerCase().replace(/[^a-z]/g, '');
}

function rowsFromCSV(text) {
  const parsed = parseCSV(text);
  if (parsed.length < 2) throw new Error('CSV needs a header row plus at least one data row.');
  const header = parsed[0].map(normHeader);
  const col = wanted => {
    for (const w of wanted) { const i = header.indexOf(w); if (i >= 0) return i; }
    return -1;
  };
  const iCust = col(['customer', 'customername', 'name', 'email']);
  const iPlan = col(['plan', 'product', 'subscription']);
  const iStart = col(['startdate', 'start', 'createdat', 'subscribedate']);
  const iStatus = col(['status', 'state']);
  const iLast = col(['lastorderdate', 'lastorder', 'lastpurchase', 'lastorderat']);
  const iPrice = col(['monthlyprice', 'price', 'mrr', 'amount']);
  if (iCust < 0 || iStatus < 0 || iLast < 0) {
    throw new Error('CSV must include at least customer, status, and last-order-date columns.');
  }
  const parseDate = s => {
    const d = new Date((s || '').trim());
    return isNaN(d) ? null : d;
  };
  const rows = parsed.slice(1).map(cells => ({
    customer: (cells[iCust] || '').trim(),
    plan: iPlan >= 0 ? (cells[iPlan] || '').trim() || '—' : '—',
    price: iPrice >= 0 ? (parseFloat(cells[iPrice]) || DEFAULT_PRICE) : DEFAULT_PRICE,
    priceFromFile: iPrice >= 0,
    startDate: iStart >= 0 ? parseDate(cells[iStart]) : null,
    status: (cells[iStatus] || '').trim(),
    lastOrderDate: parseDate(cells[iLast]),
  })).filter(r => r.customer !== '');
  if (!rows.length) throw new Error('No usable data rows found.');
  return rows;
}

// ---------- dashboard rendering (browser only) ----------
function fmtDate(d) {
  return d ? d.toISOString().slice(0, 10) : '—';
}
function badgeClass(risk) {
  return { 'High': 'high', 'Medium': 'medium', 'Watch': 'watch',
    'Healthy': 'healthy', 'Churned': 'churned', 'Paused': 'paused' }[risk] || '';
}

let currentSummary = null;
let currentFilter = 'All';

function render(summary, refDate, priceNote) {
  currentSummary = summary;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('stat-total', summary.total);
  set('stat-high', summary.high);
  set('stat-medium', summary.medium);
  set('stat-healthy', summary.healthy);
  set('stat-mrr', '$' + summary.mrrAtRisk.toLocaleString());
  set('stat-recoverable', '$' + summary.recoverable.toLocaleString());
  set('ref-date', 'Reference date: ' + fmtDate(refDate));
  set('price-note', priceNote || '');
  const tbody = document.getElementById('risk-rows');
  const visible = summary.scored.filter(s => currentFilter === 'All' || s.risk === currentFilter);
  tbody.innerHTML = visible.map(s => `
    <tr><td>${esc(s.customer)}</td><td>${esc(s.plan)}</td><td>${fmtDate(s.startDate)}</td>
    <td>${esc(s.status)}</td><td>${fmtDate(s.lastOrderDate)}</td>
    <td>${s.gap !== undefined ? s.gap + 'd' : '—'}</td>
    <td><span class="badge ${badgeClass(s.risk)}">${s.risk}</span></td>
    <td>${esc(s.reason)}</td><td>${esc(s.action)}</td></tr>`).join('');
  const actions = document.getElementById('actions-list');
  const acts = [];
  if (summary.high) acts.push(`Send a win-back offer to <b>${summary.high}</b> high-risk subscriber(s) — discount or a pause option, not a cancellation flow.`);
  if (summary.medium) acts.push(`Send a re-engagement email to <b>${summary.medium}</b> medium-risk subscriber(s), with a product-swap suggestion.`);
  if (summary.watch) acts.push(`Send a light check-in to <b>${summary.watch}</b> watch-list subscriber(s).`);
  if (summary.paused) acts.push(`Follow up with <b>${summary.paused}</b> paused subscriber(s) about resuming.`);
  if (!acts.length) acts.push('No urgent actions — every active subscriber ordered recently.');
  actions.innerHTML = acts.map(a => `<li>${a}</li>`).join('');
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function loadDemo() {
  currentFilter = 'All';
  document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === 'All'));
  const rows = demoRows();
  const ref = new Date();
  render(summarize(rows, ref), ref, 'Demo data: prices are sample plan prices. Scoring uses v1 rules (see README).');
}

function loadCSVFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = rowsFromCSV(reader.result);
      const ref = rows.reduce((max, r) => (r.lastOrderDate && (!max || r.lastOrderDate > max)) ? r.lastOrderDate : max, null) || new Date();
      const anyPrice = rows.some(r => r.priceFromFile);
      render(summarize(rows, ref), ref,
        anyPrice ? 'CSV prices used where provided.' : 'No price column in CSV — ROI uses the $' + DEFAULT_PRICE + '/mo assumption (labeled).');
      currentFilter = 'All';
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === 'All'));
      document.getElementById('upload-msg').textContent = `Loaded ${rows.length} subscriber(s) from ${file.name}.`;
    } catch (e) {
      document.getElementById('upload-msg').textContent = 'Could not load CSV: ' + e.message;
    }
  };
  reader.readAsText(file);
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('risk-rows')) return; // landing page: no dashboard
    loadDemo();
    document.getElementById('btn-demo').addEventListener('click', loadDemo);
    document.getElementById('csv-file').addEventListener('change', e => {
      if (e.target.files[0]) loadCSVFile(e.target.files[0]);
    });
    document.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
      currentFilter = b.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('active', x === b));
      if (currentSummary) {
        const refText = document.getElementById('ref-date').textContent.replace('Reference date: ', '');
        render(currentSummary, new Date(refText + 'T00:00:00Z'), document.getElementById('price-note').textContent);
      }
    }));
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { scoreSubscriber, summarize, rowsFromCSV, parseCSV, demoRows, DEFAULT_PRICE };
}
