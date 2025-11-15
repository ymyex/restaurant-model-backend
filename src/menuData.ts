import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface MenuItem {
    itemId: string;
    name: string;
    description?: string;
    category: string;
    prices?: Record<string, number>;
    price?: number;
}

export interface MenuData {
    pizzas: MenuItem[];
    appetizers: MenuItem[];
    drinks: MenuItem[];
    desserts: MenuItem[];
    toppings: string[];
}

const MENU_CONFIG_DIR = join(__dirname, "../config");
const MENU_CONFIG_PATH = join(MENU_CONFIG_DIR, "menu-data.json");

const DEFAULT_MENU_DATA: MenuData = {
    pizzas: [
        {
            itemId: "pizza_margherita",
            name: "Margherita Pizza",
            description: "Classic pizza with fresh mozzarella, tomato sauce, and fresh basil leaves.",
            prices: { small: 14.99, medium: 18.99, large: 22.99 },
            category: "pizza"
        },
        {
            itemId: "pizza_pepperoni",
            name: "Pepperoni Pizza",
            description: "Traditional pizza topped with pepperoni slices and mozzarella cheese.",
            prices: { small: 16.99, medium: 20.99, large: 24.99 },
            category: "pizza"
        },
        {
            itemId: "pizza_supreme",
            name: "Supreme Pizza",
            description: "Loaded with pepperoni, Italian sausage, mushrooms, bell peppers, and red onions.",
            prices: { small: 19.99, medium: 24.99, large: 29.99 },
            category: "pizza"
        },
        {
            itemId: "pizza_hawaiian",
            name: "Hawaiian Pizza",
            description: "Sweet and savory combination of ham, pineapple, and mozzarella cheese.",
            prices: { small: 17.99, medium: 21.99, large: 25.99 },
            category: "pizza"
        },
        {
            itemId: "pizza_meat_lovers",
            name: "Meat Lovers Pizza",
            description: "Carnivore's delight with pepperoni, Italian sausage, ham, bacon, and ground beef.",
            prices: { small: 21.99, medium: 26.99, large: 31.99 },
            category: "pizza"
        },
        {
            itemId: "pizza_veggie_deluxe",
            name: "Veggie Deluxe Pizza",
            description: "Garden fresh vegetables including mushrooms, bell peppers, onions, tomatoes, and spinach.",
            prices: { small: 18.99, medium: 23.99, large: 28.99 },
            category: "pizza"
        },
        {
            itemId: "pizza_bbq_chicken",
            name: "BBQ Chicken Pizza",
            description: "Grilled chicken with BBQ sauce, red onions, and cilantro on a tangy BBQ base.",
            prices: { small: 19.99, medium: 24.99, large: 29.99 },
            category: "pizza"
        },
        {
            itemId: "pizza_mediterranean",
            name: "Mediterranean Pizza",
            description: "Olive oil base with feta cheese, sun-dried tomatoes, artichoke hearts, and fresh basil.",
            prices: { small: 20.99, medium: 25.99, large: 30.99 },
            category: "pizza"
        }
    ],
    toppings: [
        "Pepperoni", "Italian Sausage", "Mushrooms", "Bell Peppers", "Red Onions",
        "Black Olives", "Extra Cheese", "Fresh Basil", "Tomatoes", "Spinach",
        "Pineapple", "Ham", "Bacon", "Ground Beef", "Jalapeños", "Garlic",
        "Sun-dried Tomatoes", "Artichoke Hearts", "Feta Cheese", "Goat Cheese"
    ],
    appetizers: [
        {
            itemId: "app_garlic_bread",
            name: "Garlic Bread",
            description: "Fresh baked bread with garlic butter and herbs, served with marinara sauce.",
            price: 7.99,
            category: "appetizer"
        },
        {
            itemId: "app_mozzarella_sticks",
            name: "Mozzarella Sticks",
            description: "Golden fried mozzarella cheese sticks served with marinara dipping sauce (8 pieces).",
            price: 9.99,
            category: "appetizer"
        },
        {
            itemId: "app_buffalo_wings",
            name: "Buffalo Wings",
            description: "Crispy chicken wings tossed in spicy buffalo sauce, served with ranch dressing (10 pieces).",
            price: 12.99,
            category: "appetizer"
        },
        {
            itemId: "app_caesar_salad",
            name: "Caesar Salad",
            description: "Fresh romaine lettuce with parmesan cheese, croutons, and creamy caesar dressing.",
            price: 8.99,
            category: "appetizer"
        },
        {
            itemId: "app_antipasto_platter",
            name: "Antipasto Platter",
            description: "Italian cured meats, cheeses, olives, and marinated vegetables with crusty bread.",
            price: 15.99,
            category: "appetizer"
        },
        {
            itemId: "app_spinach_artichoke_dip",
            name: "Spinach Artichoke Dip",
            description: "Creamy hot dip with spinach and artichokes, served with tortilla chips.",
            price: 10.99,
            category: "appetizer"
        },
        {
            itemId: "app_bruschetta",
            name: "Bruschetta",
            description: "Toasted bread topped with fresh tomatoes, basil, garlic, and balsamic glaze (6 pieces).",
            price: 8.99,
            category: "appetizer"
        }
    ],
    drinks: [
        {
            itemId: "drink_coca_cola",
            name: "Coca-Cola",
            prices: { small: 2.99, medium: 3.49, large: 3.99 },
            category: "drink"
        },
        {
            itemId: "drink_sprite",
            name: "Sprite",
            prices: { small: 2.99, medium: 3.49, large: 3.99 },
            category: "drink"
        },
        {
            itemId: "drink_orange_juice",
            name: "Fresh Orange Juice",
            prices: { small: 4.99, medium: 5.99, large: 6.99 },
            category: "drink"
        },
        {
            itemId: "drink_iced_tea",
            name: "Iced Tea",
            prices: { small: 2.79, medium: 3.29, large: 3.79 },
            category: "drink"
        },
        {
            itemId: "drink_lemonade",
            name: "Fresh Lemonade",
            prices: { small: 3.99, medium: 4.49, large: 4.99 },
            category: "drink"
        },
        {
            itemId: "drink_water",
            name: "Bottled Water",
            price: 1.99,
            category: "drink"
        },
        {
            itemId: "drink_coffee",
            name: "Coffee",
            prices: { small: 2.49, medium: 2.99, large: 3.49 },
            category: "drink"
        }
    ],
    desserts: [
        {
            itemId: "dessert_tiramisu",
            name: "Tiramisu",
            description: "Classic Italian dessert with coffee-soaked ladyfingers and mascarpone cream.",
            price: 6.99,
            category: "dessert"
        },
        {
            itemId: "dessert_cannoli",
            name: "Cannoli",
            description: "Crispy pastry shells filled with sweet ricotta cream and chocolate chips (2 pieces).",
            price: 5.99,
            category: "dessert"
        },
        {
            itemId: "dessert_gelato",
            name: "Gelato",
            description: "Authentic Italian gelato available in vanilla, chocolate, or strawberry.",
            prices: { small: 4.99, medium: 6.99, large: 8.99 },
            category: "dessert"
        },
        {
            itemId: "dessert_chocolate_cake",
            name: "Chocolate Cake",
            description: "Rich chocolate layer cake with chocolate ganache frosting.",
            price: 5.99,
            category: "dessert"
        },
        {
            itemId: "dessert_cheesecake",
            name: "New York Cheesecake",
            description: "Creamy cheesecake with graham cracker crust, served with berry compote.",
            price: 6.49,
            category: "dessert"
        },
        {
            itemId: "dessert_panna_cotta",
            name: "Panna Cotta",
            description: "Silky vanilla panna cotta topped with fresh berries.",
            price: 5.49,
            category: "dessert"
        }
    ]
};

