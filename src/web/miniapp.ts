/** مینی‌اپ تلگرام — رابط تحت وب برای دستیار */
export function renderMiniApp(): string {
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>راهنما — دستیار هوش مصنوعی</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
:root{--bg:#0e1424;--bg2:#151d33;--me:#3b82f6;--ai:#1e2740;--txt:#eaeefb;--muted:#8e9bbd;--line:#28324f}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{height:100%;margin:0}
body{font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;background:var(--bg);color:var(--txt);
display:flex;flex-direction:column;overflow:hidden}
header{padding:12px 14px;background:linear-gradient(180deg,rgba(59,130,246,.18),transparent);
border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px;flex:0 0 auto}
.av{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#8b5cf6);
display:grid;place-items:center;font-size:19px}
.hn{font-weight:700;font-size:15px}
.hs{font-size:11.5px;color:var(--muted);margin-top:1px}
.sp{margin-inline-start:auto;display:flex;gap:6px}
.chip{border:1px solid var(--line);background:var(--bg2);color:var(--muted);border-radius:999px;
padding:5px 11px;font-size:11.5px;font-family:inherit;cursor:pointer}
.chip:active{transform:scale(.96)}
#chat{flex:1 1 auto;overflow-y:auto;padding:14px 12px 8px;display:flex;flex-direction:column;gap:9px}
.msg{max-width:82%;padding:9px 13px;border-radius:16px;font-size:14.5px;line-height:1.75;
white-space:pre-wrap;word-break:break-word;animation:in .18s ease}
@keyframes in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.ai{align-self:flex-start;background:var(--ai);border:1px solid var(--line);border-bottom-right-radius:5px}
.me{align-self:flex-end;background:linear-gradient(135deg,#3b82f6,#2563eb);border-bottom-left-radius:5px}
.typing{align-self:flex-start;background:var(--ai);border:1px solid var(--line);border-radius:16px;
padding:12px 15px;display:flex;gap:4px}
.typing i{width:7px;height:7px;border-radius:50%;background:var(--muted);animation:b 1.2s infinite}
.typing i:nth-child(2){animation-delay:.2s}.typing i:nth-child(3){animation-delay:.4s}
@keyframes b{0%,60%,100%{opacity:.25;transform:translateY(0)}30%{opacity:1;transform:translateY(-4px)}}
.welcome{text-align:center;color:var(--muted);font-size:13px;padding:26px 14px;line-height:2}
.welcome b{color:var(--txt);display:block;font-size:16px;margin-bottom:6px}
footer{flex:0 0 auto;padding:9px 10px calc(10px + env(safe-area-inset-bottom));border-top:1px solid var(--line);
display:flex;gap:8px;align-items:flex-end;background:var(--bg2)}
#in{flex:1;background:var(--bg);border:1px solid var(--line);border-radius:20px;padding:11px 15px;
color:var(--txt);font-family:inherit;font-size:15px;resize:none;max-height:110px;outline:none}
#in:focus{border-color:#3b82f6}
#send{width:44px;height:44px;border-radius:50%;border:none;background:linear-gradient(135deg,#3b82f6,#8b5cf6);
color:#fff;font-size:17px;cursor:pointer;flex:0 0 auto;display:grid;place-items:center}
#send:active{transform:scale(.92)}
#send:disabled{opacity:.5}
</style>
</head>
<body>
<header>
  <div class="av">🤖</div>
  <div><div class="hn">راهنما</div><div class="hs" id="who">دستیار هوش مصنوعی شما</div></div>
  <div class="sp">
    <button class="chip" id="btnNew">🔄 جدید</button>
    <button class="chip" id="btnModel">🤖 مدل</button>
  </div>
</header>
<div id="chat"><div class="welcome"><b>سلام! 👋</b>هر سوالی داری بپرس.<br>متن، یا عکس بفرست تا تحلیل کنم.</div></div>
<footer>
  <textarea id="in" rows="1" placeholder="پیام خود را بنویسید..."></textarea>
  <button id="send">➤</button>
</footer>
<script>
var tg = window.Telegram && window.Telegram.WebApp;
if (tg) { tg.ready(); tg.expand(); try{tg.setHeaderColor('#0e1424')}catch(e){} }
var chatEl = document.getElementById('chat');
var inEl = document.getElementById('in');
var sendEl = document.getElementById('send');
var history = [];
var busy = false;

function esc(s){return s.replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}
function add(role, text){
  var d = document.createElement('div');
  d.className = 'msg ' + role;
  d.textContent = text;
  chatEl.appendChild(d);
  chatEl.scrollTop = chatEl.scrollHeight;
  return d;
}
function typing(){
  var d = document.createElement('div');
  d.className = 'typing'; d.id = 'typing';
  d.innerHTML = '<i></i><i></i><i></i>';
  chatEl.appendChild(d); chatEl.scrollTop = chatEl.scrollHeight;
}
function stopTyping(){ var t = document.getElementById('typing'); if (t) t.remove(); }

async function send(){
  var text = inEl.value.trim();
  if (!text || busy) return;
  busy = true; sendEl.disabled = true;
  inEl.value = ''; inEl.style.height = 'auto';
  var w = document.querySelector('.welcome'); if (w) w.remove();
  add('me', text);
  history.push({role:'user', content:text});
  typing();
  try{
    var res = await fetch('/api/chat', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-telegram-init-data': tg && tg.initData ? tg.initData : ''},
      body: JSON.stringify({message:text, history: history.slice(-10)})
    });
    var data = await res.json();
    stopTyping();
    if (data.ok){
      add('ai', data.reply);
      history.push({role:'assistant', content:data.reply});
    } else {
      add('ai', '⚠️ ' + (data.error || 'خطای نامشخص'));
    }
  }catch(e){
    stopTyping();
    add('ai', '⚠️ ارتباط با سرور برقرار نشد.');
  }
  busy = false; sendEl.disabled = false;
}

sendEl.onclick = send;
inEl.addEventListener('keydown', function(e){
  if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); send(); }
});
inEl.addEventListener('input', function(){
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 110) + 'px';
});
document.getElementById('btnNew').onclick = function(){
  history = [];
  chatEl.innerHTML = '<div class="welcome"><b>گفتگوی جدید شروع شد ✨</b>سوال خود را بپرس.</div>';
};
document.getElementById('btnModel').onclick = function(){
  add('ai', '🤖 برای تغییر مدل، در ربات از منوی «انتخاب مدل» استفاده کنید. این تنظیم برای مینی‌اپ هم اعمال می‌شود.');
};
if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user){
  document.getElementById('who').textContent =
    (tg.initDataUnsafe.user.first_name || 'کاربر') + ' • آنلاین';
} else {
  document.getElementById('who').textContent = 'برای اتصال کامل، داخل تلگرام باز کنید';
}
</script>
</body>
</html>`
}
