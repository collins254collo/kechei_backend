const fs = require('fs');
const path = require('path');


function getLogoDataUri() {
  try {
    const svgPath = path.join(__dirname, '../public/kechei.svg');
    const svg = fs.readFileSync(svgPath, 'utf8');
    const base64 = Buffer.from(svg).toString('base64');
    return `data:image/svg+xml;base64,${base64}`;
  } catch (err) {
    console.error('Logo load failed, falling back to text mark:', err.message);
    return '';
  }
}

// Camp / business details
const CAMP = {
  name: 'Kechei Centre',
  tagline: 'Iten, Kenya — Home of Champions',
  address: 'Iten, Elgeyo-Marakwet County, Kenya',
  phone: '+254 7XX XXX XXX',
  email: 'billing@kechei.com',
  website: 'www.kechei.com',
  // Required on a compliant Kenyan VAT invoice
  kraPin: 'PXXXXXXXXXX',
  logoUrl: getLogoDataUri(),
  // camp's brand color if it differs from this earthy default.
  accentColor: '#b0523a',
};

const BANK = {
  bankName: 'Equity Bank Kenya',
  accountName: 'Kechei Centre Ltd',
  accountNumber: '0000000000000',
  branch: 'Iten Branch',
  swiftCode: 'EQBLKENA',
  mpesaPaybill: '000000',
  mpesaAccount: 'Invoice Number',
};

// KRA standard VAT rate
const VAT_RATE = 0.16;

