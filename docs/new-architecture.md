# 🚀 Ruki AI: Next-Gen Agentic Commerce Platform

## Technical Architecture & Implementation Blueprint

This specification document outlines the transformation of **Ruki AI** from a standard transactional search bot into an empathetic, highly personalized, and fully accessible multi-agent commerce ecosystem built for the everyday Sri Lankan shopper on **Kapruka**.

---

## 🏗️ Part 1: System Architecture Overview

To accommodate multi-agent coordination, contextual user profile tracking, image search, and multimodal accessibility streams, the system is designed with a decentralized, zero-trust cloud configuration.

### System Topology Map

```
                                  +-----------------------+
                                  |   Next.js Frontend    |
                                  | (Web Speech / STT/TTS)|
                                  +-----------+-----------+
                                              | (WebSocket / TLS)
                                              v
                                  +-----------------------+
                                  |    FastAPI Gateway    |
                                  | (JWT Auth / Middleware|
                                  +-----------+-----------+
                                              |
                     +------------------------+------------------------+
                     |                        |                        |
                     v                        v                        v
         +-----------------------++-----------------------++-----------------------+
         |  Orchestrator Router  ||  PostgreSQL Database ||    Vertex AI Pool     |
         | (Intent Distribution) || (Users/Vectors/Carts)|| (Gemini 2.5/Imagen) |
         +-----------+-----------++-----------------------++-----------------------+
                     |
         +-----------+------------------------+
         |                                    |
         v                                    v
+-----------------------+            +-----------------------+
|   Sub-Agent Worker    |            |   Sub-Agent Worker    |
| (Shopper / Logistics) |            |  (Concierge / Profiler|
+-----------------------+            +-----------------------+

```

---

Part 2: Core Platform Enhancements (Refactored for Clerk)
1. User Authentication Architecture
To unlock deep personalization, context logging, and multi-item cart tracking across active user sessions, the platform utilizes Clerk Auth for frontend session abstraction and user state management. This eliminates the need for local password hashing or custom token-issuance mechanics.

Technology Stack: Clerk Next.js SDK (Frontend Auth & Social Google OAuth) + FastAPI JWT Middleware (PyJWT).

Database Target Schema:
The local database drops the security credential columns entirely, tracking only the immutable clerk_id passed via frontend bearer tokens to link users to their AI profile charts.

SQL
CREATE TABLE user_profiles (
    clerk_id VARCHAR(255) PRIMARY KEY, -- Primary key derived directly from Clerk auth token (e.g., 'user_2N...')
    accumulated_context JSONB DEFAULT '{}'::jsonb, -- Stores relationships, lifestyle habits, preferences
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_id VARCHAR(255) REFERENCES user_profiles(clerk_id) ON DELETE CASCADE,
    items JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 🧠 2. Moving to Portfolio-Grade Vertex AI

Transitioning authentication from standard AI Studio keys to **Vertex AI Application Default Credentials (ADC)** leverages secure IAM service accounts on the Google Cloud Compute instance.

```python
import os
from google import genai
from google.genai import types

def get_vertex_client():
    """Initializes a zero-trust production client leveraging VM metadata credentials."""
    return genai.Client(
        vertexai=True,
        project=os.environ.get("GCP_PROJECT_ID", "kapruka-chatbot"),
        location=os.environ.get("GCP_LOCATION", "us-central1")
    )

```

---

## 🗣️ Part 3: Accessibility Mode (Hands-Free / Low Vision)

To guarantee full utility for users with optical impairments, motor coordination challenges, or those who prefer complete vocal interaction, the interface shifts into a dedicated Voice Assistant Mode (modeled after the interactions shown in **image_da5149.jpg**).

### 🛠️ Frontend Interaction Lifecycle

* **Low-Vision UI Rendering:** Employs ultra-high contrast dark palettes, expanded tap bounds ($>64\text{px}$ padding elements), screen-reader friendly semantic layout components, and an expanded canvas displaying voice frequency feedback animations (**image_da5149.jpg**).
* **Hands-Free Engine:** Combines the browser’s native `Web Speech API` (`SpeechRecognition` for input capturing) with server-side response chunking routed directly through high-fidelity Google Cloud Text-to-Speech API parameters.

### 🛡️ Core Frontend Implementation Script (`AccessibilityLayer.tsx`)

```tsx
import React, { useState, useEffect } from 'react';

export const AccessibilityVoiceController: React.FC = () => {
  const [isListening, setIsListening] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>("");

  let recognition: any = null;
  if (typeof window !== 'undefined' && ('WebKitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    const SpeechConstructor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    recognition = new SpeechConstructor();
    recognition.continuous = false;
    recognition.lang = 'en-US'; // Can adapt to localized parameters dynamically
  }

  const toggleVoiceMode = () => {
    if (!recognition) return alert("Speech interface un-supported on this browser framework.");
    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      setIsListening(true);
      recognition.start();
    }
  };

  if (recognition) {
    recognition.onresult = (event: any) => {
      const currentResult = event.results[0][0].transcript;
      setTranscript(currentResult);
      setIsListening(false);
      // Automatically route to backend multi-agent loop gateway
      submitToAgentGateway(currentResult);
    };
  }

  return (
    <div className="voice-container p-6 bg-slate-950 text-white rounded-xl border border-purple-500/30">
      <h2 className="text-2xl font-bold mb-4">Voice Assistant Core Activation</h2>
      <button 
        onClick={toggleVoiceMode} 
        className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isListening ? 'bg-red-600 animate-pulse' : 'bg-purple-600 hover:bg-purple-700'}`}
        aria-label={isListening ? "Stop listening voice control" : "Activate voice navigation engine"}
      >
        🎤
      </button>
      {isListening && <p className="mt-4 text-purple-400">Ruki AI is listening...</p>}
      {transcript && <p className="mt-2 text-gray-300 font-mono text-sm">Captured: "{transcript}"</p>}
    </div>
  );
};

