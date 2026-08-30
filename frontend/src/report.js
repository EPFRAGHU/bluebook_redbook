// Printable PDF report generator.
//
// Renders a clean, print-optimised report into a hidden iframe and opens the
// browser's print dialog, where the user picks "Save as PDF" as the
// destination. Uses an iframe (not a pop-up window) so it works even when
// pop-ups are blocked. No external dependencies.
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
  const totalRows = !s.total
    ? []
    : (Array.isArray(s.total[0]) ? s.total : (s.total.length ? [s.total] : []));
  const foot = totalRows.length
    ? `<tfoot>${totalRows.map((tr) => `<tr>${tr.map((c, i) => `<td class="${cls(s.aligns && s.aligns[i])}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tfoot>`
    : '';
  return `<section class="sec${s.pageBreak ? ' brk' : ''}">${s.caption ? `<h3>${esc(s.caption)}</h3>` : ''}<table><thead>${head}</thead><tbody>${body}</tbody>${foot}</table></section>`;
}

function buildHtml({ title, subtitle, meta = [], sections = [], orientation = 'landscape' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
@page { size: A4 ${orientation}; margin: 11mm 9mm 12mm; }
:root { --ink:#0f172a; --nav:#1e3a8a; --line:#cbd5e1; }
* { box-sizing:border-box; }
html,body { margin:0; padding:0; background:#fff; }
body { font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; color:var(--ink);
  -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.wrap { padding:6px 4px 0; }
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
.sec.brk { break-before:page; page-break-before:always; }
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
tfoot td { background:#e7edf5; font-weight:700; border:.5px solid #94a3b8; }
tfoot tr:last-child td { background:#cfdcec; font-weight:800; }
tr { break-inside:avoid; }
.foot { display:flex; justify-content:space-between; font-size:8.5px; color:#64748b;
  border-top:1px solid var(--line); padding:6px 4px 0; margin-top:6px; }
</style></head><body>
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
  <div class="foot">
    <span>EPFO DO Cuttack &middot; Inquiry &amp; Recovery Portal</span>
    <span>Generated ${esc(new Date().toLocaleString('en-IN'))}</span>
  </div>
</div>
</body></html>`;
}

export function openPrintableReport(opts) {
  const html = buildHtml(opts);

  const prev = document.getElementById('__epfo_report_frame__');
  if (prev) prev.remove();

  const iframe = document.createElement('iframe');
  iframe.id = '__epfo_report_frame__';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1200px;height:900px;border:0;opacity:0;';
  document.body.appendChild(iframe);

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    setTimeout(() => { try { iframe.remove(); } catch (e) { /* noop */ } }, 500);
  };

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  const fire = () => {
    try {
      const win = iframe.contentWindow;
      win.focus();
      win.onafterprint = cleanup;
      win.print();
      setTimeout(cleanup, 60000);
    } catch (e) {
      console.error('Report print failed:', e);
      // Last resort: open the report in a new tab so the user can print it.
      try {
        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); }
      } catch (e2) { /* noop */ }
      cleanup();
    }
  };

  // Give the iframe a moment to lay out tables/fonts before printing.
  if (doc.readyState === 'complete') setTimeout(fire, 300);
  else iframe.onload = () => setTimeout(fire, 300);
}
