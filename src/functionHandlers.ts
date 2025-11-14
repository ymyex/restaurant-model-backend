import { FunctionHandler } from "./types";
import { getAllMenuItems, getMenuByCategory, getMenuItemById } from "./menuData";
import { cartStorage, orderStorage, CartItem, CustomerInfo, PaymentMethod } from "./dataStorage";
import { sendSms } from "./sms";
import { getCallerForSession, getTwilioNumberForSession } from "./callContext";

const functions: FunctionHandler[] = [];

// Current session ID - in a real implementation, this would be passed from the session
let currentSessionId = "default_session";

// Set the session ID for the current session
export function setSessionId(sessionId: string) {
  currentSessionId = sessionId;
}

// Restaurant Menu Functions
functions.push({
  schema: {
    name: "get_menu",
    type: "function",
    description: "Get the restaurant's menu. Can optionally filter by category (pizza, appetizer, drink, dessert)",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Optional category to filter by: pizza, appetizer, drink, or dessert"
        }
      },
      required: [],
    },
  },
  handler: async (args: { category?: string }) => {
    if (args.category) {
      const items = getMenuByCategory(args.category);
      // Return only names for category-specific requests
      const itemNames = items.map(item => ({
        itemId: item.itemId,
        name: item.name
      }));
      return JSON.stringify({ category: args.category, items: itemNames });
    } else {
      // Return only categories with item names, no details
      const pizzaNames = getMenuByCategory('pizza').map(item => ({
        itemId: item.itemId,
        name: item.name
      }));
      const appetizerNames = getMenuByCategory('appetizer').map(item => ({
        itemId: item.itemId,
        name: item.name
      }));
      const drinkNames = getMenuByCategory('drink').map(item => ({
        itemId: item.itemId,
        name: item.name
      }));
      const dessertNames = getMenuByCategory('dessert').map(item => ({
        itemId: item.itemId,
        name: item.name
      }));

      return JSON.stringify({
        categories: {
          pizzas: pizzaNames,
          appetizers: appetizerNames,
          drinks: drinkNames,
          desserts: dessertNames
        },
        message: "Menu overview with item names only. Use get_menu_item() for detailed information about specific items."
      });
    }
  },
});

functions.push({
  schema: {
    name: "get_menu_item",
    type: "function",
    description: "Get detailed information about a specific menu item by its ID",
    parameters: {
      type: "object",
      properties: {
        itemId: {
          type: "string",
          description: "The unique ID of the menu item"
        }
      },
      required: ["itemId"],
    },
  },
  handler: async (args: { itemId: string }) => {
    const item = getMenuItemById(args.itemId);
    if (!item) {
      return JSON.stringify({ error: "Menu item not found", itemId: args.itemId });
    }
    return JSON.stringify(item);
  },
});

// Cart Functions
functions.push({
  schema: {
    name: "add_to_cart",
    type: "function",
    description: "Add one or more items to the customer's cart",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              itemId: {
                type: "string",
                description: "The unique ID of the menu item"
              },
              quantity: {
                type: "number",
                description: "Quantity to add (default: 1)"
              },
              size: {
                type: "string",
                enum: ["small", "medium", "large"],
                description: "Size for pizzas and drinks"
              },
              toppings: {
                type: "array",
                items: {
                  type: "string"
                },
                description: "Additional toppings for pizzas"
              }
            },
            required: ["itemId"]
          },
          description: "Array of items to add to cart"
        }
      },
      required: ["items"],
    },
  },
  handler: async (args: { items: Array<{ itemId: string; quantity?: number; size?: string; toppings?: string[] }> }) => {
    let cart = cartStorage.getCart(currentSessionId);
    if (!cart) {
      cart = cartStorage.createCart(currentSessionId);
    }

    const addedItems: CartItem[] = [];
    const errors: string[] = [];

    // Process each item in the array
    for (const itemRequest of args.items) {
      const menuItem = getMenuItemById(itemRequest.itemId);
      if (!menuItem) {
        errors.push(`Menu item not found: ${itemRequest.itemId}`);
        continue;
      }

      const quantity = itemRequest.quantity || 1;
      const size = itemRequest.size || 'medium';
      const toppings = itemRequest.toppings || [];

      // Calculate price based on size
      let unitPrice: number;
      if ('prices' in menuItem && menuItem.prices && typeof menuItem.prices === 'object') {
        if (size && size in menuItem.prices) {
          unitPrice = (menuItem.prices as any)[size];
        } else {
          // If no size specified or invalid size, use first available price
          const priceKeys = Object.keys(menuItem.prices);
          unitPrice = (menuItem.prices as any)[priceKeys[0]];
        }
      } else if ('price' in menuItem) {
        unitPrice = menuItem.price || 0;
      } else {
        unitPrice = 0;
      }

      const cartItem: CartItem = {
        cartItemId: cartStorage.generateCartItemId(),
        itemId: itemRequest.itemId,
        name: menuItem.name,
        quantity,
        size,
        toppings,
        unitPrice,
        price: unitPrice * quantity
      };

      cart.items.push(cartItem);
      addedItems.push(cartItem);
    }

    // Update cart total
    cart.total = cart.items.reduce((sum, item) => sum + item.price, 0);
    cartStorage.updateCart(currentSessionId, cart);

    const successMessage = addedItems.length === 1
      ? `Added ${addedItems[0].quantity} ${addedItems[0].name}${addedItems[0].size ? ` (${addedItems[0].size})` : ''} to cart`
      : `Added ${addedItems.length} items to cart`;

    return JSON.stringify({
      success: true,
      addedItems,
      errors: errors.length > 0 ? errors : undefined,
      message: successMessage,
      cartTotal: cart.total,
      cartItemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0)
    });
  },
});

