// Printable PDF report generator.
//
// Builds a clean, print-optimised HTML report and opens it in a new tab.
// The report page carries a prominent "Save as PDF" button (and auto-opens
// the print dialog) so the user saves it straight to a PDF file.
// No external dependencies.
//
// openPrintableReport({
//   title, subtitle,
//   meta:     [{ label, value }],
//   sections: [{ caption, head:[...], aligns:['l'|'r'|'c'], rows:[[...]], total:[...] }],
//   orientation: 'landscape' | 'portrait',
// })

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const cls = (a) => (a === 'r' ? 'num' : a === 'c' ? 'ctr' : '');

function renderSection(s) {
  const head = `<tr>${s.head.map((h, i) => `<th class="${cls(s.aligns && s.aligns[i])}">${esc(h)}</th>`).join('')}</tr>`;
  const body = s.rows && s.rows.length
    ? s.rows.map((r) => `<tr>${r.map((c, i) => `<td class="${cls(s.aligns && s.aligns[i])}">${esc(c)}</td>`).join('')}</tr>`).join('')
    : `<tr><td class="empty" colspan="${s.head.length}">No records</td></tr>`;
  const foot = s.total
    ? `<tfoot><tr>${s.total.map((c, i) => `<td class="${cls(s.aligns && s.aligns[i])}">${esc(c)}</td>`).join('')}</tr></tfoot>`
    : '';
  return `<section class="sec">${s.caption ? `<h3>${esc(s.caption)}</h3>` : ''}<table><thead>${head}</thead><tbody>${body}</tbody>${foot}</table></section>`;
}

function buildHtml({ title, subtitle, meta = [], sections = [], orientation = 'landscape' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
@page { size: A4 ${orientation}; margin: 11mm 9mm 12mm; }
:root { --ink:#0f172a; --nav:#1e3a8a; --line:#cbd5e1; }
* { box-sizing:border-box; }
html,body { margin:0; padding:0; background:#f1f5f9; }
body { font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; color:var(--ink);
  -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.sheet { background:#fff; max-width:1180px; margin:0 auto; box-shadow:0 1px 12px rgba(15,23,42,.12); }
.wrap { padding:20px 22px 4px; }
.head { display:flex; justify-content:space-between; align-items:flex-end; gap:16px;
  border-bottom:2.5px solid var(--nav); padding-bottom:8px; }
.head .l1 { font-size:14px; font-weight:800; letter-spacing:.4px; color:var(--nav); text-transform:uppercase; }
.head .l2 { font-size:11px; font-weight:600; color:#475569; margin-top:1px; }
.head .r { text-align:right; }
.head .rt { font-size:15px; font-weight:800; }
.head .rs { font-size:10px; color:#64748b; font-weight:600; margin-top:1px; }
.meta { display:flex; flex-wrap:wrap; gap:4px 20px; margin:9px 0 12px; font-size:9.5px; }
.meta span { white-space:nowrap; }
.meta b { color:#64748b; font-weight:700; text-transform:uppercase; letter-spacing:.3px; margin-right:5px; }
.sec { margin-bottom:14px; }
.sec h3 { font-size:11px; font-weight:800; color:var(--nav); margin:0 0 5px; padding-left:7px; border-left:3px solid var(--nav); }
table { width:100%; border-collapse:collapse; table-layout:auto; }
thead { display:table-header-group; }
th { background:var(--nav); color:#fff; font-weight:700; text-transform:uppercase; font-size:7px;
  letter-spacing:.2px; padding:4px; border:.5px solid var(--nav); text-align:left; }
td { font-size:8px; padding:3.5px 4px; border:.5px solid var(--line); vertical-align:top; word-break:break-word; }
tbody tr:nth-child(even) td { background:#f1f5f9; }
td.num, th.num { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
td.ctr, th.ctr { text-align:center; }
td.empty { text-align:center; color:#94a3b8; padding:12px; font-size:9px; }
tfoot td { background:#dbe4f0; font-weight:800; border:.5px solid #94a3b8; }
tr { break-inside:avoid; }
.foot { display:flex; justify-content:space-between; font-size:8.5px; color:#64748b;
  border-top:1px solid var(--line); padding:6px 22px 12px; }
.bar { position:sticky; top:0; display:flex; gap:8px; justify-content:flex-end; align-items:center;
  padding:9px 14px; background:#0f172a; }
.bar .hint { margin-right:auto; color:#cbd5e1; font-size:11px; font-weight:600; }
.bar button { font:700 12px/1 'Segoe UI',Arial,sans-serif; padding:9px 16px; border-radius:8px;
  border:1px solid #1e3a8a; background:#2563eb; color:#fff; cursor:pointer; }
.bar button.s2 { background:transparent; color:#cbd5e1; border-color:#475569; }
@media print { .bar { display:none !important; } html,body { background:#fff; } .sheet { box-shadow:none; max-width:none; } .wrap { padding:0; } .foot { padding:6px 0 0; } }
</style></head><body>
<div class="bar">
  <span class="hint">Use your browser's print dialog and choose "Save as PDF" as the destination.</span>
  <button onclick="window.print()">Save as PDF</button>
  <button class="s2" onclick="window.close()">Close</button>
</div>
<div class="sheet">
  <div class="wrap">
    <div class="head">
      <div>
        <div class="l1">Employees' Provident Fund Organisation</div>
        <div class="l2">District Office, Cuttack</div>
      </div>
      <div class="r">
        <div class="rt">${esc(title)}</div>
        ${subtitle ? `<div class="rs">${esc(subtitle)}</div>` : ''}
      </div>
    </div>
    <div class="meta">${meta.map((m) => `<span><b>${esc(m.label)}</b>${esc(m.value)}</span>`).join('')}</div>
    ${sections.map(renderSection).join('')}
  </div>
  <div class="foot">
    <span>EPFO DO Cuttack &middot; Inquiry &amp; Recovery Portal</span>
    <span>Generated ${esc(new Date().toLocaleString('en-IN'))}</span>
  </div>
</div>
<script>window.addEventListener('load',function(){setTimeout(function(){try{window.focus();window.print();}catch(e){}},450);});</script>
</body></html>`;
}

export function openPrintableReport(opts) {
  const html = buildHtml(opts);
  let url;
  try {
    url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  } catch (e) {
    url = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
  }
  const w = window.open(url, '_blank');
  if (!w) {
    alert('The report opens in a new tab. Please allow pop-ups for this site, then click "Save as PDF" again.');
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    return;
  }
  if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 60000);
}
