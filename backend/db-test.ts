
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './src/db/schema';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client, { schema });

  try {
    console.log('Testing Full Report Creation...');
    
    const [newReport] = await db.insert(schema.reports).values({
        title: 'Test Report ' + new Date().toISOString(),
        description: 'Testing 500 error cause',
        reporterId: 1,
        categoryId: 1,
        cityId: 1,
        areaId: 1,
        status: 'REPORTED',
        urgency: 'INFO',
        confidenceScore: 50,
        autoArchiveAt: new Date(Date.now() + 24 * 3600 * 1000),
    }).returning();

    console.log('Report Created:', newReport.id);

    console.log('Inserting Media...');
    await db.insert(schema.media).values([
        { reportId: newReport.id, url: 'https://example.com/test.jpg', type: 'IMAGE' }
    ]);
    console.log('Media inserted successfully.');

    // Try food review too
    console.log('Testing Food Review Creation...');
    // Create a restaurant first if none exists
    let [restaurant] = await db.select().from(schema.restaurants).limit(1);
    if (!restaurant) {
        console.log('Creating test restaurant...');
        [restaurant] = await db.insert(schema.restaurants).values({
            name: 'Test Restaurant',
            cityId: 1,
            areaId: 1,
        }).returning();
    }

    const [newReview] = await db.insert(schema.foodReviews).values({
        restaurantId: restaurant.id,
        userId: 1,
        rating: 5,
        title: 'Excellent!',
        body: 'Best test food ever.',
        mediaUrls: ['https://example.com/food.jpg'],
    }).returning();
    console.log('Food review created:', newReview.id);

  } catch (error) {
    console.error('Test Failed:', error);
  } finally {
    await client.end();
  }
}

main();
