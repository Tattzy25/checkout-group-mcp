# Checkout Group MCP Server Documentation

Welcome to the documentation for the Checkout Group MCP Server. This service enables your AI agents to handle end-to-end purchasing workflows, managing the entire checkout lifecycle from creation to finalization.

**Server URL:** `https://checkout-group-mcp.anigok.com/mcp`

## Core Requirements

* **UCP Agent Profile:** Every request across all tools must include `meta.ucp-agent.profile` (a valid URI) for capability negotiation.

* **Idempotency:** The `complete_checkout` and `cancel_checkout` tools strictly require a UUID in `meta["idempotency-key"]` to ensure retry safety.

## Available Tools

### `create_checkout`

Initiates a new checkout session. You can pass an optional `cart_id` to convert an existing cart, or provide a complete `checkout` object containing currency, line items, and buyer contact details. The response will yield a `continue_url` to hand off to a trusted UI.

### `get_checkout`

Retrieves the current state of an existing checkout session. Use this to verify line items, check totals after a modification, or determine what data is still required before payment processing. Requires the checkout `id`.

### `update_checkout`

Modifies an existing checkout session (e.g., changing quantities, adding a shipping address, or applying discount codes).

**Critical Warning:** This tool utilizes **PUT semantics**. The payload you send entirely replaces the existing checkout state. There is no server-side merging of partial updates. If you omit a field (such as `line_items`), it will be wiped from the checkout. Ensure you strip any response-only fields (like `display` strings) before submitting your payload.

### `complete_checkout`

Finalizes the transaction and generates the order. This is invoked when the checkout status is `ready_for_complete` and the buyer has authorized payment via the trusted UI. Requires the checkout `id`, payment credentials, and an `idempotency-key`.

### `cancel_checkout`

Instantly expires an active checkout session. Canceled checkouts cannot be recovered or resumed. Requires the checkout `id` and an `idempotency-key`.

## Implementation Examples (cURL)

Below are robust, production-ready examples of how to interact with the Checkout Group MCP server across different stages of the checkout lifecycle.

### 1. Creating a Checkout from a Cart

```bash
curl -X POST "https://checkout-group-mcp.anigok.com/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream, application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "create_checkout",
      "arguments": {
        "shop_domain": "gymshark.com",
        "meta": {
          "ucp-agent": {
            "profile": "https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json"
          }
        },
        "cart_id": "gid://shopify/Cart/REPLACE_WITH_CART_ID?key=REPLACE_WITH_CART_KEY"
      }
    }
  }'
```

### 2. Retrieving Checkout State

```bash
curl -X POST "https://checkout-group-mcp.anigok.com/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream, application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "get_checkout",
      "arguments": {
        "shop_domain": "gymshark.com",
        "meta": {
          "ucp-agent": {
            "profile": "https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json"
          }
        },
        "id": "gid://shopify/Checkout/REPLACE_WITH_CHECKOUT_ID"
      }
    }
  }'
```

### 3. Updating a Checkout (PUT Semantics)

```bash
curl -X POST "https://checkout-group-mcp.anigok.com/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream, application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "update_checkout",
      "arguments": {
        "shop_domain": "gymshark.com",
        "meta": {
          "ucp-agent": {
            "profile": "https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json"
          }
        },
        "id": "gid://shopify/Checkout/REPLACE_WITH_CHECKOUT_ID",
        "checkout": {
          "line_items": [
            {
              "quantity": 2,
              "item": {
                "id": "gid://shopify/ProductVariant/REPLACE_WITH_VARIANT_ID"
              }
            }
          ],
          "buyer": {
            "email": "buyer@domain.test"
          },
          "context": {
            "address_country": "US",
            "address_region": "CA",
            "postal_code": "90210",
            "language": "en",
            "currency": "USD"
          }
        }
      }
    }
  }'
```

### 4. Canceling a Checkout

```bash
curl -X POST "https://checkout-group-mcp.anigok.com/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream, application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "cancel_checkout",
      "arguments": {
        "shop_domain": "gymshark.com",
        "meta": {
          "ucp-agent": {
            "profile": "https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json"
          },
          "idempotency-key": "c3f786e7-485e-4d5b-8bc7-62bcd34d60cf"
        },
        "id": "gid://shopify/Checkout/REPLACE_WITH_CHECKOUT_ID"
      }
    }
  }'
```
