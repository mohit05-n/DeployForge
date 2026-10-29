const fs = require('fs');
const path = require('path');
const net = require('net');

const DB_PORT = parseInt(process.env.PG_PORT || '54332', 10);
const DB_USER = process.env.PG_USER || 'postgres';
const DB_PASSWORD = process.env.PG_PASSWORD || 'deployforge_dev';
const DB_NAME = process.env.PG_DATABASE || 'deployforge';
const DATA_DIR = path.resolve(__dirname, '..', '.postgres-data');

function checkPortInUse(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

async function main() {
  const inUse = await checkPortInUse(DB_PORT);
  if (inUse) {
    console.log(`[DeployForge DB] PostgreSQL already running on port ${DB_PORT}`);
    return;
  }

  console.log(`[DeployForge DB] Starting embedded PostgreSQL on port ${DB_PORT}...`);
  const EmbeddedPostgres = require('embedded-postgres').default;
  const pg = new EmbeddedPostgres({
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    databaseDir: DATA_DIR,
    persistent: true,
  });

  if (!fs.existsSync(DATA_DIR)) {
    console.log('[DeployForge DB] Initializing fresh PostgreSQL cluster...');
    await pg.initialise();
  }

  await pg.start();
  console.log(`[DeployForge DB] PostgreSQL started successfully on port ${DB_PORT}!`);

  // Create database if not exists
  const { Client } = require('pg');
  const client = new Client({
    host: '127.0.0.1',
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: 'postgres',
  });

  try {
    await client.connect();
    const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [DB_NAME]);
    if (res.rowCount === 0) {
      console.log(`[DeployForge DB] Creating database "${DB_NAME}"...`);
      await client.query(`CREATE DATABASE "${DB_NAME}"`);
      console.log(`[DeployForge DB] Database "${DB_NAME}" created successfully.`);
    } else {
      console.log(`[DeployForge DB] Database "${DB_NAME}" exists.`);
    }
  } catch (err) {
    console.warn('[DeployForge DB] Database creation notice:', err.message);
  } finally {
    await client.end();
  }

  // Handle termination
  const cleanExit = async () => {
    console.log('[DeployForge DB] Shutting down embedded PostgreSQL...');
    try {
      await pg.stop();
    } catch (_) {}
    process.exit(0);
  };

  process.on('SIGINT', cleanExit);
  process.on('SIGTERM', cleanExit);

  // Keep alive if run directly
  if (process.argv.includes('--daemon')) {
    console.log('[DeployForge DB] Ready and listening for connections.');
    // Keep event loop active
    setInterval(() => {}, 1000 * 60 * 60);
  }
}

main().catch((err) => {
  console.error('[DeployForge DB] Failed to start database:', err);
  process.exit(1);
});
