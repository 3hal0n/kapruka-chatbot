# Ruki: Kapruka's AI Gift Concierge

Ruki is built to be a genuine, proactive shopping copilot for [Kapruka](https://www.kapruka.com), Sri Lanka's leading gifting platform, rather than just a search box.

**Live demo:** https://kapruka-chatbot.vercel.app/

<p align="center">
  <img src="frontend/public/snippets/home-light-mode.png" width="49%" alt="Ruki home screen, light mode" />
  <img src="frontend/public/snippets/home-dark-mode.png" width="49%" alt="Ruki home screen, dark mode" />
</p>

To make the experience feel like magic, development focused heavily on local context and a frictionless UI. Here are the key capabilities to try out.

## Features

### Fluent in Tanglish and Sinhala

Ruki understands local context and responds with genuine Sri Lankan personality, not a generic translated assistant.

<img src="frontend/public/snippets/birthday-gift-response.png" width="70%" alt="Ruki replying to a birthday gift request in Tanglish" />

### Multi-agent architecture

Behind the scenes, a dynamic router delegates tasks to specialized agents: a conversational "Concierge," a precise "Shopper" for the catalog, a "Logistics" agent for delivery feasibility, and a "Critic" that enforces strict allergy and preference filtering before anything is recommended.

<img src="frontend/public/snippets/allergy.png" width="70%" alt="Critic agent enforcing an allergy constraint" />

### Voice-activated hands-free mode (accessibility-first)

Built-in microphone support lets users with mobility or visual impairments navigate, search, and shop entirely through natural conversation.

<img src="frontend/public/snippets/hands-free-mode.png" width="70%" alt="Hands-free voice mode" />

### Visual photo search

Users can upload a photo to find matching products directly in the catalog.

<img src="frontend/public/snippets/photo-search.png" width="70%" alt="Visual photo search returning matched products" />

### Smart cart and checkout sync

Full multi-item cart management with a seamless handoff to the Kapruka checkout.

<p align="center">
  <img src="frontend/public/snippets/cart-management.png" width="49%" alt="Cart management panel" />
  <img src="frontend/public/snippets/checkout-kapruka.png" width="49%" alt="Handoff to Kapruka checkout" />
</p>

### Contextual agentic workflows

Collaborative group gifting links, AI-generated greeting cards, side-by-side item comparisons, and strict allergy filtering, all handled conversationally.

<p align="center">
  <img src="frontend/public/snippets/share-group-link.png" width="32%" alt="Shareable group gift link" />
  <img src="frontend/public/snippets/write-sweet-card.png" width="32%" alt="AI-generated greeting card" />
  <img src="frontend/public/snippets/compare-items.png" width="32%" alt="Side-by-side item comparison" />
</p>

## Tech Stack

- **Frontend:** Next.js, React, Tailwind CSS, Framer Motion
- **Backend:** Python, FastAPI, Server-Sent Events streaming, multi-agent orchestration
- **Database:** PostgreSQL (recipient profiles, cart persistence, auth), with a zero-config SQLite fallback for local development
- **AI:** Google Gemini via Vertex AI, with a Qdrant Cloud vector catalog for semantic product search
- **Auth:** Clerk (optional; the app runs in guest-only mode without it)

## Project Layout

This repository has two main parts:

1. **`backend/`**: A FastAPI service running a multi-agent system (Router, Catalog/Shopper Agent, Logistics Agent, Critic Agent) over a Qdrant Cloud vector catalog, with SSE streaming and MCP integrations for checkout.
2. **`frontend/`**: A Next.js web application with a real-time streaming chat interface, product carousels, cart management, and a dark/light responsive theme.

```
Kapruka-Chatbot/
├── backend/                  # FastAPI + agents + RAG pipeline
│   ├── agents/                # Router, Catalog, Logistics, Critic
│   ├── cli/                   # Crawl / ingest / status CLI tools
│   ├── infrastructure/        # Gemini/Vertex client, Qdrant store, Postgres, Clerk auth
│   ├── memory/                # Short-term, long-term (Qdrant), and semantic (JSON) memory
│   ├── main.py                # FastAPI entry point
│   └── config.yaml            # Tunable agent and model parameters
│
└── frontend/                  # Next.js web application
    ├── app/                    # Main entry point and routes
    ├── components/             # Chat UI, cart, checkout, product carousel, etc.
    └── public/                 # Static assets, including the feature snippets above
```

## Quick Start

To run the complete system locally, start the backend and the frontend separately.

### 1. Backend

Prerequisites: Python 3.10 or higher, a Qdrant Cloud cluster, and either a Gemini API key or Vertex AI access.

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
source venv/bin/activate     # macOS/Linux

pip install -r requirements.txt
playwright install chromium
```

Create a `.env` file inside `backend/`:

```env
GEMINI_API_KEY=your_gemini_api_key
QDRANT_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your_qdrant_api_key

# Optional: PostgreSQL for persistent carts/profiles (falls back to local SQLite otherwise)
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/ruki

# Optional: Clerk auth (guest-only mode without it)
CLERK_ISSUER=
CLERK_JWKS_URL=
```

To build the product catalog before running the app:

```bash
python cli/pipeline.py run
```

Then start the server:

```bash
python main.py
```

The API runs at `http://localhost:8000` (docs at `/docs`). Note that the Docker image (see `deploy/docker-compose.yml`) serves on port 8080 instead.

### 2. Frontend

```bash
cd frontend
npm install
```

The client only calls same-origin `/api/...` paths, which Next.js rewrites server-side to the backend. Point it at your local backend by creating `.env.local`:

```env
BACKEND_ORIGIN=http://localhost:8000
```

Then start the dev server:

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

### 3. Full stack via Docker

For a single-command production-like setup (PostgreSQL, backend, and frontend together), see `deploy/docker-compose.yml`.
