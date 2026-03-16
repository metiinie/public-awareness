# 🚀 CivicWatch Deployment Guide

This document outlines the step-by-step process for deploying the CivicWatch application. The deployment consists of two parts: the NestJS Backend to Render, and the Expo Frontend to EAS.

---

## 🏗️ 1. Backend Deployment (Render)

We will use Render to host the NestJS API. Your application already connects to Neon PostgreSQL.

### Prerequisites:
- A [Render](https://render.com/) Account.
- Your code must be pushed to a Git repository (GitHub/GitLab).

### Step-by-Step Instructions:

1. **Dashboard**: Go to your Render dashboard and click **New +** > **Web Service**.
2. **Connect Repository**: Connect your GitHub repository containing this project.
3. **Configuration Details**:
    - **Name**: `civicwatch-api` (or any preferred name).
    - **Environment**: `Node`
    - **Root Directory**: `backend` (⚠️ **CRITICAL: Ensure the root directory is set to `backend` since it's a monorepo structure**)
    - **Build Command**: `npm install && npm run build`
    - **Start Command**: `npm run start:prod`
4. **Environment Variables**:
    Under the "Environment" tab, add the following Environment Variables necessary for the application to run:

    | Key | Value |
    | :--- | :--- |
    | `DATABASE_URL` | `postgresql://neondb_owner:npg_3trDsk2WIlam@ep-quiet-art-ahk0k5po-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require` |
    | `PORT` | *(Render handles this automatically, but you can explicitly set `3000` or `8080` if preferred)* |
    | `JWT_SECRET` | *(Add your random JWT secret string here)* |
    | `AWS_REGION` | *(Your AWS Region for uploads)* |
    | `AWS_ACCESS_KEY_ID` | *(Your AWS Access Key)* |
    | `AWS_SECRET_ACCESS_KEY` | *(Your AWS Secret Key)* |
    | `AWS_S3_BUCKET` | *(Your AWS S3 Bucket Name)* |

5. **Deploy**: Click **Create Web Service**. Render will now automatically pull the code, install dependencies, build the NestJS app, and launch it.
6. **Get API URL**: Once deployed successfully, Render will provide a URL (e.g., `https://civicwatch-api.onrender.com`). Copy this URL—you will need it for the frontend!

---

## 📱 2. Frontend Deployment (Expo EAS)

We use Expo Application Services (EAS) to build the mobile app APKs (Android) and IPAs (iOS).

### Prerequisites:
- An [Expo Account](https://expo.dev/).
- Install EAS CLI globally by opening your terminal and running:
  ```bash
  npm install -g eas-cli
  ```
- Make sure you are logged into EAS CLI:
  ```bash
  eas login
  ```

### Step-by-Step Instructions:

1. **Navigate to Frontend**: Open your terminal in the `frontend` folder:
   ```bash
   cd frontend
   ```
2. **Configure EAS Project**: Run the following command to link this local project to your Expo account:
   ```bash
   eas init --id <your-expo-project-id>
   ```
   *(If you don't have a project yet, EAS CLI will prompt you to create one).*
3. **Set API Environment Variable for Production**:
   Inside the `frontend` directory, create or modify an `.env.production` file (or just `.env` if not using profiles yet), and set your Render URL as the API endpoint:
   ```env
   EXPO_PUBLIC_API_URL=https://<your-render-url>.onrender.com/api
   ```
4. **Build the Android APK/AAB**:
   Run the following command to kick off a cloud build for Android:
   ```bash
   eas build -p android --profile production
   ```
   *Note: Expo will ask if you want to generate a keystore. Say "yes" (Y).*
5. **Build for iOS (Requires an Apple Developer Account)**:
   ```bash
   eas build -p ios --profile production
   ```
6. **Download and Install**:
   Once the build completes on the Expo dashboard, it will generate a download link. You can download the `.apk` directly to your Android device to install and test, or submit the `.aab` to the Google Play Store!

---

## ✅ Deployment Checklist

- [ ] NestJS Backend running successfully on Render?
- [ ] `DATABASE_URL` successfully connected via Neon?
- [ ] `EXPO_PUBLIC_API_URL` correctly set in Expo before building?
- [ ] Mobile app correctly performs login via production endpoints?

You're done! Your app should now be live and communicating securely with your Neon database.
