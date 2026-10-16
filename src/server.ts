import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

const UCP_AGENT_PROFILE =
  "https://ucp-agent-profile.facetimefy.com/ucp/agent-profiles/2026-08-25/valid-with-capabilities.json";

type McpToolReply = {
  error?: unknown;
  result?: {
    content?: Array<{ type?: string; text?: string }>;
    structuredContent?: unknown;
    isError?: boolean;
  };
};

const getCheckoutInputSchema = z.object({
  shop_domain: z
    .string()
    .describe("The shop domain to call. This maps to https://{shop-domain}/api/ucp/mcp."),
  id: z.string().describe("The ID of the checkout session to retrieve.")
});

const updateCheckoutInputSchema = z.object({
  shop_domain: z
    .string()
    .describe("The shop domain to call. This maps to https://{shop-domain}/api/ucp/mcp."),
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

function parseTextContent(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function unwrapToolReply(reply: McpToolReply): unknown {
  if (reply.error !== undefined) return { error: reply.error };
  if (reply.result?.structuredContent !== undefined) return reply.result.structuredContent;

  const text = reply.result?.content?.find(
    (item) => item.type === "text" && typeof item.text === "string"
  )?.text;

  return text ? parseTextContent(text) : reply;
}

function compactCheckoutValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(compactCheckoutValue);
  }

  if (!value || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const compacted: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(source)) {
    if (entry === undefined || entry === null) continue;
    compacted[key] = compactCheckoutValue(entry);
  }

  return compacted;
}

function compactCheckoutResult(value: unknown): unknown {
  return compactCheckoutValue(value);
}

function createToolResult(reply: McpToolReply) {
  if (reply.error !== undefined) {
    return {
      content: [{ text: JSON.stringify(reply.error), type: "text" as const }],
      structuredContent: { error: reply.error },
      isError: true
    };
  }

  const compacted = compactCheckoutResult(unwrapToolReply(reply));

  return {
    content: [{ text: JSON.stringify(compacted), type: "text" as const }],
    structuredContent: compacted,
    ...(reply.result?.isError !== undefined ? { isError: reply.result.isError } : {})
  };
}

async function callShopifyCheckoutTool(
  shopDomain: string,
  name: "get_checkout" | "update_checkout",
  args: Record<string, unknown>,
) {
  const response = await fetch(`https://${shopDomain}/api/ucp/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: {
        name,
        arguments: {
          meta: {
            "ucp-agent": {
              profile: UCP_AGENT_PROFILE
            }
          },
          ...args
        }
      }
    })
  });

  const reply = await response.json() as McpToolReply;
  return createToolResult(reply);
}

function createServer() {
  const server = new McpServer({
    name: "Checkout Group MCP",
    version: "1.0.0"
  });

  server.registerTool(
    "get_checkout",
    {
      description: "Retrieve the current state of an existing checkout session. Use this tool to check the status of a checkout, see updated totals after changes, or verify what information is still needed before completion. When to use: Need to refresh checkout state after buyer returns, Want to show current totals and line items, or Checking if checkout is ready for payment.",
      inputSchema: getCheckoutInputSchema
    },
    async ({ shop_domain, id }: z.infer<typeof getCheckoutInputSchema>) => {
      return callShopifyCheckoutTool(shop_domain, "get_checkout", { id });
    }
  );

  server.registerTool(
    "update_checkout",
    {
      description: "Update an existing checkout session with new information. Use this tool to modify line items, update shipping address, change fulfillment method, or add buyer information before completing the checkout. When to use: Buyer wants to change quantity or remove items, Buyer provides or updates shipping address, Need to update buyer email or contact info, or Changing a delivery option. Caution: `update_checkout` uses PUT semantics. Each request replaces the full checkout state with the payload you send. Omit a field (for example `line_items` or `buyer`) and it is removed from the checkout. There is no server-side merge of partial updates. Before sending an update, remove response-only fields from the payload. `checkout.buyer.country_code` isn't accepted as input. `checkout.payment.instruments[].display` is response-only. For fulfillment updates, `checkout.fulfillment.methods[].id` is optional, but `line_item_ids` is required.",
      inputSchema: updateCheckoutInputSchema
    },
    async ({ shop_domain, id, checkout }: z.infer<typeof updateCheckoutInputSchema>) => {
      return callShopifyCheckoutTool(shop_domain, "update_checkout", { id, checkout });
    }
  );

  return server;
}

export default {
  fetch(request, env, ctx) {
    return createMcpHandler(createServer, {
      allowedOriginHostnames: "*",
    })(request, env, ctx);
  },
} satisfies ExportedHandler;
