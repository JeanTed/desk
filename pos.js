/* ================================================================
   DESK — Dérivés & positionnement, agrégés sur 5 plateformes
   Binance, Bybit, OKX, Bitget, Hyperliquid (+ Deribit pour les options,
   Coinbase pour la prime US). Tout est lu directement, sans clé.
   · Open interest total en $ (somme des 5) + variation 1 h / 24 h
     (historique Binance + Bybit, en nombre de coins pour neutraliser le prix)
   · Funding moyen pondéré par l'open interest (ramené à 8 h)
   · Ratios long/short (comptes Binance, top traders Binance, Bybit)
   · Flux agressif (taker) Binance 1 h et 24 h
   · Basis du perpétuel (mark / index), prime Coinbase, DVOL et put/call Deribit
   Chaque bloc échoue proprement : une source muette n'efface pas les autres.
   ================================================================ */
(function(){
"use strict";
var CK=window.CK,u=CK.u,S=CK.S;
var BN="https://fapi.binance.com",BB="https://api.bybit.com",OKX="https://www.okx.com",BG="https://api.bitget.com",HL="https://api.hyperliquid.xyz/info",DB="https://www.deribit.com/api/v2/public",CB="https://api.exchange.coinbase.com";
var EX=[["binance","Binance"],["bybit","Bybit"],["okx","OKX"],["bitget","Bitget"],["hl","Hyperliquid"]];
S.pos=S.pos||{};["BTC","ETH","NDX","SPX"].forEach(function(k){S.pos[k]=S.pos[k]||{ex:{}};});
/* Indices actions : perpétuels OKX qui répliquent le Nasdaq 100 et le S&P 500 (mêmes instruments que les corrélations) */
var IDX={NDX:{n:"NASDAQ 100",inst:"US100-USDT-SWAP",idx:"US100-USDT"},SPX:{n:"S&P 500",inst:"SPX-USDT-SWAP",idx:"SPX-USDT"}};
var ASSETS=[["NDX","NASDAQ 100"],["SPX","S&P 500"],["BTC","BTC"],["ETH","ETH"]];
var sym=CK.ls("posSym2")||"NDX",lastUp=0;
if(!S.pos[sym])sym="NDX";
function J(url,opt){return u.fetchJSON(url,opt,12000);}
function q(p){return p.catch(function(){return null;});}

/* ---------- Chargement ---------- */
function loadFast(b){
  var P=S.pos[b],s=b+"USDT";
  return Promise.all([
    q(J(BN+"/fapi/v1/premiumIndex?symbol="+s)),q(J(BN+"/fapi/v1/openInterest?symbol="+s)),
    q(J(BB+"/v5/market/tickers?category=linear&symbol="+s)),
    q(J(OKX+"/api/v5/public/open-interest?instType=SWAP&instId="+b+"-USDT-SWAP")),
    q(J(BG+"/api/v2/mix/market/ticker?symbol="+s+"&productType=usdt-futures")),q(J(BG+"/api/v2/mix/market/open-interest?symbol="+s+"&productType=usdt-futures"))
  ]).then(function(a){
    var pi=a[0],oi=a[1],bb=a[2]&&a[2].result&&a[2].result.list&&a[2].result.list[0],ok=a[3]&&a[3].data&&a[3].data[0],bt=a[4]&&a[4].data&&a[4].data[0],bo=a[5]&&a[5].data&&a[5].data.openInterestList&&a[5].data.openInterestList[0];
    var mark=pi?+pi.markPrice:(bb?+bb.markPrice:0);
    if(pi&&oi)P.ex.binance={oiC:+oi.openInterest,oiU:+oi.openInterest*mark,f8:+pi.lastFundingRate*100,next:+pi.nextFundingTime};
    if(pi){P.mark=mark;P.index=+pi.indexPrice;P.basis=(+pi.markPrice/+pi.indexPrice-1)*100;}
    if(bb)P.ex.bybit={oiC:+bb.openInterest,oiU:+bb.openInterestValue,f8:+bb.fundingRate*100,next:+bb.nextFundingTime};
    var of=S.fund&&S.fund[b];
    if(ok)P.ex.okx={oiC:+ok.oiCcy,oiU:+ok.oiUsd||+ok.oiCcy*mark,f8:of?of.r*100:null,next:of?of.next:null};
    if(bt){var bc=bo?+bo.size:+bt.holdingAmount;P.ex.bitget={oiC:bc,oiU:bc*(+bt.markPrice||mark),f8:+bt.fundingRate*100,next:null};}
  });
}
function loadIdx(k){
  var P=S.pos[k],d=IDX[k],i=d.inst;
  return Promise.all([
    q(J(OKX+"/api/v5/market/ticker?instId="+i)),
    q(J(OKX+"/api/v5/public/mark-price?instType=SWAP&instId="+i)),
    q(J(OKX+"/api/v5/public/open-interest?instType=SWAP&instId="+i)),
    q(J(OKX+"/api/v5/public/funding-rate?instId="+i)),
    q(J(OKX+"/api/v5/market/index-tickers?instId="+d.idx))
  ]).then(function(a){
    var g=function(r){return r&&r.data&&r.data[0];},tk=g(a[0]),mk=g(a[1]),oi=g(a[2]),fr=g(a[3]),ix=g(a[4]);
    if(tk){P.last=+tk.last;P.open=+tk.open24h;}
    var mark=mk?+mk.markPx:(tk?+tk.last:0);if(mark)P.mark=mark;
    if(ix&&+ix.idxPx){P.index=+ix.idxPx;P.basis=mark?(mark/P.index-1)*100:null;}
    if(oi||fr){var x=P.ex.okx||(P.ex.okx={oiC:0,oiU:0,f8:null,next:null});
      if(oi){x.oiC=+oi.oiCcy;x.oiU=+oi.oiUsd||+oi.oiCcy*mark;}
      if(fr){var iv=+fr.nextFundingTime-+fr.fundingTime,k8=iv>0?28800000/iv:1;x.f8=+fr.fundingRate*100*k8;x.next=+fr.nextFundingTime;}}
    var o=P.ex.okx;P.tot=o&&o.oiU>0?o.oiU:0;P.nEx=P.tot>0?1:0;P.fw=o&&o.f8!=null&&isFinite(o.f8)?o.f8:null;
    P.bad=!!(P.last&&P.last<500);
  });
}
function loadHL(){
  return q(J(HL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"metaAndAssetCtxs"})})).then(function(j){
    if(!j||!j[0])return;["BTC","ETH"].forEach(function(b){var i=j[0].universe.findIndex(function(x){return x.name===b;});if(i<0)return;var c=j[1][i],px=+c.markPx||+c.oraclePx;
      S.pos[b].ex.hl={oiC:+c.openInterest,oiU:+c.openInterest*px,f8:+c.funding*8*100,next:null};});});
}
function loadHist(b){
  var P=S.pos[b],s=b+"USDT";
  return Promise.all([q(J(BN+"/futures/data/openInterestHist?symbol="+s+"&period=1h&limit=25")),q(J(BB+"/v5/market/open-interest?category=linear&symbol="+s+"&intervalTime=1h&limit=25")),
    q(J(BB+"/v5/market/open-interest?category=linear&symbol="+s+"&intervalTime=1d&limit=8"))]).then(function(a){
    var m={};(a[0]||[]).forEach(function(x){var t=+x.timestamp;(m[t]=m[t]||{t:t}).bn=+x.sumOpenInterest;});
    ((a[1]&&a[1].result&&a[1].result.list)||[]).forEach(function(x){var t=+x.timestamp;(m[t]=m[t]||{t:t}).bb=+x.openInterest;});
    var H=Object.keys(m).map(function(k){return m[k];}).filter(function(x){return x.bn!=null&&x.bb!=null;}).sort(function(x,y){return x.t-y.t;});
    if(H.length>=2){var last=H[H.length-1],sum=function(x){return x.bn+x.bb;};P.oiH=H.map(sum);P.oi1h=(sum(last)/sum(H[H.length-2])-1)*100;P.oi24=(sum(last)/sum(H[0])-1)*100;P.oiHT=H[0].t;}
    P.bbD=((a[2]&&a[2].result&&a[2].result.list)||[]).map(function(x){return +x.openInterest;});
  });
}
function loadRatios(b){
  var P=S.pos[b],s=b+"USDT";
  return Promise.all([q(J(BN+"/futures/data/globalLongShortAccountRatio?symbol="+s+"&period=1h&limit=1")),q(J(BN+"/futures/data/topLongShortPositionRatio?symbol="+s+"&period=1h&limit=1")),
    q(J(BB+"/v5/market/account-ratio?category=linear&symbol="+s+"&period=1h&limit=1")),q(J(BN+"/futures/data/takerlongshortRatio?symbol="+s+"&period=1h&limit=24"))]).then(function(a){
    if(a[0]&&a[0][0])P.lsG=+a[0][0].longAccount*100;if(a[1]&&a[1][0])P.lsT=+a[1][0].longAccount*100;
    var br=a[2]&&a[2].result&&a[2].result.list&&a[2].result.list[0];if(br)P.lsB=+br.buyRatio*100;
    var tk=a[3]||[];if(tk.length){var L=tk[tk.length-1],bv=0,sv=0;tk.forEach(function(x){bv+=+x.buyVol;sv+=+x.sellVol;});
      P.tk1=+L.buyVol/((+L.buyVol+ +L.sellVol)||1)*100;P.tk24=bv/((bv+sv)||1)*100;P.tkS=tk.map(function(x){return +x.buyVol/((+x.buyVol+ +x.sellVol)||1)*100;});}
  });
}
function loadOpt(){
  var now=Date.now();
  return Promise.all(["BTC","ETH"].map(function(b){return Promise.all([q(J(DB+"/get_volatility_index_data?currency="+b+"&resolution=3600&start_timestamp="+(now-86400000)+"&end_timestamp="+now)),
    q(J(DB+"/get_book_summary_by_currency?currency="+b+"&kind=option")),q(J(CB+"/products/"+b+"-USD/ticker"))]).then(function(a){var P=S.pos[b];
    var dv=a[0]&&a[0].result&&a[0].result.data;if(dv&&dv.length){P.dvol=dv[dv.length-1][4];P.dvol24=dv[0][4];}
    var ob=a[1]&&a[1].result;if(ob&&ob.length){var pu=0,ca=0;ob.forEach(function(x){var oi=+x.open_interest||0;if(/-P$/.test(x.instrument_name))pu+=oi;else if(/-C$/.test(x.instrument_name))ca+=oi;});P.pcr=ca?pu/ca:null;P.optOI=pu+ca;}
    if(a[2]&&a[2].price){P.cbPx=+a[2].price;cbCalc(b);}});}));
}
function cbCalc(b){var P=S.pos[b],tk=S.tick[b+"-USDT"];if(P.cbPx&&tk&&tk.last)P.cb=(P.cbPx/tk.last-1)*100;}
function aggregate(){
  ["BTC","ETH"].forEach(function(b){var P=S.pos[b],tot=0,wf=0,wo=0,n=0;
    var of=S.fund&&S.fund[b];if(P.ex.okx&&of){P.ex.okx.f8=of.r*100;P.ex.okx.next=of.next;}
    EX.forEach(function(e){var x=P.ex[e[0]];if(!x||!(x.oiU>0))return;tot+=x.oiU;n++;if(x.f8!=null&&isFinite(x.f8)){wf+=x.f8*x.oiU;wo+=x.oiU;}});
    P.tot=tot;P.nEx=n;P.fw=wo?wf/wo:null;
    var tk=S.tick[b+"-USDT"];if(P.cbPx&&tk&&tk.last)P.cb=(P.cbPx/tk.last-1)*100;
    /* Open interest 7 j : Binance (journalier) + Bybit (journalier), en coins */
    var o=S.oi&&S.oi[b];if(o&&o.length>=8&&P.bbD&&P.bbD.length>=8)P.oi7=((o[0].coin+P.bbD[0])/(o[7].coin+P.bbD[7])-1)*100;});
  lastUp=Date.now();
}
function safe(p,n){return p.catch(function(e){if(window.console)console.warn("[pos] "+n,e);});}
function all(){return Promise.all([safe(loadFast("BTC"),"BTC"),safe(loadFast("ETH"),"ETH"),safe(loadHL(),"HL"),safe(loadIdx("NDX"),"NDX"),safe(loadIdx("SPX"),"SPX")]).then(function(){aggregate();render();if(CK.computeFactors)CK.computeFactors();});}
function slow(){return Promise.all([safe(loadHist("BTC"),"histBTC"),safe(loadHist("ETH"),"histETH"),safe(loadRatios("BTC"),"ratiosBTC"),safe(loadRatios("ETH"),"ratiosETH"),safe(loadOpt(),"options")]).then(function(){aggregate();render();if(CK.computeFactors)CK.computeFactors();});}

