import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // ssl: { rejectUnauthorized: false }   // uncomment if needed
});

// Function that tests the connection
const connectDB = async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('✅ Database connected successfully at:', res.rows[0].now);
  } catch (err) {
    console.error('❌ Database connection failed:', err.stack);
    process.exit(1); // optional: stop the app if DB is down
  }
};

export { pool };          // export the pool so you can use it later
export default connectDB; // default export = the connect function