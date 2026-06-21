"""
app.py — Kapruka Gift Concierge · Streamlit UI  (Luxury Edition)
Run with: streamlit run app.py
"""

import json
import time
import streamlit as st
from agents.router import Router
from memory.semantic_memory import SemanticMemory

# ── Warmup ────────────────────────────────────────────────────────────────────
@st.cache_resource
def _warmup():
    from infrastructure.db.qdrant_store import get_client
    from memory.lt_memory import encoder
    get_client()
    encoder.encode("warmup", show_progress_bar=False)

_warmup()

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Kapruka Gift Concierge",
    page_icon="",
    layout="wide",
)

# ── Luxury Styling ─────────────────────────────────────────────────────────────
st.markdown("""
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@300;400&display=swap');

  /* ── CSS Variables ── */
  :root {
    --bg-base:       #090c14;
    --bg-surface:    #0e1220;
    --bg-raised:     #141826;
    --bg-glass:      rgba(20, 24, 38, 0.6);
    --border-subtle: rgba(212, 175, 100, 0.12);
    --border-mid:    rgba(212, 175, 100, 0.25);
    --gold:          #d4af64;
    --gold-light:    #e8cc8a;
    --gold-dim:      rgba(212, 175, 100, 0.15);
    --text-primary:  #eef0f8;
    --text-secondary:#8892b0;
    --text-muted:    #4a5568;
    --accent-teal:   #64d4c8;
    --accent-rose:   #e88a8a;
    --accent-amber:  #f0a840;
    --radius-sm:     8px;
    --radius-md:     14px;
    --radius-lg:     20px;
    --shadow-gold:   0 0 30px rgba(212, 175, 100, 0.08);
    --shadow-card:   0 4px 24px rgba(0,0,0,0.4);
  }

  /* ── Global Reset ── */
  html, body, .stApp {
    background-color: var(--bg-base) !important;
    font-family: 'DM Sans', sans-serif;
    color: var(--text-primary);
  }

  /* Grain texture overlay */
  .stApp::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
    pointer-events: none;
    z-index: 0;
    opacity: 0.6;
  }

  /* ── Sidebar ── */
  [data-testid="stSidebar"] {
    background: linear-gradient(180deg, #0b0e1a 0%, #0e1220 100%) !important;
    border-right: 1px solid var(--border-subtle) !important;
  }
  [data-testid="stSidebar"]::after {
    content: '';
    position: absolute;
    top: 0; right: 0;
    width: 1px; height: 100%;
    background: linear-gradient(180deg, transparent, var(--gold), transparent);
    opacity: 0.3;
  }
  [data-testid="stSidebarContent"] {
    padding-top: 2rem !important;
  }

  /* Sidebar logo area */
  .sidebar-brand {
    text-align: center;
    padding: 0.5rem 0 1.5rem;
    border-bottom: 1px solid var(--border-subtle);
    margin-bottom: 1.5rem;
  }
  .sidebar-brand .brand-icon {
    font-size: 2.4rem;
    display: block;
    animation: float 4s ease-in-out infinite;
  }
  .sidebar-brand .brand-name {
    font-family: 'Cormorant Garamond', serif;
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--gold-light);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    display: block;
    margin-top: 0.3rem;
  }
  .sidebar-brand .brand-sub {
    font-size: 0.7rem;
    color: var(--text-muted);
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }

  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50%       { transform: translateY(-5px); }
  }

  /* Sidebar labels */
  [data-testid="stSidebar"] label,
  [data-testid="stSidebar"] .stMarkdown p {
    font-size: 0.78rem !important;
    color: var(--text-muted) !important;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  /* Input fields */
  [data-testid="stTextInput"] input,
  [data-testid="stChatInput"] textarea {
    background: var(--bg-raised) !important;
    color: var(--text-primary) !important;
    border: 1px solid var(--border-subtle) !important;
    border-radius: var(--radius-md) !important;
    font-family: 'DM Sans', sans-serif !important;
    font-size: 0.9rem !important;
    transition: border-color 0.25s, box-shadow 0.25s !important;
  }
  [data-testid="stTextInput"] input:focus,
  [data-testid="stChatInput"] textarea:focus {
    border-color: var(--border-mid) !important;
    box-shadow: 0 0 0 3px rgba(212, 175, 100, 0.08) !important;
    outline: none !important;
  }

  /* Chat input container */
  [data-testid="stChatInput"] {
    background: transparent !important;
  }
  [data-testid="stBottom"] {
    background: linear-gradient(0deg, var(--bg-base) 70%, transparent) !important;
    padding-bottom: 1rem !important;
  }

  /* Buttons */
  .stButton > button {
    background: transparent !important;
    border: 1px solid var(--border-mid) !important;
    color: var(--text-secondary) !important;
    border-radius: var(--radius-sm) !important;
    font-family: 'DM Sans', sans-serif !important;
    font-size: 0.78rem !important;
    letter-spacing: 0.06em !important;
    text-transform: uppercase !important;
    transition: all 0.2s !important;
    padding: 0.4rem 0.8rem !important;
  }
  .stButton > button:hover {
    background: var(--gold-dim) !important;
    border-color: var(--gold) !important;
    color: var(--gold-light) !important;
    box-shadow: 0 0 16px rgba(212, 175, 100, 0.1) !important;
  }
  /* Primary button */
  .stButton > button[kind="primary"] {
    background: linear-gradient(135deg, #b8922a, #d4af64) !important;
    border: none !important;
    color: #0a0c14 !important;
    font-weight: 600 !important;
  }
  .stButton > button[kind="primary"]:hover {
    background: linear-gradient(135deg, #d4af64, #e8cc8a) !important;
    box-shadow: 0 4px 20px rgba(212, 175, 100, 0.3) !important;
    transform: translateY(-1px) !important;
  }

  /* ── Chat Messages ── */
  [data-testid="stChatMessage"] {
    background: transparent !important;
    border: none !important;
    padding: 0.3rem 0 !important;
    animation: msgIn 0.3s ease both;
  }
  @keyframes msgIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* User message bubble */
  [data-testid="stChatMessage"]:has([data-testid="stChatMessageAvatarUser"]) [data-testid="stChatMessageContent"] {
    background: linear-gradient(135deg, #1a2035, #1e2845) !important;
    border: 1px solid rgba(100, 149, 237, 0.15) !important;
    border-radius: 18px 18px 4px 18px !important;
    padding: 0.9rem 1.2rem !important;
    box-shadow: var(--shadow-card) !important;
  }

  /* Assistant message bubble */
  [data-testid="stChatMessage"]:has([data-testid="stChatMessageAvatarAssistant"]) [data-testid="stChatMessageContent"] {
    background: linear-gradient(135deg, #111520, #161d30) !important;
    border: 1px solid var(--border-subtle) !important;
    border-left: 2px solid var(--gold) !important;
    border-radius: 4px 18px 18px 18px !important;
    padding: 1rem 1.3rem !important;
    box-shadow: var(--shadow-gold), var(--shadow-card) !important;
  }

  /* Avatar styling */
  [data-testid="stChatMessageAvatarUser"],
  [data-testid="stChatMessageAvatarAssistant"] {
    border-radius: 50% !important;
    border: 1px solid var(--border-mid) !important;
    background: var(--bg-raised) !important;
  }

  /* ── Markdown inside chat ── */
  [data-testid="stChatMessageContent"] p {
    font-size: 0.92rem;
    line-height: 1.7;
    color: var(--text-primary);
  }
  [data-testid="stChatMessageContent"] strong {
    color: var(--gold-light);
    font-weight: 500;
  }
  [data-testid="stChatMessageContent"] ul, 
  [data-testid="stChatMessageContent"] ol {
    padding-left: 1.2rem;
  }
  [data-testid="stChatMessageContent"] li {
    margin-bottom: 0.3rem;
    font-size: 0.9rem;
    color: var(--text-secondary);
  }
  [data-testid="stChatMessageContent"] code {
    background: rgba(212, 175, 100, 0.08);
    color: var(--gold-light);
    border-radius: 4px;
    padding: 0.1em 0.4em;
    font-family: 'DM Mono', monospace;
    font-size: 0.82rem;
  }

  /* ── Header ── */
  .concierge-header {
    text-align: center;
    padding: 2.5rem 0 1rem;
    position: relative;
  }
  .concierge-header::before {
    content: '';
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 320px; height: 120px;
    background: radial-gradient(ellipse, rgba(212, 175, 100, 0.08) 0%, transparent 70%);
    pointer-events: none;
  }
  .concierge-header .header-eyebrow {
    font-size: 0.68rem;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: var(--gold);
    font-family: 'DM Mono', monospace;
    margin-bottom: 0.5rem;
    display: block;
  }
  .concierge-header h1 {
    font-family: 'Cormorant Garamond', serif;
    font-size: 2.8rem;
    font-weight: 300;
    color: var(--text-primary);
    margin: 0;
    line-height: 1.1;
    letter-spacing: -0.01em;
  }
  .concierge-header h1 em {
    font-style: italic;
    color: var(--gold-light);
  }
  .concierge-header p {
    color: var(--text-muted);
    font-size: 0.82rem;
    margin: 0.5rem 0 0;
    letter-spacing: 0.08em;
  }
  .header-divider {
    width: 60px;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--gold), transparent);
    margin: 1rem auto;
  }

  /* ── Info / Debug Cards ── */
  .info-card {
    background: var(--bg-glass);
    backdrop-filter: blur(8px);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 12px 16px;
    margin-bottom: 8px;
    font-size: 0.82rem;
    color: var(--text-secondary);
    font-family: 'DM Mono', monospace;
  }
  .info-card strong { color: var(--gold); }
  .info-card div { margin-bottom: 4px; }

  /* ── Badges ── */
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 0.7rem;
    font-weight: 500;
    margin: 2px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-family: 'DM Mono', monospace;
  }
  .badge::before { font-size: 0.65rem; }
  .badge-search    { background: rgba(100, 180, 255, 0.08); color: #64b5f6; border: 1px solid rgba(100, 180, 255, 0.2); }
  .badge-search::before { content: '◈'; }
  .badge-pref      { background: rgba(100, 212, 200, 0.08); color: var(--accent-teal); border: 1px solid rgba(100, 212, 200, 0.2); }
  .badge-pref::before { content: '◉'; }
  .badge-logistics { background: rgba(240, 168, 64, 0.08); color: var(--accent-amber); border: 1px solid rgba(240, 168, 64, 0.2); }
  .badge-logistics::before { content: '◎'; }

  /* ── Latency chip ── */
  .latency-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.68rem;
    color: var(--text-muted);
    margin-top: 6px;
    font-family: 'DM Mono', monospace;
    letter-spacing: 0.04em;
  }


  /* ── Profile cards ── */
  .profile-card {
    background: var(--bg-glass);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 10px 14px;
    margin-bottom: 8px;
    transition: border-color 0.2s;
  }
  .profile-card:hover { border-color: var(--border-mid); }
  .profile-card .profile-name {
    font-family: 'Cormorant Garamond', serif;
    font-size: 1rem;
    color: var(--gold-light);
    font-weight: 600;
    margin-bottom: 4px;
  }
  .profile-tag {
    display: inline-block;
    font-size: 0.68rem;
    font-family: 'DM Mono', monospace;
    color: var(--text-muted);
    background: var(--bg-raised);
    border-radius: 4px;
    padding: 1px 6px;
    margin: 1px;
    border: 1px solid var(--border-subtle);
  }
  .profile-tag.allergy { color: var(--accent-rose); border-color: rgba(232, 138, 138, 0.2); }
  .profile-tag.pref    { color: var(--accent-teal); border-color: rgba(100, 212, 200, 0.2); }
  .profile-tag.loc     { color: var(--gold); border-color: rgba(212, 175, 100, 0.2); }

  /* ── Welcome screen ── */
  .welcome-card {
    background: linear-gradient(135deg, #0e1220, #111825);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: 2.5rem 2rem;
    text-align: center;
    max-width: 480px;
    margin: 3rem auto;
    box-shadow: var(--shadow-gold);
  }
  .welcome-card .wc-icon { font-size: 3rem; display: block; margin-bottom: 1rem; }
  .welcome-card h3 {
    font-family: 'Cormorant Garamond', serif;
    font-size: 1.5rem;
    font-weight: 400;
    color: var(--text-primary);
    margin-bottom: 0.5rem;
  }
  .welcome-card p {
    color: var(--text-muted);
    font-size: 0.83rem;
    line-height: 1.6;
  }

  /* ── Hide Streamlit chrome ── */
  #MainMenu, footer, [data-testid="stToolbar"],
  [data-testid="stDecoration"] { display: none !important; }

  /* ── Dividers ── */
  hr {
    border: none !important;
    border-top: 1px solid var(--border-subtle) !important;
    margin: 1rem 0 !important;
  }

  /* Expander */
  [data-testid="stExpander"] {
    background: var(--bg-glass) !important;
    border: 1px solid var(--border-subtle) !important;
    border-radius: var(--radius-md) !important;
  }
  [data-testid="stExpander"] summary {
    font-size: 0.83rem !important;
    color: var(--text-secondary) !important;
  }

  /* Caption */
  .stCaption { color: var(--text-muted) !important; font-size: 0.75rem !important; }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border-subtle); border-radius: 2px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--border-mid); }

  /* Info box */
  [data-testid="stAlert"] {
    background: var(--bg-raised) !important;
    border: 1px solid var(--border-subtle) !important;
    border-radius: var(--radius-md) !important;
    color: var(--text-secondary) !important;
  }
</style>
""", unsafe_allow_html=True)