/* ---------- Lecture ---------- */
var nf=u.nf,pct=u.pct,usd=u.usd;
function sgn(v,d){return (v>0?"+":"")+nf(v,d);}
function rd(t,c){return '<span class="pz-r '+(c||"neu")+'">'+t+'</span>';}
function readFund(f){return f==null?"":f>.03?rd("Longs paient cher : risque de purge","def"):f>.01?rd("Légèrement haussier","neu"):f<-.005?rd("Shorts paient : carburant de squeeze","fav"):rd("Équilibré","neu");}
function readOI(P){var tk=S.tick[sym+"-USDT"],dp=tk?(tk.last/tk.open-1)*100:null;if(P.oi24==null||dp==null)return "";var o=P.oi24;
  if(Math.abs(o)<1.5)return rd("Levier stable","neu");if(o>0&&dp>0)return rd("Hausse avec nouvelles positions","fav");if(o>0)return rd("Baisse avec nouveaux shorts","def");if(dp>0)return rd("Hausse par rachats de shorts","neu");return rd("Purge du levier","neu");}
function readLS(v){return v==null?"":v>65?rd("Foule très longue (contrarien)","def"):v<45?rd("Foule plutôt short (contrarien)","fav"):rd("Positionnement modéré","neu");}
function readTk(v){return v==null?"":v>55?rd("Acheteurs agressifs","fav"):v<45?rd("Vendeurs agressifs","def"):rd("Flux équilibré","neu");}
function readBasis(v){return v==null?"":v>.05?rd("Perp au-dessus du spot (appétit)","neu"):v<-.05?rd("Perp sous le spot (stress)","def"):rd("Perp aligné sur le spot","neu");}
function readCB(v){return v==null?"":v>.1?rd("Demande US forte","fav"):v<-.1?rd("Vente côté US","def"):rd("Pas d'écart notable","neu");}
function readVol(v){return v==null?"":v<40?rd("Vol implicite basse : gros mouvement possible","neu"):v>70?rd("Marché sous stress","def"):rd("Vol implicite normale","neu");}
function spark(arr,mid){if(!arr||arr.length<2)return "";var mn=Math.min.apply(null,arr),mx=Math.max.apply(null,arr);if(mid!=null){mn=Math.min(mn,mid-5);mx=Math.max(mx,mid+5);}var r=(mx-mn)||1,k=arr.length-1;
  var pts=arr.map(function(v,i){return (i/k*100).toFixed(1)+","+(28-(v-mn)/r*26).toFixed(1);}).join(" ");
  return '<svg class="pz-sp" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">'+(mid!=null?'<line x1="0" x2="100" y1="'+(28-(mid-mn)/r*26).toFixed(1)+'" y2="'+(28-(mid-mn)/r*26).toFixed(1)+'"/>':"")+'<polyline points="'+pts+'"/></svg>';}

