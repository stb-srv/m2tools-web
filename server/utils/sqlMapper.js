/**
 * M2-Tools – SQL Utility & Mapper
 * 
 * Handles SQL translation from MySQL/MariaDB syntax to SQLite.
 */

/**
 * Translates a MySQL query to an equivalent SQLite query.
 * Known limitations: Complex MySQL functions or subqueries might not map 1:1.
 * 
 * @param {string} sql – The original SQL query (MySQL syntax assumed)
 * @param {any[]} params – Query parameters
 * @returns {{ sql: string, params: any[] }} – Translated SQL and parameters
 */
function translateMysqlToSqlite(sql, params = []) {
    let normalizedSql = sql.trim();
    const expandedParams = [];
    let paramIndex = 0;

    // 1. Expand IN (?) with arrays
    normalizedSql = normalizedSql.replace(/\?/g, () => {
        const param = params[paramIndex++];
        if (Array.isArray(param)) {
            const placeholders = param.map(v => {
                expandedParams.push(v);
                return '?';
            }).join(', ');
            return placeholders;
        }
        expandedParams.push(param);
        return '?';
    });

    // 2. Data Type & Constraint Mapping
    normalizedSql = normalizedSql
        .replace(/INT\s+AUTO_INCREMENT/gi, 'INTEGER')
        .replace(/AUTO_INCREMENT/gi, 'AUTOINCREMENT')
        .replace(/VARCHAR\s*\(\d+\)/gi, 'TEXT')
        .replace(/TIMESTAMP\s+DEFAULT\s+CURRENT_TIMESTAMP/gi, 'TEXT DEFAULT CURRENT_TIMESTAMP')
        .replace(/ON\s+DUPLICATE\s+KEY\s+UPDATE.*/gi, ''); // SQLite doesn't natively support this syntax globally

    // 3. Handle INSERT IGNORE (MySQL) -> INSERT OR IGNORE (SQLite)
    if (normalizedSql.toUpperCase().startsWith('INSERT IGNORE')) {
        normalizedSql = normalizedSql.replace(/INSERT IGNORE/i, 'INSERT OR IGNORE');
    }

    // 4. Handle REPLACE INTO (Common in both, but SQLite behavior is slightly different)
    // No change for basic REPLACE INTO

    return { sql: normalizedSql, params: expandedParams };
}

/**
 * Checks if a query is a SELECT/PRAGMA (read-only in some contexts)
 */
function isReadQuery(sql) {
    return /^\s*(SELECT|PRAGMA|SHOW|DESCRIBE)/i.test(sql);
}

module.exports = { translateMysqlToSqlite, isReadQuery };