# ── Session state ─────────────────────────────────────────────────────────────
def _init_state():
    if "customer_id" not in st.session_state:
        st.session_state.customer_id = None
    if "router" not in st.session_state:
        st.session_state.router = None
    if "messages" not in st.session_state:
        st.session_state.messages = []
    if "debug_log" not in st.session_state:
        st.session_state.debug_log = []

_init_state()


# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("""
    <div class="sidebar-brand">
      <span class="brand-icon"></span>
      <span class="brand-name">Kapruka</span>
      <span class="brand-sub">Gift Concierge</span>
    </div>
    """, unsafe_allow_html=True)

    st.markdown('<p style="font-size:0.7rem;color:#4a5568;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:6px;">Customer ID</p>', unsafe_allow_html=True)
    cid_input = st.text_input(
        "Customer ID",
        value=st.session_state.customer_id or "",
        placeholder="e.g. 001",
        label_visibility="collapsed",
    )

    col1, col2 = st.columns(2)
    with col1:
        if st.button("Start", use_container_width=True, type="primary"):
            if cid_input.strip():
                st.session_state.customer_id = cid_input.strip()
                st.session_state.router = Router(customer_id=st.session_state.customer_id)
                st.session_state.messages = []
                st.session_state.debug_log = []
                st.rerun()
    with col2:
        if st.button("Reset", use_container_width=True):
            for key in ["customer_id", "router", "messages", "debug_log"]:
                st.session_state[key] = None if key not in ("messages", "debug_log") else []
            st.rerun()

    st.markdown("---")

    # Recipient profiles
    if st.session_state.customer_id:
        st.markdown('<p style="font-size:0.7rem;color:#4a5568;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:10px;">Recipient Profiles</p>', unsafe_allow_html=True)
        sm = SemanticMemory()
        cid = st.session_state.customer_id
        customer = sm.profiles.get(cid, {})
        all_names = set()
        for key, val in customer.items():
            if isinstance(val, dict):
                all_names.update(val.keys())
        if all_names:
            for recipient in all_names:
                allergies = customer.get("allergies", {}).get(recipient, [])
                prefs     = customer.get("preferences", {}).get(recipient, [])
                loc       = customer.get("location", {}).get(recipient) 

                allergy_tags = "".join(f'<span class="profile-tag allergy">⚠ {a}</span>' for a in allergies)
                pref_tags    = "".join(f'<span class="profile-tag pref">✦ {p}</span>'    for p in prefs)
                loc_tag      = f'<span class="profile-tag loc">📍 {loc}</span>' if loc else ""

                st.markdown(f"""
                <div class="profile-card">
                  <div class="profile-name">👤 {recipient.title()}</div>
                  <div style="margin-top:5px;">{allergy_tags}{pref_tags}{loc_tag}</div>
                </div>
                """, unsafe_allow_html=True)
        else:
            st.markdown('<p style="font-size:0.78rem;color:#4a5568;font-style:italic;margin-top:6px;">No profiles saved yet.</p>', unsafe_allow_html=True)

        st.markdown("---")

    # Debug panel
    if st.session_state.debug_log:
        st.markdown('<p style="font-size:0.7rem;color:#4a5568;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:8px;">Last Classification</p>', unsafe_allow_html=True)
        last = st.session_state.debug_log[-1]

        badge_map = {
            "SEARCH":            "badge-search",
            "PREFERENCE_UPDATE": "badge-pref",
            "LOGISTICS":         "badge-logistics",
        }
        badges_html = " ".join(
            f'<span class="badge {badge_map.get(i, "badge-search")}">{i}</span>'
            for i in last.get("intents", [])
        )
        st.markdown(badges_html, unsafe_allow_html=True)

        fields = {
            "Recipient": last.get("search_recipient"),
            "Allergies": json.dumps(last.get("allergies")) if last.get("allergies") else None,
            "Location":  last.get("location"),
            "Deadline":  last.get("deadline"),
            "Tracking":  last.get("tracking_code"),
            "Query":     last.get("search_query"),
        }
        rows = "".join(
            f"<div><strong>{k}</strong> {v}</div>"
            for k, v in fields.items() if v
        )
        if rows:
            st.markdown(f'<div class="info-card">{rows}</div>', unsafe_allow_html=True)


# ── Main chat area ────────────────────────────────────────────────────────────
st.markdown("""
<div class="concierge-header">
  <span class="header-eyebrow">Sri Lanka's Premier Gift Service</span>
  <h1><em>Kapruka</em> </h1>
  <p>Powered by Kapruka · Personalised · Allergy-Safe · Island-Wide Delivery</p>
  <div class="header-divider"></div>
