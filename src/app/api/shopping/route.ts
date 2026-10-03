import { NextRequest, NextResponse } from 'next/server';
import {
  INITIAL_PRODUCTS, INITIAL_MEMBERS, INITIAL_ORDERS,
  addProduct, removeProduct, updateProductPrice, addStock, updateProductStock,
  addToCart, removeFromCart,  getCartTotal,
  triggerCPAutoShop, getRandomOnlineMembers, generateBrowseComments,
  getHotProducts, getProductsByCategory, getRandomBrowse,
  type ProductCategory, type CartItem, type ShopProduct, type ShopOrder, type ShopMember, type BrowseComment,
} from '@/lib/shopping';

// 内存存储（生产环境应使用数据库）
let products: ShopProduct[] = [...INITIAL_PRODUCTS];
let members: ShopMember[] = [...INITIAL_MEMBERS];
let orders: ShopOrder[] = [...INITIAL_ORDERS];
let carts: Record<string, CartItem[]> = {};
let browseComments: BrowseComment[] = [];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') || 'list';

  try {
    switch (action) {
      case 'list':
        return NextResponse.json({ success: true, data: { products: products.filter(p => p.isActive), total: products.filter(p => p.isActive).length } });

      case 'all':
        return NextResponse.json({ success: true, data: { products, total: products.length } });

      case 'category': {
        const cat = searchParams.get('cat') as ProductCategory | null;
        if (!cat) return NextResponse.json({ success: false, error: '请指定分类' }, { status: 400 });
        return NextResponse.json({ success: true, data: getProductsByCategory(products, cat) });
      }

      case 'cart': {
        const userId = searchParams.get('userId') || 'user';
        const cart = carts[userId] || [];
        return NextResponse.json({ success: true, data: { items: cart, total: getCartTotal(cart) } });
      }

      case 'members':
        return NextResponse.json({ success: true, data: members });

      case 'orders':
        return NextResponse.json({ success: true, data: orders });

      case 'hot':
        return NextResponse.json({ success: true, data: getHotProducts(products) });

      case 'together': {
        const onlineMembers = getRandomOnlineMembers(members);
        const comments = generateBrowseComments(onlineMembers, products);
        browseComments = comments;
        return NextResponse.json({ success: true, data: { members: onlineMembers, comments } });
      }

      case 'random':
        return NextResponse.json({ success: true, data: getRandomBrowse(products) });

      case 'comments':
        return NextResponse.json({ success: true, data: browseComments });

      case 'stats': {
        const totalProducts = products.filter(p => p.isActive).length;
        const totalOrders = orders.length;
        const todayOrders = orders.filter(o => {
                    return o.timestamp.includes('今天') || o.timestamp.includes('分钟前') || o.timestamp.includes('小时前');
        }).length;
        const totalRevenue = orders.reduce((sum, o) => sum + o.price * o.quantity, 0);
        return NextResponse.json({ success: true, data: { totalProducts, totalOrders, todayOrders, totalRevenue } });
      }

      default:
        return NextResponse.json({ success: false, error: `未知操作: ${action}` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, ...data } = body;

    switch (action) {
      // 管理员：上架
      case 'add': {
        const { name, price, stock, category, imageDesc, detail } = data;
        if (!name || !price || !stock || !category) {
          return NextResponse.json({ success: false, error: '请提供完整信息：名称/价格/库存/分类' }, { status: 400 });
        }
        products = addProduct(products, { name, price, stock, category, imageDesc: imageDesc || '', detail: detail || '' });
        return NextResponse.json({ success: true, message: `✅ 已上架「${name}」`, data: products[products.length - 1] });
      }

      // 管理员：下架
      case 'remove': {
        const { productId } = data;
        products = removeProduct(products, productId);
        return NextResponse.json({ success: true, message: '已下架' });
      }

      // 管理员：改价
      case 'price': {
        const { productId, price } = data;
        products = updateProductPrice(products, productId, price);
        return NextResponse.json({ success: true, message: `已改价为 ${price} 米米币` });
      }

      // 管理员：补货
      case 'restock': {
        const { productId, delta } = data;
        products = addStock(products, productId, delta || 1);
        const p = products.find(p => p.id === productId);
        return NextResponse.json({ success: true, message: `已补货，当前库存: ${p?.stock || 0}` });
      }

      // 管理员：改库存
      case 'stock': {
        const { productId, stock } = data;
        products = updateProductStock(products, productId, stock);
        return NextResponse.json({ success: true, message: `库存已更新为 ${stock}` });
      }

      // 加入购物车
      case 'addToCart': {
        const { productId, userId = 'user', quantity = 1 } = data;
        const product = products.find(p => p.id === productId && p.isActive);
        if (!product) return NextResponse.json({ success: false, error: '商品不存在' }, { status: 404 });
        if (product.stock < quantity) return NextResponse.json({ success: false, error: `库存不足，仅剩 ${product.stock} 件` }, { status: 400 });

        carts[userId] = addToCart(carts[userId] || [], product, quantity);
        return NextResponse.json({ success: true, message: `✅ 已加入购物车：${product.name} ×${quantity}`, data: carts[userId] });
      }

      // 移出购物车
      case 'removeFromCart': {
        const { productId, userId = 'user' } = data;
        carts[userId] = removeFromCart(carts[userId] || [], productId);
        return NextResponse.json({ success: true, message: '已移除', data: carts[userId] || [] });
      }

      // 结算
      case 'checkout': {
        const { userId = 'user', memberId = 'user' } = data;
        const cart = carts[userId] || [];
        if (cart.length === 0) return NextResponse.json({ success: false, error: '购物车为空' }, { status: 400 });

        const total = getCartTotal(cart);
        const member = members.find(m => m.id === memberId);
        if (!member) return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 });
        if (member.balance < total) return NextResponse.json({ success: false, error: `余额不足！需要 ${total} 米米币，当前余额 ${member.balance}` }, { status: 400 });

        // 扣款
        members = members.map(m => m.id === memberId ? { ...m, balance: m.balance - total } : m);

        // 减库存
        for (const item of cart) {
          products = products.map(p => p.id === item.productId ? { ...p, stock: p.stock - item.quantity, soldCount: p.soldCount + item.quantity } : p);
        }

        // 生成订单
        const newOrders: ShopOrder[] = cart.map(item => ({
          id: `o${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: '刚刚',
          buyerId: memberId,
          buyerName: member.name,
          recipientName: member.name,
          productName: item.productName,
          price: item.price,
          quantity: item.quantity,
        }));
        orders = [...newOrders, ...orders];

        // 清空购物车
        carts[userId] = [];

        return NextResponse.json({ success: true, message: `✅ 结算成功！共 ${total} 米米币`, data: { orders: newOrders, balance: member.balance - total } });
      }

      // 直接购买
      case 'buy': {
        const { productId,  memberId = 'user', recipientName, quantity = 1 } = data;
        const product = products.find(p => p.id === productId && p.isActive);
        if (!product) return NextResponse.json({ success: false, error: '商品不存在' }, { status: 404 });
        if (product.stock < quantity) return NextResponse.json({ success: false, error: '库存不足' }, { status: 400 });

        const total = product.price * quantity;
        const member = members.find(m => m.id === memberId);
        if (!member) return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 });
        if (member.balance < total) return NextResponse.json({ success: false, error: `余额不足！需要 ${total} 米米币` }, { status: 400 });

        members = members.map(m => m.id === memberId ? { ...m, balance: m.balance - total } : m);
        products = products.map(p => p.id === productId ? { ...p, stock: p.stock - quantity, soldCount: p.soldCount + quantity } : p);

        const newOrder: ShopOrder = {
          id: `o${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: '刚刚',
          buyerId: memberId,
          buyerName: member.name,
          recipientName: recipientName || member.name,
          productName: product.name,
          price: product.price,
          quantity,
        };
        orders = [newOrder, ...orders];

        return NextResponse.json({ success: true, message: `✅ 购买成功！${product.name} ×${quantity}，共 ${total} 米米币`, data: { order: newOrder, balance: member.balance - total } });
      }

      // 充值
      case 'recharge': {
        const { memberId, amount } = data;
        if (!memberId || !amount) return NextResponse.json({ success: false, error: '请提供成员ID和金额' }, { status: 400 });
        members = members.map(m => m.id === memberId ? { ...m, balance: m.balance + amount } : m);
        const m = members.find(m => m.id === memberId);
        return NextResponse.json({ success: true, message: `✅ 已充值 ${amount} 米米币给 ${m?.name}，当前余额: ${m?.balance}` });
      }

      // CP自主购物触发
      case 'cpShop': {
        const result = triggerCPAutoShop(products, orders);
        if (!result) return NextResponse.json({ success: true, message: null, data: null });

        if (result.newOrder) {
          const { newOrder } = result;
          const product = products.find(p => p.name === newOrder.productName);
          if (product) {
            products = products.map(p => p.id === product.id ? { ...p, stock: Math.max(0, p.stock - 1), soldCount: p.soldCount + 1 } : p);
          }
          const order: ShopOrder = {
            id: `o${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            timestamp: '刚刚',
            ...newOrder,
          };
          orders = [order, ...orders];
        }

        return NextResponse.json({ success: true, message: result.message, data: result.newOrder || null });
      }

      // 清空购物车
      case 'clearCart': {
        const { userId = 'user' } = data;
        carts[userId] = [];
        return NextResponse.json({ success: true, message: '购物车已清空' });
      }

      // 重置（开发用）
      case 'reset': {
        products = [...INITIAL_PRODUCTS];
        members = [...INITIAL_MEMBERS];
        orders = [...INITIAL_ORDERS];
        carts = {};
        browseComments = [];
        return NextResponse.json({ success: true, message: '已重置为初始状态' });
      }

      default:
        return NextResponse.json({ success: false, error: `未知操作: ${action}` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
