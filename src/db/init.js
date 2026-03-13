import { query } from '../config/db.js';
import bcrypt from 'bcryptjs';

const initDb = async () => {
  try {
    console.log('Initializing database...');
    
    // Create users table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Check if admin user exists, if not create one
    const result = await query('SELECT * FROM users WHERE username = $1', ['admin']);
    if (result.rows.length === 0) {
      console.log('Creating default admin user...');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('yotech2025', salt);
      await query(
        'INSERT INTO users (username, password) VALUES ($1, $2)',
        ['admin', hashedPassword]
      );
    } else {
      // Re-hash the password in case it's stored as plain text
      console.log('Updating existing admin user password hash...');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('yotech2025', salt);
      await query(
        'UPDATE users SET password = $1 WHERE username = $2',
        [hashedPassword, 'admin']
      );
    }
    
    console.log('Database initialization complete.');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
};

initDb();
