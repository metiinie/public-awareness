import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and } from 'drizzle-orm';
import * as schema from './schema';
import * as dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const client = postgres(connectionString);
const db = drizzle(client, { schema });

async function seed() {
  console.log('Seeding Database...');

  // Countries
  const [ethiopia] = await db.insert(schema.countries).values({ name: 'Ethiopia' }).onConflictDoNothing().returning();
  const countryId = ethiopia?.id || 1;

  // Categories
  const categories = [
    // Roads & Transportation
    { name: 'Traffic', icon: 'Car' },
    { name: 'Road Damage', icon: 'Construction' },
    { name: 'Flooding', icon: 'Droplets' },
    { name: 'Construction Blockage', icon: 'HardHat' },
    // Public Services
    { name: 'Power Outage', icon: 'Zap' },
    { name: 'Water Shortage', icon: 'Waves' },
    { name: 'Hospital Congestion', icon: 'Hospital' },
    { name: 'Govt Office Delay', icon: 'Building2' },
    // Business Conditions
    { name: 'Hygiene Issues', icon: 'Sparkles' },
    { name: 'Overcrowding', icon: 'Users' },
    { name: 'Closed/Unavailable', icon: 'Store' },
  ];

  for (const cat of categories) {
    await db.insert(schema.categories).values(cat).onConflictDoNothing();
  }
  console.log('Categories seeded.');

  // Cities
  const cities = ['Addis Ababa', 'Gondar', 'Awasa'];
  for (const c of cities) {
    await db.insert(schema.cities).values({ name: c, countryId }).onConflictDoNothing();
  }
  console.log('Cities seeded.');

  // Areas
  const allCities = await db.select().from(schema.cities);
  const cityMap = allCities.reduce((acc, city) => ({ ...acc, [city.name]: city.id }), {} as Record<string, number>);

  const areas = {
    'Addis Ababa': ['Bole', 'Kazanchis', 'Piassa', 'Sarbet', 'Lideta', 'Kolfe'],
    'Gondar': ['City Center', 'Azezo', 'Arada'],
    'Awasa': ['Tabor', 'Piazza', 'Baha'],
  };

  for (const [cityName, areaList] of Object.entries(areas)) {
    const cityId = cityMap[cityName];
    if (cityId) {
      for (const areaName of areaList) {
        try {
          // Check if exists first to avoid double seed
          const existing = await db.select().from(schema.areas).where(
            and(eq(schema.areas.name, areaName), eq(schema.areas.cityId, cityId))
          );
          if (existing.length === 0) {
            await db.insert(schema.areas).values({ name: areaName, cityId });
          }
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
