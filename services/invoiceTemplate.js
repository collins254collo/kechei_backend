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
    total_amount, total_expenses, status,
    issued_date, due_date, notes,
  } = invoice;

  const statusColors = {
    paid:    { bg: '#eaf4ee', text: '#2d7a47' },
    partial: { bg: '#fef4e4', text: '#9a6520' },
    unpaid:  { bg: '#fdeeed', text: '#b03030' },
  };
  const sc = statusColors[status] || statusColors.unpaid;

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1714; padding: 48px; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 2px solid #1a1712; }
      .brand { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
      .brand-sub { font-size: 10px; color: #6b6456; letter-spacing: 0.14em; text-transform: uppercase; margin-top: 4px; }
      .inv-meta { text-align: right; }
      .inv-number { font-size: 13px; font-weight: 600; color: #6b6456; letter-spacing: 0.04em; }
      .status-badge { display: inline-block; margin-top: 8px; padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; background: ${sc.bg}; color: ${sc.text}; }
      .bill-to { margin-bottom: 32px; }
      .label { font-size: 9px; color: #b0a898; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 6px; }
      .client-name { font-size: 16px; font-weight: 600; }
      .client-detail { font-size: 12px; color: #6b6456; margin-top: 2px; }
      .dates { display: flex; gap: 48px; margin-bottom: 32px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
      th { text-align: left; font-size: 9px; color: #b0a898; letter-spacing: 0.1em; text-transform: uppercase; padding: 10px 0; border-bottom: 1px solid #e5e0d8; }
      td { padding: 14px 0; font-size: 13px; border-bottom: 1px solid #e5e0d8; }
      .amt { text-align: right; }
      .total-row td { font-weight: 700; font-size: 16px; border-bottom: none; border-top: 2px solid #1a1712; padding-top: 16px; }
      .notes { margin-top: 32px; padding: 16px; background: #f8f6f2; border-radius: 8px; font-size: 12px; color: #6b6456; line-height: 1.6; }
      .footer { margin-top: 48px; text-align: center; font-size: 10px; color: #b0a898; }
    </style>
  </head>
  <body>
    <div class="header">
      <div>
        <div class="brand">Kechei</div>
        <div class="brand-sub">Client Ledger</div>
      </div>
      <div class="inv-meta">
        <div class="inv-number">${invoice_number}</div>
        <div class="status-badge">${status}</div>
      </div>
    </div>

    <div class="bill-to">
      <div class="label">Billed to</div>
      <div class="client-name">${full_name || '—'}</div>
      ${phone ? `<div class="client-detail">${phone}</div>` : ''}
      ${email ? `<div class="client-detail">${email}</div>` : ''}
    </div>

    <div class="dates">
      <div>
        <div class="label">Issued</div>
        <div>${fmtDate(issued_date)}</div>
      </div>
      <div>
        <div class="label">Due</div>
        <div>${due_date ? fmtDate(due_date) : '—'}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr><th>Description</th><th class="amt">Amount</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Expenses</td>
          <td class="amt">${fmt(total_expenses)}</td>
        </tr>
        <tr class="total-row">
          <td>Total due</td>
          <td class="amt">${fmt(total_amount)}</td>
        </tr>
      </tbody>
    </table>

    ${notes ? `<div class="notes"><strong>Notes:</strong><br/>${notes}</div>` : ''}

    <div class="footer">Thank you for your business — Kechei</div>
  </body>
  </html>
  `;
}

module.exports = { buildInvoiceHtml };