</div>
""", unsafe_allow_html=True)

if not st.session_state.customer_id:
    st.markdown("""
    <div class="welcome-card">
      <span class="wc-icon"></span>
      <h3>Welcome, valued guest</h3>
      <p>Enter your Customer ID in the sidebar to begin your personalised gifting experience. Your recipient preferences and allergy profiles will be remembered.</p>
    </div>
    """, unsafe_allow_html=True)
    st.stop()

# Render chat history
for msg in st.session_state.messages:
    with st.chat_message(msg["role"], avatar="🧑" if msg["role"] == "user" else "🎁"):
        st.markdown(msg["content"])
        if msg.get("latency"):
            st.markdown(
                f'<div class="latency-chip">⏱ {msg["latency"]:.2f}s</div>',
                unsafe_allow_html=True,
            )

# ── Chat input ────────────────────────────────────────────────────────────────
user_input = st.chat_input("Ask about gifts, delivery, or save a preference…")

if user_input:
    st.session_state.messages.append({"role": "user", "content": user_input})
    with st.chat_message("user", avatar="🧑"):
        st.markdown(user_input)

    with st.chat_message("assistant", avatar="🎁"):
        router = st.session_state.router
        original_classify = router.classify_intents
        captured = {}

        def _capturing_classify(message):
            result = original_classify(message)
            captured.update(result)
            return result

        router.classify_intents = _capturing_classify
        t0 = time.time()
        
        # response streaming and rolling back
        message_placeholder = st.empty()
        status_placeholder = st.empty()
        full_text = ""
        content_started = False 

        for chunk in router.route_stream(user_input):
            
            if chunk == "<<PREF_SAVING>>":
              status_placeholder.markdown("🧠 *Remembering preferences...*")
              continue
            
            if chunk == "<<CRITIC>>" : #wipes the draft from the ui
                full_text = ""
                status_placeholder.markdown("🔍 *Refining recommendation based on your profile...*")
                continue
            
            if chunk == "<<LOGISTICS>>":
                status_placeholder.markdown("🧠 *Checking delivery feasibility..*")
                continue
                
                
            
                # First real content chunk — clear the indicator
            if not content_started:         
              status_placeholder.empty()   
              content_started = True       
            full_text += chunk
            message_placeholder.markdown(full_text + "▌")

        message_placeholder.markdown(full_text)
        response = full_text


        elapsed = time.time() - t0
        router.classify_intents = original_classify

        st.markdown(
            f'<div class="latency-chip">⏱ {elapsed:.2f}s</div>',
            unsafe_allow_html=True,
        )

    st.session_state.messages.append({
        "role": "assistant",
        "content": response,
        "latency": elapsed,
    })
    if captured:
        st.session_state.debug_log.append(captured)

    st.rerun()