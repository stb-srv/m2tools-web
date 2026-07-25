/**
 * M2-Tools – Disposable/Temporary Email Domain Blocklist
 * Blocks 10-minute mails and other throwaway email services.
 */

const DISPOSABLE_DOMAINS = new Set([
    // Major disposable email providers
    '10minutemail.com', '10minutemail.net', '10minutemail.org',
    '10minmail.com', '10mail.org', '10mail.com',
    'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'temp-mail.de',
    'guerrillamail.com', 'guerrillamail.de', 'guerrillamail.net', 'guerrillamail.org',
    'guerrilla.ml', 'grr.la', 'guerrillamailblock.com',
    'mailinator.com', 'mailinator.net', 'mailinator2.com',
    'maildrop.cc', 'maildrop.ml', 'maildrop.gq',
    'throwaway.email', 'throwaway.com',
    'yopmail.com', 'yopmail.fr', 'yopmail.net',
    'trashmail.com', 'trashmail.de', 'trashmail.net', 'trashmail.org', 'trashmail.me',
    'fakeinbox.com', 'fakemail.net', 'fakemail.fr',
    'sharklasers.com', 'guerrillamail.info',
    'dispostable.com', 'mailnesia.com',
    'tempail.com', 'tempr.email', 'tempinbox.com',
    'mailtemp.info', 'mailtemp.net',
    'mohmal.com', 'mohmal.im', 'mohmal.in',
    'emailondeck.com', 'emailfake.com',
    'inboxbear.com', 'mailcatch.com',
    'tempmailo.com', 'tempmailaddress.com',
    'burnermail.io', 'getairmail.com',
    'mailnator.com', 'mintemail.com',
    'crazymailing.com', 'mailforspam.com',
    // German temp mail providers
    'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org',
    'byom.de', 'trash-mail.com', 'sofort-mail.de',
    'einrot.de', 'meltmail.com', 'harakirimail.com',
    // Other popular ones
    'getnada.com', 'mailsac.com', 'mailslurp.com',
    'discard.email', 'discardmail.com', 'discardmail.de',
    'anonaddy.com', 'spamgourmet.com',
    'tempail.com', 'tempmails.net',
    'disposable.email', 'disposableemailaddresses.emailmiser.com',
    'mytemp.email', 'mailtothis.com',
    'tempinbox.xyz', 'boun.cr',
    'mailnull.com', 'spamfree24.org',
    'trashymail.com', 'trashymail.net',
    'nomail.xl.cx', 'rcpt.at',
    'bobmail.info', 'devnullmail.com',
    'dingbone.com', 'dontreg.com',
    'e4ward.com', 'emailigo.de',
    'emailsensei.com', 'emailtemporario.com.br',
    'ephemail.net', 'etranquil.com',
    'gishpuppy.com', 'hulapla.de',
    'jetable.org', 'kasmail.com',
    'koszmail.pl', 'kurzepost.de',
    'lackmail.net', 'letthemeatspam.com',
    'loid.cc', 'lookugly.com',
    'lortemail.dk', 'lr78.com',
    'mailbidon.com', 'mailblocks.com',
    'mailexpire.com', 'mailmoat.com',
    'mailshell.com', 'mailzilla.com',
    'mmmmail.com', 'mziqo.com',
    'nervmich.net', 'nobulk.com',
    'noclickemail.com', 'nogmailspam.info',
    'nomail.pw', 'nomail2me.com',
    'nospam.ze.tc', 'nospamfor.us',
    'nowmymail.com', 'obobbo.com',
    'onewaymail.com', 'owlpic.com',
    'pjjkp.com', 'proxymail.eu',
    'putthisinyouremail.com', 'rejectmail.com',
    'rklips.com', 'safersignup.de',
    'shieldedmail.com', 'sogetthis.com',
    'soodonims.com', 'spam4.me',
    'spambox.us', 'spamcero.com',
    'spamday.com', 'spamfighter.cf',
    'spamfighter.ga', 'spamfighter.gq',
    'spamfighter.ml', 'spamfighter.tk',
    'spamoff.de', 'spamtrail.com',
    'superrito.com', 'suremail.info',
    'teleworm.us', 'thankyou2010.com',
    'thisisnotmyrealemail.com', 'tmails.net',
    'veryreallyfakeemails.com', 'wh4f.org',
    'willselfdestruct.com', 'xagloo.com',
    'yep.it', 'yogamaven.com',
    'zetmail.com', 'zoemail.org'
]);

/**
 * Checks if an email address belongs to a known disposable email service.
 * @param {string} email - The email to check
 * @returns {boolean} true if the email is disposable
 */
function isDisposableEmail(email) {
    if (!email || typeof email !== 'string') return false;

    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return false;

    // Direct domain match
    if (DISPOSABLE_DOMAINS.has(domain)) return true;

    // Check subdomain matches (e.g. "user@mail.guerrillamail.com")
    const parts = domain.split('.');
    for (let i = 1; i < parts.length; i++) {
        const parentDomain = parts.slice(i).join('.');
        if (DISPOSABLE_DOMAINS.has(parentDomain)) return true;
    }

    // Pattern-based detection for common temp mail naming patterns
    const suspiciousPatterns = [
        /^temp.*mail/i, /^10min/i, /^dispos/i, /^throw.*away/i,
        /^trash.*mail/i, /^fake.*mail/i, /^spam/i, /^wegwerf/i,
        /^junk.*mail/i, /^burner/i
    ];

    return suspiciousPatterns.some(pattern => pattern.test(domain));
}

module.exports = { isDisposableEmail, DISPOSABLE_DOMAINS };
