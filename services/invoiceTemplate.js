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
  kraPin: 'PXXXXXXXXXX',
  logoUrl: getLogoDataUri(),
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

const VAT_RATE = 0.16;

// Human labels + colors for payment methods stored on the `payments` table.
const PAYMENT_METHOD_META = {
  mpesa:         { label: 'M-Pesa',         color: '#2d7a47' },
  cash:          { label: 'Cash',           color: '#9a6520' },
  bank_transfer: { label: 'Bank Transfer',  color: '#3a5fa0' },
  card:          { label: 'Card',           color: '#6a3aaa' },
  cheque:        { label: 'Cheque',         color: '#9a6520' },
  other:         { label: 'Other',          color: '#6b6456' },
};
const FALLBACK_METHOD_META = { label: 'Other', color: '#6b6456' };

function methodMeta(method) {
  const key = (method || '').toLowerCase().trim();
  return PAYMENT_METHOD_META[key] || { ...FALLBACK_METHOD_META, label: method ? capitalize(method) : 'Other' };
}

function capitalize(s) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

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
    total_expenses, total_amount, final_amount, paid_amount, status,
    issued_date, due_date, notes,
    expenses,
    payments,
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

  const hasStoredAmounts = total_amount != null && final_amount != null;
  const subtotal   = hasStoredAmounts ? Number(total_amount) : lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const grandTotal = hasStoredAmounts ? Number(final_amount) : subtotal * (1 + VAT_RATE);
  const vatAmount  = grandTotal - subtotal;

  // "Where the money went" — category breakdown of the expense line items
  const categoryTotals = lineItems.reduce((acc, item) => {
    const cat = (item.category || 'Other').trim() || 'Other';
    acc[cat] = (acc[cat] || 0) + Number(item.amount || 0);
    return acc;
  }, {});
  const categoryEntries = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
  const categorySpendTotal = categoryEntries.reduce((sum, [, amt]) => sum + amt, 0) || 1;
  const categoryPalette = ['#b0523a', '#9a6520', '#3a5fa0', '#2d7a47', '#6a3aaa', '#a03a6a', '#5a7a8a', '#8a7a3a'];

  function colorForCategory(cat) {
    const idx = categoryEntries.findIndex(([c]) => c === cat);
    return idx === -1 ? '#948c7c' : categoryPalette[idx % categoryPalette.length];
  }

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

  const paymentList = Array.isArray(payments) ? payments : [];

  // ── Single account ledger — the only table on the invoice now.
  // Every expense line and the VAT amount post as debits (what's owed),
  // every payment posts as a credit (what's been paid), sorted
  // chronologically with a running balance so the client sees the full
  // movement — charges and payments together — at a glance.
  const ledgerEntries = [];

  lineItems.forEach(item => {
    const cat = (item.category || '').trim();
    ledgerEntries.push({
      date: item.date || item.expense_date || issued_date,
      description: item.description || item.notes || item.category || 'Expense',
      debit: Number(item.amount || 0),
      credit: 0,
      tagLabel: cat || null,
      tagColor: cat ? colorForCategory(cat) : null,
    });
  });

  if (vatAmount > 0) {
    ledgerEntries.push({
      date: issued_date,
      description: `VAT (${(VAT_RATE * 100).toFixed(0)}%)`,
      debit: vatAmount,
      credit: 0,
    });
  }

  paymentList.forEach(p => {
    const meta = methodMeta(p.method);
    ledgerEntries.push({
      date: p.payment_date,
      description: `Payment received${p.notes ? ` (${p.notes})` : ''}`,
      debit: 0,
      credit: Number(p.amount_paid || 0),
      tagLabel: meta.label,
      tagColor: meta.color,
    });
  });

  // Chronological order. Same-day ties: charges post before payments,
  // since a payment can't be applied to a charge that hasn't posted yet.
  ledgerEntries.sort((a, b) => {
    const dA = new Date(a.date || 0).getTime();
    const dB = new Date(b.date || 0).getTime();
    if (dA !== dB) return dA - dB;
    return b.debit - a.debit;
  });

  let runningBalance = 0;
  const ledgerRows = ledgerEntries.map(e => {
    runningBalance += e.debit - e.credit;
    const tag = e.tagLabel
      ? `<span class="tag" style="background:${e.tagColor}1a;color:${e.tagColor};margin-left:6px">${e.tagLabel}</span>`
      : '';
    return `
        <tr>
          <td>${fmtDate(e.date)}</td>
          <td>${e.description}${tag}</td>
          <td class="amt debit-cell">${e.debit ? fmt(e.debit) : '—'}</td>
          <td class="amt credit-cell">${e.credit ? fmt(e.credit) : '—'}</td>
          <td class="amt balance-cell">${fmt(runningBalance)}</td>
        </tr>`;
  }).join('');

  const totalDebit  = ledgerEntries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = ledgerEntries.reduce((s, e) => s + e.credit, 0);
  const amountPaid  = totalCredit;
  const balanceDue   = Math.max(0, runningBalance);

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
        padding: 76px 56px 52px;
        font-size: 13px;
        line-height: 1.5;
        -webkit-font-smoothing: antialiased;
      }

      .accent-bar { display: none; } /* replaced by .page-header, which repeats on every page */

      .page-header {
        position: fixed;
        top: 0; left: 0; right: 0;
        height: 60px;
        padding: 0 56px;
        display: flex;
        align-items: center;
        background: #ffffff;
        border-bottom: 1px solid #e5e0d8;
        z-index: 10;
      }
      .page-header::before {
        content: '';
        position: absolute;
        top: -6px; left: 0; right: 0;
        height: 6px;
        background: linear-gradient(90deg, ${CAMP.accentColor}, #1a1712);
      }
      .page-header-logo { height: 28px; width: auto; object-fit: contain; }
      .page-header-mark {
        width: 28px; height: 28px; border-radius: 7px;
        background: #1a1712; color: #f4f1ec;
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 800; letter-spacing: -0.3px;
      }
      .page-header-name { margin-left: 10px; font-size: 13px; font-weight: 700; color: #1a1712; letter-spacing: -0.1px; }
      .page-header-inv { margin-left: auto; font-size: 10.5px; color: #948c7c; letter-spacing: 0.04em; }

      .header { display: flex; flex-direction: column; align-items: center; text-align: center; margin-bottom: 30px; padding-top: 20px; }
      .logo-img { height: 80px; width: auto; object-fit: contain; margin-bottom: 14px; }
      .logo-mark {
        width: 80px; height: 80px; border-radius: 24px;
        background: #1a1712; color: #f4f1ec;
        display: flex; align-items: center; justify-content: center;
        font-size: 20px; font-weight: 800; letter-spacing: -0.5px;
        margin-bottom: 14px;
      }
      .brand-name { font-size: 23px; font-weight: 800; letter-spacing: -0.3px; }
      .brand-sub { font-size: 10.5px; color: #6b6456; letter-spacing: 0.12em; text-transform: uppercase; margin-top: 5px; }
      .brand-contact { font-size: 11px; color: #948c7c; margin-top: 10px; line-height: 1.7; }
      .header-divider { width: 100%; border-bottom: 2px solid #1a1712; margin-top: 26px; padding-bottom: 22px; }

      .meta-strip { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 34px; }
      .label { font-size: 12px; color: #1a1711; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 6px; }
      .inv-title { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #b0a898; margin-bottom: 6px; }
      .inv-number { font-size: 16px; font-weight: 700; color: #1a1712; letter-spacing: 0.02em; }
      .status-badge {
        display: inline-block; margin-top: 10px; padding: 5px 14px;
        border-radius: 6px; font-size: 10.5px; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.08em;
        background: ${sc.bg}; color: ${sc.text}; border: 1px solid ${sc.border};
      }
      .dates { display: flex; text-align: right; }
      .date-item { margin-left: 40px; }
      .date-item div:last-child { font-weight: 600; margin-top: 2px; }

      .bill-to { margin-bottom: 34px; }
      .client-name { font-size: 15px; font-weight: 600; }
      .client-detail { font-size: 12px; color: #6b6456; margin-top: 2px; }

      .spend-summary { margin-bottom: 30px; padding: 20px 22px; background: #f8f6f2; border: 1px solid #e5e0d8; border-radius: 10px; }
      .spend-title { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #1a1712; margin-bottom: 14px; }
      .cat-bar { display: flex; width: 100%; height: 10px; border-radius: 5px; overflow: hidden; margin-bottom: 16px; background: #e5e0d8; }
      .cat-seg { height: 100%; }
      .cat-legend { display: flex; flex-direction: column; gap: 8px; }
      .cat-legend-row { display: flex; align-items: center; font-size: 12px; }
      .cat-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-right: 10px; }
      .cat-legend-name { flex: 1; color: #1a1714; }
      .cat-legend-pct { width: 42px; color: #948c7c; text-align: right; margin-right: 16px; }
      .cat-legend-amt { width: 90px; text-align: right; font-weight: 600; }

      table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
      th { text-align: left; font-size: 9px; color: #b0a898; letter-spacing: 0.1em; text-transform: uppercase; padding: 10px 0; border-bottom: 1px solid #e5e0d8; }
      td { padding: 14px 0; font-size: 13px; border-bottom: 1px solid #e5e0d8; }
      .amt { text-align: right; }
      .tag { display: inline-block; padding: 3px 9px; border-radius: 5px; font-size: 10.5px; font-weight: 600; }

      /* ── Account ledger (debit / credit / running balance) — the only table ── */
      .ledger-title { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #1a1712; }
      .ledger-subtitle { font-size: 10.5px; color: #948c7c; font-weight: 400; text-transform: none; letter-spacing: 0; margin-top: 2px; }
      .debit-cell { color: #b03030; font-weight: 600; }
      .credit-cell { color: #2d7a47; font-weight: 600; }
      .balance-cell { font-weight: 700; }
      .ledger-totals-row td { font-size: 12.5px; color: #6b6456; border-bottom: none; padding-top: 10px; }
      .ledger-totals-row .debit-cell, .ledger-totals-row .credit-cell { font-size: 12.5px; }
      .ledger-close-row td { font-weight: 700; font-size: 14px; border-bottom: none; border-top: 2px solid #1a1712; padding-top: 14px; }
      .ledger-close-row.settled td { color: #2d7a47; }
      .ledger-close-row.owing td { color: #b03030; }

      .tax-summary { display: flex; justify-content: flex-end; margin-bottom: 28px; }
      .tax-summary-box { width: 300px; }
      .tax-row { display: flex; justify-content: space-between; padding: 7px 0; font-size: 12.5px; color: #6b6456; }
      .tax-row.vat-row { border-bottom: 1px solid #e5e0d8; padding-bottom: 12px; margin-bottom: 4px; }
      .tax-row span:last-child { font-weight: 600; color: #1a1714; }
      .tax-row.total-due-row { border-top: 2px solid #1a1712; margin-top: 6px; padding-top: 14px; }
      .tax-row.total-due-row span { font-weight: 700; font-size: 16px; color: #1a1712; }
      .tax-row.balance-row span { font-weight: 700; }
      .tax-row.balance-row.settled span:last-child { color: #2d7a47; }
      .tax-row.balance-row.owing span:last-child { color: #b03030; }
      .vat-note { font-size: 10px; color: #b0a898; margin-top: 10px; text-align: right; }

      .payment-section { display: flex; margin-top: 8px; margin-bottom: 28px; }
      .payment-box { flex: 1; padding: 18px 20px; background: #f8f6f2; border: 1px solid #e5e0d8; border-radius: 10px; }
      .payment-box + .payment-box { margin-left: 20px; }
      .payment-title { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #1a1712; margin-bottom: 12px; }
      .payment-row { display: flex; justify-content: space-between; font-size: 12px; padding: 4px 0; }
      .payment-row span:first-child { color: #948c7c; }
      .payment-row span:last-child { font-weight: 600; text-align: right; }

      .notes { margin-bottom: 28px; padding: 16px 18px; background: #f8f6f2; border-radius: 8px; font-size: 12px; color: #6b6456; line-height: 1.6; }
      .footer { margin-top: 44px; padding-top: 20px; border-top: 1px solid #e5e0d8; text-align: center; }
      .footer-thanks { font-size: 12px; font-weight: 600; color: #1a1712; margin-bottom: 4px; }
      .footer-sub { font-size: 11px; color: #948c7c; }
      .footer-legal { font-size: 9.5px; color: #b0a898; margin-top: 10px; }
    </style>
  </head>
  <body>
    <div class="page-header">
      ${CAMP.logoUrl
        ? `<img src="${CAMP.logoUrl}" alt="${CAMP.name}" class="page-header-logo" />`
        : `<div class="page-header-mark">${CAMP.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>`}
      <span class="page-header-name">${CAMP.name}</span>
      <span class="page-header-inv">${invoice_number}</span>
    </div>

    <div class="header">
      ${logoBlock}
      <div class="brand-name">${CAMP.name}</div>
      <div class="brand-sub">${CAMP.tagline}</div>
      <div class="brand-contact">${CAMP.address} · ${CAMP.phone} · ${CAMP.email}<br/>KRA PIN: ${CAMP.kraPin}</div>
      <div class="header-divider"></div>
    </div>

    <div class="meta-strip">
      <div>
        <div class="inv-title">Tax Invoice</div>
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

    <table>
      <thead>
        <tr>
          <th colspan="5">
            <span class="ledger-title">Account statement<span class="ledger-subtitle">&nbsp;— charges (debit) and payments (credit), in order</span></span>
          </th>
        </tr>
        <tr><th>Date</th><th>Description</th><th class="amt">Debit</th><th class="amt">Credit</th><th class="amt">Balance</th></tr>
      </thead>
      <tbody>${ledgerRows}
        <tr class="ledger-totals-row">
          <td colspan="2">Totals</td>
          <td class="amt debit-cell">${fmt(totalDebit)}</td>
          <td class="amt credit-cell">${fmt(totalCredit)}</td>
          <td></td>
        </tr>
        <tr class="ledger-close-row ${runningBalance <= 0 ? 'settled' : 'owing'}">
          <td colspan="4">${runningBalance <= 0 ? 'Closing balance — settled' : 'Closing balance — owing'}</td>
          <td class="amt">${fmt(Math.max(0, runningBalance))}</td>
        </tr>
      </tbody>
    </table>

    <div class="tax-summary">
      <div class="tax-summary-box">
        <div class="tax-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
        <div class="tax-row vat-row"><span>VAT (${(VAT_RATE * 100).toFixed(0)}%)</span><span>${fmt(vatAmount)}</span></div>
        <div class="tax-row total-due-row"><span>Total due</span><span>${fmt(grandTotal)}</span></div>
        <div class="tax-row"><span>Amount paid</span><span>${fmt(amountPaid)}</span></div>
        <div class="tax-row balance-row ${balanceDue <= 0 ? 'settled' : 'owing'}"><span>Balance ${balanceDue <= 0 ? 'settled' : 'due'}</span><span>${fmt(balanceDue)}</span></div>
        <div class="vat-note">VAT registered · KRA PIN ${CAMP.kraPin}</div>
      </div>
    </div>

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
      <div class="footer-legal">This is a computer-generated tax invoice and does not require a signature.</div>
    </div>
  </body>
  </html>
  `;
}

module.exports = { buildInvoiceHtml };