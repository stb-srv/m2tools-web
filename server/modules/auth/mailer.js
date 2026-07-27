/**
 * M2-Tools – Email Mailer (Nodemailer)
 * Sends verification emails. Configure SMTP via .env.
 */
const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user) {
        console.log('[Mail] SMTP not configured – emails disabled');
        return null;
    }

    transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        tls: { rejectUnauthorized: false }
    });

    console.log(`[Mail] SMTP configured: ${user}@${host}:${port}`);
    return transporter;
}

async function sendVerificationEmail(toEmail, username, token, baseUrl) {
    const transport = getTransporter();
    if (!transport) {
        console.log(`[Mail] Skipping verification email to ${toEmail} (SMTP not configured)`);
        return false;
    }

    const verifyUrl = `${baseUrl}/api/auth/verify?token=${token}`;
    const fromName = process.env.SMTP_FROM_NAME || 'M2-Tools';
    const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;

    const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0a0a12; color: #e0e0e0; padding: 40px 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: #12121e; border: 1px solid #2a2a3a; border-radius: 12px; padding: 40px; text-align: center;">
            <div style="font-size: 2.5rem; margin-bottom: 10px;">⚔️</div>
            <h1 style="color: #c3a34a; font-size: 1.6rem; margin-bottom: 5px;">M2-Tools</h1>
            <p style="color: #888; font-size: 0.85rem; margin-bottom: 30px;">E-Mail Bestätigung</p>
            
            <p style="font-size: 1rem; line-height: 1.6; margin-bottom: 25px;">
                Hallo <strong style="color: #c3a34a;">${username}</strong>,<br><br>
                vielen Dank für deine Registrierung bei M2-Tools!<br>
                Bitte klicke auf den Button unten um deine E-Mail zu bestätigen.
            </p>
            
            <a href="${verifyUrl}" style="display: inline-block; background: linear-gradient(135deg, #c3a34a, #a08330); color: #111; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 700; font-size: 1rem; letter-spacing: 0.5px;">
                ✅ E-Mail bestätigen
            </a>
            
            <p style="color: #666; font-size: 0.8rem; margin-top: 30px; line-height: 1.5;">
                Oder kopiere diesen Link in deinen Browser:<br>
                <a href="${verifyUrl}" style="color: #c3a34a; word-break: break-all; font-size: 0.75rem;">${verifyUrl}</a>
            </p>
            
            <p style="color: #555; font-size: 0.75rem; margin-top: 30px; border-top: 1px solid #2a2a3a; padding-top: 20px;">
                Dieser Link ist 24 Stunden gültig.<br>
                Falls du dich nicht registriert hast, kannst du diese E-Mail ignorieren.
            </p>
        </div>
    </body>
    </html>`;

    try {
        await transport.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to: toEmail,
            subject: '✅ M2-Tools – E-Mail Bestätigung',
            html
        });
        console.log(`[Mail] Verification email sent to ${toEmail}`);
        return true;
    } catch (err) {
        console.error('[Mail] Send error:', err.message);
        return false;
    }
}

async function sendPasswordResetEmail(toEmail, username, token, baseUrl) {
    const transport = getTransporter();
    if (!transport) {
        console.log(`[Mail] Skipping password-reset email to ${toEmail} (SMTP not configured)`);
        return false;
    }

    const resetUrl = `${baseUrl}/reset-password.html?token=${token}`;
    const fromName = process.env.SMTP_FROM_NAME || 'M2-Tools';
    const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;

    const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0a0a12; color: #e0e0e0; padding: 40px 20px;">
        <div style="max-width: 500px; margin: 0 auto; background: #12121e; border: 1px solid #2a2a3a; border-radius: 12px; padding: 40px; text-align: center;">
            <div style="font-size: 2.5rem; margin-bottom: 10px;">🔑</div>
            <h1 style="color: #c3a34a; font-size: 1.6rem; margin-bottom: 5px;">M2-Tools</h1>
            <p style="color: #888; font-size: 0.85rem; margin-bottom: 30px;">Passwort zurücksetzen</p>

            <p style="font-size: 1rem; line-height: 1.6; margin-bottom: 25px;">
                Hallo <strong style="color: #c3a34a;">${username}</strong>,<br><br>
                du hast angefordert, dein Passwort zurückzusetzen. Klicke auf den Button unten um ein neues Passwort zu vergeben.
            </p>

            <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #c3a34a, #a08330); color: #111; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 700; font-size: 1rem; letter-spacing: 0.5px;">
                🔑 Passwort zurücksetzen
            </a>

            <p style="color: #666; font-size: 0.8rem; margin-top: 30px; line-height: 1.5;">
                Oder kopiere diesen Link in deinen Browser:<br>
                <a href="${resetUrl}" style="color: #c3a34a; word-break: break-all; font-size: 0.75rem;">${resetUrl}</a>
            </p>

            <p style="color: #555; font-size: 0.75rem; margin-top: 30px; border-top: 1px solid #2a2a3a; padding-top: 20px;">
                Dieser Link ist 1 Stunde gültig.<br>
                Falls du das nicht angefordert hast, kannst du diese E-Mail ignorieren - dein Passwort bleibt unverändert.
            </p>
        </div>
    </body>
    </html>`;

    try {
        await transport.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to: toEmail,
            subject: '🔑 M2-Tools – Passwort zurücksetzen',
            html
        });
        console.log(`[Mail] Password-reset email sent to ${toEmail}`);
        return true;
    } catch (err) {
        console.error('[Mail] Send error:', err.message);
        return false;
    }
}

/**
 * Drops the cached transporter so the next send picks up freshly saved
 * SMTP_* env vars (getTransporter() otherwise reuses the one built from
 * whatever was configured at process start).
 */
function resetTransporter() {
    transporter = null;
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, getTransporter, resetTransporter };
