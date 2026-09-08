# src/components/admin/review-queue.tsx

```diff
diff --git a/src/components/admin/review-queue.tsx b/src/components/admin/review-queue.tsx
index 16c3519..3dbdd1d 100644
--- a/src/components/admin/review-queue.tsx
+++ b/src/components/admin/review-queue.tsx
@@ -8,6 +8,7 @@ type QueueUser = {
   id: string;
   username: string;
   weibo_nickname?: string;
+  weibo_link?: string;
   weibo_level?: number;
   weibo_screenshot_url?: string;
   referrer_id?: string;
@@ -41,6 +42,7 @@ type HistoryItem = {
   user_id: string;
   username: string;
   weibo_nickname?: string;
+  weibo_link?: string;
   review_result: ReviewResult;
   reviewed_by: string;
   reviewed_by_name?: string;
@@ -89,8 +91,8 @@ export default function ReviewQueue({ currentAdminId, token: tokenProp }: { curr
     try {
       const res = await authFetch(API_URL, { action: "list_pending" });
       if (res.success && res.data && typeof res.data === "object") {
-        const data = res.data as { users: QueueUser[]; stats: QueueStats };
-        setUsers(data.users || []);
+        const data = res.data as { list: QueueUser[]; users?: QueueUser[]; stats: QueueStats };
+        setUsers((data.list || data.users) as QueueUser[]);
         setStats(data.stats || null);
       } else {
         setError(res.error || "加载审核队列失败");
@@ -359,6 +361,32 @@ export default function ReviewQueue({ currentAdminId, token: tokenProp }: { curr
                         微博：<span className="text-white">{u.weibo_nickname || "-"}</span>
                         {u.weibo_level ? ` · LV.${u.weibo_level}` : ""}
                       </div>
+                      {u.weibo_link && (
+                        <div className="flex items-center gap-2 text-xs">
+                          <span className="text-slate-400">链接：</span>
+                          <a
+                            href={u.weibo_link}
+                            target="_blank"
+                            rel="noopener noreferrer"
+                            className="max-w-[200px] truncate text-indigo-300 underline hover:text-indigo-200"
+                            title={u.weibo_link}
+                          >
+                            {u.weibo_link}
+                          </a>
+                          <button
+                            onClick={async () => {
+                              try {
+                                await navigator.clipboard.writeText(u.weibo_link || "");
+                              } catch {
+                                // fallback
+                              }
+                            }}
+                            className="rounded border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-indigo-300 transition hover:bg-indigo-500/20"
+                          >
+                            复制
+                          </button>
+                        </div>
+                      )}
                       {u.weibo_screenshot_url && (
                         <div>
                           <button
```
