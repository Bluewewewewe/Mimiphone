'use client';
import { useState, useCallback } from 'react';

// ============ 类型定义 ============
type AdminRole = 'super_admin' | 'review_admin' | 'ops_admin';
type UserStatus = 'pending' | 'reviewing' | 'verified' | 'rejected' | 'banned';

interface AdminUser {
  userId: string;
  nickname: string;
  status: UserStatus;
  weiboNickname?: string;
  weiboLevel?: number;
  creditScore: number;
  registeredAt: string;
  referrerId: string;
  banReason?: string;
  banLevel?: number;
}

interface ReportItem {
  id: string;
  targetType: 'post' | 'reply';
  targetContent: string;
  reportType: string;
  reportCount: number;
  status: 'pending' | 'resolved' | 'dismissed';
  reportedBy: string[];
}

interface AppealItem {
  id: string;
  userId: string;
  userNickname: string;
  originalAction: string;
  appealReason: string;
  submittedAt: string;
  status: 'pending' | 'resolved' | 'dismissed';
}

interface BlacklistItem {
  weiboNickname: string;
  weiboUid?: string;
  reason: string;
  source: 'auto' | 'manual';
  addedAt: string;
}

interface ForumPost {
  id: string;
  title: string;
  author: string;
  section: string;
  replyCount: number;
  viewCount: number;
  createdAt: string;
  status: 'normal' | 'essence' | 'pinned' | 'locked' | 'hidden';
}

// ============ Mock 数据 ============
const MOCK_ADMIN_USERS: AdminUser[] = [
  {
    userId: 'u_001',
    nickname: '小甜玉米',
    status: 'verified',
    weiboNickname: '甜玉米本 Corn',
    weiboLevel: 8,
    creditScore: 100,
    registeredAt: '2026-06-15',
    referrerId: 'admin',
  },
  {
    userId: 'u_002',
    nickname: 'CP 粉头',
    status: 'reviewing',
    weiboNickname: 'CP 粉头子',
    weiboLevel: 6,
    creditScore: 100,
    registeredAt: '2026-07-20',
    referrerId: 'u_001',
  },
  {
    userId: 'u_003',
    nickname: '同人作者',
    status: 'verified',
    weiboNickname: '同人大大',
    weiboLevel: 9,
    creditScore: 95,
    registeredAt: '2026-06-20',
    referrerId: 'u_001',
  },
  {
    userId: 'u_004',
    nickname: '违规用户',
    status: 'banned',
    weiboNickname: '违规小号',
    weiboLevel: 3,
    creditScore: 0,
    registeredAt: '2026-07-01',
    referrerId: 'u_002',
    banReason: '发布违规内容',
    banLevel: 5,
  },
  {
    userId: 'u_005',
    nickname: '新用户 A',
    status: 'pending',
    creditScore: 100,
    registeredAt: '2026-08-01',
    referrerId: 'u_003',
  },
  {
    userId: 'u_006',
    nickname: '新用户 B',
    status: 'reviewing',
    weiboNickname: '微博用户 B',
    weiboLevel: 5,
    creditScore: 100,
    registeredAt: '2026-08-01',
    referrerId: 'u_003',
  },
  {
    userId: 'u_007',
    nickname: '待审用户 C',
    status: 'reviewing',
    weiboNickname: '微博用户 C',
    weiboLevel: 7,
    creditScore: 100,
    registeredAt: '2026-08-01',
    referrerId: 'u_001',
  },
  {
    userId: 'u_008',
    nickname: '待审用户 D',
    status: 'reviewing',
    weiboNickname: '微博用户 D',
    weiboLevel: 4,
    creditScore: 100,
    registeredAt: '2026-08-01',
    referrerId: 'u_002',
  },
];

