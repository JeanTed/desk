/* ================================================================
   COCKPIT — cœur : config, données temps réel, analyse, modules
   ================================================================ */
(function(){
"use strict";
var CK = window.CK = {};
var OKX = "https://www.okx.com";
var BFX = "https://fapi.binance.com/futures/data/";
var TV_SCAN = "https://scanner.tradingview.com/global/scan";
var FJ_RSS = "https://www.financialjuice.com/feed.ashx?xy=rss";
var reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
CK.reduce = reduce;

/* ---------------- Config ---------------- */
var DEF = {
  id:"damour", name:"DAMOUR GLOBAL", tagline:"Desk Nasdaq 100", data:"", accent:"#FF8A3D", theme:"dark", beginner:false,
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
var DATA_FILE={"/calendar":"/data/calendar.json","/news":"/data/news.json","/fj":"/data/fj.json","/meta":"/data/meta.json","/options":"/data/options.json"};
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
  news:{macro:[],crypto:[],wire:[]}, newsTab:(function(){var t="";try{t=localStorage.getItem("ck:newsTab")||"";}catch(e){}return /^(tout|x|macro|crypto|articles)$/.test(t)?t:"tout";})(), cal:[], nextEv:null,
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
/* Logo : images de la marque (vides pour l'instant) */
/* Logo : à remplir avec les images de ta marque (data:image/png;base64,…). Vide = le nom s'affiche en texte. */
var LOGO={dark:"",light:"",fav:""};
CK.LOGO=LOGO;
function applyIdentity(){
  root.style.setProperty("--accent",C.accent||DEF.accent);
  var nm=C.name&&!/^(CAPTAIN|COCKPIT|DESK)$/i.test(C.name)?C.name:"DAMOUR GLOBAL",tg=(C.tagline==null||/^(cockpit|Trading · Desk|Crypto · Macro)$/.test(C.tagline))?"Desk Nasdaq 100":C.tagline;
  C.name=nm;C.tagline=tg;
  $("bName").textContent=nm;$("bSub").textContent=tg;
  document.title=nm+" · "+tg;
  $("footBrand").textContent=nm+" · "+tg;
  var mk=$("brandMark");if(!mk.firstChild&&LOGO.dark)mk.innerHTML='<img class="lg-on-dark" src="'+LOGO.dark+'" alt="'+esc(nm)+'"><img class="lg-on-light" src="'+(LOGO.light||LOGO.dark)+'" alt="">';
  /* avec un logo image, le texte du nom est masqué ; sans logo, le nom s'affiche en texte */
  document.querySelector(".brand").classList.toggle("custom",!LOGO.dark);
  if(LOGO.fav){var fav=document.querySelector('link[rel="icon"]');if(!fav){fav=document.createElement("link");fav.rel="icon";fav.type="image/png";fav.href=LOGO.fav;document.head.appendChild(fav);}}
  document.body.classList.toggle("beginner",!!C.beginner);
  /* Un bloc disparaît aussi si son espace est décoché dans le Studio (ex. Screener) */
  var ESPM={plan:"plan",ctx:"plan",day:"journee",events:"journee",news:"news",net:"net"},E=C.espaces||{};
  Object.keys(DEF.modules).forEach(function(k){var on=(!C.modules||C.modules[k]!==false)&&!(ESPM[k]&&E[ESPM[k]]===false);document.querySelectorAll('[data-mod="'+k+'"]').forEach(function(el){el.hidden=!on;});});
  if(CK.layout)CK.layout.refresh();
}
CK.applyIdentity=applyIdentity;

/* ---------------- Barre de prix ---------------- */
var MACRO_STRIP=[{k:"NDX",n:"Nasdaq 100"},{k:"SPX",n:"S&P 500"},{k:"DXY",n:"Dollar"},{k:"US10Y",n:"Taux 10 ans"},{k:"VIX",n:"VIX"},{k:"GOLD",n:"Or"}];
function watch(){var w=(C.watchlist&&C.watchlist.length?C.watchlist:DEF.watchlist).map(function(x){return String(x).trim().toUpperCase().replace(/[^A-Z0-9]/g,"");}).filter(Boolean);return w.slice(0,12);}
CK.watch=watch;
function buildStrip(){
  var h=watch().map(function(b){return '<button type="button" class="tk" data-chart="OKX:'+esc(b)+'USDT" data-title="'+esc(b)+'"><span class="s">'+esc(b)+'</span><span class="p" data-p="'+esc(b)+'">—</span><span class="c" data-c="'+esc(b)+'"></span></button>';}).join("");
  h+='<span class="tk sep" aria-hidden="true"></span>';
  h+=MACRO_STRIP.map(function(m){return '<button type="button" class="tk" data-chart="'+TVS[m.k]+'" data-title="'+m.n+'"><span class="s">'+m.n+'</span><span class="p" data-mp="'+m.k+'">—</span><span class="c" data-mc="'+m.k+'"></span></button>';}).join("");
  $("strip").innerHTML=h;paintTicks();paintMacroStrip();
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
  MACRO_STRIP.forEach(function(m){var d=S.mk[m.k];var pe=document.querySelector('[data-mp="'+m.k+'"]'),ce=document.querySelector('[data-mc="'+m.k+'"]');if(!d||!pe)return;
    if(m.k==="US10Y"){pe.textContent=nf(d.c,3)+" %";var bp=d.c-d.c/(1+(d.ch||0)/100);ce.textContent=(bp>=0?"+":"−")+nf(Math.abs(bp*100),1)+" pb";ce.className="c "+cls(bp);}
    else{pe.textContent=px(d.c);ce.textContent=pct(d.ch);ce.className="c "+cls(d.ch);}});
}

/* ---------------- Temps réel : OKX (prix + liquidations), Bybit, Binance ---------------- */
var LIQ_BASES=["BTC","ETH","SOL","XRP","DOGE","SUI","BNB","ADA","LINK","AVAX"];
var wsUp={OKX:false,Bybit:false,Binance:false};
function setWsState(){var on=Object.keys(wsUp).filter(function(k){return wsUp[k];});$("wsState").textContent=on.length?"Temps réel · "+on.join(", "):"Connexion au temps réel…";}
function socket(name,url,onOpen,onMsg,pingMsg){
  var back=1500,ws,pingT;
  function go(){
    try{ws=new WebSocket(url);}catch(e){return;}
    var nr=netRec(netId(url));
    ws.onopen=function(){nr.open=true;nr.opens++;nr.openTs=Date.now();back=1500;wsUp[name]=true;setWsState();onOpen(ws);clearInterval(pingT);if(pingMsg)pingT=setInterval(function(){try{ws.send(pingMsg);}catch(e){}},20000);};
    ws.onmessage=function(e){nr.lastMsg=Date.now();nr.msgs.push(nr.lastMsg);if(nr.msgs.length>600)nr.msgs.splice(0,300);if(e.data==="pong")return;var m;try{m=JSON.parse(e.data);}catch(x){return;}onMsg(m);};
    ws.onclose=function(){nr.open=false;nr.closes++;nr.lastErr=Date.now();nr.msg="Connexion fermée, reconnexion…";clearInterval(pingT);wsUp[name]=false;setWsState();setTimeout(go,back);back=Math.min(back*2,60000);};
    ws.onerror=function(){try{ws.close();}catch(e){}};
  }
  go();return {send:function(o){if(ws&&ws.readyState===1)ws.send(JSON.stringify(o));}};
}
var okx=null,okxSent={};
function tickerInsts(){var s={};["BTC","ETH","SOL"].concat(watch()).forEach(function(b){s[b+"-USDT"]=1;});(CK.alertInsts?CK.alertInsts():[]).forEach(function(i){s[i]=1;});return Object.keys(s);}
function okxSub(all){var args=[];if(all){okxSent={};args.push({channel:"liquidation-orders",instType:"SWAP"});}
  tickerInsts().forEach(function(i){if(!okxSent[i]){okxSent[i]=1;args.push({channel:"tickers",instId:i});}});
  for(var i=0;i<args.length;i+=20)okx.send({op:"subscribe",args:args.slice(i,i+20)});}
CK.wsResub=function(){if(okx)okxSub(false);};
function startSockets(){
  okx=socket("OKX","wss://ws.okx.com:8443/ws/v5/public",function(){okxSub(true);},function(m){if(!m.arg||!m.data)return;
    if(m.arg.channel==="tickers")onTickers(m.data);else if(m.arg.channel==="liquidation-orders")onOkxLiq(m.data);},"ping");
  if(CK.WITH_LIQ)socket("Bybit","wss://stream.bybit.com/v5/public/linear",function(ws){ws.send(JSON.stringify({op:"subscribe",args:LIQ_BASES.map(function(b){return "allLiquidation."+b+"USDT";})}));},function(m){
    if(!m.topic||!/^allLiquidation/.test(m.topic)||!m.data)return;
    (Array.isArray(m.data)?m.data:[m.data]).forEach(function(x){var b=String(x.s||"").replace(/USDT$/,""),p=+x.p,amt=+x.v*p;if(!(amt>0))return;
      addLiqEvent({ex:"Bybit",base:b,usd:amt,long:x.S==="Buy",px:p,ts:+x.T||Date.now()},"bb"+x.T+x.s+x.v);});
  },JSON.stringify({op:"ping"}));
  if(CK.WITH_LIQ)socket("Binance","wss://fstream.binance.com/ws/!forceOrder@arr",function(){},function(m){var o=m&&m.o;if(!o||!/USDT$/.test(o.s))return;
    var b=o.s.replace(/USDT$/,""),p=+o.ap||+o.p,amt=(+o.z||+o.q)*p;if(!(amt>0))return;
    addLiqEvent({ex:"Binance",base:b,usd:amt,long:o.S==="SELL",px:p,ts:+o.T||Date.now()},"bn"+o.T+o.s+o.q);
  },null);
}
function onTickers(arr){arr.forEach(function(d){S.tick[d.instId]={last:+d.last,open:+d.open24h,high:+d.high24h,low:+d.low24h,ts:+d.ts};if(CK.checkAlerts)CK.checkAlerts(d.instId,+d.last);});queueTicks();}
function onOkxLiq(arr){arr.forEach(function(d){var meta=S.ct[d.instId];if(!meta)return;var b=d.instId.split("-")[0];
  (d.details||[]).forEach(function(x){var sz=+x.sz,p=+x.bkPx,amt=meta.ctType==="inverse"?sz*meta.ctVal:sz*meta.ctVal*p;if(!(amt>0))return;
    addLiqEvent({ex:"OKX",base:b,usd:amt,long:x.posSide==="long"||(x.posSide==="net"&&x.side==="sell"),px:p,ts:+x.ts||Date.now()},d.instId+x.ts+x.sz+x.side);});});}
/* Instruments OKX : taille des contrats + catégorie (1 = crypto, 3 = actions, 4 = matières premières) */
function loadInstruments(){S.cat=S.cat||{};return Promise.all([
  fetchJSON(OKX+"/api/v5/public/instruments?instType=SWAP").then(function(j){(j.data||[]).forEach(function(i){S.ct[i.instId]={ctVal:+i.ctVal,ctType:i.ctType};S.cat[i.instId]=i.instCategory;});}).catch(function(){}),
  fetchJSON(OKX+"/api/v5/public/instruments?instType=SPOT").then(function(j){(j.data||[]).forEach(function(i){S.cat[i.instId]=i.instCategory;});}).catch(function(){})]);}

/* ---------------- Liquidations : flux + résumé ---------------- */
var LIQ_WIN=4*3600000;
function addLiqEvent(it,key,silent){
  if(S.liqSeen[key])return;S.liqSeen[key]=1;S.liqHist.push(it);
  if(!silent&&it.usd>=(C.liqMin||0))addLiqRow(it);
  if(Object.keys(S.liqSeen).length>6000)S.liqSeen={};
}
function addLiqRow(it){var host=$("liqFeed");if(!host)return;var em=host.querySelector(".empty");if(em)em.remove();
  var el=document.createElement("div");el.className="fi new"+(it.usd>=Math.max(250000,(C.liqMin||0)*10)?" big":"");
  el.innerHTML=logo(it.base)+'<div class="w"><b>'+esc(it.base)+'</b> '+(it.long?'<span class="down">long liquidé</span>':'<span class="up">short liquidé</span>')+'<span class="ex">'+it.ex+'</span><small data-ago="'+it.ts+'">'+ago(it.ts)+'</small></div><span class="amt">'+usd(it.usd)+'</span>';
  host.insertBefore(el,host.firstChild);raf2(function(){el.classList.remove("new");});while(host.children.length>8)host.removeChild(host.lastChild);}
function seedLiq(){
  var U=["BTC","ETH","SOL","XRP","DOGE","SUI","BNB","ADA"],seeded=[];
  return Promise.all(U.map(function(b){var inst=b+"-USDT-SWAP";return fetchJSON(OKX+"/api/v5/public/liquidation-orders?instType=SWAP&uly="+b+"-USDT&state=filled&limit=100").then(function(j){var meta=S.ct[inst];if(!meta)return;
    ((j.data&&j.data[0]&&j.data[0].details)||[]).forEach(function(x){var amt=+x.sz*meta.ctVal*(+x.bkPx);if(!(amt>0))return;
      var it={ex:"OKX",base:b,usd:amt,long:x.posSide==="long"||(x.posSide==="net"&&x.side==="sell"),px:+x.bkPx,ts:+x.ts};addLiqEvent(it,inst+x.ts+x.sz+x.side,true);seeded.push(it);});}).catch(function(){});}))
  .then(function(){var now=Date.now();seeded.filter(function(x){return x.usd>=(C.liqMin||0)&&now-x.ts<LIQ_WIN;}).sort(function(a,b){return a.ts-b.ts;}).slice(-8).forEach(addLiqRow);renderLiqSum();});
}
function renderLiqSum(){
  var host=$("liqSum");if(!host)return;var now=Date.now();
  S.liqHist=S.liqHist.filter(function(x){return now-x.ts<LIQ_WIN;});
  var L=0,Sh=0,top=null;S.liqHist.forEach(function(x){if(x.long)L+=x.usd;else Sh+=x.usd;if(!top||x.usd>top.usd)top=x;});
  var tot=L+Sh,share=tot?Sh/tot:0.5;
  host.innerHTML='<div class="lq-row"><span>Longs liquidés</span><b class="down">'+usd(L)+'</b></div><div class="lq-row"><span>Shorts liquidés</span><b class="up">'+usd(Sh)+'</b></div>'+
    '<div class="lq-bar">'+(tot?'<i class="l" style="flex:'+(1-share).toFixed(3)+'"></i><i class="s" style="flex:'+share.toFixed(3)+'"></i>':'')+'</div>'+
    '<div class="lq-note">4 dernières heures · OKX, Bybit, Binance'+(top?'<br>Plus grosse : '+esc(top.base)+' '+usd(top.usd)+' ('+top.ex+', '+ago(top.ts)+')':'')+'</div>';
  S.liqSum={long:L,short:Sh,top:top};
  var f=$("liqFeed");if(f&&!f.children.length)f.innerHTML='<div class="empty">Marché calme : aucune liquidation au-dessus de '+usd(C.liqMin||0)+' pour le moment. Elles s\'affichent ici en direct.</div>';
}

/* ---------------- Macro : scanner TradingView (en direct) ---------------- */
var TVS={DXY:"TVC:DXY",US10Y:"TVC:US10Y",ZN:"CBOT:ZN1!",NDX:"NASDAQ:NDX",SPX:"SP:SPX",VIX:"TVC:VIX",GOLD:"TVC:GOLD",BTC:"OKX:BTCUSDT",TOTAL2:"CRYPTOCAP:TOTAL2",USDTD:"CRYPTOCAP:USDT.D",BTCD:"CRYPTOCAP:BTC.D"};
CK.TVS=TVS;
var TV_COLS=["close","change","SMA20","SMA50","SMA200","Perf.W","Perf.1M","High.3M","Low.3M","ADX"];
function loadMacro(){
  var keys=Object.keys(TVS);
  return fetchJSON(TV_SCAN,{method:"POST",headers:{"Content-Type":"text/plain;charset=UTF-8"},body:JSON.stringify({symbols:{tickers:keys.map(function(k){return TVS[k];})},columns:TV_COLS})})
    .then(function(j){var by={};(j.data||[]).forEach(function(o){by[o.s]=o.d;});
      keys.forEach(function(k){var d=by[TVS[k]];if(!d)return;S.mk[k]={c:d[0],ch:d[1],s20:d[2],s50:d[3],s200:d[4],pw:d[5],pm:d[6],h3:d[7],l3:d[8],adx:d[9]};});
      paintMacroStrip();computeFactors();
    }).catch(function(){computeFactors();});
}

/* ---------------- Données crypto ---------------- */
function loadBTCdaily(){return fetchJSON(OKX+"/api/v5/market/candles?instId=BTC-USDT&bar=1Dutc&limit=200").then(function(j){S.btcD=(j.data||[]).slice().reverse().map(function(c){return {ts:+c[0],o:+c[1],h:+c[2],l:+c[3],c:+c[4]};});}).catch(function(){});}
function loadFunding(){
  return Promise.all(["BTC","ETH"].map(function(b){var inst=b+"-USDT-SWAP";return Promise.all([
    fetchJSON(OKX+"/api/v5/public/funding-rate?instId="+inst).then(function(j){return j.data&&j.data[0];}).catch(function(){return null;}),
    fetchJSON(OKX+"/api/v5/public/funding-rate-history?instId="+inst+"&limit=90").then(function(j){return (j.data||[]).map(function(x){return +x.realizedRate||+x.fundingRate;});}).catch(function(){return [];})
  ]).then(function(a){if(a[0])S.fund[b]={r:+a[0].fundingRate,next:+a[0].fundingTime,hist:a[1]};});})).then(renderDeriv);
}
function loadOI(){return Promise.all(["BTC","ETH"].map(function(b){return fetchJSON(BFX+"openInterestHist?symbol="+b+"USDT&period=1d&limit=10").then(function(a){return {b:b,d:(a||[]).map(function(x){return {ts:+x.timestamp,coin:+x.sumOpenInterest,usd:+x.sumOpenInterestValue};}).reverse()};}).catch(function(){return {b:b,d:[]};});}))
  .then(function(a){S.oi={};a.forEach(function(o){S.oi[o.b]=o.d;});renderDeriv();});}
function loadFG(){return fetchJSON("https://api.alternative.me/fng/?limit=30").then(function(j){var d=j.data||[];if(!d.length)return;var avg=d.reduce(function(s,x){return s+(+x.value);},0)/d.length;S.fg={v:+d[0].value,cls:d[0].value_classification,avg:avg,prev:d[1]?+d[1].value:null};}).catch(function(){});}

/* ---------------- Analyse : structure ---------------- */
function trend(d){
  if(!d||d.c==null||d.s20==null||d.s50==null||d.s200==null)return null;
  var L=(d.c>d.s200&&d.s50>d.s200)?1:(d.c<d.s200&&d.s50<d.s200)?-1:0;
  var M=(d.c>d.s50&&d.s20>d.s50)?1:(d.c<d.s50&&d.s20<d.s50)?-1:0;
  var Sh=(d.c>d.s20&&d.pw>0)?1:(d.c<d.s20&&d.pw<0)?-1:0;
  var dir,str,label;
  if(L===1){dir=1;if(M>=0&&Sh>=0){str=(M===1&&Sh===1)?3:2;label="Tendance haussière";}else{str=1;label="Haussière, en repli";}}
  else if(L===-1){dir=-1;if(M<=0&&Sh<=0){str=(M===-1&&Sh===-1)?3:2;label="Tendance baissière";}else{str=1;label="Baissière, en rebond";}}
  else if(M===1&&Sh===1){dir=1;str=1;label="Retournement haussier en cours";}
  else if(M===-1&&Sh===-1){dir=-1;str=1;label="Retournement baissier en cours";}
  else{dir=0;str=0;label="Sans tendance claire";}
  var pos=(d.h3!=null&&d.l3!=null&&d.h3>d.l3)?(d.c-d.l3)/(d.h3-d.l3):null;
  return {L:L,M:M,S:Sh,dir:dir,str:str,label:label,pos:pos};
}
function invert(d){return {c:-d.c,s20:-d.s20,s50:-d.s50,s200:-d.s200,pw:-d.pw,pm:-d.pm,h3:-d.l3,l3:-d.h3,adx:d.adx,ch:-d.ch};}
function pivots(c,k){var H=[],L=[];for(var i=k;i<c.length-k;i++){var hi=true,lo=true;for(var j=i-k;j<=i+k;j++){if(j===i)continue;if(c[j].h>c[i].h)hi=false;if(c[j].l<c[i].l)lo=false;}if(hi)H.push(c[i]);if(lo)L.push(c[i]);}return {H:H,L:L};}
function swingRead(c){if(!c||c.length<40)return null;var p=pivots(c.slice(-140),3);if(p.H.length<2||p.L.length<2)return null;
  var h1=p.H[p.H.length-2].h,h2=p.H[p.H.length-1].h,l1=p.L[p.L.length-2].l,l2=p.L[p.L.length-1].l;
  return {txt:(h2>h1?"plus hauts croissants":"plus hauts décroissants")+", "+(l2>l1?"plus bas croissants":"plus bas décroissants")+" ("+px(h1)+" → "+px(h2)+" · "+px(l1)+" → "+px(l2)+")"};}
function lvl(x){return x===1?"haussier":x===-1?"baissier":"neutre";}
function adxTxt(a){if(a==null)return null;return nf(a,1)+(a>=25?" · tendance forte":a>=20?" · tendance naissante":" · tendance faible");}
var STR=["","léger","modéré","fort"];CK.STR=STR;

var FDEF=[
  {k:"BTC",nm:"Bitcoin",sh:"BTC",type:"trend",rel:1,dec:0,
    imp:{1:"le marché directeur est porteur : les cassures haussières ont plus de chances de tenir",0:"le marché directeur n'a pas de direction nette : les cassures sont moins fiables","-1":"le marché directeur est baissier : les rebonds restent fragiles"}},
  {k:"TOTAL2",nm:"Altcoins",sub:"capi. hors BTC",sh:"Altcoins",type:"trend",rel:1,big:true,
    imp:{1:"les capitaux entrent sur les altcoins",0:"les altcoins n'ont pas de tendance claire","-1":"les capitaux quittent les altcoins"}},
  {k:"USDTD",nm:"Stablecoins",sub:"dominance USDT",sh:"Stablecoins",type:"trend",rel:-1,dec:2,unit:" %",
    imp:{1:"la part des stablecoins recule : le cash est redéployé vers le risque",0:"pas de mouvement net vers le cash ou hors du cash","-1":"la part des stablecoins grimpe : le marché se met à l'abri"}},
  {k:"OI",nm:"Levier",sub:"open interest Binance",sh:"Levier",type:"oi"},
  {k:"FUND",nm:"Funding",sub:"BTC perp",sh:"Funding",type:"fund"},
  {k:"FG",nm:"Sentiment",sub:"Fear & Greed",sh:"Sentiment",type:"fg"},
  {k:"VIX",nm:"Volatilité",sub:"VIX",sh:"VIX",type:"vix"},
  {k:"US10Y",nm:"Taux US 10 ans",sh:"Taux 10 ans",type:"yield",
    imp:{1:"des taux qui baissent allègent la pression sur les actifs risqués",0:"les taux n'envoient pas de signal net","-1":"des taux qui montent rendent le cash plus attractif et pèsent sur le risque"}},
  {k:"DXY",nm:"Dollar",sub:"DXY",sh:"Dollar",type:"trend",rel:-1,dec:2,
    imp:{1:"un dollar qui faiblit soutient les actifs risqués",0:"le dollar n'envoie pas de signal net","-1":"un dollar fort resserre la liquidité et pèse sur les actifs risqués"}},
  {k:"NDX",nm:"Nasdaq 100",sh:"Nasdaq",type:"trend",rel:1,dec:0,
    imp:{1:"l'appétit pour le risque est là sur la tech, très corrélée à la crypto",0:"la tech hésite : pas de signal net pour le risque","-1":"la tech recule : l'aversion au risque déborde souvent sur la crypto"}}
];
CK.FDEF=FDEF;
function base(f){return {k:f.k,nm:f.nm,sub:f.sub,sh:f.sh};}
function fmtV(d,f){if(f.big)return usd(d);if(f.dec!=null)return nf(d,f.dec)+(f.unit||"");return px(d)+(f.unit||"");}
function trendProof(d,t,f,extra){
  var P=[["Cours",fmtV(d.c,f)+" ("+pct(d.ch)+" auj.)"],["MM20 · 50 · 200",[d.s20,d.s50,d.s200].map(function(x){return fmtV(x,f);}).join(" · ")],
    ["Fond",lvl(t.L)+(t.L===1?" : prix et MM50 au-dessus de la MM200":t.L===-1?" : prix et MM50 sous la MM200":" : signaux mixtes autour de la MM200")],
    ["Moyen terme",lvl(t.M)+(t.M===1?" : prix et MM20 au-dessus de la MM50":t.M===-1?" : prix et MM20 sous la MM50":" : signaux mixtes autour de la MM50")],
    ["Court terme",lvl(t.S)+" : "+(d.c>d.s20?"au-dessus":"sous")+" la MM20, "+pct(d.pw,1)+" sur 1 semaine"]];
  if(t.pos!=null)P.push(["Range 3 mois",nf(t.pos*100,0)+" % (bas "+fmtV(d.l3,f)+" · haut "+fmtV(d.h3,f)+")"]);
  if(d.adx!=null)P.push(["ADX",adxTxt(d.adx)]);
  return (extra||[]).concat(P);
}
var RULE_TREND="Règle : fond = prix et MM50 vs MM200 · moyen terme = prix et MM20 vs MM50 · court terme = prix vs MM20 et perf. 1 semaine. Les trois alignés = signal fort. Données journalières.";
function mkTrend(f){
  var d=S.mk[f.k];var t=trend(d);if(!t)return na(f);
  var impact=t.dir*f.rel,extra=[],label=t.label;
  if(f.k==="USDTD")label=label.replace("Tendance haussière","Part en hausse").replace("Tendance baissière","Part en baisse").replace("Haussière, en repli","Part en hausse, en repli").replace("Baissière, en rebond","Part en baisse, en rebond");
  if(f.k==="BTC"){var sw=swingRead(S.btcD);if(sw)extra.push(["Pivots journaliers",sw.txt]);}
  var longP=t.L===1?"au-dessus de sa MM200":t.L===-1?"sous sa MM200":"autour de sa MM200";
  return merge(base(f),{val:fmtV(d.c,f),ch:d.ch,impact:impact,str:impact?t.str:0,label:label,
    text:"<b>"+label+"</b> : "+longP+", "+pct(d.pw,1)+" sur 1 semaine. → "+f.imp[String(impact)]+".",proof:trendProof(d,t,f,extra),rule:RULE_TREND,chart:TVS[f.k]});
}
function mkYield(f){
  var y=S.mk.US10Y,zn=S.mk.ZN;if(!zn)return na(f);var t=trend(invert(zn));if(!t)return na(f);
  var label=t.label.replace("Tendance haussière","Taux en hausse").replace("Tendance baissière","Taux en baisse").replace("Haussière, en repli","Hausse, en pause").replace("Baissière, en rebond","Baisse, en pause");
  var impact=-t.dir;var bp=y?(y.c-y.c/(1+(y.ch||0)/100))*100:null;
  var P=[["Rendement 10 ans",y?nf(y.c,3)+" % ("+(bp>=0?"+":"−")+nf(Math.abs(bp),1)+" pb auj.)":"—"],["Future ZN",nf(zn.c,3)+" · MM20 "+nf(zn.s20,2)+" · MM50 "+nf(zn.s50,2)+" · MM200 "+nf(zn.s200,2)],
    ["Fond (taux)",lvl(t.L)],["Moyen terme",lvl(t.M)],["Court terme",lvl(t.S)+", obligations "+pct(zn.pw,1)+" sur 1 semaine"]];
  if(zn.adx!=null)P.push(["ADX (ZN)",adxTxt(zn.adx)]);
  return merge(base(f),{val:y?nf(y.c,3)+" %":"—",ch:y?y.ch:null,impact:impact,str:impact?t.str:0,label:label,
    text:"<b>"+label+"</b> : structure lue sur le future obligataire 10 ans (ZN), "+(t.L===1?"rendements au-dessus de leur tendance de fond":t.L===-1?"rendements sous leur tendance de fond":"rendements sans tendance de fond")+". → "+f.imp[String(impact)]+".",
    proof:P,rule:"Le prix d'une obligation évolue à l'inverse de son rendement : on lit la structure (MM20/50/200) sur le future ZN, puis on l'inverse. "+RULE_TREND,chart:"CBOT:ZN1!"});
}
function mkVix(f){
  var d=S.mk.VIX;if(!d||d.c==null)return na(f);var c=d.c;
  var zone=c<15?"calme":c<20?"normale":c<30?"tendue":"de panique";
  var rising=d.s20!=null&&d.s50!=null&&c>d.s50&&d.s20>d.s50,falling=d.s20!=null&&d.s50!=null&&c<d.s50&&d.s20<d.s50;
  var imp,str;
  if(c>=30){imp=-1;str=3;}else if(c>=25){imp=-1;str=2;}else if(c>=20){imp=rising?-1:0;str=rising?1:0;}else if(rising){imp=0;str=0;}else{imp=1;str=c<15?2:1;}
  var I={1:"marchés calmes : environnement porteur pour les actifs risqués",0:"la volatilité se réveille ou reste dans une zone intermédiaire : vigilance","-1":"stress sur les marchés : les actifs risqués sont vendus en premier"};
  return merge(base(f),{val:nf(c,2),ch:d.ch,impact:imp,str:str,label:"Volatilité "+zone,
    text:"<b>Volatilité "+zone+"</b> : VIX à "+nf(c,2)+", "+(rising?"en hausse au-dessus de sa MM50":falling?"sous sa MM50":"autour de sa MM50")+". → "+I[String(imp)]+".",
    proof:[["VIX",nf(c,2)+" ("+pct(d.ch)+" auj.)"],["MM20 · MM50",nf(d.s20,2)+" · "+nf(d.s50,2)],["Range 3 mois",nf(d.l3,2)+" → "+nf(d.h3,2)],["Perf. 1 semaine",pct(d.pw,1)]],
    rule:"Règle : VIX < 15 calme, 15–20 normal, 20–30 tendu, > 30 panique. Un VIX au-dessus de sa MM50 (avec MM20 > MM50) signale une volatilité qui remonte.",chart:TVS.VIX});
}
function mkFund(f){
  /* Funding moyen pondéré par l'OI sur 5 plateformes (pos.js), sinon OKX seul */
  var b=S.fund.BTC,P=S.pos&&S.pos.BTC,agg=P&&P.fw!=null;if(!b&&!agg)return na(f);var r=agg?P.fw:b.r*100,h=((b&&b.hist)||[]).map(function(x){return x*100;});
  var avg=h.length?h.reduce(function(s,x){return s+x;},0)/h.length:null,mx=h.length?Math.max.apply(null,h):null;
  var imp,str,label;
  if(r>0.05){imp=-1;str=3;label="Longs très chargés";}else if(r>0.025){imp=-1;str=1;label="Longs chargés";}
  else if(r<-0.01){imp=1;str=2;label="Shorts dominants";}else if(r<0){imp=1;str=1;label="Shorts légèrement dominants";}else{imp=0;str=0;label="Positionnement équilibré";}
  var I={1:"les vendeurs à découvert paient pour rester : carburant pour un rachat forcé (short squeeze)",0:"pas d'excès de levier d'un côté","-1":"les acheteurs à levier paient cher pour rester : risque de purge des longs"};
  return merge(base(f),{val:nf(r,4)+" %",ch:null,impact:imp,str:str,label:label,
    text:"<b>"+label+"</b> : funding BTC "+(agg?"moyen sur "+P.nEx+" plateformes ":"")+"à "+nf(r,4)+" % par 8 h"+(avg!=null?", moyenne 30 j OKX "+nf(avg,4)+" %":"")+". → "+I[String(imp)]+".",
    proof:[["Funding actuel",nf(r,4)+" % / 8 h ("+nf(r*3*365,1)+" % par an)"]].concat(agg?[["Binance","binance"],["Bybit","bybit"],["OKX","okx"],["Bitget","bitget"],["Hyperliquid","hl"]].map(function(e){var x=P.ex[e[1]];return [e[0],x&&x.f8!=null?nf(x.f8,4)+" % · OI "+usd(x.oiU):"—"];}):[])
      .concat([["Moyenne 30 jours (OKX)",avg!=null?nf(avg,4)+" %":"—"],["Max 30 jours (OKX)",mx!=null?nf(mx,4)+" %":"—"],["ETH",S.pos&&S.pos.ETH&&S.pos.ETH.fw!=null?nf(S.pos.ETH.fw,4)+" %":S.fund.ETH?nf(S.fund.ETH.r*100,4)+" %":"—"]]),
    rule:"Règle : > 0,025 % par 8 h = longs chargés, > 0,05 % = très chargés, < 0 = shorts dominants. Funding moyen pondéré par l'open interest de Binance, Bybit, OKX, Bitget et Hyperliquid (Hyperliquid ramené de l'heure à 8 h).",chart:"OKX:BTCUSDT.P"});
}
function mkOI(f){
  var o=S.oi&&S.oi.BTC,c=S.btcD;if(!o||o.length<8||!c||c.length<8)return na(f);
  /* Variation 7 j : Binance + Bybit en coins (pos.js), sinon Binance seul */
  var P=S.pos&&S.pos.BTC,agg=P&&P.oi7!=null;
  var now=o[0],ref=o[7],doi=agg?P.oi7:(now.coin/ref.coin-1)*100,dpx=(c[c.length-1].c/c[c.length-8].c-1)*100;
  var imp=0,str=0,label;
  if(Math.abs(doi)<5)label="Levier stable";
  else if(doi>0&&dpx>0){imp=1;str=1;label="Hausse avec nouvelles positions";}
  else if(doi>0){imp=-1;str=2;label="Baisse avec nouvelles positions";}
  else if(dpx>0)label="Hausse par rachats de shorts";
  else label="Purge du levier";
  var I={"Levier stable":"pas d'accumulation de levier notable","Hausse avec nouvelles positions":"la hausse attire de nouveaux acheteurs : tendance soutenue, mais le levier grimpe",
    "Baisse avec nouvelles positions":"des vendeurs à découvert ouvrent des positions : pression baissière active","Hausse par rachats de shorts":"la hausse vient surtout de shorts qui se couvrent : moins solide",
    "Purge du levier":"le levier se vide : souvent en fin de mouvement baissier"};
  return merge(base(f),{val:agg&&P.tot?usd(P.tot):usd(now.usd),ch:null,impact:imp,str:str,label:label,
    text:"<b>"+label+"</b> : open interest "+pct(doi,1)+" en 7 jours (en BTC"+(agg?", Binance + Bybit":"")+"), prix "+pct(dpx,1)+". → "+I[label]+".",
    proof:(agg&&P.tot?[["OI total 5 plateformes",usd(P.tot)],["Variation 24 h",P.oi24!=null?pct(P.oi24,2):"—"]]:[]).concat([["OI Binance aujourd'hui",nf(now.coin,0)+" BTC ("+usd(now.usd)+")"],["OI Binance il y a 7 jours",nf(ref.coin,0)+" BTC"],["Variation OI 7 j",pct(doi,1)],["Prix BTC 7 jours",pct(dpx,1)]]),
    rule:"Règle : variation sur 7 jours de l'open interest de Binance et Bybit en nombre de BTC (neutralise l'effet prix) croisée avec la variation du prix. Seuil de signal : ±5 %.",chart:"BINANCE:BTCUSDT.P"});
}
function mkFG(f){
  var g=S.fg;if(!g)return na(f);var v=g.v,imp=0,str=0,label;
  if(v>=75){imp=-1;str=2;label="Euphorie";}else if(v>=60){label="Optimisme";}else if(v<=25){imp=1;str=2;label="Peur extrême";}else if(v<=40){label="Prudence";}else{label="Neutre";}
  var I={Euphorie:"historiquement une zone où les corrections démarrent","Peur extrême":"historiquement une zone d'accumulation",Optimisme:"le marché est confiant sans excès",Prudence:"le marché doute, sans panique",Neutre:"pas d'excès émotionnel"};
  return merge(base(f),{val:String(v),ch:null,impact:imp,str:str,label:label,
    text:"<b>"+label+"</b> : indice à "+v+" (moyenne 30 j : "+nf(g.avg,0)+"). → "+I[label]+".",
    proof:[["Aujourd'hui",v+" ("+esc(g.cls)+")"],["Hier",g.prev!=null?String(g.prev):"—"],["Moyenne 30 jours",nf(g.avg,0)]],
    rule:"Règle (contrarienne) : ≥ 75 = euphorie, défavorable · ≤ 25 = peur extrême, favorable · entre les deux = neutre. Source : alternative.me.",chart:null});
}
function na(f){return merge(base(f),{val:"—",impact:0,str:0,na:true,label:"Indisponible",text:"Donnée indisponible pour le moment.",proof:[],rule:"",chart:TVS[f.k]||null});}
function computeFactors(){
  var out=FDEF.map(function(f){try{switch(f.type){case "trend":return mkTrend(f);case "yield":return mkYield(f);case "vix":return mkVix(f);case "fund":return mkFund(f);case "oi":return mkOI(f);case "fg":return mkFG(f);}}catch(e){return na(f);}return na(f);});
  var changed=[];
  out.forEach(function(x){var p=S.prevImpact[x.k];if(!x.na&&p!=null&&p!==x.impact)changed.push({f:x,from:p});if(!x.na)S.prevImpact[x.k]=x.impact;});
  S.factors=out;
  var ok=out.filter(function(x){return !x.na;}).length;
  $("mapMeta").textContent=ok?("Lecture journalière · "+ok+"/"+out.length+" indicateurs · "+new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})):"Chargement…";
  if(CK.map)CK.map.update(changed);
  if(changed.length&&CK.onFactorChange)CK.onFactorChange(changed);
}
CK.computeFactors=computeFactors;
CK.stClass=function(x){return x.na?"na":x.impact>0?"fav":x.impact<0?"def":"neu";};
CK.stLabel=function(x){return x.na?"—":(x.impact>0?"Favorable":x.impact<0?"Défavorable":"Neutre")+(x.impact&&x.str?" · "+STR[x.str]:"");};

/* ---------------- Dérivés ---------------- */
function renderDeriv(){
  if(CK.pos&&CK.pos.render){CK.pos.render();return;}
  var host=$("deriv");if(!host)return;var b=S.fund.BTC,e=S.fund.ETH,o=S.oi&&S.oi.BTC;
  function fund(x,n){if(!x)return '<div class="dv"><div class="k">Funding '+n+'</div><div class="v">—</div></div>';var r=x.r*100;
    return '<div class="dv"><div class="k">Funding '+n+'</div><div class="v '+cls(r)+'">'+nf(r,4)+' %</div><div class="s">'+nf(r*3*365,1)+' % par an</div></div>';}
  var oiH='<div class="dv"><div class="k">Open interest BTC</div><div class="v">—</div></div>';
  if(o&&o.length>=8){var d7=(o[0].coin/o[7].coin-1)*100;oiH='<div class="dv"><div class="k">Open interest BTC</div><div class="v">'+usd(o[0].usd)+'</div><div class="s"><span class="'+cls(d7)+'">'+pct(d7,1)+'</span> en 7 j · Binance</div></div>';}
  host.innerHTML=fund(b,"BTC")+fund(e,"ETH")+'<div class="dv"><div class="k">Prochain funding</div><div class="v" id="fundCd">—</div><div class="s">toutes les 8 h · OKX</div></div>'+oiH;
  tickFunding();
}
function tickFunding(){var el=$("fundCd"),b=S.fund.BTC;if(el&&b&&b.next)el.textContent=clock(b.next-Date.now());}

/* ---------------- Top mouvements ---------------- */
function normTickers(arr,perp){
  return (arr||[]).filter(function(t){return perp?/-USDT-SWAP$/.test(t.instId):/-USDT$/.test(t.instId);}).map(function(t){
    var b=t.instId.split("-")[0],last=+t.last,open=+t.open24h;return {inst:t.instId,base:b,last:last,chg:open?(last/open-1)*100:0,usd:perp?(+t.volCcy24h)*last:+t.volCcy24h};
  }).filter(function(x){return !STABLES[x.base]&&!/(UP|DOWN|[235]L|[235]S)$/.test(x.base)&&x.last>0;});
}
function loadMovers(){
  return Promise.all([fetchJSON(OKX+"/api/v5/market/tickers?instType=SPOT").catch(function(){return {};}),fetchJSON(OKX+"/api/v5/market/tickers?instType=SWAP").catch(function(){return {};})])
    .then(function(a){S.uni={spot:normTickers(a[0].data,false),perp:normTickers(a[1].data,true)};
      ["spot","perp"].forEach(function(m){S.movers[m]=S.uni[m].filter(function(x){return x.usd>=(C.moversMinVolume||0);});});renderMovers();});
}
CK.loadMovers=loadMovers;
function renderMovers(){
  var host=$("movers");if(!host)return;var m=S.moversMkt||C.moversMarket||"spot",cat=S.cat||{},hc=Object.keys(cat).length>0,L=(S.movers[m]||[]).filter(function(x){return !hc||cat[x.inst]==="1";});
  document.querySelectorAll("#moversSeg button").forEach(function(b){b.setAttribute("aria-pressed",b.getAttribute("data-m")===m?"true":"false");});
  if(!L.length){host.innerHTML='<div class="empty">Chargement des marchés OKX…</div>';return;}
  var up=L.slice().sort(function(a,b){return b.chg-a.chg;}).slice(0,6),dn=L.slice().sort(function(a,b){return a.chg-b.chg;}).slice(0,6);
  var mx=Math.max(Math.abs(up[0]?up[0].chg:1),Math.abs(dn[0]?dn[0].chg:1))||1;
  function row(x){var sym="OKX:"+x.base+"USDT"+(m==="perp"?".P":"");return '<div class="mv" data-chart="'+sym+'" data-title="'+esc(x.base)+'">'+logo(x.base)+'<span class="t">'+esc(x.base)+'</span><span class="c '+cls(x.chg)+'">'+pct(x.chg,1)+'</span><i class="bar '+(x.chg>=0?"up":"down")+'" style="transform:scaleX('+Math.min(1,Math.abs(x.chg)/mx).toFixed(3)+')"></i></div>';}
  host.innerHTML='<div class="mv-col"><h4>Hausses</h4>'+up.map(row).join("")+'</div><div class="mv-col"><h4>Baisses</h4>'+dn.map(row).join("")+'</div>';
  S.topUp=up;S.topDn=dn;
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
var HOT=/\b(fed|fomc|powell|cpi|ppi|pce|nfp|payrolls|jobs report|rate (cut|hike|decision)|tariff|trump|bitcoin|btc|crypto|ether|sec\b|etf|treasury|yields?|ecb|boj|china|opec|war|strike|missile|sanction)/i;
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
var NCAT={x:["X","nx"],macro:["Macro","nm"],tree:["Crypto","nc"],tg:["Crypto","nc"],gov:["Gouv. US","ng"],ex:["Exchange","ne"],art:["Article","na"]};
var NSEEN=null;
function newsTout(){var seen={},L=[];
  S.news.macro.forEach(function(x){L.push(Object.assign({kind:"macro"},x));});
  S.news.wire.forEach(function(x){if(x.kind==="x"&&!x.gros)return;L.push(Object.assign({kind:x.kind||"tree"},x));});
  S.news.crypto.forEach(function(x){L.push(Object.assign({kind:"art"},x));});
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
  var fx=S.newsTab==="x"?'<div class="nr-f" role="group" aria-label="Filtrer les tweets">'+[["tous","Tous"],["onchain","Onchain"],["macro","Macro"],["news","News"],["trump","Trump"]].map(function(z){return '<button type="button" data-xf="'+z[0]+'" aria-pressed="'+((S.xFiltre||"tous")===z[0])+'">'+z[1]+'</button>';}).join("")+'</div>':'';
  host.innerHTML=fx+'<div class="nr-l">'+(html||'<p class="nr-vide">Aucun tweet pour ce filtre dans les dernières heures.</p>')+'</div>';
}
/* Les « il y a » des cartes avancent tout seuls */
setInterval(function(){document.querySelectorAll(".nr-t[data-ts]").forEach(function(e){e.textContent=chrono(+e.getAttribute("data-ts"));});},10000);
function newsList(){
  if(S.newsTab==="tout")return newsTout();
  if(S.newsTab==="x"){var xf=S.xFiltre||"tous";return S.news.wire.filter(function(x){return x.kind==="x"&&x.gros&&(xf==="tous"||x.grp===xf);});}
  if(S.newsTab==="crypto"&&S.news.wire.length)return S.news.wire;
  if(S.newsTab==="articles"||S.newsTab==="crypto"){if(S.news.crypto.length)return S.news.crypto;
    return S.news.macro.filter(function(x){return /bitcoin|btc|crypto|ether|stablecoin|coinbase|binance|blackrock|etf|token|blockchain|saylor|strategy/i.test(x.title);});}
  return S.news.macro;
}
function renderNews(){
  var host=$("news");if(!host)return;var tab=S.newsTab;
  var src=$("newsSrc");if(!src){var hd=host.closest(".mod")&&host.closest(".mod").querySelector(".mhd");if(hd){src=document.createElement("span");src.className="meta news-src";src.id="newsSrc";hd.appendChild(src);}}
  if(src){var m=S.news.macro[0],age=m&&m.ts?ago(m.ts):"";src.innerHTML=tab==="macro"&&FJ.src?(FJ.src==="direct"?'<i class="ns-live"></i>Direct · dernière news '+age:'<i class="ns-rb"></i>Copie du robot · dernière news '+age):
    (tab==="tout"||tab==="x")&&S.news.wire.length?'<i class="ns-live"></i>'+(tab==="x"?"Comptes X et insiders en direct":"Toutes les sources en direct"):tab==="crypto"&&S.news.wire.length?'<i class="ns-live"></i>Fil en direct · dernière dépêche '+ago(S.news.wire[0].ts):tab==="articles"?"Articles · 6 sites, toutes les 10 min":"";}
  document.querySelectorAll("#newsSeg button").forEach(function(b){b.setAttribute("aria-pressed",b.getAttribute("data-n")===tab?"true":"false");});
  var lang=S.newsLang||C.newsLang||"fr";$("newsLang").textContent=lang==="fr"?"FR":"VO";$("newsLang").setAttribute("aria-pressed",lang==="fr"?"true":"false");
  var L=newsList().slice(0,tab==="x"?120:tab==="tout"?80:40);
  if(!L.length){host.innerHTML='<div class="empty">'+(tab==="macro"?(S.fjErr?"FinancialJuice ne répond pas pour le moment, nouvel essai dans quelques minutes.":"Connexion à FinancialJuice…"):(tab==="x"?"Connexion au fil des tweets…":"Chargement des news…"))+'</div>';return;}
  if(tab==="tout"||tab==="x"){newsRich(host,L,lang);if(lang==="fr")translate(L);return;}
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
  $("moversSeg").addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;S.moversMkt=b.getAttribute("data-m");renderMovers();});
  $("news").addEventListener("click",function(e){var b=e.target.closest("[data-xf]");if(!b)return;e.preventDefault();S.xFiltre=b.getAttribute("data-xf");renderNews();});
  $("newsSeg").addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;S.newsTab=b.getAttribute("data-n");try{localStorage.setItem("ck:newsTab",S.newsTab);}catch(x){}renderNews();$("news").scrollTop=0;});
  $("newsLang").addEventListener("click",function(){S.newsLang=(S.newsLang||C.newsLang||"fr")==="fr"?"vo":"fr";renderNews();});
  document.querySelectorAll("[data-help]").forEach(function(b){b.addEventListener("click",function(){var k=b.getAttribute("data-help"),box=document.querySelector('[data-helpbox="'+k+'"]');if(!box)return;box.textContent=HELP[k]||"";box.hidden=!box.hidden;});});
  document.addEventListener("visibilitychange",function(){if(!document.hidden){paintTicks();renderLiqSum();}});
  /* Projecteur : la bordure de la carte s'éclaire sous le curseur */
  var spot=null;document.addEventListener("pointermove",function(e){var c=e.target.closest&&e.target.closest(".card");if(!c)return;if(spot)return;spot=requestAnimationFrame(function(){spot=null;var r=c.getBoundingClientRect();c.style.setProperty("--mx",(e.clientX-r.left)+"px");c.style.setProperty("--my",(e.clientY-r.top)+"px");});},{passive:true});
}

