# Trust Circle

## 1. Overview

**Trust Circle** is a location-based social discovery application built around a simple idea:

> **People trust experiences shared by people they know.**

Traditional review platforms mostly show users anonymous ratings and reviews. A person might see that a restaurant has a 4.7-star rating from hundreds of people, but they often have no idea whether they should personally trust those opinions.

Trust Circle approaches discovery differently.

Instead of focusing only on anonymous ratings, Trust Circle connects **places, experiences, and real relationships**.

Users can visit a place, share their experience with a photo, rating, and written review, and choose who should see it.

When another user discovers that place, Trust Circle shows **who wrote the experience and how that person is connected to them**.

For example:

```text
🔴 Ahmed Khan
   Your Circle

★★★★★

Bala Hisar Fort

"The view around sunset was incredible.
Definitely worth visiting."

Visited September 2026
```

If the reviewer is not personally connected to the viewer:

```text
🟡 Community

★★★★★

Bala Hisar Fort

"Beautiful place with an amazing view."

Visited September 2026
```

The fundamental idea is:

> **Don't just show me what people think. Show me who is recommending it.**

---

# 2. The Problem

Traditional review platforms have several limitations.

## Anonymous reviews

Users usually see:

```text
★★★★★ 4.7

1,284 reviews
```

But they don't necessarily know:

* Who wrote them
* Whether they know those people
* Whether the reviewer has similar preferences
* Whether the experience is recent
* Whether the review is genuine
* Why they should trust one review over another

## Rating overload

Many platforms turn experiences into numbers.

A place becomes:

```text
4.6 / 5
```

But a number doesn't explain the human context behind the experience.

## Lack of personal discovery

People often discover places through:

* Friends
* Family
* Coworkers
* People they trust
* Local communities

Existing review platforms often separate discovery from personal relationships.

Trust Circle brings those two things together.

---

# 3. The Core Idea

Trust Circle combines:

**Location + Social Relationships + Personal Experiences**

into one system.

The basic flow is:

```text
Person
   ↓
Visits a place
   ↓
Creates an experience
   ↓
Adds photo
   ↓
Adds star rating
   ↓
Writes what they thought
   ↓
Chooses who can see it
   ↓
Experience appears on the map
   ↓
Another person discovers it
   ↓
Trust Circle shows who shared it
```

The application therefore makes the **reviewer part of the review experience**.

---

# 4. What Is an Experience?

Trust Circle does not treat everything as a traditional "review."

The primary content object is an **Experience**.

An experience represents:

> **A person's personal experience at a real-world place.**

An experience can be about almost anything:

* Restaurant
* Café
* Hotel
* Park
* Museum
* Tourist attraction
* Historical location
* Beach
* Hiking trail
* Shopping area
* Event
* Concert
* Entertainment venue
* Cultural location
* Local attraction
* Any physical place

The system does not require different review forms for every type of experience.

Every experience shares the same simple foundation.

---

# 5. Creating an Experience

The review process is intentionally simple.

The user provides:

### 1. Place

Where did you go?

### 2. Photo

Show what you experienced.

Photos are optional.

### 3. Rating

A simple 1-5 star rating.

### 4. Written experience

The user writes what they thought.

### 5. Visit date

When did they visit?

### 6. Visibility

Who should see the experience?

The complete flow is:

```text
Choose Place
      ↓
Add Photo
      ↓
Give Rating
      ↓
Write Experience
      ↓
Choose Visit Date
      ↓
Choose Visibility
      ↓
Preview
      ↓
Publish
```

There are no complicated questionnaires.

There are no category-specific rating systems.

A restaurant does not require food/service/cleanliness ratings.

A museum does not require exhibit/education/accessibility ratings.

A hiking trail does not require difficulty/view/safety ratings.

The user simply tells their story.

---

# 6. Review Philosophy

Trust Circle should not feel like filling out a form.

The experience should feel like:

> **"I went somewhere. Here's what I experienced. Here's what I thought. Here's who I want to share it with."**

The writing prompt can simply be:

**What would you tell a friend?**

This keeps the content human and flexible.

---

# 7. Social Trust System

The defining feature of Trust Circle is the relationship between the reviewer and the person viewing the review.

Trust Circle uses relationship levels.

## Your Circle

🔴 **Your Circle**

The reviewer is someone the user personally knows.

Example:

```text
🔴 Ahmed Khan
   Your Circle
```

## Extended Circle

🟠 **Extended Circle**

