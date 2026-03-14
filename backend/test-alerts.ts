import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { NotificationsService } from './src/notifications/notifications.service';
import { ReportsService } from './src/reports/reports.service';
import { DRIZZLE_PROVIDER } from './src/db/db.module';
import { users, subscriptions, notifications, reports } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const db = app.get(DRIZZLE_PROVIDER);
  const notificationsService = app.get(NotificationsService);
  const reportsService = app.get(ReportsService);

  // 1. Get or create a user to act as subscriber
  const [subscriber] = await db.select().from(users).limit(1);
  if (!subscriber) {
    console.log('No user found to test with.');
    process.exit(1);
  }

  // 2. Get another user to act as reporter
  const reporter = (await db.select().from(users).where(eq(users.id, subscriber.id === 1 ? 2 : 1)).limit(1))[0] || subscriber;

  // 3. Subscribe subscriber to an area (e.g., areaId = 1)
  console.log(`Subscribing user ${subscriber.id} to area 1...`);
  await notificationsService.subscribe(subscriber.id, 1);

  // 4. Create a report in area 1 by reporter
  console.log(`Creating report by user ${reporter.id} in area 1...`);
  try {
    const report = await reportsService.create({
      title: 'Test Alert Report',
      description: 'Testing if alerts work',
      categoryId: 1,
      cityId: 1, // assuming area 1 belongs to city 1
      areaId: 1,
      urgency: 'INFO',
      mediaUrls: ['http://example.com/test.jpg'],
    }, reporter.id);

    console.log(`Report created: ${report.id}`);

    // Wait a bit just in case
    await new Promise(r => setTimeout(r, 1000));

    // 5. Check if notification was created for subscriber
    const notifs = await db.select().from(notifications).where(eq(notifications.userId, subscriber.id));
    console.log(`Notifications for subscriber ${subscriber.id}:`, notifs);
    
    // Also check notifications for reporter
    const reporterNotifs = await db.select().from(notifications).where(eq(notifications.userId, reporter.id));
    console.log(`Notifications for reporter ${reporter.id}:`, reporterNotifs);
    
  } catch(e) {
    console.error('Error:', e);
  }

  await app.close();
}

bootstrap();
