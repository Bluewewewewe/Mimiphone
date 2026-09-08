"use client";

import React, { useEffect, useMemo, useState } from "react";
import { StoreAppItem, AppStatus, StoreAppBetaCode, APP_STATUS_LABEL, APP_STATUS_COLOR } from "@/lib/apps";
import {
    AppManagerRecord,
    AppAdminStats,
    computeAppStats,
    moveItem,
} from "@/lib/app-admin";

interface AppAdminAppProps {
    loginUsername: string;
    onClose: () => void;
}

interface AdminListData {
    apps: StoreAppItem[];
    beta_codes: StoreAppBetaCode[];
    managers: AppManagerRecord[];
    can_manage_all: boolean;
    role: string;
}

interface AdminUserHit {
    id: string;
    username: string;
    nickname: string | null;
    role: string;
}

function authHeaders(): Record<string, string> {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("auth_token") : "";
    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

async function apiGet(action: string, params: Record<string, string> = {}) {
    const qs = new URLSearchParams({ action, ...params }).toString();
    const res = await fetch(`/api/apps?${qs}`, { headers: authHeaders() });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || `请求失败 (${res.status})`);
    return json.data;
}

async function apiPost(action: string, body: Record<string, unknown> = {}) {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("auth_token") : "";
    const res = await fetch("/api/apps", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ action, token, ...body }),
    });
    const json = await res.json();
    if (!json.success) {
        const err = new Error(json.error || "操作失败") as Error & { denied?: string[] };
        if (json.denied_app_ids) err.denied = json.denied_app_ids;
        throw err;
    }
    return json.data;
}

