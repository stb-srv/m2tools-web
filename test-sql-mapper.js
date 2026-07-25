const { translateMysqlToSqlite } = require('./server/utils/sqlMapper');

const testCases = [
    {
        name: 'Simple SELECT',
        sql: 'SELECT * FROM item_proto WHERE vnum = ?',
        params: [10],
        expectedSql: 'SELECT * FROM item_proto WHERE vnum = ?',
        expectedParams: [10]
    },
    {
        name: 'IN clause with array',
        sql: 'SELECT * FROM item_proto WHERE vnum IN (?)',
        params: [[10, 20, 30]],
        expectedSql: 'SELECT * FROM item_proto WHERE vnum IN (?, ?, ?)',
        expectedParams: [10, 20, 30]
    },
    {
        name: 'Data type mapping',
        sql: 'CREATE TABLE test (id INT AUTO_INCREMENT, name VARCHAR(50))',
        params: [],
        expectedSql: 'CREATE TABLE test (id INTEGER, name TEXT)',
        expectedParams: []
    },
    {
        name: 'INSERT IGNORE mapping',
        sql: 'INSERT IGNORE INTO system_settings (key, value) VALUES (?, ?)',
        params: ['k', 'v'],
        expectedSql: 'INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)',
        expectedParams: ['k', 'v']
    }
];

console.log('--- SQL Mapper Verification ---');
let passed = 0;
testCases.forEach(tc => {
    const { sql, params } = translateMysqlToSqlite(tc.sql, tc.params);
    const sqlMatch = sql === tc.expectedSql;
    const paramsMatch = JSON.stringify(params) === JSON.stringify(tc.expectedParams);
    
    if (sqlMatch && paramsMatch) {
        console.log(`[PASS] ${tc.name}`);
        passed++;
    } else {
        console.log(`[FAIL] ${tc.name}`);
        console.log(`  Expected: ${tc.expectedSql} | ${JSON.stringify(tc.expectedParams)}`);
        console.log(`  Actual:   ${sql} | ${JSON.stringify(params)}`);
    }
});

console.log(`\nResult: ${passed}/${testCases.length} tests passed.`);
if (passed !== testCases.length) process.exit(1);