/* ---------------- Démarrage ---------------- */
function safe(fn){try{fn();}catch(e){if(window.console)console.error("[cockpit]",e);}}
CK.boot=function(){
  applyIdentity();syncThemeBtns();buildStrip();wire();
  S.moversMkt=C.moversMarket;S.newsLang=C.newsLang;
  [function(){if(CK.bg)CK.bg.boot();},function(){if(CK.layout)CK.layout.boot();},function(){if(CK.day)CK.day.boot();},function(){if(CK.pos)CK.pos.boot();},function(){if(CK.extra)CK.extra.boot();},function(){if(CK.plan)CK.plan.boot();},function(){if(CK.ui)CK.ui.boot();},function(){if(CK.hub)CK.hub.boot();},function(){if(CK.worlds)CK.worlds.boot();},function(){if(CK.sound)CK.sound.boot();},function(){if(CK.net)CK.net.boot();}].forEach(safe);
  renderLiqSum();renderNews();
  loadInstruments().then(function(){startSockets();if(CK.WITH_LIQ)seedLiq();});
  loadMacro();
  Promise.all([loadBTCdaily(),loadFunding(),loadOI(),loadFG()]).then(computeFactors);
  
  loadCalendar();loadFJ();loadCryptoNews();loadWire();
  (function wl(){setTimeout(function(){loadWire().then(wl,wl);},document.hidden?60000:20000);})();
  loadTG();(function tl(){setTimeout(function(){loadTG().then(tl,tl);},tgDelai());})();
  document.addEventListener("visibilitychange",function(){if(!document.hidden&&Date.now()-(WIRE.tgTs||0)>Math.min(tgDelai(),180000))loadTG();});
  /* On ouvre l'Agent ou les News avec des données de plus de 3 min : on les rafraîchit tout de suite */
  setInterval(function(){if(!document.hidden&&(agentVisible()||newsVisible())&&Date.now()-(WIRE.tgTs||0)>(window.CK_PUBLIC?180000:60000))loadTG();},15000);
  setInterval(function(){tickNext();tickFunding();},1000);
  setInterval(function(){renderLiqSum();document.querySelectorAll("[data-ago]").forEach(function(e){e.textContent=ago(+e.getAttribute("data-ago"));});},2000);
  setInterval(loadMacro,120000);
  setInterval(function(){Promise.all([loadBTCdaily(),loadFunding(),loadOI()]).then(computeFactors);},600000);
  setInterval(function(){loadFG().then(computeFactors);},1800000);
  
  setInterval(loadCalendar,900000);
  (function fj(){setTimeout(function(){loadFJ().then(fj,fj);},document.hidden?180000:60000);})();
  document.addEventListener("visibilitychange",function(){if(!document.hidden&&Date.now()-FJ.ts>60000)loadFJ();});
  setInterval(loadCryptoNews,180000);
  setInterval(function(){if(!document.hidden)renderNewsSoft();},60000);
};
window.Cockpit={boot:function(){CK.boot();}};
})();