export default function AppAdminApp({ loginUsername, onClose }: AppAdminAppProps) {
    const [data, setData] = useState<AdminListData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [tab, setTab] = useState<"apps" | "beta" | "managers">("apps");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [editingApp, setEditingApp] = useState<StoreAppItem | null>(null);
    const [creating, setCreating] = useState(false);

    const isBig = !!data?.can_manage_all;

    async function loadAll() {
        setLoading(true);
        setError("");
        try {
            const d = await apiGet("manage_list");
            setData(d as AdminListData);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "加载失败");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadAll();
    }, []);

    const apps = data?.apps || [];
    const betaCodes = data?.beta_codes || [];
    const managers = data?.managers || [];
    const stats: AppAdminStats = useMemo(() => computeAppStats(apps, betaCodes), [apps, betaCodes]);

    const betaCodeByApp = useMemo(() => {
        const map = new Map<string, StoreAppBetaCode>();
        for (const c of betaCodes) map.set(c.app_id, c);
        return map;
    }, [betaCodes]);

    const managersByApp = useMemo(() => {
        const map = new Map<string, AppManagerRecord[]>();
        for (const m of managers) {
            const list = map.get(m.app_id) || [];
            list.push(m);
            map.set(m.app_id, list);
        }
        return map;
    }, [managers]);

    function toggleSelect(appId: string) {
        setSelected((prev: Set<string>) => {
            const next = new Set(prev);
            if (next.has(appId)) next.delete(appId);
            else next.add(appId);
            return next;
        });
    }

    function toggleSelectAll() {
        if (selected.size === apps.length) setSelected(new Set());
        else setSelected(new Set(apps.map((a: StoreAppItem) => a.app_id)));
    }

    async function handleQuickStatus(app: StoreAppItem, status: AppStatus) {
        setError("");
        try {
            await apiPost("update_app", { app: { id: app.id, status } });
            await loadAll();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "操作失败");
        }
    }

    async function handleMove(index: number, direction: -1 | 1) {
        if (!isBig) return;
        const moved = moveItem<StoreAppItem>(apps, index, direction);
        // 乐观更新顺序
        setData((prev: AdminListData | null) => (prev ? { ...prev, apps: moved } : prev));
        try {
            await apiPost("reorder_apps", { order: moved.map((a: StoreAppItem) => a.app_id) });
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "排序失败");
            await loadAll();
        }
    }

    async function handleBatchStatus(status: AppStatus) {
        if (selected.size === 0) return;
        setError("");
        try {
            await apiPost("batch_update_status", { app_ids: Array.from(selected), status });
            setSelected(new Set());
            await loadAll();
        } catch (e: unknown) {
            const err = e as Error & { denied?: string[] };
            if (err.denied) {
                setError(`部分应用无权操作：${err.denied.join("、")}`);
            } else {
                setError(err.message || "批量操作失败");
            }
            await loadAll();
        }
    }

    async function handleBatchDelete() {
        if (selected.size === 0) return;
        if (!window.confirm(`确定删除选中的 ${selected.size} 个应用吗？此操作不可撤销！`)) return;
        setError("");
        try {
            await apiPost("batch_delete_apps", { app_ids: Array.from(selected) });
            setSelected(new Set());
            await loadAll();
        } catch (e: unknown) {
            const err = e as Error & { denied?: string[] };
            setError(err.denied ? `无权删除：${err.denied.join("、")}` : err.message || "删除失败");
        }
    }

    async function handleDeleteApp(app: StoreAppItem) {
        if (!window.confirm(`确定删除应用「${app.name}」吗？此操作不可撤销。`)) return;
        setError("");
        try {
            await apiPost("delete_app", { id: app.id });
            await loadAll();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "删除失败");
        }
    }

    const tabs: { key: "apps" | "beta" | "managers"; label: string; visible: boolean }[] = [
        { key: "apps", label: "应用列表", visible: true },
        { key: "beta", label: "内测码", visible: true },
        { key: "managers", label: "管理员", visible: isBig && data?.role === "super_admin" },
    ];

    return (
        <div style={s.root}>
            <div style={s.header}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>应用管理</span>
                    <span style={{ fontSize: 11, color: "#4a7c50", marginTop: 2 }}>
                        {loginUsername} · {isBig ? "大管理（全部应用）" : "小管理（被分配应用）"}
                    </span>
                </div>
                <button onClick={onClose} style={s.closeBtn}>×</button>
            </div>

            <StatsBar stats={stats} />

            <div style={{ display: "flex", padding: "8px 16px", gap: 8 }}>
                {tabs.filter((t) => t.visible).map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        style={{
                            flex: 1, padding: "8px", borderRadius: 12, border: "none",
                            background: tab === t.key ? "#2e7d32" : "rgba(255,255,255,0.6)",
                            color: tab === t.key ? "#fff" : "#2e5c33",
                            fontSize: 13, fontWeight: 600, cursor: "pointer",
                        }}
                    >{t.label}</button>
                ))}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 24px" }}>
                {loading && <div style={{ textAlign: "center", padding: 40, color: "#4a7c50" }}>加载中...</div>}
                {error && <div style={{ ...s.errorBox, margin: "8px 0" }}>{error}</div>}

                {!loading && tab === "apps" && (
                    <>
                        {isBig && (
                            <button
                                onClick={() => setCreating(true)}
                                style={s.createBtn}
                            >+ 新增应用</button>
                        )}

                        {apps.length > 0 && (
                            <div style={s.batchBar}>
                                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                                    <input
                                        type="checkbox"
                                        checked={selected.size === apps.length && apps.length > 0}
                                        onChange={toggleSelectAll}
                                    />
                                    全选 {selected.size > 0 ? `(${selected.size})` : ""}
                                </label>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                    <button disabled={selected.size === 0} onClick={() => handleBatchStatus("published")} style={s.batchBtn}>批量上架</button>
                                    <button disabled={selected.size === 0} onClick={() => handleBatchStatus("hidden")} style={s.batchBtn}>批量下架</button>
                                    {isBig && (
                                        <button disabled={selected.size === 0} onClick={handleBatchDelete} style={{ ...s.batchBtn, ...s.batchDanger }}>批量删除</button>
                                    )}
                                </div>
                            </div>
                        )}

                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {apps.map((app: StoreAppItem, idx: number) => {
                                const code = betaCodeByApp.get(app.app_id);
                                return (
                                    <div key={app.id} style={s.appCard}>
                                        <input
                                            type="checkbox"
                                            checked={selected.has(app.app_id)}
                                            onChange={() => toggleSelect(app.app_id)}
                                            style={{ alignSelf: "flex-start", marginTop: 12 }}
                                        />
                                        <div style={{ fontSize: 34 }}>{app.icon}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 14, fontWeight: 600, display: "flex", gap: 6, alignItems: "center" }}>
                                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{app.name}</span>
                                                {isBig && managersByApp.get(app.app_id)?.length ? (
                                                    <span style={s.miniBadge}>👤 {managersByApp.get(app.app_id)!.map((m: AppManagerRecord) => m.username).join(",")}</span>
                                                ) : null}
                                            </div>
                                            <div style={{ fontSize: 11, color: "#4a7c50", marginTop: 2 }}>
                                                {app.developer} · {app.category} · v{app.version}
                                            </div>
                                            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                                                <span style={{
                                                    display: "inline-block", padding: "2px 8px", borderRadius: 10,
                                                    background: `${APP_STATUS_COLOR[app.status]}20`, color: APP_STATUS_COLOR[app.status], fontSize: 10, fontWeight: 600,
                                                }}>{APP_STATUS_LABEL[app.status]}</span>
                                                {code && (
                                                    <span style={{ fontSize: 10, color: "#92400e" }}>
                                                        内测码 {code.used_count}/{code.max_uses}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                                            {isBig && (
                                                <div style={{ display: "flex", gap: 2 }}>
                                                    <button onClick={() => handleMove(idx, -1)} disabled={idx === 0} style={s.arrowBtn}>↑</button>
                                                    <button onClick={() => handleMove(idx, 1)} disabled={idx === apps.length - 1} style={s.arrowBtn}>↓</button>
                                                </div>
                                            )}
                                            <div style={{ display: "flex", gap: 4 }}>
                                                <button onClick={() => setEditingApp(app)} style={s.smallBtnPrimary}>编辑</button>
                                                {isBig && <button onClick={() => handleDeleteApp(app)} style={s.smallBtnDanger}>删除</button>}
                                            </div>
                                            <select
                                                value={app.status}
                                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleQuickStatus(app, e.target.value as AppStatus)}
                                                style={s.statusSelect}
                                            >
                                                {(["hidden", "dev", "beta", "published"] as AppStatus[]).map((st) => (
                                                    <option key={st} value={st}>{APP_STATUS_LABEL[st]}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                );
                            })}
                            {apps.length === 0 && !loading && (
                                <div style={{ textAlign: "center", padding: 30, color: "#4a7c50" }}>暂无可见应用</div>
                            )}
                        </div>
                    </>
                )}

                {!loading && tab === "beta" && (
                    <BetaTab
                        apps={apps}
                        betaCodeByApp={betaCodeByApp}
                        onChanged={loadAll}
                        onError={setError}
                    />
                )}

                {!loading && tab === "managers" && isBig && data?.role === "super_admin" && (
                    <ManagersTab
                        apps={apps}
                        managersByApp={managersByApp}
                        onChanged={loadAll}
                        onError={setError}
                    />
                )}
            </div>

            {(editingApp || creating) && (
                <AppEditModal
                    app={editingApp}
                    canManageAll={isBig}
                    onClose={() => { setEditingApp(null); setCreating(false); }}
                    onSaved={async () => {
                        setEditingApp(null);
                        setCreating(false);
                        await loadAll();
                    }}
                    defaultDeveloper={loginUsername}
                    defaultOrder={apps.length}
                />
            )}
        </div>
    );
}

