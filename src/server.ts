import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

const createCheckoutInputSchema = z.object({
  shop_domain: z
    .string()
    .describe("The shop domain to call. This maps to https://{shop-domain}/api/ucp/mcp."),
  meta: z
    .object({
      "ucp-agent": z.object({
        profile: z
          .string()
          .url()
          .describe("The URI to your agent's UCP profile for capability negotiation.")
      })
    })
    .describe("Request metadata. You must include ucp-agent.profile."),
  cart_id: z
    .string()
    .describe(
      "The optional ID of a cart built with Cart MCP to convert into this checkout."
    )
    .optional(),
  checkout: z
    .object({
      currency: z
        .string()
        .describe("ISO 4217 currency code, for example USD, EUR, or GBP.")
        .optional(),
      line_items: z
        .array(
          z.object({
            quantity: z
              .number()
              .int()
              .min(1)
              .describe("The quantity to purchase for this line item."),
            item: z.object({
              id: z
                .string()
                .describe("The product variant id for this line item.")
            })
          })
        )
        .describe(
          "Array of items to purchase. Each item must include quantity and an item object with the product variant id."
        )
        .optional(),
      buyer: z
        .object({})
        .passthrough()
        .describe(
          "Buyer information. Contact method email or phone_number must be provided, per-merchant configuration."
        )
        .optional(),
      context: z
        .object({
          address_country: z.string().optional().describe("Provisional buyer signal for country."),
          address_region: z.string().optional().describe("Provisional buyer signal for region."),
          postal_code: z.string().optional().describe("Provisional buyer signal for postal code."),
          intent: z.string().optional().describe("Provisional buyer intent signal."),
          language: z.string().optional().describe("Provisional buyer language signal."),
          currency: z.string().optional().describe("Provisional buyer currency signal."),
          eligibility: z.array(z.string()).optional().describe("Eligibility signals.")
        })
        .describe(
          "Provisional buyer signals for intent, localization, currency, and eligibility decisions. A shipping address supersedes these context hints."
        )
        .optional(),
      attribution: z
        .object({
          referring_domain: z.string().optional(),
          click_id_tag: z.string().optional(),
          click_id_value: z.string().optional(),
          activity_id_tag: z.string().optional(),
          activity_id_value: z.string().optional(),
          utm_campaign: z.string().optional(),
          utm_source: z.string().optional(),
          utm_medium: z.string().optional(),
          utm_content: z.string().optional(),
          utm_term: z.string().optional()
        })
        .describe(
          "Optional attribution metadata. Supported fields include referring_domain, click_id_tag, click_id_value, activity_id_tag, activity_id_value, utm_campaign, utm_source, utm_medium, utm_content, and utm_term."
        )
        .optional(),
      discounts: z
        .object({
          codes: z.array(z.string()).describe("Discount codes to apply to the checkout.")
        })
        .describe(
          "Optional discount codes. Forward cart discount codes in checkout.discounts.codes during cart-to-checkout conversion."
        )
        .optional(),
      fulfillment: z
        .object({})
        .passthrough()
        .describe("Fulfillment preferences including shipping methods and destinations.")
        .optional(),
      payment: z
        .object({})
        .passthrough()
        .describe("Payment configuration including available instruments and selected_instrument_id.")
        .optional()
    })
    .describe(
      "The checkout object containing all checkout data. Optional when cart_id is provided, in which case the cart's contents are used instead."
    )
    .optional()
}).superRefine((value, ctx) => {
  if (value.cart_id) {
    return;
  }

  if (!value.checkout) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "checkout is required when cart_id is not provided.",
      path: ["checkout"]
    });
    return;
  }

  if (!value.checkout.currency) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "checkout.currency is required when cart_id is not provided.",
      path: ["checkout", "currency"]
    });
  }

  if (!value.checkout.line_items) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "checkout.line_items is required when cart_id is not provided.",
      path: ["checkout", "line_items"]
    });
  }

  if (!value.checkout.buyer) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "checkout.buyer is required when cart_id is not provided.",
      path: ["checkout", "buyer"]
    });
  }
});

const getCheckoutInputSchema = z.object({
  shop_domain: z
    .string()
    .describe("The shop domain to call. This maps to https://{shop-domain}/api/ucp/mcp."),
  meta: z
    .object({
      "ucp-agent": z.object({
        profile: z
          .string()
          .url()
          .describe("The URI to your agent's UCP profile for capability negotiation.")
      })
    })
    .describe("Request metadata. You must include ucp-agent.profile."),
  id: z.string().describe("The ID of the checkout session to retrieve.")
});

