# 🚀 CivicWatch Deployment Guide

This document provides a comprehensive, step-by-step guide to deploying the CivicWatch platform. The application follows a monorepo structure with a **NestJS Backend** and an **Expo React Native Frontend**.

---

## 🏗️ Phase 1: Backend Deployment (Render)

We host the API on Render for its excellent support for Node.js and automatic Git-based deployments.

### 1.1 Prerequisites
- A [Render](https://render.com/) account.
- Your project pushed to a Git provider (GitHub, GitLab, or Bitbucket).
- A [Neon](https://neon.tech/) PostgreSQL database (already configured in the code).

### 1.2 Deployment Steps
1.  **Create New Service**: In the Render Dashboard, click **New +** and select **Web Service**.
2.  **Connect Repo**: Select your CivicWatch repository.
3.  **Basic Configuration**:
    - **Name**: `civicwatch-api`
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

## ✅ Post-Deployment Checklist

- [ ] **Database Connectivity**: Verify logs show successful connection to Neon.
- [ ] **Media Uploads**: Test image uploading from a real device—it should appear in Cloudinary.
- [ ] **CORS**: Ensure the mobile app can successfully communicate with the API.
- [ ] **Admin Access**: Log in to the Admin Dashboard using the `SEED_ADMIN_PASSWORD` you configured.

---

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
