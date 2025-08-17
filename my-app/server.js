// my-app/server.js

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

let server;
let db;

const app = express();
app.use(cors());
app.use(express.json());

/**
 * Initializes the database connection and creates the 'records' table if it doesn't exist.
 * @param {string} dbPath - The file path for the SQLite database.
 */
function initDb(dbPath) {
  db = new Database(dbPath);
  // WAL mode provides better performance and concurrency.
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      data TEXT NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log(`Database initialized at ${dbPath}`);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ ok: true });
});

// GET /records?type=...
app.get('/records', (req, res) => {
  const { type } = req.query;
  if (!type) {
    return res.status(400).json({ error: 'Query parameter "type" is required.' });
  }

  try {
    const stmt = db.prepare('SELECT * FROM records WHERE type = ? ORDER BY createdAt DESC');
    const records = stmt.all(type);
    // Parse the 'data' field from JSON string to an object for each record
    const parsedRecords = records.map(r => ({ ...r, data: JSON.parse(r.data) }));
    res.status(200).json(parsedRecords);
  } catch (error) {
    res.status(500).json({ error: `Database error: ${error.message}` });
  }
});

// GET /records/:id
app.get('/records/:id', (req, res) => {
  const { id } = req.params;
  try {
    const stmt = db.prepare('SELECT * FROM records WHERE id = ?');
    const record = stmt.get(id);

    if (record) {
      record.data = JSON.parse(record.data);
      res.status(200).json(record);
    } else {
      res.status(404).json({ error: `Record with id ${id} not found.` });
    }
  } catch (error) {
    res.status(500).json({ error: `Database error: ${error.message}` });
  }
});

// POST /records
app.post('/records', (req, res) => {
  const { type, data } = req.body;

  if (!type || typeof type !== 'string' || type.trim() === '' || !data) {
    return res.status(400).json({ error: 'Fields "type" (non-empty string) and "data" are required.' });
  }

  try {
    const dataString = JSON.stringify(data);
    const stmt = db.prepare('INSERT INTO records (type, data) VALUES (?, ?)');
    const info = stmt.run(type, dataString);

    res.status(201).json({ id: info.lastInsertRowid, type, data });
  } catch (error) {
    res.status(500).json({ error: `Database error: ${error.message}` });
  }
});

// PUT /records/:id
app.put('/records/:id', (req, res) => {
  const { id } = req.params;
  const { type, data } = req.body;

  if (!type && !data) {
    return res.status(400).json({ error: 'At least one of "type" or "data" is required for update.' });
  }

  try {
    const fields = [];
    const params = [];
    if (type) {
      if (typeof type !== 'string' || type.trim() === '') {
        return res.status(400).json({ error: '"type" must be a non-empty string.' });
      }
      fields.push('type = ?');
      params.push(type);
    }
    if (data) {
      fields.push('data = ?');
      params.push(JSON.stringify(data));
    }
    params.push(id);

    const stmt = db.prepare(`UPDATE records SET ${fields.join(', ')} WHERE id = ?`);
    const info = stmt.run(...params);

    if (info.changes > 0) {
      const updatedRecordStmt = db.prepare('SELECT * FROM records WHERE id = ?');
      const updatedRecord = updatedRecordStmt.get(id);
      updatedRecord.data = JSON.parse(updatedRecord.data);
      res.status(200).json(updatedRecord);
    } else {
      res.status(404).json({ error: `Record with id ${id} not found.` });
    }
  } catch (error) {
    res.status(500).json({ error: `Database error: ${error.message}` });
  }
});

// DELETE /records/:id
app.delete('/records/:id', (req, res) => {
  const { id } = req.params;
  try {
    const stmt = db.prepare('DELETE FROM records WHERE id = ?');
    const info = stmt.run(id);

    if (info.changes > 0) {
      res.status(204).send(); // No Content
    } else {
      res.status(404).json({ error: `Record with id ${id} not found.` });
    }
  } catch (error) {
    res.status(500).json({ error: `Database error: ${error.message}` });
  }
});

/**
 * Starts the Express server on port 3000.
 * @param {string} dbPath - The file path for the SQLite database.
 * @returns {Promise<void>} A promise that resolves when the server has started.
 */
function startServer(dbPath) {
  return new Promise((resolve, reject) => {
    try {
      initDb(dbPath);
      server = app.listen(3000, () => {
        console.log('Backend server started on http://localhost:3000');
        resolve();
      });
    } catch (error) {
      console.error('Failed to start server:', error);
      reject(error);
    }
  });
}

/**
 * Stops the Express server and closes the database connection.
 * @returns {Promise<void>} A promise that resolves when the server has stopped.
 */
function stopServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        console.log('Backend server stopped.');
        if (db) {
          db.close();
          console.log('Database connection closed.');
        }
        resolve();
      });
    } else {
      if (db) {
        db.close();
        console.log('Database connection closed.');
      }
      resolve();
    }
  });
}

module.exports = { startServer, stopServer };
