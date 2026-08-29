// Printable PDF report generator.
//
// Opens a new window containing a clean, print-optimised HTML report and
// triggers the browser's print dialog, where the user chooses
// "Save as PDF". No external dependencies.
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

export function openPrintableReport({ title, subtitle, meta = [], sections = [], orientation = 'landscape' }) {
  const w = window.open('', '_blank');
  if (!w) {
    alert('Please allow pop-ups for this site, then click "Save as PDF" again.');
    return;
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
@page { size: A4 ${orientation}; margin: 11mm 9mm 12mm; }
:root { --ink:#0f172a; --nav:#1e3a8a; --line:#cbd5e1; }
* { box-sizing:border-box; }
html,body { margin:0; padding:0; background:#fff; }
body { font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; color:var(--ink);
  -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.wrap { padding:16px 18px 0; }
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
  border-top:1px solid var(--line); padding:6px 18px 10px; margin-top:8px; }
.bar { position:fixed; top:10px; right:12px; display:flex; gap:8px; z-index:9; }
.bar button { font:700 12px/1 'Segoe UI',Arial,sans-serif; padding:9px 15px; border-radius:8px;
  border:1px solid var(--nav); background:var(--nav); color:#fff; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.18); }
.bar button.s2 { background:#fff; color:var(--nav); }
@media print { .bar { display:none !important; } .wrap { padding:0; } .foot { padding:6px 0 0; } }
</style></head><body>
<div class="bar">
  <button onclick="window.print()">Save as PDF</button>
  <button class="s2" onclick="window.close()">Close</button>
</div>
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
<script>window.addEventListener('load',function(){setTimeout(function(){try{window.focus();window.print();}catch(e){}},350);});</script>
</body></html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
}
