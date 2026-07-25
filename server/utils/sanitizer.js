/**
 * M2-Tools – Security Sanitizer
 * 
 * Provides utilities to clean strings from malicious code (XSS).
 */

/**
 * Escapes characters that are sensitive in HTML context.
 * Use this for any string being rendered inside .innerHTML.
 */
/**
 * Escapes characters that are sensitive in HTML context.
 * Use this for any string being rendered inside .innerHTML or attributes.
 */
function escapeHTML(str) {
    if (typeof str !== 'string') return str === null || str === undefined ? '' : String(str);
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/\//g, '&#47;');
}

/**
 * Strips all HTML tags and potentially dangerous attributes from a string.
 */
function stripHTML(str) {
    if (!str) return '';
    let result = str.toString()
        .replace(/<[^>]*>?/gm, '') // Strip tags
        .replace(/on\w+=["'].*?["']/gi, '') // Strip inline event handlers
        .replace(/javascript:/gi, ''); // Strip javascript pseudo-protocol
    return result;
}

module.exports = { escapeHTML, stripHTML };
