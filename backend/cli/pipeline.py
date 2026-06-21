"""
cli/pipeline.py — Kapruka Data Pipeline CLI

Usage:
  python cli/pipeline.py crawl                        # scrape all categories
  python cli/pipeline.py crawl --categories cakes flowers
  python cli/pipeline.py ingest                       # ingest catalog.json → Qdrant
  python cli/pipeline.py ingest --recreate            # drop & recreate collection first
  python cli/pipeline.py ingest --catalog data/cakes.json   # ingest a specific file
  python cli/pipeline.py run                          # crawl then ingest (full pipeline)
  python cli/pipeline.py run --categories cakes --recreate
  python cli/pipeline.py status                       # show Qdrant collection info
"""

import sys
import asyncio
import argparse
from pathlib import Path

# Ensure project root is on the path when running from any directory
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


# ── Helpers ──────────────────────────────────────────────────────────────────

ALL_CATEGORIES = {
    "cakes":       "https://www.kapruka.com/online/cakes",
    "flowers":     "https://www.kapruka.com/online/flowers",
    "books":       "https://www.kapruka.com/online/books",
    "fashion":     "https://www.kapruka.com/online/fashion",
    "gifts":       "https://www.kapruka.com/online/customizedGifts",
    "vouchers":    "https://www.kapruka.com/online/giftvouchers",
    "electronics": "https://www.kapruka.com/online/electronics",
}


def _header(title: str):
    print("\n" + "=" * 55)
    print(f"  {title}")
    print("=" * 55)


# ── Commands ──────────────────────────────────────────────────────────────────

async def _do_crawl(categories: list[str]):
    import json
    from services.crawl import scrape_kapruka_products

    data_dir = ROOT / "data"
    data_dir.mkdir(exist_ok=True)

    selected = {k: v for k, v in ALL_CATEGORIES.items() if k in categories}
    all_products = []

    for cat, url in selected.items():
        _header(f"Crawling: {cat.upper()}")
        products = await scrape_kapruka_products(cat, url)

        if not products:
            print(f"  No products found for {cat}. Skipping.")
            continue

        out = data_dir / f"{cat}.json"
        with open(out, "w", encoding="utf-8") as f:
            json.dump(products, f, indent=2, ensure_ascii=False)
        print(f"  Saved {len(products)} products → {out}")
        all_products.extend(products)

    if all_products:
        combined = data_dir / "catalog.json"
        import json as _json
        with open(combined, "w", encoding="utf-8") as f:
            _json.dump(all_products, f, indent=2, ensure_ascii=False)
        print(f"\n  Combined catalog → {combined}  ({len(all_products)} total products)")
    else:
        print("\n  No products scraped.")


def _do_ingest(catalog_path: str, recreate: bool):
    from services.ingest_to_qdrant import run_ingest
    _header("Ingesting catalog → Qdrant")
    if catalog_path:
        # patch the path temporarily
        from services import ingest_to_qdrant
        original = ingest_to_qdrant.load_catalog
        ingest_to_qdrant.load_catalog = lambda path=None: original(catalog_path)
        run_ingest(recreate=recreate)
        ingest_to_qdrant.load_catalog = original
    else:
        run_ingest(recreate=recreate)


def _do_status():
    from infrastructure.db.qdrant_store import collection_info
    _header("Qdrant Collection Status")
    info = collection_info()
    for k, v in info.items():
        print(f"  {k:<20}: {v}")


# ── Subcommand handlers ───────────────────────────────────────────────────────

def cmd_crawl(args):
    categories = args.categories if args.categories else list(ALL_CATEGORIES.keys())
    invalid = [c for c in categories if c not in ALL_CATEGORIES]
    if invalid:
        print(f"Unknown categories: {invalid}")
        print(f"Available: {list(ALL_CATEGORIES.keys())}")
        sys.exit(1)
    asyncio.run(_do_crawl(categories))


def cmd_ingest(args):
    _do_ingest(
        catalog_path=args.catalog,
        recreate=args.recreate,
    )


def cmd_run(args):
    categories = args.categories if args.categories else list(ALL_CATEGORIES.keys())
    invalid = [c for c in categories if c not in ALL_CATEGORIES]
    if invalid:
        print(f"Unknown categories: {invalid}")
        sys.exit(1)
    asyncio.run(_do_crawl(categories))
    _do_ingest(catalog_path=None, recreate=args.recreate)


def cmd_status(args):
    _do_status()


# ── Argument parser ───────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pipeline",
        description="Kapruka data pipeline — crawl, ingest, or run both.",
    )
    sub = parser.add_subparsers(dest="command", metavar="<command>")
    sub.required = True

    # crawl
    p_crawl = sub.add_parser("crawl", help="Scrape products from kapruka.com")
    p_crawl.add_argument(
        "--categories", nargs="+", metavar="CAT",
        choices=list(ALL_CATEGORIES.keys()),
        help=f"Categories to crawl (default: all). Choices: {list(ALL_CATEGORIES.keys())}",
    )
    p_crawl.set_defaults(func=cmd_crawl)

    # ingest
    p_ingest = sub.add_parser("ingest", help="Embed catalog.json and upsert into Qdrant")
    p_ingest.add_argument(
        "--catalog", metavar="PATH", default=None,
        help="Path to catalog JSON file (default: data/catalog.json)",
    )
    p_ingest.add_argument(
        "--recreate", action="store_true",
        help="Drop and recreate the Qdrant collection before ingesting",
    )
    p_ingest.set_defaults(func=cmd_ingest)

    # run (crawl + ingest)
    p_run = sub.add_parser("run", help="Full pipeline: crawl then ingest")
    p_run.add_argument(
        "--categories", nargs="+", metavar="CAT",
        choices=list(ALL_CATEGORIES.keys()),
        help="Categories to crawl (default: all)",
    )
    p_run.add_argument(
        "--recreate", action="store_true",
        help="Drop and recreate the Qdrant collection before ingesting",
    )
    p_run.set_defaults(func=cmd_run)

    # status
    p_status = sub.add_parser("status", help="Show Qdrant collection info")
    p_status.set_defaults(func=cmd_status)

    return parser


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)
