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
  console.log('Seeding Expanded Restaurants...');

  const allCities = await db.select().from(schema.cities);
  const cityMap = allCities.reduce((acc, city) => ({ ...acc, [city.name]: city.id }), {} as Record<string, number>);
  
  const allAreas = await db.select().from(schema.areas);
  const areaKeyMap = allAreas.reduce((acc, area) => ({ ...acc, [`${area.cityId}:${area.name}`]: area.id }), {} as Record<string, number>);

  const addisAbabaId = cityMap['Addis Ababa'];
  if (!addisAbabaId) {
    console.error('Addis Ababa not found. Please run main seed first.');
    await client.end();
    return;
  }

  const restaurantsData = [
    // --- Bole ---
    { name: 'Abucci Italian', cuisine: 'Italian', area: 'Bole', menu: [
      { name: 'Penne Arrabbiata', price: 320, category: 'Pasta' },
      { name: 'Quattro Formaggi', price: 450, category: 'Pizza' }
    ]},
    { name: 'Lime Tree', cuisine: 'Cafe', area: 'Bole', menu: [
      { name: 'Iced Latte', price: 85, category: 'Drinks' },
      { name: 'Chicken Wrap', price: 210, category: 'Light Meals' }
    ]},
    { name: 'Bole Mini', cuisine: 'Ethiopian', area: 'Bole', menu: [
      { name: 'Special Kitfo', price: 400, category: 'Traditional' },
      { name: 'Tibs Fitfit', price: 280, category: 'Traditional' }
    ]},
    
    // --- Kazanchis ---
    { name: 'Habesha 2000', cuisine: 'Ethiopian', area: 'Kazanchis', menu: [
      { name: 'Cultural Buffet', price: 600, category: 'Dining' },
      { name: 'Honey Wine (Tej)', price: 150, category: 'Drinks' }
    ]},
    { name: 'Jupiter Hotel Restaurant', cuisine: 'Continental', area: 'Kazanchis', menu: [
      { name: 'Grilled Salmon', price: 850, category: 'Main Course' },
      { name: 'Greek Salad', price: 310, category: 'Starters' }
    ]},
    
    // --- Piassa ---
    { name: 'Taitu Hotel', cuisine: 'Traditional/Vegan', area: 'Piassa', menu: [
      { name: 'Vegan Buffet', price: 180, category: 'Main' },
      { name: 'Espresso', price: 45, category: 'Coffee' }
    ]},
    { name: 'Castelli Restaurant', cuisine: 'Italian', area: 'Piassa', menu: [
      { name: 'Ravioli with Cream', price: 550, category: 'Pasta' },
      { name: 'Osso Buco', price: 720, category: 'Meat' }
    ]},
    { name: 'Enat Bunna', cuisine: 'Coffee', area: 'Piassa', menu: [
      { name: 'Jebena Buna', price: 30, category: 'Traditional' },
      { name: 'Popcorn', price: 20, category: 'Snack' }
    ]},

    // --- Sarbet ---
    { name: 'Sodere Restaurant', cuisine: 'Ethiopian', area: 'Sarbet', menu: [
      { name: 'Kurt Segha', price: 500, category: 'Meat' },
      { name: 'Dulet', price: 320, category: 'Traditional' }
    ]},
    { name: 'Mamma Mia', cuisine: 'Italian', area: 'Sarbet', menu: [
      { name: 'Spaghetti Carbonara', price: 380, category: 'Pasta' },
      { name: 'Gelato Mix', price: 120, category: 'Dessert' }
    ]}
  ];

  for (const r of restaurantsData) {
    const areaId = areaKeyMap[`${addisAbabaId}:${r.area}`];
    if (areaId) {
      const existing = await db.select().from(schema.restaurants).where(
        and(
          eq(schema.restaurants.name, r.name),
          eq(schema.restaurants.cityId, addisAbabaId),
          eq(schema.restaurants.areaId, areaId)
        )
      ).limit(1);

      if (existing.length === 0) {
        await db.insert(schema.restaurants).values({
          name: r.name,
          cuisineType: r.cuisine,
          cityId: addisAbabaId,
          areaId: areaId,
          menu: JSON.stringify(r.menu)
        });
        console.log(`Seeded: ${r.name}`);
      } else {
        console.log(`Skipped (exists): ${r.name}`);
      }
    } else {
       console.warn(`Area not found for: ${r.name} (${r.area})`);
    }
  }

  console.log('Expansion seed complete!');
  await client.end();
}

seed().catch(console.error);
