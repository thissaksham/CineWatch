# CineTrack - Personal Watchlist

A modern, private media library built with React, TypeScript, and Supabase. Organize your movie, TV show, and game watchlist with advanced sorting, region-specific streaming info, and privacy-focused data storage.

## 🚀 Features

- **Smart Library**: Automatically sorts TV shows by "Binge Time" (Runtime × Episodes).
- **Streaming Info**: Instantly see where to watch (Netflix, Prime, Hotstar, etc.) in your region using TMDB providers.
- **Games Support**: Track your game backlog with RAWG API integration.
- **Trending Feed**: A noise-free, curated list of weekly popular Movies & TV shows.
- **Universal Search**: Integrated with TMDB API to find any title.
- **Private & Secure**: All user data is stored in your personal Supabase instance with Row Level Security (RLS).
- **Responsive Design**: Built for mobile and desktop.

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Styling**: CSS Modules + CSS Variables
- **State Management**: TanStack Query (React Query), React Context
- **Backend / Auth**: Supabase (Auth, Database, RLS)
- **Data Sources**: TMDB API, RAWG API, Watchmode API
- **Routing**: React Router DOM v7
- **Deployment**: Vercel

## 📂 Project Structure

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed folder structure and design decisions.

```
src/
├── app/                    # Application core (routing, providers)
├── context/                # Global contexts (preferences, search)
├── constants/              # Application constants
├── features/               # Feature-based modules
│   ├── auth/              # Authentication
│   ├── games/             # Games library
│   ├── header/            # Header/Layout
│   ├── media/             # Shared media hooks
│   ├── movies/            # Movies feature
│   ├── search/            # Search functionality
│   ├── shows/             # TV Shows feature
│   ├── upcoming/          # Upcoming releases
│   └── watchlist/         # Watchlist management
├── hooks/                  # Reusable React hooks
├── lib/                    # Core libraries and API clients
├── pages/                  # Standalone pages (auth)
├── shared/                 # Shared/reusable components
├── styles/                 # Global styles
├── types/                  # TypeScript type definitions
└── utils/                  # Utility functions
```

## 🗄️ Database Schema

The project uses Supabase with Row Level Security (RLS) enabled.

### watchlist table

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `uuid` | Primary Key |
| `user_id` | `uuid` | FK to `auth.users` (RLS Owner) |
| `tmdb_id` | `int` | ID from TMDB |
| `type` | `varchar` | `movie` or `show` |
| `title` | `varchar` | Title of the media |
| `poster_path` | `varchar` | TMDB image path |
| `vote_average`| `decimal`| Rating |
| `status` | `varchar` | Current watch status |
| `metadata` | `jsonb` | Full TMDB object cache |
| `last_watched_season` | `int` | For TV shows |
| `progress` | `int` | Episode progress |
| `created_at` | `timestamp`| Record creation time |
| `updated_at` | `timestamp`| Last update time |

## ⚡ Setup & Installation

### Prerequisites

- Node.js (v18+)
- Supabase Account
- TMDB API Key

### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/personal-watchlist.git
   cd personal-watchlist
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   
   Copy `.env.example` to `.env` and fill in your values:
   ```bash
   cp .env.example .env
   ```

   Required variables:
   - `VITE_SUPABASE_URL` - Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` - Your Supabase anon key
   - `VITE_TMDB_API_KEY` - Your TMDB API key
   - `CRON_SECRET` - Secret for cron job authentication (generate with `openssl rand -hex 32`)

4. **Database Setup**
   
   Run the SQL migrations in your Supabase SQL Editor to create tables and RLS policies.

5. **Run Locally**
   ```bash
   npm run dev
   ```

## 🔒 Security

This project implements several security measures:

- **Row Level Security (RLS)**: Users can only access their own data
- **API Proxies**: Backend proxies hide API keys from the client
- **Rate Limiting**: API proxies include rate limiting protection
- **Content Security Policy**: Strict CSP headers in production
- **Input Validation**: All user inputs are validated
- **CRON_SECRET**: Scheduled jobs require authentication

## 🚀 Deployment

### Vercel (Recommended)

1. Import repository to Vercel
2. Add Environment Variables from your `.env` file
3. Deploy!

> **Important**: Ensure you set `CRON_SECRET` in Vercel environment variables for the refresh job to work.

### Environment Variables for Vercel

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (for server-side operations)
- `VITE_TMDB_API_KEY`
- `CRON_SECRET` (required for /api/refresh endpoint)
- `VITE_WATCHMODE_API_KEY` (optional)
- `VITE_RAWG_API_KEY` (optional, for games)

## 📜 Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run test` - Run tests
- `npm run lint` - Run ESLint
- `npm run refresh` - Manually run database refresh script

## 🧪 Testing

```bash
npm run test
```

Tests use Vitest with React Testing Library.

## 📝 License

Private project - All rights reserved.
