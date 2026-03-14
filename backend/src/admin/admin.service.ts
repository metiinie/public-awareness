import { Injectable, Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { eq, count, desc } from 'drizzle-orm';

@Injectable()
export class AdminService {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private db: NodePgDatabase<typeof schema>,
  ) {}

  async getOverview() {
    const [userCount] = await this.db.select({ value: count() }).from(schema.users);
    const [reportCount] = await this.db.select({ value: count() }).from(schema.reports);
    const [pendingReports] = await this.db
      .select({ value: count() })
      .from(schema.reports)
      .where(eq(schema.reports.status, 'PUBLISHED')); // Assuming PUBLISHED means needs review or is active

    return {
      totalUsers: userCount.value,
      totalReports: reportCount.value,
      activeReports: pendingReports.value,
    };
  }

  async getReports() {
    return this.db.query.reports.findMany({
      with: {
        reporter: true,
        category: true,
        city: true,
        area: true,
      },
      orderBy: [desc(schema.reports.createdAt)],
      limit: 50,
    });
  }

  async updateReportStatus(id: number, status: any) {
    return this.db
      .update(schema.reports)
      .set({ status })
      .where(eq(schema.reports.id, id))
      .returning();
  }

  async getUsers() {
    return this.db.query.users.findMany({
      orderBy: [desc(schema.users.createdAt)],
      limit: 100,
    });
  }

  async updateUserRole(id: number, role: any) {
    return this.db
      .update(schema.users)
      .set({ role })
      .where(eq(schema.users.id, id))
      .returning();
  }

  async getLocations() {
    const cities = await this.db.query.cities.findMany({
      with: {
        areas: true,
      },
    });
    return cities;
  }

  async createCity(name: string, countryId: number) {
    return this.db.insert(schema.cities).values({ name, countryId }).returning();
  }

  async createArea(name: string, cityId: number) {
    return this.db.insert(schema.areas).values({ name, cityId }).returning();
  }
}
