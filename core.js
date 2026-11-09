/* ================================================================
   COCKPIT — cœur : config, données temps réel, analyse, modules
   ================================================================ */
(function(){
"use strict";
var CK = window.CK = {};
/* Contrats micro (MNQ, MES) : mêmes niveaux que l'indice, décalés de l'écart contrat/indice (basis) */
CK.fut=(function(){
  var M={
    MNQ:{base:"NDX",n:"MNQ",full:"Micro E-mini Nasdaq-100",pt:2,tv:"CME_MINI:MNQ1!",big:"CME_MINI:NQ1!",it:"NASDAQ:NDX",div:.007},
    MES:{base:"SPX",n:"MES",full:"Micro E-mini S&P 500",pt:5,tv:"CME_MINI:MES1!",big:"CME_MINI:ES1!",it:"SP:SPX",div:.013}
  };
  var F={M:M,TICK:.25,rows:{}};
  F.is=function(s){return !!M[s];};
  F.base=function(s){return M[s]?M[s].base:s;};
  /* prochain trimestriel (mars, juin, sept., déc.) : 3e vendredi, 13 h 30 UTC */
  F.expiry=function(now){
    now=now||Date.now();var d=new Date(now),y=d.getUTCFullYear();
    for(var k=0;k<6;k++){var mo=[2,5,8,11][k%4],yy=y+Math.floor(k/4),t=new Date(Date.UTC(yy,mo,1,13,30)),fri=(5-t.getUTCDay()+7)%7;t=new Date(Date.UTC(yy,mo,1+fri+14,13,30));if(t.getTime()>now)return t.getTime();}
    return now;
  };
  /* prix réels des contrats lus par le robot (Yahoo Finance) : valables 45 min */
  F.y=null;
  F.fresh=function(s){var d=F.y&&F.y.fut&&F.y.fut[s];return d&&d.ts&&Date.now()-d.ts<2700000?d:null;};
  F.levels=function(s){var d=F.fresh(s);return d&&d.L&&d.L.length?d.L:null;};
  F.load=function(cb){var url=CK.relay&&CK.relay("/futpx");if(!url)return;
    CK.u.fetchJSON(url+"?t="+Math.floor(Date.now()/60000),null,12000).then(function(j){if(j&&j.fut){F.y=j;if(cb)cb();}}).catch(function(){});};
  /* séance des actions américaines ouverte (lun.–ven., 9 h 30–16 h New York) : seul moment où l'indice cash est comparable au future */
  F.cash=function(){var p={};new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()).forEach(function(x){p[x.type]=x.value;});
    var m=(+p.hour)*60+(+p.minute);return p.weekday!=="Sat"&&p.weekday!=="Sun"&&m>=575&&m<955;};
  /* écart contrat − prix de référence (perpétuel OKX) en points : robot Yahoo, sinon TradingView en séance US, sinon estimé par le coût de portage */
  F.info=function(s,spot){
    var m=M[s];if(!m||!(spot>0))return {v:0,src:"",days:0};
    var days=Math.max(0,(F.expiry()-Date.now())/86400000),y=F.fresh(s);
    if(y&&y.basis!=null&&isFinite(y.basis)&&Math.abs(y.basis)<spot*.03)return {v:y.basis,src:"Yahoo",days:days};
    var f=F.rows[m.big],i=F.rows[m.it];
    if(F.cash()&&f&&i&&f.c>0&&i.c>0){var v=f.c-i.c;if(Math.abs(v)<spot*.03)return {v:v,src:"mesuré",days:days};}
    var r=F.rows["TVC:US05Y"],rate=r&&r.c>0&&r.c<15?r.c/100:.04;
    return {v:spot*(rate-m.div)*days/365,src:"estimé",days:days};
  };
  F.off=function(s,spot){return F.is(s)?F.info(s,spot).v:0;};
  return F;
})();

var OKX = "https://www.okx.com";
var BFX = "https://fapi.binance.com/futures/data/";
var TV_SCAN = "https://scanner.tradingview.com/global/scan";
var FJ_RSS = "https://www.financialjuice.com/feed.ashx?xy=rss";
var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
CK.reduce = reduce;

/* ---------------- Config ---------------- */
var DEF = {
  id:"damour", name:"DAMOUR GLOBAL", tagline:"", data:"", accent:"#FF8A3D", theme:"dark", beginner:false,
  watchlist:[],
  modules:{plan:true,ctx:true,day:true,map:false,events:true,deriv:true,liq:false,movers:false,screener:false,news:true,levels:true,opts:true,book:false,corr:false,net:true,veille:false},
  layout:null,
  espaces:{plan:true,journee:true,news:true,net:true},   // false = espace masqué (accueil, navigation, raccourcis)
  moversMarket:"spot", moversMinVolume:2000000, liqMin:25000,
  screenerPreset:"compression", screenerMax:150, newsLang:"fr"
};
function isObj(o){return o && typeof o==="object" && !Array.isArray(o);}
function clone(v){return isObj(v)?merge(v,{}):Array.isArray(v)?v.map(clone):v;}
function merge(a,b){var o={};Object.keys(a||{}).forEach(function(k){o[k]=clone(a[k]);});
  Object.keys(b||{}).forEach(function(k){o[k]=isObj(b[k])&&isObj(o[k])?merge(o[k],b[k]):clone(b[k]);});return o;}
var BAKED = merge(DEF, window.COCKPIT_CONFIG||{});
if(BAKED.theme!=="light")BAKED.theme="dark";
var NS = "cockpit:"+(BAKED.id||"damour")+":";
function ls(k,v){try{if(v===undefined)return localStorage.getItem(NS+k);if(v===null)localStorage.removeItem(NS+k);else localStorage.setItem(NS+k,v);}catch(e){return null;}}
function lsj(k,v){if(v===undefined){try{return JSON.parse(ls(k));}catch(e){return null;}}ls(k,v===null?null:JSON.stringify(v));}
var C = merge(BAKED, lsj("cfg")||{});
if(C.theme!=="light")C.theme="dark";
/* L'adresse du robot vient toujours du fichier : une ancienne config enregistrée (data vide) ne doit pas la couper */
function keepData(c){if(BAKED.data)c.data=BAKED.data;return c;}
keepData(C);
CK.DEF=DEF; CK.BAKED=BAKED; CK.merge=merge; CK.ls=ls; CK.lsj=lsj;
CK.cfg=function(){return C;};
CK.setCfg=function(next,persist){C=keepData(merge(DEF,next));if(persist!==false)lsj("cfg",C);};

/* ---------------- Utilitaires ---------------- */
function $(id){return document.getElementById(id);}
function nf(v,d){if(v==null||isNaN(v))return "—";return Number(v).toLocaleString("fr-FR",{minimumFractionDigits:d,maximumFractionDigits:d});}
function px(v){if(v==null||isNaN(v))return "—";var a=Math.abs(v);var d=a>=10000?0:a>=1000?1:a>=10?2:a>=1?3:a>=0.01?4:6;return nf(v,d);}
function pct(v,d){if(v==null||isNaN(v))return "—";d=d==null?2:d;var r=Math.abs(v)<Math.pow(10,-d)/2?0:v;return (r>0?"+":r<0?"−":"")+nf(Math.abs(v),d)+" %";}
function usd(v){if(v==null||isNaN(v))return "—";var a=Math.abs(v);if(a>=1e9)return nf(v/1e9,2)+" Md$";if(a>=1e6)return nf(v/1e6,a>=1e8?0:a>=1e7?1:2)+" M$";if(a>=1e3)return nf(v/1e3,0)+" k$";return nf(v,0)+" $";}
function cls(v){return v>0?"up":v<0?"down":"flat";}
/* Liens venus de l'extérieur (flux, API) : uniquement http(s), jamais javascript: ou data: */
function safeUrl(s){s=String(s==null?"":s).trim();return /^https?:\/\//i.test(s)?s:"#";}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function ago(ts){var s=(Date.now()-ts)/1000;if(s<45)return "à l'instant";if(s<3600)return Math.round(s/60)+" min";if(s<86400)return Math.round(s/3600)+" h";return Math.round(s/86400)+" j";}
function dur(ms){var m=Math.max(0,Math.round(ms/60000));var h=Math.floor(m/60);m=m%60;return h?(h+" h "+(m<10?"0":"")+m):(m+" min");}
function clock(ms){ms=Math.max(0,ms);var s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return (h?h+":":"")+(m<10&&h?"0":"")+m+":"+(x<10?"0":"")+x;}
function logo(base){return '<img class="lo" alt="" loading="lazy" src="https://static.okx.com/cdn/oksupport/asset/currency/icon/'+esc(String(base).toLowerCase())+'.png" onerror="this.style.visibility=\'hidden\'">';}
/* ---- Journal réseau (espace Connexions) ---- */
var NET={};CK.NET=NET;
function netId(url){url=String(url);
  var R=[["ws.okx.com","okxws"],["stream.bybit.com","bybit"],["fstream.binance.com","binws"],["okx.com/api","okx"],["fapi.binance.com","binfx"],["scanner.tradingview.com","tvscan"],
    ["alternative.me","fng"],["financialjuice.com","fj"],["treeofalpha.com","tree"],["workers.dev","tg"],["github.io","robot"],["generativelanguage.googleapis.com","gemini"],["api.mistral.ai","iapay"],["api.openai.com","iapay"],["api.anthropic.com","iapay"],["api.x.ai","iapay"],["api.perplexity.ai","iapay"],["api.deepseek.com","iapay"],["openrouter.ai","openrouter"],["allorigins","ff"],["translate.googleapis.com","tr"],["api.bybit.com","bybitrest"],["api.bitget.com","bitget"],["hyperliquid.xyz","hl"],["deribit.com","deribit"],["coinbase.com","coinbase"],["mymemory","tr"],["tradingview.com","tvw"]];
  for(var i=0;i<R.length;i++)if(url.indexOf(R[i][0])>=0)return R[i][1];return null;}
function netRec(id){return NET[id]||(NET[id]={calls:0,ok:0,err:0,lastOk:0,lastErr:0,ms:0,msg:"",code:0,open:false,opens:0,closes:0,lastMsg:0,msgs:[],openTs:0});}
function netOk(url,t0){var id=netId(url);if(!id)return;var r=netRec(id);r.calls++;r.ok++;r.lastOk=Date.now();r.ms=Math.round(performance.now()-t0);}
function netErr(url,e){var id=netId(url);if(!id)return;var r=netRec(id);r.calls++;r.err++;r.lastErr=Date.now();var m=String(e&&e.message||e||"");
  r.code=(m.match(/HTTP (\d+)/)||[])[1]|0;r.msg=e&&e.name==="AbortError"?"Délai dépassé":r.code===429?"Trop de requêtes (429)":r.code?"Erreur HTTP "+r.code:/fetch|network|Load failed/i.test(m)?"Bloqué (CORS ou réseau)":/JSON|Unexpected/i.test(m)?"Réponse illisible":m||"Erreur";}
CK.netRec=netRec;CK.netOk=netOk;CK.netErr=netErr;
function fetchJSON(url,opt,ms){var ctl=typeof AbortController!=="undefined"?new AbortController():null;var o=opt||{};if(ctl)o.signal=ctl.signal;var tm=setTimeout(function(){if(ctl)ctl.abort();},ms||12000);
  var t0=performance.now();
  return fetch(url,o).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json();}).then(function(j){netOk(url,t0);return j;},function(e){netErr(url,e);throw e;}).finally(function(){clearTimeout(tm);});}
