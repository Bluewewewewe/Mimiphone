"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StoreAppItem, AppStatus, APP_STATUS_LABEL, APP_STATUS_COLOR } from "@/lib/apps";

interface AppStoreAppProps {
    loginUsername: string;
    isAdmin: boolean;
    installedAppIds: string[];
    onOpenApp: (appId: string) => void;
    onInstall: (app: StoreAppItem) => void;
    onClose: () => void;
}

const INSTALLED_KEY = "mimi_installed_apps";
const BETA_VERIFIED_KEY = "mimi_beta_verified_apps";
const STATUS_OPTIONS: { value: AppStatus; label: string }[] = [
    { value: "published", label: "已上架" },
    { value: "beta", label: "内测中" },
    { value: "dev", label: "开发中" },
    { value: "hidden", label: "隐藏" },
];

export default function AppStoreApp({ loginUsername, isAdmin, installedAppIds, onOpenApp, onInstall, onClose }: AppStoreAppProps) {
    const [apps, setApps] = useState<StoreAppItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selectedApp, setSelectedApp] = useState<StoreAppItem | null>(null);
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState<string>("全部");
    const [hasAppManage, setHasAppManage] = useState(false);
    const [showAdminPanel, setShowAdminPanel] = useState(false);

    const installedApps = useMemo(() => new Set(installedAppIds), [installedAppIds]);

    const [betaVerifiedApps, setBetaVerifiedApps] = useState<Set<string>>(() => {
        try {
            const raw = localStorage.getItem(BETA_VERIFIED_KEY);
            return new Set(raw ? JSON.parse(raw) : []);
        } catch {
            return new Set<string>();
        }
    });

    useEffect(() => {
        loadApps();
        checkPermissions();
    }, []);

    async function checkPermissions() {
        try {
            const token = localStorage.getItem("auth_token");
            if (!token) return;
            const res = await fetch("/api/admin/permissions?action=get_my_permissions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ action: "get_my_permissions" }),
            });
            const json = await res.json();
            if (json.success && json.data?.permissions) {
                setHasAppManage(json.data.permissions.includes("app_manage"));
            }
        } catch {
            // Permission check failure is non-critical
        }
    }

    async function loadApps() {
        setLoading(true);
        setError("");
        try {
            const token = localStorage.getItem("auth_token");
            const res = await fetch(`/api/apps?action=list`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            const json = await res.json();
            if (json.success) {
                setApps(json.data || []);
            } else {
                setError(json.error || "加载失败");
            }
        } catch {
            setError("网络错误");
        } finally {
            setLoading(false);
        }
    }

    const categories = useMemo(() => {
        const set = new Set(apps.map((a) => a.category));
        return ["全部", ...Array.from(set)];
    }, [apps]);

    const filteredApps = useMemo(() => {
        return apps.filter((app) => {
            const matchSearch = app.name.toLowerCase().includes(search.toLowerCase()) ||
                app.description.toLowerCase().includes(search.toLowerCase());
            const matchCategory = category === "全部" || app.category === category;
            return matchSearch && matchCategory;
        });
    }, [apps, search, category]);

    function isInstalled(appId: string) {
        return installedApps.has(appId);
    }

    function isBetaVerified(appId: string) {
        return betaVerifiedApps.has(appId);
    }

    const installStoreApp = useCallback((app: StoreAppItem) => {
        onInstall(app);
    }, [onInstall]);

    async function apiAction(action: string, extra: Record<string, unknown> = {}) {
        const token = localStorage.getItem("auth_token");
        const res = await fetch("/api/apps", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token || ""}`,
            },
            body: JSON.stringify({ action, token, ...extra }),
        });
        const json = await res.json();
        if (!json.success) {
            throw new Error(json.error || "操作失败");
        }
        return json.data;
    }

    return (
        <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            background: "linear-gradient(180deg, #e8f5e9 0%, #c8e6c9 100%)",
            color: "#2e5c33",
            overflow: "hidden"
        }}>
            {/* Header */}
            <div style={{
                padding: "14px 16px 10px",
                background: "rgba(255,255,255,0.5)",
                backdropFilter: "blur(20px)",
                borderBottom: "1px solid rgba(255,255,255,0.5)"
            }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>应用商店</span>
                    <div style={{ display: "flex", gap: 6 }}>
                        {hasAppManage && (
                            <button
                                onClick={() => setShowAdminPanel(!showAdminPanel)}
                                style={{
                                    padding: "4px 10px",
                                    borderRadius: 14,
                                    border: "1px solid rgba(46,92,51,0.2)",
                                    background: showAdminPanel ? "#2e7d32" : "rgba(255,255,255,0.7)",
                                    color: showAdminPanel ? "#fff" : "#2e5c33",
                                    fontSize: 11,
                                    cursor: "pointer",
                                    fontWeight: 600,
                                }}
                            >
                                {showAdminPanel ? "返回浏览" : "管理面板"}
                            </button>
                        )}
                        <button onClick={onClose} style={{
                            width: 28, height: 28, borderRadius: "50%", border: "none",
                            background: "rgba(255,255,255,0.7)", color: "#2e5c33", fontSize: 16, cursor: "pointer"
                        }}>×</button>
                    </div>
                </div>
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="搜索应用"
                    style={{
                        width: "100%", padding: "8px 12px", borderRadius: 10,
                        border: "1px solid rgba(46,92,51,0.15)", background: "rgba(255,255,255,0.8)",
                        fontSize: 14, color: "#2e5c33", boxSizing: "border-box",
                    }}
                />
            </div>

            {/* Category tabs */}
            <div style={{ display: "flex", gap: 8, padding: "10px 16px", overflowX: "auto" }}>
                {categories.map((cat) => (
                    <button key={cat} onClick={() => setCategory(cat)} style={{
                        padding: "5px 12px", borderRadius: 16, border: "none",
                        background: category === cat ? "#2e7d32" : "rgba(255,255,255,0.6)",
                        color: category === cat ? "#fff" : "#2e5c33", fontSize: 12,
                        whiteSpace: "nowrap", cursor: "pointer",
                    }}>{cat}</button>
                ))}
            </div>

            {/* Main content */}
            {showAdminPanel && hasAppManage ? (
                <AdminPanel
                    apps={apps}
                    onRefresh={loadApps}
                    apiAction={apiAction}
                    onEditApp={(app) => { setSelectedApp(null); setShowAdminPanel(true); }}
                />
            ) : (
                <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 20px" }}>
                    {loading && <div style={{ textAlign: "center", padding: 40, color: "#4a7c50" }}>加载中...</div>}
                    {error && <div style={{ textAlign: "center", padding: 20, color: "#ef4444" }}>{error}</div>}
                    {!loading && !error && filteredApps.length === 0 && (
                        <div style={{ textAlign: "center", padding: 40, color: "#4a7c50" }}>暂无应用</div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
                        {filteredApps.map((app) => {
                            const installed = isInstalled(app.app_id);
                            const statusLabel = APP_STATUS_LABEL[app.status];
                            const statusColor = APP_STATUS_COLOR[app.status];
                            return (
                                <div
                                    key={app.id}
                                    onClick={() => setSelectedApp(app)}
                                    style={{
                                        background: "rgba(255,255,255,0.65)", backdropFilter: "blur(20px)",
                                        borderRadius: 18, padding: 14, display: "flex", flexDirection: "column",
                                        alignItems: "center", gap: 8, cursor: "pointer",
                                        border: "1px solid rgba(255,255,255,0.5)",
                                        boxShadow: "0 2px 10px rgba(46,92,51,0.06)"
                                    }}
                                >
                                    <div style={{ position: "relative" }}>
                                        <div style={{ fontSize: 42 }}>{app.icon}</div>
                                        {installed && (
                                            <div style={{
                                                position: "absolute", bottom: -2, right: -2,
                                                width: 14, height: 14, borderRadius: "50%",
                                                background: "#22c55e", border: "2px solid #fff"
                                            }} />
                                        )}
                                    </div>
                                    <div style={{ fontSize: 13, fontWeight: 600, textAlign: "center" }}>{app.name}</div>
                                    <div style={{
                                        fontSize: 10, padding: "2px 8px", borderRadius: 10,
                                        background: `${statusColor}20`, color: statusColor
                                    }}>{statusLabel}</div>
                                    {hasAppManage && (
                                        <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setSelectedApp(app); }}
                                                style={{
                                                    padding: "2px 8px", borderRadius: 8, border: "none",
                                                    background: "rgba(46,125,50,0.15)", color: "#2e7d32",
                                                    fontSize: 10, cursor: "pointer",
                                                }}
                                            >编辑</button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* App detail modal */}
            {selectedApp && (
                <AppDetailModal
                    app={selectedApp}
                    isAdmin={isAdmin}
                    hasAppManage={hasAppManage}
                    installed={isInstalled(selectedApp.app_id)}
                    betaVerified={isBetaVerified(selectedApp.app_id)}
                    onClose={() => setSelectedApp(null)}
                    onInstall={() => installStoreApp(selectedApp)}
                    onOpen={() => onOpenApp(selectedApp.route || selectedApp.app_id)}
                    onUpdate={() => { loadApps(); setSelectedApp(null); }}
                    apiAction={apiAction}
                    onVerify={(verifiedAppId) => {
                        const next = new Set(betaVerifiedApps);
                        next.add(verifiedAppId);
                        setBetaVerifiedApps(next);
                        localStorage.setItem(BETA_VERIFIED_KEY, JSON.stringify(Array.from(next)));
                    }}
                />
            )}
        </div>
    );
}

// ============ Admin Panel ============
interface AdminPanelProps {
    apps: StoreAppItem[];
    onRefresh: () => void;
    apiAction: (action: string, extra?: Record<string, unknown>) => Promise<unknown>;
    onEditApp: (app: StoreAppItem) => void;
}

function AdminPanel({ apps, onRefresh, apiAction }: AdminPanelProps) {
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingApp, setEditingApp] = useState<StoreAppItem | null>(null);
    const [betaCodeApp, setBetaCodeApp] = useState<StoreAppItem | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<StoreAppItem | null>(null);
    const [confirmStatusChange, setConfirmStatusChange] = useState<{app: StoreAppItem; newStatus: AppStatus} | null>(null);
    const [actionError, setActionError] = useState("");

    const s: Record<string, React.CSSProperties> = {
        panel: {
            flex: 1, overflowY: "auto", padding: "0 16px 20px",
        },
        sectionTitle: {
            fontSize: 15, fontWeight: 700, color: "#2e5c33",
            margin: "12px 0 8px", display: "flex", alignItems: "center", justifyContent: "space-between",
        },
        badge: {
            background: "rgba(46,125,50,0.12)", color: "#2e7d32",
            padding: "2px 8px", borderRadius: 10, fontSize: 11,
        },
        btnPrimary: {
            padding: "8px 16px", borderRadius: 12, border: "none",
            background: "#2e7d32", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
        },
        btnDanger: {
            padding: "4px 10px", borderRadius: 8, border: "none",
            background: "rgba(239,68,68,0.12)", color: "#ef4444", fontSize: 11, cursor: "pointer",
        },
        btnSecondary: {
            padding: "4px 10px", borderRadius: 8, border: "none",
            background: "rgba(46,125,50,0.12)", color: "#2e7d32", fontSize: 11, cursor: "pointer",
        },
        appRow: {
            display: "flex", alignItems: "center", gap: 10,
            background: "rgba(255,255,255,0.65)", borderRadius: 14,
            padding: "10px 12px", marginBottom: 8,
            border: "1px solid rgba(255,255,255,0.5)",
        },
        error: {
            color: "#ef4444", fontSize: 12, textAlign: "center" as const, padding: 8,
        },
    };

    async function handleQuickStatusChange(app: StoreAppItem, newStatus: AppStatus) {
        setActionError("");
        try {
            await apiAction("update_app", { app: { id: app.id, status: newStatus } });
            onRefresh();
        } catch (e: unknown) {
            setActionError(e instanceof Error ? e.message : String(e));
        }
    }

    async function handleDelete() {
        if (!confirmDelete) return;
        setActionError("");
        try {
            await apiAction("delete_app", { id: confirmDelete.id });
            setConfirmDelete(null);
            onRefresh();
        } catch (e: unknown) {
            setActionError(e instanceof Error ? e.message : String(e));
        }
    }

    return (
        <div style={s.panel}>
            <div style={s.sectionTitle}>
                <span>📋 应用列表 ({apps.length})</span>
                <button style={s.btnPrimary} onClick={() => { setShowCreateForm(true); setEditingApp(null); }}>
                    + 新建应用
                </button>
            </div>

            {actionError && <div style={s.error}>{actionError}</div>}

            {apps.map((app) => {
                const statusColor = APP_STATUS_COLOR[app.status];
                return (
                    <div key={app.id} style={s.appRow}>
                        <div style={{ fontSize: 28 }}>{app.icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#2e5c33", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {app.name}
                            </div>
                            <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 2 }}>
                                <span style={{
                                    fontSize: 10, padding: "1px 6px", borderRadius: 8,
                                    background: `${statusColor}20`, color: statusColor,
                                }}>
                                    {APP_STATUS_LABEL[app.status]}
                                </span>
                                <span style={{ fontSize: 10, color: "#6b7280" }}>v{app.version}</span>
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                            <button style={s.btnSecondary} onClick={() => setEditingApp(app)}>编辑</button>
                            <button style={s.btnSecondary} onClick={() => setBetaCodeApp(app)}>内测码</button>
                            <button style={s.btnDanger} onClick={() => setConfirmDelete(app)}>删除</button>
                        </div>
                    </div>
                );
            })}

            {/* Create / Edit form modal */}
            {(showCreateForm || editingApp) && (
                <AppFormModal
                    app={editingApp}
                    onClose={() => { setShowCreateForm(false); setEditingApp(null); }}
                    onSave={async (data) => {
                        setActionError("");
                        try {
                            if (editingApp) {
                                await apiAction("update_app", { app: { id: editingApp.id, ...data } });
                            } else {
                                await apiAction("create_app", { app: data });
                            }
                            setShowCreateForm(false);
                            setEditingApp(null);
                            onRefresh();
                        } catch (e: unknown) {
                            setActionError(e instanceof Error ? e.message : String(e));
                            throw e;
                        }
                    }}
                />
            )}

            {/* Beta code modal */}
            {betaCodeApp && (
                <BetaCodeModal
                    app={betaCodeApp}
                    onClose={() => setBetaCodeApp(null)}
                    onSave={async (code, maxUses) => {
                        setActionError("");
                        try {
                            await apiAction("set_beta_code", { app_id: betaCodeApp.app_id, code, max_uses: maxUses });
                            setBetaCodeApp(null);
                        } catch (e: unknown) {
                            setActionError(e instanceof Error ? e.message : String(e));
                            throw e;
                        }
                    }}
                />
            )}

            {/* Delete confirm modal */}
            {confirmDelete && (
                <OverlayModal onClose={() => setConfirmDelete(null)}>
                    <div style={{ padding: 4, display: "flex", flexDirection: "column", gap: 14 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#2e5c33" }}>确认删除</div>
                        <div style={{ fontSize: 13, color: "#3d5c45" }}>
                            确定要删除应用「{confirmDelete.name}」吗？此操作不可撤销。
                        </div>
                        <div style={{ display: "flex", gap: 10 }}>
                            <button onClick={() => setConfirmDelete(null)} style={{
                                flex: 1, padding: "10px", borderRadius: 12, border: "1px solid rgba(46,92,51,0.2)",
                                background: "transparent", color: "#2e5c33", fontSize: 14, cursor: "pointer",
                            }}>取消</button>
                            <button onClick={handleDelete} style={{
                                flex: 1, padding: "10px", borderRadius: 12, border: "none",
                                background: "#ef4444", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
                            }}>删除</button>
                        </div>
                    </div>
                </OverlayModal>
            )}
        </div>
    );
}

// Status change confirm modal
{confirmStatusChange && (
    <OverlayModal onClose={() => setConfirmStatusChange(null)}>
        <div style={{ padding: 4, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#2e5c33" }}>确认切换状态</div>
            <div style={{ fontSize: 13, color: "#3d5c45" }}>
                确定要将应用「{confirmStatusChange.app.name}」切换为
                <strong>{APP_STATUS_LABEL[confirmStatusChange.newStatus]}</strong> 吗？
            </div>
            <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setConfirmStatusChange(null)} style={{
                    flex: 1, padding: "10px", borderRadius: 12, border: "1px solid rgba(46,92,51,0.2)",
                    background: "transparent", color: "#2e5c33", fontSize: 14, cursor: "pointer",
                }}>取消</button>
                <button onClick={async () => {
                    try {
                        await apiAction("update_app", { app: { id: confirmStatusChange.app.id, status: confirmStatusChange.newStatus } });
                        onUpdate();
                        setConfirmStatusChange(null);
                    } catch (e: unknown) {
                        setActionError(e instanceof Error ? e.message : String(e));
                        setConfirmStatusChange(null);
                    }
                }} style={{
                    flex: 1, padding: "10px", borderRadius: 12, border: "none",
                    background: "#2e7d32", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}>确认</button>
            </div>
        </div>
    </OverlayModal>
)}

// ============ App Form Modal (Create/Edit) ============
interface AppFormModalProps {
    app: StoreAppItem | null;
    onClose: () => void;
    onSave: (data: Record<string, unknown>) => Promise<void>;
}

function AppFormModal({ app, onClose, onSave }: AppFormModalProps) {
    const [name, setName] = useState(app?.name || "");
    const [icon, setIcon] = useState(app?.icon || "📦");
    const [developer, setDeveloper] = useState(app?.developer || "米米宇宙");
    const [category, setCategory] = useState(app?.category || "");
    const [description, setDescription] = useState(app?.description || "");
    const [featuresStr, setFeaturesStr] = useState(app?.features.join("\n") || "");
    const [version, setVersion] = useState(app?.version || "1.0.0");
    const [status, setStatus] = useState<AppStatus>(app?.status || "dev");
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState("");

    const isEdit = !!app;

    const inputStyle: React.CSSProperties = {
        width: "100%", padding: "9px 12px", borderRadius: 10,
        border: "1px solid rgba(46,92,51,0.15)", background: "rgba(255,255,255,0.85)",
        fontSize: 13, color: "#2e5c33", boxSizing: "border-box",
    };

    const labelStyle: React.CSSProperties = {
        fontSize: 12, fontWeight: 600, color: "#2e5c33", marginBottom: 4,
    };

    async function handleSubmit() {
        if (!name.trim()) { setFormError("名称不能为空"); return; }
        setSaving(true);
        setFormError("");
        try {
            const features = featuresStr.split("\n").map((f) => f.trim()).filter(Boolean);
            await onSave({
                app_id: app?.app_id || `app_${Date.now()}`,
                name: name.trim(),
                icon: icon.trim() || "📦",
                developer: developer.trim() || "米米宇宙",
                category: category.trim() || "其他",
                description: description.trim(),
                features,
                version: version.trim() || "1.0.0",
                status,
            });
        } catch (e: unknown) {
            setFormError(e instanceof Error ? e.message : "保存失败");
        } finally {
            setSaving(false);
        }
    }

    return (
        <OverlayModal onClose={onClose}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#2e5c33" }}>
                    {isEdit ? "编辑应用" : "新建应用"}
                </div>

                {formError && <div style={{ color: "#ef4444", fontSize: 12 }}>{formError}</div>}

                <div>
                    <div style={labelStyle}>应用名称 *</div>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：聊天工具" style={inputStyle} />
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                        <div style={labelStyle}>图标</div>
                        <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="📦" style={inputStyle} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={labelStyle}>版本</div>
                        <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" style={inputStyle} />
                    </div>
                </div>

                <div>
                    <div style={labelStyle}>开发者</div>
                    <input value={developer} onChange={(e) => setDeveloper(e.target.value)} style={inputStyle} />
                </div>

                <div>
                    <div style={labelStyle}>分类</div>
                    <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="如：社交、娱乐" style={inputStyle} />
                </div>

                <div>
                    <div style={labelStyle}>描述</div>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        style={{ ...inputStyle, resize: "vertical" }}
                    />
                </div>

                <div>
                    <div style={labelStyle}>功能特点（每行一个）</div>
                    <textarea
                        value={featuresStr}
                        onChange={(e) => setFeaturesStr(e.target.value)}
                        rows={3}
                        placeholder={"即时消息\n表情互动\n文件传输"}
                        style={{ ...inputStyle, resize: "vertical" }}
                    />
                </div>

                <div>
                    <div style={labelStyle}>状态</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {STATUS_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => setStatus(opt.value)}
                                style={{
                                    padding: "5px 12px", borderRadius: 10, border: "none",
                                    background: status === opt.value ? "#2e7d32" : "rgba(46,92,51,0.1)",
                                    color: status === opt.value ? "#fff" : "#2e5c33",
                                    fontSize: 12, cursor: "pointer", fontWeight: status === opt.value ? 600 : 400,
                                }}
                            >{opt.label}</button>
                        ))}
                    </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                    <button onClick={onClose} style={{
                        flex: 1, padding: "10px", borderRadius: 12, border: "1px solid rgba(46,92,51,0.2)",
                        background: "transparent", color: "#2e5c33", fontSize: 14, cursor: "pointer",
                    }}>取消</button>
                    <button onClick={handleSubmit} disabled={saving} style={{
                        flex: 1, padding: "10px", borderRadius: 12, border: "none",
                        background: saving ? "#b8dcc4" : "#2e7d32", color: "#fff",
                        fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
                    }}>{saving ? "保存中..." : "保存"}</button>
                </div>
            </div>
        </OverlayModal>
    );
}

// ============ Beta Code Modal ============
interface BetaCodeModalProps {
    app: StoreAppItem;
    onClose: () => void;
    onSave: (code: string, maxUses: number) => Promise<void>;
}

function BetaCodeModal({ app, onClose, onSave }: BetaCodeModalProps) {
    const [code, setCode] = useState("");
    const [maxUses, setMaxUses] = useState(10);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState("");

    async function handleSave() {
        if (!code.trim()) { setFormError("请输入内测码"); return; }
        setSaving(true);
        setFormError("");
        try {
            await onSave(code.trim(), maxUses);
        } catch (e: unknown) {
            setFormError(e instanceof Error ? e.message : "保存失败");
        } finally {
            setSaving(false);
        }
    }

    const inputStyle: React.CSSProperties = {
        width: "100%", padding: "9px 12px", borderRadius: 10,
        border: "1px solid rgba(46,92,51,0.15)", background: "rgba(255,255,255,0.85)",
        fontSize: 13, color: "#2e5c33", boxSizing: "border-box",
    };

    return (
        <OverlayModal onClose={onClose}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#2e5c33" }}>
                    设置内测码 - {app.name}
                </div>
                {formError && <div style={{ color: "#ef4444", fontSize: 12 }}>{formError}</div>}
                <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#2e5c33", marginBottom: 4 }}>内测码</div>
                    <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="如：BETA2024" style={inputStyle} />
                </div>
                <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#2e5c33", marginBottom: 4 }}>最大使用次数</div>
                    <input
                        type="number"
                        min={1}
                        value={maxUses}
                        onChange={(e) => setMaxUses(Number(e.target.value) || 1)}
                        style={inputStyle}
                    />
                </div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>
                    提示：保存后会重置已用次数。
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                    <button onClick={onClose} style={{
                        flex: 1, padding: "10px", borderRadius: 12, border: "1px solid rgba(46,92,51,0.2)",
                        background: "transparent", color: "#2e5c33", fontSize: 14, cursor: "pointer",
                    }}>取消</button>
                    <button onClick={handleSave} disabled={saving} style={{
                        flex: 1, padding: "10px", borderRadius: 12, border: "none",
                        background: saving ? "#b8dcc4" : "#2e7d32", color: "#fff",
                        fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
                    }}>{saving ? "保存中..." : "保存"}</button>
                </div>
            </div>
        </OverlayModal>
    );
}

// ============ Overlay Modal (shared) ============
function OverlayModal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    return (
        <div
            style={{
                position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)",
                backdropFilter: "blur(4px)", zIndex: 100,
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: 16,
            }}
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: "100%", maxHeight: "85%", overflowY: "auto",
                    background: "rgba(255,255,255,0.95)", backdropFilter: "blur(28px)",
                    borderRadius: 20, padding: 20,
                    boxShadow: "0 8px 32px rgba(46,92,51,0.12)",
                }}
            >
                {children}
            </div>
        </div>
    );
}

// ============ App Detail Modal ============
interface AppDetailModalProps {
    app: StoreAppItem;
    isAdmin: boolean;
    hasAppManage: boolean;
    installed: boolean;
    betaVerified: boolean;
    onClose: () => void;
    onInstall: (app: StoreAppItem) => void;
    onOpen: () => void;
    onUpdate: () => void;
    apiAction: (action: string, extra?: Record<string, unknown>) => Promise<unknown>;
    onVerify: (appId: string) => void;
}

function AppDetailModal({ app, isAdmin, hasAppManage, installed, betaVerified, onClose, onInstall, onOpen, onUpdate, apiAction, onVerify }: AppDetailModalProps) {
    const [betaCode, setBetaCode] = useState("");
    const [betaLoading, setBetaLoading] = useState(false);
    const [betaError, setBetaError] = useState("");
    const [betaSuccess, setBetaSuccess] = useState(false);
    const [editMode, setEditMode] = useState(false);

    const statusLabel = APP_STATUS_LABEL[app.status];
    const statusColor = APP_STATUS_COLOR[app.status];
    const remainingSlots = app.beta_slots > 0 ? app.beta_slots - app.beta_used_slots : null;

    async function handleVerifyBetaCode() {
        if (!betaCode.trim()) { setBetaError("请输入内测码"); return; }
        setBetaLoading(true);
        setBetaError("");
        try {
            const res = await fetch("/api/app-beta", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ app_id: app.app_id, code: betaCode.trim() })
            });
            const json = await res.json();
            if (json.success) {
                setBetaSuccess(true);
                onVerify(app.app_id);
            } else {
                setBetaError(json.error || "验证失败");
            }
        } catch {
            setBetaError("网络错误");
        } finally {
            setBetaLoading(false);
        }
    }

    async function handleQuickStatusChange(newStatus: AppStatus) {
        try {
            await apiAction("update_app", { app: { id: app.id, status: newStatus } });
            onUpdate();
        } catch {
            // error handled in parent
        }
    }

    function handleDownload() {
        onInstall(app);
    }

    const canDownload = app.status === "published" ||
        (app.status === "beta" && betaVerified) ||
        isAdmin;

    // If in edit mode, show the form modal
    if (editMode && hasAppManage) {
        return (
            <AppFormModal
                app={app}
                onClose={() => setEditMode(false)}
                onSave={async (data) => {
                    await apiAction("update_app", { app: { id: app.id, ...data } });
                    setEditMode(false);
                    onUpdate();
                }}
            />
        );
    }

    return (
        <div style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)",
            backdropFilter: "blur(4px)", zIndex: 100,
            display: "flex", alignItems: "flex-end", justifyContent: "center"
        }} onClick={onClose}>
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: "100%", maxHeight: "92%",
                    background: "rgba(255,255,255,0.92)", backdropFilter: "blur(28px)",
                    borderRadius: "24px 24px 0 0", padding: 20,
                    overflowY: "auto", display: "flex", flexDirection: "column", gap: 14
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                        <div style={{ fontSize: 56 }}>{app.icon}</div>
                        <div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: "#2e5c33" }}>{app.name}</div>
                            <div style={{ fontSize: 12, color: "#4a7c50", marginTop: 2 }}>{app.developer} · {app.category}</div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{
                        width: 28, height: 28, borderRadius: "50%", border: "none",
                        background: "rgba(0,0,0,0.06)", color: "#2e5c33", fontSize: 18, cursor: "pointer"
                    }}>×</button>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={{
                        padding: "3px 10px", borderRadius: 12,
                        background: `${statusColor}20`, color: statusColor, fontSize: 11, fontWeight: 600
                    }}>{statusLabel}</span>
                    <span style={{
                        padding: "3px 10px", borderRadius: 12,
                        background: "rgba(46,125,50,0.1)", color: "#2e7d32", fontSize: 11
                    }}>v{app.version}</span>
                    {installed && (
                        <span style={{
                            padding: "3px 10px", borderRadius: 12,
                            background: "rgba(34,197,94,0.15)", color: "#16a34a", fontSize: 11
                        }}>已下载</span>
                    )}
                </div>

                {/* Admin quick actions */}
                {hasAppManage && (
                    <div style={{
                        background: "rgba(46,125,50,0.06)", borderRadius: 14, padding: 12,
                    }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#2e5c33", marginBottom: 8 }}>🔧 管理操作</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button onClick={() => setEditMode(true)} style={{
                                padding: "5px 12px", borderRadius: 10, border: "none",
                                background: "#2e7d32", color: "#fff", fontSize: 11, cursor: "pointer",
                            }}>编辑应用</button>
                            {STATUS_OPTIONS.filter((o) => o.value !== app.status).map((opt) => (
                                <button key={opt.value} onClick={() => setConfirmStatusChange({app, newStatus: opt.value})} style={{
                                    padding: "5px 12px", borderRadius: 10, border: "1px solid rgba(46,92,51,0.2)",
                                    background: "transparent", color: "#2e5c33", fontSize: 11, cursor: "pointer",
                                }}>
                                    切换为{opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#2e5c33", marginBottom: 6 }}>应用介绍</div>
                    <div style={{ fontSize: 13, color: "#3d5c45", lineHeight: 1.6 }}>{app.description || "暂无介绍"}</div>
                </div>

                {app.features.length > 0 && (
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#2e5c33", marginBottom: 6 }}>功能特点</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {app.features.map((f, i) => (
                                <div key={i} style={{ fontSize: 12, color: "#3d5c45", display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ color: "#2e7d32" }}>✓</span> {f}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div style={{
                    background: "rgba(46,125,50,0.06)", borderRadius: 14, padding: 12,
                    fontSize: 12, color: "#3d5c45", display: "flex", flexDirection: "column", gap: 6
                }}>
                    <div><strong>更新时间：</strong>{new Date(app.updated_at).toLocaleDateString("zh-CN")}</div>
                    {app.expected_release && (
                        <div><strong>预计上线：</strong>{new Date(app.expected_release).toLocaleDateString("zh-CN")}</div>
                    )}
                </div>

                {app.status === "beta" && (
                    <div style={{
                        background: "rgba(245,158,11,0.08)", borderRadius: 14, padding: 12,
                        border: "1px solid rgba(245,158,11,0.2)"
                    }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 6 }}>内测信息</div>
                        <div style={{ fontSize: 12, color: "#78350f", lineHeight: 1.6 }}>
                            {app.beta_info || "该应用正在内测中。"}
                        </div>
                        <div style={{ fontSize: 12, color: "#78350f", marginTop: 6 }}>
                            <strong>是否删档：</strong>{app.beta_wipe ? "是" : "否"}
                        </div>
                        {remainingSlots !== null && (
                            <div style={{ fontSize: 12, color: "#78350f", marginTop: 4 }}>
                                <strong>剩余名额：</strong>{remainingSlots > 0 ? `${remainingSlots} 个` : "已满"}
                            </div>
                        )}
                    </div>
                )}

                {app.status === "beta" && !betaVerified && !isAdmin && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <input
                            value={betaCode}
                            onChange={(e) => setBetaCode(e.target.value)}
                            placeholder="输入内测邀请码"
                            style={{
                                width: "100%", padding: "10px 12px", borderRadius: 12,
                                border: "1px solid rgba(245,158,11,0.4)", background: "rgba(255,255,255,0.8)",
                                fontSize: 14, color: "#2e5c33", boxSizing: "border-box",
                            }}
                        />
                        {betaError && <div style={{ fontSize: 12, color: "#ef4444" }}>{betaError}</div>}
                        {betaSuccess && <div style={{ fontSize: 12, color: "#16a34a" }}>验证成功，可以下载了</div>}
                        <button
                            onClick={handleVerifyBetaCode}
                            disabled={betaLoading}
                            style={{
                                width: "100%", padding: "11px", borderRadius: 14, border: "none",
                                background: betaLoading ? "#fcd34d" : "#f59e0b", color: "#fff",
                                fontSize: 15, fontWeight: 600, cursor: betaLoading ? "not-allowed" : "pointer"
                            }}
                        >{betaLoading ? "验证中..." : "验证内测码"}</button>
                    </div>
                )}

                <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
                    {installed ? (
                        <button
                            onClick={onOpen}
                            disabled={!canDownload}
                            style={{
                                flex: 1, padding: "12px", borderRadius: 14, border: "none",
                                background: canDownload ? "#2e7d32" : "#b8dcc4", color: "#fff",
                                fontSize: 15, fontWeight: 600, cursor: canDownload ? "pointer" : "not-allowed"
                            }}
                        >{canDownload ? "打开" : "暂不可打开"}</button>
                    ) : (
                        <button
                            onClick={handleDownload}
                            disabled={!canDownload || app.status === "dev"}
                            style={{
                                flex: 1, padding: "12px", borderRadius: 14, border: "none",
                                background: !canDownload || app.status === "dev" ? "#b8dcc4" : "#2e7d32", color: "#fff",
                                fontSize: 15, fontWeight: 600,
                                cursor: !canDownload || app.status === "dev" ? "not-allowed" : "pointer"
                            }}
                        >
                            {app.status === "dev" ? "开发中" : canDownload ? "下载" : "暂不可下载"}
                        </button>
                    )}
                </div>

                <div style={{ textAlign: "center", fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                    评分/评价功能开发中
                </div>
            </div>
        </div>
    );
}
