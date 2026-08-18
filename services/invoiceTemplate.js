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
 tagline: 'Iten, Kenya Home of Champions',
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
 accountNumber: '000000000000',
 branch: 'Iten Branch',
 swiftCode: 'EQBLKENA',
};

const VAT_RATE = 0.16;

// Human labels + colors for payment methods stored on the `payments` table.
const PAYMENT_METHOD_META = {
 mpesa: { label: 'M-Pesa', color: '#2d7a47' },
 cash: { label: 'Cash', color: '#9a6520' },
 bank_transfer: { label: 'Bank Transfer', color: '#3a5fa0' },
 card: { label: 'Card', color: '#6a3aaa' },
 cheque: { label: 'Cheque', color: '#9a6520' },
 other: { label: 'Other', color: '#6b6456' },
};
const FALLBACK_METHOD_META = { label: 'Other', color: '#6b6456' };

function methodMeta(method) {
 const key = (method || '').toLowerCase().trim();
 return PAYMENT_METHOD_META[key] || {...FALLBACK_METHOD_META, label: method? capitalize(method): 'Other' };
}

function capitalize(s) {
 return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fmt(n) {
 return `KES ${Number(n || 0).toLocaleString()}`;
}

function fmtDate(d) {
 if (!d) return ' ';
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
 paid: { bg: '#eaf4ee', text: '#2d7a47', border: '#bfe0cc' },
 partial: { bg: '#fef4e4', text: '#9a6520', border: '#f5d9a8' },
 unpaid: { bg: '#fdeeed', text: '#b03030', border: '#f3c6c3' },
 };

 const sc = statusColors[status] || statusColors.unpaid;

 const logoBlock = CAMP.logoUrl? `<img src="${CAMP.logoUrl}" alt="${CAMP.name}" class="logo-img" />`: `<div class="logo-mark">${CAMP.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>`;

 const lineItems = Array.isArray(expenses) && expenses.length? expenses: [{ date: issued_date, description: 'Camp expenses', amount: total_expenses }];

 const hasStoredAmounts = total_amount!= null && final_amount!= null;
 const subtotal = hasStoredAmounts? Number(total_amount): lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
 const grandTotal = hasStoredAmounts? Number(final_amount): subtotal * (1 + VAT_RATE);
 const vatAmount = grandTotal - subtotal;

 const paymentList = Array.isArray(payments)? payments: [];

 const ledgerEntries = [];

 lineItems.forEach(item => {
 ledgerEntries.push({
 date: item.date || item.expense_date || issued_date,
 description: item.description || item.notes || item.category || 'Expense',
 debit: Number(item.amount || 0),
 credit: 0,
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
  description: `Payment received${p.notes? ` (${p.notes})`: ''}`,
  debit: 0,
  credit: Number(p.amount_paid || 0),
  tagLabel: meta.label,
  tagColor: meta.color,
  });
  });

 ledgerEntries.sort((a, b) => {
 const dA = new Date(a.date || 0).getTime();
 const dB = new Date(b.date || 0).getTime();
 if (dA!== dB) return dA - dB;
 return b.debit - a.debit;
 });

 const ledgerRows = ledgerEntries.map(e => {
 return `
 <tr>
 <td>${fmtDate(e.date)}</td>
 <td>${e.description}</td>
 <td class="amt debit-cell">${e.debit? fmt(e.debit): '-'}</td>
 <td class="amt credit-cell">${e.credit? fmt(e.credit): '-'}</td>
 </tr>`;
 }).join('');

 const totalDebit = ledgerEntries.reduce((s, e) => s + e.debit, 0);
 const totalCredit = ledgerEntries.reduce((s, e) => s + e.credit, 0);
 const amountPaid = totalCredit;
 const balanceDue = Math.max(0, totalDebit - totalCredit);

 // Generate QR Code with payment details
 const qrData = JSON.stringify({
 bank: BANK.bankName,
 account: BANK.accountNumber,
 name: BANK.accountName,
 ref: invoice_number,
 amount: grandTotal
 });
 const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}`;

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
 background: #ffffff;
 }

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

 .header { 
 display: flex; 
 flex-direction: column; 
 align-items: center; 
 text-align: center; 
 margin-bottom: 30px; 
 padding-top: 20px; 
 }
 
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

 table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
 th { text-align: left; font-size: 9px; color: #b0a898; letter-spacing: 0.1em; text-transform: uppercase; padding: 10px 0; border-bottom: 1px solid #e5e0d8; }
 td { padding: 14px 0; font-size: 13px; border-bottom: 1px solid #e5e0d8; }
 .amt { text-align: right; }

 .ledger-title { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #1a1712; }
 .ledger-subtitle { font-size: 10.5px; color: #948c7c; font-weight: 400; text-transform: none; letter-spacing: 0; margin-top: 2px; }
 .debit-cell { color: #b03030; font-weight: 600; }
 .credit-cell { color: #2d7a47; font-weight: 600; }
 .ledger-totals-row td { font-size: 12.5px; color: #6b6456; border-bottom: none; padding-top: 10px; }

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

 /* Payment Section - Two Column Layout with proper containment */
 .payment-wrapper {
 margin-top: 8px;
 margin-bottom: 28px;
 border: 1px solid #e5e0d8;
 border-radius: 10px;
 background: #f8f6f2;
 overflow: hidden;
 }

 .payment-section {
 display: flex;
 gap: 0;
 align-items: stretch;
 }

 .bank-details-column {
 flex: 1;
 padding: 24px 28px;
 background: #f8f6f2;
 }

 .qr-code-column {
 flex: 0 0 240px;
 padding: 20px;
 background: #ffffff;
 border-left: 1px solid #e5e0d8;
 display: flex;
 flex-direction: column;
 align-items: center;
 justify-content: center;
 }

 .payment-title {
 font-size: 10px;
 font-weight: 700;
 letter-spacing: 0.1em;
 text-transform: uppercase;
 color: #1a1712;
 margin-bottom: 16px;
 padding-bottom: 10px;
 border-bottom: 2px solid #e5e0d8;
 }

 .bank-detail-row {
 display: flex;
 justify-content: space-between;
 padding: 10px 0;
 font-size: 12.5px;
 border-bottom: 1px solid #f0ede8;
 }

 .bank-detail-row:last-child {
 border-bottom: none;
 }

 .bank-detail-label {
 color: #948c7c;
 font-weight: 500;
 letter-spacing: 0.02em;
 }

 .bank-detail-value {
 font-weight: 600;
 color: #1a1714;
 text-align: right;
 }

 .qr-code-image {
 width: 180px;
 height: 180px;
 object-fit: contain;
 margin-bottom: 12px;
 }

 .qr-code-label {
 font-size: 10px;
 color: #948c7c;
 letter-spacing: 0.08em;
 text-transform: uppercase;
 text-align: center;
 }

 .qr-code-amount {
 font-size: 16px;
 font-weight: 700;
 color: #1a1712;
 margin-top: 4px;
 }

 .notes { margin-bottom: 28px; padding: 16px 18px; background: #f8f6f2; border-radius: 8px; font-size: 12px; color: #6b6456; line-height: 1.6; }

 .footer { margin-top: 44px; padding-top: 20px; border-top: 1px solid #e5e0d8; text-align: center; }
 .footer-thanks { font-size: 12px; font-weight: 600; color: #1a1712; margin-bottom: 4px; }
 .footer-sub { font-size: 11px; color: #948c7c; }
 .footer-legal { font-size: 9.5px; color: #b0a898; margin-top: 10px; }

 @media print {
 body { padding: 60px 40px 40px; }
 .page-header { padding: 0 40px; }
 .payment-section { page-break-inside: avoid; }
 }

 @media (max-width: 700px) {
 .payment-section {
 flex-direction: column;
 }
 .qr-code-column {
 flex: none;
 width: 100%;
 border-left: none;
 border-top: 1px solid #e5e0d8;
 padding: 30px;
 }
 .qr-code-image {
 width: 160px;
 height: 160px;
 }
 .meta-strip {
 flex-direction: column;
 align-items: flex-start;
 gap: 16px;
 }
 .dates {
 width: 100%;
 justify-content: flex-start;
 }
 .date-item:first-child {
 margin-left: 0;
 }
 }
 </style>
 </head>
 <body>
 <div class="page-header">
 ${CAMP.logoUrl? `<img src="${CAMP.logoUrl}" alt="${CAMP.name}" class="page-header-logo" />`: `<div class="page-header-mark">${CAMP.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>`}
 <span class="page-header-name">${CAMP.name}</span>
 <span class="page-header-inv">${invoice_number}</span>
 </div>

 <div class="header">
 ${logoBlock}
 <div class="brand-name">${CAMP.name}</div>
 <div class="brand-sub">${CAMP.tagline}</div>
 <div class="brand-contact">${CAMP.address} ${CAMP.phone} ${CAMP.email}<br/>KRA PIN: ${CAMP.kraPin}</div>
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
 <div>${due_date? fmtDate(due_date): ' '}</div>
 </div>
 </div>
 </div>

 <div class="bill-to">
 <div class="label">Billed to</div>
 <div class="client-name">${full_name || ' '}</div>
 ${phone? `<div class="client-detail">${phone}</div>`: ''}
 ${email? `<div class="client-detail">${email}</div>`: ''}
 </div>

 <table>
 <thead>
 <tr>
 <th colspan="4">
 <span class="ledger-title">Account Statement</span>
 <span class="ledger-subtitle">— Charges (Debit) and Payments (Credit)</span>
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
 <div class="tax-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
 <div class="tax-row vat-row"><span>VAT (${(VAT_RATE * 100).toFixed(0)}%)</span><span>${fmt(vatAmount)}</span></div>
 <div class="tax-row total-due-row"><span>Total Due</span><span>${fmt(grandTotal)}</span></div>
 <div class="tax-row"><span>Amount Paid</span><span>${fmt(amountPaid)}</span></div>
 <div class="tax-row balance-row ${balanceDue <= 0? 'settled': 'owing'}">
 <span>${balanceDue <= 0? 'Balance Settled' : 'Balance Due'}</span>
 <span>${fmt(balanceDue)}</span>
 </div>
 <div class="vat-note">VAT Registered — KRA PIN: ${CAMP.kraPin}</div>
 </div>
 </div>

 <!-- Payment Section with proper containment -->
 <div class="payment-wrapper">
 <div class="payment-section">
 <div class="bank-details-column">
 <div class="payment-title">Bank Transfer Details</div>
 <div class="bank-detail-row">
 <span class="bank-detail-label">Bank Name</span>
 <span class="bank-detail-value">${BANK.bankName}</span>
 </div>
 <div class="bank-detail-row">
 <span class="bank-detail-label">Account Name</span>
 <span class="bank-detail-value">${BANK.accountName}</span>
 </div>
 <div class="bank-detail-row">
 <span class="bank-detail-label">Account Number</span>
 <span class="bank-detail-value">${BANK.accountNumber}</span>
 </div>
 <div class="bank-detail-row">
 <span class="bank-detail-label">Branch</span>
 <span class="bank-detail-value">${BANK.branch}</span>
 </div>
 <div class="bank-detail-row">
 <span class="bank-detail-label">Swift Code</span>
 <span class="bank-detail-value">${BANK.swiftCode}</span>
 </div>
 <div class="bank-detail-row">
 <span class="bank-detail-label">Reference</span>
 <span class="bank-detail-value">${invoice_number}</span>
 </div>
 </div>

 <div class="qr-code-column">
 <img src="${qrCodeUrl}" alt="Payment QR Code" class="qr-code-image" />
 <div class="qr-code-label">Scan to Pay</div>
 <div class="qr-code-amount">${fmt(grandTotal)}</div>
 </div>
 </div>
 </div>

 ${notes? `<div class="notes"><strong>Notes:</strong><br/>${notes}</div>`: ''}

 <div class="footer">
 <div class="footer-thanks">Asante — Thank you for training with ${CAMP.name}</div>
 <div class="footer-sub">${CAMP.website}</div>
 <div class="footer-legal">This is a computer-generated tax invoice and does not require a signature.</div>
 </div>
 </body>
 </html>
 `;
}

module.exports = { buildInvoiceHtml };