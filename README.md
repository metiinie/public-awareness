# CivicWatch — Public Awareness & Issue Discovery

CivicWatch is a community-driven infrastructure reporting platform that uses an **Evidence-First** and **Trust-Based** model to help citizens discover and validate local problems.

## 🚀 Core System Logic (MVP)

### 1. Evidence Rule
Reports MUST include at least one **Image** or **Video**. Submissions without media are automatically rejected by the backend to ensure high-quality evidence.

### 2. Voting System
Community members validate reports by voting:
- **👍 Real**: Confirms the issue existence.
- **👎 Fake**: Marks the report as inaccurate or spam.
*Each user is restricted to one vote per report.*

### 3. Confidence Score Logic
Every report receives a dynamic confidence score (0-100) based on:
`confidence = (vote_ratio * 0.5) + (reporter_trust * 0.3) + (age_decay * 0.2)`
- **Vote Ratio**: Real Votes / Total Votes.
- **Reporter Trust**: The reliability score of the user who submitted the report.
- **Age Decay**: Older reports lose confidence over time to prioritize fresh issues.

### 4. Trust Score Logic
User reliability is dynamic:
- **Base Trust**: 50
- **Real Confirmed Report**: +5 Trust
- **Fake Report**: -10 Trust
Users with higher trust scores have their reports featured more prominently.

### 5. Auto Archiving
Reports are temporal and expire based on category:
- **Traffic**: 6 hours
- **Power / Water**: 24 hours
- **Other**: 24 hours
Expired reports transition to an `ARCHIVED` state and are removed from the active discovery feed.

### 6. Feed Ranking Logic
The discovery feed prioritizes information quality:
1. **Confidence Score** (Highest first)
2. **Recency** (Newest first)

---

## 📱 Mobile Navigation Map

### Home (Issue Discovery)
- **Feed**: List of local issues filtered by City/Area.
- **Report Detail**: Full evidence view, confidence breakdown, and voting.
- **Filter Screen**: Granular location and category selection.

### Report (Evidence Submission)
- **Capture Media**: Camera/Gallery interface (Image or Video).
- **Report Form**: Submitting details (Category, Location, Description).
- **Preview & Submit**: Final check before validation.

### Alerts (Local Notifications)
- **Alerts Feed**: Notifications for issues matching subscriptions.
- **Subscriptions**: Hierarchical following (City → Area → Category).

### Profile (Identity & Trust)
- **Overview**: Trust Score and activity summary.
- **My Reports / My Votes**: Personal action history.
- **Settings**: Notifications and account management.

---

## 🛠 Tech Stack
- **Backend**: NestJS, Drizzle ORM, PostgreSQL, Redis.
- **Frontend**: Expo, TypeScript, NativeWind, Zustand, TanStack Query.
- **Aesthetics**: Premium Dark Theme (Slate/Emerald).
