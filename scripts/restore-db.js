const fs = require('fs');
const path = require('path');

const sourceArg = process.argv[2];
if (!sourceArg) {
  console.error('Informe o arquivo de backup para restaurar, exemplo: npm run restore:db -- ./backups/forca-foco-backup-2026-01-01.db');
  process.exit(1);
}

const source = path.resolve(__dirname, '..', sourceArg);
const target = path.resolve(__dirname, '..', process.env.DB_PATH || './data/forca-foco.db');

if (!fs.existsSync(source)) {
  console.error(`Arquivo de backup não encontrado: ${source}`);
  process.exit(1);
}

fs.copyFileSync(source, target);
console.log(`Banco restaurado de ${source} para ${target}`);
