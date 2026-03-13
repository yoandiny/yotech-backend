import { query } from '../config/db.js';

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
      await query(
        'INSERT INTO users (username, password) VALUES ($1, $2)',
        ['admin', 'yotech2025'] // In a real app, this should be hashed
      );
    }
    
    console.log('Database initialization complete.');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
};

initDb();
