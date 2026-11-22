import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function createD1SqliteAdapter(dbPath = ':memory:') {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const sqlite = new DatabaseSync(dbPath);
  if (dbPath !== ':memory:') {
    sqlite.exec('PRAGMA journal_mode = WAL;');
  }

  // Apply D1 migrations in order
  const initSql = fs.readFileSync(path.resolve(process.cwd(), 'migrations/0001_init.sql'), 'utf8');
  const multiShopSql = fs.readFileSync(path.resolve(process.cwd(), 'migrations/0002_multi_shop.sql'), 'utf8');
  sqlite.exec(initSql);
  try {
    sqlite.exec(multiShopSql);
  } catch {
    // Already applied on existing local db
  }

  function makeBoundStatement(sql, params = []) {
    return {
      sql,
      params,
      bind(...nextParams) {
        return makeBoundStatement(sql, nextParams);
      },
      async first() {
        const row = sqlite.prepare(sql).get(...params);
        return row ?? null;
      },
      async all() {
        const results = sqlite.prepare(sql).all(...params);
        return { results };
      },
      async run() {
        const res = sqlite.prepare(sql).run(...params);
        return {
          success: true,
          meta: {
            last_row_id: Number(res.lastInsertRowid || 0),
            changes: Number(res.changes || 0),
          },
        };
      },
    };
  }

  return {
    raw: sqlite,
    close() {
      sqlite.close();
    },
    prepare(sql) {
      return makeBoundStatement(sql, []);
    },
    async batch(stmts) {
      const out = [];
      sqlite.exec('BEGIN');
      try {
        for (const s of stmts) {
          out.push(await s.run());
        }
        sqlite.exec('COMMIT');
        return out;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
  };
}
