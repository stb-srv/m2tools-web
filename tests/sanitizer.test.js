const { escapeHTML, stripHTML } = require('../server/utils/sanitizer');

describe('escapeHTML', () => {
    test('escapes HTML-sensitive characters', () => {
        expect(escapeHTML('<img src=x onerror=alert(1)>')).toBe(
            '&lt;img src=x onerror=alert(1)&gt;'
        );
    });

    test('escapes quotes and ampersands', () => {
        expect(escapeHTML(`"quote" & 'apostrophe'`)).toBe(
            '&quot;quote&quot; &amp; &#39;apostrophe&#39;'
        );
    });

    test('passes through non-string input safely', () => {
        expect(escapeHTML(null)).toBe('');
        expect(escapeHTML(undefined)).toBe('');
        expect(escapeHTML(42)).toBe('42');
    });
});

describe('stripHTML', () => {
    test('removes tags entirely', () => {
        expect(stripHTML('<b>bold</b> text')).toBe('bold text');
    });

    test('removes inline event handler attributes', () => {
        expect(stripHTML('<img src=x onerror="alert(1)">')).toBe('');
    });

    test('removes javascript: pseudo-protocol', () => {
        expect(stripHTML('javascript:alert(1)')).toBe('alert(1)');
    });

    test('returns empty string for falsy input', () => {
        expect(stripHTML(null)).toBe('');
        expect(stripHTML('')).toBe('');
    });
});
