/**
 * MiMi-Cosmos API 适配层
 * 将 localStorage 操作替换为后端 API 调用
 *
 * 鉴权：iframe URL 自带 ?token=xxx，页面加载时解析后调用 apiSetToken，
 * 之后所有请求自动带 Authorization: Bearer <token>
 */

const API_BASE = window.location.origin;

let _apiToken = "";

function apiSetToken(token) {
    _apiToken = token || "";
    try {
        if (_apiToken) localStorage.setItem("mimi_api_token", _apiToken);
    } catch (e) { /* ignore */ }
}

function apiGetToken() {
    if (_apiToken) return _apiToken;
    try {
        _apiToken = localStorage.getItem("mimi_api_token") || "";
    } catch (e) { /* ignore */ }
    return _apiToken;
}

/** 从当前页面 URL 解析 iframe 注入的登录态 */
function apiParseAuthFromUrl() {
    try {
        const p = new URLSearchParams(window.location.search);
        const token = p.get("token") || "";
        const username = p.get("username") || "";
        const role = p.get("role") || "user";
        if (token) apiSetToken(token);
        return { token, username, role };
    } catch (e) {
        return { token: "", username: "", role: "user" };
    }
}

/* ========== 通用请求 ========== */
function _headers(extra) {
    const h = Object.assign({ "Content-Type": "application/json" }, extra || {});
    const t = apiGetToken();
    if (t) h["Authorization"] = "Bearer " + t;
    return h;
}

async function _handle(res) {
    let body = null;
    try { body = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) {
        const msg = (body && (body.error || body.message)) || `请求失败 (${res.status})`;
        throw new Error(msg);
    }
    return body;
}

async function apiGet(path) {
    const res = await fetch(`${API_BASE}${path}`, { headers: _headers() });
    return _handle(res);
}

async function apiPost(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: _headers(),
        body: JSON.stringify(body || {}),
    });
    return _handle(res);
}

async function apiPut(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: "PUT",
        headers: _headers(),
        body: JSON.stringify(body || {}),
    });
    return _handle(res);
}

async function apiPatch(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: "PATCH",
        headers: _headers(),
        body: JSON.stringify(body || {}),
    });
    return _handle(res);
}

async function apiDelete(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: "DELETE",
        headers: _headers(),
        body: body ? JSON.stringify(body) : undefined,
    });
    return _handle(res);
}

/* ========== 图片上传 ========== */
async function apiUploadImage(file) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        headers: (() => { const h = {}; const t = apiGetToken(); if (t) h["Authorization"] = "Bearer " + t; return h; })(),
        body: formData,
    });
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    return data.url; // 返回图片的公开访问 URL
}

/* ========== 用户相关（保留，兼容旧调用） ========== */
async function apiGetUser(uid) {
    return apiGet(`/api/users/${uid}`);
}

async function apiCreateUser(userData) {
    return apiPost("/api/users", userData);
}

async function apiUpdateUser(uid, userData) {
    return apiPut(`/api/users/${uid}`, userData);
}

/* =========================================================
 * 迷你小作坊（开团平台）API
 * 所有写操作返回 { success, data }，失败抛 Error(message)
 * ========================================================= */

/** 进入页面一次性拉取全部数据（身份/商品/团/团长/申请/分类/轮播/我的想要） */
async function apiWsBootstrap() {
    const r = await apiGet("/api/workshop/state");
    return r.data;
}

/* ---- 商品 ---- */
async function apiGetProducts(filters) {
    const params = new URLSearchParams();
    if (filters && filters.status) params.set("status", filters.status);
    const qs = params.toString();
    const r = await apiGet(`/api/workshop/products${qs ? "?" + qs : ""}`);
    return r.data;
}

async function apiGetProduct(id) {
    const r = await apiGet(`/api/workshop/products/${id}`);
    return r.data;
}

/** 团长提交商品（pending）/ 管理员提交（active），编号由后端分配 */
async function apiCreateProduct(productData) {
    const r = await apiPost("/api/workshop/products", productData);
    return r.data;
}

/** 管理员改状态（active/gray/offline/pending）/编辑商品 */
async function apiUpdateProduct(id, productData) {
    const r = await apiPatch(`/api/workshop/products/${id}`, productData);
    return r.data;
}

async function apiDeleteProduct(id) {
    return apiDelete(`/api/workshop/products/${id}`);
}

/** 切换想要，返回 { wanted, wantCount } */
async function apiToggleWant(productId) {
    const r = await apiPost(`/api/workshop/products/${productId}/want`, {});
    return r.data;
}

/* ---- 团 ---- */
async function apiWsGetGroups() {
    const r = await apiGet("/api/workshop/groups");
    return r.data.groups;
}

/** 管理员建团 { name, leaderUser, startAt(ms), endAt(ms), maxProducts } */
async function apiWsCreateGroup(groupData) {
    const r = await apiPost("/api/workshop/groups", groupData);
    return r.data.group;
}

/** 管理员启用/停用团 */
async function apiWsUpdateGroup(id, patch) {
    const r = await apiPatch(`/api/workshop/groups/${id}`, patch);
    return r.data.group;
}

/* ---- 团长申请 ---- */
async function apiWsGetApplications() {
    const r = await apiGet("/api/workshop/applications");
    return r.data.applications;
}

/** 提交团长申请 { note } */
async function apiApplyLeader(applicationData) {
    return apiPost("/api/workshop/applications", applicationData);
}

/** 管理员审核：approve（自动建档）/ reject */
async function apiWsReviewApplication(id, action, days) {
    return apiPost(`/api/workshop/applications/${id}/review`, { action, days });
}

/* 兼容旧命名 */
async function apiGetLeaderApplications() {
    return apiWsGetApplications();
}
async function apiUpdateLeaderApplication(id, status) {
    return apiWsReviewApplication(id, status === "approved" ? "approve" : "reject");
}

/* ---- 团长管理 ---- */
async function apiWsGetLeaders() {
    const r = await apiGet("/api/workshop/leaders");
    return r.data.leaders;
}

/** 管理员分配/移除团，或取消团长资格 */
async function apiWsLeaderGroupAction(userId, action, groupId) {
    return apiPost(`/api/workshop/leaders/${userId}/groups`, { action, groupId });
}

/** 管理员直接开通团长（演示/测试） */
async function apiWsGrantLeader(userId, days) {
    return apiPost(`/api/workshop/leaders/${userId}`, { days });
}

/* ---- 分类 ---- */
async function apiWsGetCategories() {
    const r = await apiGet("/api/workshop/categories");
    return r.data.categories;
}

async function apiWsCreateCategory(name, subs) {
    const r = await apiPost("/api/workshop/categories", { name, subs });
    return r.data.category;
}

async function apiWsDeleteCategory(id) {
    return apiDelete(`/api/workshop/categories?id=${encodeURIComponent(id)}`);
}

/* ---- 轮播配置 ---- */
async function apiWsGetCarousel() {
    const r = await apiGet("/api/workshop/carousel");
    return r.data.carousel;
}

async function apiWsSaveCarousel(cfg) {
    const r = await apiPut("/api/workshop/carousel", cfg);
    return r.data.carousel;
}
