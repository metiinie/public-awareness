import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import * as dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const client = postgres(connectionString, { ssl: 'require' });
const db = drizzle(client, { schema });

async function seed() {
  console.log('Seeding Database...');

  // Categories
  const categories = [
    { name: 'Traffic', icon: 'Car' },
    { name: 'Power', icon: 'Zap' },
    { name: 'Water', icon: 'Droplets' },
    { name: 'Road Damage', icon: 'Construction' },
    { name: 'Garbage', icon: 'Trash2' },
    { name: 'Other', icon: 'MoreHorizontal' },
  ];

  for (const cat of categories) {
    await db.insert(schema.categories).values(cat).onConflictDoNothing();
  }
  console.log('Categories seeded.');

  // Cities
  const cities = ['Addis Ababa', 'Gondar', 'Awasa'];
  for (const c of cities) {
    await db.insert(schema.cities).values({ name: c }).onConflictDoNothing();
  }
  console.log('Cities seeded.');

  // Areas
  const allCities = await db.select().from(schema.cities);
  const cityMap = allCities.reduce((acc, city) => ({ ...acc, [city.name]: city.id }), {} as Record<string, number>);

  const areas = {
    'Addis Ababa': ['Bole', 'Kazanchis', 'Piassa', 'Sarbet'],
    'Gondar': ['City Center', 'Azezo'],
    'Awasa': ['Tabor', 'Piazza'],
  };

  for (const [cityName, areaList] of Object.entries(areas)) {
    const cityId = cityMap[cityName];
    if (cityId) {
      for (const areaName of areaList) {
        // Can't easily onConflictDoNothing without a unique constraint on area_name + city_id
        // But we just recreated db so it's empty
        try {
          await db.insert(schema.areas).values({ name: areaName, cityId });
        } catch (err: any) {
            console.error(`Error inserting area ${areaName}:`, err.message);
        }
      }
    }
  }

  console.log('Areas seeded.');

  await client.end();
  console.log('Database seeded successfully!');
}

seed().catch(console.error);