async function submitToAgentGateway(text: string) {
  await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text })
  });
}

```

---

## 🖼️ Part 4: Multimodal Computer Vision Search Engine

When users capture or upload an image asset (**image_da550d.png**), the system converts the pixel data stream into high-dimension semantic categories. It matches fashion design, textures, or household appliances against Kapruka's inventory catalog.

### 🛠️ Python Vector Match Algorithm

```python
import base64
from google.genai import types

async def execute_multimodal_vision_search(image_bytes: bytes, client, db_session) -> list:
    """
    Parses visual characteristics via Vertex AI Gemini and runs an expanded matching sweep.
    """
    # Convert image content for multimodal consumption
    image_part = types.Part.from_bytes(
        data=image_bytes,
        mime_type="image/jpeg"
    )
    
    analysis_prompt = (
        "Analyze this user product photo. Extract core e-commerce descriptive features: "
        "Product Category, Dominant Material/Texture, Explicit Colors, Pattern details, and Styling. "
        "Output ONLY a clean search keyword string combining the primary characteristics for catalog matching."
    )
    
    # Process visual context utilizing Gemini Multimodal Capabilities
    ai_response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=[image_part, analysis_prompt]
    )
    
    refined_query_string = ai_response.text.strip()
    print(f"Refined Visual Query Target: {refined_query_string}")
    
    # Fallback to catalog semantic query vector extraction routine
    matched_products = await run_enriched_catalog_query(refined_query_string, db_session)
    return matched_products

async def run_enriched_catalog_query(query: str, session):
    # Executes database search matching extracted visual features
    # (Maps seamlessly to Kapruka's product indices)
    return [{"title": "Similar Item Match", "price": 4200.0, "sku": "ECOM-VIS-01"}]

```

---

## 🤖 Part 5: The Multi-Agent Worker Infrastructure

The ecosystem splits operational responsibilities across distinct sub-agents managed by an **Orchestration Router**.

### 1. Persistent Context Profile Agent (The Memory Log)

Tracks implicit user variables across active conversations (e.g., relationships, recurring milestones, historical interest shifts) to construct an ongoing context graph.

```python
PROFILE_ENGINE_PROMPT = """
ROLE: Persistent Context Extraction Ledger Agent
MISSION: Track and update long-term implicit traits of the user based on historical conversation snapshots.

CORE CONTEXT CATEGORIES TO TRACK:
- Relationships (e.g., "Has a girlfriend", "Sister getting married")
- Lifestyle Needs & Roles (e.g., "Software developer", "Prefers high-volume upper body workout metrics")
- Shopping Bias (e.g., "Buys electronic accessories directly", "Checks grocery essentials regularly")

OPERATIONAL PROTOCOL:
- Compare the incoming user statement against the historical profile file.
- Update fields cleanly inside the updated profile state database block.
- DO NOT hallucinate records or mention this profile layer directly in standard conversation.

CURRENT ACCUMULATED PROFILE:
{historical_profile_json}
"""

