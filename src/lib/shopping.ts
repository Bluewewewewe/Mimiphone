// ========== 啪多多购物平台 — 核心模块 ==========

export interface ShopProduct {
  id: string;
  name: string;
  price: number;        // 米米币
  stock: number;
  category: ProductCategory;
  imageDesc: string;    // 图片描述（文字描述，可用于AI生图）
  detail: string;       // 一句话简介
  soldCount: number;
  isActive: boolean;    // 是否上架
}

export type ProductCategory = '服装' | '家居' | '数码' | '食品' | '礼物' | '其他';

export interface CartItem {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
}

export interface ShoppingCart {
  userId: string;
  items: CartItem[];
  total: number;
}

export interface ShopMember {
  id: string;
  name: string;
  balance: number;      // 米米币
  isOnline: boolean;
  browsingCategory?: ProductCategory;
  browsingProduct?: string;
  lastAction?: string;
}

export interface BrowseComment {
  time: string;
  memberId: string;
  memberName: string;
  text: string;
}

export interface ShopOrder {
  id: string;
  timestamp: string;
  buyerId: string;
  buyerName: string;
  recipientName: string; // 自用 or 赠送给谁
  productName: string;
  price: number;
  quantity: number;
}

export interface ShopState {
  products: ShopProduct[];
  members: ShopMember[];
  orders: ShopOrder[];
  globalComments: BrowseComment[];
  lastBrowsedAt: number;
}

// ========== 初始商品 ==========
export const INITIAL_PRODUCTS: ShopProduct[] = [
  {
    id: 'p1', name: '彩虹围巾', price: 299, stock: 20,
    category: '服装', imageDesc: '红色围巾带彩虹条纹，模特上身图',
    detail: '情侣款，柔软亲肤，冬天送对象刚好', soldCount: 158, isActive: true,
  },
  {
    id: 'p2', name: '智能养生壶', price: 899, stock: 15,
    category: '家居', imageDesc: '白色智能养生壶，LED触控面板',
    detail: '12小时预约，煮茶煲汤一键搞定', soldCount: 423, isActive: true,
  },
  {
    id: 'p3', name: 'CP情侣卫衣', price: 399, stock: 30,
    category: '服装', imageDesc: '黑白两色卫衣，胸前有心形logo',
    detail: '情侣出街必备，甜蜜暴击！', soldCount: 892, isActive: true,
  },
  {
    id: 'p4', name: '狗粮大礼包', price: 199, stock: 50,
    category: '食品', imageDesc: '辛巴专属狗粮大礼包，金色包装',
    detail: '辛巴最爱！含鸡肉+牛肉双拼，买就送磨牙棒', soldCount: 267, isActive: true,
  },
  {
    id: 'p5', name: '复古拍立得相机', price: 1299, stock: 8,
    category: '数码', imageDesc: '粉色拍立得相机，instax mini风格',
    detail: '记录每一个甜蜜瞬间，自带美颜滤镜', soldCount: 56, isActive: true,
  },
  {
    id: 'p6', name: '手工巧克力礼盒', price: 168, stock: 40,
    category: '礼物', imageDesc: '心形巧克力礼盒，丝绒包装',
    detail: '情人节限定！12颗不同口味，甜到心里', soldCount: 1024, isActive: true,
  },
  {
    id: 'p7', name: '毛绒小熊玩偶', price: 88, stock: 100,
    category: '礼物', imageDesc: '棕色毛绒小熊，肚子上绣着爱心',
    detail: '软萌可爱，抱着睡觉超舒服', soldCount: 567, isActive: true,
  },
  {
    id: 'p8', name: '田雷同款墨镜', price: 599, stock: 12,
    category: '服装', imageDesc: '黑色飞行员墨镜，金属边框',
    detail: '田雷街拍同款！戴上你就是最靓的崽', soldCount: 345, isActive: true,
  },
  {
    id: 'p9', name: '梓渝同款帆布包', price: 129, stock: 25,
    category: '服装', imageDesc: '米白色帆布包，简约印花',
    detail: '梓渝日常最爱背的包，轻便又能装', soldCount: 678, isActive: true,
  },
  {
    id: 'p10', name: '家庭影院投影仪', price: 2999, stock: 5,
    category: '数码', imageDesc: '白色迷你投影仪，带三脚架',
    detail: '周末一起窝在沙发看电影，氛围感拉满', soldCount: 34, isActive: true,
  },
];

// ========== 初始成员 ==========
export const INITIAL_MEMBERS: ShopMember[] = [
  { id: 'user', name: '甜玉米', balance: 5000, isOnline: true },
  { id: 'tianlei', name: '田雷', balance: 8000, isOnline: false, browsingCategory: '服装' },
  { id: 'ziyu', name: '梓渝', balance: 12000, isOnline: false, browsingCategory: '礼物' },
];

// ========== 初始订单 ==========
export const INITIAL_ORDERS: ShopOrder[] = [
  { id: 'o1', timestamp: '10分钟前', buyerId: 'tianlei', buyerName: '田雷', recipientName: '梓渝', productName: '手工巧克力礼盒', price: 168, quantity: 1 },
  { id: 'o2', timestamp: '30分钟前', buyerId: 'ziyu', buyerName: '梓渝', recipientName: '田雷', productName: 'CP情侣卫衣', price: 399, quantity: 1 },
];

// ========== 管理函数 ==========

export function addProduct(products: ShopProduct[], newProduct: Omit<ShopProduct, 'id' | 'soldCount' | 'isActive'>): ShopProduct[] {
  const id = `p${Date.now()}`;
  return [...products, { ...newProduct, id, soldCount: 0, isActive: true }];
}

export function removeProduct(products: ShopProduct[], productId: string): ShopProduct[] {
  return products.map(p => p.id === productId ? { ...p, isActive: false } : p);
}