function fetchText(url,ms,noStore){var ctl=typeof AbortController!=="undefined"?new AbortController():null;var tm=setTimeout(function(){if(ctl)ctl.abort();},ms||12000);
  var t0=performance.now();
  var op=ctl?{signal:ctl.signal}:{};if(noStore)op.cache="no-store";
  return fetch(url,op).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.text();}).then(function(x){netOk(url,t0);return x;},function(e){netErr(url,e);throw e;}).finally(function(){clearTimeout(tm);});}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
/* Données du robot GitHub (agenda, news crypto, FinancialJuice) : C.data = adresse du site, ex. https://pseudo.github.io/desk */
var DATA_FILE={"/calendar":"/data/calendar.json","/news":"/data/news.json","/fj":"/data/fj.json","/meta":"/data/meta.json","/options":"/data/options.json","/futures":"/data/futures.json","/futpx":"/data/futpx.json"};
function relay(path){if(C.data)return String(C.data).replace(/\/$/,"")+(DATA_FILE[path]||path);return C.relay?String(C.relay).replace(/\/$/,"")+path:null;}
CK.relay=relay;
function raf2(fn){requestAnimationFrame(function(){requestAnimationFrame(fn);});}
function parisTime(ts){return new Date(ts).toLocaleTimeString("fr-FR",{timeZone:"Europe/Paris",hour:"2-digit",minute:"2-digit"});}
function parisDay(d){return d.toLocaleDateString("en-CA",{timeZone:"Europe/Paris"});}
var STABLES={USDT:1,USDC:1,DAI:1,TUSD:1,FDUSD:1,USDP:1,USDD:1,PYUSD:1,GUSD:1,USDE:1,USDS:1,EURT:1,EURS:1,USDG:1,RLUSD:1,USD1:1,XAUT:1,PAXG:1,BUIDL:1,USTC:1};
CK.STABLES=STABLES;
CK.u={$:$,safeUrl:safeUrl,nf:nf,px:px,pct:pct,usd:usd,cls:cls,esc:esc,ago:ago,dur:dur,clock:clock,logo:logo,fetchJSON:fetchJSON,raf2:raf2,sleep:sleep,parisTime:parisTime,parisDay:parisDay};

/* ---------------- État ---------------- */
var S = CK.S = {
  tick:{}, ct:{}, mk:{}, factors:[], prevImpact:{},
  liqHist:[], liqSeen:{}, movers:{spot:[],perp:[]},
  news:{macro:[],crypto:[],wire:[],fut:[]}, newsTab:(function(){var t="";try{t=localStorage.getItem("ck:newsTab")||"";}catch(e){}return /^(futures|tout|x|macro)$/.test(t)?t:"futures";})(), cal:[], nextEv:null,
  fund:{}, oi:null, fg:null, btcD:[], since:Date.now()
};

/* ---------------- Toasts & fenêtres ---------------- */
function toast(html,opt){opt=opt||{};var t=document.createElement("div");t.className="toast in";t.innerHTML=html;$("toasts").appendChild(t);
  raf2(function(){t.classList.remove("in");});
  var close=function(){t.classList.add("out");setTimeout(function(){t.remove();},260);};
  if(opt.ms!==0)setTimeout(close,opt.ms||4500);t.close=close;return t;}
CK.toast=toast;
var openStack=[];
function openOv(id){var o=$(id);if(!o||!o.hidden)return;o.hidden=false;o.classList.add("opening");raf2(function(){o.classList.remove("opening");});openStack.push(o);
  var f=o.querySelector("input,select,textarea");if(f&&!o.hasAttribute("data-nofocus"))setTimeout(function(){f.focus();},30);}
function closeOv(o){if(!o||o.hidden)return;o.classList.add("closing");openStack=openStack.filter(function(x){return x!==o;});
  setTimeout(function(){o.hidden=true;o.classList.remove("closing");if(o.id==="ovChart")$("chartBox").innerHTML="";},200);}
CK.openOv=openOv;CK.closeOv=closeOv;
function wireOverlays(){
  document.querySelectorAll(".ov").forEach(function(o){
    o.addEventListener("mousedown",function(e){if(e.target===o)closeOv(o);});
    o.querySelectorAll("[data-close]").forEach(function(b){b.addEventListener("click",function(){closeOv(o);});});
  });
  document.addEventListener("keydown",function(e){if(e.key==="Escape"&&openStack.length)closeOv(openStack[openStack.length-1]);});
}

/* ---------------- Thème & identité ---------------- */
var root=document.documentElement;
/* View Transition sûre : jamais plus d'une à la fois, et annulée si elle reste bloquée (page non redessinée) */
CK.vt=function(fn){var a=document.activeViewTransition;if(a)try{a.skipTransition();}catch(e){}
  if(!document.startViewTransition||document.visibilityState!=="visible"){fn();return null;}
  var t=document.startViewTransition(fn);if(t.ready)t.ready.catch(function(){});var g=setTimeout(function(){try{t.skipTransition();}catch(e){}},1200);t.finished.then(function(){clearTimeout(g);},function(){clearTimeout(g);});return t;};