functions.push({
  schema: {
    name: "get_cart",
    type: "function",
    description: "Get the current contents of the customer's cart",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  handler: async () => {
    const cart = cartStorage.getCart(currentSessionId);
    if (!cart || cart.items.length === 0) {
      return JSON.stringify({
        empty: true,
        message: "Your cart is empty",
        items: [],
        total: 0
      });
    }

    return JSON.stringify({
      items: cart.items,
      total: cart.total,
      itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0)
    });
  },
});

functions.push({
  schema: {
    name: "update_cart_item",
    type: "function",
    description: "Update the quantity of an item in the cart",
    parameters: {
      type: "object",
      properties: {
        cartItemId: {
          type: "string",
          description: "The unique ID of the cart item to update"
        },
        quantity: {
          type: "number",
          description: "New quantity for the item"
        }
      },
      required: ["cartItemId", "quantity"],
    },
  },
  handler: async (args: { cartItemId: string; quantity: number }) => {
    const cart = cartStorage.getCart(currentSessionId);
    if (!cart) {
      return JSON.stringify({ error: "Cart not found" });
    }

    const itemIndex = cart.items.findIndex(item => item.cartItemId === args.cartItemId);
    if (itemIndex === -1) {
      return JSON.stringify({ error: "Cart item not found" });
    }

    if (args.quantity <= 0) {
      cart.items.splice(itemIndex, 1);
    } else {
      cart.items[itemIndex].quantity = args.quantity;
      cart.items[itemIndex].price = cart.items[itemIndex].unitPrice * args.quantity;
    }

    cart.total = cart.items.reduce((sum, item) => sum + item.price, 0);
    cartStorage.updateCart(currentSessionId, cart);

    return JSON.stringify({
      success: true,
      message: args.quantity <= 0 ? "Item removed from cart" : "Cart item updated",
      cartTotal: cart.total
    });
  },
});

functions.push({
  schema: {
    name: "remove_from_cart",
    type: "function",
    description: "Remove an item from the cart",
    parameters: {
      type: "object",
      properties: {
        cartItemId: {
          type: "string",
          description: "The unique ID of the cart item to remove"
        }
      },
      required: ["cartItemId"],
    },
  },
  handler: async (args: { cartItemId: string }) => {
    const cart = cartStorage.getCart(currentSessionId);
    if (!cart) {
      return JSON.stringify({ error: "Cart not found" });
    }

    const itemIndex = cart.items.findIndex(item => item.cartItemId === args.cartItemId);
    if (itemIndex === -1) {
      return JSON.stringify({ error: "Cart item not found" });
    }

    const removedItem = cart.items[itemIndex];
    cart.items.splice(itemIndex, 1);
    cart.total = cart.items.reduce((sum, item) => sum + item.price, 0);
    cartStorage.updateCart(currentSessionId, cart);

    return JSON.stringify({
      success: true,
      message: `Removed ${removedItem.name} from cart`,
      cartTotal: cart.total
    });
  },
});

// Order Functions
functions.push({
  schema: {
    name: "place_order",
    type: "function",
    description: "Place an order with customer information and payment method",
    parameters: {
      type: "object",
      properties: {
        customerInfo: {
          type: "object",
          description: "Customer information including name, phone, address, and email"
        },
        paymentMethod: {
          type: "object",
          description: "Payment method information (card or cash)"
        }
      },
      required: ["customerInfo", "paymentMethod"],
    },
  },
  handler: async (args: { customerInfo: CustomerInfo; paymentMethod: PaymentMethod }) => {
    const cart = cartStorage.getCart(currentSessionId);
    if (!cart || cart.items.length === 0) {
      return JSON.stringify({ error: "Cannot place order: cart is empty" });
    }

    // Create the order
    const order = orderStorage.createOrder({
      sessionId: currentSessionId,
      items: [...cart.items],
      customerInfo: args.customerInfo,
      paymentMethod: args.paymentMethod,
      total: cart.total,
      status: 'confirmed',
      estimatedTime: 25 + Math.floor(Math.random() * 15) // 25-40 minutes
    });

    // Clear the cart after successful order
    cartStorage.clearCart(currentSessionId);

    // Build and send confirmation SMS
    const smsBody = buildOrderConfirmationSms(
      order.items,
      order.total,
      order.orderId,
      order.estimatedTime,
      order.customerInfo?.name
    );
    console.log("📤 Order SMS body preview →\n" + smsBody);
    let smsSid: string | null = null;
    let smsTo: string | undefined = undefined;
    try {
      // Fallback to caller number if customerInfo.phone not provided
      smsTo = args.customerInfo?.phone || getCallerForSession(currentSessionId);
      const smsFromFallback = getTwilioNumberForSession(currentSessionId);
      if (smsTo) {
        smsSid = await sendSms(smsTo, smsBody, { from: smsFromFallback });
      }
    } catch (err) {
      // Non-fatal: proceed even if SMS fails
    }

    return JSON.stringify({
      success: true,
      orderId: order.orderId,
      message: "Order placed successfully!",
      estimatedTime: order.estimatedTime,
      total: order.total,
      orderDetails: {
        items: order.items,
        customerInfo: order.customerInfo,
        status: order.status
      },
      smsSent: !!smsSid,
      smsSid: smsSid || undefined,
      smsTo: smsTo || undefined
    });
  },
});