/* ---------- Affichage ---------- */
function tile(k,v,sub,read,extra){return '<div class="pz-t"><span class="pz-k">'+k+'</span><b class="pz-v">'+v+'</b>'+(sub?'<span class="pz-s">'+sub+'</span>':"")+(extra||"")+(read||"")+'</div>';}
function idxTiles(P){
  var has=P.tot>0,nxt=P.ex.okx&&P.ex.okx.next,dp=P.last&&P.open?(P.last/P.open-1)*100:null;
  return [
    tile("Prix du perpétuel",P.last?u.px(P.last):"—",dp!=null?'<span class="'+u.cls(dp)+'">'+sgn(dp,2)+' %</span> sur 24 h · OKX':"",""),
    tile("Open interest",has?usd(P.tot):"—","OKX seul · positions ouvertes en $",""),
    tile("Funding moyen · 8 h",P.fw!=null?'<span class="'+u.cls(P.fw)+'">'+nf(P.fw,4)+' %</span>':"—",P.fw!=null?nf(P.fw*3*365,1)+" % par an · OKX":"",readFund(P.fw)),
    tile("Prochain funding",'<span id="pzCd">'+(nxt?u.clock(nxt-Date.now()):"—")+'</span>',"OKX",""),
    tile("Basis du perpétuel",P.basis!=null?'<span class="'+u.cls(P.basis)+'">'+sgn(P.basis,3)+' %</span>':"—","mark "+(P.mark?u.px(P.mark):"—")+" / index "+(P.index?u.px(P.index):"—"),readBasis(P.basis))
  ].join("");
}
function render(){
  var host=u.$("deriv");if(!host)return;cbCalc(sym);var P=S.pos[sym]||{ex:{}},has=P.tot>0;
  var nxt=null;["binance","bybit","okx"].forEach(function(e){var x=P.ex[e];if(x&&x.next&&(!nxt||x.next<nxt))nxt=x.next;});
  var isI=!!IDX[sym],EXL=isI?[["okx","OKX"]]:EX;
  var head='<div class="pz-h"><div class="seg" role="group" aria-label="Actif">'+ASSETS.map(function(a){var b=a[0];return '<button type="button" data-pz="'+b+'" aria-pressed="'+(b===sym)+'">'+a[1]+'</button>';}).join("")+'</div>'+
    '<span class="pz-meta">'+(isI?'OKX · perpétuel '+IDX[sym].n:(P.nEx||0)+' plateformes')+' · '+(lastUp?"mis à jour "+u.ago(lastUp):"chargement…")+'</span></div>';
  var t=isI?idxTiles(P):[
    tile("Open interest total",has?usd(P.tot):"—",P.oi1h!=null?'<span class="'+u.cls(P.oi1h)+'">'+sgn(P.oi1h,2)+' %</span> 1 h · <span class="'+u.cls(P.oi24)+'">'+sgn(P.oi24,2)+' %</span> 24 h'+(P.oi7!=null?' · <span class="'+u.cls(P.oi7)+'">'+sgn(P.oi7,1)+' %</span> 7 j':""):"variation en cours de calcul",readOI(P),spark(P.oiH)),
    tile("Funding moyen · 8 h",P.fw!=null?'<span class="'+u.cls(P.fw)+'">'+nf(P.fw,4)+' %</span>':"—",P.fw!=null?nf(P.fw*3*365,1)+" % par an · pondéré par l'OI":"",readFund(P.fw)),
    tile("Prochain funding",'<span id="pzCd">'+(nxt?u.clock(nxt-Date.now()):"—")+'</span>',"Binance · Bybit · OKX",""),
    tile("Comptes longs · Binance",P.lsG!=null?nf(P.lsG,1)+" %":"—",(P.lsT!=null?"Top traders "+nf(P.lsT,1)+" %":"")+(P.lsB!=null?" · Bybit "+nf(P.lsB,1)+" %":""),readLS(P.lsG)),
    tile("Flux agressif 1 h",P.tk1!=null?(P.tk1>=50?'<span class="up">Achat '+nf(P.tk1,0)+' %</span>':'<span class="down">Vente '+nf(100-P.tk1,0)+' %</span>'):"—",P.tk24!=null?"24 h : achat "+nf(P.tk24,0)+" % · Binance taker":"",readTk(P.tk1),spark(P.tkS,50)),
    tile("Basis du perpétuel",P.basis!=null?'<span class="'+u.cls(P.basis)+'">'+sgn(P.basis,3)+' %</span>':"—","mark "+(P.mark?u.px(P.mark):"—")+" / index "+(P.index?u.px(P.index):"—"),readBasis(P.basis)),
    tile("Prime Coinbase",P.cb!=null?'<span class="'+u.cls(P.cb)+'">'+sgn(P.cb,3)+' %</span>':"—","Coinbase "+sym+"-USD vs OKX "+sym+"-USDT",readCB(P.cb)),
    tile("Volatilité implicite (DVOL)",P.dvol!=null?nf(P.dvol,1):"—",(P.dvol24!=null?"24 h : "+nf(P.dvol24,1):"")+(P.pcr!=null?" · put/call "+nf(P.pcr,2):"")+" · Deribit",readVol(P.dvol))
  ].join("");
  var mx=0;EXL.forEach(function(e){var x=P.ex[e[0]];if(x&&x.oiU>mx)mx=x.oiU;});
  var rows=EXL.map(function(e){var x=P.ex[e[0]];if(!x)return '<tr class="off"><td>'+e[1]+'</td><td colspan="4">indisponible pour le moment</td></tr>';
    var share=P.tot?x.oiU/P.tot*100:0;
    return '<tr><td><b>'+e[1]+'</b></td><td class="r mono">'+usd(x.oiU)+'</td><td class="pz-bar"><i style="width:'+(x.oiU/mx*100).toFixed(1)+'%"></i><span class="mono">'+nf(share,1)+' %</span></td>'+
      '<td class="r mono '+(x.f8!=null?u.cls(x.f8):"")+'">'+(x.f8!=null?nf(x.f8,4)+" %":"—")+'</td><td class="r mono">'+(x.f8!=null?nf(x.f8*3*365,1)+" %":"—")+'</td></tr>';}).join("");
  var html=head+'<div class="pz-g">'+t+'</div><div class="pz-tw"><table class="pz-tb"><thead><tr><th>Plateforme</th><th class="r">Open interest</th><th>Part</th><th class="r">Funding 8 h</th><th class="r">Par an</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    (isI?'<p class="pz-n">Indice suivi via le perpétuel OKX '+IDX[sym].inst+' (cote en continu, en dollars). Seules les données disponibles sans clé sont affichées : pas de ratio long/short, de flux taker ni d\'options pour les indices. Funding ramené à 8 h.'+(P.bad?' <b>Attention : le prix reçu ne ressemble pas à un indice, vérifier l\'instrument.</b>':'')+'</p>':'<p class="pz-n">Funding Hyperliquid ramené de l\'heure à 8 h. Ratios et flux taker : Binance (et Bybit pour les comptes). Prime Coinbase calculée en dollars contre l\'USDT d\'OKX.</p>');
  if(host._h!==html){host.innerHTML=html;host._h=html;}
}
function tick(){var el=u.$("pzCd");if(!el)return;var P=S.pos[sym]||{ex:{}},n=null;["binance","bybit","okx"].forEach(function(e){var x=P.ex[e];if(x&&x.next&&(!n||x.next<n))n=x.next;});if(n)el.textContent=u.clock(n-Date.now());}

CK.pos={
  boot:function(){
    var host=u.$("deriv");if(host){host.classList.add("pz");host.addEventListener("click",function(e){var b=e.target.closest("[data-pz]");if(!b)return;sym=b.getAttribute("data-pz");CK.ls("posSym2",sym);host._h=null;render();});}
    var h2=document.querySelector('.mod[data-mod="deriv"] .mhd h2');if(h2)h2.textContent="Dérivés & positionnement";
    var meta=document.querySelector('.mod[data-mod="deriv"] .mhd .meta');if(meta)meta.textContent="Binance · Bybit · OKX · Bitget · Hyperliquid";
    render();all().then(slow);
    setInterval(all,60000);setInterval(slow,300000);setInterval(function(){tick();},1000);setInterval(function(){if(lastUp)render();},15000);
  },
  render:render
};
})();