// ===================== 统计条 =====================

function StatsBar({ stats }: { stats: AppAdminStats }) {
    const items: { label: string; value: number | string; color: string }[] = [
        { label: "总数", value: stats.total, color: "#2e7d32" },
        { label: "已上架", value: stats.published, color: APP_STATUS_COLOR.published },
        { label: "内测", value: stats.beta, color: APP_STATUS_COLOR.beta },
        { label: "开发", value: stats.dev, color: APP_STATUS_COLOR.dev },
        { label: "隐藏", value: stats.hidden, color: APP_STATUS_COLOR.hidden },
        { label: "内测名额", value: `${stats.betaUsed}/${stats.betaMax}`, color: "#92400e" },
    ];
    return (
        <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6,
            padding: "8px 16px 2px",
        }}>
            {items.map((it) => (
                <div key={it.label} style={{
                    background: "rgba(255,255,255,0.6)", borderRadius: 12, padding: "8px 4px",
                    textAlign: "center", border: "1px solid rgba(255,255,255,0.5)",
                }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: it.color }}>{it.value}</div>
                    <div style={{ fontSize: 10, color: "#4a7c50", marginTop: 1 }}>{it.label}</div>
                </div>
            ))}
        </div>
    );
}

// ===================== 内测码 Tab =====================