const updateCheckoutInputSchema = z.object({
  shop_domain: z
    .string()
    .describe("The shop domain to call. This maps to https://{shop-domain}/api/ucp/mcp."),
  meta: z
    .object({
      "ucp-agent": z.object({
        profile: z
          .string()
          .url()
          .describe("The URI to your agent's UCP profile for capability negotiation.")
      })
    })
    .describe("Request metadata. You must include ucp-agent.profile."),
  id: z.string().describe("The ID of the checkout session to update."),
  checkout: z
    .object({
      line_items: z
        .array(
          z.object({
            id: z
              .string()
              .describe("The existing checkout line item id.")
              .optional(),
            quantity: z
              .number()
              .int()
              .min(1)
              .describe("The updated quantity for this line item."),
            item: z.object({
              id: z
                .string()
                .describe("The product variant id for this line item.")
            })
          })
        )
        .describe("Updated array of items. Replaces existing line items."),
      buyer: z
        .object({})
        .passthrough()
        .describe(
          "Updated buyer information. Contact method email or phone_number must be provided, per-merchant configuration."
        ),
      context: z
        .object({
          address_country: z.string().optional().describe("Updated provisional buyer signal for country."),
          address_region: z.string().optional().describe("Updated provisional buyer signal for region."),
          postal_code: z.string().optional().describe("Updated provisional buyer signal for postal code."),
          intent: z.string().optional().describe("Updated provisional buyer intent signal."),
          language: z.string().optional().describe("Updated provisional buyer language signal."),
          currency: z.string().optional().describe("Updated provisional buyer currency signal."),
          eligibility: z.array(z.string()).optional().describe("Updated eligibility signals.")
        })
        .describe(
          "Updated provisional buyer signals for intent, localization, currency, and eligibility decisions. A shipping address supersedes these context hints."
        )
        .optional(),
      attribution: z
        .object({
          referring_domain: z.string().optional(),
          click_id_tag: z.string().optional(),
          click_id_value: z.string().optional(),
          activity_id_tag: z.string().optional(),
          activity_id_value: z.string().optional(),
          utm_campaign: z.string().optional(),
          utm_source: z.string().optional(),
          utm_medium: z.string().optional(),
          utm_content: z.string().optional(),
          utm_term: z.string().optional()
        })
        .describe(
          "Attribution metadata. Because the checkout object is replaced, resend attribution if you want to preserve it."
        )
        .optional(),
      discounts: z
        .object({
          codes: z.array(z.string()).describe("Updated discount codes for the checkout.")
        })
        .describe("Updated discount codes for the checkout.")
        .optional(),
      fulfillment: z
        .object({})
        .passthrough()
        .describe(
          "Updated fulfillment preferences. Each method must include line_item_ids."
        )
        .optional(),
      payment: z
        .object({})
        .passthrough()
        .describe(
          "Updated payment configuration. Do not send response-only display fields from payment.instruments."
        )
        .optional()
    })
    .describe(
      "The checkout object containing the complete updated checkout state. update_checkout uses PUT semantics. Omit a field and it is removed from the checkout. There is no server-side merge of partial updates."
    )
});

const completeCheckoutInputSchema = z.object({
  shop_domain: z
    .string()
    .describe("The shop domain to call. This maps to https://{shop-domain}/api/ucp/mcp."),
  meta: z
    .object({
      "ucp-agent": z.object({
        profile: z
          .string()
          .url()
          .describe("The URI to your agent's UCP profile for capability negotiation.")
      }),
      "idempotency-key": z
        .string()
        .uuid()
        .describe("A UUID required for retry safety.")
    })
    .describe("Request metadata. You must include ucp-agent.profile and idempotency-key."),
  id: z.string().describe("The ID of the checkout session to complete."),
  checkout: z
    .object({
      payment: z
        .object({})
        .passthrough()
        .describe(
          "Checkout object containing payment credentials and finalization data. Include checkout.payment with the payment instrument and credential from the trusted UI."
        )
    })
    .describe("Checkout object containing payment credentials and finalization data.")
});

const cancelCheckoutInputSchema = z.object({
  shop_domain: z
    .string()
    .describe("The shop domain to call. This maps to https://{shop-domain}/api/ucp/mcp."),
  meta: z
    .object({
      "ucp-agent": z.object({
        profile: z
          .string()
          .url()
          .describe("The URI to your agent's UCP profile for capability negotiation.")
      }),
      "idempotency-key": z
        .string()
        .uuid()
        .describe("A UUID required for retry safety.")
    })
    .describe("Request metadata. You must include ucp-agent.profile and idempotency-key."),
  id: z.string().describe("The ID of the checkout session to cancel.")
});

