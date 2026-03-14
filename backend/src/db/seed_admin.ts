import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as schema from './schema';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const client = postgres(connectionString);
const db = drizzle(client, { schema });

async function seedAdmin() {
  console.log('--- Starting Admin Seeding ---');

  try {
    const hashedPassword = await bcrypt.hash('Admin123!', 10);
    console.log('Password hashed successfully.');

    const adminEmail = 'admin@civicwatch.com';
    
    // Check if admin exists
    const existingAdmins = await db.select().from(schema.users).where(eq(schema.users.email, adminEmail));
    
    if (existingAdmins.length === 0) {
      console.log('Admin user not found. Creating...');
      await db.insert(schema.users).values({
        email: adminEmail,
        password: hashedPassword,
        fullName: 'System Administrator',
        role: 'ADMIN',
        status: 'ACTIVE',
      });
      console.log('Default admin created.');
    } else {
      console.log('Admin user already exists.');
    }

    // Attempt SUPER_ADMIN
    const superAdminEmail = 'superadmin@civicwatch.com';
    const existingSuper = await db.select().from(schema.users).where(eq(schema.users.email, superAdminEmail));
    
    if (existingSuper.length === 0) {
        console.log('Super Admin not found. Creating...');
        try {
            await db.insert(schema.users).values({
                email: superAdminEmail,
                password: hashedPassword,
                fullName: 'Super Admin',
                role: 'SUPER_ADMIN',
                status: 'ACTIVE',
            });
            console.log('Super Admin created.');
        } catch (e: any) {
            console.error('Failed to create SUPER_ADMIN. Role might not exist in current DB schema:', e.message);
        }
    }

    // Audit logs
    console.log('Fetching admins for audit logs...');
    const allAdmins = await db.select().from(schema.users).where(eq(schema.users.status, 'ACTIVE'));
    const admin = allAdmins.find(u => u.email === adminEmail);

    if (admin) {
        console.log('Adding audit log for Admin...');
        await db.insert(schema.auditLogs).values({
            adminId: admin.id,
            action: 'SYSTEM_SEEDED',
            reason: 'Seeded initial admin data for development',
            createdAt: new Date(),
        });
        console.log('Audit log added.');
    }

    console.log('--- Admin Seeding Finished ---');
  } catch (err: any) {
    console.error('Fatal error during seeding:', err);
  } finally {
    await client.end();
  }
}

seedAdmin().catch(console.error);
