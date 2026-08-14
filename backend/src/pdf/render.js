function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount || '0');
  const cur = String(currency || 'EUR').toUpperCase();
  const fmt = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: cur,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  try { return fmt.format(n / 100); }
  catch(e) { return (n / 100).toFixed(2).replace('.',',')+' '+cur; }
}

function formatAddress(address) {
  if (!address) return '';
  const parts = [
    address.name,
    address.company,
    address.address1,
    address.address2,
    `${address.zip || ''} ${address.city || ''}`.trim(),
    address.country && address.country !== 'Deutschland' ? address.country : '',
  ].filter(Boolean);
  return parts.map(escapeHtml).join('<br>');
}

function extractOrderNumberParts(order) {
  const numeric = (s) => String(s || '').replace(/[^0-9]/g, '');
  const digits = numeric(order.order_number) || numeric(order.name) || numeric(order.id) || '0';
  const displayName = String(order.name || (order.order_number ? '#' + order.order_number : String(order.id)));
  return { digits, displayName };
}

function computeDocumentNumbers(order) {
  const { digits, displayName } = extractOrderNumberParts(order);
  const CURRENCY = String(order.currency || 'EUR');
  const invoiceNr = 'RE-' + digits;
  const fulfills = Array.isArray(order.fulfillments) ? order.fulfillments : [];
  const packingSlips = [];
  if (fulfills.length === 0) {
    packingSlips.push({
      idx: 1,
      packingSlipNr: invoiceNr + '-1',
      createdAt: order.created_at,
      trackingNumber: null,
      trackingCompany: null,
      service: null,
    });
  } else {
    fulfills.forEach((f, i) => {
      packingSlips.push({
        idx: i + 1,
        packingSlipNr: invoiceNr + '-' + String(i + 1),
        createdAt: f && f.created_at ? f.created_at : (order.created_at || null),
        trackingNumber: f && f.tracking_number || null,
        trackingCompany: f && f.tracking_company || null,
        service: f && f.service || null,
      });
    });
  }
  const invoiceDate = order.created_at;
  const dueDate = order.taxes_included && order.total_discounts ? null : null;
  const totalDiscounts = Array.isArray(order.discount_codes) ? order.discount_codes.map(d => String(d.code)).filter(Boolean) : [];
  return {
    digits, displayName, currency: CURRENCY,
    invoiceNr,
    invoiceDate: invoiceDate || new Date().toISOString(),
    packingSlips,
    primaryPackingSlip: packingSlips[0] || null,
  };
}

function renderLineItemWithPrice(li, currency) {
  const title = escapeHtml(li.title || '');
  const sku = escapeHtml(li.sku || '');
  const qty = Number(li.quantity) || 0;
  const props = (li.properties || [])
    .filter(p => p && p.name && p.value && !String(p.name).startsWith('_'))
    .map(p => `<div style="color:#333;font-size:11px;"><strong>${escapeHtml(p.name)}:</strong> ${escapeHtml(String(p.value).slice(0,120))}</div>`)
    .join('');
  const unitPrice = Number(li.price);
  const lineTotal = Number(li.final_line_price != null ? li.final_line_price : (li.total != null ? li.total : null));
  return `
    <tr>
      <td style="padding:7px 8px; border-bottom:1px solid #e5e7eb; vertical-align:top;">
        <div style="font-weight:700;">${title}</div>
        ${sku ? `<div style="color:#666;font-size:11px;">Art.-Nr.: ${sku}</div>` : ''}
        ${props ? `<div style="margin-top:6px;">${props}</div>` : ''}
      </td>
      <td style="padding:7px 8px; border-bottom:1px solid #e5e7eb; text-align:center; vertical-align:top;">${qty}</td>
      <td style="padding:7px 8px; border-bottom:1px solid #e5e7eb; text-align:right; vertical-align:top; white-space:nowrap;">${formatCurrency(unitPrice, currency)}</td>
      <td style="padding:7px 8px; border-bottom:1px solid #e5e7eb; text-align:right; vertical-align:top; font-weight:700; white-space:nowrap;">${formatCurrency(lineTotal, currency)}</td>
    </tr>
  `;
}

