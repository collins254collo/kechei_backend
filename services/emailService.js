const { Resend } = require('resend');

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is not set');
}

const resend = new Resend(process.env.RESEND_API_KEY);

function fmtKes(n) {
  return `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildInvoiceEmailHtml(invoice, amountDue) {
  return `
  <div style="font-family: Arial, Helvetica, sans-serif; color: #1f2937; font-size: 14px; line-height: 1.6; max-width: 480px;">
    <p>Dear ${invoice.full_name},</p>
    <p>
      Please find attached invoice <strong>${invoice.invoice_number}</strong> for
      <strong>${fmtKes(amountDue)}</strong>.
    </p>
    <p>Thank you for training with us.</p>
    <p style="margin-top: 24px;">
      Best regards,<br>
      <strong>Kechei Training Camp</strong>
    </p>
  </div>
  `;
}

async function sendInvoiceEmail({ to, invoice, pdfBuffer, amountDue }) {
  const buffer = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);

  const resolvedAmount = amountDue != null ? Number(amountDue) : Number(invoice.final_amount);

  if (!Number.isFinite(resolvedAmount)) {
    throw new Error(`Cannot send invoice email: no valid amount for invoice ${invoice.invoice_number}`);
  }

  if (amountDue == null) {
    console.warn(
      `[invoice ${invoice.invoice_number}] sendInvoiceEmail called without amountDue — ` +
      `falling back to stored final_amount, which may not match the attached PDF.`
    );
  }

  const { data, error } = await resend.emails.send({
    from: `Kechei Training Camp <${process.env.RESEND_EMAIL}>`,
    to,
    subject: `Invoice ${invoice.invoice_number} from Kechei Training Camp`,
    html: buildInvoiceEmailHtml(invoice, resolvedAmount),
    text: `Dear ${invoice.full_name},\n\nPlease find attached invoice ${invoice.invoice_number} for ${fmtKes(resolvedAmount)}.\n\nThank you for training with us.\n\nBest regards,\nKechei Training Camp`,
    attachments: [
      {
        filename: `${invoice.invoice_number}.pdf`,
        content: buffer.toString('base64'),
      },
    ],
  });

  if (error) {
    console.error('Resend error:', error);
    throw new Error(error.message);
  }
  return data;
}

module.exports = { sendInvoiceEmail };