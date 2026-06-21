# Kapruka Ruki AI Chatbot — Frontend

A next-generation, responsive React/Next.js dashboard built as a premium conversational shopping assistant for [Kapruka](https://www.kapruka.com), Sri Lanka's leading gifting platform.

## ✨ Features

- **Fluid Transitions**: Powered by `framer-motion` for a smooth, high-fidelity experience.
- **Brand Consistency**: Styled using Kapruka's signature brand colors (Deep Purple `#441B71` and Accent Amber Gold `#FFD700`) with custom dark/light theme support.
- **SSE Streaming Integration**: Asynchronously reads SSE response packages from the FastAPI backend, updating text tokens and component states in real-time.
- **Product Carousel Component**: Displays rich product listings from semantic search results, supporting full product descriptions, image loading, matching scores, and direct "Add to Cart" functionality.
- **Cart & Order System**: Interactive cart management panel with total calculations (including delivery fees checked from live MCP endpoint), plus a dynamic modal sequence to trigger order links using live MCP tools.

---

## 🛠️ Getting Started

### 1. Install Dependencies
Ensure you have Node.js installed, then run:
```bash
npm install
```

### 2. Configure Environment Variables
By default, the client points to the backend server at `http://localhost:8000`. You can configure this by creating a `.env.local` file:
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

### 3. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the app.

---

## 📁 Key File Structure

- **`app/page.tsx`**: Main entrypoint containing the chat loop, session states, and message renderer.
- **`components/ChatInputCapsule.tsx`**: Modular input container with quick-options, typing indicators, and message submission controls.
- **`components/OrderModals.tsx`**: Multi-step checkout dialog capturing recipient info, address, phone number, and executing order link creation.
- **`components/WorkspaceHeader.tsx`**: Top navigation header providing brand layout, session resetting, and the Light/Dark theme toggle.
