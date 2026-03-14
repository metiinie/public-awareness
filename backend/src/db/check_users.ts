import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import * as dotenv from 'dotenv';

dotenv.config();
const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client, { schema });

async function check() {
  const allUsers = await db.select().from(schema.users);
  console.log('Total users:', allUsers.length);
  console.log('Users:', allUsers.map(u => ({ email: u.email, role: u.role })));
  await client.end();
}
check().catch(console.error);
