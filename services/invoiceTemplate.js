const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

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
  // name: 'Kechei Centre',
  tagline: 'Iten, Kenya — Home of Champions',
  altitude: 'Alt. 2,400m',
  address: 'Iten, Elgeyo-Marakwet County, Kenya',
  phone: '+254 716 888 123',
  email: process.env.RESEND_EMAIL,
  website: 'www.kechei.com',
  kraPin: process.env.CAMP_KRA_PIN || 'P0XXXXXXXXX', 
  logoUrl: getLogoDataUri(),
};

const BANK = {
  bankName: 'Kenya Commercial Bank (KCB)',
  accountName: 'KECHEI&#8217S GROUP',
  accountNumber: '1337075159',
  branch: 'Iten Branch',
  swiftCode: 'KCBLKENX',
};

// Statutory rates
const VAT_RATE = 0.16;
const TOURISM_LEVY_RATE = 0.02;
const TAX_DIVISOR = 1 + VAT_RATE + TOURISM_LEVY_RATE;

const TOKENS = {
  ink: '#1c1b17',
  inkSoft: '#6b6456',
  inkFaint: '#b0a898',
  paper: '#ffffff',
  paperSoft: '#faf8f4',
  rule: '#e5e0d8',
  clay: '#a8462e',
  forest: '#2f4a3c',
  gold: '#b8862b',
};

// Human labels + colors for payment methods stored on the `payments` table.
const PAYMENT_METHOD_META = {
  mpesa: { label: 'M-Pesa', color: '#2d7a47' },
  cash: { label: 'Cash', color: TOKENS.gold },
  bank_transfer: { label: 'Bank Transfer', color: '#3a5fa0' },
  card: { label: 'Card', color: '#6a3aaa' },
  cheque: { label: 'Cheque', color: TOKENS.gold },
  other: { label: 'Other', color: TOKENS.inkSoft },
};

const FALLBACK_METHOD_META = { label: 'Other', color: TOKENS.inkSoft };

function methodMeta(method) {
  const key = (method || '').toLowerCase().trim();
  return PAYMENT_METHOD_META[key] || { ...FALLBACK_METHOD_META, label: method ? capitalize(method) : 'Other' };
}

