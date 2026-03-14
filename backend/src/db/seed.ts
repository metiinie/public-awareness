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
  const categoriesList = [
    // Roads & Transportation
    { name: 'Traffic', icon: 'Car' },
    { name: 'Road Damage', icon: 'Construction' },
    { name: 'Flooding', icon: 'Waves' },
    { name: 'Construction Blockage', icon: 'HardHat' },
    // Public Services
    { name: 'Power Outage', icon: 'Zap' },
    { name: 'Water Shortage', icon: 'Droplets' },
    { name: 'Hospital Congestion', icon: 'Hospital' },
    { name: 'Govt Office Delay', icon: 'Building2' },
    // Business Conditions
    { name: 'Hygiene Issues', icon: 'Sparkles' },
    { name: 'Overcrowding', icon: 'Users' },
    { name: 'Closed/Unavailable', icon: 'Store' },
    // Food Reviews
    { name: 'Food Review', icon: 'UtensilsCrossed' },
  ];

  for (const cat of categoriesList) {
    await db.insert(schema.categories).values(cat).onConflictDoNothing();
  }
  console.log('Categories seeded.');

  // Cities
  const citiesNames = ['Addis Ababa', 'Gondar', 'Awasa'];
  for (const c of citiesNames) {
    await db.insert(schema.cities).values({ name: c, countryId }).onConflictDoNothing();
  }
  console.log('Cities seeded.');

  // Areas
  const allCities = await db.select().from(schema.cities);
  const cityMap = allCities.reduce((acc, city) => ({ ...acc, [city.name]: city.id }), {} as Record<string, number>);

  const areasList = {
    'Addis Ababa': ['Bole', 'Kazanchis', 'Piassa', 'Sarbet', 'Lideta', 'Kolfe'],
    'Gondar': ['City Center', 'Azezo', 'Arada'],
    'Awasa': ['Tabor', 'Piazza', 'Baha'],
  };

  for (const [cityName, areaList] of Object.entries(areasList)) {
    const cityIdForArea = cityMap[cityName];
    if (cityIdForArea) {
      for (const areaName of areaList) {
        try {
          // Check if exists first to avoid double seed
          const existing = await db.select().from(schema.areas).where(
            and(eq(schema.areas.name, areaName), eq(schema.areas.cityId, cityIdForArea))
          );
          if (existing.length === 0) {
            await db.insert(schema.areas).values({ name: areaName, cityId: cityIdForArea });
          }
        } catch (err: any) {
            console.error(`Error inserting area ${areaName}:`, err.message);
        }
      }
    }
  }

  console.log('Areas seeded.');

  // Restaurants with Menus
  const allCitiesForRestaurants = await db.select().from(schema.cities);
  const allAreasForRestaurants = await db.select().from(schema.areas);
  const cityMapR = allCitiesForRestaurants.reduce((acc, city) => ({ ...acc, [city.name]: city.id }), {} as Record<string, number>);
  const areaMapR = allAreasForRestaurants.reduce((acc, area) => ({ ...acc, [`${area.cityId}:${area.name}`]: area.id }), {} as Record<string, number>);

  const sampleRestaurants = [
    { 
      name: 'Gusto Italian Kitchen', 
      cuisineType: 'Italian', 
      address: 'Bole Road, Addis Ababa', 
      cityName: 'Addis Ababa', 
      areaName: 'Bole',
      menu: JSON.stringify([
        { name: 'Margherita Pizza', price: 250, description: 'Classic tomato, mozzarella, basil', category: 'Pizza' },
        { name: 'Lasagna Bolognese', price: 380, description: 'Rich meat sauce, béchamel, pasta layers', category: 'Pasta' },
        { name: 'Tiramisu', price: 180, description: 'Coffee-soaked ladyfingers, mascarpone', category: 'Dessert' }
      ])
    },
    { 
      name: 'Kategna Traditional', 
      cuisineType: 'Ethiopian', 
      address: 'Kazanchis Main St', 
      cityName: 'Addis Ababa', 
      areaName: 'Kazanchis',
      menu: JSON.stringify([
        { name: 'Beyaynetu', price: 220, description: 'Assorted vegetarian stews on injera', category: 'Main' },
        { name: 'Doro Wat', price: 450, description: 'Spicy chicken stew with egg', category: 'Main' },
        { name: 'Tej', price: 120, description: 'Traditional honey wine', category: 'Drinks' }
      ])
    },
    { 
      name: 'Burger Hub', 
      cuisineType: 'Fast Food', 
      address: 'Piassa Square', 
      cityName: 'Addis Ababa', 
      areaName: 'Piassa',
      menu: JSON.stringify([
        { name: 'Classic Cheeseburger', price: 190, description: 'Beef patty, cheddar, lettuce, tomato', category: 'Burgers' },
        { name: 'Crispy Chicken Burger', price: 210, description: 'Spicy fried chicken, coleslaw', category: 'Burgers' },
        { name: 'Large Fries', price: 80, description: 'Golden salted fries', category: 'Sides' }
      ])
    }
  ];

  for (const r of sampleRestaurants) {
    const cityIdForR = cityMapR[r.cityName];
    const areaIdForR = areaMapR[`${cityIdForR}:${r.areaName}`];
    if (cityIdForR && areaIdForR) {
      await db.insert(schema.restaurants).values({
        name: r.name,
        cuisineType: r.cuisineType,
        address: r.address,
        cityId: cityIdForR,
        areaId: areaIdForR,
        menu: r.menu,
      }).onConflictDoUpdate({
        target: [schema.restaurants.id],
        set: { menu: r.menu }
      });
    }
  }
  console.log('Restaurants seeded.');

  await client.end();
  console.log('Database seeded successfully!');
}

seed().catch(console.error);