function renderLineItem(li) {
  const title = escapeHtml(li.title || '');
  const sku = escapeHtml(li.sku || '');
  const qty = escapeHtml(li.quantity || '');
  const props = (li.properties || [])
    .filter(p => p && p.name && p.value && !String(p.name).startsWith('_'))
    .map(p => `<div><strong>${escapeHtml(p.name)}:</strong> ${escapeHtml(String(p.value).slice(0,160))}</div>`)
    .join('');

  return `
    <tr>
      <td style="padding:6px; border-bottom:1px solid #eee; vertical-align:top;">
        <div style="font-weight:700;">${title}</div>
        ${sku ? `<div style="color:#666; font-size:12px;">Art.-Nr.: ${sku}</div>` : ''}
        ${props ? `<div style="margin-top:6px; font-size:12px;">${props}</div>` : ''}
      </td>
      <td style="padding:6px; text-align:right; border-bottom:1px solid #eee; vertical-align:top;">${qty}</td>
    </tr>
  `;
}

function wrapDocument({ title, bodyHtml }) {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm 12mm 14mm 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11.5px; color: #111; line-height: 1.35; }
    .meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px 20px; margin-bottom: 12px; }
    .meta-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 16px; margin-bottom: 14px; }
    .box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; background: #fafafa; }
    .box h4 { margin: 0 0 6px 0; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 700; }
    .box .v { font-size: 15px; font-weight: 800; color: #111; line-height: 1.25; }
    .box .v.small { font-size: 12px; font-weight: 700; }
    .doc-title { margin: 0 0 2px 0; font-size: 20px; font-weight: 900; letter-spacing: -0.01em; color: #111; }
    .doc-sub { margin: 0 0 0 0; font-size: 13px; color: #374151; }
    table.doc { width: 100%; border-collapse: collapse; margin-top: 4px; }
    table.doc th { background: #111827; color: #fff; text-align: left; padding: 8px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    table.doc th.num, table.doc td.num, table.doc td.right { text-align: right; }
    table.doc td.center { text-align: center; }
    .sep { height: 1px; background: #000; margin: 10px 0; }
    .footnote { margin-top: 14px; font-size: 10.5px; color: #4b5563; }
    .footnote .cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .footer-sig { margin-top: 26px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 30px; }
    .footer-sig .line { border-bottom: 1px solid #111; height: 36px; margin-bottom: 4px; }
    @media print { .noprint { display: none !important; } }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

function renderCompanyHeader({ docTitle, docSubtitle }) {
  return `
  <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:20px; margin-bottom:16px;">
    <div style="flex:1;">
      <h1 class="doc-title">${escapeHtml(docTitle)}</h1>
      <div class="doc-sub">${escapeHtml(docSubtitle || '')}</div>
    </div>
    <div style="text-align:right; font-size:10.5px; color:#4b5563;">
      <div style="font-weight:800; color:#111; font-size:13px;">Rollladenwelt</div>
      <div>Blücherstraße 39</div>
      <div>10961 Berlin</div>
      <div style="margin-top:4px;">E-Mail: info@rollladenwelt.de</div>
      <div>USt-IdNr. (optional)</div>
    </div>
  </div>`;
}

function renderInvoiceHtml(order) {
  const nums = computeDocumentNumbers(order);
  const billing = formatAddress(order.billing_address || order.shipping_address);
  const shipping = formatAddress(order.shipping_address || order.billing_address);
  const invDate = new Date(nums.invoiceDate || Date.now());
  const dueDate = new Date(invDate.getTime() + (14 * 24 * 3600 * 1000));
  const DATE = d => d.toLocaleDateString('de-DE');
  const cur = nums.currency;

  const lineItemsHtml = (order.line_items || []).map(li => renderLineItemWithPrice(li, cur)).join('');
  const subtotal = order.subtotal_price != null ? order.subtotal_price : order.line_items_subtotal_price;
  const totalDiscount = order.total_discounts || 0;
  const shippingTotal = order.total_shipping_price_set != null
    ? Number(order.total_shipping_price_set.shop_money.amount) * 100
    : (order.shipping_lines ? order.shipping_lines.reduce((s,l)=>s+(Number(l.price)||0),0)*100 : 0);
  const taxLines = Array.isArray(order.tax_lines) ? order.tax_lines : [];
  const totalTax = order.total_tax != null ? order.total_tax : taxLines.reduce((s,l)=>s+(Number(l.price)||0),0);
  const total = order.total_price != null ? order.total_price : order.total_net_amount;

  const taxHtml = taxLines.length
    ? taxLines.map(tl => `<tr>
      <td style="padding:6px 8px; text-align:right;" colspan="3"><strong>Umsatzsteuer ${escapeHtml(tl.title)} (${(Number(tl.rate||0)*100).toFixed(2).replace('.',',')}%)</strong></td>
      <td style="padding:6px 8px; text-align:right; font-weight:700;">${formatCurrency(Number(tl.price)||0, cur)}</td>
    </tr>`).join('') : '';

  const bodyHtml = `
    ${renderCompanyHeader({ docTitle:'RECHNUNG', docSubtitle:`Rechnung für erbrachte Lieferungen / Leistungen` })}

    <div class="meta-grid-3">
      <div class="box">
      <h4>Rechnungs-Nr.</h4><div class="v">${escapeHtml(nums.invoiceNr)}</div>
      <div style="margin-top:8px;"><h4>Rechnungsdatum</h4><div class="v small">${DATE(invDate)}</div>
      <div style="margin-top:8px;"><h4>Leistungsdatum</h4><div class="v small">${DATE(invDate)}</div>
      </div>
      <div class="box">
      <h4>Ihre Bestellung</h4><div class="v small">${escapeHtml(nums.displayName)}</div>
      <div style="margin-top:8px;"><h4>Zahlungsziel</h4><div class="v small">${DATE(dueDate)} (14 Tage netto)</div>
      <div style="margin-top:8px;"><h4>Währung</h4><div class="v small">${cur}</div>
      </div>
      <div class="box">
      <h4>Lieferschein-Nr.</h4><div class="v">${nums.primaryPackingSlip ? escapeHtml(nums.primaryPackingSlip.packingSlipNr) : escapeHtml(nums.invoiceNr + '-1')}</div>
      <div style="margin-top:8px;"><h4>Zahlungsstatus</h4><div class="v small">${escapeHtml(order.financial_status_label || order.financial_status || 'offen')}</div>
      <div style="margin-top:8px;"><h4>Lieferstatus</h4><div class="v small">${escapeHtml(order.fulfillment_status_label || order.fulfillment_status || 'offen')}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="box">
        <h4>Rechnungsempfänger</h4>
        <div style="font-size:12.5px; line-height:1.45;">${billing}</div>
      </div>
      <div class="box">
        <h4>Lieferanschrift</h4>
        <div style="font-size:12.5px; line-height:1.45;">${shipping}</div>
      </div>
    </div>

    <table class="doc">
      <thead>
        <tr>
          <th style="width:52%;">Artikel / Beschreibung</th>
          <th class="center" style="width:10%;">Menge</th>
          <th class="right" style="width:18%;">Einzelpreis</th>
          <th class="right" style="width:20%;">Gesamt</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHtml}
        <tr>
          <td style="padding:8px; text-align:right; font-weight:700;" colspan="3">Nettobetrag (Zwischensumme)</td>
          <td style="padding:8px; text-align:right; font-weight:700;">${formatCurrency(subtotal, cur)}</td>
        </tr>
        ${totalDiscount > 0 ? `<tr>
          <td style="padding:6px 8px; text-align:right; font-weight:700; color:#991b1b;" colspan="3">Rabatt / Nachlässe</td>
          <td style="padding:6px 8px; text-align:right; font-weight:700; color:#991b1b;">-${formatCurrency(totalDiscount, cur)}</td>
        </tr>` : ''}
        ${shippingTotal > 0 ? `<tr>
          <td style="padding:6px 8px; text-align:right; font-weight:700;" colspan="3">Versand- &amp; Versandkosten</td>
          <td style="padding:6px 8px; text-align:right; font-weight:700;">${formatCurrency(shippingTotal, cur)}</td>
        </tr>` : ''}
        ${taxHtml}
        <tr style="background:#f3f4f6;">
          <td style="padding:10px 8px; text-align:right; font-size:14px; font-weight:900;" colspan="3">Rechnungs-Gesamtbetrag</td>
          <td style="padding:10px 8px; text-align:right; font-size:15px; font-weight:900;">${formatCurrency(total, cur)}</td>
        </tr>
      </tbody>
    </table>

    <div class="footnote">
      <div class="cols">
        <div>
          <h4 style="margin:0 0 4px 0; color:#111;">Bankverbindung:</h4>
          <div>Rollladenwelt · IBAN: DEXX 1234 5678 9012 3456 78</div>
          <div>BIC: BANKDEFFXXX · Berliner Volksbank</div>
          <div style="margin-top:6px;">Verwendungszweck: ${escapeHtml(nums.invoiceNr)}</div>
        </div>
        <div>
          <h4 style="margin:0 0 4px 0; color:#111;">Zahlungsbedingungen:</h4>
          <div>Zahlung innerhalb von 14 Tagen ab Rechnungsdatum ohne Abzüge.</div>
          <div>Bei Verspätung: Säumniszuschläge 5% p.a. + Verwaltungskosten.</div>
        </div>
        <div>
          <h4 style="margin:0 0 4px 0; color:#111;">Hinweis:</h4>
          <div>Umsatzsteuer-Ausweis gemäß § 14 UStG. Die gelieferten Waren bleiben bis zur vollständigen Bezahlung Eigentum der Rollladenwelt.</div>
        </div>
      </div>
    </div>

    <div class="footer-sig">
      <div><div class="line"></div><div style="font-weight:700;">Ort, Datum / Unterschrift</div></div>
      <div><div class="line"></div><div style="font-weight:700;">Stempel / Unterschrift (Firma)</div></div>
    </div>
  `;

  return wrapDocument({ title: `Rechnung ${nums.invoiceNr}`, bodyHtml });
}

function renderPackingSlipHtml(order) {
  const nums = computeDocumentNumbers(order);
  const shipping = formatAddress(order.shipping_address || order.billing_address);
  const billing = formatAddress(order.billing_address || order.shipping_address);
  const ps = nums.primaryPackingSlip;
  const lineItemsHtml = (order.line_items || []).map(renderLineItem).join('');
  const invDate = new Date(nums.invoiceDate || Date.now());
  const DATE = d => d.toLocaleDateString('de-DE');
  const trackingHtml = (nums.packingSlips && nums.packingSlips.some(x => x.trackingNumber || x.trackingCompany))
    ? `<div style="margin-top:8px;">
         <h4 style="margin:0 0 4px 0; font-size:10px; color:#6b7280; text-transform:uppercase; letter-spacing:.04em;">Sendungsverfolgung</h4>
         ${nums.packingSlips.map(s => `<div style="font-size:11.5px;"><strong>${escapeHtml(s.packingSlipNr)}:</strong> ${escapeHtml(s.trackingCompany||'')} ${s.trackingNumber?('#'+s.trackingNumber):''}</div>`).join('')}
       </div>`
    : '';

  const bodyHtml = `
    ${renderCompanyHeader({ docTitle:'LIEFERSCHEIN', docSubtitle:`Lieferung gemäß Bestellung` })}

    <div class="meta-grid-3">
      <div class="box">
        <h4>Lieferschein-Nr.</h4><div class="v">${escapeHtml(ps ? ps.packingSlipNr : (nums.invoiceNr + '-1'))}</div>
        <div style="margin-top:8px;"><h4>Rechnungs-Nr.</h4><div class="v small">${escapeHtml(nums.invoiceNr)}</div>
        <div style="margin-top:8px;"><h4>Lieferdatum</h4><div class="v small">${DATE(invDate)}</div>
      </div>
      <div class="box">
        <h4>Ihre Bestellung</h4><div class="v small">${escapeHtml(nums.displayName)}</div>
        <div style="margin-top:8px;"><h4>Anzahl Packstücke</h4><div class="v small">${nums.packingSlips.length} Paket(e)</div>
        <div style="margin-top:8px;"><h4>Rechnungsdatum</h4><div class="v small">${DATE(invDate)}</div>
      </div>
      <div class="box">
        <h4>Empfänger (Versand)</h4>
        <div style="font-size:11.5px; line-height:1.35;">${shipping}</div>
        ${trackingHtml}
      </div>
    </div>

    <div class="meta-grid">
      <div class="box">
        <h4>Rechnungsempfänger</h4>
        <div style="font-size:12px; line-height:1.45;">${billing}</div>
      </div>
      <div class="box">
        <h4>Rechnungsdaten (Übersicht)</h4>
        <div style="font-size:12px;">
          <div>📄 <strong>Rechnung:</strong> ${escapeHtml(nums.invoiceNr)} vom ${DATE(invDate)}</div>
        <div style="margin-top:4px;">💸 <strong>Zahlungsziel:</strong> 14 Tage ab ${DATE(invDate)}</div>
        <div style="margin-top:4px;">💰 <strong>Gesamtbetrag:</strong> ${formatCurrency(order.total_price || order.total_net_amount, nums.currency)}</div>
        <div style="margin-top:4px;">🧾 <strong>Rechnung Download:</strong> https://lexify.me/doc/.../order_${escapeHtml(nums.digits)}_invoice.pdf</div>
        </div>
      </div>
    </div>

    <table class="doc">
      <thead>
        <tr>
          <th style="width:82%;">Artikel / Beschreibung</th>
          <th style="width:18%; text-align:right;">Menge</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHtml}
      </tbody>
    </table>

    <div class="footnote">
      <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:16px;">
        <div>
          <h4 style="margin:0 0 4px 0; color:#111;">Versandart:</h4>
          <div>Spedition / Paketdienst</div>
        </div>
        <div>
          <h4 style="margin:0 0 4px 0; color:#111;">Hinweis:</h4>
          <div>Ware auf Beschädigungen und Vollständigkeit sofort bei Annahme prüfen. Fehlmengen unverzüglich melden.</div>
        </div>
        <div>
          <h4 style="margin:0 0 4px 0; color:#111;">Unterschriften:</h4>
          <div style="margin-top:12px; border-bottom:1px solid #444; padding-bottom:2px;">Empfänger / Datum</div>
        </div>
      </div>
    </div>
  `;

  return wrapDocument({ title: `Lieferschein ${nums.displayName}`, bodyHtml });
}

function renderProductionHtml(order) {
  const nums = computeDocumentNumbers(order);
  const shipping = formatAddress(order.shipping_address || order.billing_address);
  const lineItemsHtml = (order.line_items || []).map(renderLineItem).join('');
  const attrs = (order.note_attributes || [])
    .filter(a => a && a.name && a.value)
    .map(a => `<div><strong>${escapeHtml(a.name)}:</strong> ${escapeHtml(String(a.value).slice(0,200))}</div>`)
    .join('');
  const ps = nums.primaryPackingSlip;
  const invDate = new Date(nums.invoiceDate || Date.now());
  const DATE = d => d.toLocaleDateString('de-DE');

  const bodyHtml = `
    ${renderCompanyHeader({ docTitle:'PRODUKTIONSZETTEL', docSubtitle:`Interne Arbeitsanweisung Produktion` })}

    <div class="meta-grid-3">
      <div class="box">
        <h4>Bestellung</h4><div class="v">${escapeHtml(nums.displayName)}</div>
        <div style="margin-top:8px;"><h4>Rechnung</h4><div class="v small">${escapeHtml(nums.invoiceNr)}</div>
        <div style="margin-top:8px;"><h4>Lieferschein</h4><div class="v small">${escapeHtml(ps ? ps.packingSlipNr : (nums.invoiceNr + '-1'))}</div>
      </div>
      <div class="box">
        <h4>Erstellt am</h4><div class="v small">${DATE(invDate)}</div>
        <div style="margin-top:8px;"><h4>Fällig / Lieferung</h4><div class="v small">${order.cancelled_at ? 'STORNIERT' : (order.fulfillment_status_label || 'offen')}</div>
        <div style="margin-top:8px;"><h4>Zahlstatus</h4><div class="v small">${order.financial_status_label || 'offen'}</div>
      </div>
      <div class="box">
        <h4>Lieferanschrift</h4>
        <div style="font-size:11.5px; line-height:1.35;">${shipping}</div>
      </div>
    </div>

    ${attrs ? `<div class="box" style="margin-bottom:12px;"><h4>Notizen / Attribute</h4><div>${attrs}</div></div>` : ''}

    <table class="doc">
      <thead>
        <tr>
          <th style="width:82%;">Artikel / Beschreibung</th>
          <th style="width:18%; text-align:right;">Menge</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHtml}
      </tbody>
    </table>

    <div class="footnote" style="margin-top:16px;">
      <div class="cols">
        <div><h4 style="margin:0 0 4px 0; color:#111;">Produktion:</h4><div class="footer-sig" style="margin-top:8px;"><div><div class="line"></div>Name, Datum</div></div></div>
        <div><h4 style="margin:0 0 4px 0; color:#111;">Qualitätskontrolle:</h4><div class="footer-sig" style="margin-top:8px;"><div><div class="line"></div>Name, Datum</div></div></div>
        <div><h4 style="margin:0 0 4px 0; color:#111;">Freigabe Versand:</h4><div class="footer-sig" style="margin-top:8px;"><div><div class="line"></div>Name, Datum</div></div></div>
      </div>
    </div>
  `;

  return wrapDocument({ title: `Produktionszettel ${nums.displayName}`, bodyHtml });
}

function renderHtml({ type, order }) {
  if (type === 'invoice') return renderInvoiceHtml(order);
  if (type === 'packing_slip') return renderPackingSlipHtml(order);
  if (type === 'production') return renderProductionHtml(order);
  const err = new Error('Invalid document type');
  err.status = 400;
  throw err;
}

module.exports = {
  renderHtml,
  computeDocumentNumbers,
  extractOrderNumberParts,
};
