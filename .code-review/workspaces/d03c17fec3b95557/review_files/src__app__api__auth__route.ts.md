# src/app/api/auth/route.ts

```diff
diff --git a/src/app/api/auth/route.ts b/src/app/api/auth/route.ts
index 19f21af..51c7cae 100644
--- a/src/app/api/auth/route.ts
+++ b/src/app/api/auth/route.ts
@@ -587,6 +587,7 @@ export async function POST(request: NextRequest) {
           weiboVerified: user.weibo_verified,
           weiboUid: user.weibo_uid,
           weiboName: user.weibo_name,
+          weiboLink: user.weibo_link || "",
           userBio: user.user_bio || "",
           isAdmin: isAdminUser,
           isDefaultPassword,
@@ -624,6 +625,7 @@ export async function POST(request: NextRequest) {
           weiboVerified: u.weibo_verified,
           weiboUid: u.weibo_uid,
           weiboName: u.weibo_name,
+          weiboLink: u.weibo_link || "",
           userBio: u.user_bio || "",
           isAdmin: isAdminUser,
         },
@@ -906,7 +908,7 @@ export async function POST(request: NextRequest) {
       );
 
       let query = supabase.from("users").select(
-        "id, username, display_name, level, role, status, verify_status, weibo_verified, weibo_uid, weibo_name, weibo_level, created_at, reviewed_at, reviewed_by, review_result, referrer_id, ban_status, ban_until, violation_count, invite_quota",
+        "id, username, display_name, level, role, status, verify_status, weibo_verified, weibo_uid, weibo_name, weibo_link, weibo_level, created_at, reviewed_at, reviewed_by, review_result, referrer_id, ban_status, ban_until, violation_count, invite_quota",
         { count: "exact" }
       );
 
```
