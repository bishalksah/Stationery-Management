import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import mysql from 'mysql2/promise';
import { existsSync } from 'node:fs';

const root = path.dirname(fileURLToPath(import.meta.url));
if (existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
const sourcePath = process.env.SQLITE_PATH || path.join(root, 'data', 'quest-stationery.sqlite');
if (!existsSync(sourcePath)) throw new Error(`SQLite file not found: ${sourcePath}`);
const source = new DatabaseSync(sourcePath, { readOnly: true });
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'quest_stationery',
  waitForConnections: true,
  connectionLimit: 4,
  charset: 'utf8mb4',
  timezone: 'Z'
});

const schema = [
  `CREATE TABLE IF NOT EXISTS app_meta (meta_key VARCHAR(100) PRIMARY KEY, value TEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS users (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL, username VARCHAR(60) COLLATE utf8mb4_unicode_ci NOT NULL UNIQUE, password_salt VARCHAR(64) NOT NULL, password_hash VARCHAR(128) NOT NULL, photo LONGTEXT NULL, role VARCHAR(30) NOT NULL DEFAULT 'admin', created_at VARCHAR(40) NOT NULL DEFAULT '', department VARCHAR(120) NOT NULL DEFAULT '') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash CHAR(64) PRIMARY KEY, user_id INT NOT NULL, expires_at BIGINT NOT NULL, CONSTRAINT fk_sessions_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS items (id VARCHAR(40) PRIMARY KEY, name VARCHAR(120) NOT NULL, brand VARCHAR(120) NOT NULL DEFAULT '', category VARCHAR(80) NOT NULL, qty INT NOT NULL DEFAULT 0, price DECIMAL(12,2) NOT NULL DEFAULT 0, threshold INT NOT NULL DEFAULT 0, icon VARCHAR(24) NOT NULL DEFAULT '📦', vendor VARCHAR(120) NOT NULL DEFAULT '', entry_date VARCHAR(10) NOT NULL DEFAULT '') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS transactions (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, item_id VARCHAR(40) NULL, item_name VARCHAR(120) NOT NULL, person VARCHAR(120) NOT NULL DEFAULT '', quantity INT NOT NULL, issued_by VARCHAR(120) NOT NULL, issued_at VARCHAR(40) NOT NULL, institution VARCHAR(120) NOT NULL DEFAULT '', unit_price DECIMAL(12,2) NOT NULL DEFAULT 0, CONSTRAINT fk_transactions_item FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE SET NULL, INDEX idx_transactions_issued_at(issued_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS requisitions (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, requester_id INT NULL, requester_name VARCHAR(120) NOT NULL, department VARCHAR(120) NOT NULL, item_id VARCHAR(40) NULL, item_name VARCHAR(120) NOT NULL, quantity INT NOT NULL, purpose VARCHAR(500) NOT NULL DEFAULT '', status VARCHAR(20) NOT NULL DEFAULT 'pending', created_at VARCHAR(40) NOT NULL, decided_by VARCHAR(120) NOT NULL DEFAULT '', decided_at VARCHAR(40) NOT NULL DEFAULT '', transaction_id INT NULL, CONSTRAINT fk_requisitions_user FOREIGN KEY(requester_id) REFERENCES users(id) ON DELETE SET NULL, CONSTRAINT fk_requisitions_item FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE SET NULL, CONSTRAINT fk_requisitions_transaction FOREIGN KEY(transaction_id) REFERENCES transactions(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS support_tickets (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, created_by INT NULL, created_name VARCHAR(120) NOT NULL, created_username VARCHAR(60) NOT NULL, subject VARCHAR(150) NOT NULL, category VARCHAR(80) NOT NULL, message TEXT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'open', staff_reply VARCHAR(5000) NOT NULL DEFAULT '', created_at VARCHAR(40) NOT NULL, updated_at VARCHAR(40) NOT NULL, resolved_by INT NULL, CONSTRAINT fk_support_creator FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL, CONSTRAINT fk_support_resolver FOREIGN KEY(resolved_by) REFERENCES users(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS notifications (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, recipient_id INT NOT NULL, kind VARCHAR(40) NOT NULL, title VARCHAR(200) NOT NULL, message TEXT NOT NULL, section VARCHAR(40) NOT NULL DEFAULT 'dashboard', created_at VARCHAR(40) NOT NULL, read_at VARCHAR(40) NOT NULL DEFAULT '', CONSTRAINT fk_notifications_user FOREIGN KEY(recipient_id) REFERENCES users(id) ON DELETE CASCADE, INDEX idx_notifications_recipient(recipient_id,created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
];

const tableOrder = ['app_meta', 'users', 'items', 'transactions', 'requisitions', 'support_tickets', 'notifications', 'sessions'];
const connection = await pool.getConnection();
try {
  for (const sql of schema) await connection.query(sql);
  const counts = {};
  for (const table of tableOrder) {
    const [[row]] = await connection.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
    counts[table] = Number(row.count);
  }
  if (Object.values(counts).some(Boolean)) {
    throw new Error('The MySQL tables already contain data. Migration stopped to prevent duplicates. Use a new empty database, or back it up and clear it before retrying.');
  }

  await connection.beginTransaction();
  for (const table of tableOrder) {
    const rows = source.prepare(`SELECT * FROM ${table}`).all();
    for (const original of rows) {
      const row = { ...original };
      if (table === 'app_meta') { row.meta_key = row.key; delete row.key; }
      const columns = Object.keys(row);
      const placeholders = columns.map(() => '?').join(',');
      const names = columns.map(name => `\`${name}\``).join(',');
      await connection.execute(`INSERT INTO \`${table}\` (${names}) VALUES (${placeholders})`, columns.map(name => row[name]));
    }
    console.log(`${table}: ${rows.length} rows copied`);
  }
  await connection.commit();
  console.log(`Migration complete from ${sourcePath}`);
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
  source.close();
  await pool.end();
}
