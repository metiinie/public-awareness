import { pgTable, serial, text, timestamp, integer, boolean, pgEnum, varchar, index, real } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const userRoleEnum = pgEnum('user_role', ['USER', 'ADMIN', 'MODERATOR', 'SUPER_ADMIN']);

export const accountStatusEnum = pgEnum('account_status', ['ACTIVE', 'SUSPENDED', 'BANNED']);
export const reportStatusEnum = pgEnum('report_status', ['REPORTED', 'UNDER_REVIEW', 'REMOVED', 'VERIFIED', 'RESOLVED', 'ARCHIVED']);


export const urgencyEnum = pgEnum('urgency_level', ['INFO', 'WARNING', 'CRITICAL']);

// --- Countries ---
export const countries = pgTable('countries', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
});

// --- Users ---
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: text('password').notNull(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  avatar: text('avatar'),
  bio: text('bio'),
  role: userRoleEnum('role').default('USER').notNull(),
  trustScore: integer('trust_score').default(50).notNull(),
  status: accountStatusEnum('status').default('ACTIVE').notNull(),
  suspensionUntil: timestamp('suspension_until'),
  cityId: integer('city_id').references(() => cities.id),
  areaId: integer('area_id').references(() => areas.id),
  notificationSettings: text('notification_settings').default('{"critical":true,"warnings":true,"updates":true,"reviews":false}'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});


// --- Categories ---
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  icon: varchar('icon', { length: 100 }), // Icon name for frontend
  isActive: boolean('is_active').default(true).notNull(),
});



// --- Locations ---
export const cities = pgTable('cities', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  countryId: integer('country_id').references(() => countries.id),
});

export const areas = pgTable('areas', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  cityId: integer('city_id').references(() => cities.id).notNull(),
});

// --- Reports ---
export const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  status: reportStatusEnum('status').default('REPORTED').notNull(),

  urgency: urgencyEnum('urgency').default('INFO').notNull(),
  reporterId: integer('reporter_id').references(() => users.id).notNull(),
  categoryId: integer('category_id').references(() => categories.id).notNull(),
  cityId: integer('city_id').references(() => cities.id).notNull(),
  areaId: integer('area_id').references(() => areas.id).notNull(),
  placeName: varchar('place_name', { length: 255 }),
  confidenceScore: integer('confidence_score').default(50).notNull(), // Rename from trust_score
  mediaUrl: text('media_url'), // Direct access to primary evidence
  masterReportId: integer('master_report_id'), // Self-reference for merging
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  autoArchiveAt: timestamp('auto_archive_at'),
}, (table) => {
  return {
    categoryIdx: index('category_idx').on(table.categoryId),
    cityIdx: index('city_idx').on(table.cityId),
    areaIdx: index('area_idx').on(table.areaId),
    statusIdx: index('status_idx').on(table.status),
    confidenceIdx: index('confidence_idx').on(table.confidenceScore),
    createdIdx: index('created_idx').on(table.createdAt),
    urgencyIdx: index('urgency_idx').on(table.urgency),
    masterReportIdx: index('master_report_idx').on(table.masterReportId),
  };
});