The reviewer is connected through the user's wider social network.

Example:

```text
🟠 Sara Ali
   Extended Circle
```

## Community

🟡 **Community**

The reviewer is not directly connected to the user.

Example:

```text
🟡 Muhammad
   Community
```

### Important

These colors represent **relationship proximity**, not review quality.

They do not mean:

```text
Red = good review
Yellow = bad review
```

They only communicate:

```text
Red = direct connection
Orange = extended connection
Yellow = community
```

---

# 8. Friends and Circle

Users can connect with other users.

The basic friendship lifecycle is:

```text
Send Request
      ↓
Pending
      ↓
Accepted
      ↓
Direct Circle
```

Users can:

* Search for people
* Send friend requests
* Accept requests
* Reject requests
* Remove connections
* Block users

A friendship creates the relationship required for the Trust Circle experience.

---

# 9. Map-Based Discovery

The main discovery experience is a map.

When users open Trust Circle, they can see nearby places and experiences.

The map can show experiences from:

* Their Circle
* Their Extended Circle
* The broader Community

Example:

```text
                 MAP

       🔴
    Bala Hisar
       ★★★★★

                    🟡
                  Coffee
                   ★★★★

   🟠
 Restaurant
  ★★★★☆
```

The markers communicate relationship context.

---

# 10. Experience Map Interaction

When the user taps a map marker, a bottom sheet can appear.

Example:

```text
Bala Hisar Fort

🔴 Ahmed · Your Circle

★★★★★

"The view around sunset was incredible."

Visited September 2026

View Experience →
```

The user can then open the complete experience.

---

# 11. Place Pages

A place is separate from an individual experience.

For example:

```text
Bala Hisar Fort
```

is a place.

Ahmed's visit:

```text
Ahmed
★★★★★
"Beautiful place..."
```

is an experience.

Sara's visit:

```text
Sara
★★★★☆
"Great historical location..."
```

is another experience.

The relationship is:

```text
Bala Hisar Fort
       │
       ├── Ahmed's Experience
       ├── Sara's Experience
       ├── Hamza's Experience
       └── Other Experiences
```

This allows Trust Circle to eventually create complete place pages.

---

# 12. Place Discovery

A user can search for places.

The search can consider:

* Place name
* Location
* Category
* Distance
* Nearby places

Example:

```text
Search places

Bala Hisar Fort
Peshawar

Khyber Restaurant
Peshawar

Coffee Planet
Peshawar
```

Nearby places can also be suggested using the user's current location.

---

# 13. Creating New Places

If a place does not exist in Trust Circle, users can add it.

Example:

```text
Can't find this place?

+ Add a new place
```

A new place can contain:

* Name
* Location
* Address
* Category
* Cover image — the place's **own** photo, uploaded with the place (`POST /uploads`
  with a `placeId`). It is not derived from experiences: a reviewer's photo belongs to
  their experience, not to the place. A place added without one has no cover. See §4 of
  `docs/API.md`.

The backend should prevent duplicate places where possible.

For example, these should ideally resolve to the same place:

```text
Bala Hisar Fort
Bala Hisar
Balahisar Fort
```

---

# 14. Experience Data Model

An experience contains:

```text
Experience
├── ID
├── User
├── Place
├── Rating
├── Review text
├── Visit date
├── Visibility
├── Photos
├── Created date
└── Updated date
```

The user is the author.

The place is the location.

The experience is the personal story connecting the two.

---

# 15. Photo System

An experience can contain multiple photos.

Example:

```text
Experience
   │
   ├── Photo 1
   ├── Photo 2
   ├── Photo 3
   └── Photo 4
```

Users can:

* Upload photos
* Add multiple photos
* Remove photos
* Reorder photos

Photos should be stored in object storage rather than directly inside the application database.

The database stores photo metadata and storage references.

---

# 16. Visibility System

Every experience has a visibility setting.

Initial options:

```text
circle
extended
community
```

Potential future option:

```text
private
```

The backend must enforce visibility.

The frontend should never be trusted to hide private content.

For example:

If Ahmed publishes an experience to:

```text
Your Circle
```

then only users who satisfy the Circle relationship should receive that experience from the API.

---

# 17. Relationship-Aware Experiences

The same experience can appear differently depending on who is viewing it.

For example:

Ahmed publishes:

```text
★★★★★

Bala Hisar Fort
```

Sara is Ahmed's friend.

Sara sees:

```text
🔴 Ahmed
   Your Circle

★★★★★
```

