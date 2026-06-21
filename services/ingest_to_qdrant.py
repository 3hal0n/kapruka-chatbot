import json
import os
import sys
from pathlib import Path
from sentence_transformers import SentenceTransformer
from qdrant_client.models import PointStruct
from dotenv import load_dotenv

load_dotenv()

# Add project root to path so we can import qdrant_store
sys.path.append(str(Path(__file__).resolve().parents[1]))
from infrastructure.db.qdrant_store import ensure_collection, collection_info, get_client, COLLECTION_NAME
from utils.config import CATALOG_PATH, INGEST_EMBEDDING_MODEL, INGEST_BATCH_SIZE

EMBEDDING_MODEL = INGEST_EMBEDDING_MODEL
BATCH_SIZE = INGEST_BATCH_SIZE

def load_catalog(path: str = None) -> list:
    path = path or CATALOG_PATH
    with open(path, "r") as f:
        products = json.load(f)
    print(f"Loaded {len(products)} products from {path}")
    return products

def build_text(product: dict) -> str:
    return f"""
        name: {product.get('name', '')}
        category: {product.get('category', '')}
        description: {product.get('description', '')}
        specs: {product.get('specs', '')}
        price: {product.get('price', '')}
        availability: {product.get('availability', '')}
    """.strip()

def embed_products(texts: list[str]) -> list[list[float]]:
    encoder = SentenceTransformer(EMBEDDING_MODEL)
    print(f"Embedding {len(texts)} products...")
    
    all_embeddings = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i : i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        total_batches = (len(texts) + BATCH_SIZE - 1) // BATCH_SIZE
        embeddings = encoder.encode(batch).tolist()
        all_embeddings.extend(embeddings)
        print(f"Embedded batch {batch_num}/{total_batches}")
    
    return all_embeddings

def build_points(products: list, embeddings: list) -> list[PointStruct]:
    points = []
    for i, (product, vector) in enumerate(zip(products, embeddings)):
        points.append(PointStruct(
            id=i,
            vector=vector,
            payload=product     # full product stored as metadata
        ))
    return points

def upsert_points(points: list[PointStruct]):
    client = get_client()
    total = 0

    for i in range(0, len(points), BATCH_SIZE):
        batch = points[i : i + BATCH_SIZE]
        client.upsert(collection_name=COLLECTION_NAME, points=batch)
        total += len(batch)
        print(f"  Upserted {total}/{len(points)} points...")

    print(f"Done — {total} points upserted into '{COLLECTION_NAME}'.")


def run_ingest(recreate: bool = False):
    print("=" * 50)
    print("KAPRUKA CATALOG INGESTION PIPELINE")
    print("=" * 50)

    # 1. Load catalog
    products = load_catalog()

    # 2. Build text blobs
    texts = [build_text(p) for p in products]

    # 3. Embed
    embeddings = embed_products(texts)

    # 4. Ensure collection
    if recreate:
        from infrastructure.db.qdrant_store import delete_collection
        delete_collection()
    ensure_collection()

    # 5. Build points and upsert
    points = build_points(products, embeddings)
    upsert_points(points)

    # 6. Verify
    print("=== Collection Info ===")
    info = collection_info()
    for k, v in info.items():
        print(f"  {k}: {v}")

    print(" INGESTION COMPLETE")