import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './src/db/schema';
import * as dotenv from 'dotenv';
dotenv.config();

const main = async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set');
    return;
  }
  const client = postgres(connectionString);
  const db = drizzle(client, { schema });
  try {
    const res = await db.select().from(schema.restaurants);
    console.log('Restaurant count:', res.length);
    if (res.length > 0) {
      console.log('First 3 restaurants:', res.slice(0, 3).map(r => r.name));
    }
    const areaRes = await db.select().from(schema.areas);
    console.log('Area count:', areaRes.length);
    const cityRes = await db.select().from(schema.cities);
    console.log('City count:', cityRes.length);
  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    await client.end();
  }
};

main();
