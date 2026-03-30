ALTER TABLE "users" ALTER COLUMN "notification_settings" SET DEFAULT '{"pushEnabled":true,"criticalOnly":false,"statusUpdates":true}';--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "latitude" real;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "longitude" real;