functions.push({
  schema: {
    name: "get_order_status",
    type: "function",
    description: "Get the current status of an order",
    parameters: {
      type: "object",
      properties: {
        orderId: {
          type: "string",
          description: "The unique ID of the order to check"
        }
      },
      required: ["orderId"],
    },
  },
  handler: async (args: { orderId: string }) => {
    const order = orderStorage.getOrder(args.orderId);
    if (!order) {
      return JSON.stringify({ error: "Order not found", orderId: args.orderId });
    }

    return JSON.stringify({
      orderId: order.orderId,
      status: order.status,
      estimatedTime: order.estimatedTime,
      total: order.total,
      items: order.items,
      customerInfo: order.customerInfo,
      createdAt: order.createdAt
    });
  },
});

functions.push({
  schema: {
    name: "cancel_order",
    type: "function",
    description: "Cancel an existing order",
    parameters: {
      type: "object",
      properties: {
        orderId: {
          type: "string",
          description: "The unique ID of the order to cancel"
        }
      },
      required: ["orderId"],
    },
  },
  handler: async (args: { orderId: string }) => {
    const cancelledOrder = orderStorage.cancelOrder(args.orderId);
    if (!cancelledOrder) {
      return JSON.stringify({
        error: "Cannot cancel order. Order not found or cannot be cancelled (already delivered/cancelled)",
        orderId: args.orderId
      });
    }

    return JSON.stringify({
      success: true,
      message: "Order cancelled successfully",
      orderId: cancelledOrder.orderId,
      status: cancelledOrder.status
    });
  },
});

export default functions;

const SMS_SHOW_CURRENCY = (process.env.SMS_SHOW_CURRENCY || 'false').toLowerCase() === 'true';
const SMS_CURRENCY_LABEL = process.env.SMS_CURRENCY_LABEL || 'USD';
const SMS_ASCII_ONLY = (process.env.SMS_ASCII_ONLY || 'false').toLowerCase() === 'true';

function buildOrderConfirmationSms(
  items: CartItem[],
  total: number,
  orderId: string,
  estimatedTime?: number,
  customerName?: string
): string {
  const lines: string[] = [];
  lines.push("Simple Pizza 🍕 - Order Confirmed ✅");
  lines.push(`Order #: ${orderId}`);
  if (customerName) lines.push(`For: ${customerName}`);
  lines.push("");
  lines.push("Items:");
  for (const item of items) {
    const size = item.size ? ` (${item.size})` : "";
    const toppings = item.toppings && item.toppings.length > 0 ? ` [${item.toppings.join(", ")}]` : "";
    const lineTotal = (item.unitPrice || 0) * (item.quantity || 0);
    lines.push(`- ${item.quantity} x ${item.name}${size}${toppings} = ${formatAmount(lineTotal)} (${formatAmount(item.unitPrice)} ea)`);
  }
  lines.push("");
  lines.push(`Total: ${formatAmount(total)}`);
  if (estimatedTime) lines.push(`ETA: ~${estimatedTime} mins ⏱️`);
  lines.push("");
  lines.push("Thanks! We're firing up the ovens 🔥");
  const out = lines.join("\n");
  return SMS_ASCII_ONLY ? toAscii(out) : out;
}

function formatAmount(amount: number): string {
  const base = isFinite(amount as number) ? (amount || 0).toFixed(2) : '0.00';
  // Insert spaces between digits to avoid carrier masking of currency values (e.g., in MY carriers)
  const spaced = base.replace(/\d/g, (d) => `${d} `).trim();
  return SMS_SHOW_CURRENCY ? `${spaced} ${SMS_CURRENCY_LABEL}` : spaced;
}

function toAscii(text: string): string {
  return text
    .replace(/[•]/g, '-')
    .replace(/[–—]/g, '-')
    .replace(/[’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\ -\u007F]/g, '');
}
