PYTHON = python

# ── Help ──────────────────────────────────────────────────────────────────────

help:
	@echo ""
	@echo "Kapruka Gift Concierge — available commands:"
	@echo ""
	@echo "  Setup"
	@echo "    make install              Install Python dependencies"
	@echo "    make install-playwright   Install Chromium for the crawler"
	@echo ""
	@echo "  Crawling"
	@echo "    make crawl                Scrape all 7 categories → data/catalog.json"
	@echo "    make crawl-cakes          Scrape cakes only"
	@echo "    make crawl-flowers        Scrape flowers only"
	@echo "    make crawl-books          Scrape books only"
	@echo "    make crawl-fashion        Scrape fashion only"
	@echo "    make crawl-gifts          Scrape gifts only"
	@echo "    make crawl-vouchers       Scrape vouchers only"
	@echo "    make crawl-electronics    Scrape electronics only"
	@echo ""
	@echo "  Ingestion"
	@echo "    make ingest               Embed catalog.json and upsert into Qdrant"
	@echo "    make ingest-fresh         Drop collection first, then ingest"
	@echo ""
	@echo "  Pipeline"
	@echo "    make run                  Crawl all categories then ingest"
	@echo "    make run-fresh            Crawl all then ingest into fresh collection"
	@echo ""
	@echo "  App"
	@echo "    make start                Start the concierge CLI (main.py)"
	@echo "    make ui                   Launch the Streamlit UI (app.py)"
	@echo "    make status               Show Qdrant collection info"
	@echo ""
	@echo "  Housekeeping"
	@echo "    make clean-cache          Remove all __pycache__ folders"
	@echo "    make help                 Show this message"
	@echo ""

# ── Data Pipeline ─────────────────────────────────────────────────────────────

crawl:
	$(PYTHON) cli/pipeline.py crawl

crawl-cakes:
	$(PYTHON) cli/pipeline.py crawl --categories cakes

crawl-flowers:
	$(PYTHON) cli/pipeline.py crawl --categories flowers

crawl-books:
	$(PYTHON) cli/pipeline.py crawl --categories books

crawl-fashion:
	$(PYTHON) cli/pipeline.py crawl --categories fashion

crawl-gifts:
	$(PYTHON) cli/pipeline.py crawl --categories gifts

crawl-vouchers:
	$(PYTHON) cli/pipeline.py crawl --categories vouchers

crawl-electronics:
	$(PYTHON) cli/pipeline.py crawl --categories electronics

ingest:
	$(PYTHON) cli/pipeline.py ingest

ingest-fresh:
	$(PYTHON) cli/pipeline.py ingest --recreate

run:
	$(PYTHON) cli/pipeline.py run

run-fresh:
	$(PYTHON) cli/pipeline.py run --recreate

status:
	$(PYTHON) cli/pipeline.py status

# ── App ───────────────────────────────────────────────────────────────────────

start:
	$(PYTHON) main.py

ui:
	PYTHONPATH=. streamlit run app.py --server.fileWatcherType none

# ── Housekeeping ──────────────────────────────────────────────────────────────

install:
	pip install -r requirements.txt

install-playwright:
	playwright install chromium

clean-cache:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null; true

.PHONY: help crawl crawl-cakes crawl-flowers crawl-books crawl-fashion crawl-gifts \
        crawl-vouchers crawl-electronics ingest ingest-fresh run run-fresh \
        status start ui install install-playwright clean-cache