const MOCK_REPORTS: ReportItem[] = [
  {
    id: 'r_001',
    targetType: 'post',
    targetContent: '这个 CP 太甜了...',
    reportType: '广告 spam',
    reportCount: 3,
    status: 'pending',
    reportedBy: ['u_001', 'u_002', 'u_003'],
  },
  {
    id: 'r_002',
    targetType: 'reply',
    targetContent: '回复内容...',
    reportType: '人身攻击',
    reportCount: 2,
    status: 'pending',
    reportedBy: ['u_001', 'u_002'],
  },
];

const MOCK_APPEALS: AppealItem[] = [
  {
    id: 'a_001',
    userId: 'u_004',
    userNickname: '违规用户',
    originalAction: '永久封禁',
    appealReason: '我是被冤枉的',
    submittedAt: '2026-08-01',
    status: 'pending',
  },
];

const MOCK_BLACKLIST: BlacklistItem[] = [
  {
    weiboNickname: '黑粉一号',
    weiboUid: '1234567890',
    reason: '恶意举报',
    source: 'manual',
    addedAt: '2026-07-15',
  },
  {
    weiboNickname: '违规账号',
    reason: '发布违规内容',
    source: 'auto',
    addedAt: '2026-07-20',
  },
];

const MOCK_POSTS: ForumPost[] = [
  {
    id: 'p_001',
    title: '【公告】社区规则更新',
    author: '管理员',
    section: '公告板',
    replyCount: 12,
    viewCount: 256,
    createdAt: '2026-07-01',
    status: 'pinned',
  },
  {
    id: 'p_002',
    title: '甜玉米 CP 糖点汇总',
    author: '小甜玉米',
    section: 'CP 讨论',
    replyCount: 89,
    viewCount: 1024,
    createdAt: '2026-07-15',
    status: 'essence',
  },
  {
    id: 'p_003',
    title: '同人文：夏日邂逅',
    author: '同人作者',
    section: '同人文',
    replyCount: 45,
    viewCount: 512,
    createdAt: '2026-07-20',
    status: 'normal',
  },
];

// ============ 管理后台组件 ============
interface AdminAppProps {
  onClose: () => void;
  adminRole: AdminRole;
}

