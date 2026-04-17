const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

let db;

function getDb() {
  if (!db) {
    db = new Database(path.join(__dirname, '..', 'db', 'claudius.db'));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
    db.exec(schema);
  }
  return db;
}

// Returns array of rows
function query(sql, params = []) {
  return getDb().prepare(sql).all(...params);
}

// Returns first row or null
function queryOne(sql, params = []) {
  return getDb().prepare(sql).get(...params) || null;
}

// For INSERT/UPDATE/DELETE — returns { rowCount, rows, lastInsertRowid }
function execute(sql, params = []) {
  const result = getDb().prepare(sql).run(...params);
  return { rowCount: result.changes, rows: [], lastInsertRowid: result.lastInsertRowid };
}

// Transaction wrapper — fn receives a client with .query() for PG-API compat
async function transaction(fn) {
  const d = getDb();
  const client = {
    query(sql, params = []) {
      const stmt = d.prepare(sql);
      if (stmt.reader) {
        return { rows: stmt.all(...params) };
      }
      const result = stmt.run(...params);
      return { rows: [], rowCount: result.changes };
    },
  };
  d.exec('BEGIN');
  try {
    const result = await fn(client);
    d.exec('COMMIT');
    return result;
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { getDb, query, queryOne, execute, transaction };