function theme(){return root.getAttribute("data-theme")||"dark";}
CK.theme=theme;
function syncThemeBtns(){var t=theme();document.querySelectorAll("[data-theme-set]").forEach(function(b){b.setAttribute("aria-pressed",b.getAttribute("data-theme-set")===t?"true":"false");});}
function setTheme(t,btn){
  if(t===theme())return;
  var apply=function(){root.setAttribute("data-theme",t);ls("theme",t);syncThemeBtns();if(CK.map)CK.map.theme();if(CK.liqmap)CK.liqmap.render();if(CK.bg)CK.bg.theme();};
  if(document.startViewTransition&&!reduce&&btn){var r=btn.getBoundingClientRect();root.style.setProperty("--vx",(r.left+r.width/2)+"px");root.style.setProperty("--vy",(r.top+r.height/2)+"px");CK.vt(apply);}
  else apply();
}
CK.setTheme=setTheme;
/* Logo : image ronde de la marque, utilisée dans l'en-tête et comme icône */
/* Logo : à remplir avec les images de ta marque (data:image/png;base64,…). Vide = le nom s'affiche en texte. */
var LOGO={dark:"data:image/png;base64,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",light:"data:image/png;base64,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",fav:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAATSUlEQVR42tWbeXQdxZXGf1XdT7tka7Hwvsk2xrtsFhPMsBgCBHOSMQRCCCEmkOTMSQhkBQJJJsxMmGTmkDPJSTIwwAQymTkkQEgMIYADNpsXvMuLbNmSZVubtS9P73V31Z0/ult6kg2Y3S6fd/Tcr6u77lf3VtW997vK91K8T00BDhBkXHOBmcBsoBJYCBQDM4AiQDL6dgN7gA5gE7AZ2AHsPsYzTUbf9zbo9wEABehoUEQgnAl8CrgsEjZ7aA+FOsaDRI6SKR2B8hfgj8D6Ye+x7xWI9wqAmzE7pwCfB64H5ioEJQLaQbRrVTjQWG4lDMUg+j0WRkCUtaJFBIWNb9sOPAo8AjQfYwwfGgCawQGXA/8AfCUCAa21KKUNSmkrKEA5Wr+jFxhrAUQrJYix1lpHRGLQmoFfA78EWiJgVaQRHzgAmYjfCNwDjAWF0k6gtdYioiMgBtUboaWtjcaWNlra2+lNpkkHPgBZCZfC3DzKS4oZU15KeWkJmUZiQzBQSlkRa8UaNzKXBuBu4KF3qw3vFID4BTOA/wAuAdCODpRyHCtDZ/pgUzPrt1Wxs6aWI21daFdRVFBA8YhCCvPyyEokEATfD+hNJmnv6qW7txdrLKNKRjJ72lTOnDeL8aNPGaIZjkKsWGONcaPLfwVuidaLdwTC8QKQqWJXA78UUaVK68BxHEcQpdGgwDeG515Zy0vrNtLvpTlt6hQqZ53KzCkTKRkx4rgG1d7VRXVtPZt27GFX7X5ys3K48KzTuXjJmbiOgyCEa4MSY4xBjAu0Rab42DATfc8AZAp/H3BrOOuuUdpxrLU4WiMi/O7p51i9biOTJozjsiWLWTjr1GGrPFix4Zdj7QMqNJvhv2zcsZu/vLKWA4cbWbr4dD7ziYsHtUFrxAbGGONEt/8MuO14QXg7ADK3uPuBm1HaOI6rBZRW4S2r39jCI0+upGLieFYsv4Ixo0oHtjVjLVopVPQ5niYiiIBIKCBRv4YjrTz0+NPsP3SQG5dfwZKF8zO3TzHGt4g4wAPAl45nq3wrADJn/n7gZqWU77iJhLGCozWe7/PjB35La3sbX73uak6dMjGcGWNQWqOPU+C3a1YEsRbHCSd5Z20dv/jt7xk7qoTv3HQDWa4baQOYIPBFJJEBwltrgu+ljvVRvpdyo+/3+15KAt/zRawEQSAiInvrDsoX7rhHHv3jMxI3PwjEWisfVLPWih+9X0Tkv594WlbccY/sP9ggIhKNzUrgp33fS0k0diJZ1LFkfTMAYuHvC4VPe4MvEHl10zb5zDfukk2794QvNuYDFfxYQBgTvm991S75zG13ybptVREIRkSMBH7ai0C4b5hMbwuAE/29yvdS4vueJ2JtjPyq1zfIdd/+gTS1tg3M+kfV/MAXEZGDzS1y7TfvltUbNmdqgvUHQbhqmGxvCoCO/lb4Xqrd91LGWmuNMSIi8tqW7XLtN38gbV3dAzP/Ubd4DC3tHXLtbXfL+qpdIiJijBGxxvpeykSyVAyT8ZgAONENL3heWowJAhOp9r76Q3LNbXcOzLw5AYQfDsKhphb59G13SV1DY2QqRowJAi/Ughci2Zw3AyD+4YbQ7n3fikhgAulL9cvnvv192bKn5oSZ+aNACMIxbajaJdff/kNJe/7AtSDw4kXxhuGmEG+D8ZZXDFQppcq1k8CKaEdr/vGXDzF9wjg+e8UlBMbgOg4nYvONIeE4PPzESpraO7jjpuvjo7MNQr+jBZgTxRwEEJ3h3Vnga8BopZWVSPg1G7fS3tl1wgsPkHAcjDGsWL6MQw2NrN++E0drDKK1oy0wOpLRRjIT7/nK91Llvpdq9f20jRe+tOfLijt/JAcaGsVa+6Fude+2GWPFisieA/Vy413/LIEJxITbtPW9tPW9VGskq/K9lNKR9yRRMKNUa8dYEaW15vHnXmT2tKlMHDMaa+1xH2U/yqa1wpiA6RMnMHX8OFa++Cpaa6ygtKMNUBrJKoAbn/OzgBWAKKW1Voq057Nq3Qa+8KlliMgQ3/5Eb7FzdsPyy3hmzesYY9AKtNLxsXhFJLOJbX8BMEtpLVZEK6V44bX1VEwYR2nxiJNm9gdDjhorwvhR5YwrL+WlN7aglMKKaKWVALMimW08rcsBtFI2FnPV+k186sLzEOGkmv1MT04ELr9gCc+/ui4ONKKUY4fIHKnCshg6rTX1Tc1Y43NaxWQEOalmf3At0AjCgpkz6Ovr50hHJ452UErrKBaxDMjSwDRgWqg24dawdst2Tq2YEqJmDSdri4M10yaNZ+22qti11tGETgOm6Shhka20Y+Moza6a/SyaNXPAngaCFNYe9Ym97Ph3onCVRIHMzH6IDH1OlAeIvw95bhRCGvK+jLzB0DHI0ddCkwagctYMtlfXZKwRyka5ikodnYwAxNGawBjaunuYGQU3YvtXSqG0PuqDCiM38e+gBr/L0H4oNfQ50QDj75nPlbDz0PcpFcWXGTaGjOfE16IxA8ycMpkj7Z0IYSBHKRUjOccFFmWsGzS1tpPluhTl5w8grpRi/6Y3aKndR1ZOLr6XwnEcCstHM3l+Jdm5ebQdrmfPutdIHmnFzS9kwpy5TJlfybYXnsXvT+Gn01Scfiapvh4aq6sRhPGz5zF22gx2rn6R9kP1jD3tNFJ9PXieT+XHP0HD3r0c2LaJnLw8vFSK0omTmbboDEzgsW3Vc1jPwxph1nkXkMjJYetfn8ZxXCww/+JLycrJRUQYVTISENq7eygtKiIj5r7IBUoy7abpSCtFhQWRDQlahamsvu5ual5bg5vIorB8DP09nfS1t9Pd0szkykpeuv/XBKkU+WPK6a+vpX7LBnpaL6erqZn6jRtQrsPkeZUkO7uofvkl3ESCkokTeP2x31G3di06N0HDrh0QBOSOKmfhxy8n1d/DvlfX4CSysIFHy5hxTJlfiUbRVldHS001YoRkZwdnXX0tzfv303XoAKVTp8VWgbWC42jy83Jpbm2ntKiIDEsq0cD0aItQAK0dHYwsKhxIZwyo0TlLKB4zHu0muOSWbzDrokvQWtPV1MC2F/6Cl+xj9GmzWfb125lxznm4jkvdlo2Mnz2b7NwcyqdWMGbGqUyuXERBSSmnTJ2OWKjdvIG8UcUs/fJXOfeGFRhr0CpU86KSUrLy8imfPp2CsnL6ujppPXgA7SaY9XcX4GZlUVBaSsOOrTRW7+KMTy7HWGHexZeSnZuLzVjAiwryaevozFgGAJiugaLofwqguy9JQV5uplWESPoBNgp2rn7kQfa9upqcwiLGzppNqrMHpVzKJkxCOw5lkyvQysGmUrQ3NKC0Q2ACRAQbLWZB4NO8dzeOsZRMnEz5lGmMmzmbc264ifmXLkMBh3ftxE/1s/Dyv2fEKePw+npp2lsdBl49D7HhMS6Rk03Vqr/SuGc3biKB8byjdoS83By6+5JkTjZQpIdHSwNrSTjuYI4yir8HYgkIBcgtKiHvlDFghINVVaSTfdGRSrBRONsA1oIfQCCE4CkVgmHDcHng+2GqVyfC94gwed4CJs5dQBAYmvfuRTsJtq56lo7mZtysLBpr9oSJEe3geSkmLTqTnJGj6G1rZd+G9eAkCIwlMGaIYHk5OST7U8OOSoPu8OABQqk4MQkoJDpb5+cXUJjlkucoPnbVp7lw+dVkO4JpbaIoN4f8hKatrgatwGtpJBefgvxcTls4h+KiPHRfL+nWFpKNB0mkexk/fjzT58wny9X4hw/Qe/gAjgnY8tTvadu9E9dPkjx8gAkzplFaUkLFjApKigpJNTVgensoKy0mxxgmVUzmgus+S1G2ywjXochxKCnKx3UcMtN0WquBHOPwXN+QY152IkF3b99AQhMUT72wmh3bd9Gw6xCB8Xjj3p+Q6uyjq7GdRGEuOYWa7H5N7v7DrP7RP9FysIGEtowugLrXtrLjUAfprm5W//iniA1oO9LO6Lx9TExpmiSP+h21PPmDe8ktKMDxkqSfe4W8kjK89hQj83uYdEo+9fWHqNvTSGlBPrUP/obW7m6OtPtseuQPjJs9i/1dkO46jLWWqj8/z4hR27nqkgspKykGwPN9RhQUDqaoohl2I2ZGUZy/L8zPY//hhoFDjFKKXz32FKvWbqSstAyD4O0+jKMUiUQWoqCvby8rll/O0ovO5a5//0/W76rmgsWLuPna6/juT3/OS1v3EhjD3edfyMKZM7nm2z/E3/0S51e28o2br+PI317jwd//mXFjS7nzy1/ke/f9muYj2/iXb36FyxYv5F8feJTfPbOK2bOmc88XrqGpqZEHn3geoxLI/mb8F14lkZuHRqEUeDXP4vWnOGfRAspLw02ut6+fivF58QooUaq9WwN749QSQNnIkXT2JCMDiJTDUaAVfqofP9mHtoINLOlkEj+Zwvo+a15bx/adu9lWvQdHIN3TTU93BxUTJ5BO9lGUcCnOySHfUUwbU0aqrxdB6O/qoL+3By+dJEgH9HW2Y9JJXCU0HT5EXzJJYA0IBMl+ejpaGZGXT04iQaq3G2sMjnYx/Sn8/iReMok2AYlhxt3V00dZ8cjhZJS9yvdSzwEXaydhtda6ua2Nex94lPtuv3VAA1Zv2ExTWzsJNxH2VEPZPSJCluuQn51Nd7KfwAo5WS7aUTg49PSnSLgOuYkw9uKL0N/vkZudoCAnm+aOLlzXRWtNQU4OPf39iAh52VmkPR+0wliDH1gK87PJcbJp7+tFo492AQEtYMSw9OwzKC4M1f62e3/GHV/6POUlJYgYa4JAA8+7wEbg4likUSXFWBE6urspLipCRDjvjEpO5tbW2YUxQllx8YCLEVn8RheoivEzxuI4mtIRhezeX8/ZC+a8fUp70NNGqUyikxq8Pe6rBv30oX0G/z+oXTJwxmfQQodd4y3GE97raE11XT1lJSMHdjglEg+uyo3oaGlrbXbsRMyZPpVNO3ZHAAxmZU+2FhgzwC+YO31KZvpdRwy0zRqoAWpEBB26iZy9YB67a+tOuljg0bHBMLW+Z38951TOzeAZCbHcGvCAlQoLYq21ljGjysjJzmZbdQ2gsCKcjMEQcNheXUNubg7lpaVYa1Bi4iDGSsCLp/eJsJMZmO6li8/gTy++MsyuT54m0XLx1Isvs/TsMwYOdmLtEJl19NkC7BQRFavIhYtPp7ahgZb2TrRSJxUIkTnTcKSVuoYmli5eFF3T1oYHoJ2RzFpHPBoPeBhQIf1AyEq4XPqxs3jo8T+HIWUrJ5X6K6V46PGVXHru4pBZJqGFR1vZw5HMjo44dYqQftom1jiODu9dfvH57K6tZf+hhtCZOAm0IA6A7D1QT039Ia686LwQEK3EinUiOt0jkcxB7A7rKHP6CxFR1lqDAtd1uemqT/JvD//2pNECkXCSf/LQ//KVqz+Jox1EQcTyUMAvIll1pjscZ0t/DjRZY7RCWWMtSxbO55SyUn7zx2dwHU1gAk7kfd9xHB58YiVTxo5m8YK5YXocrNhAK2iKZIwzYgOH6fiY1wbcDmhrjXW0xlrDd268nudeWcvmXXtwHTcjXnDiNBOl7tdX7WLN2o1868bPDhApjTHxBN8eyTjozbwZRcb3UmKMH1gbsiz2HWyQK2+5Qw63tJ5wLJF4LHWNTbL8lu9KfUPzAEXGmiDwj5MicxwkqSq5+tbvSWtn1xBayolAjWlsbZMrb7ldNmzfNcgTeBckqaNociFH0NgggyZ3zW13D2jCR0uTC99d19AkV379dlnzxuZBUKxY33vnNLm3IEraAbRf3rxVrrr1zgy0jZgPkT1irB1gqb26ZZtcect3Zf22nZnCS+D575oo+SZU2bQvYjKosvVy7be+L//1h6cGBuYFvsRrxodBlf3V/z0pN3znh1J7OJMqa94RVfZdkaWtDb3EtO/x4189wpGudr72uWuYOWVStCJblFbvM1k6POAA7NxXy88efYwJ5eXc+aXP47gO1lq0hiAIfN4BWVq9Y7o8yjiuo0GrOL2yesNmHnp8JadOnsCKK5cxZlRZBl1eIro874ourx1QhPGIusZGHnnyGQ4cbuaLVy3jY5XzBg4/CsSYwMr7SJd/24IJrR0n3mutWP5n5fP87fWNTBpbzhUXLGHR7JlHeWjWvnXBxLGKqzZs38WfXnqZ+sYjXHruWVx72UUfWsHEm5fMQKlWOnAc7RiUclR4i28Mz655nRfXbSTZn2RWxVTOmDeHUyePp2Tk8ZXMtHZ2Ul13kPVbq6jeX09Bfh5Lzz6dS5csDrVIwCJoRExICv5AS2beomhKLgGF1jpQ+thFU2u37GBHTS1tHZ04jmJEYT7FI4vIz8sjy3UHkhZ9ySQdXb109vQi1lJWUsLs6ZM5e/5cxpaPGuLsKK3EGmvE+h9a0dRxlc2FQChtRTQoHO1kLGSWI+2dNBxppbWtnd5kCi8IH5OV5VKQm0d5aQljRpVQXlI8NDFrDULoz4dBK+sKgvoIyuaOq3BSxYWTaC3IeyqcVCoM44iII9YqRECpj7Rw8jhKZ2WuoMJ/IS3GKqXCOjcZSE8PXwVFgagoBiciSiQsnRWxcb3xCVM6+y6KpwdX/gw6wlGRPMnMAaBO+OLpk758/v8BlTDZq3Sg8esAAAAASUVORK5CYII="};
CK.LOGO=LOGO;
function applyIdentity(){
  root.style.setProperty("--accent",C.accent||DEF.accent);
  var nm=C.name&&!/^(CAPTAIN|COCKPIT|DESK)$/i.test(C.name)?C.name:"DAMOUR GLOBAL",tg=(C.tagline==null||/^(cockpit|Trading · Desk|Crypto · Macro|Desk Nasdaq 100)$/.test(C.tagline))?"":C.tagline;
  C.name=nm;C.tagline=tg;
  $("bName").textContent=nm;$("bSub").textContent=tg;
  document.title=tg?nm+" · "+tg:nm;
  $("footBrand").textContent=tg?nm+" · "+tg:nm;
  var mk=$("brandMark");if(!mk.firstChild&&LOGO.dark)mk.innerHTML='<img class="lg-on-dark" src="'+LOGO.dark+'" alt="'+esc(nm)+'"><img class="lg-on-light" src="'+(LOGO.light||LOGO.dark)+'" alt="">';
  /* avec un logo image, le texte du nom est masqué ; sans logo, le nom s'affiche en texte */
  document.querySelector(".brand").classList.add("custom");
  if(LOGO.fav){var fav=document.querySelector('link[rel="icon"]');if(!fav){fav=document.createElement("link");fav.rel="icon";fav.type="image/png";fav.href=LOGO.fav;document.head.appendChild(fav);}}
  document.body.classList.toggle("beginner",!!C.beginner);
  /* Un bloc disparaît aussi si son espace est décoché dans le Studio (ex. Screener) */
  var ESPM={plan:"plan",ctx:"plan",day:"journee",events:"journee",news:"news",net:"net"},E=C.espaces||{};
  Object.keys(DEF.modules).forEach(function(k){var on=(!C.modules||C.modules[k]!==false)&&!(ESPM[k]&&E[ESPM[k]]===false);document.querySelectorAll('[data-mod="'+k+'"]').forEach(function(el){el.hidden=!on;});});
  if(CK.layout)CK.layout.refresh();
}
CK.applyIdentity=applyIdentity;

/* ---------------- Barre de prix ---------------- */
var MACRO_STRIP=[{k:"NDX",n:"Nasdaq 100"},{k:"SPX",n:"S&P 500"},{k:"DJI",n:"Dow Jones"},{k:"RUT",n:"Russell 2000"},{k:"DXY",n:"Dollar"},{k:"US05Y",n:"Taux 5 ans"},{k:"US10Y",n:"Taux 10 ans"},{k:"VIX",n:"VIX"},{k:"GOLD",n:"Or"},{k:"BRENT",n:"Brent"}];
function watch(){return [];}
CK.watch=watch;
function buildStrip(){
  var h=watch().map(function(b){return '<button type="button" class="tk" data-chart="OKX:'+esc(b)+'USDT" data-title="'+esc(b)+'"><span class="s">'+esc(b)+'</span><span class="p" data-p="'+esc(b)+'">—</span><span class="c" data-c="'+esc(b)+'"></span></button>';}).join("");
  h+=MACRO_STRIP.map(function(m){return '<button type="button" class="tk" data-chart="'+TVS[m.k]+'" data-title="'+m.n+'"><span class="s">'+m.n+'</span><span class="p" data-mp="'+m.k+'">—</span><span class="c" data-mc="'+m.k+'"></span></button>';}).join("");
  $("strip").innerHTML='<div class="strip-track"><div class="strip-set">'+h+'</div><div class="strip-set" aria-hidden="true">'+h+'</div></div>';paintTicks();paintMacroStrip();
}
CK.buildStrip=buildStrip;
var lastPx={};
function paintTicks(){
  watch().forEach(function(b){var t=S.tick[b+"-USDT"];if(!t)return;var pe=document.querySelector('[data-p="'+b+'"]'),ce=document.querySelector('[data-c="'+b+'"]');if(!pe)return;
    var prev=lastPx[b];roll(pe,px(t.last),prev==null||t.last>=prev);lastPx[b]=t.last;var ch=t.open?(t.last/t.open-1)*100:null;ce.textContent=pct(ch);ce.className="c "+cls(ch);});
}
/* Chiffres qui défilent comme un compteur mécanique */
function roll(el,txt,up){var old=el.getAttribute("data-v")||"";if(old===txt)return;el.setAttribute("data-v",txt);
  if(reduce||!old||old.length!==txt.length){el.textContent=txt;return;}
  el.innerHTML=txt.split("").map(function(ch){return '<span class="d">'+(ch===" "||ch===" "?"&nbsp;":esc(ch))+'</span>';}).join("");
  [].forEach.call(el.children,function(s,i){if(txt[i]!==old[i]&&s.animate)s.animate([{transform:"translateY("+(up?"70%":"-70%")+")",opacity:0},{transform:"none",opacity:1}],{duration:280,easing:"cubic-bezier(.23,1,.32,1)"});});}
CK.roll=roll;
var tickQueued=false;
function queueTicks(){if(tickQueued)return;tickQueued=true;setTimeout(function(){tickQueued=false;paintTicks();if(CK.liqmap)CK.liqmap.price();},300);}
function paintMacroStrip(){
  MACRO_STRIP.forEach(function(m){var d=S.mk[m.k];var pes=document.querySelectorAll('[data-mp="'+m.k+'"]'),ces=document.querySelectorAll('[data-mc="'+m.k+'"]');if(!d||!pes.length)return;
    pes.forEach(function(pe,i){var ce=ces[i];if(!ce)return;
      if(m.k==="US10Y"||m.k==="US05Y"){pe.textContent=nf(d.c,3)+" %";var bp=d.c-d.c/(1+(d.ch||0)/100);ce.textContent=(bp>=0?"+":"−")+nf(Math.abs(bp*100),1)+" pb";ce.className="c "+cls(bp);}
      else{pe.textContent=px(d.c);ce.textContent=pct(d.ch);ce.className="c "+cls(d.ch);}});});
}

/* ---------------- Macro : scanner TradingView (en direct) ---------------- */
var TVS={DXY:"TVC:DXY",US10Y:"TVC:US10Y",US05Y:"TVC:US05Y",ZN:"CBOT:ZN1!",NDX:"NASDAQ:NDX",SPX:"SP:SPX",VIX:"TVC:VIX",GOLD:"TVC:GOLD",DJI:"TVC:DJI",RUT:"TVC:RUT",BRENT:"TVC:UKOIL"};
CK.TVS=TVS;
var TV_COLS=["close","change","SMA20","SMA50","SMA200","Perf.W","Perf.1M","High.3M","Low.3M","ADX"];
function loadMacro(){
  var keys=Object.keys(TVS);
  return fetchJSON(TV_SCAN,{method:"POST",headers:{"Content-Type":"text/plain;charset=UTF-8"},body:JSON.stringify({symbols:{tickers:keys.map(function(k){return TVS[k];})},columns:TV_COLS})})
    .then(function(j){var by={};(j.data||[]).forEach(function(o){by[o.s]=o.d;});
      keys.forEach(function(k){var d=by[TVS[k]];if(!d)return;S.mk[k]={c:d[0],ch:d[1],s20:d[2],s50:d[3],s200:d[4],pw:d[5],pm:d[6],h3:d[7],l3:d[8],adx:d[9]};});
      paintMacroStrip();
    }).catch(function(){});
}

/* ---------------- Agenda : seulement ce qui fait bouger le marché ---------------- */
var EV_FR=[[/non-farm employment change/i,"Emplois non agricoles (NFP)"],[/average hourly earnings/i,"Salaire horaire moyen"],[/federal funds rate/i,"Décision de taux de la Fed"],[/fomc economic projections/i,"Projections économiques de la Fed"],[/unemployment claims|jobless claims/i,"Inscriptions hebdo au chômage"],[/core retail sales/i,"Ventes au détail core"],
  [/philly fed manufacturing/i,"Indice manufacturier de Philadelphie"],[/empire state manufacturing/i,"Indice manufacturier de New York"],[/flash manufacturing pmi/i,"PMI manufacturier (flash)"],[/flash services pmi/i,"PMI services (flash)"],[/uom consumer sentiment/i,"Confiance des consommateurs (Michigan)"],[/uom inflation expectations/i,"Anticipations d'inflation (Michigan)"],
  [/beige book/i,"Livre beige de la Fed"],[/nfib small business/i,"Confiance des petites entreprises (NFIB)"],[/industrial production/i,"Production industrielle"],[/capacity utilization/i,"Taux d'utilisation des capacités"],[/employment cost index/i,"Indice du coût de l'emploi"],
  [/nonfarm payrolls|non farm payrolls/i,"Emplois non agricoles (NFP)"],[/core cpi/i,"Inflation core (CPI)"],[/\bcpi\b|consumer price index/i,"Inflation (CPI)"],[/core pce/i,"Inflation PCE core"],[/\bpce\b/i,"Inflation PCE"],
  [/core ppi/i,"Prix à la production core (PPI)"],[/\bppi\b|producer price/i,"Prix à la production (PPI)"],[/fed interest rate decision|fomc (statement|rate)|interest rate decision/i,"Décision de taux de la Fed"],[/fomc minutes/i,"Minutes du FOMC"],[/fomc press conference/i,"Conférence de presse de la Fed"],
  [/unemployment rate/i,"Taux de chômage"],[/initial jobless claims/i,"Inscriptions au chômage"],[/retail sales/i,"Ventes au détail"],[/gdp/i,"PIB"],[/ism manufacturing pmi/i,"ISM manufacturier"],[/ism (non-manufacturing|services)/i,"ISM services"],
  [/jolts/i,"Offres d'emploi JOLTS"],[/adp/i,"Emplois privés ADP"],[/michigan.*sentiment/i,"Confiance des consommateurs (Michigan)"],[/cb consumer confidence|consumer confidence/i,"Confiance des consommateurs"],
  [/s&p global.*composite/i,"PMI composite"],[/s&p global.*services/i,"PMI services"],[/s&p global.*manufacturing/i,"PMI manufacturier"],[/durable goods/i,"Commandes de biens durables"],[/powell/i,"Discours de Powell"],[/fed .*speaks|speech/i,"Discours d'un membre de la Fed"]];
var EV_KEEP=/payrolls|cpi|pce|ppi|interest rate|fomc|powell|unemployment|jobless|retail sales|gdp|ism|jolts|adp|michigan|consumer confidence|pmi|durable goods|speaks|speech|fed chair/i;
var EV_DROP=/import|export|balance of trade|trade balance|auction|bill purchases|crude|eia|api |baker hughes|mba |redbook|treasury|budget|wholesale|business inventories|factory orders|construction|housing|home sales|pending|building permits|current account|tic |money supply|holiday/i;
function evName(t){
  var sp=String(t).match(/^(FOMC Member|Fed Chair(?:man)?|Fed Vice Chair(?:man)?(?: for Supervision)?) (.+?) (?:Speaks|Testifies)$/i);
  if(sp)return (/chair/i.test(sp[1])?(/vice/i.test(sp[1])?"Discours du vice-président de la Fed ":"Discours du président de la Fed "):"Discours de ")+sp[2]+(/member/i.test(sp[1])?" (Fed)":"");
  for(var i=0;i<EV_FR.length;i++){if(EV_FR[i][0].test(t))return EV_FR[i][1]+(/m\/m|mom/i.test(t)?" (mensuel)":/y\/y|yoy/i.test(t)?" (annuel)":"");}return t;}
function evKeep(e){if(EV_DROP.test(e.t))return false;return e.imp==="hi"||EV_KEEP.test(e.t);}
var FF_URL="https://nfs.faireconomy.media/ff_calendar_thisweek.json";
function calSources(){var L=[];var r=relay("/calendar");if(r)L.push(r);L.push("https://api.allorigins.win/raw?url="+encodeURIComponent(FF_URL));return L;}
function fetchFirst(urls){var i=0;function next(){if(i>=urls.length)return Promise.reject(new Error("aucune source"));var url=urls[i++];
  return fetchJSON(url,null,12000).then(function(a){if(!Array.isArray(a)||!a.length)throw 0;return a;}).catch(next);}return next();}
function loadCalendar(){
  return fetchFirst(calSources()).then(function(arr){arr=arr.filter(function(e){return !e.country||e.country==="USD";});
    S.cal=arr.map(function(e){var imp=String(e.impact||"").toLowerCase();return {ts:Date.parse(e.date),t:e.title,fr:evName(e.title),imp:imp.indexOf("high")>=0?"hi":imp.indexOf("med")>=0?"md":"lo",a:e.actual,f:e.forecast,p:e.previous};})
      .filter(function(e){return !isNaN(e.ts)&&evKeep(e);}).sort(function(a,b){return a.ts-b.ts;});
    var seen={};S.cal=S.cal.filter(function(e){var k=e.ts+"|"+e.fr;if(seen[k]){if(e.imp==="hi")seen[k].imp="hi";seen[k].n++;return false;}e.n=1;seen[k]=e;return true;});renderCal(true);})
    .catch(function(){renderCal(false);});
}
/* Secours : calendrier officiel TradingView (en direct, sans relais) */
function tvEvents(host){
  if(host.querySelector(".tradingview-widget-container"))return;host.innerHTML="";
  var c=document.createElement("div");c.className="tradingview-widget-container cal-tv";var w=document.createElement("div");w.className="tradingview-widget-container__widget";c.appendChild(w);
  var s=document.createElement("script");s.src="https://s3.tradingview.com/external-embedding/embed-widget-events.js";s.async=true;var tw0=performance.now();s.onload=function(){if(CK.netOk)CK.netOk(s.src,tw0);};s.onerror=function(){if(CK.netErr)CK.netErr(s.src,new Error("Widget non chargé"));};
  /* fond opaque : en transparent, l'en-tête collant du widget se superpose aux lignes */
  s.innerHTML=JSON.stringify({colorTheme:theme()==="light"?"light":"dark",isTransparent:false,width:"100%",height:"100%",locale:"fr",importanceFilter:"0,1",countryFilter:"us"});
  c.appendChild(s);host.appendChild(c);
}
CK.tvEvents=tvEvents;
function renderCal(ok){
  var host=$("cal");if(!host)return;
  S.calFail=!ok;
  if(!ok){tvEvents(host);$("nextEvent").innerHTML="";S.nextEv=null;if(CK.day)CK.day.render();return;}
  var now=Date.now(),today=parisDay(new Date()),tom=parisDay(new Date(now+864e5));
  var L=S.cal.filter(function(e){var d=parisDay(new Date(e.ts));return d===today||d===tom;});
  S.nextEv=S.cal.filter(function(e){return e.ts>now&&e.imp==="hi";})[0]||S.cal.filter(function(e){return e.ts>now;})[0]||null;
  $("calMeta").textContent="Annonces US majeures · heure de Paris";
  var h="",cur="";
  L.forEach(function(e){var d=parisDay(new Date(e.ts));if(d!==cur){cur=d;h+='<div class="cday">'+(d===today?"Aujourd'hui":"Demain")+'</div>';}
    var det=[e.a?"Réel "+e.a:"",e.f?"Prév. "+e.f:"",e.p?"Préc. "+e.p:""].filter(Boolean).join(" · ");
    h+='<div class="crow'+(e.ts<now?" past":"")+'"><span class="t">'+parisTime(e.ts)+'</span><span class="e" title="'+esc(e.t)+'">'+esc(e.fr)+(e.n>1?'<small>'+e.n+' publications à la même heure</small>':'')+(det&&!(e.n>1)?'<small>'+esc(det)+'</small>':'')+'</span><span class="i '+e.imp+'">'+(e.imp==="hi"?"Fort":"Moyen")+'</span></div>';});
  host.innerHTML=h||'<div class="empty">Aucune annonce majeure aujourd\'hui ni demain.</div>';
  tickNext();if(CK.day)CK.day.render();
}
function tickNext(){
  var e=S.nextEv,host=$("nextEvent");if(!host)return;
  if(!e){host.innerHTML="";return;}
  var ms=e.ts-Date.now();if(ms<=0){renderCal(true);return;}
  var dayTxt=parisDay(new Date(e.ts))===parisDay(new Date())?"":" (demain)";
  host.innerHTML='<div class="lbl">Prochaine annonce '+(e.imp==="hi"?"à fort impact":"importante")+'</div><div class="ev">'+esc(e.fr)+' · '+parisTime(e.ts)+dayTxt+'</div><div class="cd">'+(ms>864e5?dur(ms):clock(ms))+'</div>';
}

/* ---------------- News ---------------- */
var HOT=/\b(fed|fomc|powell|cpi|ppi|pce|nfp|payrolls|jobs report|rate (cut|hike|decision)|tariff|trump|sec\b|etf|treasury|yields?|ecb|boj|china|opec|war|strike|missile|sanction)/i;
var TR=lsj("tr")||{},trBusy=false,trDead=0;
CK.trGet=function(t){return TR[t];};CK.trNow=function(L){translate(L);};
function trSave(){var k=Object.keys(TR);if(k.length>700){var n={};k.slice(-500).forEach(function(x){n[x]=TR[x];});TR=n;}lsj("tr",TR);}
/* FinancialJuice au plus près du direct, sans se faire bloquer (le site bloque les appels trop rapprochés) :
   · 1 appel par minute (3 min si l'onglet est caché) ; un seul onglet appelle, les autres reprennent son résultat
   · jamais de copie du navigateur (no-store)
   · si FinancialJuice bloque : pause de 5 min et copie du robot GitHub en attendant */
var FJ={src:"",ts:0};
function fjApply(items,src,ts){S.news.macro=items;FJ.src=src;FJ.ts=ts||Date.now();S.fjSrc=src;renderNews();if(CK.onNews)try{CK.onNews(items);}catch(e){}}
function fjParse(xml){
  var doc=new DOMParser().parseFromString(xml,"text/xml");return [].slice.call(doc.querySelectorAll("item")).map(function(it){
    var g=function(n){var e=it.querySelector(n);return e?e.textContent.trim():"";};
    return {title:g("title").replace(/^FinancialJuice:\s*/i,""),link:g("link"),ts:Date.parse(g("pubDate"))||0,src:"FinancialJuice",lang:"en"};
  }).filter(function(x){return x.title;});
}
function fjShared(){var c=lsj("fj");if(c&&c.items&&c.items.length&&c.ts>FJ.ts&&Date.now()-c.ts<1800000){fjApply(c.items,c.src||"direct",c.ts);return true;}return false;}
function fjRobot(){
  if(FJ.src==="direct"&&Date.now()-FJ.ts<300000)return Promise.resolve();
  var r=relay("/fj");if(!r){if(!S.news.macro.length)renderNews();return Promise.resolve();}
  return fetchJSON(r+"?t="+Math.floor(Date.now()/60000),null,15000).then(function(a){if(!Array.isArray(a)||!a.length)throw 0;
    var items=a.map(function(x){if(x.fr)TR[x.title]=x.fr;return {title:x.title,link:x.link,ts:x.ts,src:"FinancialJuice",lang:"en"};});
    fjApply(items,"robot");}).catch(function(){if(!S.news.macro.length)renderNews();});
}
function loadFJ(){
  var now=Date.now();fjShared();
  if(now<+(CK.ls("fjPause")||0))return fjRobot();
  if(now-(+(CK.ls("fjLock")||0))<50000)return Promise.resolve();
  CK.ls("fjLock",String(now));
  return fetchText(FJ_RSS,15000,true).then(function(xml){var items=fjParse(xml);if(!items.length)throw 0;S.fjErr=0;
    lsj("fj",{ts:Date.now(),src:"direct",items:items.slice(0,60)});fjApply(items,"direct");
  }).catch(function(){S.fjErr=(S.fjErr||0)+1;CK.ls("fjPause",String(Date.now()+300000));return fjRobot();});
}
/* Un autre onglet vient de récupérer FinancialJuice : on reprend son résultat */
window.addEventListener("storage",function(e){if(e.key&&/:fj$/.test(e.key))fjShared();});
/* News futures : lues par le robot (Bloomberg, Investing.com, Trading Economics, Maison Blanche, Fed…) et déjà traduites */
function loadFutures(){
  var u=relay("/futures");if(!u){S.futErr=true;renderNews();return Promise.resolve();}
  return fetchJSON(u+"?t="+Math.floor(Date.now()/60000),null,15000).then(function(a){if(!Array.isArray(a))throw 0;S.news.fut=a.map(function(x){if(x.fr&&x.title)TR[x.title]=x.fr;return {kind:"fut",title:x.title,link:x.link,ts:x.ts,src:x.src,lang:x.lang||"en"};});S.futErr=false;renderNews();})
    .catch(function(){S.futErr=true;renderNews();});
}
function loadCryptoNews(){
  var u=relay("/news");if(!u){S.cryptoErr=true;renderNews();return Promise.resolve();}
  return fetchJSON(u,null,15000).then(function(a){if(!Array.isArray(a)||!a.length)throw 0;S.news.crypto=a.map(function(x){if(x.fr&&x.title)TR[x.title]=x.fr;return {title:x.title,link:x.link,ts:x.ts,src:x.src,lang:x.lang||"en"};});S.cryptoErr=false;renderNews();})
    .catch(function(){S.cryptoErr=true;renderNews();});
}
/* ---------- Fil crypto à la minute (Tree of Alpha : dépêches, comptes d'actu, annonces des exchanges) ----------
   API publique, sans clé, 30 appels/min max : 1 appel toutes les 20 s (1 min si l'onglet est caché),
   un seul onglet appelle, les autres reprennent son résultat. On ne garde que les dépêches (pas d'articles de blog
   ni de tweets marketing de projets). */
var WIRE_URL="https://news.treeofalpha.com/api/news?limit=200";
/* Trump et la Maison-Blanche : tous les posts (X et Truth Social), ils font bouger le marché */
var WONCH=/^(lookonchain|arkham|spotonchain|EmberCN|ai_9684xtpa|whale_alert|OnchainLens|cryptoquant_com|glassnode|santimentfeed|nansen_ai|PeckShieldAlert|CertiKAlert)$/i,WMAC=/^(DeItaone|zerohedge|FirstSquawk|KobeissiLetter|unusual_whales|WalterBloomberg|Fxhedgers|LiveSquawk|financialjuice|NickTimiraos)$/i,WTRUMP=/^(realDonaldTrump|WhiteHouse|POTUS)$/i,WCAMP=/^(TeamTrump|DonaldJTrumpJr|EricTrump|TrumpWarRoom)$/i;
var WACC=/^(TheBlockCo|CoinDesk|WuBlockchain|lookonchain|WatcherGuru|tier10k|WalterBloomberg|DeItaone|zerohedge|FirstSquawk|Cointelegraph|BitcoinMagazine|whale_alert|arkham|spotonchain|EmberCN|ai_9684xtpa|solidintel_x|unfolded|AggrNews|cz_binance|_RichardTeng|heyibinance|binance|saylor|Strategy|coinbase|CoinbaseMarkets|brian_armstrong|krakenfx|okx|Bybit_Official|benbybit|HyperliquidX|Grayscale|BlackRock|tether|paoloardoino|circle|VitalikButerin|CryptoHayes|KobeissiLetter|BitcoinNewsCom|DegenerateNews|MarioNawfal|Polymarket|SECGov|CFTC|federalreserve|POTUS|WhiteHouse|EricTrump|worldlibertyfi|glassnode|cryptoquant_com|nansen_ai|PeckShieldAlert|CertiKAlert|zachxbt|realDonaldTrump|elonmusk)$/i;
var WVIP=/^(realDonaldTrump|elonmusk|POTUS|WhiteHouse|cz_binance|heyibinance|VitalikButerin|saylor|CryptoHayes)$/i,WMKT=/\b(bitcoin|btc|crypto|doge|ether|tariff|fed\b|rates?\b|economy|stock|market|china|deal|trade|dollar|inflation|reserve|treasury|bank)/i;
var WEX=/(will (list|delist|launch|add|support)|lists?\b|listing|delist|launchpool|hodler|megadrop|perpetual|futures|airdrop|suspend|halt|maintenance of (deposit|withdraw))/i,WNOISE=/(earn\b|tournament|competition|campaign|vouchers?|yield arena|promotion|giveaway|share up to|apr\b|rewards? pool|wallet maintenance)/i;
var WIRE={ts:0,tree:[],tg:[]};
/* ---------- News Telegram (Walter Bloomberg, Watcher Guru, PhoenixNews, BWEnews, unfolded, Whale Alert) ----------
   Via le relais Cloudflare du Desk (relais/desk-news-worker.js), commun à tous les utilisateurs.
   Une seule requête par minute pour toutes les chaînes, seulement quand l'onglet est visible et dans un seul onglet. Vide = désactivé. */
var TG_URL="https://desk-news.captainmanagement8.workers.dev";
function wireParse(a){var out=[],seen={};
  (Array.isArray(a)?a:[]).forEach(function(x){if(!x||!x.title||!x.time)return;var s=x.source||"",t=String(x.en||x.title).replace(/\s+/g," ").trim(),src="",keep=false,kind="tree",h="",nm="";
    if(s==="Twitter"){var m=t.match(/^(.{1,60}?) \(@([A-Za-z0-9_]+)\):\s*(.*)$/);if(!m)return;h=m[2];
      t=m[3];nm=m[1].replace(/[^\w\s.&'-]/g,"").trim()||"@"+h;src=nm;kind="x";keep=WTRUMP.test(h)||(!WVIP.test(h)&&!WCAMP.test(h))||WMKT.test(t);
      t=t.replace(/^(NEW|JUST IN|BREAKING|THE BLOCK|POLICY|MARKETS|FINANCE|TECH|DEALS|UPDATE|ALERT)\s*:\s*/i,function(k){return /BREAKING|JUST IN/i.test(k)?"BREAKING: ":"";});}
    else if(s==="Terminal"){src="Tree News";keep=true;}
    else if(s==="usGov"){src=x.sourceName||"Gouvernement US";keep=true;kind="gov";}
    else if(s==="Blogs"||s==="Proposals"||!s){return;}
    else{src=s.replace(/\s+EN$/,"");keep=WEX.test(t)&&!WNOISE.test(t);kind="ex";}
    if(!keep||(kind!=="x"&&t.length<12))return;
    t=t.replace(/https?:\/\/\S+/g,"").replace(/\s+/g," ").trim();
    if(kind==="x"&&t.length<3)t="Publication sans texte (image ou vidéo) : ouvre le post pour la voir.";
    /* Une dépêche = un titre (première phrase si le texte est long) ; un tweet garde son texte, jusqu'à 280 caractères */
    if(kind!=="x"&&t.length>150){var cut=t.search(/[.!?](\s|$)/);if(cut>40&&cut<220)t=t.slice(0,cut+1);}
    var lim=kind==="x"?280:220;if(t.length>lim)t=t.slice(0,lim-3)+"…";
    var k=t.slice(0,80).toLowerCase();if(seen[k])return;seen[k]=1;
    var sy=[];(x.symbols||[]).forEach(function(q){var c=String(q).split("_")[0];if(c&&sy.indexOf(c)<0&&sy.length<3)sy.push(c);});
    var img=function(u){return /^https:\/\/(pbs\.twimg\.com|tgstatic\.treeofalpha\.com)\//.test(String(u||""))?String(u):"";};
    out.push({title:t,link:x.url||"https://news.treeofalpha.com",ts:+x.time,src:src,lang:"en",sym:sy,fsrc:src,kind:kind,h:h,icon:kind==="x"?img(x.icon):"",img:kind==="x"?img(x.image):"",vip:kind==="x"&&(WVIP.test(h)||WTRUMP.test(h)),trump:kind==="x"&&WTRUMP.test(h),grp:kind!=="x"?"":WTRUMP.test(h)?"trump":WONCH.test(h)?"onchain":WMAC.test(h)?"macro":"news",gros:kind==="x"&&(WACC.test(h)||WVIP.test(h)||WTRUMP.test(h)),truth:/^https:\/\/truthsocial\.com\//.test(String(x.url||""))});});
  return out.sort(function(a,b){return b.ts-a.ts;}).slice(0,140);}
function wireMix(){var seen={},L=WIRE.tree.concat(WIRE.tg).sort(function(a,b){return b.ts-a.ts;}).filter(function(x){var k=x.title.slice(0,60).toLowerCase().replace(/[^a-z0-9]/g,"");if(seen[k])return false;seen[k]=1;return true;}).slice(0,160);
  S.news.wire=L;renderNewsSoft();if(CK.onWire)try{CK.onWire(L);}catch(e){}}
function wireApply(items,ts){WIRE.tree=items;WIRE.ts=ts||Date.now();S.wireErr=0;wireMix();}
function tgApply(items,ts,agent){WIRE.tg=items;WIRE.tgTs=ts||Date.now();wireMix();if(agent){S.agent=agent;if(CK.onAgent)try{CK.onAgent(agent);}catch(e){}}}
function tgShared(){var c=lsj("tg");if(c&&c.items&&c.ts>(WIRE.tgTs||0)&&Date.now()-c.ts<600000){tgApply(c.items,c.ts,c.agent);return true;}return false;}
/* L'agent IA tourne sur le relais : le Desk lit son fil dans la même requête que les news Telegram (toutes les 30 s quand l'agent est à l'écran, sinon toutes les minutes) */
function agentVisible(){var h=document.getElementById("veille");return !!(h&&h.offsetParent);}
/* Fréquence d'appel du relais. Version publique : toutes les 3 min si l'Agent ou les News sont à l'écran, sinon toutes les 10 min
   (l'agent n'écrit que toutes les 30 min) : le relais gratuit tient ainsi un afflux de spectateurs. */
function newsVisible(){var h=document.getElementById("news");return !!(h&&h.offsetParent);}
function tgDelai(){if(!window.CK_PUBLIC)return agentVisible()?30000:60000;return (agentVisible()||newsVisible())?180000:600000;}
CK.tgDelai=tgDelai;
function loadTG(){
  if(!TG_URL||document.hidden)return Promise.resolve();var now=Date.now();tgShared();
  if(now-(+(CK.ls("tgLock")||0))<tgDelai()-5000)return Promise.resolve();
  CK.ls("tgLock",String(now));
  return fetchJSON(TG_URL.replace(/\/$/,"")+"/tg",null,12000).then(function(j){
    var ag=j&&j.agent&&typeof j.agent==="object"?j.agent:null;
    var avs=(j&&j.tg&&j.tg.av)||{};
    var items=(j&&((j.tg&&j.tg.msgs)||j.msgs)||[]).filter(function(m){return m&&m.t&&m.ts;}).slice(0,180).map(function(m){if(!m.av&&avs[m.c])m.av=avs[m.c];return tgItem(m);}).filter(Boolean);
    S.tgErr=0;lsj("tg",{ts:Date.now(),items:items,agent:ag});tgApply(items,null,ag);}).catch(function(){S.tgErr=(S.tgErr||0)+1;if(CK.onAgent&&S.tgErr>=2)try{CK.onAgent(S.agent);}catch(e){}});
}
/* Les comptes « insider » relayés sur Telegram, rangés par groupe */
var TGC={walterbloomberg:"macro",thekobeissiletter:"macro",marketfeed:"macro",WatcherGuru:"news",PhoenixNewsImportant:"news",BWEnews:"news",unfolded:"news",wublockchainenglish:"news",
  lookonchainchannel:"onchain",spotonchain:"onchain",onchainlens:"onchain",ai_9684xtpa:"onchain",arkhamintelligence:"onchain",cryptoquant_official:"onchain",whale_alert_io:"onchain",
  binance_announcements:"ex",bybit_announcements:"ex",okxannouncements:"ex"};
function tgCdn(u){return /^https:\/\/cdn\d*\.(telesco\.pe|cdn-telegram\.org)\//.test(String(u||""))?String(u):"";}
function tgItem(m){var c=String(m.c||""),g=TGC[c]||"news",t=String(m.t).replace(/https?:\/\/\S+/g,"").replace(/\s+/g," ").trim(),src=String(m.src||"Telegram");
  if(t.length<8)return null;
  /* Market News Feed : on garde les titres macro, pas les résultats d'entreprises (EPS, chiffre d'affaires, « est. ») */
  if(c==="marketfeed"&&/(\bEPS\b|\bEST\b|\bEST\.|\bREV\b|\bQ[1-4]\b|EARNINGS|\bSALES\b|NET INCOME|ADJ\.?\s|GUIDANCE|^\$?[A-Z]{1,5}\s*\|)/i.test(t))return null;
  var base={title:t,link:/^https:\/\/t\.me\//.test(m.u)?m.u:"https://t.me/",ts:+m.ts,src:src,lang:/[\u3400-\u9fff]/.test(t)?"zh":"en",sym:[],fsrc:src};
  if(g==="ex"){if(!WEX.test(t)||WNOISE.test(t))return null;base.kind="ex";return base;}
  base.kind="x";base.via="tg";base.h=c;base.grp=g;base.gros=true;base.icon=tgCdn(m.av);base.img=tgCdn(m.img);return base;}
CK.loadTG=loadTG;CK.tgUrl=function(){return TG_URL;};
function wireShared(){var c=lsj("wire");if(c&&c.items&&c.ts>WIRE.ts&&Date.now()-c.ts<600000){wireApply(c.items,c.ts);return true;}return false;}
function loadWire(){
  var now=Date.now();wireShared();
  if(now-(+(CK.ls("wireLock")||0))<18000)return Promise.resolve();
  CK.ls("wireLock",String(now));
  return fetchJSON(WIRE_URL,null,12000).then(function(a){var items=wireParse(a);if(!items.length)throw 0;lsj("wire",{ts:Date.now(),items:items});wireApply(items);})
    .catch(function(){S.wireErr=(S.wireErr||0)+1;if(!S.news.wire.length)renderNewsSoft();});
}
window.addEventListener("storage",function(e){if(e.key&&/:wire$/.test(e.key))wireShared();if(e.key&&/:tg$/.test(e.key))tgShared();});
CK.loadWire=loadWire;
/* ---------- Fil « Tout » et fil « X » : toutes les sources réunies, une couleur par catégorie ----------
   X = tweets des gros comptes (via Tree of Alpha, avec photo et image) · Macro = FinancialJuice · Crypto = dépêches et chaînes Telegram
   Exchange = annonces de listing · Article = sites crypto. Les nouveautés arrivent avec une courte animation. */
var NCAT={fut:["Futures","nm"],x:["X","nx"],macro:["Macro","nm"],tree:["Crypto","nc"],tg:["Crypto","nc"],gov:["Gouv. US","ng"],ex:["Exchange","ne"],art:["Article","na"]};
var NSEEN=null;
function newsTout(){var seen={},L=[];
  S.news.macro.forEach(function(x){L.push(Object.assign({kind:"macro"},x));});
  S.news.fut.forEach(function(x){L.push(Object.assign({kind:"fut"},x));});
  S.news.wire.forEach(function(x){if(x.kind!=="x"||!x.gros)return;L.push(Object.assign({},x));});
  return L.filter(function(x){if(!x||!x.title||!x.ts)return false;var k=x.title.slice(0,60).toLowerCase().replace(/[^a-z0-9]/g,"");if(seen[k])return false;seen[k]=1;return true;}).sort(function(a,b){return b.ts-a.ts;}).slice(0,70);}
function initiales(n){var p=String(n||"?").replace(/[^A-Za-zÀ-ÿ0-9 ]/g,"").trim().split(/\s+/);return ((p[0]||"?")[0]+((p[1]||"")[0]||"")).toUpperCase();}
function chrono(ts){var s=Math.max(0,Math.round((Date.now()-ts)/1000));return s<60?s+" s":s<3600?Math.floor(s/60)+" min":s<86400?Math.floor(s/3600)+" h":Math.floor(s/86400)+" j";}
function newsRich(host,L,lang){
  var premier=!NSEEN;NSEEN=NSEEN||{};var n=0;
  var html=L.map(function(x){
    var id=x.link+"|"+x.ts,neuf=!premier&&!NSEEN[id];NSEEN[id]=1;
    var t=(lang==="fr"&&x.lang!=="fr"&&TR[x.title])?TR[x.title]:x.title;t=t.replace(/^(RUPTURE|DERNI[ÈE]RE MINUTE|DERNI[ÈE]RES? (HEURE|NOUVELLES?)|FLASH INFO|URGENT)\s*:/i,"BREAKING :");var br=/^[^A-Za-z]*(BREAKING|JUST IN|URGENT|FLASH)(?![A-Za-z])/i.test(x.title),C=NCAT[x.kind]||NCAT.tree;
    var anim=neuf?' style="--d:'+Math.min(6,n++)*45+'ms"':'';
    var sy=x.sym&&x.sym.length?'<span class="nr-sy">'+x.sym.map(function(c){return '<b>'+esc(c)+'</b>';}).join("")+'</span>':"";
    if(x.kind==="x"){
      var av=x.icon?'<img src="'+esc(x.icon)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'<span>'+esc(initiales(x.src))+'</span>';
      return '<a class="nr tw'+(x.gros?"":" proj")+(x.img?" hasimg":"")+(neuf?" in":"")+(br?" br":"")+(x.vip?" vip":"")+'"'+anim+' href="'+esc(safeUrl(x.link))+'" target="_blank" rel="noopener noreferrer">'+
        '<span class="nr-av">'+av+'</span><div class="nr-b"><div class="nr-who"><b>'+esc(x.src)+'</b>'+(x.via==="tg"?'<em class="nr-tgb">Telegram</em>':'<span>@'+esc(x.h)+'</span>')+(x.vip?'<em class="nr-vip">VIP</em>':'')+(x.truth?'<em class="nr-truth">Truth Social</em>':'')+(!x.gros?'<em class="nr-proj">Projet</em>':'')+'<i class="nr-t" data-ts="'+x.ts+'">'+chrono(x.ts)+'</i>'+(x.truth||x.via==="tg"?'':'<svg class="nr-x" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.8 3h3.1l-6.8 7.8 8 10.2h-6.3l-4.9-6.4-5.6 6.4H2.2l7.3-8.3L1.8 3h6.4l4.4 5.9L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z"/></svg>')+'</div>'+
        '<p class="nr-tx">'+esc(t)+'</p>'+sy+'</div>'+(x.img?'<span class="nr-img"><img src="'+esc(x.img)+'" alt="" loading="lazy" referrerpolicy="no-referrer"></span>':'')+'</a>';
    }
    return '<a class="nr '+C[1]+(neuf?" in":"")+(br?" br":"")+'"'+anim+' href="'+esc(safeUrl(x.link))+'" target="_blank" rel="noopener noreferrer"><div class="nr-who"><em class="nr-cat">'+(br?"Breaking":C[0])+'</em><span>'+esc(x.src||"")+'</span><i class="nr-t" data-ts="'+x.ts+'">'+chrono(x.ts)+'</i></div><p class="nr-tx">'+esc(t)+'</p>'+sy+'</a>';
  }).join("");
  var fx=S.newsTab==="x"?'<div class="nr-f" role="group" aria-label="Filtrer les tweets">'+[["tous","Tous"],["macro","Macro"],["news","News"],["trump","Trump"]].map(function(z){return '<button type="button" data-xf="'+z[0]+'" aria-pressed="'+((S.xFiltre||"tous")===z[0])+'">'+z[1]+'</button>';}).join("")+'</div>':'';
  host.innerHTML=fx+'<div class="nr-l">'+(html||'<p class="nr-vide">Aucun tweet pour ce filtre dans les dernières heures.</p>')+'</div>';
}
/* Les « il y a » des cartes avancent tout seuls */
setInterval(function(){document.querySelectorAll(".nr-t[data-ts]").forEach(function(e){e.textContent=chrono(+e.getAttribute("data-ts"));});},10000);
var CRYPTO_RE=/\b(bitcoin\w*|btc|ethereum|ether|eth|crypto\w*|solana|xrp|ripple|dogecoin|doge|binance|coinbase|stablecoin\w*|defi|nft\w*|altcoins?|blockchain|tether|usdt|usdc|memecoins?|tokens?|airdrops?|on-?chain|saylor|microstrategy|satoshi|halving|hodl)\b/i;
function newsList(){return newsBase().filter(function(x){return !CRYPTO_RE.test(x.title||"");});}
function newsBase(){
  if(S.newsTab==="futures")return S.news.fut;
  if(S.newsTab==="tout")return newsTout();
  if(S.newsTab==="x"){var xf=S.xFiltre==="onchain"?"tous":(S.xFiltre||"tous");return S.news.wire.filter(function(x){return x.kind==="x"&&x.gros&&(xf==="tous"||x.grp===xf);});}
  return S.news.macro;
}
function renderNews(){
  var host=$("news");if(!host)return;var tab=S.newsTab;
  var src=$("newsSrc");if(!src){var hd=host.closest(".mod")&&host.closest(".mod").querySelector(".mhd");if(hd){src=document.createElement("span");src.className="meta news-src";src.id="newsSrc";hd.appendChild(src);}}
  if(src){var m=S.news.macro[0],age=m&&m.ts?ago(m.ts):"";src.innerHTML=tab==="futures"?'<i class="ns-rb"></i>Bloomberg · Investing.com · Trading Economics · Maison Blanche · Fed'+(S.news.fut[0]&&S.news.fut[0].ts?" · dernière news "+ago(S.news.fut[0].ts):""):tab==="macro"&&FJ.src?(FJ.src==="direct"?'<i class="ns-live"></i>Direct · dernière news '+age:'<i class="ns-rb"></i>Copie du robot · dernière news '+age):
    (tab==="tout"||tab==="x")&&S.news.wire.length?'<i class="ns-live"></i>'+(tab==="x"?"Comptes X et insiders en direct":"Toutes les sources en direct"):tab==="crypto"&&S.news.wire.length?'<i class="ns-live"></i>Fil en direct · dernière dépêche '+ago(S.news.wire[0].ts):tab==="articles"?"Articles · 6 sites, toutes les 10 min":"";}
  document.querySelectorAll("#newsSeg button").forEach(function(b){b.setAttribute("aria-pressed",b.getAttribute("data-n")===tab?"true":"false");});
  var lang=S.newsLang||C.newsLang||"fr";$("newsLang").textContent=lang==="fr"?"FR":"VO";$("newsLang").setAttribute("aria-pressed",lang==="fr"?"true":"false");
  var L=newsList().slice(0,tab==="x"?120:tab==="tout"?80:40);
  if(!L.length){host.innerHTML='<div class="empty">'+(tab==="futures"?(S.futErr?"Les news futures ne sont pas encore publiées par le robot (voir Connexions). Nouvel essai dans quelques minutes.":"Chargement des news futures…"):tab==="macro"?(S.fjErr?"FinancialJuice ne répond pas pour le moment, nouvel essai dans quelques minutes.":"Connexion à FinancialJuice…"):(tab==="x"?"Connexion au fil des tweets…":"Chargement des news…"))+'</div>';return;}
  if(tab==="futures"||tab==="tout"||tab==="x"){newsRich(host,L,lang);if(lang==="fr")translate(L);return;}
  var note=tab==="crypto"&&!S.news.wire.length&&S.news.crypto.length?'<div class="lq-note" style="margin-bottom:6px">Fil en direct indisponible : derniers articles en attendant.</div>':tab==="articles"&&S.cryptoErr?'<div class="lq-note" style="margin-bottom:6px">Articles crypto indisponibles pour le moment : headlines crypto de FinancialJuice en attendant.</div>':"";
  host.innerHTML=note+L.map(function(x){var t=(lang==="fr"&&x.lang!=="fr"&&TR[x.title])?TR[x.title]:x.title;
    var sy=x.sym&&x.sym.length?' · '+x.sym.map(function(c){return '<b class="nw-s">'+esc(c)+'</b>';}).join(""):"";
    return '<a class="nw'+((x.sym?/^BREAKING/.test(x.title)||x.src==="Tree News":HOT.test(x.title))?" hot":"")+'" href="'+esc(safeUrl(x.link))+'" target="_blank" rel="noopener noreferrer"><div class="h">'+esc(t)+'</div><div class="m">'+esc(x.src)+' · '+ago(x.ts)+sy+'</div></a>';}).join("");
  if(lang==="fr")translate(L);
}
CK.renderNews=renderNews;
function translate(L){
  if(trBusy||Date.now()<trDead)return;var todo=L.filter(function(x){return x.lang!=="fr"&&!TR[x.title];}).slice(0,25).map(function(x){return x.title;});if(!todo.length)return;
  trBusy=true;var chunks=[];for(var i=0;i<todo.length;i+=6)chunks.push(todo.slice(i,i+6));
  chunks.reduce(function(p,ch){return p.then(function(){return trGoogle(ch).catch(function(){return trMyMemory(ch);});}).then(function(res){if(res)ch.forEach(function(s,i){if(res[i])TR[s]=res[i];});});},Promise.resolve())
    .catch(function(){trDead=Date.now()+15*60000;})
    .finally(function(){trBusy=false;trSave();renderNewsSoft();});
}
var softT=null;function renderNewsSoft(){clearTimeout(softT);softT=setTimeout(renderNews,200);}
function trGoogle(list){
  var q=list.map(function(s){return s.replace(/\n/g," ");}).join("\n");
  return fetchJSON("https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=fr&dt=t&q="+encodeURIComponent(q),null,10000).then(function(j){
    var parts=(j[0]||[]).map(function(s){return s[0];}).join("").split("\n").map(function(s){return s.trim();});if(parts.length!==list.length)throw 0;return parts;});
}
function trMyMemory(list){
  return Promise.all(list.map(function(s){return fetchJSON("https://api.mymemory.translated.net/get?q="+encodeURIComponent(s.slice(0,480))+"&langpair=en|fr",null,10000).then(function(j){
    var t=j&&j.responseData&&j.responseData.translatedText;if(!t||/MYMEMORY WARNING|QUOTA/i.test(t)||j.responseStatus!==200)throw 0;return t;});}));
}

/* ---------------- Graphique ---------------- */
var tvP=null;
function loadTV(){if(window.TradingView)return Promise.resolve();if(tvP)return tvP;tvP=new Promise(function(res,rej){var s=document.createElement("script");s.src="https://s3.tradingview.com/tv.js";var t0=performance.now();s.onload=function(){netOk(s.src,t0);res();};s.onerror=function(){tvP=null;rej();};document.head.appendChild(s);});return tvP;}
/* Le widget gratuit refuse certains symboles (« disponible uniquement sur TradingView ») :
   on affiche un équivalent qui suit le même marché ; le lien TradingView garde le symbole d'origine. */
var EMBED={"TVC:US10Y":"FRED:DGS10","TVC:DXY":"CAPITALCOM:DXY","TVC:VIX":"CAPITALCOM:VIX","NASDAQ:NDX":"CAPITALCOM:US100","SP:SPX":"CAPITALCOM:US500","CBOT:ZN1!":"OANDA:USB10YUSD"};
function openChart(sym,title){
  var show=EMBED[sym]||sym;
  $("chartTitle").textContent=(title||sym)+" · "+show;$("chartLink").href="https://www.tradingview.com/chart/?symbol="+encodeURIComponent(sym);
  openOv("ovChart");var box=$("chartBox");box.innerHTML='<div class="empty">Chargement du graphique…</div>';
  loadTV().then(function(){box.innerHTML='<div id="tvc" style="height:100%"></div>';
    new window.TradingView.widget({container_id:"tvc",symbol:show,interval:"D",theme:theme()==="light"?"light":"dark",autosize:true,locale:"fr",timezone:"Europe/Paris",style:"1",hide_side_toolbar:false,allow_symbol_change:true,studies:["MASimple@tv-basicstudies"]});
  }).catch(function(){box.innerHTML='<div class="empty">Le graphique TradingView n\'a pas pu se charger. Utilise « Ouvrir sur TradingView ».</div>';});
}
CK.openChart=openChart;

/* ---------------- Câblage général ---------------- */
var HELP={
  day:"La journée en un coup d'œil, à l'heure de Paris. Les trois bandes montrent les sessions de Tokyo, Londres et New York : la bande qui brille est ouverte. La zone hachurée, c'est le chevauchement Londres–New York, le moment où il y a le plus de volume. Les repères en bas : annonces économiques (rouge = fort impact) et règlements du funding.",
  map:"Chaque ligne est un indicateur suivi par les traders crypto. ▲ vert : il pousse dans le sens de la hausse. ▼ rouge : il pèse. ● gris : pas de signal net. Les trois crans indiquent la force du signal (tendance de fond, moyen terme et court terme alignés). Survole une ligne pour voir les chiffres, la règle utilisée et le lien vers le graphique. Clic pour l'épingler.",
  events:"Seules les annonces américaines qui font vraiment bouger le marché sont gardées (inflation, emploi, Fed, PMI…). Le compte à rebours montre la prochaine annonce importante : le prix peut partir fort dans un sens ou dans l'autre à ce moment-là.",
  deriv:"Le funding, c'est ce que paient les traders à levier pour garder leur position. Positif : les acheteurs paient (beaucoup de longs). Négatif : les vendeurs paient. L'open interest, c'est le total des positions ouvertes : s'il grimpe vite, le levier s'accumule.",
  movers:"Les cryptos qui ont le plus monté et le plus baissé sur 24 h, parmi celles qui ont assez de volume pour être tradées correctement. Clique sur une ligne pour ouvrir le graphique.",
  liq:"La carte montre où se trouvent les liquidations probables : chaque barre est un niveau de prix où des positions à levier seraient fermées de force. Rose sous le prix : des longs. Vert au-dessus : des shorts. Les gros amas agissent souvent comme des aimants pour le prix. Comme la carte de Coinglass, c'est une estimation, calculée à partir de l'open interest et du flux acheteur/vendeur de Binance, heure par heure. Sous la carte : les vraies liquidations en direct sur OKX, Bybit et Binance.",
  screener:"Le screener analyse les cryptos les plus liquides d'OKX. Choisis un préréglage, ou ouvre « Filtres » pour régler chaque condition toi-même. Les signaux de la dernière colonne expliquent pourquoi chaque coin est sorti. Clique sur une ligne pour ouvrir le graphique, sur l'étoile pour l'ajouter aux favoris.",
  news:"Macro : les headlines FinancialJuice en temps réel (Fed, géopolitique, chiffres). Crypto : les dernières news des principaux médias crypto. Les titres marqués d'un trait sont ceux qui font souvent bouger le marché."
};
function wire(){
  wireOverlays();
  document.querySelectorAll("[data-theme-set]").forEach(function(b){b.addEventListener("click",function(){setTheme(b.getAttribute("data-theme-set"),b);});});
  document.addEventListener("click",function(e){var c=e.target.closest("[data-chart]");if(!c||e.target.closest(".star")||document.body.classList.contains("editing"))return;e.preventDefault();openChart(c.getAttribute("data-chart"),c.getAttribute("data-title"));});
  $("news").addEventListener("click",function(e){var b=e.target.closest("[data-xf]");if(!b)return;e.preventDefault();S.xFiltre=b.getAttribute("data-xf");renderNews();});
  $("newsSeg").addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;S.newsTab=b.getAttribute("data-n");try{localStorage.setItem("ck:newsTab",S.newsTab);}catch(x){}renderNews();$("news").scrollTop=0;});
  $("newsLang").addEventListener("click",function(){S.newsLang=(S.newsLang||C.newsLang||"fr")==="fr"?"vo":"fr";renderNews();});
  document.querySelectorAll("[data-help]").forEach(function(b){b.addEventListener("click",function(){var k=b.getAttribute("data-help"),box=document.querySelector('[data-helpbox="'+k+'"]');if(!box)return;box.textContent=HELP[k]||"";box.hidden=!box.hidden;});});
  document.addEventListener("visibilitychange",function(){if(!document.hidden){paintTicks();}});
  /* Projecteur : la bordure de la carte s'éclaire sous le curseur */
  var spot=null;document.addEventListener("pointermove",function(e){var c=e.target.closest&&e.target.closest(".card");if(!c)return;if(spot)return;spot=requestAnimationFrame(function(){spot=null;var r=c.getBoundingClientRect();c.style.setProperty("--mx",(e.clientX-r.left)+"px");c.style.setProperty("--my",(e.clientY-r.top)+"px");});},{passive:true});
}

/* ---------------- Démarrage ---------------- */
function safe(fn){try{fn();}catch(e){if(window.console)console.error("[cockpit]",e);}}
CK.boot=function(){
  applyIdentity();syncThemeBtns();buildStrip();wire();
  S.moversMkt=C.moversMarket;S.newsLang=C.newsLang;
  [function(){if(CK.bg)CK.bg.boot();},function(){if(CK.layout)CK.layout.boot();},function(){if(CK.day)CK.day.boot();},function(){if(CK.pos)CK.pos.boot();},function(){if(CK.extra)CK.extra.boot();},function(){if(CK.plan)CK.plan.boot();},function(){if(CK.ui)CK.ui.boot();},function(){if(CK.hub)CK.hub.boot();},function(){if(CK.worlds)CK.worlds.boot();},function(){if(CK.sound)CK.sound.boot();},function(){if(CK.net)CK.net.boot();}].forEach(safe);
  renderNews();
  loadMacro();
  
  loadCalendar();loadFJ();loadFutures();loadWire();
  (function wl(){setTimeout(function(){loadWire().then(wl,wl);},document.hidden?60000:20000);})();
  /* On ouvre l'Agent ou les News avec des données de plus de 3 min : on les rafraîchit tout de suite */
  setInterval(function(){tickNext();},1000);
  setInterval(function(){document.querySelectorAll("[data-ago]").forEach(function(e){e.textContent=ago(+e.getAttribute("data-ago"));});},2000);
  setInterval(loadMacro,120000);
  
  setInterval(loadCalendar,900000);
  (function fj(){setTimeout(function(){loadFJ().then(fj,fj);},document.hidden?180000:60000);})();
  document.addEventListener("visibilitychange",function(){if(!document.hidden&&Date.now()-FJ.ts>60000)loadFJ();});
  setInterval(loadFutures,180000);
  setInterval(function(){if(!document.hidden)renderNewsSoft();},60000);
};
window.Cockpit={boot:function(){CK.boot();}};
})();
