/* ================================================================
   COCKPIT — Journée de trading (heure de Paris)
   Ciel jour/nuit réel, sessions Tokyo / Londres / New York,
   chevauchement, annonces, curseur « maintenant » en direct.
   ================================================================ */
(function(){
"use strict";
var CK=window.CK,S=CK.S,u=CK.u,esc=u.esc;
var SESS=[{n:"Tokyo",tz:"Asia/Tokyo",o:9,c:15},{n:"Londres",tz:"Europe/London",o:8,c:16.5},{n:"New York",tz:"America/New_York",o:9.5,c:16}];
function tzH(tz,d){var p={};try{new Intl.DateTimeFormat("en-US",{timeZone:tz,hour:"numeric",minute:"numeric",second:"numeric",weekday:"short",hour12:false}).formatToParts(d||new Date()).forEach(function(x){p[x.type]=x.value;});}catch(e){var n=d||new Date();return {h:n.getHours()+n.getMinutes()/60,wd:"Mon"};}
  return {h:(+p.hour%24)+(+p.minute)/60+(+p.second||0)/3600,wd:p.weekday};}
function norm(h){while(h<0)h+=24;while(h>=24)h-=24;return h;}
function hm(h){h=norm(h);var H=Math.floor(h),M=Math.round((h-H)*60);if(M===60){H=(H+1)%24;M=0;}return (H<10?"0":"")+H+":"+(M<10?"0":"")+M;}
function sun(){var now=new Date(),start=new Date(now.getFullYear(),0,0),n=Math.floor((now-start)/864e5);
  var dec=-23.44*Math.cos(2*Math.PI/365*(n+10))*Math.PI/180,lat=48.85*Math.PI/180;
  var H=Math.acos(Math.max(-1,Math.min(1,-Math.tan(lat)*Math.tan(dec))))*180/Math.PI/15;
  var off=tzH("Europe/Paris").h-(now.getUTCHours()+now.getUTCMinutes()/60+now.getUTCSeconds()/3600);off=Math.round(norm(off+12)-12);
  var noon=12-2.35/15+off;return {rise:noon-H,set:noon+H};}
function sessions(){
  var ph=tzH("Europe/Paris").h;
  return SESS.map(function(s,i){var z=tzH(s.tz),off=z.h-ph;off=norm(off+12)-12;
    var a=s.o-off,b=s.c-off,wk=z.wd==="Sat"||z.wd==="Sun";
    var open=!wk&&z.h>=s.o&&z.h<s.c;
    return {n:s.n,i:i,a:a,b:b,open:open,wk:wk,toOpen:(!wk&&z.h<s.o)?(s.o-z.h):null,toClose:open?(s.c-z.h):null};});
}
var host,info,track,nowEl,pastEl,firstRender=true;
function P(h){return Math.max(0,Math.min(100,h/24*100));}
function skyGradient(){
  var s=sun(),t=CK.theme(),night=t==="light"?"#C7CFE6":"#1C2148",dawn=t==="light"?"#FBC9A8":"#E9967A",day=t==="light"?"#BFE3F7":"#5B8FC9",dusk=t==="light"?"#F8B4B4":"#C9708F";
  return "linear-gradient(90deg,"+night+" 0%,"+night+" "+P(s.rise-1).toFixed(1)+"%,"+dawn+" "+P(s.rise).toFixed(1)+"%,"+day+" "+P(s.rise+1.5).toFixed(1)+"%,"+day+" "+P(s.set-1.5).toFixed(1)+"%,"+dusk+" "+P(s.set).toFixed(1)+"%,"+night+" "+P(s.set+1).toFixed(1)+"%,"+night+" 100%)";
}
var SHORT=[[/FOMC|Fed/i,"Fed"],[/Inflation \(CPI\)|CPI/i,"CPI"],[/PCE/i,"PCE"],[/PPI|production/i,"PPI"],[/NFP|non agricoles/i,"NFP"],[/chômage/i,"Chômage"],[/ISM/i,"ISM"],[/PMI/i,"PMI"],[/Ventes au détail/i,"Ventes"],[/PIB/i,"PIB"],[/ADP/i,"ADP"],[/JOLTS/i,"JOLTS"],[/Confiance/i,"Confiance"],[/Powell|Discours/i,"Discours"]];
function short(t){for(var i=0;i<SHORT.length;i++)if(SHORT[i][0].test(t))return SHORT[i][1];return t.split(" ")[0];}
function render(){
  if(!host)return;var ss=sessions(),ph=tzH("Europe/Paris").h,h="";
  /* Colonne de gauche : une ligne par élément de la frise */
  h+='<div class="dl">'+ss.map(function(s){var st=s.wk?"week-end":s.open?"ouvert · "+u.dur(s.toClose*3600000):s.toOpen!=null?"ouvre dans "+u.dur(s.toOpen*3600000):"fermé";
    return '<div class="dl-r'+(s.open?" on":"")+'"><b>'+s.n+'</b><span>'+st+'</span></div>';}).join("")+
    '<div class="dl-r ev"><b>Annonces US</b><span>heure de Paris</span></div></div>';
  /* Piste horaire */
  h+='<div class="dt" id="dayTrack">';
  h+='<div class="hours">'+Array.from({length:25},function(_,x){return '<span class="'+(x%3===0?"maj":"")+(x%6===0?" h6":"")+'" style="left:'+P(x)+'%">'+(x%3===0&&x<24?(x<10?"0":"")+x+"h":"")+'</span>';}).join("")+'</div>';
  h+='<div class="grid-h">'+[3,6,9,12,15,18,21].map(function(x){return '<i style="left:'+P(x)+'%"></i>';}).join("")+'</div>';
  var L=ss[1],N=ss[2],oa=Math.max(L.a,N.a),ob=Math.min(L.b,N.b);
  /* Chevauchement Londres + New York : une zone discrète derrière les deux lignes, légendée dessous */
  if(ob>oa)h+='<div class="dband" style="left:'+P(oa)+'%;width:'+(P(ob)-P(oa)).toFixed(2)+'%" title="Londres et New York ouverts en même temps : le plus de volume de la journée"><em>Volume max</em></div>';
  h+='<div class="lanes">'+ss.map(function(s){var a=Math.max(0,s.a),b=Math.min(24,s.b),prog=s.open?Math.max(0,Math.min(1,(ph-s.a)/(s.b-s.a))):(ph>=s.b?1:0);
    var cls=s.wk?"done":s.open?"open":ph>=s.b?"done":"todo";
    return '<div class="lane"><div class="sess-bar '+cls+'" style="left:'+P(a)+'%;width:'+(P(b)-P(a)).toFixed(2)+'%;transition-delay:'+(s.i*90)+'ms"><i class="fill" style="transform:scaleX('+prog.toFixed(3)+')"></i><small>'+hm(s.a)+' → '+hm(s.b)+'</small></div></div>';}).join("")+'</div>';
  /* Annonces du jour : regroupées quand elles tombent à moins de 45 min d'intervalle (un seul repère « 14:30 · 4 ») */
  var today=u.parisDay(new Date()),evs=(S.cal||[]).filter(function(e){return u.parisDay(new Date(e.ts))===today;}).sort(function(x,y){return x.ts-y.ts;}),grp=[];
  evs.forEach(function(e){var g=grp[grp.length-1];if(g&&e.ts-g.ts<45*60000){g.list.push(e);if(e.imp==="hi")g.imp="hi";}else grp.push({ts:e.ts,imp:e.imp,list:[e]});});
  var now=Date.now(),nextG=grp.filter(function(g){return g.list.some(function(e){return e.ts>now;});})[0];
  h+='<div class="dlane-ev"></div><div class="dlane-fu"></div>';
  grp.forEach(function(g){var t=tzH("Europe/Paris",new Date(g.ts)).h,past=g.list.every(function(e){return e.ts<now;}),isNext=g===nextG,n=g.list.length;
    if(isNext)h+='<div class="dguide '+g.imp+'" style="left:'+P(t)+'%"></div>';
    h+='<button type="button" class="dmk '+g.imp+(isNext?" next":"")+(past?" past":"")+(t<1.5?" edge-l":t>22.5?" edge-r":"")+'" style="left:'+P(t)+'%" aria-label="'+n+' annonce'+(n>1?"s":"")+' à '+u.parisTime(g.ts)+'">'+u.parisTime(g.ts)+(n>1?'<b>'+n+'</b>':'')+
      '<span class="dtip">'+g.list.map(function(e){return '<span class="dt-r"><i class="'+e.imp+'"></i><em>'+u.parisTime(e.ts)+'</em>'+esc(e.fr)+'</span>';}).join("")+'</span></button>';});
  h+='<div class="day-past"></div><div class="now"><b></b></div></div>';
  host.innerHTML=h;track=host.querySelector(".dt");
  nowEl=host.querySelector(".now");pastEl=host.querySelector(".day-past");
  if(firstRender&&!CK.reduce){host.classList.add("grow");u.raf2(function(){host.classList.remove("grow");});}
  firstRender=false;
  tick();renderInfo(ss,oa,ob);renderSide();
}
var side=null,tvMounted=false,sideT0=Date.now();setTimeout(function(){renderSide();},4000);
function renderSide(){
  side=side||document.getElementById("daySide");if(!side)return;
  var now=Date.now(),today=u.parisDay(new Date()),list=(S.cal||[]).filter(function(e){return e.ts>now-3600000;}).slice(0,6);
  if(!list.length&&(S.calFail||Date.now()-sideT0>3900)){mountTV();return;}
  if(tvMounted){side.innerHTML="";tvMounted=false;}
  if(!list.length){side.innerHTML='<div class="ds-empty">Chargement des annonces…</div>';return;}
  var e=S.nextEv;
  side.innerHTML=(e?'<div class="ds-next '+e.imp+'"><span>Prochaine annonce'+(e.imp==="hi"?" · impact fort":"")+'</span><b>'+esc(e.fr)+'</b><em class="ds-cd" id="dsCd"></em></div>':'')+
    '<div class="ds-list">'+list.map(function(x,i){var d=u.parisDay(new Date(x.ts)),same=i>0&&list[i-1].ts===x.ts;return '<div class="ds-row'+(x.ts<now?" past":"")+(same?" same":"")+'"><span class="t">'+(same?"":(d===today?"":"dem. ")+u.parisTime(x.ts))+'</span><span class="n">'+esc(x.fr)+'</span><i class="'+x.imp+'">'+(x.imp==="hi"?"Fort":x.imp==="md"?"Moyen":"Faible")+'</i></div>';}).join("")+'</div>';
  tickSide();
}
function tickSide(){var el=document.getElementById("dsCd"),e=S.nextEv;if(!el||!e)return;var ms=e.ts-Date.now();if(ms<=0){el.textContent="maintenant";return;}
  var s=Math.floor(ms/1000),hh=Math.floor(s/3600),mm=Math.floor(s%3600/60),xx=s%60;el.textContent=(hh?hh+":":"")+(mm<10&&hh?"0":"")+mm+":"+(xx<10?"0":"")+xx;}
/* Secours : calendrier officiel TradingView (toujours en direct, sans relais) */
function mountTV(){
  if(tvMounted)return;tvMounted=true;side.innerHTML="";
  var c=document.createElement("div");c.className="tradingview-widget-container ds-tv";var w=document.createElement("div");w.className="tradingview-widget-container__widget";c.appendChild(w);
  var s=document.createElement("script");s.src="https://s3.tradingview.com/external-embedding/embed-widget-events.js";s.async=true;var tw0=performance.now();s.onload=function(){if(CK.netOk)CK.netOk(s.src,tw0);};s.onerror=function(){if(CK.netErr)CK.netErr(s.src,new Error("Widget non chargé"));};
  s.innerHTML=JSON.stringify({colorTheme:CK.theme()==="light"?"light":"dark",isTransparent:true,width:"100%",height:"100%",locale:"fr",importanceFilter:"0,1",countryFilter:"us"});
  c.appendChild(s);side.appendChild(c);
}
function renderInfo(ss,oa,ob){
  if(!info)return;var parts=[];
  if(ss.every(function(s){return s.wk;}))parts.push('<span><b>Week-end</b> : marchés actions et futures fermés</span>');
  ss.forEach(function(s){if(s.open)parts.push('<span><b>'+s.n+'</b> ouvert · ferme dans <span class="cd">'+u.dur(s.toClose*3600000)+'</span></span>');
    else if(s.toOpen!=null)parts.push('<span><b>'+s.n+'</b> ouvre dans <span class="cd">'+u.dur(s.toOpen*3600000)+'</span></span>');});
  if(ob>oa)parts.push('<span>Chevauchement Londres + New York <b>'+hm(oa)+'–'+hm(ob)+'</b> : le plus de volume</span>');
  if(S.nextEv)parts.push('<span>Prochaine annonce : <b>'+esc(S.nextEv.fr)+'</b> à '+u.parisTime(S.nextEv.ts)+'</span>');
  info.innerHTML=parts.join("");
}
/* Alerte : 15 min avant l'ouverture ou la fermeture d'une session */
var demoUntil=0,lastAlert=null;
function alertInfo(){
  if(demoUntil>Date.now())return {lbl:"New York ouvre dans",ms:demoUntil-Date.now()};
  var best=null;SESS.forEach(function(s){var z=tzH(s.tz);if(z.wd==="Sat"||z.wd==="Sun")return;
    var toO=s.o-z.h,toC=s.c-z.h,c=null;
    if(toO>0&&toO<=0.25)c={lbl:s.n+" ouvre dans",ms:toO*3600000};else if(z.h>=s.o&&toC>0&&toC<=0.25)c={lbl:s.n+" ferme dans",ms:toC*3600000};
    if(c&&(!best||c.ms<best.ms))best=c;});
  return best;
}
function mmss(ms){var s=Math.max(0,Math.ceil(ms/1000)),m=Math.floor(s/60),x=s%60;return (m<10?"0":"")+m+":"+(x<10?"0":"")+x;}
function paintAlert(){
  var a=alertInfo(),isl=document.getElementById("island"),da=document.getElementById("dayAlert");
  if(isl){isl.classList.toggle("alert",!!a);if(a){document.getElementById("islLbl").textContent=a.lbl;document.getElementById("islCd").textContent=mmss(a.ms);}
    else{var ss=sessions(),t=ss.filter(function(s){return s.open;}).map(function(s){return s.n+" ouvert";}),nx=ss.filter(function(s){return s.toOpen!=null;}).sort(function(x,y){return x.toOpen-y.toOpen;})[0];
      if(nx)t.push(nx.n+" dans "+u.dur(nx.toOpen*3600000));document.getElementById("islText").textContent=t.join(" · ")||"Marchés actions fermés";}}
  if(da){da.hidden=!a;if(a){document.getElementById("daLbl").textContent=a.lbl;document.getElementById("daCd").textContent=mmss(a.ms);}}
  var key=a?a.lbl:null;if(key&&key!==lastAlert&&CK.toast)CK.toast("<b>"+u.esc(a.lbl)+" "+mmss(a.ms)+"</b>",{ms:5000});lastAlert=key;
}
function tick(){
  paintAlert();tickSide();
  if(!track||!nowEl)return;var ph=tzH("Europe/Paris").h,w=track.clientWidth;
  nowEl.style.transform="translateX("+(w*ph/24).toFixed(1)+"px)";
  nowEl.querySelector("b").textContent=hm(ph);
  pastEl.style.transform="scaleX("+(ph/24).toFixed(4)+")";
}
CK.day={
  boot:function(){host=document.getElementById("day");info=document.getElementById("dayInfo");if(!host)return;
    document.getElementById("dayMeta").textContent="Heure de Paris";
    render();setInterval(tick,1000);setInterval(render,30000);
    if(window.ResizeObserver)new ResizeObserver(tick).observe(host);},
  render:render,sessions:sessions,paris:function(){return tzH("Europe/Paris").h;},
  demo:function(){demoUntil=demoUntil>Date.now()?0:Date.now()+15*60000;paintAlert();return demoUntil>0;}
};
})();
