const fs = require('fs');
const path = require('path');
const { db } = require('../src/db');

const source = process.env.DB_PATH || './data/forca-foco.db';
const targetDir = path.join(__dirname, '..', 'backups');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.join(targetDir, `forca-foco-backup-${timestamp}.db`);

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
console.log(`Backup criado em: ${target}`);
