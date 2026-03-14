import {
  Controller, Get, Post, Param, Body, Req,
  UseGuards, Inject, HttpException, HttpStatus
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DRIZZLE_PROVIDER } from '../db/db.module';
import { foodReviews, restaurants, users } from '../db/schema';
import { eq, desc, avg, count, sql } from 'drizzle-orm';

@ApiTags('food-reviews')
@Controller()
export class FoodReviewsController {
  constructor(@Inject(DRIZZLE_PROVIDER) private db: any) {}

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
      console.log(`[FoodReviewsController] Inserting review for restaurant ${restaurantId} by user ${req.user.userId}`);
      console.log(`[FoodReviewsController] Review Data:`, JSON.stringify({ rating, title, mediaUrls }));
      const [created] = await this.db
        .insert(foodReviews)
        .values({
          restaurantId: +restaurantId,
          userId: req.user.userId,
          rating,
          title,
          body: reviewBody,
          mediaUrls: mediaUrls ?? [],
        })
        .returning();

      console.log(`[FoodReviewsController] Review inserted, ID: ${created?.id}`);

      // Update restaurant avgRating and reviewCount
      const stats = await this.db
        .select({
          avgRating: avg(foodReviews.rating),
          reviewCount: count(foodReviews.id),
        })
        .from(foodReviews)
        .where(eq(foodReviews.restaurantId, +restaurantId));

      if (stats[0]) {
        console.log(`[FoodReviewsController] Updating restaurant stats:`, stats[0]);
        await this.db
          .update(restaurants)
          .set({
            avgRating: parseFloat(stats[0].avgRating ?? '0'),
            reviewCount: Number(stats[0].reviewCount),
          })
          .where(eq(restaurants.id, +restaurantId));
      }

      return created;
    } catch (error) {
       console.error(`[FoodReviewsController] CRITICAL FAILURE:`, error);
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
