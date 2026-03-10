const postgres = require('postgres');
require('dotenv').config();

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

async function checkUsers() {
    try {
        const users = await sql`SELECT id, email, full_name FROM users LIMIT 10`;
        console.log('Users in DB:', JSON.stringify(users, null, 2));
        
        const count = await sql`SELECT count(*) FROM users`;
        console.log('Total users:', count[0].count);
    } catch (error) {
        console.error('Error connecting to DB:', error);
    } finally {
        await sql.end();
    }
}

checkUsers();