function fmt(n) {
  return `KES ${Number(n || 0).toLocaleString()}`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function buildInvoiceHtml(invoice) {
  const {
    invoice_number, full_name, phone, email,
    total_expenses, total_amount, final_amount, status,
    issued_date, due_date, notes,
    expenses,
  } = invoice;

  const statusColors = {
    paid:    { bg: '#eaf4ee', text: '#2d7a47', border: '#bfe0cc' },
    partial: { bg: '#fef4e4', text: '#9a6520', border: '#f5d9a8' },
    unpaid:  { bg: '#fdeeed', text: '#b03030', border: '#f3c6c3' },
  };
  const sc = statusColors[status] || statusColors.unpaid;

  const logoBlock = CAMP.logoUrl
    ? `<img src="${CAMP.logoUrl}" alt="${CAMP.name}" class="logo-img" />`
    : `<div class="logo-mark">${CAMP.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>`;

  const lineItems = Array.isArray(expenses) && expenses.length
    ? expenses
    : [{ date: issued_date, description: 'Camp expenses', amount: total_expenses }];

  // Prefer the amounts already stored on the invoice (total_amount = pre-VAT
  // subtotal, final_amount = VAT-inclusive total) so the PDF always matches
  // what payments/balance are tracked against in the DB. Only compute from
  // the line items as a fallback — e.g. a preview before the invoice exists.
  const hasStoredAmounts = total_amount != null && final_amount != null;
  const subtotal   = hasStoredAmounts ? Number(total_amount) : lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const grandTotal = hasStoredAmounts ? Number(final_amount) : subtotal * (1 + VAT_RATE);
  const vatAmount   = grandTotal - subtotal;

  //Where the money went" breakdown 
  // Groups the itemized expenses by category so the client sees a spend
  // summary (bar + legend) above the raw line items, not just a total.
  // Falls back to "Other" for uncategorized items so nothing disappears
  // from the summary silently.
  const categoryTotals = lineItems.reduce((acc, item) => {
    const cat = (item.category || 'Other').trim() || 'Other';
    acc[cat] = (acc[cat] || 0) + Number(item.amount || 0);
    return acc;
  }, {});
  const categoryEntries = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
  const categorySpendTotal = categoryEntries.reduce((sum, [, amt]) => sum + amt, 0) || 1;

  // Fixed, distinct swatches so each category is visually consistent
  // regardless of how many categories a given invoice has.
  const categoryPalette = ['#b0523a', '#9a6520', '#3a5fa0', '#2d7a47', '#6a3aaa', '#a03a6a', '#5a7a8a', '#8a7a3a'];

  const categoryBarSegments = categoryEntries.map(([cat, amt], i) => {
    const pct = (amt / categorySpendTotal) * 100;
    return `<div class="cat-seg" style="width:${pct}%;background:${categoryPalette[i % categoryPalette.length]}"></div>`;
  }).join('');

  const categoryLegendRows = categoryEntries.map(([cat, amt], i) => {
    const pct = (amt / categorySpendTotal) * 100;
    return `
        <div class="cat-legend-row">
          <span class="cat-dot" style="background:${categoryPalette[i % categoryPalette.length]}"></span>
          <span class="cat-legend-name">${cat}</span>
          <span class="cat-legend-pct">${pct.toFixed(0)}%</span>
          <span class="cat-legend-amt">${fmt(amt)}</span>
        </div>`;
  }).join('');

  const showCategoryBreakdown = categoryEntries.length > 1
    || (categoryEntries.length === 1 && categoryEntries[0][0] !== 'Other');

  const lineItemRows = lineItems.map(item => {
    const cat = (item.category || '').trim();
    const catBadge = cat ? `<span class="tag" style="background:${categoryPalette[categoryEntries.findIndex(([c]) => c === cat) % categoryPalette.length]}1a;color:${categoryPalette[categoryEntries.findIndex(([c]) => c === cat) % categoryPalette.length]}">${cat}</span>` : '—';
    return `
        <tr>
          <td>${fmtDate(item.date || item.expense_date)}</td>
          <td>${item.description || item.category || '—'}</td>
          <td class="cat-cell">${catBadge}</td>
          <td class="amt">${fmt(item.amount)}</td>
        </tr>`;
  }).join('');


  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }

      body {
        font-family: 'Helvetica Neue', Arial, sans-serif;
        color: #1a1714;
        padding: 0 56px 52px;
        font-size: 13px;
        line-height: 1.5;
      }

      /* ── Top accent bar ── */
      .accent-bar {
        height: 6px;
        margin: 0 -56px 40px;
        background: ${CAMP.accentColor};
      }

      /* ── Header — logo + brand centered ── */
      .header {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        margin-bottom: 30px;
      }

      .logo-img { height: 60px; width: auto; object-fit: contain; margin-bottom: 14px; }

      .logo-mark {
        width: 60px; height: 60px; border-radius: 12px;
        background: #1a1712; color: #f4f1ec;
        display: flex; align-items: center; justify-content: center;
        font-size: 20px; font-weight: 800; letter-spacing: -0.5px;
        margin-bottom: 14px;
      }

      .brand-name { font-size: 23px; font-weight: 800; letter-spacing: -0.3px; }
      .brand-sub { font-size: 10.5px; color: #6b6456; letter-spacing: 0.12em; text-transform: uppercase; margin-top: 5px; }
      .brand-contact { font-size: 11px; color: #948c7c; margin-top: 10px; line-height: 1.7; }

      .header-divider {
        width: 100%;
        border-bottom: 2px solid #1a1712;
        margin-top: 26px;
        padding-bottom: 22px;
      }

      /* ── Invoice meta strip (number / status / dates) ── */
      .meta-strip {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 34px;
      }

      .label { font-size: 9px; color: #b0a898; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 6px; }

      .inv-title { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #b0a898; margin-bottom: 6px; }
      .inv-number { font-size: 16px; font-weight: 700; color: #1a1712; letter-spacing: 0.02em; }
      .status-badge {
        display: inline-block; margin-top: 10px; padding: 5px 14px;
        border-radius: 6px; font-size: 10.5px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.08em;
        background: ${sc.bg}; color: ${sc.text}; border: 1px solid ${sc.border};
      }

      .dates { display: flex; gap: 40px; text-align: right; }
      .date-item div:last-child { font-weight: 600; margin-top: 2px; }

      /* ── Bill to ── */
      .bill-to { margin-bottom: 34px; }
      .client-name { font-size: 15px; font-weight: 600; }
      .client-detail { font-size: 12px; color: #6b6456; margin-top: 2px; }

      /* ── Where the money went — category breakdown ── */
      .spend-summary {
        margin-bottom: 30px; padding: 20px 22px; background: #f8f6f2;
        border: 1px solid #e5e0d8; border-radius: 10px;
      }
      .spend-title {
        font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
        text-transform: uppercase; color: #1a1712; margin-bottom: 14px;
      }
      .cat-bar {
        display: flex; width: 100%; height: 10px; border-radius: 5px;
        overflow: hidden; margin-bottom: 16px; background: #e5e0d8;
      }
      .cat-seg { height: 100%; }
      .cat-legend { display: flex; flex-direction: column; gap: 8px; }
      .cat-legend-row { display: flex; align-items: center; font-size: 12px; }
      .cat-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-right: 10px; }
      .cat-legend-name { flex: 1; color: #1a1714; }
      .cat-legend-pct { width: 42px; color: #948c7c; text-align: right; margin-right: 16px; }
      .cat-legend-amt { width: 90px; text-align: right; font-weight: 600; }

      /* ── Line items ── */
      table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
      th { text-align: left; font-size: 9px; color: #b0a898; letter-spacing: 0.1em; text-transform: uppercase; padding: 10px 0; border-bottom: 1px solid #e5e0d8; }
      td { padding: 14px 0; font-size: 13px; border-bottom: 1px solid #e5e0d8; }
      .amt { text-align: right; }
      .cat-cell { font-size: 12px; }
      .tag {
        display: inline-block; padding: 3px 9px; border-radius: 5px;
        font-size: 10.5px; font-weight: 600;
      }
      .subtotal-row td { border-bottom: none; padding: 6px 0; font-size: 12.5px; color: #6b6456; }
      .subtotal-row.vat-row td { padding-bottom: 12px; }
      .total-row td { font-weight: 700; font-size: 17px; border-bottom: none; border-top: 2px solid #1a1712; padding-top: 16px; }

      /* ── Payment details ── */
      .payment-section {
        display: flex; gap: 20px; margin-top: 8px; margin-bottom: 28px;
      }
      .payment-box {
        flex: 1; padding: 18px 20px; background: #f8f6f2;
        border: 1px solid #e5e0d8; border-radius: 10px;
      }
      .payment-title {
        font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
        text-transform: uppercase; color: #1a1712; margin-bottom: 12px;
      }
      .payment-row { display: flex; justify-content: space-between; font-size: 12px; padding: 4px 0; }
      .payment-row span:first-child { color: #948c7c; }
      .payment-row span:last-child { font-weight: 600; text-align: right; }

      /* ── Notes / footer ── */
      .notes { margin-bottom: 28px; padding: 16px 18px; background: #f8f6f2; border-radius: 8px; font-size: 12px; color: #6b6456; line-height: 1.6; }
      .footer { margin-top: 44px; padding-top: 20px; border-top: 1px solid #e5e0d8; text-align: center; }
      .footer-thanks { font-size: 12px; font-weight: 600; color: #1a1712; margin-bottom: 4px; }
      .footer-sub { font-size: 10px; color: #b0a898; }
    </style>
  </head>
  <body>
    <div class="accent-bar"></div>

    <div class="header">
      ${logoBlock}
      <div class="brand-name">${CAMP.name}</div>
      <div class="brand-sub">${CAMP.tagline}</div>
      <div class="brand-contact">${CAMP.address} · ${CAMP.phone} · ${CAMP.email}<br/>KRA PIN: ${CAMP.kraPin}</div>
      <div class="header-divider"></div>
    </div>

    <div class="meta-strip">
      <div>
        <div class="inv-title">Invoice</div>
        <div class="inv-number">${invoice_number}</div>
        <div class="status-badge">${status}</div>
      </div>
      <div class="dates">
        <div class="date-item">
          <div class="label">Issued</div>
          <div>${fmtDate(issued_date)}</div>
        </div>
        <div class="date-item">
          <div class="label">Due</div>
          <div>${due_date ? fmtDate(due_date) : '—'}</div>
        </div>
      </div>
    </div>

    <div class="bill-to">
      <div class="label">Billed to</div>
      <div class="client-name">${full_name || '—'}</div>
      ${phone ? `<div class="client-detail">${phone}</div>` : ''}
      ${email ? `<div class="client-detail">${email}</div>` : ''}
    </div>

    ${showCategoryBreakdown ? `
    <div class="spend-summary">
      <div class="spend-title">Where this went</div>
      <div class="cat-bar">${categoryBarSegments}</div>
      <div class="cat-legend">${categoryLegendRows}</div>
    </div>` : ''}

    <table>
      <thead>
        <tr><th>Date</th><th>Description</th><th>Category</th><th class="amt">Amount</th></tr>
      </thead>
      <tbody>${lineItemRows}
        <tr class="subtotal-row">
          <td colspan="3">Subtotal</td>
          <td class="amt">${fmt(subtotal)}</td>
        </tr>
        <tr class="subtotal-row vat-row">
          <td colspan="3">VAT (${(VAT_RATE * 100).toFixed(0)}%)</td>
          <td class="amt">${fmt(vatAmount)}</td>
        </tr>
        <tr class="total-row">
          <td colspan="3">Total due</td>
          <td class="amt">${fmt(grandTotal)}</td>
        </tr>
      </tbody>
    </table>

    <div class="payment-section">
      <div class="payment-box">
        <div class="payment-title">Bank transfer</div>
        <div class="payment-row"><span>Bank</span><span>${BANK.bankName}</span></div>
        <div class="payment-row"><span>Account name</span><span>${BANK.accountName}</span></div>
        <div class="payment-row"><span>Account number</span><span>${BANK.accountNumber}</span></div>
        <div class="payment-row"><span>Branch</span><span>${BANK.branch}</span></div>
        <div class="payment-row"><span>Swift code</span><span>${BANK.swiftCode}</span></div>
      </div>
      <div class="payment-box">
        <div class="payment-title">M-Pesa</div>
        <div class="payment-row"><span>Paybill</span><span>${BANK.mpesaPaybill}</span></div>
        <div class="payment-row"><span>Account</span><span>${invoice_number || BANK.mpesaAccount}</span></div>
      </div>
    </div>

    ${notes ? `<div class="notes"><strong>Notes:</strong><br/>${notes}</div>` : ''}

    <div class="footer">
      <div class="footer-thanks">Asante — thank you for training with ${CAMP.name}</div>
      <div class="footer-sub">${CAMP.website}</div>
    </div>
  </body>
  </html>
  `;
}

module.exports = { buildInvoiceHtml };