function BetaTab({
    apps, betaCodeByApp, onChanged, onError,
}: {
    apps: StoreAppItem[];
    betaCodeByApp: Map<string, StoreAppBetaCode>;
    onChanged: () => Promise<void>;
    onError: (msg: string) => void;
}) {
    // 小管理只能看到自己的 app（manage_list 已按权限过滤）
    const manageable = apps;
    const [selectedAppId, setSelectedAppId] = useState<string>(manageable[0]?.app_id || "");
    const [code, setCode] = useState("");
    const [maxUses, setMaxUses] = useState(10);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!selectedAppId && manageable[0]) setSelectedAppId(manageable[0].app_id);
    }, [manageable, selectedAppId]);

    const current = selectedAppId ? betaCodeByApp.get(selectedAppId) : undefined;

    async function saveCode() {
        if (!selectedAppId || !code.trim()) {
            onError("请选择应用并输入内测码");
            return;
        }
        setSaving(true);
        try {
            await apiPost("set_beta_code", { app_id: selectedAppId, code: code.trim(), max_uses: maxUses });
            setCode("");
            await onChanged();
        } catch (e: unknown) {
            onError(e instanceof Error ? e.message : "保存失败");
        } finally {
            setSaving(false);
        }
    }

    async function clearCode() {
        if (!selectedAppId) return;
        if (!window.confirm("确定清除该应用的内测码吗？")) return;
        try {
            await apiPost("delete_beta_code", { app_id: selectedAppId });
            await onChanged();
        } catch (e: unknown) {
            onError(e instanceof Error ? e.message : "清除失败");
        }
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <select value={selectedAppId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedAppId(e.target.value)} style={s.input}>
                {manageable.map((a) => (
                    <option key={a.app_id} value={a.app_id}>{a.icon} {a.name}（{APP_STATUS_LABEL[a.status]}）</option>
                ))}
                {manageable.length === 0 && <option value="">暂无可管理应用</option>}
            </select>

            {selectedAppId && (
                <>
                    {current ? (
                        <div style={{
                            background: "rgba(245,158,11,0.1)", borderRadius: 12, padding: 12,
                            border: "1px solid rgba(245,158,11,0.3)",
                        }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#92400e" }}>当前内测码：{current.code}</div>
                            <div style={{ fontSize: 12, color: "#78350f", marginTop: 4 }}>
                                已用名额：{current.used_count} / {current.max_uses}
                                （剩余 {Math.max(0, current.max_uses - current.used_count)}）
                            </div>
                        </div>
                    ) : (
                        <div style={{ fontSize: 12, color: "#4a7c50", background: "rgba(255,255,255,0.5)", borderRadius: 12, padding: 10 }}>
                            该应用尚未设置内测码
                        </div>
                    )}

                    <div style={{ fontSize: 12, fontWeight: 600, color: "#2e5c33" }}>
                        {current ? "修改内测码（保存后已用次数清零）" : "设置内测码"}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <input
                            value={code}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCode(e.target.value)}
                            placeholder={current ? "输入新内测码" : "如：BETA2024"}
                            style={{ ...s.input, flex: 1 }}
                        />
                        <input
                            type="number"
                            min={1}
                            value={maxUses}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMaxUses(Number(e.target.value) || 1)}
                            style={{ ...s.input, width: 76 }}
                            title="总名额"
                        />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={saveCode} disabled={saving} style={{ ...s.btnPrimary, flex: 1 }}>
                            {saving ? "保存中..." : current ? "保存修改" : "生成内测码"}
                        </button>
                        {current && (
                            <button onClick={clearCode} style={{ ...s.btnDanger, flex: 1 }}>清除内测码</button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

// ===================== 管理员 Tab（仅 super_admin） =====================

function ManagersTab({
    apps, managersByApp, onChanged, onError,
}: {
    apps: StoreAppItem[];
    managersByApp: Map<string, AppManagerRecord[]>;
    onChanged: () => Promise<void>;
    onError: (msg: string) => void;
}) {
    const [selectedAppId, setSelectedAppId] = useState<string>(apps[0]?.app_id || "");
    const [query, setQuery] = useState("");
    const [hits, setHits] = useState<AdminUserHit[]>([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (!selectedAppId && apps[0]) setSelectedAppId(apps[0].app_id);
    }, [apps, selectedAppId]);

    async function searchUsers() {
        setSearching(true);
        onError("");
        try {
            const data = await apiPost("search_admins", { q: query.trim() });
            setHits(data as AdminUserHit[]);
        } catch (e: unknown) {
            onError(e instanceof Error ? e.message : "搜索失败");
        } finally {
            setSearching(false);
        }
    }

    async function assign(username: string) {
        if (!selectedAppId) return;
        try {
            await apiPost("add_app_manager", { app_id: selectedAppId, username });
            await onChanged();
        } catch (e: unknown) {
            onError(e instanceof Error ? e.message : "分配失败");
        }
    }

    async function remove(manager: AppManagerRecord) {
        if (!window.confirm(`确定移除管理员「${manager.username}」吗？`)) return;
        try {
            await apiPost("remove_app_manager", { app_id: manager.app_id, user_id: manager.user_id });
            await onChanged();
        } catch (e: unknown) {
            onError(e instanceof Error ? e.message : "移除失败");
        }
    }

    const currentManagers = selectedAppId ? managersByApp.get(selectedAppId) || [] : [];
    const assignedIds = new Set(currentManagers.map((m) => m.user_id));

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <select value={selectedAppId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedAppId(e.target.value)} style={s.input}>
                {apps.map((a) => (
                    <option key={a.app_id} value={a.app_id}>{a.icon} {a.name}</option>
                ))}
            </select>

            <div style={{ fontSize: 13, fontWeight: 700, color: "#2e5c33" }}>当前应用管理员（小管理）</div>
            {currentManagers.length === 0 && (
                <div style={{ fontSize: 12, color: "#4a7c50", background: "rgba(255,255,255,0.5)", borderRadius: 12, padding: 10 }}>
                    暂未分配，仅有大管理可管理该应用
                </div>
            )}
            {currentManagers.map((m) => (
                <div key={m.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: "rgba(255,255,255,0.65)", borderRadius: 12, padding: "10px 12px",
                }}>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{m.username}</div>
                        <div style={{ fontSize: 10, color: "#6b7280" }}>分配于 {new Date(m.created_at).toLocaleDateString("zh-CN")}</div>
                    </div>
                    <button onClick={() => remove(m)} style={s.smallBtnDanger}>移除</button>
                </div>
            ))}

            <div style={{ fontSize: 13, fontWeight: 700, color: "#2e5c33", marginTop: 6 }}>添加管理员</div>
            <div style={{ fontSize: 11, color: "#4a7c50" }}>按用户名搜索管理员账号（仅 admin 角色可被分配；超管默认拥有全部权限）</div>
            <div style={{ display: "flex", gap: 8 }}>
                <input
                    value={query}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") searchUsers(); }}
                    placeholder="输入用户名搜索"
                    style={{ ...s.input, flex: 1 }}
                />
                <button onClick={searchUsers} disabled={searching} style={{ ...s.btnPrimary, width: 72 }}>
                    {searching ? "..." : "搜索"}
                </button>
            </div>
            {hits.map((u: AdminUserHit) => (
                <div key={u.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: "rgba(255,255,255,0.65)", borderRadius: 12, padding: "10px 12px",
                }}>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                            {u.username}
                            {u.nickname ? <span style={{ color: "#6b7280", fontWeight: 400 }}>（{u.nickname}）</span> : null}
                        </div>
                        <div style={{ fontSize: 10, color: "#6b7280" }}>{u.role === "super_admin" ? "超级管理员" : "管理员"}</div>
                    </div>
                    {u.role === "super_admin" ? (
                        <span style={{ fontSize: 11, color: "#6b7280" }}>默认全权限</span>
                    ) : assignedIds.has(u.id) ? (
                        <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>已分配</span>
                    ) : (
                        <button onClick={() => assign(u.username)} style={s.smallBtnPrimary}>分配</button>
                    )}
                </div>
            ))}
        </div>
    );
}

// ===================== 编辑弹窗 =====================

interface AppEditModalProps {
    app: StoreAppItem | null;
    canManageAll: boolean;
    defaultDeveloper: string;
    defaultOrder: number;
    onClose: () => void;
    onSaved: () => Promise<void>;
}

function AppEditModal({ app, canManageAll, defaultDeveloper, defaultOrder, onClose, onSaved }: AppEditModalProps) {
    const isNew = !app;
    const [form, setForm] = useState<StoreAppItem>(() => app || {
        id: "",
        app_id: `app_${Date.now()}`,
        name: "",
        icon: "📦",
        developer: defaultDeveloper,
        category: "工具",
        description: "",
        features: [],
        screenshots: [],
        version: "1.0.0",
        status: "dev",
        updated_at: new Date().toISOString(),
        expected_release: null,
        beta_info: "",
        beta_wipe: false,
        beta_slots: 0,
        beta_used_slots: 0,
        route: "",
        order: defaultOrder,
        is_external: false,
    });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState("");

    function update<K extends keyof StoreAppItem>(key: K, value: StoreAppItem[K]) {
        setForm((prev: StoreAppItem) => ({ ...prev, [key]: value }));
    }

    async function handleSave() {
        if (!form.name.trim()) { setFormError("请填写应用名称"); return; }
        if (isNew && !form.app_id.trim()) { setFormError("请填写应用ID"); return; }
        if (!form.route.trim()) { setFormError("请填写路由/打开标识"); return; }
        setSaving(true);
        setFormError("");
        try {
            if (isNew) {
                await apiPost("create_app", { app: form });
            } else {
                await apiPost("update_app", { app: form });
            }
            await onSaved();
        } catch (e: unknown) {
            setFormError(e instanceof Error ? e.message : "保存失败");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div style={s.modalOverlay} onClick={onClose}>
            <div onClick={(e: React.MouseEvent) => e.stopPropagation()} style={s.modalSheet}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 17, fontWeight: 700 }}>{isNew ? "新增应用" : "编辑应用"}</span>
                    <button onClick={onClose} style={s.closeBtn}>×</button>
                </div>

                {formError && <div style={s.errorBox}>{formError}</div>}

                <Field label="应用ID（唯一标识）">
                    <input
                        value={form.app_id}
                        disabled={!isNew}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => update("app_id", e.target.value)}
                        style={{ ...s.input, opacity: isNew ? 1 : 0.6 }}
                    />
                </Field>
                <Field label="应用名称">
                    <input value={form.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update("name", e.target.value)} style={s.input} />
                </Field>
                <Field label="图标（emoji 或 URL）">
                    <input value={form.icon} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update("icon", e.target.value)} style={s.input} />
                </Field>
                <Field label="开发者">
                    <input value={form.developer} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update("developer", e.target.value)} style={s.input} />
                </Field>
                <Field label="分类">
                    <input value={form.category} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update("category", e.target.value)} style={s.input} />
                </Field>
                <Field label="版本号">
                    <input value={form.version} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update("version", e.target.value)} style={s.input} />
                </Field>
                <Field label="状态">
                    <select value={form.status} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => update("status", e.target.value as AppStatus)} style={s.input}>
                        {(["hidden", "dev", "beta", "published"] as AppStatus[]).map((st) => (
                            <option key={st} value={st}>{APP_STATUS_LABEL[st]}</option>
                        ))}
                    </select>
                </Field>
                <Field label="路由/打开标识">
                    <input value={form.route} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update("route", e.target.value)} style={s.input} />
                </Field>
                {canManageAll && (
                    <Field label="排序权重">
                        <input
                            type="number"
                            value={form.order}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update("order", parseInt(e.target.value || "0", 10))}
                            style={s.input}
                        />
                    </Field>
                )}
                <Field label="介绍">
                    <textarea value={form.description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update("description", e.target.value)} rows={3} style={{ ...s.input, resize: "none" }} />
                </Field>
                <Field label="功能特点（每行一个）">
                    <textarea
                        value={form.features.join("\n")}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update("features", e.target.value.split("\n").map((x: string) => x.trim()).filter(Boolean))}
                        rows={3}
                        style={{ ...s.input, resize: "none" }}
                    />
                </Field>
                {canManageAll && (
                    <Field label="截图 URL（每行一个，可空）">
                        <textarea
                            value={form.screenshots.join("\n")}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update("screenshots", e.target.value.split("\n").map((x: string) => x.trim()).filter(Boolean))}
                            rows={2}
                            style={{ ...s.input, resize: "none" }}
                        />
                    </Field>
                )}
                <Field label="内测说明">
                    <input value={form.beta_info} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update("beta_info", e.target.value)} style={s.input} />
                </Field>
                <Field label="内测名额">
                    <input
                        type="number"
                        value={form.beta_slots}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => update("beta_slots", parseInt(e.target.value || "0", 10))}
                        style={s.input}
                    />
                </Field>
                <Field label="是否删档">
                    <select value={form.beta_wipe ? "yes" : "no"} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => update("beta_wipe", e.target.value === "yes")} style={s.input}>
                        <option value="no">否</option>
                        <option value="yes">是</option>
                    </select>
                </Field>
                <Field label="预计上线时间">
                    <input
                        type="datetime-local"
                        value={form.expected_release ? new Date(form.expected_release).toISOString().slice(0, 16) : ""}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => update("expected_release", e.target.value ? new Date(e.target.value).toISOString() : null)}
                        style={s.input}
                    />
                </Field>
                {canManageAll && (
                    <Field label="是否外部链接应用">
                        <select value={form.is_external ? "yes" : "no"} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => update("is_external", e.target.value === "yes")} style={s.input}>
                            <option value="no">否</option>
                            <option value="yes">是</option>
                        </select>
                    </Field>
                )}

                <button onClick={handleSave} disabled={saving} style={{ ...s.btnPrimary, marginTop: 8 }}>
                    {saving ? "保存中..." : "保存"}
                </button>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <div style={{ fontSize: 12, color: "#4a7c50", marginBottom: 4 }}>{label}</div>
            {children}
        </div>
    );
}

