import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function globalSetup() {
  const dbPath = path.join(__dirname, '..', 'backend', 'database', 'test.db');
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  execSync('node backend/init-db.js', {
    stdio: 'inherit',
    env: {
      ...process.env,
      DB_PATH: dbPath,
    },
  });
}
