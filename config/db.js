const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ,
  database: process.env.DB_NAME ,
  user: process.env.DB_USER ,
  password: process.env.DB_PASSWORD || '', 
});

// Test the connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Database connection failed:', err.message);
    return;
  }
  client.query('SELECT NOW()', (err, result) => {
    release();
    if (err) {
      console.error(' Query failed:', err.message);
      return;
    }
    console.log(' Database connected successfully at:', result.rows[0].now);
  });
});

module.exports = pool;