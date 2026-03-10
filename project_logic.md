# Project Logic: Community-Powered Real-Time Public Awareness Platform

## 1. Core Architecture: Non-Geo Model
The platform intentionally avoids geographic coordinates (GPS) in favor of a structured administrative hierarchy. This ensures organized reporting without mapping complexity.

### Administrative Hierarchy
1.  **Country** (Standardized)
2.  **City** (Selected from system list)
3.  **Area / Sub-city** (Dependent on selected City)
4.  **Specific Place Name** (Optional text)

## 2. Report Specifications
### Allowed Categories
- **Roads & Transportation**: Traffic, Damage, Flooding, Blockage.
- **Public Services**: Power, Water, Hospital congestion, Govt delays.
- **Business Conditions**: Hygiene, Overcrowding, Status (Evidence-based only).

### Data Requirements
- **Evidence**: Mandatory photo or video (max 30s).
- **Urgency Levels**: `Info`, `Warning`, `Critical`.
- **States**: `Published`, `Under Review`, `Removed`, `Verified`.

## 3. Trust & Scoring System
The visibility and reliability of reports are governed by a confidence-based scoring model.

### Confidence Score Calculation
- **Vote Ratio**: Real vs. Fake votes.
- **Reporter Trust Score**: History of verified/accurate reports.
- **Report Count**: Multiple reports for the same incident increase confidence.
- **Freshness**: Older reports lose confidence (especially for time-sensitive issues like traffic).

### User Trust Score
- **Increases**: Validated reports, upvotes.
- **Decreases**: Removed reports, fake votes, violations.
- **Low-Trust Constraints**: Higher moderation sensitivity, limited posting frequency, lower visibility.

## 4. Search & Discovery
Purely text-based and filter-based (No Map).
- **Filters**: Category, Urgency, City, Area, Date, Media Type, Status.
- **Sorting**: Recency, Urgency, Confidence, Validation level.

## 5. Moderation & Governance
- **Automated**: Profanity and spam detection, media validation.
- **Manual**: Admin review for flagged reports with required reasoning and audit logging.

## 6. Subscription & Notification
Engagement is location-centric but non-geo.
- **Subscribable Triggers**: City, Area, or Category within an Area.
- **Notification Types**: Critical reports, Verified status updates, High-confidence alerts.
