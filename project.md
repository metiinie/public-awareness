# CivicWatch: Community-Powered Public Awareness Platform

CivicWatch is a comprehensive full-stack mobile application designed to empower citizens to report and discover local infrastructure issues, public service delays, and community-relevant events. It operates on an **Evidence-First** and **Trust-Based** model, ensuring that all reported information is high-quality and verified by the community.

## 📱 Application Overview
**CivicWatch** bridges the gap between citizens and city maintenance by providing a real-time, transparent platform for issue discovery. Unlike traditional reporting tools, it avoids complex geographic mapping in favor of a structured administrative hierarchy, making it highly organized and accessible.

---

## 🚀 Key Features

### 1. Issue Reporting & Discovery
*   **Structured Hierarchy**: Reports are organized by **Country → City → Area/Sub-city**, allowing for precise local targeting without needing GPS coordinates.
*   **Evidence Requirement**: Every report must include a **Photo or Video** as proof, ensuring the platform remains high-trust.
*   **Urgency Levels**: Issues are categorized as `Info`, `Warning`, or `Critical` to help users prioritize their attention.
*   **Smart Feed**: The main feed ranks issues based on a **Confidence Score** and **Recency**, highlighting the most relevant and verified problems.

### 2. Community Verification (The Trust Engine)
*   **Crowdsourced Validation**: Users can vote **👍 Real** or **👎 Fake** on any report.
*   **Confidence Scoring**: A dynamic score (0-100) is calculated for every report using:
    *   **Vote Ratio**: Ratio of positive validation vs. negative.
    *   **Reporter Trust**: The historical reliability of the user who posted it.
    *   **Age Decay**: Older reports lose confidence over time to keep information fresh.
*   **User Trust Score**: Active contributors earn trust over time, while bad actors (spam/fake reports) see their visibility decreased.

### 3. Subscriptions & Real-Time Alerts
*   **Location Subscriptions**: Users can follow specific Cities or Areas (e.g., "Bole" or "Addis Ababa").
*   **Custom Notifications**: Get notified only for what matters—specific categories (like "Water") or high-urgency alerts in your sub-city.
*   **Status Updates**: Be informed when a report you're interested in is **Verified** or **Resolved**.

### 4. Food & Business Reviews
*   A dedicated module for community-based **Restaurant and Food Reviews**, integrated with the same location-based filtering system (e.g., finding the best Italian food in the "Kassanchis" area).

### 5. Advanced User Settings
*   Comprehensive profile management including **Trust Score visibility**, activity history (My Reports, My Votes), and granular privacy/notifications controls.

---

## 🛠 Technical Stack

### **Frontend (Mobile)**
*   **Framework**: Expo / React Native
*   **Language**: TypeScript
*   **Styling**: NativeWind (Tailwind CSS)
*   **State Management**: Zustand
*   **Data Fetching**: TanStack Query (React Query)

### **Backend (Server)**
*   **Framework**: NestJS (Node.js)
*   **ORM**: Drizzle ORM
*   **Database**: PostgreSQL
*   **Caching & Background Jobs**: Redis
*   **Storage**: Cloudinary for media uploads

### **DevOps & Environment**
*   **Deployment**: Docker Compose for local infrastructure (PostgreSQL, Redis).
*   **Architecture**: Monorepo-style structure with shared types and a micro-service inspired layout.

---

## 📂 Project Structure
*   `frontend/`: The Expo mobile application source code.
*   `backend/`: The NestJS API server and business logic.
*   `shared/`: Common TypeScript types and validation schemas used by both frontend and backend.
*   `docker-compose.yml`: Local environment setup for database and cache services.

---

## 🎯 Project Roadmap & Goals
*   **Verified Badge implementation**: High-trust users receive visual badges.
*   **Auto-Archiving logic**: Ensuring temporal issues (like traffic) disappear automatically after they are no longer relevant.
*   **Admin Dashboard**: Advanced moderation tools for manual report review.
