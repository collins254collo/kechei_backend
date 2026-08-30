const { Resend } = require('resend');

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is not set');
}

const resend = new Resend(process.env.RESEND_API_KEY);

function buildInvoiceEmailHtml(invoice) {
  return `
  <div style="font-family: Arial, Helvetica, sans-serif; color: #1f2937; font-size: 14px; line-height: 1.6; max-width: 480px;">
    <p>Dear ${invoice.full_name},</p>
    <p>
      Please find attached invoice <strong>${invoice.invoice_number}</strong> for
      <strong>KES ${Number(invoice.total_amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</strong>.
    </p>
    <p>Thank you for training with us.</p>
    <p style="margin-top: 24px;">
      Best regards,<br>
      <strong>Kechei Training Camp</strong>
    </p>
  </div>
  `;
}

async function sendInvoiceEmail({ to, invoice, pdfBuffer }) {
  const buffer = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);

  const { data, error } = await resend.emails.send({
    from: `Kechei Training Camp <${process.env.RESEND_EMAIL}>`,
    to,
    subject: `Invoice ${invoice.invoice_number} from Kechei Training Camp`,
    html: buildInvoiceEmailHtml(invoice),
    text: `Dear ${invoice.full_name},\n\nPlease find attached invoice ${invoice.invoice_number} for KES ${Number(invoice.final_amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}.\n\nThank you for training with us.\n\nBest regards,\nKechei Training Camp`,
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