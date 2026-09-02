const fs = require('fs/promises');
const path = require('path');
const QRCode = require('qrcode');

let cachedLogoUri = '';
(async () => {
  try {
    const svgPath = path.join(__dirname, '../public/kechei.svg');
    const svg = await fs.readFile(svgPath, 'utf8');
    const base64 = Buffer.from(svg).toString('base64');
    cachedLogoUri = `data:image/svg+xml;base64,${base64}`;
  } catch (err) {
    console.warn('Logo asset loading failed; falling back to CSS text mark:', err.message);
  }
})();

// Camp / Business Profile Configuration
const CAMP = {
  name: 'Kechei Center',
  tagline: 'Iten, Kenya — Home of Champions',
  altitude: 'Alt. 2,400m',
  address: 'Iten, Elgeyo-Marakwet County, Kenya',
  phone: '+254 716 888 123',
  email: process.env.RESEND_EMAIL || 'hello@kechei.com',
  website: 'www.kechei.com',
  kraPin: process.env.CAMP_KRA_PIN || 'P0XXXXXXXXX',
};

const BANK = {
  bankName: 'Kenya Commercial Bank (KCB)',
  accountName: "Kechei's Group",
  accountNumber: '1337075159',
  branch: 'Iten Branch',
  swiftCode: 'KCBLKENX',
};

// Statutory Rates (Kenya Tax Laws)
const VAT_RATE = 0.16;
const TOURISM_LEVY_RATE = 0.02;
const TAX_DIVISOR = 1 + VAT_RATE + TOURISM_LEVY_RATE;

// Design Tokens
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

// Payment Method Labels & Colors
const PAYMENT_METHOD_META = {
  mpesa: { label: 'M-Pesa', color: '#2d7a47' },
  cash: { label: 'Cash', color: TOKENS.gold },
  bank_transfer: { label: 'Bank Transfer', color: '#3a5fa0' },
  card: { label: 'Card', color: '#6a3aaa' },
  cheque: { label: 'Cheque', color: TOKENS.gold },
  other: { label: 'Other', color: TOKENS.inkSoft },
};

