# Kapruka Ruki AI Chatbot (Gift Concierge)

Welcome to **Kapruka Ruki**, an AI-powered conversational gifting concierge for [Kapruka](https://www.kapruka.com), Sri Lanka's leading e-commerce platform.

This project consists of two main parts:
1. **`backend/`**: A live FastAPI backend featuring a multi-agent system (Router, Catalog Search Agent, Logistics Agent, and Critic Agent) connected to a Qdrant Cloud vector catalog, supporting Server-Sent Events (SSE) streaming and live Model Context Protocol (MCP) integrations.
2. **`frontend/`**: A next-generation, high-fidelity Next.js web application built with React, Tailwind CSS, and Framer Motion, presenting a dark/light responsive shop concierge interface with real-time streaming, interactive carousels, dynamic order creation links, and cart state management.

---

## 🚀 Quick Start Guide

To run the complete system locally, follow the steps below to start both the backend and frontend services.

### 1. Backend Setup & Run

#### Prerequisites:
- Python 3.10 or higher
- Qdrant Cloud cluster and credentials
- OpenRouter API key

#### Setup Steps:
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Install Playwright browser dependencies (for catalog scraping):
   ```bash
   playwright install chromium
   ```
5. Configure your environment variables:
   Create a `.env` file inside the `backend` directory:
   ```env
   OPENROUTER_API_KEY=your_openrouter_api_key
   QDRANT_URL=https://your-cluster.qdrant.io
   QDRANT_API_KEY=your_qdrant_api_key
   ```

#### Ingestion & Database Preparation (Optional):
To crawl the latest product catalog from Kapruka and index it in the Qdrant database, run:
```bash
python cli/pipeline.py run
# Or use the Makefile:
make run
```

#### Run the FastAPI Server:
Start the backend API gateway:
```bash
python main.py
```
This launches the FastAPI application on **`http://localhost:8000`** with auto-reload enabled.
- API Documentation is available at: `http://localhost:8000/docs`
- Health check endpoint: `http://localhost:8000/health`

---

### 2. Frontend Setup & Run

#### Prerequisites:
- Node.js (v18+ recommended)
- npm, yarn, or pnpm

#### Setup & Start Steps:
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install npm dependencies:
   ```bash
   npm install
   ```
3. Configure Backend Endpoint (Optional):
   The client only calls same-origin `/api/...` paths; Next.js rewrites them
   server-side to `BACKEND_ORIGIN` (default `http://localhost:8080`). If your
   backend runs elsewhere, create a `.env.local` file inside the `frontend` directory:
   ```env
   BACKEND_ORIGIN=http://localhost:8080
   ```
4. Start the Next.js development server:
   ```bash
   npm run dev
   ```
5. Open your browser and navigate to:
   👉 **`http://localhost:3000`**

---

## 📁 Repository Structure

```
Kapruka-Chatbot/
├── backend/                  # FastAPI + Agents + RAG pipeline
│   ├── agents/               # Multi-agent orchestrators (Router, Catalog, Logistics, Critic)
│   ├── cli/                  # CLI tools for crawl, status, and ingestion pipelines
│   ├── infrastructure/       # OpenRouter LLM client & Qdrant database configuration
│   ├── memory/               # 3-tier memory (Short-term, Long-term Qdrant, Semantic JSON)
│   ├── main.py               # FastAPI Server entry point (starts server on port 8000)
│   ├── app.py                # Legacy/Alternative Streamlit Chat UI
│   └── config.yaml           # Tunable agent & model parameters
│
└── frontend/                 # Next.js web application
    ├── app/                  # Main page entry points and routes
    ├── components/           # Reusable UI components (ChatInput, OrderModals, ProductCarousel, etc.)
    └── public/               # Static assets & icons
```

Refer to the respective `backend/README.md` and `frontend/README.md` files for deeper architecture and development details.
