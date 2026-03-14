import { Controller, Get, Query, Param, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { DRIZZLE_PROVIDER } from '../db/db.module';
import { restaurants, areas, cities } from '../db/schema';
import { eq, and, ilike, sql } from 'drizzle-orm';

@ApiTags('restaurants')
@Controller('restaurants')
export class RestaurantsController {
  constructor(@Inject(DRIZZLE_PROVIDER) private db: any) {}

  @Get()
  @ApiOperation({ summary: 'Get all restaurants with optional city/area/search filters' })
  @ApiQuery({ name: 'cityId', required: false })
  @ApiQuery({ name: 'areaId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'cuisineType', required: false })
  async getRestaurants(
    @Query('cityId') cityId?: string,
    @Query('areaId') areaId?: string,
    @Query('search') search?: string,
    @Query('cuisineType') cuisineType?: string,
  ) {
    const conditions: any[] = [];

    if (cityId) conditions.push(eq(restaurants.cityId, +cityId));
    if (areaId) conditions.push(eq(restaurants.areaId, +areaId));
    if (search) conditions.push(ilike(restaurants.name, `%${search}%`));
    if (cuisineType && cuisineType !== 'all')
      conditions.push(ilike(restaurants.cuisineType, `%${cuisineType}%`));

    const query = this.db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        cuisineType: restaurants.cuisineType,
        address: restaurants.address,
        cityId: restaurants.cityId,
        areaId: restaurants.areaId,
        avgRating: restaurants.avgRating,
        reviewCount: restaurants.reviewCount,
        menu: restaurants.menu,
        cityName: cities.name,
        areaName: areas.name,
      })
      .from(restaurants)
      .leftJoin(cities, eq(restaurants.cityId, cities.id))
      .leftJoin(areas, eq(restaurants.areaId, areas.id));

    if (conditions.length > 0) {
      return query.where(and(...conditions));
    }
    return query;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single restaurant by ID' })
  async getRestaurant(@Param('id') id: string) {
    const result = await this.db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        cuisineType: restaurants.cuisineType,
        address: restaurants.address,
        cityId: restaurants.cityId,
        areaId: restaurants.areaId,
        avgRating: restaurants.avgRating,
        reviewCount: restaurants.reviewCount,
        menu: restaurants.menu,
        cityName: cities.name,
        areaName: areas.name,
      })
      .from(restaurants)
      .leftJoin(cities, eq(restaurants.cityId, cities.id))
      .leftJoin(areas, eq(restaurants.areaId, areas.id))
      .where(eq(restaurants.id, +id));

    return result[0] ?? null;
  }
}