function createServer() {
  const server = new McpServer({
    name: "Checkout Group MCP",
    version: "1.0.0"
  });

  server.registerTool(
    "create_checkout",
    {
      description: "Create a new checkout session with line items, buyer information, and fulfillment preferences. Use this tool when a buyer is ready to purchase items and you need to initiate the checkout process. The response includes a `continue_url` for handing off to a trusted UI. When to use: Buyer says \"I want to buy this item\", or Agent has collected enough information to start checkout, and Buyer confirms their cart and wants to proceed.",
      inputSchema: createCheckoutInputSchema
    },
    async ({ shop_domain, meta, cart_id, checkout }: z.infer<typeof createCheckoutInputSchema>) => {
      const response = await fetch(`https://${shop_domain}/api/ucp/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          id: 1,
          params: {
            name: "create_checkout",
            arguments: { meta, ...(cart_id ? { cart_id } : {}), ...(checkout ? { checkout } : {}) }
          }
        })
      });
      const result = await response.json() as Record<string, unknown>;
      if ("error" in result) {
        return { content: [{ text: JSON.stringify(result), type: "text" }], structuredContent: result, isError: true };
      }
      return { content: [{ text: JSON.stringify(result), type: "text" }], structuredContent: result };
    }
  );

  server.registerTool(
    "get_checkout",
    {
      description: "Retrieve the current state of an existing checkout session. Use this tool to check the status of a checkout, see updated totals after changes, or verify what information is still needed before completion. When to use: Need to refresh checkout state after buyer returns, Want to show current totals and line items, or Checking if checkout is ready for payment.",
      inputSchema: getCheckoutInputSchema
    },
    async ({ shop_domain, meta, id }: z.infer<typeof getCheckoutInputSchema>) => {
      const response = await fetch(`https://${shop_domain}/api/ucp/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          id: 1,
          params: { name: "get_checkout", arguments: { meta, id } }
        })
      });
      const result = await response.json() as Record<string, unknown>;
      if ("error" in result) {
        return { content: [{ text: JSON.stringify(result), type: "text" }], structuredContent: result, isError: true };
      }
      return { content: [{ text: JSON.stringify(result), type: "text" }], structuredContent: result };
    }
  );

  server.registerTool(
    "update_checkout",
    {
      description: "Update an existing checkout session with new information. Use this tool to modify line items, update shipping address, change fulfillment method, or add buyer information before completing the checkout. When to use: Buyer wants to change quantity or remove items, Buyer provides or updates shipping address, Need to update buyer email or contact info, or Changing a delivery option. Caution: `update_checkout` uses PUT semantics. Each request replaces the full checkout state with the payload you send. Omit a field (for example `line_items` or `buyer`) and it is removed from the checkout. There is no server-side merge of partial updates. Before sending an update, remove response-only fields from the payload. `checkout.buyer.country_code` isn't accepted as input. `checkout.payment.instruments[].display` is response-only. For fulfillment updates, `checkout.fulfillment.methods[].id` is optional, but `line_item_ids` is required.",
      inputSchema: updateCheckoutInputSchema
    },
    async ({ shop_domain, meta, id, checkout }: z.infer<typeof updateCheckoutInputSchema>) => {
      const response = await fetch(`https://${shop_domain}/api/ucp/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          id: 1,
          params: { name: "update_checkout", arguments: { meta, id, checkout } }
        })
      });
      const result = await response.json() as Record<string, unknown>;
      if ("error" in result) {
        return { content: [{ text: JSON.stringify(result), type: "text" }], structuredContent: result, isError: true };
      }
      return { content: [{ text: JSON.stringify(result), type: "text" }], structuredContent: result };
    }
  );

  server.registerTool(
    "complete_checkout",
    {
      description: "Submit payment and place the order. Requires `meta[\"idempotency-key\"]` (UUID) in addition to `meta[\"ucp-agent\"]`. Use this tool when the checkout is ready and the buyer has authorized payment. This finalizes the transaction and creates an order. When to use: Checkout status is `ready_for_complete`, Buyer has reviewed and confirmed the order, or Payment credential has been collected.",
      inputSchema: completeCheckoutInputSchema
    },
    async ({ shop_domain, meta, id, checkout }: z.infer<typeof completeCheckoutInputSchema>) => {
      const response = await fetch(`https://${shop_domain}/api/ucp/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          id: 1,
          params: { name: "complete_checkout", arguments: { meta, id, checkout } }
        })
      });
      const result = await response.json() as Record<string, unknown>;
      if ("error" in result) {
        return { content: [{ text: JSON.stringify(result), type: "text" }], structuredContent: result, isError: true };
      }
      return { content: [{ text: JSON.stringify(result), type: "text" }], structuredContent: result };
    }
  );

  server.registerTool(
    "cancel_checkout",
    {
      description: "Cancel an active checkout session. Requires `meta[\"idempotency-key\"]` (UUID) in addition to `meta[\"ucp-agent\"]`. Use this tool when a buyer abandons the checkout or explicitly requests cancellation. Canceled checkouts can't be resumed. Cancellation expires the checkout immediately. The canceled checkout resource includes `expires_at`, which is set to the cancellation timestamp. When to use: Buyer explicitly cancels the order, Session has been abandoned, or Need to start fresh with a new checkout.",
      inputSchema: cancelCheckoutInputSchema
    },
    async ({ shop_domain, meta, id }: z.infer<typeof cancelCheckoutInputSchema>) => {
      const response = await fetch(`https://${shop_domain}/api/ucp/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          id: 1,
          params: { name: "cancel_checkout", arguments: { meta, id } }
        })
      });
      const result = await response.json() as Record<string, unknown>;
      if ("error" in result) {
        return { content: [{ text: JSON.stringify(result), type: "text" }], structuredContent: result, isError: true };
      }
      return { content: [{ text: JSON.stringify(result), type: "text" }], structuredContent: result };
    }
  );

  return server;
}

export default {
  fetch(request, env, ctx) {
    return createMcpHandler(() => createServer(env, request), { allowedOriginHostnames: "*" })(request, env, ctx);
  }
} satisfies ExportedHandler;
