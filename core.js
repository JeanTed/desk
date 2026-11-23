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
    CK.u.fetchJSON(url+"?t="+Math.floor(Date.now()/60000),null,12000).then(function(j){if(j&&j.fut){F.y=j;if(cb)cb();}}).catch(function(){});
    var ub=CK.relay&&CK.relay("/briefing");if(ub)CK.u.fetchJSON(ub+"?t="+Math.floor(Date.now()/60000),null,12000).then(function(j){if(j&&j.titre){F.brief=j;if(cb)cb();}}).catch(function(){});
    var us=CK.relay&&CK.relay("/sentiment");if(us)CK.u.fetchJSON(us+"?t="+Math.floor(Date.now()/60000),null,12000).then(function(j){if(j&&j.ts&&j.n){F.senti=j;if(cb)cb();}}).catch(function(){});
    var ur=CK.relay&&CK.relay("/resultats");if(ur)CK.u.fetchJSON(ur+"?t="+Math.floor(Date.now()/60000),null,12000).then(function(j){if(j&&j.rows){F.res=j;if(cb)cb();}}).catch(function(){});
    var um=CK.relay&&CK.relay("/marche");if(um)CK.u.fetchJSON(um+"?t="+Math.floor(Date.now()/60000),null,15000).then(function(j){if(j&&typeof j==="object"){F.mk=j;if(cb)cb();}}).catch(function(){});};
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
  id:"damour", name:"Mon Desk de Trading", tagline:"", data:"", accent:"#FF8A3D", theme:"dark", beginner:false,
  watchlist:[],
  modules:{hmap:true,bias:true,week:true,plan:true,ctx:true,day:true,map:false,events:true,deriv:false,liq:false,movers:false,screener:false,news:true,levels:true,opts:true,book:false,corr:false,net:true,veille:false},
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
var DATA_FILE={"/calendar":"/data/calendar.json","/news":"/data/news.json","/fj":"/data/fj.json","/meta":"/data/meta.json","/options":"/data/options.json","/futures":"/data/futures.json","/futpx":"/data/futpx.json","/briefing":"/data/briefing.json","/sentiment":"/data/sentiment.json","/resultats":"/data/resultats.json","/marche":"/data/marche.json","/calendrier":"/data/calendrier.json"};
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
/* Logo : icône orange « D » aux bougies (carré arrondi), utilisée dans l'en-tête et comme icône */
/* Logo : à remplir avec les images de ta marque (data:image/png;base64,…). Vide = le nom s'affiche en texte. */
var LOGO={dark:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJAAAACQCAYAAADnRuK4AAAb6ElEQVR42u2de5RV9ZXnP/v3+91nvQB5I6I8RMQHKq3is9VEh6xEOz7KvGyNttPp6ekk0xNnpu2sAbJWm24z0+rMdB5tYrRNuhNIuqMxGo0RNRqiTYxEQVRUEEXkWc976957fr89f5x7C6oAKYUqbhVnLy5r1YV1zlnn96393t8tHARRVeHxxZYLlngBBcDl0JcenMnqX84PbZvmm57O40OleLSJKuOD+iYJUVpCoPbfE/mgIqgxqHVlg+0MLrXFpHLryTasYdSklcw9f6XM+aN1RD3xWYGwaJFl8WIvInrgdz9Q4CxrNdK6zPeC5rkfzQ+vP3Up2zd82BTaT0BLjaiH4CFo/NGDcvtEdp3ErtdpJP5YC1gg0xXyLS8yZuov/MwF96dP/cTKXjAtvcpy1dJwIED6wCeoS5daaW31VSA18NSdn2DDb2+gY9MCtAClEkQBVAKIIiIoUr1jgpzBQpLGSglVBRUEgxPIZIA8tExe4afN+44953M/EJHu/mc56ABSVaFVjCzDq2raP3PXjbJuxRdN59szKXRAOYC1EYipXj8By6FXTwoaCN6RMpBvJjROWqfTz77dnnX9nSJS1quwLNX3rY3kfYLHiEgAobL2yYXuhR/fwvaX59HRBkE8xgpgkjOrawkErxi1NI+CMbOej066/ObUcRc8RKy4qmc8MBnwYS9fvsiJSNiq2uSX3/5N99QdD7LhmXm0tUdIKmCsTcAzLMRgrEVSgbb2iDdXznNP/b8H/S9v++ZW1SYRCcuXL3IHVQPp8kVOLlgSlbp2nOwe+eq95p3nTqS9K+AygCagGd5RXCAqQUuTCRPnvRBdcvM1mcYxq2pnfsAAql2o8uqKS82zd33PvLO6CU+EcQ5NQvCRgSGB4CNscGHi3M5w2g2fSc1ZcP9AQCQDAU/04sPX2n+/97tsflmwWV+NDxMZeeLxJcvEWepP/fRn3ckfuWd/IJL9gmfVw9fa5+6+m83rAi4HmpisEa6NAlERJs40/tRrrtsfiGTv0dZSK9Lq9bWnP6q/+sZPZdPLIbicGDQJyQ+LME3UREXVybONnPtnH5MZZz9Qw8R+AVQL40qd209w9/33FWbjqgZcThPNczhqoh4JU0/qji67bUGmqenFvYX4Zi9JQlHVhvTPv/pDs3l1IzYbEvAchqJqsJlgNq9udA8v+aGqNlSxIfvOAy1rNbLM+PDIbbex5fnjiSRKHObDWizeRObd548Pj/zv22SZ8SxrNXsFUFwPWeYrLz/xIfPWr2+kozMO1RM5zE2ZdXR0RmbjMzdWXn7iQ9K6zOvSpbYPgFRVWL1aVTVtfvuDO9j5NtiMJK0WiYDGWGh7C/PbH96hqukqVgQg1jCLF1tZsiTSD0+93nS+cTwV8VhNTFciNRBZKuJN5+vH8/R3rpclS76pMXai2CkSYbNqfvzd1682W9cehaSSqCuRPaMyrUgYd9ybW667a+5EkQKqGB5fbAV04uNfbzWlzdMIkkRdiew9KgsSTGnztImPf71VQHl8sRVVBJRwz588Y3a8PJ9IQhJ5JcK+Sh1WTThi9kpz7bfPAMGIoKy6b54pbJlPyQOSgCeRfYZklD2msGU+q+6bJ1JtxQivPnk5WhCs9Unklch7RmTGerQg4dWnLgcwqirs2HQxpTLVNtREEnkvZ9pQKsHOty5WVTG8+NB0ejpOJApJs3siA2tCjBSKHSfy4kPTjV+7/HQj5RxKSACUyMAG0QhGyjm/9snTjXRtm496QBLnJ5GBYkhRj3S9O9/Q0zmX4EEk0T6JDNQPEoKHno65hnJxGkET/yeR9xOMCUEh6plmCNH4KoASSWTgszxB0Sgabwy+sZr6STRQIgOHUACrodGoj9LJ+0jkA1myEKVdTLEiw4V/Ysg1dSL7niWT4HH1XLpQIATFGDlkh6mAKqhq75sSAYOQxK2Kq2f0iAGbd1CO+QDkEAxsihHEVjl3aoUerxAp6hWvGgNK5LDUWK4+W08AK1S8cuvPN/HA2g7KXofcphiBrDM0ZwxjGxxHNqeYMSbD7LEZZo3NMKE5hUvbmDSrHPA+pkEykgDokJsuMcL1Szfw/We3YrOpmDtJD8WQXfUvrTKrCVgnjG2wHDc2y1nTGrloRiMLpjaQb3LgFS0Fgh5a0zt0Oelbz60rJyioYjKWZ17r4sxvvUJL1vXxPw5NzCpU//Q+Y8UrPZGCV8QJx47NsPDYZq4+aRRnTmsEJ9Dj8UGxI1gl1Z0GCgrGCK9sL1GbgfRaBzqx3zM4KzTZuCMvqPLajjK3P7mFf/jNVs49upE/PWMsV8xtweYdWvQoihmBXrer52Snvpdzewgisf5+mla1EUDOCSbl8Ko89loXj73ayelHNXDTeeO58qTRiIAv+RFn1obl4GA5UqIQRz86yKarRnrqjGCFKldoHNbvXgGKCWjjL5ozFgRWvl3gqu+9wSWzt/M3l0zmtGMa0WIUa1lJAHRItJJXOLIlRUvOoVUQDZZEIfZzukqBjpKnoxTABxDBOUM2JdiqCdsdTL6qnhrSBhHh4Vc6ePKNLv7b+RP48oUTcSnBl/yI8I2GFYCsEboKEYsvO5LPnDGWqBDhBvEQgkLZK10Vz7aC5822Mmu29vDbt4v8blORV7eXqJQjbMqSTwkigt8NSaFq+5pzDh+UJQ9v4rF1ndx55VHMnpQb9OdPAPQemkiqpmUwNZA1kLNCLptiXEuaOVPyXGLisL6nELFqc5GfvdLJT9e08/w7RVClMWsx/YDkQ5wEHdWU4lfruzjn66/w7SuP4rJ5Y4i6K8MaRIZhTH4cdpEgD85Hq59ICeWAL0ZE3RG+GJF1whnHNPKVj0zm2f90LA9eN52Pzx1FOVI6ilGv77T781a80pJzdFUCl9/7Bncs34zLO7wybOkm3XBuSRkyFvNa1LebulOlN2GYMsLCuaNYeHwLv36jm1sf38x9L7XjjKEhbYh200ZRUFJWcFb44n1vsaM7YslHpuB7PIbhV8BNxngOAMBGYr8sKPhiRCgFzjqmgZ98dib/ds10Zh2Rpr07iutk0te3AmhucHzlF+/w1z97C5uzdZDvSgB0SBhyjRWsjUP+UPL4kuePTh7Nb/58Nn921jg6eyJ8ANtPg4WgNDemuOXRzXz1kU24vOujrRIAHQZqqFBWtndVKEdxsddInC/yhYjmlPD11qP43tXTSAkUKqFP6F5rV2lqSHHzz9/hn1ZsxTWkhhWIEgAdQI6IjOV/PbWFWX+3mifWd0Ha9kZf1ggaIOqO+PQZ43j0xplMaXJ0lXyfqEurK3YaMpY//clGfvNqBy5n+0RxCYBGsAbqLgd2FndpoP7mzRkh6qrwB0c38sv/OItZR2To6A8ijdd7+QDXLN3Ajo4IcWZYRGYJgA5AA0XV/E6tvBGFuMFsj1DXClEhYsa4DA/fMIMZo9N0l/tmon2AfMawbmuJz/90IyZleksjCYBGoObJ5h2u0ZFLxZqiOWNwjY50du+ZEWeFqMczbWyW+6+dwZicpRSFPrmiyCvNDY7vP7eTHz23HZt3dW/KEhZW3mejmwjFcuAffvUuJeDJDV24tOXu3+1k+YYC01tSXHPqGNTvWadzJtZEc6bk+Oerj2bh3a+hVvp0Hqgq6ZThpp+/w0WzmmnJ2r1eK9FAwxZBUKwElizfzJfv38iT67vJZiz3PLeTxT/byJ3/vh3svrsEnBUqhYiLThjFLR+eTFehrykLCvmUYf22Hr72xLuYdH2bsgRAHzD3MzbvaGhMkU8JqtCSsbhMilHZ/RO8OSNE3RFfunAClxzXTEexL4iioOSzjm88s531m4tVECUAGpFOdO1gveo+nei9ZrGrGu3/fnQKzTlDtNvUiQIpK7R1R/z901urEZkmAEqk78RHVPLMOjLPfz17PIWe/lGZksta/nnVTjZt6cGm6lMLJQDi0PY3hZ7AF84Zx/RxGYqVXVGZAmkrbO+MuOf5HVCnvlACoEO+aTLQ3Jzi8wvGUi6HPo33QRWXEv7l922Uuj3WSgKgRPppIRG0FPjjU8Zw5Jg0PVHoDdmDQi5lWL25hxUbupC0qbu8UAKgetBCUWD06DStJ46iVAp9qvZGhOCVf3upHaoZ7wRAiewRlqlXPnniKNJp0yeSC6rYlPDYa12UCx5XZ2YsARB7NtJHYWjHqK0IlAOnTMlz0sQshfIuZzoo5Jzh1e0lXtpSBFdf0VgCIPoRsacNrjGFuKFdl+aDYnOWD81oIkR9p1itEUqlwDMbC+CkrqKxBEC7t5mmDI+u7WDxfRt5dUsPVLPMQ0ZmFeD8YxoRu5f7VgcVGXqSkgRAAyV1IC08sLadJb94k5e29MAQtlSICESBkyZkOaLBUQm7ZaZVESO8tK0ElYCpozGgBEC7dwYGaEwbnEmRsnFHoQ5hZhqvTGxOMW1UitLu4Xy1tLGxvUJnwSNG6qbZLAFQVVI1JjJiJ9pWfx7KoT+viklbpo9Ox4xssist7Yyws+B5tzsCUz/hfAKgqv+zrRDR1hVRqMRORnuPZ2dXhbYeP8TMbHDUqHQfX0cBY+Km/G3dFTDUDYDc4b3FEcQK7d0Rf/id19hRiCgHJZ9P84UHN1G+7y0umtnEDz9zDKEchsx5ndjo9iC3MQhRCOwsxuQO8cNLAqB6ke2FiC3dEVlnEIGOnkB3IaK96If8WVqyds8ZVYkR31X2dRWGJSas5gNZIW3jma646QvEydATHyhknNk7SKpsIYeKN/uwBZAO0Jzpbkx2St+f98qSJnsyhshh9otnDoc6kwyCFql4pex3dSRGIeaNPuCpUoFSFPb5b+mqipTEiWbI6PDKkSeXMgeNEUwEjsg7BKHsA8WK0pI1ZJ3QkjvwV9rWE/ZCyhjfuDFt62q5gBvJmWWTcTyy6l3uW7ON/3LuVI6f0kQo+w/MlirVNUctGcvjN8zA5hxfeWgTtz+xme9eMZ0PH9+ClANU9IA4EN/tquyhYwKKM8LonK1GYAmAhkwDtfdE7MsqHMhUBg2OfCoOqVuyltFNKeiODui6BHizrRy3eOy+nivEzWVjGxyEKnd14gMNrgYK1d9UZ+PT8P3IMA/UB4p3ZezmA0UH5gNZEULJ8/rOMsbKrkkMia8/Jm+Z0BCvVhBJnOjBVa1ph8k40lYIAbIpg804XMocvEUs1f0rtejrQKKwUN0Psrmjwoa2CpndyBUEqARlakuKpnyVnTbxgQYv6qpEgeWv7KAi8PK2Ig1py683tLF2e4HxOceZR49CD5Iq8rVVUAd4OVUFZ/n9uz1s745oytjezkQjgnplzrgMpAy+Uj/srm7kTR4L5aDc/9I2OkoReWfJpw0rNrTTUfKcMrmJM48ZfXBYLatc0KNzjvQBNqBp1R488UYX6gMi/aIthflT8nWXaHIjlb+wMe2oWoXe6QYQ8gfJhDkjUPLcdM44/uLMI+LwuvzBycOtEXzR8+hrnRjXtw/JByWTMZwxJQ9Rfe3ccCPdiTbVX9lwkJ3omlbIpQ25jH3vtPUAzKDJGH73Rhe/39xDfrdZeFOlxpszLsucCTnYrU8ocaLrSRWbuO5VUyBW4p/3p1FU44mKA0ruqSJW+JcX2iiX9xzr8RXlwhmNpPO2zwx9AqA6auvYVojo7qpQqMQhcnvJE5UqtO2nGi8cWFeFAsYZdu4ss/SFNjKZPcd6jBU+PqclBlpCMFV/6MmlhEUXTKAHWP5KJ796vZPrTjuCqWMyzGxJxUvlGLxpDJez/NNTO3lrR4mW3VhaTZWLaO7EeDOilkPdLWhxh/tUaM2P+dKFE6EpRVi2gcfWtnHdKaM599QjoLMMlcFJ3KmCsYaOjgr/5zdbSadtH+fZiBBVlE+eNIp0g6vLvRqJCavakZ5CRNRVoVgFS0cpEHVVKA9iQ5kPislabn9qK69v7SG3G4WLEPf+HNHkuHbeGDiAGl4CoCF0omvL5KT63WCZjKCKy1hefavA3z+9hXy2L6GmNUKxx/Ppk0czeXwWXwl1uaQuAdAgJQb3v2kornv8xQNv0VEMOCt9iqcVr4xqsPzl2ePQKOya0Eic6KHd5rO/7/onBr90zjj+80FIDLIferxUY4qvPfwOD69t7+M4156lrTviixdOYNqkHL47qtvthiMWQF6VqJZIlNhkxByGg58YfE/weCXV4Pjli2389S820diPC7qWODxmbIabzp9AKIW63vY8YksZDel48a2vtp7mUxZrTLWksZ/ZrEFql4iC4vKOl94u8qkfru/d4Bz6jTiXK55bL5nMqOYUvhDV1SjziAaQVBGQTVluOn8qJu14YNUWfvLSNj47fypzpjQiUbw4d18AERiUgmXk43zPhm09XHrPa+woePKZvktVnBXauyI+c9oYrjxtDL4Q1f1i3hFdTCUbO8OqSi5laMg6KEVD/jwVr6TyjnVbinz0rtd4fWeZpozt4/dYA4VSYOb4DHd87EhCpX4d58MiCvMadwz2dvpVa1YHtZg6gERhzWF+dn0XF/3jOl7dsSd4RCDyMYjuvepoxjQ7NArDYrf8yI7CBEqR0l6K4s3JQ8gZ5YNircFlLd97Zht//pONFCOlsT94qp9CyXNP6zTOnNVI1D181oGPXACJgA+cNKmRa80kJjWnq87x4B5MUEURbN7R0RXxP+7fyDd+s41c2pJL9V0HLoAxQkdXhVs+Mpk/XjBu2K0BH9EaCK/MmdTInCObIAqDVhStra4UwFR3Zfxk1U5u/vkmXtrcQ3PeEeibQpDqesyOrgo3f2gif3XxZKJCNOx2yI/4YqpGoZdzUA42IZVWSxJGsDkHqvz6jS5uffxd7lvTjrOGloY9F+maqint6I74nxdPZsnCyfiixwrJ3vghZRRjAD6N0NuVqAdws1qNTKvazVpB0gZjhUrB8+iadv7xmW08+HI75Uhpqmqi/uBxRuiJApVIueOyI/n8H07AF4fnzvhhDaDaxhsZdDsYN1aLkVh1mDjz11OIeP6tLh56pYP717Tz/Ds9oEpj1pLt5+vULuWs0FaIGNfg+PanjuLSk0cTdXvcMI6F3bDVPhr3OZtBDKtCiLPYXeXAtmLEm20V1mzt4bdvF3luU5F120tUyh6bMjRlDCIxcPqvfLIm/r6ts8K5M5q488qjmD0pN6yirREBIB+UXMay+LHN3LZiWzxgJ4O7E6wnUjpLns5SoLscO+IIOGfIpoR8KlVt4GePUSEjcTTYUYzIpwyLLp7Elz80CWcFXxj+4Bl2ANLqobzVXmH9zvKg53WEuMneVNd3N2VMPORX9YeCQrSX+TJbHVHtLHnUK5fMbuZv/sNkTju6AS16gg91X6IY0SYs7YTMELmcultWOVSjLvZB02tE8Kp0lDwE5fSjGrjpvPFcedLouLDbHRdG67m6PmIApO/hIA9Sp8X7n42vbdNRpRgpUdmTShsunNHA584Yx+VzR2EzBi36eMjRjBzg1C2ApMrBc+wRGbT6wq0cWsBItadIdss2V3zsH+EVccKxYzMsPLaZq08axZnTGmKSxR7fW1EfqdR3rh4XsIVS4PRjGvn0vNF8/9lt2GxMe6uHAEWh9ldN7QlYJ4xtcJwxNstZ0xq4aEYjC6Y2kG9y4BUtBUI5NlcjUevUvQmT6izyd644iuPGZnjg5Q5K0dBz4hiBrBOaM5axecfUlhQzxmQ4dmyWWWPTTGhOQdrEzlE54LsjRGLH28rIBk7vWemt5yp1G3IBGQvlEFP/HwpzGqNhVxKxNszuY0Ipr9pb1zo8IDNcorAqGXso1CKXQ4TjKvtqrYzRWwhFEAEnhyNs+gBIAK3bckXNh9BDONkhBzoAP4I5lJ0ag/io7l9Qcnz1xymg1mHEpMrJ6STygVwM48omiOlC6mr9QiLDoaokoGK6DMZt6e1wSiSR91GUFOO2GNLZDXHZOIFQIgM2XzEVfzq3wZBtXo2x7GK1TiSRAXASGwvZptVGGyesRCygiSudyEARJIhFGyesNPa4854Nmi4imMSRTmSADrQJmi7a48571nDCwtfJNb9QbcxNAJTI/gHkBHKjXuCEha8bEVFGT36ETBpUQ/J+EtmP/xPIZGD05EdERA2AmXXevyJ5JXib5HwTec/sYfAWyauZdeG/AhhVhJMvez7kx68kYwH1yYtKZB/qx5MxhPz4lZy88HlVxPD4IisiqtNO/Qb5JiEk+ElkHxI85JtFp/3BN0REeXyRFVUVRNismh9/9/Wrzda1RyEpRTUh4Exk9+aogFYkjDvuzS3X3TV3okgBVWInetEiO0mk28w6+29pGS1EURKNJdJXokhpGS1m1tl/O0mkm0Wx5Yq1zOLFXhctMpx9w12hafoanFqQxJYlUlM/npTa0DR9DWffcJcuWmRYvNj3MpSJiDJ3rohIOZx29RcYcyT4kiYRWSLxQFtJGT2FcNrVXxCRchUr2ofiTlpbvS69yqZmn/9oOHLBnbQ0OUIUJS/wcA+8ooiWJheOPOvO1OzzH9WlV1lpbfV7bfRTVaFVDEs1G35807Nm/dPHE5wHbPImD0vxmMhy9NlruOJrp9MqPSzVUNM+e+0UVVUjIqHU2XmCu+8vV5iNqxpw2SQqOxyjrqhHwtSTuqPLbluQaWp6sYYN3oulVUSC6lKbaWp60Sz4k0/qpNlCpUhAksjs8EGPUimik44Vs+DGT8bgWWr7g2efNL8irV6XL3Iy44wHwimfvI5JM43xRWUvF0hkBGoeX1QmzTThlE9dJzPOeECXL3Iirf59Dzvo8kVOLlgSRS8+fK1dee93eecVwWY89N9JnciI8Xl8yTLpWPXzr/msO+GSe2oY+MDTMrULVF5dcal59q7vmXdebCKSCOscSRPjyFnd6H2EUxcmzu0MZ1z/mdSsBffvDzwDHreqXajUteNk98hX7zWbf3cibZ0BlwES53qYoycQlaClyYSJp7wQXfJX12Qax6waCHgGvOpALlgSLV++yGUax6za8fFbzw5zPvYtxk81mMgQfJT4RsPU1wk+QiqG8VNNOO5j39px+a1nZxrHrFo+QPC874HPXWGcUFn35EL3ux/fwvZX5tGxE4J4jBUQk/hHdS0xU4VRS/MoOGL289GJV9ycOu68h2IKnT1D9YM6MVxLNsoyvKqmeebuG8O6p79out6eSXcHWg6ItVEMpPdcEpgIQ0mprYHgHSkL+SZonLLOT19wuz3r+jtFpKxXYfsnCQd15FyXLu1Naatqg19x5yfs+uduoO3tBWgBSiWoaJWeSeIlFUqNAyUB1WCBRatzW6oaT09gcAKZNEgDNE9e4afN+44953M/EJHu/mc5pJwFqiosazXSuiy+ucuhL/xoPi8/dWnYvvHDptB2AlpqhAi8r7FU7qKYTxgvDt5eqZqu7yVEt3G2hUxXyLe8aMZM/UVl5nn3p0+9YiVRT1UJXGW5aun71joHnfRCVYXHF1suWOJ7h6RdDn3pwZms/eX8sH3TfNPTeXyoFI8mqow3Gpo0RGkJSa32oLx/4xDjykFMJy61xaRy68k2rGHUpJXMvXilzFm4rhc0ICxaZFm82B8IcGry/wEzCjSa2e9NmQAAAABJRU5ErkJggg==",light:"data:image/png;base64,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",fav:"data:image/png;base64,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"};
CK.LOGO=LOGO;
function applyIdentity(){
  root.style.setProperty("--accent",C.accent||DEF.accent);
  var nm=C.name&&!/^(CAPTAIN|COCKPIT|DESK|DAMOUR GLOBAL)$/i.test(C.name)?C.name:"Mon Desk de Trading",tg=(C.tagline==null||/^(cockpit|Trading · Desk|Crypto · Macro|Desk Nasdaq 100)$/.test(C.tagline))?"":C.tagline;
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
  var ESPM={hmap:"plan",bias:"plan",week:"journee",plan:"plan",ctx:"plan",day:"journee",events:"journee",news:"news",net:"net"},E=C.espaces||{};
  Object.keys(DEF.modules).forEach(function(k){var on=(!C.modules||C.modules[k]!==false)&&!(ESPM[k]&&E[ESPM[k]]===false);document.querySelectorAll('[data-mod="'+k+'"]').forEach(function(el){el.hidden=!on;});});
  if(CK.layout)CK.layout.refresh();
}
CK.applyIdentity=applyIdentity;

/* ---------------- Barre de prix ---------------- */
var MACRO_STRIP=[{k:"NDX",n:"Nasdaq 100"},{k:"MNQ",n:"MNQ"},{k:"SPX",n:"S&P 500"},{k:"MES",n:"MES"},{k:"DJI",n:"Dow Jones"},{k:"RUT",n:"Russell 2000"},{k:"DXY",n:"Dollar"},{k:"US05Y",n:"Taux 5 ans"},{k:"US10Y",n:"Taux 10 ans"},{k:"VIX",n:"VIX"},{k:"GOLD",n:"Or"},{k:"BRENT",n:"Brent"}];
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
var TVS={DXY:"TVC:DXY",US10Y:"TVC:US10Y",US05Y:"TVC:US05Y",ZN:"CBOT:ZN1!",NDX:"NASDAQ:NDX",SPX:"SP:SPX",VIX:"TVC:VIX",GOLD:"TVC:GOLD",DJI:"TVC:DJI",RUT:"TVC:RUT",BRENT:"TVC:UKOIL",MNQ:"CME_MINI:MNQ1!",MES:"CME_MINI:MES1!"};
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
/* Fusion avec le calendrier détaillé de TradingView (robot) : valeur publiée, prévision, précédent, description */
var TVSYN={cpi:"inflation",ppi:"producer",nfp:"nonfarm",pmi:"pmi"};
function tvTok(t){return String(t).toLowerCase().replace(/\b(m\/m|y\/y|q\/q|mom|yoy|qoq|prelim|final|flash|advance|adv|global|s&p)\b/g," ").replace(/[^a-z ]/g," ").split(/\s+/).filter(function(w){return w.length>=3;}).map(function(w){return TVSYN[w]||w;});}
function tvMerge(cal,tv){
  var by={};tv.forEach(function(x){var k=Math.round(x.ts/60000);(by[k]=by[k]||[]).push(x);});
  cal.forEach(function(e){var k=Math.round(e.ts/60000),L=(by[k]||[]).filter(function(x){return !x.used;});if(!L.length)return;
    var tk=tvTok(e.t),best=null,sc=0;L.forEach(function(x){var tt=tvTok(x.t),s=tk.filter(function(w){return tt.indexOf(w)>=0;}).length;if(s>sc){sc=s;best=x;}});
    if(!best&&L.length===1&&cal.filter(function(o){return Math.round(o.ts/60000)===k;}).length===1)best=L[0];
    if(best){best.used=1;e.tv=best;e.a=best.a||e.a;e.f=e.f||best.f;e.p=e.p||best.p;}});
}
var EV_WHY={inf:"L'inflation guide la politique de la Fed : plus forte que prévu, elle fait craindre des taux élevés plus longtemps, ce qui pèse sur le Nasdaq.",
  emp:"Un emploi très solide peut retarder les baisses de taux ; un emploi faible nourrit les craintes de récession. Les deux font bouger l'indice.",
  cb:"Les décisions et les mots de la Fed donnent la direction des taux. Le ton (ferme ou souple) compte autant que la décision.",
  tre:"Une adjudication faible (demande insuffisante) fait monter les taux longs, ce qui pèse sur les valeurs de croissance.",
  ene:"Stocks et production de pétrole influencent le baril, donc l'inflation et le secteur de l'énergie.",
  imm:"L'immobilier est très sensible aux taux : il montre l'effet du coût de l'argent sur l'économie.",
  con:"La consommation pèse environ 70 % de l'économie américaine : une surprise change les attentes de croissance.",
  act:"Mesure de l'activité : plus fort que prévu = économie solide (mais taux plus hauts), plus faible = craintes de ralentissement.",
  aut:"Annonce économique américaine : c'est l'écart avec la prévision qui fait bouger le marché."};
function evStars(imp){var n=imp==="hi"?3:imp==="md"?2:1;return '<span class="stars" role="img" aria-label="Importance : '+n+' sur 3">'+[1,2,3].map(function(i){return '<i class="'+(i<=n?"on":"")+'">★</i>';}).join("")+'</span>';}
function evBubble(e,ty){
  var n=e.imp==="hi"?3:e.imp==="md"?2:1,r=function(k,v){return v?'<br>'+esc(k)+' : <b>'+esc(v)+'</b>':'';};
  var b=esc(parisTime(e.ts))+' (Paris) · importance '+n+' sur 3'+(e.tv&&e.tv.per?' · période : '+esc(e.tv.per):'')+r("Actuel",e.a)+r("Prévision",e.f)+r("Précédent",e.p)+
    '<br><br>'+esc(e.tv&&e.tv.c?e.tv.c:EV_WHY[ty])+'<br><br><em>Ce qui compte : l\'écart entre le chiffre publié et la prévision.</em>'+(e.t&&e.t!==e.fr?'<br><small>Titre d\'origine : '+esc(e.t)+'</small>':'');
  return ' data-x="'+esc('<b>'+esc(e.fr)+'</b><span>'+b+'</span>')+'"';
}
function loadCalendar(){
  return fetchFirst(calSources()).then(function(arr){arr=arr.filter(function(e){return !e.country||e.country==="USD";});
    S.cal=arr.map(function(e){var imp=String(e.impact||"").toLowerCase();return {ts:Date.parse(e.date),t:e.title,fr:evName(e.title),imp:imp.indexOf("high")>=0?"hi":imp.indexOf("med")>=0?"md":"lo",a:e.actual,f:e.forecast,p:e.previous};})
      .filter(function(e){return !isNaN(e.ts)&&evKeep(e);}).sort(function(a,b){return a.ts-b.ts;});
    var seen={};S.cal=S.cal.filter(function(e){var k=e.ts+"|"+e.fr;if(seen[k]){if(e.imp==="hi")seen[k].imp="hi";seen[k].n++;return false;}e.n=1;seen[k]=e;return true;});
    var rc=relay("/calendrier");if(!rc){renderCal(true);return;}
    return fetchJSON(rc+"?t="+Math.floor(Date.now()/60000),null,12000).then(function(tv){if(Array.isArray(tv))tvMerge(S.cal,tv);}).catch(function(){}).then(function(){renderCal(true);});})
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
/* Famille d'une annonce (couleur dans l'agenda) : reconnue d'après le titre anglais d'origine */
var EV_TYPES=[["inf","Inflation",/\b(cpi|ppi|pce|price index|inflation|deflator|import prices|export prices)\b/i],
  ["emp","Emploi",/employment|payroll|jobless|unemployment|claims|adp|jolts|job openings|nonfarm|non-farm|average hourly|labor|labour|participation rate/i],
  ["cb","Banques centrales",/fomc|federal funds|fed |powell|waller|williams|jefferson|bowman|barr|cook|logan|musalem|schmid|goolsbee|kashkari|bostic|harker|daly|hammack|collins|barkin|mester|rate decision|interest rate|monetary|minutes|ecb|boe|boj|lagarde|bailey/i],
  ["tre","Trésor",/auction|treasury|bond |note |bill /i],
  ["ene","Énergie",/crude|oil|gasoline|distillate|natural gas|eia|rig count|refinery|cushing/i],
  ["imm","Immobilier",/housing|home sales|building permits|mortgage|nahb|home price|construction spending/i],
  ["con","Consommation",/retail|consumer|sentiment|confidence|michigan|spending|personal income|expectations/i],
  ["act","Activité",/gdp|pmi|ism|industrial|durable|factory|production|philadelphia|empire state|manufactur|services|business|trade balance|productivity|capacity|orders|inventories|current account/i]];
var EV_TNAME={inf:"Inflation",emp:"Emploi",cb:"Banques centrales",tre:"Trésor",ene:"Énergie",imm:"Immobilier",con:"Consommation",act:"Activité",aut:"Autre"};
function evType(e){var t=String(e&&e.t||"");for(var i=0;i<EV_TYPES.length;i++){if(EV_TYPES[i][2].test(t))return EV_TYPES[i][0];}return "aut";}
CK.evType=evType;CK.EV_TNAME=EV_TNAME;
function renderCal(ok){
  var host=$("cal");if(!host)return;
  S.calFail=!ok;
  if(CK.plan&&CK.plan.week)setTimeout(CK.plan.week,0);
  if(!ok){tvEvents(host);$("nextEvent").innerHTML="";S.nextEv=null;if(CK.day)CK.day.render();return;}
  var now=Date.now(),today=parisDay(new Date()),tom=parisDay(new Date(now+864e5));
  var L=S.cal.filter(function(e){var d=parisDay(new Date(e.ts));return d===today||d===tom;});
  S.nextEv=S.cal.filter(function(e){return e.ts>now&&e.imp==="hi";})[0]||S.cal.filter(function(e){return e.ts>now;})[0]||null;
  $("calMeta").textContent="Annonces US majeures · heure de Paris";
  var h="",cur="",used={};
  L.forEach(function(e){var d=parisDay(new Date(e.ts));if(d!==cur){cur=d;h+='<div class="cday">'+(d===today?"Aujourd'hui":"Demain")+'</div>';}
    var det=[e.a?"Réel "+e.a:"",e.f?"Prév. "+e.f:"",e.p?"Préc. "+e.p:""].filter(Boolean).join(" · ");
    var ty=evType(e);used[ty]=1;
    function cv(c,v){return '<span class="cv cv-'+c+'">'+(v?esc(v):"—")+'</span>';}
    h+='<div class="crow ty-'+ty+(e.ts<now?" past":"")+'"'+evBubble(e,ty)+'><span class="t">'+parisTime(e.ts)+'</span><span class="e">'+'<span class="ty-tag">'+EV_TNAME[ty]+'</span>'+esc(e.fr)+(e.n>1?'<small>'+e.n+' publications à la même heure</small>':'')+(det&&!(e.n>1)?'<small class="det">'+esc(det)+'</small>':'')+'</span>'+evStars(e.imp)+cv("a",e.a)+cv("f",e.f)+cv("p",e.p)+'</div>';});
  var lg=Object.keys(EV_TNAME).filter(function(k){return used[k];}).map(function(k){return '<span class="ty-chip ty-'+k+'">'+EV_TNAME[k]+'</span>';}).join("");
  if(h&&lg)h='<div class="ty-leg">'+lg+'</div><div class="crow-h"><span>Heure</span><span>Annonce</span><span>Importance</span><span>Actuel</span><span>Prévision</span><span>Précédent</span></div>'+h;
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
/* News futures : lues par le robot (Bloomberg, Investing.com, Maison Blanche, Fed…) et déjà traduites */
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
/* Couleur par source (hors tweets) : le nom avant « · » donne la clé (Bloomberg · Marchés → Bloomberg) */
var NSRC=[[/^bloomberg/i,"bl","Bloomberg"],[/^investing/i,"iv","Investing.com"],[/^maison blanche/i,"mb","Maison Blanche"],[/^r[ée]serve f[ée]d[ée]rale/i,"fe","Réserve fédérale"],
  [/^cnbc/i,"cn","CNBC"],[/^marketwatch/i,"mw","MarketWatch"],[/^financialjuice/i,"fj","FinancialJuice"],[/^tree/i,"tr","Tree News"],[/^trading economics/i,"te","Trading Economics"]];
function nsrc(src){var t=String(src||"");for(var i=0;i<NSRC.length;i++){if(NSRC[i][0].test(t))return NSRC[i];}return null;}
function newsRich(host,L,lang){
  var premier=!NSEEN;NSEEN=NSEEN||{};var n=0;
  var usedSrc={};
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
    var ns=nsrc(x.src);if(ns)usedSrc[ns[1]]=ns[2];
    return '<a class="nr '+C[1]+(ns?" s-"+ns[1]:"")+(neuf?" in":"")+(br?" br":"")+'"'+anim+' href="'+esc(safeUrl(x.link))+'" target="_blank" rel="noopener noreferrer"><div class="nr-who"><em class="nr-cat">'+(br?"Breaking":C[0])+'</em><span class="nr-src">'+esc(x.src||"")+'</span><i class="nr-t" data-ts="'+x.ts+'">'+chrono(x.ts)+'</i></div><p class="nr-tx">'+esc(t)+'</p>'+sy+'</a>';
  }).join("");
  var fx=S.newsTab==="x"?'<div class="nr-f" role="group" aria-label="Filtrer les tweets">'+[["tous","Tous"],["macro","Macro"],["news","News"],["trump","Trump"]].map(function(z){return '<button type="button" data-xf="'+z[0]+'" aria-pressed="'+((S.xFiltre||"tous")===z[0])+'">'+z[1]+'</button>';}).join("")+'</div>':'';
  var lg=Object.keys(usedSrc).map(function(k){return '<span class="ns-chip s-'+k+'">'+esc(usedSrc[k])+'</span>';}).join("");
  host.innerHTML=fx+(lg?'<div class="ns-leg">'+lg+'</div>':'')+'<div class="nr-l">'+(html||'<p class="nr-vide">Aucun tweet pour ce filtre dans les dernières heures.</p>')+'</div>';
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
  if(src){var m=S.news.macro[0],age=m&&m.ts?ago(m.ts):"";src.innerHTML=tab==="futures"?'<i class="ns-rb"></i>Bloomberg · Investing.com · Maison Blanche · Fed'+(S.news.fut[0]&&S.news.fut[0].ts?" · dernière news "+ago(S.news.fut[0].ts):""):tab==="macro"&&FJ.src?(FJ.src==="direct"?'<i class="ns-live"></i>Direct · dernière news '+age:'<i class="ns-rb"></i>Copie du robot · dernière news '+age):
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
/* Mode application : enregistre le service worker (site en ligne uniquement, pas en fichier local) */
try{if("serviceWorker" in navigator&&/^https:|^http:\/\/localhost/.test(location.href))navigator.serviceWorker.register("sw.js").catch(function(){});}catch(e){}

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
  [function(){if(CK.bg)CK.bg.boot();},function(){if(CK.layout)CK.layout.boot();},function(){if(CK.day)CK.day.boot();},function(){if(CK.pos)CK.pos.boot();},function(){if(CK.extra)CK.extra.boot();},function(){if(CK.plan)CK.plan.boot();},function(){if(CK.hmap)CK.hmap.boot();},function(){if(CK.ui)CK.ui.boot();},function(){if(CK.hub)CK.hub.boot();},function(){if(CK.worlds)CK.worlds.boot();},function(){if(CK.sound)CK.sound.boot();},function(){if(CK.net)CK.net.boot();}].forEach(safe);
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
