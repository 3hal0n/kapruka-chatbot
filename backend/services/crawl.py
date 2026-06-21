import asyncio
import json
from playwright.async_api import async_playwright


async def scrape_product_detail(page, url):
    """Visit individual product page and extract full details"""
    try:
        await page.goto(url, timeout=30000, wait_until="domcontentloaded")
        await asyncio.sleep(2)

        # Tab 1: Description 
        tab1_el     = await page.query_selector("div#Tab1 div.detailDescription")
        description = (await tab1_el.inner_text()).strip() if tab1_el else "N/A"

        # Tab 2: Specs / Ingredients 
        tab2_el = await page.query_selector("div#Tab2 div.detailDescription")
        specs   = (await tab2_el.inner_text()).strip() if tab2_el else "N/A"

        # Tab 3: Availability
        tag_els      = await page.query_selector_all("span.tags")
        availability = "In Stock"  

        for tag in tag_els:
            text = (await tag.inner_text()).strip().lower()
            if "in stock" in text:
                availability = "In Stock"
                break
            elif "out of stock" in text:
                availability = "Out of Stock"
                break

        return {
            "description" : description,
            "specs"       : specs,
            "availability": availability
        }

    except Exception as e:
        print(f"  Could not get details: {e}")
        return {
            "description" : "N/A",
            "specs"       : "N/A",
            "availability": "Unknown"
        }


async def scrape_kapruka_products(category, url):
    all_products = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # Listing page 
        page = await browser.new_page()
        await page.set_extra_http_headers({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
        })

        print(f"\n Loading kapruka {category} page...")
        await page.goto(url, timeout=60000, wait_until="domcontentloaded")

        print("⏳ Waiting for products to render...")
        await asyncio.sleep(5)

        # Confirm products exist 
        try:
            await page.wait_for_selector("div.catalogueV2Repeater", timeout=20000)
            count = len(await page.query_selector_all("div.catalogueV2Repeater"))
            print(f" Products found! Initial count: {count}")
        except Exception as e:
            print(f" Could not find products: {e}")
            await browser.close()
            return []

        #  Click "See More" until all loaded 
        click_count = 0
        max_clicks  = 40

        while click_count < max_clicks:
            try:
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await asyncio.sleep(2)

                before = len(await page.query_selector_all("div.catalogueV2Repeater"))

                see_more = (
                    await page.query_selector("a#viewMoreButton") or
                    await page.query_selector("div#pagination_btn") or
                    await page.query_selector(".common_button")
                )

                if not see_more:
                    print(" No more button. All products loaded!")
                    break

                is_visible = await see_more.is_visible()
                if not is_visible:
                    print(" Button hidden. All products loaded!")
                    break

                await see_more.click()
                await asyncio.sleep(3)

                after = len(await page.query_selector_all("div.catalogueV2Repeater"))
                click_count += 1
                print(f" Click #{click_count} — total products: {after}")

                if after <= before:
                    print(" No new products. Done!")
                    break

            except Exception as e:
                print(f" Stopped: {e}")
                break

        # Extract card data 
        print("\n Collecting product cards...")
        cards = await page.query_selector_all("div.catalogueV2Repeater")
        print(f" Total cards: {len(cards)}")

        card_data_list = []

        for i, card in enumerate(cards):
            try:
                name_el  = await card.query_selector("div.catalogueV2heading")
                name     = (await name_el.text_content()).strip() if name_el else "N/A"

                price_el = await card.query_selector("span.catalogueV2converted")
                price    = (await price_el.text_content()).strip() if price_el else "N/A"

                link_el  = await card.query_selector("a")
                link     = await link_el.get_attribute("href") if link_el else ""

                weight_el = await card.query_selector("div.thumb-text span")
                weight    = (await weight_el.text_content()).strip() if weight_el else ""


                card_data_list.append({
                    "name"       : name,
                    "price"      : price,
                    "weight"     : weight,
                    "product_url": link
                })

            except Exception as e:
                print(f"Card error on {i}: {e}")
                continue

        await page.close()

        # Visit each product detail page 

        detail_page = await browser.new_page()
        await detail_page.set_extra_http_headers({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
        })

        print(f"\n Visiting each product page for details...")

        for i, card in enumerate(card_data_list):
            if not card["product_url"]:
                all_products.append({
                    **card,
                    "category"   : category,
                    "availability": "Unknown",
                    "description" : "N/A",
                    "specs"       : "N/A"
                })
                continue

            # Get detailed info from product page
            detail = await scrape_product_detail(detail_page, card["product_url"])

            product = {
                "name"        : card["name"],
                "price"       : card["price"],
                "weight"      : card["weight"],
                "product_url" : card["product_url"],
                "category"    : category,
                "availability": detail["availability"],
                "description" : detail["description"],
                "specs"       : detail["specs"]
            }

            all_products.append(product)

            if (i + 1) % 10 == 0:
                print(f"Done {i + 1}/{len(card_data_list)} products...")

            await asyncio.sleep(1)  

        await detail_page.close()
        await browser.close()

    return all_products


async def main():
    print("Kapruka Product Scraper")
    print("=" * 40)

    categories = {
        "cakes"  : "https://www.kapruka.com/online/cakes",
        "flowers": "https://www.kapruka.com/online/flowers",
        "books" : "https://www.kapruka.com/online/books",
        "fashion" : "https://www.kapruka.com/online/fashion",
        "gifts" : "https://www.kapruka.com/online/customizedGifts",
        "vouchers" : "https://www.kapruka.com/online/giftvouchers",
        "electronics" : "https://www.kapruka.com/online/electronics"
    }

    all_combined = []

    for cat, url in categories.items():
        print(f"\n{'='*40}")
        print(f" Category: {cat.upper()}")
        print(f"{'='*40}")

        products = await scrape_kapruka_products(cat, url)

        if not products:
            print(f"No products for {cat}. Skipping...")
            continue  

        filename = f"data/{cat}.json"
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(products, f, indent=2, ensure_ascii=False)

        print(f"Saved {len(products)} products to {filename}")
        all_combined.extend(products)

    # Save combined catalog for the agent
    with open("data/catalog.json", "w", encoding="utf-8") as f:
        json.dump(all_combined, f, indent=2, ensure_ascii=False)

    print(f"\n Done! Total: {len(all_combined)} products")
    print(f" Combined saved to data/catalog.json")


if __name__ == "__main__":
    asyncio.run(main())