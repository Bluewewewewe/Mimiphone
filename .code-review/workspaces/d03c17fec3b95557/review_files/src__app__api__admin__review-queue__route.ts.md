# src/app/api/admin/review-queue/route.ts

```diff
diff --git a/src/app/api/admin/review-queue/route.ts b/src/app/api/admin/review-queue/route.ts
index 43446db..48e122a 100644
--- a/src/app/api/admin/review-queue/route.ts
+++ b/src/app/api/admin/review-queue/route.ts
@@ -44,7 +44,7 @@ function computePriority(assignment: Record<string, unknown> | null, createdAt:
 export async function POST(request: NextRequest) {
   try {
     const supabase = await getSupabaseClient();
-    const body = await request.json();
+    const body = await request.clone().json();
     const { action } = body;
     const permissionAction: Record<string, AdminPermission> = {
       list_pending: "user_review",
@@ -65,7 +65,7 @@ export async function POST(request: NextRequest) {
       const { data: users, error: usersError } = await supabase
         .from("users")
         .select(
-          "id, username, nickname, weibo_nickname, weibo_level, weibo_screenshot_url, referrer_id, verify_status, created_at, reviewed_by, reviewed_at, review_result"
+          "id, username, nickname, weibo_nickname, weibo_level, weibo_screenshot_url, weibo_link, referrer_id, verify_status, created_at, reviewed_by, reviewed_at, review_result"
         )
         .eq("verify_status", "pending")
         .order("created_at", { ascending: true });
@@ -358,7 +358,7 @@ export async function POST(request: NextRequest) {
       const reviewerIds = (rows || []).map((r) => r.reviewed_by as string).filter(Boolean);
 
       const [{ data: users }, { data: reviewers }] = await Promise.all([
-        supabase.from("users").select("id, username, nickname, weibo_nickname").in("id", userIds.length ? userIds : [""]),
+        supabase.from("users").select("id, username, nickname, weibo_nickname, weibo_link").in("id", userIds.length ? userIds : [""]),
         supabase.from("users").select("id, username, nickname").in("id", reviewerIds.length ? reviewerIds : [""]),
       ]);
 
@@ -373,6 +373,7 @@ export async function POST(request: NextRequest) {
           user_id: r.user_id,
           username: u?.username || r.user_id,
           weibo_nickname: u?.weibo_nickname || u?.nickname || null,
+          weibo_link: u?.weibo_link || null,
           review_result: r.review_result,
           reviewed_by: r.reviewed_by,
           reviewed_by_name: rv?.username || r.reviewed_by,
```
