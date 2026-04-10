import pkg from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://yotechadmin:YoTech25%40@193.180.213.193:1552/yotechdb'
});

const runSql = async () => {
  try {
    const sqlFile = new URL('./sql/init_finance_invoice_tables.sql', import.meta.url);
    const sql = fs.readFileSync(sqlFile, 'utf8');
    console.log('Execution du script SQL :', sqlFile.pathname);
    const result = await pool.query(sql);
    console.log('SQL exécuté avec succès.');
    console.log(result.command, result.rowCount);
  } catch (error) {
    console.error('Erreur lors de l\'exécution du script SQL :', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

runSql();
