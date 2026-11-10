/* ================================================================
   DESK — Carte du marché (heatmap façon Finviz)
   Une case par valeur, taille = capitalisation boursière, couleur =
   variation du jour, regroupées par secteur. Quatre indices :
   Nasdaq 100, S&P 500, Dow Jones 30, Russell 2000.
   Données : scanner public de TradingView (aucune clé, prix différés).
   ================================================================ */
(function(){
"use strict";
var CK=window.CK,u=CK.u,esc=u.esc,nf=u.nf;
var TV="https://scanner.tradingview.com/global/scan";
/* indice → composition TradingView (on essaie les codes dans l'ordre jusqu'à trouver une liste) */
var IDX=[
  {k:"NDX",n:"Nasdaq 100",sets:["SYML:NASDAQ;NDX"],max:110},
  {k:"SPX",n:"S&P 500",sets:["SYML:SP;SPX"],max:510},
  {k:"DJI",n:"Dow Jones 30",sets:["SYML:DJ;DJI","SYML:TVC;DJI"],max:35},
  {k:"RUT",n:"Russell 2000",sets:["SYML:TVC;RUT","SYML:RUSSELL;RUT"],max:600}
];
var SEC={"Electronic Technology":"Technologie électronique","Technology Services":"Services technologiques","Finance":"Finance","Health Technology":"Technologies de santé",
  "Retail Trade":"Commerce de détail","Consumer Non-Durables":"Consommation courante","Consumer Durables":"Biens durables","Consumer Services":"Services aux consommateurs",
  "Producer Manufacturing":"Industrie manufacturière","Energy Minerals":"Énergie","Process Industries":"Industries de transformation","Commercial Services":"Services aux entreprises",
  "Utilities":"Services publics","Transportation":"Transport","Non-Energy Minerals":"Minéraux","Communications":"Communications","Industrial Services":"Services industriels",
  "Health Services":"Services de santé","Distribution Services":"Distribution","Miscellaneous":"Divers"};
var HM={k:CK.ls("hmIdx")||"NDX",data:{},err:"",busy:false,ts:{}};
if(!IDX.some(function(i){return i.k===HM.k;}))HM.k="NDX";
function cur(){return IDX.filter(function(i){return i.k===HM.k;})[0];}

/* ---------- Couleurs : gris neutre, vert à la hausse, rouge à la baisse (saturation maximale à ±3 %) ---------- */
function mix(a,b,t){return [0,1,2].map(function(i){return Math.round(a[i]+(b[i]-a[i])*t);});}
function color(ch){var t=Math.min(1,Math.abs(ch)/3),n=[58,64,78],g=[28,150,88],r=[205,62,58],c=mix(n,ch>=0?g:r,Math.pow(t,.75));return "rgb("+c[0]+","+c[1]+","+c[2]+")";}

/* ---------- Treemap « squarified » ---------- */
function squarify(items,x,y,w,h){
  var out=[],tot=items.reduce(function(s,i){return s+i.v;},0);if(!tot||w<=0||h<=0)return out;
  var k=w*h/tot,L=items.map(function(i){return {it:i,v:i.v*k};}),i0=0;
  while(i0<L.length){
    var side=Math.min(w,h),row=[],j=i0,prev=1e30;
    while(j<L.length){var t=row.concat([L[j]]),wr=ratio(t,side);if(row.length&&wr>prev)break;row=t;prev=wr;j++;}
    var s=row.reduce(function(a,r){return a+r.v;},0),th=s/side,p=0;
    row.forEach(function(r){var len=r.v/th;
      if(w>=h)out.push({it:r.it,x:x,y:y+p,w:th,h:len});else out.push({it:r.it,x:x+p,y:y,w:len,h:th});p+=len;});
    if(w>=h){x+=th;w-=th;}else{y+=th;h-=th;}
    i0=j;
  }
  return out;
}
function ratio(row,side){var s=0,mx=0,mn=1e30;row.forEach(function(r){s+=r.v;mx=Math.max(mx,r.v);mn=Math.min(mn,r.v);});var s2=s*s,w2=side*side;return Math.max(w2*mx/s2,s2/(w2*mn));}

/* ---------- Données ---------- */
function body(set,max){return JSON.stringify({columns:["name","description","close","change","market_cap_basic","sector"],symbols:{symbolset:[set]},sort:{sortBy:"market_cap_basic",sortOrder:"desc"},range:[0,max],options:{lang:"en"}});}
function parse(j){
  var R=(j&&j.data||[]).map(function(o){var d=o.d||[];return {s:o.s,t:String(d[0]||String(o.s).split(":").pop()),n:String(d[1]||""),px:+d[2],ch:+d[3],mc:+d[4],sec:String(d[5]||"Divers")};})
    .filter(function(r){return r.mc>0&&isFinite(r.ch)&&r.px>0;});
  return R;
}
function load(force){
  var I=cur();if(HM.busy)return;if(!force&&HM.ts[I.k]&&Date.now()-HM.ts[I.k]<90000)return;
  HM.busy=true;var i=0;
  function next(){
    if(i>=I.sets.length){HM.busy=false;if(!HM.data[I.k]){HM.err="TradingView n'a pas renvoyé la composition de cet indice. Réessaie dans un instant.";}render();return;}
    var set=I.sets[i++];
    u.fetchJSON(TV,{method:"POST",headers:{"Content-Type":"text/plain;charset=UTF-8"},body:body(set,I.max)},20000).then(function(j){
      var R=parse(j);if(R.length<Math.min(20,I.max/3))throw new Error("liste vide");
      HM.data[I.k]=R;HM.ts[I.k]=Date.now();HM.err="";HM.busy=false;render();
    }).catch(function(){next();});
  }
  next();
}

/* ---------- Affichage ---------- */
function cap(v){return v>=1e12?nf(v/1e12,2)+" T$":v>=1e9?nf(v/1e9,1)+" Md$":nf(v/1e6,0)+" M$";}
function pc(v){return (v>0?"+":v<0?"−":"")+nf(Math.abs(v),2)+" %";}
function seg(){return '<div class="seg" role="group" aria-label="Indice de la carte">'+IDX.map(function(i){return '<button type="button" data-hm="'+i.k+'" aria-pressed="'+(i.k===HM.k)+'">'+esc(i.n.toUpperCase())+'</button>';}).join("")+'</div>';}
function legend(){return '<div class="hm-lg"><span>−3 %</span>'+[-3,-2,-1,0,1,2,3].map(function(v){return '<i style="background:'+color(v)+'"></i>';}).join("")+'<span>+3 %</span><em>Taille = capitalisation · couleur = variation du jour · clic = graphique</em></div>';}
function render(){
  var host=u.$("hmap");if(!host)return;
  var R=HM.data[HM.k],I=cur();
  if(!R){host.innerHTML=seg()+'<div class="empty">'+esc(HM.err||"Chargement de la carte…")+'</div>';return;}
  var W=Math.max(320,host.clientWidth||900),H=Math.round(Math.min(760,Math.max(420,W*.52)));
  var by={};R.forEach(function(r){(by[r.sec]=by[r.sec]||[]).push(r);});
  var secs=Object.keys(by).map(function(k){return {name:k,v:by[k].reduce(function(s,r){return s+r.mc;},0),rows:by[k]};}).sort(function(a,b){return b.v-a.v;});
  var html="",avg=0,tot=0;R.forEach(function(r){avg+=r.ch*r.mc;tot+=r.mc;});avg=tot?avg/tot:0;
  squarify(secs,0,0,W,H).forEach(function(b){
    var s=b.it,hh=b.h>60&&b.w>90?16:0,inner=squarify(s.rows.map(function(r){return {v:r.mc,r:r};}),b.x+1,b.y+hh+1,b.w-2,b.h-hh-2);
    html+='<div class="hm-s" style="left:'+b.x.toFixed(1)+'px;top:'+b.y.toFixed(1)+'px;width:'+b.w.toFixed(1)+'px;height:'+b.h.toFixed(1)+'px">'+(hh?'<span class="hm-sn">'+esc(SEC[s.name]||s.name)+'</span>':'')+'</div>';
    inner.forEach(function(c){var r=c.it.r,w=c.w,h=c.h,big=w>38&&h>26,mid=w>64&&h>44,fs=Math.max(9,Math.min(26,Math.sqrt(w*h)/4.2));
      var tip='<b>'+esc(r.t)+' · '+esc(r.n)+'</b><span>'+esc(SEC[r.sec]||r.sec)+'<br>Cours : <b>'+esc(nf(r.px,2))+' $</b><br>Variation : <b>'+esc(pc(r.ch))+'</b><br>Capitalisation : <b>'+esc(cap(r.mc))+'</b></span>';
      html+='<button type="button" class="hm-c" data-sym="'+esc(r.s)+'" data-nm="'+esc(r.n||r.t)+'" data-x="'+esc(tip)+'" style="left:'+c.x.toFixed(1)+'px;top:'+c.y.toFixed(1)+'px;width:'+Math.max(0,w-1).toFixed(1)+'px;height:'+Math.max(0,h-1).toFixed(1)+'px;background:'+color(r.ch)+'">'+
        (big?'<b style="font-size:'+fs.toFixed(0)+'px">'+esc(r.t)+'</b>':'')+(mid?'<span style="font-size:'+Math.max(9,fs*.62).toFixed(0)+'px">'+esc(pc(r.ch))+'</span>':'')+'</button>';});
  });
  var out=seg()+'<div class="hm-top"><b>'+esc(I.n)+'</b><span class="mono '+u.cls(avg)+'">'+pc(avg)+' pondéré par la capitalisation</span><span class="hm-n">'+R.length+' valeurs · mis à jour à '+new Date(HM.ts[HM.k]).toLocaleTimeString("fr-FR",{timeZone:"Europe/Paris",hour:"2-digit",minute:"2-digit"})+' (Paris)</span></div>'+
    '<div class="hm-map" style="height:'+H+'px">'+html+'</div>'+legend()+
    '<p class="x-n">Carte inspirée de Finviz : chaque case est une entreprise, regroupée par secteur. Les plus grosses cases pèsent le plus dans l\'indice : quand elles sont vertes ensemble, l\'indice monte franchement ; quand la carte est mélangée, le mouvement est fragile. Prix différés (TradingView), actualisés toutes les 2 minutes.</p>';
  if(host._h!==out){host.innerHTML=out;host._h=out;}
}
CK.hmap={boot:function(){
  var host=u.$("hmap");if(!host)return;
  host.addEventListener("click",function(e){
    var b=e.target.closest("[data-hm]");if(b){HM.k=b.getAttribute("data-hm");CK.ls("hmIdx",HM.k);host._h=null;render();load(true);return;}
    var c=e.target.closest("[data-sym]");if(c&&CK.openChart)CK.openChart(c.getAttribute("data-sym"),c.getAttribute("data-nm"));});
  var rz=null;window.addEventListener("resize",function(){clearTimeout(rz);rz=setTimeout(function(){host._h=null;render();},250);});
  render();load(true);
  setInterval(function(){if(!document.hidden&&host.offsetParent!==null)load(false);},120000);
}};
})();