Bilal has no relationship with Ahmed.

Bilal sees:

```text
🟡 Ahmed
   Community

★★★★★
```

Therefore the backend should calculate the relationship **for the current viewer**.

The relationship should not be permanently stored as a color on the experience.

---

# 18. Backend Architecture

The backend can be organized around several major modules.

```text
Authentication
      │
      ├── Users
      │
      ├── Friendships
      │
      ├── Places
      │
      ├── Experiences
      │
      ├── Photos
      │
      └── Discovery
```

Core backend responsibilities:

### Authentication

* Registration
* Login
* Sessions/tokens
* Password management
* User profiles

### Users

* Profiles
* Avatars
* User experiences
* User connections

### Friendships

* Friend requests
* Accept/reject
* Remove friend
* Block
* Relationship lookup

### Places

* Search
* Create
* Update
* Nearby places
* Duplicate detection

### Experiences

* Create
* Read
* Update
* Delete
* Visibility
* Ratings
* Reviews
* Visit dates

### Photos

* Upload
* Associate with experience
* Delete
* Reorder

### Discovery

* Nearby experiences
* Nearby places
* Circle experiences
* Extended experiences
* Community experiences

---

# 19. Core Database Structure

A basic relational structure can be:

```text
users
  │
  ├──────── friendships
  │
  └──────── experiences
                │
                ├──────── places
                │
                └──────── experience_photos
```

Core tables:

```text
users
friendships
places
experiences
experience_photos
```

Additional tables can be introduced later when required.

The first version should avoid unnecessary complexity.

---

# 20. Core API Examples

### Authentication

```http
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
```

### Users

```http
GET /api/users/:id
PATCH /api/users/me
GET /api/users/:id/experiences
```

### Friends

```http
POST /api/friends/request/:userId
GET /api/friends
GET /api/friends/requests
POST /api/friends/:requestId/accept
POST /api/friends/:requestId/reject
DELETE /api/friends/:userId
```

### Places

```http
GET /api/places/search
GET /api/places/:id
POST /api/places
GET /api/places/:id/experiences
```

### Experiences

```http
POST /api/experiences
GET /api/experiences/:id
PATCH /api/experiences/:id
DELETE /api/experiences/:id
```

### Discovery

```http
GET /api/explore/nearby
```

### Uploads

```http
POST /api/uploads/presign
```

---

# 21. Nearby Discovery

The backend should support geographic queries.

Example:

```http
GET /api/explore/nearby?lat=34.015&lng=71.580&radius=5000
```

The backend should:

1. Find nearby places.
2. Find experiences associated with those places.
3. Check experience visibility.
4. Determine the relationship between the reviewer and current user.
5. Return the relevant experiences.
6. Return relationship metadata.

Example response:

```json
{
  "id": "experience_123",
  "place": {
    "id": "place_123",
    "name": "Bala Hisar Fort",
    "latitude": 34.015,
    "longitude": 71.580
  },
  "reviewer": {
    "id": "user_123",
    "name": "Ahmed",
    "avatar": "..."
  },
  "rating": 5,
  "review": "The view was incredible.",
  "visitedAt": "2026-09-18",
  "relationship": {
    "type": "direct_friend",
    "label": "Your Circle"
  }
}
```

---

# 22. Trust and Authenticity

Trust Circle's first trust mechanism is **social context**.

The application does not initially need to create complicated review verification systems.

Instead, users can understand:

* Who created the experience
* Whether they know that person
* When the experience happened
* What the person actually wrote
* What photos they shared

Future versions could introduce additional trust signals.

Potential future signals include:

* Location confirmation
* Visit confirmation
* Photo metadata
* Repeated behavior patterns
* Community reporting
* Suspicious activity detection
* Review authenticity analysis

These should not complicate the initial product.

---

# 23. Future Trust Signals

A future experience could display additional information such as:

```text
★★★★★

🔴 Ahmed · Your Circle

Visited September 18

📍 Visited this location
📷 3 original photos
```

These signals can help users understand the context behind an experience without turning Trust Circle into a complicated verification platform.

---

# 24. Profile

A user's profile should represent their history of experiences.

Example:

```text
Ahmed Khan

42 Experiences
18 Friends

Experiences
Saved
Circle
```

The profile can show:

* User information
* Experiences created
* Places visited
* Photos
* Friends
* Saved experiences

The experience history becomes a personal travel/discovery journal.

---

# 25. Saved Experiences

Users can save experiences they want to revisit.

