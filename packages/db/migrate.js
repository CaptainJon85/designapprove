require('../../scripts/load-env');
const fs = require('fs');
const path = require('path');
const db = require('./index');

async function main(){
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(sql);
  console.log('database schema is ready');
  await db.close();
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
