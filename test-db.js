require('dotenv').config();
const { Client } = require('pg');
const test = async (url, label) => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log(`✅ ${label}: Connected!`);
    await client.end();
  } catch (e) {
    console.log(`❌ ${label}: ${e.message}`);
  }
};
test(process.env.DATABASE_URL, 'Pooler');
test(process.env.DIRECT_URL, 'Session');