function escapeHtml(str) {
  if (typeof str !== 'string') return str ?? '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fmt(n) {
  return `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d) {
  if (!d) return '—';
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function buildInvoiceHtml(invoice) {
  const {
    invoice_number,
    full_name,
    phone,
    email,
    total_expenses,
    total_amount,
    final_amount,
    paid_amount,
    status,
    issued_date,
    due_date,
    notes,
    description,
    expenses,
    payments,
  } = invoice;

  const statusMeta = {
    paid: { label: 'Paid', bg: '#eaf1ec', text: TOKENS.forest, border: '#c9dccf' },
    partial: { label: 'Partial', bg: '#fef7e7', text: TOKENS.gold, border: '#ecd7ae' },
    unpaid: { label: 'Unpaid', bg: '#f6e7e2', text: TOKENS.clay, border: '#e8c6ba' },
  };

  const sm = statusMeta[status?.toLowerCase()] || statusMeta.unpaid;

  const logoBlock = cachedLogoUri
    ? `<img src="${cachedLogoUri}" alt="${escapeHtml(CAMP.name)}" class="logo-img" />`
    : `<div class="logo-mark">${CAMP.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>`;

  const lineItems = Array.isArray(expenses) && expenses.length > 0
    ? expenses
    : [{ date: issued_date, description: description || 'Camp expenses and services', amount: Number(total_expenses) || Number(total_amount) || 0 }];

  const lineItemTotal = lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const grandTotal = final_amount != null ? Number(final_amount) : lineItemTotal;

  // Calculate additive inclusive tax breakdown components
  const preTaxBase = grandTotal / TAX_DIVISOR;
  const vatAmount = preTaxBase * VAT_RATE;
  const tourismLevy = preTaxBase * TOURISM_LEVY_RATE;

  const paymentList = Array.isArray(payments) ? payments : [];
  const totalPaidCalculated = paymentList.reduce((s, p) => s + Number(p.amount_paid || 0), 0);
  const effectivePaid = paid_amount != null ? Number(paid_amount) : totalPaidCalculated;
  const balanceDue = Math.max(0, grandTotal - effectivePaid);

  // Generate Payment QR Code safely
  const qrData = JSON.stringify({
    bank: BANK.bankName,
    account: BANK.accountNumber,
    name: BANK.accountName,
    ref: invoice_number,
    amount: balanceDue > 0 ? balanceDue : grandTotal,
  });

  let qrCodeUrl = '';
  try {
    qrCodeUrl = await QRCode.toDataURL(qrData, { width: 240, margin: 1, color: { dark: TOKENS.ink, light: TOKENS.paper } });
  } catch (err) {
    console.error('QR generation failed:', err.message);
  }

  const lineItemRows = lineItems.map(item => `
    <tr>
      <td>${fmtDate(item.date || item.expense_date || issued_date)}</td>
      <td>${escapeHtml(item.description || item.notes || item.category || 'Service / Expense')}</td>
      <td class="amt">${fmt(item.amount)}</td>
    </tr>
  `).join('');

  const paymentRows = paymentList.map(p => {
    const meta = PAYMENT_METHOD_META[(p.method || '').toLowerCase()] || PAYMENT_METHOD_META.other;
    return `
      <tr>
        <td>${fmtDate(p.payment_date)}</td>
        <td>
          Payment Received ${p.notes ? `(${escapeHtml(p.notes)})` : ''}
          <span class="method-tag" style="color:${meta.color}; border-color:${meta.color}55; background:${meta.color}14;">
            ${escapeHtml(meta.label)}
          </span>
        </td>
        <td class="amt credit-cell">${fmt(p.amount_paid)}</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
  <html lang="en">
  <head>
  <meta charset="utf-8" />
  <title>Tax Invoice ${escapeHtml(invoice_number)}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: ${TOKENS.ink};
        padding: 44px 56px 52px;
        font-size: 13.5px;
        line-height: 1.55;
        background: ${TOKENS.paper};
        font-variant-numeric: tabular-nums;
      }
      .top-rule { display: flex; height: 4px; margin: 0 -56px 36px; }
      .top-rule span { flex: 1; }
      .top-rule span:nth-child(1) { background: ${TOKENS.ink}; }
      .top-rule span:nth-child(2) { background: ${TOKENS.clay}; }
      .top-rule span:nth-child(3) { background: ${TOKENS.forest}; }

      .header { display: flex; flex-direction: column; align-items: center; text-align: center; margin-bottom: 8px; }
      .logo-img { height: 68px; width: auto; object-fit: contain; margin-bottom: 12px; }
      .logo-mark {
        width: 64px; height: 64px; border-radius: 16px; background: ${TOKENS.ink}; color: ${TOKENS.paperSoft};
        display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; margin-bottom: 12px;
      }
      .eyebrow { font-size: 11px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: ${TOKENS.gold}; margin-bottom: 6px; }
      .brand-sub { font-size: 12px; color: ${TOKENS.inkSoft}; letter-spacing: 0.04em; }
      .brand-contact { font-size: 11.5px; color: ${TOKENS.inkFaint}; margin-top: 10px; }
      .brand-contact .sep { margin: 0 4px; color: ${TOKENS.rule}; }
      .brand-contact .pin { display: block; margin-top: 4px; font-weight: 600; color: ${TOKENS.inkSoft}; }

      .header-divider { width: 100%; border-bottom: 1px solid ${TOKENS.rule}; margin-top: 24px; padding-bottom: 24px; }

      .meta-strip { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
      .label { font-size: 10.5px; color: ${TOKENS.inkFaint}; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 4px; }
      .inv-title { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: ${TOKENS.inkFaint}; margin-bottom: 4px; }
      .inv-number { font-size: 20px; font-weight: 800; color: ${TOKENS.ink}; }
      .status-badge {
        display: inline-block; margin-top: 10px; padding: 4px 12px; border-radius: 4px;
        font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em;
        background: ${sm.bg}; color: ${sm.text}; border: 1px solid ${sm.border};
      }
      .dates { display: flex; text-align: right; }
      .date-item { margin-left: 36px; }
      .date-item div:last-child { font-weight: 700; margin-top: 2px; font-size: 13.5px; }

      .bill-to { margin-bottom: 30px; }
      .client-name { font-size: 15px; font-weight: 700; }
      .client-detail { font-size: 12.5px; color: ${TOKENS.inkSoft}; margin-top: 2px; }

      table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
      th { text-align: left; font-size: 10px; color: ${TOKENS.inkFaint}; letter-spacing: 0.08em; text-transform: uppercase; padding: 10px 0; border-bottom: 1px solid ${TOKENS.rule}; }
      td { padding: 12px 0; font-size: 13.5px; border-bottom: 1px solid ${TOKENS.rule}; vertical-align: top; }
      .amt { text-align: right; white-space: nowrap; font-weight: 600; }
      .credit-cell { color: ${TOKENS.forest}; }

      .method-tag {
        display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 3px;
        font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; border: 1px solid;
      }

      .tax-summary { display: flex; justify-content: flex-end; margin-bottom: 28px; }
      .tax-summary-box { width: 330px; }
      .tax-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; color: ${TOKENS.inkSoft}; }
      .tax-row.vat-row { border-bottom: 1px solid ${TOKENS.rule}; padding-bottom: 8px; margin-bottom: 4px; }
      .tax-row span:last-child { font-weight: 600; color: ${TOKENS.ink}; }
      
      .tax-row.grand-total-row { 
        border-top: 2px solid ${TOKENS.ink}; 
        border-bottom: 1px solid ${TOKENS.rule}; 
        margin-top: 6px; 
        padding: 10px 0; 
      }
      .tax-row.grand-total-row span:first-child { font-weight: 700; color: ${TOKENS.ink}; }
      .tax-row.grand-total-row span:last-child { font-size: 18px; font-weight: 800; color: ${TOKENS.ink}; }

      .tax-row.balance-row { margin-top: 4px; padding-top: 8px; border-top: 1px dashed ${TOKENS.rule}; }
      .tax-row.balance-row span { font-weight: 800; }
      .tax-row.balance-row.settled span:last-child { color: ${TOKENS.forest}; }
      .tax-row.balance-row.owing span:last-child { color: ${TOKENS.clay}; font-size: 16px; }

      .vat-note { font-size: 10.5px; color: ${TOKENS.inkFaint}; margin-top: 8px; text-align: right; line-height: 1.3; }

      .payment-wrapper {
        margin-bottom: 24px; border: 1px solid ${TOKENS.rule}; border-radius: 8px;
        background: ${TOKENS.paperSoft}; overflow: hidden; page-break-inside: avoid;
      }
      .payment-section { display: flex; }
      .bank-details-column { flex: 1; padding: 20px 24px; }
      .qr-code-column {
        flex: 0 0 200px; padding: 16px; background: ${TOKENS.paper};
        border-left: 1px solid ${TOKENS.rule}; display: flex; flex-direction: column; align-items: center; justify-content: center;
      }
      .payment-title { font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${TOKENS.ink}; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid ${TOKENS.rule}; }
      .bank-detail-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 12.5px; border-bottom: 1px solid #efe9e0; }
      .bank-detail-row:last-child { border-bottom: none; }
      .bank-detail-label { color: ${TOKENS.inkFaint}; }
      .bank-detail-value { font-weight: 600; color: ${TOKENS.ink}; text-align: right; }
      .qr-code-image { width: 140px; height: 140px; object-fit: contain; margin-bottom: 8px; }
      .qr-code-label { font-size: 10px; color: ${TOKENS.inkFaint}; letter-spacing: 0.06em; text-transform: uppercase; }
      .qr-code-amount { font-size: 15px; font-weight: 700; color: ${TOKENS.gold}; margin-top: 2px; }

      .notes { margin-bottom: 24px; padding: 14px 16px; background: ${TOKENS.paperSoft}; border-radius: 6px; font-size: 12.5px; color: ${TOKENS.inkSoft}; line-height: 1.5; }
      .footer { margin-top: 36px; padding-top: 16px; border-top: 1px solid ${TOKENS.rule}; text-align: center; }
      .footer-thanks { font-size: 13.5px; font-weight: 700; color: ${TOKENS.ink}; }
      .footer-sub { font-size: 11.5px; color: ${TOKENS.inkFaint}; margin-top: 2px; }

      @media print { .payment-wrapper { page-break-inside: avoid; } }
    </style>
    </head>
    <body>

      <div class="top-rule"><span></span><span></span><span></span></div>

      <div class="header">
        ${logoBlock}
        <div class="eyebrow">${escapeHtml(CAMP.address.split(',')[0])}, Kenya &nbsp;·&nbsp; ${escapeHtml(CAMP.altitude)}</div>
        <div class="brand-sub">${escapeHtml(CAMP.tagline)}</div>
        <div class="brand-contact">
          <span>${escapeHtml(CAMP.address)}</span>
          <span class="sep">·</span>
          <span>${escapeHtml(CAMP.phone)}</span>
          <span class="sep">·</span>
          <span>${escapeHtml(CAMP.email)}</span>
          <span class="pin">KRA PIN: ${escapeHtml(CAMP.kraPin)}</span>
        </div>
        <div class="header-divider"></div>
      </div>

      <div class="meta-strip">
        <div>
          <div class="inv-title">Tax Invoice</div>
          <div class="inv-number">${escapeHtml(invoice_number)}</div>
          <div class="status-badge">${escapeHtml(sm.label)}</div>
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
        <div class="label">Billed To</div>
        <div class="client-name">${escapeHtml(full_name || '—')}</div>
        ${phone ? `<div class="client-detail">${escapeHtml(phone)}</div>` : ''}
        ${email ? `<div class="client-detail">${escapeHtml(email)}</div>` : ''}
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:20%">Date</th>
            <th style="width:55%">Service / Item Description</th>
            <th style="width:25%" class="amt">Amount (KES)</th>
          </tr>
        </thead>
        <tbody>
          ${lineItemRows}
        </tbody>
      </table>

      ${paymentList.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th style="width:20%">Payment Date</th>
              <th style="width:55%">Payment Reference / Method</th>
              <th style="width:25%" class="amt">Amount Received</th>
            </tr>
          </thead>
          <tbody>
            ${paymentRows}
          </tbody>
        </table>
      ` : ''}

      <div class="tax-summary">
        <div class="tax-summary-box">
          <div class="tax-row">
            <span>Nett Vatable Subtotal</span>
            <span>${fmt(preTaxBase)}</span>
          </div>
          <div class="tax-row">
            <span>VAT (16%)</span>
            <span>${fmt(vatAmount)}</span>
          </div>
          <div class="tax-row vat-row">
            <span>Tourism Levy (2%)</span>
            <span>${fmt(tourismLevy)}</span>
          </div>
          
          <div class="tax-row grand-total-row">
            <span>Total Charged (Tax Inclusive)</span>
            <span>${fmt(grandTotal)}</span>
          </div>
          <div class="tax-row">
            <span>Amount Paid</span>
            <span>${fmt(effectivePaid)}</span>
          </div>
          <div class="tax-row balance-row ${balanceDue <= 0 ? 'settled' : 'owing'}">
            <span>${balanceDue <= 0 ? 'Balance Settled' : 'Balance Due'}</span>
            <span>${fmt(balanceDue)}</span>
          </div>

          <div class="vat-note">
            All charges are tax-inclusive according to Kenyan statutory requirements (KRA PIN: ${escapeHtml(CAMP.kraPin)})
          </div>
        </div>
      </div>

      <div class="payment-wrapper">
        <div class="payment-section">
          <div class="bank-details-column">
            <div class="payment-title">Bank Transfer Details</div>
            <div class="bank-detail-row"><span class="bank-detail-label">Bank Name</span><span class="bank-detail-value">${escapeHtml(BANK.bankName)}</span></div>
            <div class="bank-detail-row"><span class="bank-detail-label">Account Name</span><span class="bank-detail-value">${escapeHtml(BANK.accountName)}</span></div>
            <div class="bank-detail-row"><span class="bank-detail-label">Account Number</span><span class="bank-detail-value">${escapeHtml(BANK.accountNumber)}</span></div>
            <div class="bank-detail-row"><span class="bank-detail-label">Branch</span><span class="bank-detail-value">${escapeHtml(BANK.branch)}</span></div>
            <div class="bank-detail-row"><span class="bank-detail-label">Swift Code</span><span class="bank-detail-value">${escapeHtml(BANK.swiftCode)}</span></div>
            <div class="bank-detail-row"><span class="bank-detail-label">Payment Reference</span><span class="bank-detail-value">${escapeHtml(invoice_number)}</span></div>
          </div>
          ${qrCodeUrl ? `
            <div class="qr-code-column">
              <img src="${qrCodeUrl}" alt="Payment QR Code" class="qr-code-image" />
              <div class="qr-code-label">Scan to Pay</div>
              <div class="qr-code-amount">${fmt(balanceDue > 0 ? balanceDue : grandTotal)}</div>
            </div>
          ` : ''}
        </div>
      </div>

      ${notes ? `<div class="notes"><strong>Notes:</strong><br/>${escapeHtml(notes)}</div>` : ''}

      <div class="footer">
        <div class="footer-thanks">Asante — Thank you for training with Kechei</div>
        <div class="footer-sub">${escapeHtml(CAMP.website)}</div>
      </div>

    </body>
    </html>`;
}

module.exports = { buildInvoiceHtml };