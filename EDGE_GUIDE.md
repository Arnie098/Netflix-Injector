# 🌐 Using Microsoft Edge & Chrome (No Lemur)

Since Edge Mobile doesn't support extensions easily, you have two options:

## Method 1: Desktop-to-Phone (Easiest)

If you are using the extension on your PC:
1.  **Inject** the cookie on your PC extension.
2.  Click the **"📋 Copy JSON"** button in the popup.
3.  Send the copied text to your phone.
4.  Open **Edge** on your phone -> Go to `netflix.com`.
5.  Open your **Cookie Editor** tool (if you have one) or Paste the JSON.
6.  Go to this link: `https://www.netflix.com/unsupported`
7.  Tap **"Open App"**.

## Method 2: Magic Bookmark (No PC Needed)

If you are only on your phone, use this method:

### 🛠️ Step 1: Copy the Magic Code

Copy the code block below entirely (select all and copy):

```javascript
javascript:(async function(){var k=prompt("🔑 Enter Netflix License Key:");if(!k)return;var h="https://netflix-injector-api.onrender.com";try{alert("⏳ Injecting... Please wait.");var r=await fetch(h+"/v1/license/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({license_key:k,hardware_id:"bookmarklet_"+Math.random().toString(36).substring(7)})});var d=await r.json();if(!d.valid)throw new Error(d.message);var c=d.data.cookies||d.data;if(typeof c==="string")c=JSON.parse(c);for(var i=0;i<c.length;i++){document.cookie=c[i].name+"="+c[i].value+"; domain=.netflix.com; path=/; secure; sameSite=None";}alert("✅ Success! Opening App...");window.location.href="https://www.netflix.com/unsupported";}catch(e){alert("❌ Error: "+e.message);}})();
```

---

## 🔖 Step 2: Create the Bookmark

1.  Open **Edge** (or Chrome) on your phone.
2.  Tap the **Menu** (3 dots/lines) → Tap source **Star icon ⭐** (Add to Favorites).
3.  Tap **Edit** immediately (or go to Favorites → Edit).
4.  **Name:** Type `Netflix Unlocker`
5.  **URL (Address):** Delete everything and **PASTE** the Magic Code from Step 1.
6.  Save it.

---

## 🚀 Step 3: Unlock Netflix

1.  Open **Edge** and go to [netflix.com](https://netflix.com).
2.  Tap the **Address Bar** (where you type URLs).
3.  Type `Netflix Unlocker`.
4.  You will see your bookmark appear in the suggestions. **Tap it.**
5.  A box will appear. Enter your **License Key** and tap **OK**.
6.  Wait for the "✅ Success" message.
7.  The Netflix App will open automatically!

---

---

## ❓ Troubleshooting

**"The link redirects to Play Store!"**
> Use this **Force Launch** URL (Copy & Paste in browser):
> `intent://www.netflix.com/browse#Intent;scheme=https;package=com.netflix.mediaclient;end`
