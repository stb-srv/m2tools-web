const { translateMysqlToSqlite, isReadQuery } = require('../server/utils/sqlMapper');

describe('translateMysqlToSqlite', () => {
    test('leaves a simple parameterized SELECT unchanged', () => {
        const { sql, params } = translateMysqlToSqlite(
            'SELECT * FROM item_proto WHERE vnum = ?',
            [10]
        );
        expect(sql).toBe('SELECT * FROM item_proto WHERE vnum = ?');
        expect(params).toEqual([10]);
    });

    test('expands an IN (?) placeholder with an array param', () => {
        const { sql, params } = translateMysqlToSqlite(
            'SELECT * FROM item_proto WHERE vnum IN (?)',
            [[10, 20, 30]]
        );
        expect(sql).toBe('SELECT * FROM item_proto WHERE vnum IN (?, ?, ?)');
        expect(params).toEqual([10, 20, 30]);
    });

    test('maps MySQL data types to SQLite equivalents', () => {
        const { sql } = translateMysqlToSqlite(
            'CREATE TABLE test (id INT AUTO_INCREMENT, name VARCHAR(50))',
            []
        );
        expect(sql).toBe('CREATE TABLE test (id INTEGER, name TEXT)');
    });

    test('maps INSERT IGNORE to INSERT OR IGNORE', () => {
        const { sql, params } = translateMysqlToSqlite(
            'INSERT IGNORE INTO system_settings (key, value) VALUES (?, ?)',
            ['k', 'v']
        );
        expect(sql).toBe('INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)');
        expect(params).toEqual(['k', 'v']);
    });

    test('strips ON DUPLICATE KEY UPDATE (known limitation: dropped, not translated)', () => {
        const { sql } = translateMysqlToSqlite(
            "INSERT INTO t (a) VALUES (?) ON DUPLICATE KEY UPDATE a = VALUES(a)",
            [1]
        );
        // The clause is removed rather than translated to SQLite's
        // "ON CONFLICT DO UPDATE" syntax - callers relying on upsert
        // behavior here will silently get plain INSERT semantics instead.
        expect(sql).toBe('INSERT INTO t (a) VALUES (?) ');
    });

    test('handles multiple IN-array params in the same query', () => {
        const { sql, params } = translateMysqlToSqlite(
            'SELECT * FROM t WHERE a IN (?) AND b = ? AND c IN (?)',
            [[1, 2], 5, [3, 4, 5]]
        );
        expect(sql).toBe('SELECT * FROM t WHERE a IN (?, ?) AND b = ? AND c IN (?, ?, ?)');
        expect(params).toEqual([1, 2, 5, 3, 4, 5]);
    });
});

describe('isReadQuery', () => {
    test.each([
        ['SELECT * FROM item_proto', true],
        ['  select id from m2em_users', true],
        ['PRAGMA foreign_keys', true],
        ['INSERT INTO item_proto (vnum) VALUES (1)', false],
        ['UPDATE m2em_users SET role = ?', false],
        ['DELETE FROM workspaces WHERE id = ?', false],
    ])('%s -> %s', (sql, expected) => {
        expect(isReadQuery(sql)).toBe(expected);
    });
});