// ===================== 样式 =====================

const s: Record<string, React.CSSProperties> = {
    root: {
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(180deg, #e8f5e9 0%, #c8e6c9 100%)",
        color: "#2e5c33",
        overflow: "hidden",
    },
    header: {
        padding: "14px 16px",
        background: "rgba(255,255,255,0.5)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
    },
    closeBtn: {
        width: 28, height: 28, borderRadius: "50%", border: "none",
        background: "rgba(255,255,255,0.7)", color: "#2e5c33", fontSize: 16, cursor: "pointer",
        flexShrink: 0,
    },
    errorBox: {
        background: "rgba(239,68,68,0.1)", color: "#ef4444",
        borderRadius: 10, padding: "8px 12px", fontSize: 12,
    },
    createBtn: {
        width: "100%", padding: "12px", borderRadius: 14,
        border: "1px dashed #2e7d32", background: "rgba(46,125,50,0.08)",
        color: "#2e7d32", fontSize: 15, fontWeight: 600, margin: "12px 0", cursor: "pointer",
    },
    batchBar: {
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 8, marginBottom: 10, flexWrap: "wrap",
    },
    batchBtn: {
        padding: "5px 10px", borderRadius: 10, border: "none",
        background: "rgba(46,125,50,0.15)", color: "#2e7d32",
        fontSize: 11, fontWeight: 600, cursor: "pointer",
    },
    batchDanger: {
        background: "rgba(239,68,68,0.12)", color: "#ef4444",
    },
    appCard: {
        background: "rgba(255,255,255,0.65)",
        backdropFilter: "blur(20px)",
        borderRadius: 16,
        padding: 12,
        display: "flex",
        alignItems: "center",
        gap: 10,
        border: "1px solid rgba(255,255,255,0.5)",
    },
    miniBadge: {
        fontSize: 10,
        background: "rgba(46,125,50,0.12)",
        color: "#2e7d32",
        borderRadius: 8,
        padding: "1px 6px",
        fontWeight: 500,
    },
    arrowBtn: {
        width: 24, height: 24, borderRadius: 8, border: "1px solid rgba(46,92,51,0.2)",
        background: "rgba(255,255,255,0.7)", color: "#2e5c33", fontSize: 12, cursor: "pointer",
        lineHeight: 1, padding: 0,
    },
    smallBtnPrimary: {
        padding: "4px 10px", borderRadius: 8, border: "none",
        background: "#2e7d32", color: "#fff", fontSize: 11, cursor: "pointer",
    },
    smallBtnDanger: {
        padding: "4px 10px", borderRadius: 8, border: "none",
        background: "#ef4444", color: "#fff", fontSize: 11, cursor: "pointer",
    },
    statusSelect: {
        fontSize: 10,
        padding: "2px 4px",
        borderRadius: 8,
        border: "1px solid rgba(46,92,51,0.2)",
        background: "rgba(255,255,255,0.8)",
        color: "#2e5c33",
    },
    input: {
        width: "100%",
        padding: "9px 12px",
        borderRadius: 12,
        border: "1px solid rgba(46,92,51,0.2)",
        background: "rgba(255,255,255,0.8)",
        fontSize: 13,
        color: "#2e5c33",
        boxSizing: "border-box" as const,
    },
    btnPrimary: {
        padding: "11px", borderRadius: 14, border: "none",
        background: "#2e7d32", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
    },
    btnDanger: {
        padding: "11px", borderRadius: 14, border: "none",
        background: "#ef4444", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
    },
    modalOverlay: {
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.25)",
        backdropFilter: "blur(4px)",
        zIndex: 100,
        display: "flex",
        alignItems: "flex-end",
    },
    modalSheet: {
        width: "100%",
        maxHeight: "92%",
        background: "rgba(255,255,255,0.96)",
        backdropFilter: "blur(28px)",
        borderRadius: "24px 24px 0 0",
        padding: 20,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column" as const,
        gap: 10,
        boxSizing: "border-box" as const,
    },
};
