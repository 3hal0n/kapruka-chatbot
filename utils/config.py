from pathlib import Path
import yaml

_CONFIG_PATH = Path(__file__).resolve().parents[1] / "config.yaml"

with open(_CONFIG_PATH, "r") as f:
    _cfg = yaml.safe_load(f)

# Claude
# Claude
CLAUDE_MODEL: str = _cfg["claude"]["model"]
CLAUDE_MODEL_CLASSIFY: str = _cfg["claude"]["model_intent_classify"]
CLAUDE_MODEL_LOGISTICS: str = _cfg["claude"]["model_logistics"]
CLAUDE_MAX_TOKENS_CLASSIFY: int = _cfg["claude"]["max_tokens_classify"]
CLAUDE_MAX_TOKENS_RESPOND: int  = _cfg["claude"]["max_tokens_respond"]
CLAUDE_MAX_TOKENS_CRITIQUE: int = _cfg["claude"]["max_tokens_critique"]
CLAUDE_MAX_TOKENS_LOGISTIC: int = _cfg["claude"]["max_tokens_logistics"]


# Catalog agent
MAX_REFLECTION_ROUNDS: int = _cfg["catalog_agent"]["max_reflection_rounds"]
CATALOG_SEARCH_TOP_K: int = _cfg["catalog_agent"]["search_top_k"]
CATALOG_MAX_PRODUCTS: int = _cfg["catalog_agent"]["max_products_after_filter"]

# Short-term memory
ST_MEMORY_MAX_TURNS: int = _cfg["short_term_memory"]["max_turns"]

# Long-term memory
LT_EMBEDDING_MODEL: str = _cfg["lt_memory"]["embedding_model"]
LT_SEARCH_TOP_K: int = _cfg["lt_memory"]["search_top_k"]

# Qdrant
QDRANT_COLLECTION_NAME: str = _cfg["qdrant"]["collection_name"]
QDRANT_EMBEDDING_DIM: int = _cfg["qdrant"]["embedding_dim"]
QDRANT_TIMEOUT: int = _cfg["qdrant"]["timeout"]

# Ingest
CATALOG_PATH: str = _cfg["ingest"]["catalog_path"]
INGEST_EMBEDDING_MODEL: str = _cfg["ingest"]["embedding_model"]
INGEST_BATCH_SIZE: int = _cfg["ingest"]["batch_size"]