Example:

```text
Saved

Bala Hisar Fort
★★★★★
🔴 Ahmed

Khyber Restaurant
★★★★☆
🟠 Sara

Museum
★★★★★
🟡 Community
```

Saving is separate from reviewing.

---

# 26. Activity

The application can later have an activity feed showing relevant activity.

Examples:

```text
Ahmed shared a new experience.

Sara visited a place near you.

Hamza accepted your friend request.
```

The activity system should remain focused on discovery rather than becoming a generic social-media feed.

---

# 27. Notifications

Potential notifications:

```text
Friend request received

Friend request accepted

Someone in your Circle shared an experience nearby

Someone interacted with your experience
```

Notifications should support discovery and relationships rather than encourage excessive engagement.

---

# 28. Search

Trust Circle search should eventually support:

### Places

```text
Bala Hisar Fort
```

### People

```text
Ahmed Khan
```

### Experiences

Search can surface relevant experiences based on:

* Place
* Location
* People
* Nearby discovery

---

# 29. Map + Social Graph

One of the most important concepts in Trust Circle is the combination of:

```text
Geography
+
Social Graph
```

Traditional map:

```text
What is around me?
```

Trust Circle:

```text
What is around me
that people connected to me have experienced?
```

This changes the purpose of the map.

The map becomes a visual representation of:

**Places + Experiences + Relationships**

---

# 30. Example User Journey

Imagine Ahmad is visiting a new city.

He opens Trust Circle.

The map shows:

```text
🔴 Ahmed's friend
★★★★★
Restaurant

🟠 Friend-of-friend
★★★★☆
Museum

🟡 Community
★★★★★
Tourist attraction
```

Ahmad taps the restaurant.

He sees:

```text
Khyber Restaurant

🔴 Sara
★★★★★

"The food was excellent.
Try the BBQ."

Visited September 2026
```

Because Sara is someone Ahmad knows, the experience has personal context.

Ahmad decides to visit.

Later, Ahmad creates his own experience:

```text
Khyber Restaurant

★★★★☆

"Really good food. The service
was a little slow, but I'd come back."

Visited September 2026
```

Now another person in Ahmad's Circle can discover that experience.

The network becomes a collection of real experiences attached to real places.

---

# 31. What Makes Trust Circle Different

Trust Circle is not primarily trying to answer:

> **"What is the highest-rated place?"**

Instead, it tries to answer:

> **"What places have people I trust actually experienced?"**

The product combines:

```text
Maps
+
Places
+
Experiences
+
Photos
+
Ratings
+
Social Connections
+
Visibility
```

The result is a discovery system based on **people and places together**.

---

# 32. MVP Scope

The first version should focus on proving the core idea.

### Required

* User registration/login
* User profiles
* Friend requests
* Friend relationships
* Map
* Nearby places
* Place search
* Create place
* Create experience
* Photo upload
* Star rating
* Written review
* Visit date
* Visibility
* Experience detail
* Relationship labels
* Nearby experience discovery
* Edit experience
* Delete experience

### Not required initially

* AI-generated reviews
* Complex review scoring
* Review authenticity algorithms
* Category-specific questionnaires
* Advanced recommendation algorithms
* Gamification
* Followers
* Influencer systems
* Complex reputation scores
* Merchant dashboards
* Business advertising
* Paid promotion

The first objective is to validate:

> **Do people discover places differently when they can see experiences from people they know?**

---

# 33. Long-Term Vision

If the core concept works, Trust Circle can evolve into a personal discovery network.

Instead of asking:

> "Where should I go?"

a user can ask:

> "Where have people I trust actually been?"

Instead of:

> "Which restaurant has the highest rating?"

the user can discover:

> "Which restaurants have my friends experienced?"

Instead of an anonymous review feed, the application becomes a living map of people's experiences.

The long-term vision is:

```text
             TRUST CIRCLE

        PEOPLE ←──────→ PLACES
           │               │
           │               │
           └── EXPERIENCES ┘
                  │
                  ▼
             DISCOVERY
                  │
                  ▼
                MAP
```

---

# 34. Core Product Principle

Every feature should reinforce one central principle:

> **Trust Circle helps people discover places through the experiences of people they know.**

The application should remain:

**Simple to share.**

**Easy to discover.**

**Personal in context.**

**Visual in presentation.**

**Clear about relationships.**

The product should never become so complicated that the simple act of saying:

> **"I went here, and this is what I thought."**

gets buried under the machinery.
