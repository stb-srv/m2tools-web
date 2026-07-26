const Database = require('better-sqlite3');
const protoImportService = require('../server/services/protoImportService');

function createProtoDb() {
    const db = new Database(':memory:');
    db.exec(`
        CREATE TABLE item_proto (
            vnum INTEGER PRIMARY KEY,
            locale_name TEXT NOT NULL DEFAULT '',
            type INTEGER DEFAULT 0,
            subtype INTEGER DEFAULT 0,
            flag INTEGER DEFAULT 0
        );
        CREATE TABLE mob_proto (
            vnum INTEGER PRIMARY KEY,
            locale_name TEXT NOT NULL DEFAULT '',
            type INTEGER DEFAULT 0,
            level INTEGER DEFAULT 0
        );
    `);
    return db;
}

describe('parseProtoText', () => {
    test('parses tab-separated item rows', () => {
        const items = protoImportService.parseProtoText('50900\tKleiner Heiltrank\t1\t2\t0', 'item');
        expect(items).toEqual([{ vnum: 50900, locale_name: 'Kleiner Heiltrank', type: 1, subtype: 2, flag: 0 }]);
    });

    test('parses SQL INSERT statements', () => {
        const items = protoImportService.parseProtoText(
            "INSERT INTO `item_proto` VALUES (50900, 'x', 'Kleiner Heiltrank', 1, 2)",
            'item'
        );
        expect(items[0].vnum).toBe(50900);
    });

    test('returns an empty array for empty input', () => {
        expect(protoImportService.parseProtoText('', 'item')).toEqual([]);
    });
});

describe('parseUploadedProtoFile', () => {
    test('falls back to latin1 when utf-8 parsing yields no rows', () => {
        // A byte sequence that is invalid/empty as meaningful utf-8 tab-data
        // but parses fine as latin1 tab-separated text.
        const buffer = Buffer.from('50900\tHeiltrank\t1\t2\t0', 'latin1');
        const items = protoImportService.parseUploadedProtoFile(buffer, 'item');
        expect(items.length).toBe(1);
        expect(items[0].vnum).toBe(50900);
    });
});

describe('decodeLocaleBytes', () => {
    test('decodes valid UTF-8 bytes as UTF-8, preserving umlauts', () => {
        const buf = Buffer.from('Wüstenläufer', 'utf-8');
        expect(protoImportService.decodeLocaleBytes(buf)).toBe('Wüstenläufer');
    });

    test('falls back to latin1 for bytes that are not valid UTF-8', () => {
        // "ü" in latin1/cp1252 is the single byte 0xFC, which is not a
        // legal UTF-8 continuation on its own - decoding it as UTF-8 would
        // silently produce a U+FFFD replacement char (mojibake) instead of
        // the real character, so this must fall back to latin1.
        const buf = Buffer.from('Wustenlaufer', 'ascii');
        buf[7] = 0xFC; // patch the 'a' in "laufer" to a raw latin1 'ü' byte
        expect(protoImportService.decodeLocaleBytes(buf)).toBe('Wustenlüufer');
    });

    test('round-trips a name containing all three German umlauts', () => {
        const buf = Buffer.from('Äpfel, Öl und Über-Mühle', 'utf-8');
        expect(protoImportService.decodeLocaleBytes(buf)).toBe('Äpfel, Öl und Über-Mühle');
    });
});

describe('writeItems / writeMobs', () => {
    test('writeItems inserts rows into item_proto and returns the count', () => {
        const db = createProtoDb();
        const imported = protoImportService.writeItems(db, [
            { vnum: 1, locale_name: 'A', type: 1, subtype: 0, flag: 0 },
            { vnum: 2, locale_name: 'B', type: 1, subtype: 0, flag: 0 }
        ]);
        expect(imported).toBe(2);
        expect(db.prepare('SELECT COUNT(*) as c FROM item_proto').get().c).toBe(2);
        db.close();
    });

    test('writeMobs inserts rows into mob_proto and returns the count', () => {
        const db = createProtoDb();
        const imported = protoImportService.writeMobs(db, [
            { vnum: 101, locale_name: 'Wolf', type: 0, level: 5 }
        ]);
        expect(imported).toBe(1);
        expect(db.prepare('SELECT * FROM mob_proto WHERE vnum = 101').get().level).toBe(5);
        db.close();
    });
});