export function updateProductPrice(products: ShopProduct[], productId: string, newPrice: number): ShopProduct[] {
  return products.map(p => p.id === productId ? { ...p, price: newPrice } : p);
}

export function updateProductStock(products: ShopProduct[], productId: string, newStock: number): ShopProduct[] {
  return products.map(p => p.id === productId ? { ...p, stock: newStock } : p);
}

export function addStock(products: ShopProduct[], productId: string, delta: number): ShopProduct[] {
  return products.map(p => p.id === productId ? { ...p, stock: p.stock + delta } : p);
}

// ========== 购物车 ==========

export function addToCart(cart: CartItem[], product: ShopProduct, quantity: number = 1): CartItem[] {
  const existing = cart.find(item => item.productId === product.id);
  if (existing) {
    return cart.map(item =>
      item.productId === product.id
        ? { ...item, quantity: item.quantity + quantity }
        : item
    );
  }
  return [...cart, { productId: product.id, productName: product.name, price: product.price, quantity }];
}

export function removeFromCart(cart: CartItem[], productId: string): CartItem[] {
  return cart.filter(item => item.productId !== productId);
}

export function clearCart(): CartItem[] {
  return [];
}

export function getCartTotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

// ========== CP自主购物 ==========

const CP_BROWSE_MESSAGES: Record<string, string[]> = {
  tianlei: [
    '这个不错，给老婆看看',
    '梓渝应该会喜欢这个',
    '先加购物车，等发工资',
    '这个颜色适合她',
    '嗯…再看看别的',
    '买！不差这点米米币',
    '甜玉米上次说想要这个来着',
  ],
  ziyu: [
    '田雷穿这个应该好看',
    '好可爱！想要',
    '太贵了，再逛逛',
    '这个可以送给甜玉米',
    '加入购物车！',
    '等田雷发工资再买',
    '这个和家里那个好像',
  ],
};

export function triggerCPAutoShop(products: ShopProduct[], _orders: ShopOrder[]): {
  message: string;
  newOrder?: Omit<ShopOrder, 'id' | 'timestamp'>;
} | null {
  // 60%概率触发
  if (Math.random() > 0.6) return null;

  const cpId = Math.random() < 0.5 ? 'tianlei' : 'ziyu';
  const cpName = cpId === 'tianlei' ? '田雷' : '梓渝';
  const msgs = CP_BROWSE_MESSAGES[cpId];
  const msg = msgs[Math.floor(Math.random() * msgs.length)];

  // 30%概率直接下单
  if (Math.random() < 0.3) {
    const activeProducts = products.filter(p => p.isActive && p.stock > 0);
    const product = activeProducts[Math.floor(Math.random() * activeProducts.length)];
    const recipientName = Math.random() < 0.5
      ? (cpId === 'tianlei' ? '梓渝' : '田雷')
      : '甜玉米';

    return {
      message: `🛒 ${cpName} 下单了「${product.name}」送给 ${recipientName}！`,
      newOrder: {
        buyerId: cpId,
        buyerName: cpName,
        recipientName,
        productName: product.name,
        price: product.price,
        quantity: 1,
      },
    };
  }

  return { message: `💬 ${cpName}：${msg}` };
}

// ========== 一起逛 ==========

const CATEGORY_NAMES: ProductCategory[] = ['服装', '家居', '数码', '食品', '礼物', '其他'];

export function getRandomOnlineMembers(members: ShopMember[]): ShopMember[] {
  // 随机决定谁在线
  return members.map(m => ({
    ...m,
    isOnline: m.id === 'user' ? true : Math.random() > 0.4,
    browsingCategory: m.id === 'user' ? undefined : CATEGORY_NAMES[Math.floor(Math.random() * CATEGORY_NAMES.length)],
  }));
}

export function generateBrowseComments(members: ShopMember[], _products: ShopProduct[]): BrowseComment[] {
  const comments: BrowseComment[] = [];
  const onlineMembers = members.filter(m => m.isOnline && m.id !== 'user');

  const commentTemplates: Record<string, string[]> = {
    tianlei: [
      '这个看起来不错啊',
      '老婆你看这个！',
      '太贵了，但值得',
      '甜玉米上次说想要这个',
      '加购加购！',
      '颜色挺好看的',
      '这个可以放家里',
    ],
    ziyu: [
      '好可爱！',
      '田雷你看这个适合你吗',
      '好贵…算了算了',
      '这个可以给辛巴买',
      '加入购物车！',
      '等下再逛逛别的',
      '这个评价好像不错',
    ],
  };

  for (const member of onlineMembers) {
    const templates = commentTemplates[member.id] || ['看看这个'];
    const text = templates[Math.floor(Math.random() * templates.length)];
    const minsAgo = Math.floor(Math.random() * 5) + 1;
    comments.push({
      time: `${minsAgo}分钟前`,
      memberId: member.id,
      memberName: member.name,
      text,
    });
  }

  return comments;
}

// ========== 热销榜 ==========

export function getHotProducts(products: ShopProduct[], limit: number = 3): ShopProduct[] {
  return products
    .filter(p => p.isActive)
    .sort((a, b) => b.soldCount - a.soldCount)
    .slice(0, limit);
}

// ========== 分类商品 ==========

export function getProductsByCategory(products: ShopProduct[], category: ProductCategory): ShopProduct[] {
  return products.filter(p => p.isActive && p.category === category);
}

// ========== 随机逛 ==========

export function getRandomBrowse(products: ShopProduct[]): { category: ProductCategory; products: ShopProduct[] } {
  const category = CATEGORY_NAMES[Math.floor(Math.random() * CATEGORY_NAMES.length)];
  return { category, products: getProductsByCategory(products, category) };
}