// --- Moderation Notes ---
export const moderationNotes = pgTable('moderation_notes', {
  id: serial('id').primaryKey(),
  reportId: integer('report_id').references(() => reports.id).notNull(),
  adminId: integer('admin_id').references(() => users.id).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- Detailed Admin Actions ---
export const adminActions = pgTable('admin_actions', {
  id: serial('id').primaryKey(),
  adminId: integer('admin_id').references(() => users.id).notNull(),
  action: varchar('action', { length: 100 }).notNull(),
  targetType: varchar('target_type', { length: 50 }).notNull(), // 'REPORT', 'USER', 'SYSTEM'
  targetId: integer('target_id'),
  reason: text('reason').notNull(),
  beforeJson: text('before_json'), // Snapshot before action
  afterJson: text('after_json'),  // Snapshot after action
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- Media ---
// ... existing media table ...
export const media = pgTable('media', {
  id: serial('id').primaryKey(),
  reportId: integer('report_id').references(() => reports.id).notNull(),
  url: text('url').notNull(),
  type: varchar('type', { length: 50 }).notNull(), // 'IMAGE' | 'VIDEO'
});

// --- Reactions ---
export const reactions = pgTable('reactions', {
  id: serial('id').primaryKey(),
  reportId: integer('report_id').references(() => reports.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  type: varchar('type', { length: 10 }).notNull(), // 'REAL' | 'FAKE'
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
  return {
    reportIdx: index('reaction_report_idx').on(table.reportId),
    userReportIdx: index('reaction_user_report_idx').on(table.userId, table.reportId),
  };
});

// --- Subscriptions ---
export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  areaId: integer('area_id').references(() => areas.id),
  categoryId: integer('category_id').references(() => categories.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- Moderation Reports ---
export const moderationReports = pgTable('moderation_reports', {
  id: serial('id').primaryKey(),
  reportId: integer('report_id').references(() => reports.id).notNull(),
  reason: text('reason').notNull(),
  reporterId: integer('reporter_id').references(() => users.id).notNull(),
  status: varchar('status', { length: 50 }).default('PENDING').notNull(), // PENDING, RESOLVED, DISMISSED
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- Audit Logs ---
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  adminId: integer('admin_id').references(() => users.id).notNull(),
  action: varchar('action', { length: 100 }).notNull(), // REMOVE_REPORT, BAN_USER, VERIFY_REPORT, etc.
  reason: text('reason').notNull(),
  targetId: integer('target_id'), // Multi-purpose ID (reportId, userId, etc.)
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- Comments ---
export const comments = pgTable('comments', {
  id: serial('id').primaryKey(),
  reportId: integer('report_id').references(() => reports.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
  return {
    reportIdx: index('comment_report_idx').on(table.reportId),
  };
});

// --- Notifications ---
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  reportId: integer('report_id').references(() => reports.id),
  type: varchar('type', { length: 50 }).notNull(), // 'NEW_REPORT' | 'STATUS_CHANGE'
  message: text('message').notNull(),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
  return {
    userReadIdx: index('notif_user_read_idx').on(table.userId, table.isRead),
  };
});

// --- Relations ---
export const usersRelations = relations(users, ({ many }) => ({
  reports: many(reports),
  subscriptions: many(subscriptions),
  comments: many(comments),
  notifications: many(notifications),
}));

export const reportsRelations = relations(reports, ({ one, many }) => ({
  reporter: one(users, { fields: [reports.reporterId], references: [users.id] }),
  category: one(categories, { fields: [reports.categoryId], references: [categories.id] }),
  city: one(cities, { fields: [reports.cityId], references: [cities.id] }),
  area: one(areas, { fields: [reports.areaId], references: [areas.id] }),
  masterReport: one(reports, { fields: [reports.masterReportId], references: [reports.id], relationName: 'merged_reports' }),
  mergedReports: many(reports, { relationName: 'merged_reports' }),
  moderationNotes: many(moderationNotes),
  media: many(media),
  reactions: many(reactions),
  comments: many(comments),
  notifications: many(notifications),
}));

export const moderationNotesRelations = relations(moderationNotes, ({ one }) => ({
  report: one(reports, { fields: [moderationNotes.reportId], references: [reports.id] }),
  admin: one(users, { fields: [moderationNotes.adminId], references: [users.id] }),
}));

export const adminActionsRelations = relations(adminActions, ({ one }) => ({
  admin: one(users, { fields: [adminActions.adminId], references: [users.id] }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  reports: many(reports),
  subscriptions: many(subscriptions),
}));

export const citiesRelations = relations(cities, ({ many }) => ({
  areas: many(areas),
  reports: many(reports),
}));

export const areasRelations = relations(areas, ({ one, many }) => ({
  city: one(cities, { fields: [areas.cityId], references: [cities.id] }),
  reports: many(reports),
  subscriptions: many(subscriptions),
}));

export const mediaRelations = relations(media, ({ one }) => ({
  report: one(reports, { fields: [media.reportId], references: [reports.id] }),
}));

export const reactionsRelations = relations(reactions, ({ one }) => ({
  report: one(reports, { fields: [reactions.reportId], references: [reports.id] }),
  user: one(users, { fields: [reactions.userId], references: [users.id] }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
  area: one(areas, { fields: [subscriptions.areaId], references: [areas.id] }),
  category: one(categories, { fields: [subscriptions.categoryId], references: [categories.id] }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  report: one(reports, { fields: [comments.reportId], references: [reports.id] }),
  user: one(users, { fields: [comments.userId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  report: one(reports, { fields: [notifications.reportId], references: [reports.id] }),
}));

// --- Restaurants ---
export const restaurants = pgTable('restaurants', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  cuisineType: varchar('cuisine_type', { length: 100 }).notNull().default('General'),
  address: varchar('address', { length: 500 }),
  cityId: integer('city_id').references(() => cities.id).notNull(),
  areaId: integer('area_id').references(() => areas.id).notNull(),
  avgRating: real('avg_rating').default(0).notNull(),
  reviewCount: integer('review_count').default(0).notNull(),
  menu: text('menu'), // JSON string of menu items: [{ name, price, description, category }]
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  cityIdx: index('restaurant_city_idx').on(table.cityId),
  areaIdx: index('restaurant_area_idx').on(table.areaId),
}));

// --- Food Reviews ---
export const foodReviews = pgTable('food_reviews', {
  id: serial('id').primaryKey(),
  restaurantId: integer('restaurant_id').references(() => restaurants.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  rating: integer('rating').notNull(), // 1-5
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body'),
  mediaUrls: text('media_urls').array(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  restaurantIdx: index('food_review_restaurant_idx').on(table.restaurantId),
  userIdx: index('food_review_user_idx').on(table.userId),
}));

export const restaurantsRelations = relations(restaurants, ({ one, many }) => ({
  city: one(cities, { fields: [restaurants.cityId], references: [cities.id] }),
  area: one(areas, { fields: [restaurants.areaId], references: [areas.id] }),
  reviews: many(foodReviews),
}));

export const foodReviewsRelations = relations(foodReviews, ({ one }) => ({
  restaurant: one(restaurants, { fields: [foodReviews.restaurantId], references: [restaurants.id] }),
  user: one(users, { fields: [foodReviews.userId], references: [users.id] }),
}));
