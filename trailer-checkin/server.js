import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDb, createStore } from './src/db.js';
import { createHandler } from './src/app.js';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;
const dbPath = process.env.DB_PATH || join(root, 'data', 'trailers.db');

const store = createStore(openDb(dbPath));
const handler = createHandler({ store, publicDir: join(root, 'public') });

createServer(handler).listen(port, () => {
  console.log(`Trailer check-in running at http://localhost:${port} (db: ${dbPath})`);
});
