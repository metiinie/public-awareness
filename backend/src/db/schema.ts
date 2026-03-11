import { pgTable, serial, text, timestamp, integer, boolean, pgEnum, varchar, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const userRoleEnum = pgEnum('user_role', ['USER', 'ADMIN', 'SUPER_ADMIN']);
export const reportStatusEnum = pgEnum('report_status', ['PUBLISHED', 'UNDER_REVIEW', 'REMOVED', 'VERIFIED']);
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
  role: userRoleEnum('role').default('USER').notNull(),
  trustScore: integer('trust_score').default(50).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// --- Categories ---
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  icon: varchar('icon', { length: 100 }), // Icon name for frontend
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
  status: reportStatusEnum('status').default('PUBLISHED').notNull(),
  urgency: urgencyEnum('urgency').default('INFO').notNull(),
  reporterId: integer('reporter_id').references(() => users.id).notNull(),
  categoryId: integer('category_id').references(() => categories.id).notNull(),
  cityId: integer('city_id').references(() => cities.id).notNull(),
  areaId: integer('area_id').references(() => areas.id).notNull(),
  placeName: varchar('place_name', { length: 255 }),
  trustScore: integer('trust_score').default(50).notNull(), // Initial score for report
  createdAt: timestamp('created_at').defaultNow().notNull(),
  autoArchiveAt: timestamp('auto_archive_at'),
}, (table) => {
  return {
    categoryIdx: index('category_idx').on(table.categoryId),
    cityIdx: index('city_idx').on(table.cityId),
    areaIdx: index('area_idx').on(table.areaId),
    statusIdx: index('status_idx').on(table.status),
    confidenceIdx: index('confidence_idx').on(table.trustScore),
    createdIdx: index('created_idx').on(table.createdAt),
    urgencyIdx: index('urgency_idx').on(table.urgency),
  };
});

// --- Media ---
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
  media: many(media),
  reactions: many(reactions),
  comments: many(comments),
  notifications: many(notifications),
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