```

### 2. General Store Shopper Agent (Everyday Needs)

Optimized to handle self-consumption shopping vectors across Electronics, Groceries, Home Essentials, and Apparel, while avoiding generic gifting box restrictions.

```python
SHOPPER_AGENT_PROMPT = """
ROLE: General Store Shopper Agent
CONTEXT: You are the primary shopping worker for Kapruka AI. Kapruka is NOT just a gift shop—it carries an extensive collection of consumer goods including Electronics, Groceries, Personal Care, and Fashion. Most users shop for themselves, not for gifts.

MISSION: Convert consumer intent phrases into structured item search queries.

OPERATIONAL RULES:
1. If the user mentions hardware components, home appliances, or computing accessories (e.g., "PS5 Pro", "headphones"), prioritize exact matches from the Electronic Categories index instead of standard gift hampers.
2. Enrich abstract expressions into explicit keywords (e.g., "I need stuff for dinner" -> Query: "Basmati rice ingredients spices chicken").
3. Ensure search limits are parsed cleanly into numerical filtering ranges before querying product repositories.
"""

```

### 3. Fulfillment & Logistics Agent (Parcel Intelligence)

Manages location sanitization, city matching schemas, shipping timelines, customs clearance notifications, and updates live location progress indicators (**image_da546e.png**, **image_da5c54.png**).

```python
LOGISTICS_AGENT_PROMPT = """
ROLE: Logistics & Fulfillment Tracker Agent
MISSION: Extract geographical destinations, match them with canonical city mappings via Kapruka lookup endpoints, and handle real-time parcel trajectory states.

OPERATIONAL PARAMETERS:
- INTERCEPT user destination questions or tracking queries.
- Clean ambiguous locations to match valid distribution centers (e.g., "Colombo" -> Validate with city endpoints).
- Format parcel tracking status, handling variables like 'Arriving dates', 'Provider details', and state notes (e.g., "Waiting for customs clearance").
- Present data using clean Markdown layout specs for visual progress bars.
"""

```

### 🔀 4. Central Orchestrator Router Implementation

```python
import json
from fastapi import APIRouter, Depends
from pydantic import BaseModel

router = APIRouter()

class ChatPayload(BaseModel):
    user_id: str
    message: str

@router.post("/api/chat")
async def process_orchestrator_turn(payload: ChatPayload):
    client = get_vertex_client()
    
    # 1. Fetch historical memory contexts
    user_profile = await get_profile_context_from_db(payload.user_id)
    
    # 2. Update memory vectors based on latest conversational turns
    updated_profile = await run_profile_agent_turn(payload.message, user_profile, client)
    await save_profile_to_db(payload.user_id, updated_profile)
    
    # 3. Process primary intent classification logic
    routing_prompt = f"""
    Analyze the customer request and route it to the appropriate sub-agent system.
    Available Routes:
    - 'SHOPPER': To search groceries, consumer items, household necessities, or hardware.
    - 'LOGISTICS': To verify order tracking codes, delivery deadlines, or parcel states.
    
    User Attributes Profile: {json.dumps(updated_profile)}
    User Chat Message: "{payload.message}"
    
    Return a single JSON block containing: {{"target_agent": "SHOPPER" | "LOGISTICS", "enriched_query": "string"}}
    """
    
    routing_output = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=routing_prompt
    )
    
    decision = json.loads(routing_output.text.strip())
    
    # 4. Delegate to specialized worker agents
    if decision["target_agent"] == "LOGISTICS":
        response = await execute_logistics_worker(decision["enriched_query"], updated_profile, client)
    else:
        response = await execute_shopper_worker(decision["enriched_query"], updated_profile, client)
        
    return {"reply": response, "context_state": updated_profile}

```

---

## 📈 Part 6: Phased Implementation & Validation Plan

| Development Phase | Key Milestones | Verification Routine | Target Target Timeline |
| --- | --- | --- | --- |
| **Phase 1: Zero-Trust Migration** | Shift to Vertex AI ADC; strip credentials from Compose scripts | Validate locally via terminal: `gcloud auth application-default print-access-token` | Day 1 |
| **Phase 2: Agent Routing** | Deploy Orchestrator, Shopper, Logistics, and Profile engines | Mock user conversations; verify extraction updates update PostgreSQL JSONB tables | Day 2 |
| **Phase 3: Accessibility Implementation** | Integrate Web Speech layers and high-contrast styling frames | Run testing scripts without a keyboard; verify vocal pipeline streams text inputs smoothly | Day 3 |
| **Phase 4: Multimodal Testing** | Deploy image upload handling blocks and semantic catalog loops | Upload a product snapshot sample; verify it responds with valid matching database array entries | Day 4 |

Run this build verification loop directly inside your GCP server workspace terminal directory to apply the configuration layers cleanly:

```bash
cd ~/kapruka-chatbot/deploy
# Pull the updated multi-agent model logic from main
git pull origin main
# Recompile and spin up the complete container architecture
sudo docker compose up -d --build --force-recreate

```