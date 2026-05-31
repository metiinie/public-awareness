# 🚀 Civic Eye Deployment Guide

This document provides a comprehensive, step-by-step guide to deploying the Civic Eye platform. The application follows a monorepo structure with a **NestJS Backend** and an **Expo React Native Frontend**.

---

## 🏗️ Phase 1: Backend Deployment (Render)

We host the API on Render for its excellent support for Node.js and automatic Git-based deployments.

### 1.1 Prerequisites
- A [Render](https://render.com/) account.
- Your project pushed to a Git provider (GitHub, GitLab, or Bitbucket).
- A [Neon](https://neon.tech/) PostgreSQL database (already configured in the code).

### 1.2 Deployment Steps
1.  **Create New Service**: In the Render Dashboard, click **New +** and select **Web Service**.
2.  **Connect Repo**: Select your Civic Eye repository.
3.  **Basic Configuration**:
    - **Name**: `civiceye-api`
    - **Environment**: `Node`
    - **Region**: Select the one closest to your users.
    - **Branch**: `main` (or your production branch).
4.  **Build & Settings**:
    - **Root Directory**: `backend` (⚠️ **Essential** for monorepos).
    - **Build Command**: `npm install && npm run build` (⚠️ **DO NOT** include Prisma commands)
    - **Start Command**: `npm run start:prod`
5.  **Environment Variables**:
    Navigate to the **Environment** tab and add the following:

    | Key | Value / Description |
    | :--- | :--- |
    | `DATABASE_URL` | Your Neon connection string (ensure it includes `?sslmode=require`). |
    | `JWT_SECRET` | A long, random string for signing tokens. |
    | `NODE_ENV` | `production` |
    | `ALLOWED_ORIGINS` | Comma-separated URLs (e.g., `https://your-frontend.com` or `*` for initial testing). |
    | `CLOUDINARY_CLOUD_NAME` | Your Cloudinary Cloud Name. |
    | `CLOUDINARY_API_KEY` | Your Cloudinary API Key. |
    | `CLOUDINARY_API_SECRET` | Your Cloudinary API Secret. |
    | `SEED_ADMIN_PASSWORD` | Password for the initial admin user seeding. |
    | `UPSTASH_REDIS_REST_URL` | Your Upstash Redis REST URL. |
    | `UPSTASH_REDIS_REST_TOKEN` | Your Upstash Redis REST Token. |

6.  **Advanced (Port)**: Render detects the port automatically, but the app is pre-configured to listen on `process.env.PORT`.
7.  **Finalize**: Click **Create Web Service**.

### 1.3 Verification
- Once the status is `Live`, visit `{your-url}/api/docs`.
- If the Swagger UI appears, your backend is correctly deployed.

---

## 📱 Phase 2: Frontend Deployment (Expo EAS)

We use Expo Application Services (EAS) for building and distributing the mobile application.

### 2.1 Prerequisites
- An [Expo](https://expo.dev/) account.
- **EAS CLI** installed globally: `npm install -g eas-cli`.
- Logged into the CLI: `eas login`.

### 2.2 Build Steps
1.  **Prepare Terminal**: Navigate to the frontend directory:
    ```bash
    cd frontend
    ```
2.  **Initialize EAS**:
    ```bash
    eas init --id <your-project-id>
    ```
3.  **Configure Production API**:
    Create a file named `.env` in the `frontend` directory:
    ```env
    EXPO_PUBLIC_API_URL=https://your-backend-url.onrender.com/api
    ```
4.  **Run Build (Android)**:
    ```bash
    eas build -p android --profile production
    ```
    - Follow prompt to "Generate a new Android Key".
    - Wait for the cloud build to finish.
5.  **Run Build (iOS)**:
    *(Requires Apple Developer Account)*
    ```bash
    eas build -p ios --profile production
    ```

### 2.3 Installation
- Once the build is complete, Expo will provide a QR code or a link to download the `.apk` (Android) or install via TestFlight (iOS).

---

## 🔐 Phase 3: Security Configuration

### 3.1 JWT Secret
The `JWT_SECRET` **must** be at least 64 characters of cryptographic randomness. Generate one with:

```bash
openssl rand -hex 64
```

> [!CAUTION]
> **Never commit `.env` to version control.** Ensure `.env` is listed in `.gitignore`.
> If the secret was previously exposed, rotate it immediately — all existing JWTs become invalid on rotation.

### 3.2 CORS Origins
Set `ALLOWED_ORIGINS` to your specific domain(s) in production. Never leave it as `*`:

```env
ALLOWED_ORIGINS=https://civiceye.app,https://admin.civiceye.app
```

---

## 💾 Phase 4: Database Backup & Restore

### 4.1 Automatic Backups (Neon)
Neon provides automatic Point-in-Time Recovery (PITR):

1. **Check retention**: Log in to [Neon Console](https://console.neon.tech/) → select your project → **Settings** → **Storage**.
2. **Default retention**: Free tier = 7 days, Pro tier = 30 days.
3. **Verify PITR is active**: Navigate to **Branches** → your main branch should show continuous WAL archiving.

### 4.2 Manual Backup (pg_dump)
For an extra safety net, schedule periodic `pg_dump` exports:

```bash
# Full schema + data dump
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file=backup_$(date +%Y%m%d_%H%M%S).dump

# Schema-only (for migration reference)
pg_dump "$DATABASE_URL" \
  --schema-only \
  --file=schema_$(date +%Y%m%d).sql
```

**Recommended schedule**: Run `pg_dump` daily via a CI/CD cron job or a scheduled task on your deployment platform.

### 4.3 Restore Procedure

#### Option A: Neon PITR (Preferred for disaster recovery)
1. Go to Neon Console → **Branches**.
2. Click **Create Branch** → select **Point in time** → pick the timestamp to restore to.
3. A new branch is created with the data at that point.
4. Update your `DATABASE_URL` in Render to point to the new branch.
5. Verify the app connects and data is correct.
6. Once confirmed, delete the old branch if desired.

#### Option B: Restore from pg_dump
```bash
# Create a fresh database or use a branch
pg_restore \
  --dbname="$NEW_DATABASE_URL" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  backup_20260531_120000.dump
```

### 4.4 Restore Drill (Required Before Launch)

> [!IMPORTANT]
> Perform this drill **before** the first production launch to confirm the procedure works.

1. Take a `pg_dump` of the current database.
2. Create a new Neon branch (or a separate test DB).
3. Restore the dump into the new branch.
4. Point a local instance of the backend at the restored DB.
5. Verify:
   - [ ] Users can log in.
   - [ ] Reports load correctly with media.
   - [ ] Admin dashboard shows correct stats.
6. Document the result and date of the drill.

**Last drill performed**: ___________ (fill in after completing)

---

## ✅ Post-Deployment Checklist

- [ ] **Database Connectivity**: Verify logs show successful connection to Neon.
- [ ] **Media Uploads**: Test image uploading from a real device—it should appear in Cloudinary.
- [ ] **CORS**: Ensure the mobile app can successfully communicate with the API.
- [ ] **Admin Access**: Log in to the Admin Dashboard using the `SEED_ADMIN_PASSWORD` you configured.
- [ ] **JWT Secret**: Confirm the secret is ≥64 characters and NOT committed to the repo.
- [ ] **ALLOWED_ORIGINS**: Confirm it is set to specific domains, not `*`.
- [ ] **NODE_ENV**: Confirm it is set to `production` on Render.
- [ ] **Backup Drill**: Confirm a restore drill has been performed and documented.
- [ ] **Swagger**: Verify `/api/docs` is accessible (or disable in production if not needed).

---

## 🛠️ Troubleshooting Common Issues

### ❌ Build Failure: "Could not find Prisma Schema"
If your Render build fails with an error about Prisma, it's because Render auto-detected a `prisma` folder (likely deep in `node_modules`).
**Fix**: 
1. Go to your Render Dashboard.
2. Select your Web Service.
3. Go to **Settings**.
4. Find **Build Command** and ensure it is EXACTLY: `npm install && npm run build`.
5. Remove any reference to `npx prisma generate` or `npx prisma migrate`.

💡 *Tip: For real-time monitoring, check the "Logs" tab on Render to spot any runtime errors.*

