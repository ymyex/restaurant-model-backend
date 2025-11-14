// In-memory storage for carts and orders
// In a production environment, this would be backed by a database

interface CartItem {
    cartItemId: string;
    itemId: string;
    name: string;
    quantity: number;
    size?: string; // for pizzas and drinks
    toppings?: string[]; // for pizzas
    price: number;
    unitPrice: number;
}

interface Cart {
    sessionId: string;
    items: CartItem[];
    total: number;
    createdAt: Date;
    updatedAt: Date;
}

interface CustomerInfo {
    name: string;
    phone: string;
    address?: string;
    email?: string;
}

interface PaymentMethod {
    type: 'card' | 'cash';
    cardDetails?: {
        last4?: string;
        brand?: string;
    };
}

interface Order {
    orderId: string;
    sessionId: string;
    items: CartItem[];
    customerInfo: CustomerInfo;
    paymentMethod: PaymentMethod;
    total: number;
    status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
    estimatedTime?: number; // in minutes
    createdAt: Date;
    updatedAt: Date;
}

// Storage maps
const carts: Map<string, Cart> = new Map();
const orders: Map<string, Order> = new Map();

// Helper function to generate unique IDs
function generateId(): string {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

// Cart management functions
export const cartStorage = {
    getCart(sessionId: string): Cart | null {
        return carts.get(sessionId) || null;
    },

    createCart(sessionId: string): Cart {
        const cart: Cart = {
            sessionId,
            items: [],
            total: 0,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        carts.set(sessionId, cart);
        return cart;
    },

    updateCart(sessionId: string, cart: Cart): void {
        cart.updatedAt = new Date();
        carts.set(sessionId, cart);
    },

    clearCart(sessionId: string): void {
        carts.delete(sessionId);
    },

    generateCartItemId(): string {
        return generateId();
    }
};

// Order management functions
export const orderStorage = {
    createOrder(orderData: Omit<Order, 'orderId' | 'createdAt' | 'updatedAt'>): Order {
        const orderId = generateId();
        const order: Order = {
            ...orderData,
            orderId,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        orders.set(orderId, order);
        return order;
    },

    getOrder(orderId: string): Order | null {
        return orders.get(orderId) || null;
    },

    updateOrder(orderId: string, updates: Partial<Order>): Order | null {
        const order = orders.get(orderId);
        if (!order) return null;

        const updatedOrder = {
            ...order,
            ...updates,
            updatedAt: new Date()
        };
        orders.set(orderId, updatedOrder);
        return updatedOrder;
    },

    getOrdersBySession(sessionId: string): Order[] {
        return Array.from(orders.values()).filter(order => order.sessionId === sessionId);
    },

    cancelOrder(orderId: string): Order | null {
        const order = orders.get(orderId);
        if (!order) return null;

        if (order.status === 'delivered' || order.status === 'cancelled') {
            return null; // Cannot cancel delivered or already cancelled orders
        }

        return this.updateOrder(orderId, { status: 'cancelled' });
    }
};

export type { CartItem, Cart, CustomerInfo, PaymentMethod, Order };
