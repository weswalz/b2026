const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || '172.25.0.1';
const SMTP_PORT = parseInt(process.env.SMTP_PORT) || 25;
const SMTP_FROM = process.env.SMTP_FROM || 'noreply@smtpbot.net';

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: false,
  tls: {
    rejectUnauthorized: false
  }
});

async function sendEmail({ to, subject, html, text }) {
  const mailOptions = {
    from: SMTP_FROM,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]*>/g, '')
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send failed:', error);
    return { success: false, error: error.message };
  }
}

function buildInviteEmail({ username, resetLink }) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td style="background-color: #ffffff; border-radius: 12px; padding: 40px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1A5F36; margin: 0 0 10px; font-size: 28px;">BLVD Park Admin</h1>
          <p style="color: #666666; margin: 0; font-size: 14px;">Houston, Texas</p>
        </div>

        <h2 style="color: #1C1C1C; margin: 0 0 20px; font-size: 20px;">Welcome to the Admin Team</h2>

        <p style="color: #333333; line-height: 1.6; margin: 0 0 20px;">
          Hello ${username},
        </p>

        <p style="color: #333333; line-height: 1.6; margin: 0 0 30px;">
          You've been granted access to the BLVD Park admin panel. Click the button below to set your password and complete your account setup.
        </p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="text-align: center; padding: 0 0 30px;">
              <a href="${resetLink}" style="display: inline-block; background-color: #1A5F36; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                Set Your Password
              </a>
            </td>
          </tr>
        </table>

        <p style="color: #666666; font-size: 12px; line-height: 1.5; margin: 0 0 10px;">
          This link will expire in 72 hours for security purposes.
        </p>

        <p style="color: #666666; font-size: 12px; line-height: 1.5; margin: 0;">
          If you didn't expect this email, please ignore it or contact your administrator.
        </p>
      </td>
    </tr>
    <tr>
      <td style="text-align: center; padding: 20px; color: #999999; font-size: 12px;">
        <p style="margin: 0 0 5px;">BLVD Park Houston</p>
        <p style="margin: 0;">The Heights neighborhood</p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject: 'Welcome to BLVD Park Admin',
    html
  };
}

function buildPasswordResetEmail({ username, resetLink, expiresIn }) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td style="background-color: #ffffff; border-radius: 12px; padding: 40px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1A5F36; margin: 0 0 10px; font-size: 28px;">BLVD Park Admin</h1>
          <p style="color: #666666; margin: 0; font-size: 14px;">Houston, Texas</p>
        </div>

        <h2 style="color: #1C1C1C; margin: 0 0 20px; font-size: 20px;">Password Reset Request</h2>

        <p style="color: #333333; line-height: 1.6; margin: 0 0 20px;">
          Hello ${username},
        </p>

        <p style="color: #333333; line-height: 1.6; margin: 0 0 30px;">
          We received a request to reset your admin panel password. Click the button below to create a new password.
        </p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="text-align: center; padding: 0 0 30px;">
              <a href="${resetLink}" style="display: inline-block; background-color: #1A5F36; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                Reset Password
              </a>
            </td>
          </tr>
        </table>

        <p style="color: #666666; font-size: 12px; line-height: 1.5; margin: 0 0 10px;">
          This link will expire in ${expiresIn} for security purposes.
        </p>

        <p style="color: #666666; font-size: 12px; line-height: 1.5; margin: 0 0 10px;">
          If you didn't request this, please ignore this email or contact an administrator.
        </p>

        <p style="color: #666666; font-size: 12px; line-height: 1.5; margin: 0;">
          If you're having trouble with the button, copy and paste this link into your browser:<br>
          <span style="word-break: break-all; color: #1A5F36;">${resetLink}</span>
        </p>
      </td>
    </tr>
    <tr>
      <td style="text-align: center; padding: 20px; color: #999999; font-size: 12px;">
        <p style="margin: 0 0 5px;">BLVD Park Houston</p>
        <p style="margin: 0;">The Heights neighborhood</p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject: 'Reset Your BLVD Park Admin Password',
    html
  };
}

module.exports = {
  sendEmail,
  buildInviteEmail,
  buildPasswordResetEmail,
  SMTP_FROM
};
