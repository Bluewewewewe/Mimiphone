# src/app/phone/page.tsx

```diff
diff --git a/src/app/phone/page.tsx b/src/app/phone/page.tsx
index 258e715..dd4e81e 100644
--- a/src/app/phone/page.tsx
+++ b/src/app/phone/page.tsx
@@ -2949,6 +2949,10 @@ export default function PhonePage() {
                 setLoginError("请输入微博昵称");
                 return;
             }
+            if (!weiboLink.trim()) {
+                setLoginError("请填写微博主页链接");
+                return;
+            }
         }
 
         setLoginError("");
@@ -2984,6 +2988,7 @@ export default function PhonePage() {
                     username,
                     password,
                     weiboName: loginMode === "register" ? registerWeiboName.trim() : undefined,
+                    weiboLink: loginMode === "register" ? weiboLink.trim() : undefined,
                     invitationCode: loginMode === "register" ? invitationCode.trim() : undefined,
                 })
             });
@@ -3002,6 +3007,7 @@ export default function PhonePage() {
                 setLoginPassword("");
                 setInvitationCode("");
                 setRegisterWeiboName("");
+                setWeiboLink("");
                 return;
             }
 
@@ -11404,6 +11410,57 @@ export default function PhonePage() {
                                 </div>
                             </div>
                         )}
+                        {/* 微博主页链接（注册时必填） */}
+                        {loginMode === "register" && (
+                            <div style={{
+                                marginBottom: 14
+                            }}>
+                                <div style={{
+                                    fontSize: 11,
+                                    color: "#3d5c45",
+                                    fontWeight: 700,
+                                    marginBottom: 6,
+                                    letterSpacing: 1.5
+                                }}>微博主页链接 <span style={{color: "#ef4444"}}>*</span></div>
+                                <div style={{
+                                    display: "flex",
+                                    alignItems: "center",
+                                    background: "rgba(255,255,255,0.8)",
+                                    borderRadius: 14,
+                                    border: "1.5px solid rgba(165,214,167,0.5)",
+                                    overflow: "hidden",
+                                    transition: "border-color 0.2s, box-shadow 0.2s"
+                                }}
+                                onFocusCapture={e => {
+                                    e.currentTarget.style.borderColor = "rgba(90,158,106,0.6)";
+                                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(90,158,106,0.08)";
+                                }}
+                                onBlurCapture={e => {
+                                    e.currentTarget.style.borderColor = "rgba(165,214,167,0.5)";
+                                    e.currentTarget.style.boxShadow = "none";
+                                }}>
+                                    <span style={{
+                                        padding: "0 0 0 14px",
+                                        fontSize: 16,
+                                        opacity: 0.7
+                                    }}>🔗</span>
+                                    <input
+                                        value={weiboLink}
+                                        onChange={e => setWeiboLink(e.target.value)}
+                                        placeholder="请填写你的微博主页链接"
+                                        style={{
+                                            flex: 1,
+                                            padding: "12px 14px 12px 8px",
+                                            border: "none",
+                                            fontSize: 14,
+                                            outline: "none",
+                                            background: "transparent",
+                                            color: "#2e5c33",
+                                            fontWeight: 500
+                                        }} />
+                                </div>
+                            </div>
+                        )}
                         {/* 注册成功待审核提示 */}
                         {adminPendingMsg && (
                             <div style={{
```
