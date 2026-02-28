const fs = require('fs');
const { getDb } = require('../db');
const config = require('../config');

function importGapList() {
  const db = getDb();
  let total = 0;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO watchlist (title, year, category, priority, lane, source, notes)
    VALUES (@title, @year, 'gap_fill', @priority, @lane, @source, @notes)
  `);

  // Import must-fix 29
  if (fs.existsSync(config.GAP_LIST_PATH)) {
    const data = parseCSV(fs.readFileSync(config.GAP_LIST_PATH, 'utf8'));
    const importBatch = db.transaction(() => {
      let count = 0;
      for (const row of data) {
        if (!row.Title) continue;
        insert.run({
          title: row.Title,
          year: row.Year ? Math.floor(Number(row.Year)) : null,
          priority: row.PriorityOrder ? Number(row.PriorityOrder) : 0,
          lane: row.Lane || null,
          source: 'gap_mustfix_29',
          notes: row.Lists || null,
        });
        count++;
      }
      return count;
    });
    total += importBatch();
  }

  // Import master gap list
  if (fs.existsSync(config.GAP_MASTER_PATH)) {
    const data = parseCSV(fs.readFileSync(config.GAP_MASTER_PATH, 'utf8'));
    const importBatch = db.transaction(() => {
      let count = 0;
      for (const row of data) {
        if (!row.Title) continue;
        insert.run({
          title: row.Title,
          year: row.Year ? Math.floor(Number(row.Year)) : null,
          priority: row.PriorityOrder ? Number(row.PriorityOrder) : 100,
          lane: row.Lane || null,
          source: 'gap_master',
          notes: row.Lists || null,
        });
        count++;
      }
      return count;
    });
    total += importBatch();
  }

  console.log(`Imported ${total} gap list items into watchlist.`);
  return total;
}

function parseCSV(content) {
  const lines = content.split('\n');
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((h, idx) => { row[h.trim()] = values[idx] || ''; });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

module.exports = { importGapList };