export function AdminApp({ onClose, adminRole }: AdminAppProps) {
  const [activeModule, setActiveModule] = useState<string>('dashboard');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // 角色权限
  const canManageUsers = adminRole === 'super_admin' || adminRole === 'ops_admin';
  const canReview = adminRole === 'super_admin' || adminRole === 'review_admin' || adminRole === 'ops_admin';
  const canManagePosts = adminRole === 'super_admin' || adminRole === 'ops_admin';
  const canManageBlacklist = adminRole === 'super_admin' || adminRole === 'ops_admin';
  const canViewAppeals = adminRole === 'super_admin';

  // 模块列表
  const modules = [
    { id: 'dashboard', name: '总览', icon: '📊', show: true },
    { id: 'review', name: '待审队列', icon: '📝', show: canReview },
    { id: 'users', name: '用户管理', icon: '👥', show: canManageUsers },
    { id: 'posts', name: '帖子管理', icon: '', show: canManagePosts },
    { id: 'reports', name: '举报队列', icon: '🚨', show: canReview },
    { id: 'appeals', name: '申诉队列', icon: '⚖️', show: canViewAppeals },
    { id: 'blacklist', name: '微博黑名单', icon: '🚫', show: canManageBlacklist },
    { id: 'announcements', name: '公告管理', icon: '📢', show: canManagePosts },
    { id: 'workbench', name: '工作台', icon: '💼', show: canReview },
    { id: 'forgotPassword', name: '密码重置申请', icon: '🔑', show: true },
    { id: 'logs', name: '操作日志', icon: '📜', show: true },
  ];

  const visibleModules = modules.filter((m) => m.show);

  // 渲染各模块
  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard':
        return <DashboardModule />;
      case 'review':
        return <ReviewModule />;
      case 'users':
        return <UsersModule />;
      case 'posts':
        return <PostsModule />;
      case 'reports':
        return <ReportsModule />;
      case 'appeals':
        return <AppealsModule />;
      case 'blacklist':
        return <BlacklistModule />;
      case 'announcements':
        return <AnnouncementsModule />;
      case 'workbench':
        return <WorkbenchModule />;
      case 'forgotPassword':
        return <ForgotPasswordModule />;
      case 'logs':
        return <LogsModule />;
      default:
        return <DashboardModule />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* 顶部栏 */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          >
            ←
          </button>
          <div>
            <h1 className="text-lg font-bold">管理后台</h1>
            <p className="text-xs opacity-80">
              {adminRole === 'super_admin'
                ? '超级管理员'
                : adminRole === 'review_admin'
                ? '审核管理员'
                : '综合管理员'}
            </p>
          </div>
        </div>
        <div className="text-2xl">⚙️</div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 侧边导航 */}
        <div className="w-20 bg-white border-r border-gray-200 overflow-y-auto">
          {visibleModules.map((module) => (
            <button
              key={module.id}
              onClick={() => setActiveModule(module.id)}
              className={`w-full p-3 flex flex-col items-center gap-1 transition-colors ${
                activeModule === module.id
                  ? 'bg-purple-100 text-purple-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className="text-xl">{module.icon}</span>
              <span className="text-xs">{module.name}</span>
            </button>
          ))}
        </div>

        {/* 主内容 */}
        <div className="flex-1 overflow-y-auto p-4">{renderModule()}</div>
      </div>
    </div>
  );
}

// ============ 各功能模块 ============

// 1. 总览面板
function DashboardModule() {
  const stats = [
    { label: '今日新增', value: '12', icon: '', color: 'bg-blue-100 text-blue-700' },
    { label: '待审核', value: '5', icon: '📝', color: 'bg-orange-100 text-orange-700' },
    { label: '今日发帖', value: '28', icon: '📋', color: 'bg-green-100 text-green-700' },
    { label: '违规拦截', value: '3', icon: '', color: 'bg-red-100 text-red-700' },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">总览</h2>
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat, i) => (
          <div key={i} className={`${stat.color} rounded-2xl p-4`}>
            <div className="text-2xl mb-1">{stat.icon}</div>
            <div className="text-2xl font-bold">{stat.value}</div>
            <div className="text-sm opacity-80">{stat.label}</div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h3 className="font-bold text-gray-800 mb-3">快捷入口</h3>
        <div className="grid grid-cols-3 gap-2">
          <button className="p-3 bg-orange-100 text-orange-700 rounded-xl text-sm font-medium">
            待审核队列
          </button>
          <button className="p-3 bg-red-100 text-red-700 rounded-xl text-sm font-medium">
            举报队列
          </button>
          <button className="p-3 bg-purple-100 text-purple-700 rounded-xl text-sm font-medium">
            申诉队列
          </button>
        </div>
      </div>
    </div>
  );
}

// 2. 待审队列
function ReviewModule() {
  const reviewingUsers = MOCK_ADMIN_USERS.filter((u) => u.status === 'reviewing');

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">待审队列</h2>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {reviewingUsers.map((user) => (
          <div key={user.userId} className="p-4 border-b border-gray-100 last:border-b-0">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-bold text-gray-800">{user.nickname}</div>
                <div className="text-sm text-gray-500">
                  微博：{user.weiboNickname} | 等级：{user.weiboLevel}
                </div>
              </div>
              <div className="text-xs text-orange-600 bg-orange-100 px-2 py-1 rounded-full">
                待审核
              </div>
            </div>
            <div className="flex gap-2">
              <button className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700">
                通过
              </button>
              <button className="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700">
                拒绝
              </button>
              <button className="px-3 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm hover:bg-gray-200">
                宽限
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 3. 用户管理
function UsersModule() {
  const [searchTerm, setSearchTerm] = useState('');
  const filteredUsers = MOCK_ADMIN_USERS.filter(
    (u) =>
      u.nickname.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.weiboNickname?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">用户管理</h2>
      <input
        type="text"
        placeholder="搜索用户..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full px-4 py-3 rounded-xl bg-white border-2 border-gray-200 focus:border-purple-500 focus:outline-none"
      />
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {filteredUsers.map((user) => (
          <div key={user.userId} className="p-4 border-b border-gray-100 last:border-b-0">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-gray-800">{user.nickname}</div>
                <div className="text-sm text-gray-500">
                  微博：{user.weiboNickname || '未绑定'} | 信用：{user.creditScore}
                </div>
              </div>
              <div className="flex gap-2">
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    user.status === 'verified'
                      ? 'bg-green-100 text-green-700'
                      : user.status === 'banned'
                      ? 'bg-red-100 text-red-700'
                      : user.status === 'reviewing'
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {user.status === 'verified'
                    ? '已验证'
                    : user.status === 'banned'
                    ? '已封禁'
                    : user.status === 'reviewing'
                    ? '待审核'
                    : '待验证'}
                </span>
                <button className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm hover:bg-purple-200">
                  详情
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 4. 帖子管理
function PostsModule() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">帖子管理</h2>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {MOCK_POSTS.map((post) => (
          <div key={post.id} className="p-4 border-b border-gray-100 last:border-b-0">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="font-bold text-gray-800 flex items-center gap-2">
                  {post.status === 'pinned' && <span>📌</span>}
                  {post.status === 'essence' && <span>⭐</span>}
                  {post.title}
                </div>
                <div className="text-sm text-gray-500">
                  {post.author} | {post.section} | 回复：{post.replyCount} | 浏览：{post.viewCount}
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-lg text-sm hover:bg-yellow-200">
                {post.status === 'essence' ? '取消加精' : '加精'}
              </button>
              <button className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200">
                {post.status === 'pinned' ? '取消置顶' : '置顶'}
              </button>
              <button className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
                {post.status === 'locked' ? '解锁' : '锁定'}
              </button>
              <button className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200">
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 5. 举报队列
function ReportsModule() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">举报队列</h2>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {MOCK_REPORTS.map((report) => (
          <div key={report.id} className="p-4 border-b border-gray-100 last:border-b-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex-1">
                <div className="text-sm text-gray-800">{report.targetContent}</div>
                <div className="text-xs text-gray-500">
                  类型：{report.reportType} | 举报人数：{report.reportCount}
                </div>
              </div>
              <div className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded-full">
                待处理
              </div>
            </div>
            <div className="flex gap-2">
              <button className="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700">
                确认违规
              </button>
              <button className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">
                驳回
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 6. 申诉队列
function AppealsModule() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">申诉队列</h2>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {MOCK_APPEALS.map((appeal) => (
          <div key={appeal.id} className="p-4 border-b border-gray-100 last:border-b-0">
            <div className="mb-2">
              <div className="font-bold text-gray-800">{appeal.userNickname}</div>
              <div className="text-sm text-gray-500">原操作：{appeal.originalAction}</div>
              <div className="text-sm text-gray-700 mt-1">申诉理由：{appeal.appealReason}</div>
            </div>
            <div className="flex gap-2">
              <button className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">
                维持原判
              </button>
              <button className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700">
                撤销封禁
              </button>
              <button className="flex-1 py-2 bg-yellow-600 text-white rounded-xl text-sm font-medium hover:bg-yellow-700">
                降级处理
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 7. 微博黑名单
function BlacklistModule() {
  const [newNickname, setNewNickname] = useState('');
  const [newReason, setNewReason] = useState('');

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">微博黑名单</h2>
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h3 className="font-bold text-gray-800 mb-3">手动添加</h3>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="微博昵称（必填）"
            value={newNickname}
            onChange={(e) => setNewNickname(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 focus:outline-none"
          />
          <input
            type="text"
            placeholder="封禁原因"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 focus:outline-none"
          />
          <button className="w-full py-2 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700">
            添加到黑名单
          </button>
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {MOCK_BLACKLIST.map((item, i) => (
          <div key={i} className="p-4 border-b border-gray-100 last:border-b-0">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-gray-800">{item.weiboNickname}</div>
                <div className="text-sm text-gray-500">
                  UID：{item.weiboUid || '未填写'} | 原因：{item.reason}
                </div>
              </div>
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  item.source === 'manual'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {item.source === 'manual' ? '手动' : '自动'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 8. 公告管理
function AnnouncementsModule() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">公告管理</h2>
      <button className="w-full py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700">
        + 发布新公告
      </button>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <div className="font-bold text-gray-800">【公告】社区规则更新</div>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
              已发布
            </span>
          </div>
          <div className="text-sm text-gray-500">发布于 2026-07-01 | 浏览 256</div>
          <div className="flex gap-2 mt-2">
            <button className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200">
              编辑
            </button>
            <button className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200">
              下架
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 9. 管理员工作台
function WorkbenchModule() {
  const reviewers = [
    { name: '管理员 A', total: 156, month: 45, week: 12 },
    { name: '管理员 B', total: 128, month: 38, week: 10 },
    { name: '管理员 C', total: 98, month: 28, week: 8 },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">管理员工作台</h2>
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h3 className="font-bold text-gray-800 mb-3">审核员排行榜（总审核量）</h3>
        {reviewers.map((r, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 flex items-center justify-center rounded-full bg-purple-100 text-purple-700 text-sm font-bold">
                {i + 1}
              </span>
              <span className="font-medium text-gray-800">{r.name}</span>
            </div>
            <span className="font-bold text-purple-700">{r.total}</span>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h3 className="font-bold text-gray-800 mb-3">超时回收监控</h3>
        <div className="text-sm text-gray-600">
          当前无超时未审核任务
        </div>
      </div>
    </div>
  );
}

// 10. 操作日志
function LogsModule() {
  const logs = [
    { action: '通过审核', target: '用户 CP 粉头', time: '2026-08-01 14:30', operator: '管理员 A' },
    { action: '封禁用户', target: '用户 违规用户', time: '2026-08-01 12:15', operator: '管理员 B' },
    { action: '删除帖子', target: '帖子 广告内容', time: '2026-08-01 10:00', operator: '管理员 A' },
    { action: '加精帖子', target: '帖子 甜玉米 CP 糖点', time: '2026-07-31 16:45', operator: '管理员 C' },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">操作日志</h2>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        {logs.map((log, i) => (
          <div key={i} className="p-4 border-b border-gray-100 last:border-b-0">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-gray-800">{log.action}</div>
                <div className="text-sm text-gray-500">目标：{log.target}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-700">{log.operator}</div>
                <div className="text-xs text-gray-500">{log.time}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 11. 密码重置申请
function ForgotPasswordModule() {
  const [requests, setRequests] = useState<Array<{ id: string; username: string; weiboNickname: string; weiboLink: string; status: "pending" | "processed"; createdAt: string }>>([]);

  const markAsProcessed = (id: string) => {
    setRequests(requests.map(r => r.id === id ? { ...r, status: "processed" as const } : r));
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">密码重置申请</h2>
      {requests.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-gray-500">
          暂无密码重置申请
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {requests.map((req) => (
            <div key={req.id} className="p-4 border-b border-gray-100 last:border-b-0">
              <div className="flex items-center justify-between mb-2">
                <div className="font-bold text-gray-800">{req.username}</div>
                <span className={`text-xs px-2 py-1 rounded-full ${req.status === "pending" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
                  {req.status === "pending" ? "待处理" : "已处理"}
                </span>
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                <div>微博昵称：{req.weiboNickname}</div>
                <div>微博链接：{req.weiboLink}</div>
                <div className="text-xs text-gray-400">申请时间：{req.createdAt}</div>
              </div>
              {req.status === "pending" && (
                <button
                  onClick={() => markAsProcessed(req.id)}
                  className="mt-2 px-3 py-1 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                >
                  标记为已处理
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

