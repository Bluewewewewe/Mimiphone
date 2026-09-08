# src/app/api/admin/tree/route.ts

```diff
diff --git a/src/app/api/admin/tree/route.ts b/src/app/api/admin/tree/route.ts
index eeaff64..175698a 100644
--- a/src/app/api/admin/tree/route.ts
+++ b/src/app/api/admin/tree/route.ts
@@ -12,7 +12,7 @@ function getStatusEmoji(banStatus: string, verifyStatus: string): string {
 
 export async function POST(request: NextRequest) {
   try {
-    const body = await request.json();
+    const body = await request.clone().json();
     const { authToken } = body;
     const supabase = await getSupabaseClient();
 
```