function cloneMenuData(data: MenuData): MenuData {
    return JSON.parse(JSON.stringify(data));
}

function ensureDirectoryExists() {
    if (!existsSync(MENU_CONFIG_DIR)) {
        mkdirSync(MENU_CONFIG_DIR, { recursive: true });
    }
}

function loadMenuDataFromFile(): MenuData | null {
    try {
        if (!existsSync(MENU_CONFIG_PATH)) {
            return null;
        }
        const raw = readFileSync(MENU_CONFIG_PATH, "utf-8");
        if (!raw.trim()) return null;
        const parsed = JSON.parse(raw);
        if (isValidMenuData(parsed)) {
            return sanitizeMenuData(parsed);
        }
    } catch (error) {
        console.error("Failed to load custom menu data:", error);
    }
    return null;
}

function persistMenuData(data: MenuData) {
    try {
        ensureDirectoryExists();
        writeFileSync(MENU_CONFIG_PATH, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
        console.error("Failed to persist menu data:", error);
    }
}

function sanitizeMenuItem(item: any, category: string): MenuItem | null {
    if (!item || typeof item !== "object") return null;
    const { itemId, name } = item;
    if (!itemId || !name) return null;
    const sanitized: MenuItem = {
        itemId: String(itemId),
        name: String(name),
        description: item.description ? String(item.description) : undefined,
        category: item.category ? String(item.category) : category.replace(/s$/, ""),
    };
    if (item.prices && typeof item.prices === "object") {
        sanitized.prices = Object.entries(item.prices).reduce<Record<string, number>>((acc, [size, price]) => {
            const numeric = Number(price);
            if (!isNaN(numeric)) acc[String(size)] = numeric;
            return acc;
        }, {});
    }
    if (item.price !== undefined) {
        const numeric = Number(item.price);
        sanitized.price = isNaN(numeric) ? undefined : numeric;
    }
    return sanitized;
}

function sanitizeMenuData(data: Partial<MenuData>): MenuData {
    const categories: Array<keyof MenuData> = ["pizzas", "appetizers", "drinks", "desserts"];
    const sanitized: MenuData = {
        pizzas: [],
        appetizers: [],
        drinks: [],
        desserts: [],
        toppings: Array.isArray(data.toppings) ? data.toppings.filter((t) => typeof t === "string") : [],
    };

    categories.forEach((category) => {
        const fallbackCategoryName =
            category === "pizzas" ? "pizza" : category === "desserts" ? "dessert" : category.slice(0, -1);
        const source = Array.isArray((data as any)[category]) ? (data as any)[category] : [];
        sanitized[category] = source
            .map((item) => sanitizeMenuItem(item, fallbackCategoryName))
            .filter((item): item is MenuItem => !!item);
    });

    return sanitized;
}

export function isValidMenuData(value: any): value is MenuData {
    if (!value || typeof value !== "object") return false;
    const categories = ["pizzas", "appetizers", "drinks", "desserts"];
    if (!Array.isArray((value as any).toppings)) return false;
    return categories.every((category) => Array.isArray((value as any)[category]));
}

let menuData: MenuData = loadMenuDataFromFile() ?? cloneMenuData(DEFAULT_MENU_DATA);

export function getMenuData(): MenuData {
    return cloneMenuData(menuData);
}

export function getDefaultMenuData(): MenuData {
    return cloneMenuData(DEFAULT_MENU_DATA);
}

export function setMenuData(newData: MenuData): MenuData {
    menuData = sanitizeMenuData(newData);
    persistMenuData(menuData);
    return getMenuData();
}

export function resetMenuData(): MenuData {
    menuData = cloneMenuData(DEFAULT_MENU_DATA);
    persistMenuData(menuData);
    return getMenuData();
}

// Helper functions to work with menu data
export const getAllMenuItems = () => {
    const data = getMenuData();
    return [
        ...data.pizzas,
        ...data.appetizers,
        ...data.drinks,
        ...data.desserts
    ];
};

export const getMenuByCategory = (category: string) => {
    const data = getMenuData();
    switch (category.toLowerCase()) {
        case 'pizza':
        case 'pizzas':
            return data.pizzas;
        case 'appetizer':
        case 'appetizers':
            return data.appetizers;
        case 'drink':
        case 'drinks':
            return data.drinks;
        case 'dessert':
        case 'desserts':
            return data.desserts;
        default:
            return [];
    }
};

export const getMenuItemById = (itemId: string) => {
    const allItems = getAllMenuItems();
    return allItems.find(item => item.itemId === itemId) || null;
};

export const searchMenuItems = (query: string) => {
    const allItems = getAllMenuItems();
    const lowercaseQuery = query.toLowerCase();
    return allItems.filter(item =>
        item.name.toLowerCase().includes(lowercaseQuery) ||
        ('description' in item && item.description && item.description.toLowerCase().includes(lowercaseQuery))
    );
};
