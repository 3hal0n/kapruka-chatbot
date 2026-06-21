import os
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams
from dotenv import load_dotenv
from utils.config import QDRANT_COLLECTION_NAME, QDRANT_EMBEDDING_DIM, QDRANT_TIMEOUT

load_dotenv()

COLLECTION_NAME = QDRANT_COLLECTION_NAME
EMBEDDING_DIM = QDRANT_EMBEDDING_DIM

_client = None

def get_client() -> QdrantClient:
    global _client
    if _client is not None:
        return _client

    url = os.getenv("QDRANT_URL")
    api_key = os.getenv("QDRANT_API_KEY")

    if not url:
        raise RuntimeError("QDRANT_URL is not set in .env")
    if not api_key:
        raise RuntimeError("QDRANT_API_KEY is not set in .env")

    _client = QdrantClient(url=url, api_key=api_key, timeout=QDRANT_TIMEOUT)
    print(f"Connected to Qdrant Cloud at {url}")
    return _client


def ensure_collection():
    client = get_client()
    existing = [c.name for c in client.get_collections().collections]

    if COLLECTION_NAME in existing:
        print(f"Collection '{COLLECTION_NAME}' already exists.")
        return

    client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(
            size=EMBEDDING_DIM,
            distance=Distance.COSINE
        )
    )
    print(f"Collection '{COLLECTION_NAME}' created.")

def delete_collection():
    client = get_client()
    client.delete_collection(COLLECTION_NAME)
    print(f"Collection '{COLLECTION_NAME}' deleted.")


def collection_info() -> dict:
    client = get_client()
    info = client.get_collection(COLLECTION_NAME)
    return {
        "points_count": info.points_count,
        "vector_size": info.config.params.vectors.size,
        "distance": info.config.params.vectors.distance.name,
        "status": info.status.name
    }




if __name__ == "__main__":
    print("=== Verifying Qdrant Connection ===")
    ensure_collection()
    
    print("\n=== Collection Info ===")
    info = collection_info()
    for k, v in info.items():
        print(f"  {k}: {v}")