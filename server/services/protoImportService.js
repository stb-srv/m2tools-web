/**
 * M2-Tools – Proto Import Service
 *
 * Shared parsing + DB-write logic for item_proto/mob_proto imports.
 * Used by both the proto_import module (body-based import) and the
 * workspaces module (file upload import) to avoid duplicating the
 * parsing and insert logic in two places.
 */

/**
 * Parse tab-separated (or ;/,/space-separated, or raw SQL INSERT) proto text.
 */
function parseProtoText(text, type) {
    if (!text) return [];

    // Remove BOM (Byte Order Mark)
    if (text.charCodeAt(0) === 0xFEFF) {
        text = text.substring(1);
    }

    // Split into lines
    const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'));
    if (lines.length === 0) return [];

    // Detect separator based on first valid data line
    const firstLine = lines[0];
    let separator = '\t'; // Default

    // Logic to detect SQL
    if (firstLine.toUpperCase().includes('INSERT INTO')) {
        return parseSqlProto(lines, type);
    }

    if (!firstLine.includes('\t')) {
        if (firstLine.includes(';')) separator = ';';
        else if (firstLine.includes('  ')) separator = /\s\s+/; // Multiple spaces
        else if (firstLine.includes(',')) separator = ',';
        else if (firstLine.includes(' ')) separator = ' '; // Single space fallback
    }

    const results = [];
    for (const line of lines) {
        let cols = line.split(separator).map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (cols.length < 2) continue;

        const vnum = parseInt(cols[0]);
        if (isNaN(vnum) || vnum === 0) continue;

        if (type === 'item') {
            results.push({
                vnum,
                locale_name: cols[1] || '',
                type: parseInt(cols[2]) || 0,
                subtype: parseInt(cols[3]) || 0,
                flag: parseInt(cols[4]) || 0
            });
        } else {
            results.push({
                vnum,
                locale_name: cols[1] || '',
                type: parseInt(cols[2]) || 0,
                level: parseInt(cols[3]) || 0
            });
        }
    }

    return results;
}

/**
 * Handle SQL INSERT statements
 */
function parseSqlProto(lines, type) {
    const results = [];
    const regex = /VALUES\s*\((.*?)\)/i;

    for (const line of lines) {
        const match = line.match(regex);
        if (!match) continue;

        // Split values by comma, but respect quoted strings
        const values = match[1].split(/,(?=(?:(?:[^']*'){2})*[^']*$)/).map(v => v.trim().replace(/^['"]|['"]$/g, ''));

        if (values.length < 2) continue;

        const vnum = parseInt(values[0]);
        if (isNaN(vnum) || vnum === 0) continue;

        if (type === 'item') {
            results.push({
                vnum,
                locale_name: values[1] || '',
                type: parseInt(values[2]) || 0,
                subtype: parseInt(values[3]) || 0,
                flag: parseInt(values[4]) || 0
            });
        } else {
            results.push({
                vnum,
                locale_name: values[1] || '',
                type: parseInt(values[2]) || 0,
                level: parseInt(values[3]) || 0
            });
        }
    }
    return results;
}

/**
 * Parses an uploaded file buffer as proto text, retrying with latin1
 * encoding if the utf-8 parse yields no entries (common with legacy
 * Metin2 proto files that aren't UTF-8 encoded).
 */
function parseUploadedProtoFile(buffer, type) {
    const entries = parseProtoText(buffer.toString('utf-8'), type);
    if (entries.length > 0) return entries;
    return parseProtoText(buffer.toString('latin1'), type);
}

/**
 * Decodes a single locale-name BLOB value (e.g. mob_proto/item_proto
 * locale_name columns from an uploaded proto.db - real client proto.db
 * files store that column as raw bytes, not TEXT). Prefers UTF-8, same as
 * parseUploadedProtoFile() above, falling back to latin1 for files that
 * predate UTF-8 adoption (common with older German/EU server tooling).
 *
 * Decoding non-UTF-8 bytes as UTF-8 doesn't throw - it silently produces
 * U+FFFD replacement characters - so that's the fallback trigger. Without
 * this, umlauts (ä/ö/ü) in a UTF-8-stored name show up as garbled
 * multi-character mojibake ("Ã¤" etc.) whenever forced through latin1.
 */
function decodeLocaleBytes(buf) {
    const utf8 = buf.toString('utf-8');
    return utf8.includes('�') ? buf.toString('latin1') : utf8;
}

/**
 * Inserts parsed items into a workspace's proto.db (INSERT OR REPLACE).
 * Returns the number of rows written.
 */
function writeItems(wsDb, items) {
    let imported = 0;
    const insertStmt = wsDb.prepare(
        `INSERT OR REPLACE INTO item_proto (vnum, locale_name, type, subtype, flag) VALUES (?, ?, ?, ?, ?)`
    );

    const transaction = wsDb.transaction((rows) => {
        for (const item of rows) {
            insertStmt.run(
                parseInt(item.vnum) || 0,
                item.locale_name || item.name || '',
                parseInt(item.type) || 0,
                parseInt(item.subtype) || 0,
                parseInt(item.flag) || 0
            );
            imported++;
        }
    });

    transaction(items);
    return imported;
}

/**
 * Inserts parsed mobs into a workspace's proto.db (INSERT OR REPLACE).
 * Returns the number of rows written.
 */
function writeMobs(wsDb, mobs) {
    let imported = 0;
    const insertStmt = wsDb.prepare(
        `INSERT OR REPLACE INTO mob_proto (vnum, locale_name, type, level) VALUES (?, ?, ?, ?)`
    );

    const transaction = wsDb.transaction((rows) => {
        for (const mob of rows) {
            insertStmt.run(
                parseInt(mob.vnum) || 0,
                mob.locale_name || mob.name || '',
                parseInt(mob.type) || 0,
                parseInt(mob.level) || 0
            );
            imported++;
        }
    });

    transaction(mobs);
    return imported;
}

module.exports = { parseProtoText, parseUploadedProtoFile, writeItems, writeMobs, decodeLocaleBytes };
