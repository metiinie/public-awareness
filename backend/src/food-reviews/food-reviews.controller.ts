import {
  Controller, Get, Post, Param, Body, Req,
  UseGuards, Inject, HttpException, HttpStatus, Logger
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DRIZZLE_PROVIDER } from '../db/db.module';
import { foodReviews, restaurants, users, categories } from '../db/schema';
import { eq, desc, avg, count, sql, and } from 'drizzle-orm';
import { ReportsService } from '../reports/reports.service';

@ApiTags('food-reviews')
@Controller()
export class FoodReviewsController {
  private readonly logger = new Logger(FoodReviewsController.name);

  constructor(
    @Inject(DRIZZLE_PROVIDER) private db: any,
    private readonly reportsService: ReportsService,
  ) {}

  // ─── GET /restaurants/:id/reviews ─────────────────────────────────────
  @Get('restaurants/:restaurantId/reviews')
  @ApiOperation({ summary: 'Get all reviews for a restaurant' })
  async getReviews(@Param('restaurantId') restaurantId: string) {
    return this.db
      .select({
        id: foodReviews.id,
        rating: foodReviews.rating,
        title: foodReviews.title,
        body: foodReviews.body,
        mediaUrls: foodReviews.mediaUrls,
        createdAt: foodReviews.createdAt,
        userId: foodReviews.userId,
        userFullName: users.fullName,
        userAvatar: users.avatar,
      })
      .from(foodReviews)
      .leftJoin(users, eq(foodReviews.userId, users.id))
      .where(eq(foodReviews.restaurantId, +restaurantId))
      .orderBy(desc(foodReviews.createdAt));
  }

  // ─── POST /restaurants/:id/reviews ────────────────────────────────────
  @Post('restaurants/:restaurantId/reviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a review for a restaurant' })
  async createReview(
    @Param('restaurantId') restaurantId: string,
    @Body() body: { rating: number; title: string; body?: string; mediaUrls?: string[] },
    @Req() req: any,
  ) {
    const { rating, title, body: reviewBody, mediaUrls } = body;

    if (!rating || rating < 1 || rating > 5) {
      throw new HttpException('Rating must be between 1 and 5', HttpStatus.BAD_REQUEST);
    }
    if (!title?.trim()) {
      throw new HttpException('Title is required', HttpStatus.BAD_REQUEST);
    }

    // Insert the review
    try {
      this.logger.log(`Unified review and report creation for restaurant ${restaurantId} by user ${req.user.userId}`);

      // 1. Fetch restaurant metadata to populate location scopes
      const [rest] = await this.db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, +restaurantId))
        .limit(1);

      if (!rest) {
        throw new HttpException('Restaurant not found', HttpStatus.NOT_FOUND);
      }

      // 2. Fetch category ID for "Food Review"
      const [cat] = await this.db
        .select()
        .from(categories)
        .where(eq(categories.name, 'Food Review'))
        .limit(1);

      if (!cat) {
        throw new HttpException('Food Review category not found in system settings', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // 3. Delegate transaction and ingestion to ReportsService.create
      const createReportDto = {
        title: title.trim(),
        description: reviewBody?.trim() || `Review for ${rest.name}`,
        categoryId: cat.id,
        cityId: rest.cityId,
        areaId: rest.areaId,
        mediaUrls: mediaUrls ?? [],
        restaurantId: +restaurantId,
        rating,
        urgency: 'INFO',
      };

      await this.reportsService.create(createReportDto, req.user.userId);

      // 4. Retrieve the newly created food review and return it
      const [createdReview] = await this.db
        .select()
        .from(foodReviews)
        .where(
          and(
            eq(foodReviews.restaurantId, +restaurantId),
            eq(foodReviews.userId, req.user.userId),
          ),
        )
        .orderBy(desc(foodReviews.id))
        .limit(1);

      return createdReview;
    } catch (error) {
       this.logger.error(`CRITICAL FAILURE:`, error);
       throw error;
    }
  }

  // ─── GET /food-reviews/user/me ─────────────────────────────────────────
  @Get('food-reviews/user/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user reviews' })
  async getMyReviews(@Req() req: any) {
    return this.db
      .select({
        id: foodReviews.id,
        rating: foodReviews.rating,
        title: foodReviews.title,
        body: foodReviews.body,
        mediaUrls: foodReviews.mediaUrls,
        createdAt: foodReviews.createdAt,
        restaurantId: foodReviews.restaurantId,
        restaurantName: restaurants.name,
        restaurantCuisine: restaurants.cuisineType,
      })
      .from(foodReviews)
      .leftJoin(restaurants, eq(foodReviews.restaurantId, restaurants.id))
      .where(eq(foodReviews.userId, req.user.userId))
      .orderBy(desc(foodReviews.createdAt));
  }
}
