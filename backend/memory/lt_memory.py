""""

takes user query -> embed it -> 
    retrieve from the store -> 
        then check filters -> 
            drop similar products with filters(cosine similarity) -> 
                if nothing then fetch again with k*2


                
                filters = {
                exclude
                }

"""

from infrastructure.llm.client import embed_text
from infrastructure.db.qdrant_store import get_client, COLLECTION_NAME
from utils.config import LT_EMBEDDING_MODEL, LT_SEARCH_TOP_K, QDRANT_EMBEDDING_DIM


def _encode(query: str) -> list:
    """Embed a query via the hosted Gemini model (no local tensors)."""
    return embed_text(query, model=LT_EMBEDDING_MODEL, output_dim=QDRANT_EMBEDDING_DIM)



def precompute_embedding(query: str) -> list:
    """Encode query to vector — can be run in parallel with classifier."""
    return _encode(query)


def search_catalog(query : str, top_k : int = LT_SEARCH_TOP_K,query_vector : list = None):

    if query_vector is None:
        query_vector = _encode(query)

    client = get_client()

    results = client.query_points(
        collection_name = COLLECTION_NAME,
        query = query_vector,
        limit =top_k
    ).points

    products = [hit.payload for hit in results]
    return products



def main():
    print("=== Long Term Memory Test ===\n")

    query = "birthday cake for my wife"
    print(f"Query: {query}")
    print("-" * 40)

    results = search_catalog(query, top_k=5)

    for i, product in enumerate(results, 1):
        print(f"\n{i}. {product.get('name')}")
        print(f"   Price       : {product.get('price')}")
        print(f"   Category    : {product.get('category')}")
        print(f"   Availability: {product.get('availability')}")

if __name__ == "__main__":
    main()