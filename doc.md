# 🏆 Kapruka Agent Challenge 2026

**Build Sri Lanka's most innovative AI shopping agent**

For Sri Lankan developers 🇱🇰

Kapruka is opening access to its public MCP (Model Context Protocol) server, the same infrastructure powering search, delivery, and checkout across Sri Lanka’s largest e-commerce platform.

Your challenge is to build a beautiful, full-screen AI shopping experience that customers would genuinely enjoy using.

**Grand Prize:** Apple M4 Mac Mini 🍎

---

## Overview

Build an AI-powered shopping assistant that connects to Kapruka's live commerce infrastructure and delivers a conversational shopping experience.

Your solution should:

* Use the Kapruka MCP
* Provide a hosted public demo
* Guide users from discovery to checkout
* Deliver a polished, visual shopping experience

### Challenge Highlights

* Free public MCP access
* No API key required
* Judged by Kapruka engineering team
* Submission deadline: **30 June 2026**

---

# Why This Matters

## Real Infrastructure. Real Customers. Real Stakes.

This is not a mock dataset.

The Kapruka MCP connects directly to:

* Live products
* Real delivery quotes
* Actual guest checkout flows

Build something that can be shipped, demonstrated publicly, and added to your portfolio.

Agentic commerce is becoming one of the fastest-growing AI application spaces, and this challenge gives builders a chance to explore it in the Sri Lankan retail ecosystem.

---

## 🛒 Production E-Commerce

Build experiences using:

* Product search
* Category browsing
* Delivery quotations
* Guest checkout
* Click-to-pay links

---

## ⚡ Zero Setup Friction

* Public MCP endpoint
* No registration required
* No API keys
* No approval process

Just connect and start building.

---

## 🏆 Judged by Kapruka

Entries will be reviewed by Kapruka’s engineering team.

Outstanding submissions may influence future conversational shopping experiences.

---

# The Brief

## Build an Experience People Want to Use

Your submission should be:

### 💬 Full-Screen Chat UI

* Immersive conversation experience
* Main interface should be chat
* Not a small embedded widget

### 🎨 Highly Visual

Use:

* Product cards
* Images
* Carousels
* Rich responses

Avoid walls of text.

### 😊 Personality

Create an agent with:

* Character
* Warmth
* Memorable interaction style

### 🔎 Helpful Shopping Guidance

Help users move naturally from:

Discovery → Comparison → Decision → Checkout

### 🧾 Complete Checkout Flow

Support:

* Product selection
* Delivery setup
* Working checkout

### 🌐 Public Hosting

Requirements:

* Public URL
* Stable deployment
* Accessible during judging

---

# Getting Started

## 1. Register

Complete the registration form.

Approximate time: **1 minute**

---

## 2. Connect the MCP

Endpoint:

```txt
https://mcp.kapruka.com/mcp
```

Explore available tools and documentation.

---

## 3. Build & Host

Create your shopping assistant and deploy it.

---

## 4. Submit

Send your live demo before:

**30 June 2026**

---

# Grand Prize

## 🍎 Apple M4 Mac Mini

### Specifications

* Apple M4 Chip
* 10-core CPU
* 10-core GPU
* 16-core Neural Engine
* 16GB Unified Memory
* 512GB SSD
* Gigabit Ethernet
* Apple Intelligence support

### Prize Includes

* 1× Apple M4 Mac Mini
* Approximate retail value: **USD 799**

One winner.

Judges may optionally recognize additional placements if results are extremely close.

---

# Resources

## MCP Endpoint

```txt
https://mcp.kapruka.com/mcp
```

---

## Claude Desktop Configuration

```json
{
  "mcpServers": {
    "kapruka": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.kapruka.com/mcp"
      ]
    }
  }
}
```

---

## Alternative MCP Configuration

```json
{
  "mcpServers": {
    "kapruka": {
      "url": "https://mcp.kapruka.com/mcp"
    }
  }
}
```

---

## Useful Links

* Full Documentation
* GitHub Source
* Kapruka Website

---

# MCP Server

## Kapruka MCP Server

Plug any LLM into Sri Lanka’s largest local e-commerce platform.

### Features

* Product search
* Category browsing
* Delivery quotes
* Guest checkout
* Order tracking

### Transport

* Streamable HTTP
* No authentication

---

# Available MCP Tools

## 🔍 kapruka_search_products

Search catalog using:

* Keywords
* Categories
* Price ranges
* Stock filtering
* Sorting
* Pagination

Parameters:

```txt
q
category
min_price
max_price
in_stock_only
sort
limit
cursor
currency
```

---

## 📦 kapruka_get_product

Retrieve:

* Product details
* Images
* Variants
* Shipping
* Availability

Parameters:

```txt
product_id
currency
```

---

## 🗂️ kapruka_list_categories

Browse available categories.

Parameters:

```txt
depth
```

---

## 📍 kapruka_list_delivery_cities

Search delivery coverage.

Parameters:

```txt
query
limit
```

---

## 🚚 kapruka_check_delivery

Check:

* Delivery eligibility
* Delivery date
* Pricing
* Perishable warnings

Parameters:

```txt
city
delivery_date
product_id
```

---

## 🛒 kapruka_create_order

Create guest checkout orders.

Features:

* Click-to-pay
* Locked pricing
* Multi-currency

Parameters:

```txt
cart
recipient
delivery
sender
gift_message
currency
```

---

## 📦 kapruka_track_order

Track:

* Order status
* Delivery updates
* Recipient details

Parameters:

```txt
order_number
```

---

# Usage Limits

## Free Tier

### General Requests

```txt
60 requests/minute per IP
```

### Order Creation

```txt
30 orders/hour per IP
```

### Guest Checkout

* Prices locked for 60 minutes
* Browser payment
* No account required

### Caching

* Product/category reads cached up to 30 minutes
* Write operations never cached

---

# Eligibility & Rules

## Requirements

* Open only to Sri Lankan residents
* Solo participants only
* One submission per person
* Must use Kapruka MCP
* Public hosted demo required
* Respect catalog and infrastructure
* No abuse or spam

Deadline:

**30 June 2026**

---

# Judging Criteria

## Scoring Rubric (100 Points)

| Category                | Points  |
| ----------------------- | ------- |
| Experience & Polish     | 30      |
| Visual Richness         | 20      |
| Personality             | 15      |
| Usefulness              | 15      |
| End-to-End Completeness | 15      |
| Creativity              | 5       |
| **Total**               | **100** |

---

# Bonus Points

Stand out with:

* 🛒 Multi-item carts
* 📅 Delivery constraints
* 🎁 Gift messages
* 💬 Tanglish support
* 🇱🇰 Sinhala language support

Sinhala support is especially encouraged.

---

# Timeline

## Now

Registration opens.

---

## Through June

Build and deploy.

---

## 30 June 2026

Submission deadline.

---

# FAQ

## Do I need a Kapruka API key?

No.

---

## What can the MCP do?

Search, browse, quote delivery, checkout, and track orders.

---

## Which AI model can I use?

Any model.

---

## Can teams participate?

No. Solo only.

---

## Does the demo need hosting?

Yes.

---

## Ready to Build?

Build the future of shopping in Sri Lanka.

**Enter the Kapruka Agent Challenge →**

---

© 2026 Kapruka Holdings PLC
Built by Kapruka Techroot Pvt Ltd
