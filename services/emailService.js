const { Resend } = require('resend');

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is not set');
}

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendInvoiceEmail({ to, invoice, pdfBuffer }) {
  const { data, error } = await resend.emails.send({
    from: 'njogucollins10397@gmail.com',
    to,
    subject: `Invoice ${invoice.invoice_number} from Kechei`,
    html: `
      <p>Dear ${invoice.full_name},</p>
      <p>Please find attached your invoice <strong>${invoice.invoice_number}</strong> for
      <strong>KES ${Number(invoice.total_amount).toLocaleString()}</strong>.</p>
      <p>Thank you.</p>
    `,
    attachments: [
      {
        filename: `${invoice.invoice_number}.pdf`,
        content: pdfBuffer.toString('base64'),
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