function capitalize(s) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fmt(n) {
  return `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function buildInvoiceHtml(invoice) {
  const {
    invoice_number, full_name, phone, email,
    total_expenses, total_amount, final_amount, paid_amount, status,
    issued_date, due_date, notes, description,
    expenses,
    payments,
  } = invoice;

  const statusMeta = {
    paid: { label: 'Paid', bg: '#eaf1ec', text: TOKENS.forest, border: '#c9dccf' },
    partial: { label: 'Partial', bg: '#f7ecdb', text: TOKENS.gold, border: '#ecd7ae' },
    unpaid: { label: 'Unpaid', bg: '#f6e7e2', text: TOKENS.clay, border: '#e8c6ba' },
  };

  const sm = statusMeta[status] || statusMeta.unpaid;

  const logoBlock = CAMP.logoUrl
    ? `<img src="${CAMP.logoUrl}" alt="${CAMP.name}" class="logo-img" />`
    : `<div class="logo-mark">${CAMP.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>`;

  const lineItems = Array.isArray(expenses) && expenses.length
    ? expenses
    : [{ date: issued_date, description: description || 'Camp expenses', amount: Number(total_expenses) || Number(total_amount) || 0 }];

  //  Tax computation 
  // `grandTotal` is the actual amount charged to / owed by the client.
  // VAT and Tourism Levy are statutory deductions taken OUT of that
  // added on top of it. So grandTotal never grows because of tax; only
  // the split between "kept" and "remitted to KRA" changes.
  const hasStoredAmounts = total_amount != null && final_amount != null;

  const lineItemTotal = lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  // subtotal == the tax-inclusive amount actually charged to the client
  const subtotal = hasStoredAmounts ? Number(final_amount) : lineItemTotal;
  const grandTotal = subtotal;

  if (hasStoredAmounts) {
    const discrepancy = Number(total_amount) - lineItemTotal;
    if (Math.abs(discrepancy) > 1) {
      console.error(
        `[invoice ${invoice_number}] stored total_amount (${Number(total_amount).toFixed(2)}) ` +
        `does not match the sum of line items (${lineItemTotal.toFixed(2)}) — ` +
        `difference of ${discrepancy.toFixed(2)} KES. Rendering with the stored ` +
        `final_amount so the PDF stays internally consistent; the stored amounts for ` +
        `this invoice should be reviewed.`
      );
    }
  }

  // Back the statutory taxes OUT of the tax-inclusive total.
  const netRetained = grandTotal / TAX_DIVISOR;
  const vatAmount = netRetained * VAT_RATE;
  const tourismLevy = netRetained * TOURISM_LEVY_RATE;

  const paymentList = Array.isArray(payments) ? payments : [];
  const ledgerEntries = [];

  lineItems.forEach(item => {
    ledgerEntries.push({
      date: item.date || item.expense_date || issued_date,
      description: item.description || item.notes || item.category || 'Expense',
      debit: Number(item.amount || 0),
      credit: 0,
    });
  });

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

  ledgerEntries.sort((a, b) => {
    const dA = new Date(a.date || 0).getTime();
    const dB = new Date(b.date || 0).getTime();
    if (dA !== dB) return dA - dB;
    return b.debit - a.debit;
  });

  const ledgerRows = ledgerEntries.map(e => {
    return `
      <tr>
        <td>${fmtDate(e.date)}</td>
        <td>
          ${e.description}
          ${e.tagLabel ? `<span class="method-tag" style="color:${e.tagColor};border-color:${e.tagColor}55;background:${e.tagColor}14;">${e.tagLabel}</span>` : ''}
        </td>
        <td class="amt debit-cell">${e.debit ? fmt(e.debit) : '—'}</td>
        <td class="amt credit-cell">${e.credit ? fmt(e.credit) : '—'}</td>
      </tr>`;
  }).join('');

  const totalDebit = ledgerEntries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = ledgerEntries.reduce((s, e) => s + e.credit, 0);
  const balanceDue = Math.max(0, totalDebit - totalCredit);

  // Generate QR Code with payment details
  const qrData = JSON.stringify({
    bank: BANK.bankName,
    account: BANK.accountNumber,
    name: BANK.accountName,
    ref: invoice_number,
    amount: grandTotal,
  });

  let qrCodeUrl = '';
  try {
    qrCodeUrl = await QRCode.toDataURL(qrData, { width: 200, margin: 1 });
  } catch (err) {
    console.error('QR generation failed:', err.message);
  }


  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  html, body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body {
    font-family: roboto;
    color: ${TOKENS.ink};
    padding: 44px 56px 52px;
    font-size: 14px;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    background: ${TOKENS.paper};
    font-variant-numeric: tabular-nums;
  }

  /* Signature element: a hairline in three segments, a quiet nod to place
     rather than a literal flag. Bleeds edge-to-edge past the body padding. */
  .top-rule {
    display: flex;
    height: 4px;
    margin: 0 -56px 40px;
  }
  .top-rule span { flex: 1; }
  .top-rule span:nth-child(1) { background: ${TOKENS.ink}; }
  .top-rule span:nth-child(2) { background: ${TOKENS.clay}; }
  .top-rule span:nth-child(3) { background: ${TOKENS.forest}; }

  .header {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    margin-bottom: 8px;
  }

  .logo-img { height: 68px; width: auto; object-fit: contain; margin-bottom: 16px; }
  .logo-mark {
    width: 68px; height: 68px; border-radius: 18px;
    background: ${TOKENS.ink}; color: ${TOKENS.paperSoft};
    display: flex; align-items: center; justify-content: center;
    font-family: roboto, sans-serif; text-transform: uppercase;
    font-size: 19px; font-weight: 700; letter-spacing: -0.3px;
    margin-bottom: 16px;
  }

  .eyebrow {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${TOKENS.gold};
    margin-bottom: 10px;
  }

  .brand-name {
    font-family: roboto, sans-serif;
    font-size: 28px;
    font-weight: 900;
    letter-spacing: -0.2px;
  }
  .brand-sub { font-size: 12px; color: ${TOKENS.inkSoft}; letter-spacing: 0.05em; margin-top: 6px; }
  .brand-contact { font-size: 12px; color: ${TOKENS.inkFaint}; margin-top: 14px; }
  .brand-contact span { margin: 0 2px; }
  .brand-contact .sep { color: ${TOKENS.rule}; }
  .brand-contact .pin { display: block; margin-top: 4px; letter-spacing: 0.03em; }

  .header-divider { width: 100%; border-bottom: 1px solid ${TOKENS.rule}; margin-top: 26px; padding-bottom: 30px; }

  .meta-strip { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 34px; }
  .label { font-size: 11px; color: ${TOKENS.inkFaint}; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 6px; }
  .inv-title { font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: ${TOKENS.inkFaint}; margin-bottom: 6px; }
  .inv-number {
    font-family: roboto, sans-serif;
    font-size: 21px; font-weight: 900; color: ${TOKENS.ink}; letter-spacing: 0.01em;
  }
  .status-badge {
    display: inline-block; margin-top: 12px; padding: 5px 14px;
    border-radius: 5px; font-size: 11px; font-weight: 900;
    text-transform: uppercase; letter-spacing: 0.08em;
    background: ${sm.bg}; color: ${sm.text}; border: 1px solid ${sm.border};
  }
  .dates { display: flex; text-align: right; }
  .date-item { margin-left: 40px; }
  .date-item div:last-child { font-weight: 900; margin-top: 3px; font-size: 14px; }

  .bill-to { margin-bottom: 34px; }
  .client-name { font-size: 16px; font-weight: 600; }
  .client-detail { font-size: 13px; color: ${TOKENS.inkSoft}; margin-top: 2px; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
  th { text-align: left; font-size: 10px; color: ${TOKENS.inkFaint}; letter-spacing: 0.1em; text-transform: uppercase; padding: 10px 0; border-bottom: 1px solid ${TOKENS.rule}; }
  td { padding: 14px 0; font-size: 14px; border-bottom: 1px solid ${TOKENS.rule}; vertical-align: top; }
  .amt { text-align: right; white-space: nowrap; }

  .ledger-title { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${TOKENS.ink}; }
  .ledger-subtitle { font-size: 11px; color: ${TOKENS.inkFaint}; font-weight: 400; text-transform: none; letter-spacing: 0; margin-top: 2px; }
  .debit-cell { color: ${TOKENS.clay}; font-weight: 600; }
  .credit-cell { color: ${TOKENS.forest}; font-weight: 600; }
  .ledger-totals-row td { font-size: 13.5px; color: ${TOKENS.inkSoft}; border-bottom: none; padding-top: 12px; }

  .method-tag {
    display: inline-block;
    margin-left: 8px;
    padding: 1px 7px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    border: 1px solid;
    vertical-align: middle;
  }

  .tax-summary { display: flex; justify-content: flex-end; margin-bottom: 28px; }
  .tax-summary-box { width: 310px; }
  .tax-row { display: flex; justify-content: space-between; padding: 7px 0; font-size: 13.5px; color: ${TOKENS.inkSoft}; }
  .tax-row.vat-row { border-bottom: 1px solid ${TOKENS.rule}; padding-bottom: 12px; margin-bottom: 4px; }
  .tax-row span:last-child { font-weight: 600; color: ${TOKENS.ink}; }
  .tax-row.total-due-row { border-top: 2px solid ${TOKENS.ink}; margin-top: 6px; padding-top: 14px; }
  .tax-row.total-due-row span:first-child { font-family: roboto, sans-serif; font-size: 14px; }
  .tax-row.total-due-row span:last-child {
    font-family: roboto, sans-serif;
    font-weight: 700; font-size: 21px; color: ${TOKENS.gold};
  }
  .tax-row.balance-row span { font-weight: 700; }
  .tax-row.balance-row.settled span:last-child { color: ${TOKENS.forest}; }
  .tax-row.balance-row.owing span:last-child { color: ${TOKENS.clay}; }
  .vat-note { font-size: 11px; color: ${TOKENS.inkFaint}; margin-top: 10px; text-align: right; }

  /* Payment section — two-column card, table-safe spacing, break-safe as a unit */
  .payment-wrapper {
    margin-top: 8px;
    margin-bottom: 28px;
    border: 1px solid ${TOKENS.rule};
    border-radius: 10px;
    background: ${TOKENS.paperSoft};
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .payment-section {
    display: flex;
    gap: 0;
    align-items: stretch;
  }

  .bank-details-column {
    flex: 1;
    padding: 24px 28px;
    background: ${TOKENS.paperSoft};
  }

  .qr-code-column {
    flex: 0 0 220px;
    padding: 20px;
    background: ${TOKENS.paper};
    border-left: 1px solid ${TOKENS.rule};
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .payment-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: ${TOKENS.ink};
    margin-bottom: 16px;
    padding-bottom: 10px;
    border-bottom: 1px solid ${TOKENS.rule};
  }

  .bank-detail-row {
    display: flex;
    justify-content: space-between;
    padding: 9px 0;
    font-size: 13.5px;
    border-bottom: 1px solid #efe9e0;
    font-weight: 700;
  }
  .bank-detail-row:last-child { border-bottom: none; }
  .bank-detail-label { color: ${TOKENS.inkFaint}; font-weight: 700; letter-spacing: 0.02em; }
  .bank-detail-value { font-weight: 600; color: ${TOKENS.ink}; text-align: right; }

  .qr-code-image { width: 160px; height: 160px; object-fit: contain; margin-bottom: 12px; }
  .qr-code-label { font-size: 10.5px; color: ${TOKENS.inkFaint}; letter-spacing: 0.08em; text-transform: uppercase; text-align: center; }
  .qr-code-amount { font-family: roboto; font-size: 17px; font-weight: 700; color: ${TOKENS.gold}; margin-top: 4px; }

  .notes { margin-bottom: 28px; padding: 16px 18px; background: ${TOKENS.paperSoft}; border-radius: 8px; font-size: 13px; color: ${TOKENS.inkSoft}; line-height: 1.6; }
  .notes strong { color: ${TOKENS.ink}; }

  .footer { margin-top: 44px; padding-top: 20px; border-top: 1px solid ${TOKENS.rule}; text-align: center; }
  .footer-thanks { font-family: roboto; font-size: 14px; font-weight: 700; color: ${TOKENS.ink}; margin-bottom: 4px; }
  .footer-sub { font-size: 12px; color: ${TOKENS.inkFaint};  font-weight: 500; letter-spacing: 0.02em; }
  .footer-legal { font-size: 10.5px; color: ${TOKENS.inkFaint}; margin-top: 10px; }

  @media print {
    .payment-wrapper { page-break-inside: avoid; }
  }

  @media (max-width: 700px) {
    .payment-section { flex-direction: column; }
    .qr-code-column {
      flex: none; width: 100%;
      border-left: none; border-top: 1px solid ${TOKENS.rule};
      padding: 26px;
    }
    .meta-strip { flex-direction: column; align-items: flex-start; gap: 16px; }
    .dates { width: 100%; justify-content: flex-start; }
    .date-item:first-child { margin-left: 0; }
  }
</style>
</head>
<body>

  <div class="top-rule"><span></span><span></span><span></span></div>

  <div class="header">
    ${logoBlock}
    <div class="eyebrow">${CAMP.address.split(',')[0]}, Kenya &nbsp;·&nbsp; ${CAMP.altitude}</div>
    <div class="brand-sub">${CAMP.tagline}</div>
    <div class="brand-contact">
      <span>${CAMP.address}</span>
      <span class="sep">·</span>
      <span>${CAMP.phone}</span>
      <span class="sep">·</span>
      <span>${CAMP.email}</span>
      <span class="pin">KRA PIN: ${CAMP.kraPin}</span>
    </div>
    <div class="header-divider"></div>
  </div>

  <div class="meta-strip">
    <div>
      <div class="inv-title">Tax Invoice</div>
      <div class="inv-number">${invoice_number}</div>
      <div class="status-badge">${sm.label}</div>
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
        <th colspan="4">
          <span class="ledger-title">Account Statement</span>
        </th>
      </tr>
      <tr>
        <th style="width:20%">Date</th>
        <th style="width:45%">Description</th>
        <th style="width:17.5%" class="amt">Debit (KES)</th>
        <th style="width:17.5%" class="amt">Credit (KES)</th>
      </tr>
    </thead>
    <tbody>
      ${ledgerRows}
      <tr class="ledger-totals-row">
        <td colspan="2" style="font-weight:700;">Totals</td>
        <td class="amt debit-cell" style="font-weight:700;">${fmt(totalDebit)}</td>
        <td class="amt credit-cell" style="font-weight:700;">${fmt(totalCredit)}</td>
      </tr>
    </tbody>
  </table>

  <div class="tax-summary">
    <div class="tax-summary-box">
      <div class="tax-row"><span>Total Charged</span><span>${fmt(grandTotal)}</span></div>
      <div class="tax-row"><span>Less: VAT (${(VAT_RATE * 100).toFixed(0)}%, inclusive)</span><span>-${fmt(vatAmount)}</span></div>
      <div class="tax-row vat-row"><span>Less: Tourism Levy (${(TOURISM_LEVY_RATE * 100).toFixed(0)}%, inclusive)</span><span>-${fmt(tourismLevy)}</span></div>
      <div class="tax-row"><span>Net Amount Retained</span><span>${fmt(netRetained)}</span></div>
      <div class="tax-row total-due-row"><span>Total Due</span><span>${fmt(grandTotal)}</span></div>
      <div class="tax-row"><span>Amount Paid</span><span>${fmt(totalCredit)}</span></div>
      <div class="tax-row balance-row ${balanceDue <= 0 ? 'settled' : 'owing'}">
        <span>${balanceDue <= 0 ? 'Balance Settled' : 'Balance Due'}</span>
        <span>${fmt(balanceDue)}</span>
      </div>
      <div class="vat-note">VAT &amp; Tourism Levy are inclusive of the total charged — KRA PIN: ${CAMP.kraPin}</div>
    </div>
  </div>

  <div class="payment-wrapper">
    <div class="payment-section">
      <div class="bank-details-column">
        <div class="payment-title">Bank Transfer Details</div>
        <div class="bank-detail-row"><span class="bank-detail-label">Bank Name</span><span class="bank-detail-value">${BANK.bankName}</span></div>
        <div class="bank-detail-row"><span class="bank-detail-label">Account Name</span><span class="bank-detail-value">${BANK.accountName}</span></div>
        <div class="bank-detail-row"><span class="bank-detail-label">Account Number</span><span class="bank-detail-value">${BANK.accountNumber}</span></div>
        <div class="bank-detail-row"><span class="bank-detail-label">Branch</span><span class="bank-detail-value">${BANK.branch}</span></div>
        <div class="bank-detail-row"><span class="bank-detail-label">Swift Code</span><span class="bank-detail-value">${BANK.swiftCode}</span></div>
        <div class="bank-detail-row"><span class="bank-detail-label">Reference</span><span class="bank-detail-value">${invoice_number}</span></div>
      </div>
      <div class="qr-code-column">
        <img src="${qrCodeUrl}" alt="Payment QR Code" class="qr-code-image" />
        <div class="qr-code-label">Scan to Pay</div>
        <div class="qr-code-amount">${fmt(grandTotal)}</div>
      </div>
    </div>
  </div>

  ${notes ? `<div class="notes"><strong>Notes:</strong><br/>${notes}</div>` : ''}

  <div class="footer">
    <div class="footer-thanks">Asante — Thank you for training with ${CAMP.name}</div>
    <div class="footer-sub">${CAMP.website}</div>
  </div>

</body>
</html>
  `;
}

module.exports = { buildInvoiceHtml };