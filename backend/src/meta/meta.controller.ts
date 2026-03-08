import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Inject } from '@nestjs/common';
import { DRIZZLE_PROVIDER } from '../db/db.module';
import { cities, areas, categories } from '../db/schema';
import { eq } from 'drizzle-orm';

@ApiTags('meta')
@Controller('meta')
export class MetaController {
  constructor(@Inject(DRIZZLE_PROVIDER) private db: any) {}

  @Get('cities')
  @ApiOperation({ summary: 'Get all cities' })
  async getCities() {
    return this.db.select().from(cities);
  }

  @Get('cities/:id/areas')
  @ApiOperation({ summary: 'Get areas for a city' })
  async getAreas(@Param('id') cityId: string) {
    return this.db.select().from(areas).where(eq(areas.cityId, +cityId));
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get all categories' })
  async getCategories() {
    return this.db.select().from(categories);
  }
}
