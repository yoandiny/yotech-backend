import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://yotechadmin:YoTech25%40@193.180.213.193:1552/yotechdb'
});

export const query = (text, params) => pool.query(text, params);

export default pool;
