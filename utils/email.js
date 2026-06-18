const { Resend } = require('resend');

const PRODUCT_NAME = process.env.PRODUCT_NAME || 'VCL4X';
const FROM_EMAIL = process.env.EMAIL_FROM || 'VCL4X <support@vcl4xengine.com>';
const DASHBOARD_URL = (process.env.DASHBOARD_URL || 'https://ai-tradingbot-frontend.vcl4xengine.com').replace(/\/$/, '');

let resendClient = null;

function isEmailEnabled() {
  return Boolean(process.env.RESEND_API_KEY);
}

function getResend() {
  if (!isEmailEnabled()) return null;
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

function baseTemplate(title, bodyHtml) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#161b22;border:1px solid #30363d;border-radius:12px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#1a1400,#161b22);padding:24px 32px;border-bottom:2px solid #d4af37;">
          <h1 style="margin:0;color:#d4af37;font-size:20px;font-weight:700;">${PRODUCT_NAME}</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#e6edf3;font-size:18px;">${title}</h2>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 32px;background:#0d1117;border-top:1px solid #30363d;">
          <p style="margin:0;color:#545d68;font-size:11px;text-align:center;">
            &copy; ${new Date().getFullYear()} ${PRODUCT_NAME}. All rights reserved.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buttonHtml(href, label) {
  return `
<p style="margin:24px 0;">
  <a href="${href}" style="display:inline-block;background:#d4af37;color:#000;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;">
    ${label}
  </a>
</p>
<p style="margin:0;color:#8b949e;font-size:12px;word-break:break-all;">Or copy this link:<br>${href}</p>`;
}

async function sendEmail({ to, subject, html }) {
  const client = getResend();
  if (!client) {
    const reason = 'RESEND_API_KEY is not configured on the server';
    console.warn('[email]', reason, '— not sent:', subject, '→', to);
    return { ok: false, skipped: true, reason };
  }
  try {
    const { data, error } = await client.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
    });
    if (error) {
      const reason = typeof error === 'string' ? error : (error.message || JSON.stringify(error));
      console.error('[email] Resend API error:', reason, '→', to, 'from:', FROM_EMAIL);
      return { ok: false, error: reason };
    }
    console.log('[email] Sent:', subject, '→', to, 'id:', data?.id);
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[email] Send failed:', err.message, '→', to);
    return { ok: false, error: err.message };
  }
}

async function sendVerificationOtpEmail(user, otp) {
  const html = baseTemplate(
    'Your verification code',
    `
<p style="margin:0 0 12px;color:#8b949e;font-size:14px;line-height:1.6;">
  Hi ${user.name}, use this code to verify your email and activate your ${PRODUCT_NAME} account:
</p>
<p style="margin:24px 0;text-align:center;">
  <span style="display:inline-block;background:#0d1117;border:2px solid #d4af37;color:#d4af37;font-size:32px;font-weight:700;letter-spacing:8px;padding:16px 28px;border-radius:10px;font-family:monospace;">
    ${otp}
  </span>
</p>
<p style="margin:0;color:#545d68;font-size:12px;text-align:center;">This code expires in 10 minutes. If you did not create an account, you can ignore this email.</p>
`
  );
  return sendEmail({
    to: user.email,
    subject: `${otp} is your ${PRODUCT_NAME} verification code`,
    html,
  });
}

/** @deprecated Link-based verification — use sendVerificationOtpEmail */
async function sendVerificationEmail(user, rawToken) {
  const verifyUrl = `${DASHBOARD_URL}/verify-email?token=${encodeURIComponent(rawToken)}`;
  const html = baseTemplate(
    'Verify your email',
    `
<p style="margin:0 0 12px;color:#8b949e;font-size:14px;line-height:1.6;">
  Hi ${user.name}, thanks for signing up. Please verify your email address to activate your account.
</p>
${buttonHtml(verifyUrl, 'Verify Email Address')}
<p style="margin:16px 0 0;color:#545d68;font-size:12px;">This link expires in 24 hours. If you did not create an account, you can ignore this email.</p>
`
  );
  return sendEmail({
    to: user.email,
    subject: `Verify your ${PRODUCT_NAME} account`,
    html,
  });
}

async function sendPasswordResetEmail(user, rawToken) {
  const resetUrl = `${DASHBOARD_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
  const html = baseTemplate(
    'Reset your password',
    `
<p style="margin:0 0 12px;color:#8b949e;font-size:14px;line-height:1.6;">
  Hi ${user.name}, we received a request to reset your password. Click the button below to choose a new one.
</p>
${buttonHtml(resetUrl, 'Reset Password')}
<p style="margin:16px 0 0;color:#545d68;font-size:12px;">This link expires in 1 hour. If you did not request a reset, you can safely ignore this email.</p>
`
  );
  return sendEmail({
    to: user.email,
    subject: `Reset your ${PRODUCT_NAME} password`,
    html,
  });
}

module.exports = {
  isEmailEnabled,
  sendVerificationOtpEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  DASHBOARD_URL,
  FROM_EMAIL,
  getEmailStatus,
};

function getEmailStatus() {
  const configured = isEmailEnabled();
  return {
    configured,
    from: FROM_EMAIL,
    dashboardUrl: DASHBOARD_URL,
    hint: configured
      ? (FROM_EMAIL.includes('resend.dev')
        ? 'Using Resend sandbox sender — only delivers to your Resend account email until a custom domain is verified.'
        : 'Email service active')
      : 'Set RESEND_API_KEY on the server to enable verification emails.',
  };
}
