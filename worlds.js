/* ================================================================
   COCKPIT — Écran « Choisis ton monde » (v2)
   Cinq mondes en cartes vivantes. Le monde choisi s'affiche en grand :
   titre, chiffres clés, « À retenir », illustration INTERACTIVE
   (survol = bulle de détails, clic = action : graphique, lien, entrer).
   Survol des cartes avec délai d'intention (on peut traverser les cartes
   sans changer de monde). Entrée = la carte grandit jusqu'au monde.
   Dans un monde : barre de monde (retour, titre, chiffres, raccourcis).
   ================================================================ */
(function(){
"use strict";
var CK=window.CK,u=CK.u,esc=u.esc;
var W0=[
  {v:"plan",name:"Plan Futures",key:"1",col:"#B8F36B",desc:"Le plan du jour : niveaux, murs d'options, annonces et ouverture US."},
  {v:"journee",name:"Journée",key:"2",col:"#E9C46A",desc:"Sessions, annonces et dérivés : où en est la journée."},
  {v:"news",name:"News",key:"3",col:"#A99BEA",desc:"Toutes les news en direct : tweets, Trump, macro, en français."},
  {v:"net",name:"Connexions",key:"4",col:"#5FD3C6",desc:"L'état de chaque source de données, en direct."}
];
/* Espaces décochés dans le Studio : retirés de l'accueil ; les raccourcis clavier suivent l'ordre restant */
var W=W0.filter(function(w){var e=(CK.cfg&&CK.cfg().espaces)||{};return e[w.v]!==false;});W.forEach(function(w,i){w.key=String(i+1);});
var ln,tip,sel=0,artLayer=null,reduce=CK.reduce,TIPS=[],ACTS=[],hoverT=null,bar;
function idxOf(v){for(var i=0;i<W.length;i++)if(W[i].v===v)return i;return -1;}
function cd(ms){var m=Math.max(0,Math.round(ms/60000));return m<60?m+" min":Math.floor(m/60)+" h "+(m%60<10?"0":"")+m%60;}
function hhmm(h){h=((h%24)+24)%24;var H=Math.floor(h),M=Math.round((h-H)*60);if(M===60){H=(H+1)%24;M=0;}return (H<10?"0":"")+H+":"+(M<10?"0":"")+M;}
function strip(h){var d=document.createElement("div");d.innerHTML=h||"";return d.textContent||"";}

/* ---------- Données ---------- */
function D(){
  var S=CK.S,now=Date.now(),F=S.factors||[],fav=0,def=0,neu=0;F.forEach(function(f){if(f.na)return;if(f.impact>0)fav++;else if(f.impact<0)def++;else neu++;});
  var heads=[].map.call(document.querySelectorAll("table.scan thead th"),function(th){return th.textContent.trim();});
  var rows=[].slice.call(document.querySelectorAll("#scanBody tr"),0,6).map(function(tr){var s=tr.querySelector("[data-star]"),tds=[].slice.call(tr.children),last=(tds[tds.length-1]||{}).textContent||"",m=last.match(/(\d+)/),ch=tds[2];
    var mk=(tds[0]&&tds[0].textContent.match(/(Perp|Spot)[^·]*·\s*([\d,.\s]+\S*)/))||null;
    return {n:s?s.getAttribute("data-star"):"",sc:m?+m[1]:0,px:tds[1]?tds[1].textContent:"",ch:ch?ch.textContent:"",up:ch&&/up/.test(ch.className),mk:mk?mk[1]+" · vol. "+mk[2]:"",
      cells:tds.slice(3).map(function(td,k){return [heads[k+3]||"",td.textContent.trim()];}).filter(function(c){return c[0]&&c[1];})};});
  var sm=(u.$("scanMeta")||{}).textContent||"",mt=sm.match(/(\d+)\s*résultat/),pr=document.querySelector(".preset[aria-pressed=\"true\"]"),pn=pr&&pr.firstElementChild?pr.firstElementChild.textContent.trim():"";
  var L=0,Sh=0,big=null,bk=[],bigs=[];for(var b=0;b<60;b++)bk.push({l:0,s:0,n:0,top:null});
  (S.liqHist||[]).forEach(function(x){var age=now-x.ts;if(age<3600000&&age>=0){if(x.long)L+=x.usd;else Sh+=x.usd;var k=59-Math.floor(age/60000);if(k>=0){var B=bk[k];if(x.long)B.l+=x.usd;else B.s+=x.usd;B.n++;if(!B.top||x.usd>B.top.usd)B.top=x;}
    if(!big||x.usd>big.usd)big=x;if(x.usd>=50000)bigs.push(x);}});
  bigs.sort(function(a,b){return b.ts-a.ts;});
  var items=(S.news&&S.news.macro)||[],recent=items.filter(function(x){return x.ts&&now-x.ts<3600000;}).length;
  var sess=CK.day&&CK.day.sessions?CK.day.sessions():[],ph=CK.day&&CK.day.paris?CK.day.paris():new Date().getHours();
  var up=(S.cal||[]).filter(function(e){return e.ts>now-600000;}).slice(0,6);
  return {now:now,F:F,fav:fav,def:def,neu:neu,rows:rows,setups:mt?+mt[1]:null,preset:pn,L:L,Sh:Sh,big:big,bigs:bigs,bk:bk,items:items,recent:recent,ev:S.nextEv,
    sess:sess,ph:ph,cal:S.cal||[],up:up,mg:S.liqMagnets,
    hotLiq:!!(big&&big.usd>=1e6&&now-big.ts<300000),hotEv:!!(S.nextEv&&S.nextEv.ts>now&&S.nextEv.ts-now<9e5)};
}
/* Prochains rendez-vous de la journée : sessions + annonces, triés */
function agenda(d){
  var L=[];d.sess.forEach(function(s){if(s.toClose!=null)L.push({ms:s.toClose*3600000,t:s.n+" ferme",k:"s",hot:s.toClose<.25});if(s.toOpen!=null)L.push({ms:s.toOpen*3600000,t:s.n+" ouvre",k:"s",hot:s.toOpen<.25});});
  d.up.forEach(function(e){if(e.ts>d.now)L.push({ms:e.ts-d.now,t:e.fr||e.t,k:e.imp,hot:e.ts-d.now<9e5});});
  return L.sort(function(a,b){return a.ms-b.ms;});
}

/* ---------- Bulles d'infos ---------- */
function T(html,act){TIPS.push(html);ACTS.push(act||"");return ' data-ti="'+(TIPS.length-1)+'"';}
function tipRow(k,v,c){return '<span class="tr"><em>'+esc(k)+'</em><b'+(c?' class="'+c+'"':"")+'>'+v+'</b></span>';}
function tipHead(t,sub,c){return '<span class="th"><i style="background:'+(c||"currentColor")+'"></i><b>'+esc(t)+'</b>'+(sub?'<em>'+sub+'</em>':"")+'</span>';}

/* ---------- Illustrations (SVG 400 × 260) ---------- */
function P(cx,cy,r,deg){var a=deg*Math.PI/180;return [cx+Math.cos(a)*r,cy+Math.sin(a)*r];}
function f1(n){return n.toFixed(1);}
function arcD(cx,cy,r,d0,d1){var a=P(cx,cy,r,d0),b=P(cx,cy,r,d1),lg=(d1-d0)%360>180?1:0;return "M"+f1(a[0])+" "+f1(a[1])+" A"+r+" "+r+" 0 "+lg+" 1 "+f1(b[0])+" "+f1(b[1]);}
var ART={
  journee:function(d,tips){
    var cx=200,cy=130,R=86,h2d=function(h){return h/24*360-90;},s='';
    for(var h=0;h<24;h++){var maj=h%6===0,a=P(cx,cy,R+10,h2d(h)),b=P(cx,cy,R+(maj?22:16),h2d(h));s+='<line class="tk'+(maj?" mj":"")+'" x1="'+f1(a[0])+'" y1="'+f1(a[1])+'" x2="'+f1(b[0])+'" y2="'+f1(b[1])+'"/>';
      if(maj){var t=P(cx,cy,R+34,h2d(h));s+='<text class="lb" x="'+f1(t[0])+'" y="'+f1(t[1]+4)+'">'+h+'h</text>';}}
    d.sess.forEach(function(se,i){var a=((se.a%24)+24)%24,b=a+(se.b-se.a),r=R-4-i*15,dd=arcD(cx,cy,r,h2d(a),h2d(b));
      var st=se.wk?"fermée (week-end)":se.open?"ouverte · ferme dans "+cd(se.toClose*3600000):se.toOpen!=null?"ouvre dans "+cd(se.toOpen*3600000):"terminée pour aujourd'hui";
      var tt=tips?T(tipHead(se.n,"session")+tipRow("Horaires (Paris)",hhmm(a)+" → "+hhmm(b))+tipRow("État",esc(st),se.open?"up":"")):"";
      s+='<g class="hv"'+tt+'><path class="ss'+(se.open?" on":"")+'" d="'+dd+'"/>'+(tips?'<path class="hit" d="'+dd+'" style="stroke-width:16"/>':"")+'</g>';});
    var day=new Date(d.now).toDateString();
    d.cal.forEach(function(e){if(new Date(e.ts).toDateString()!==day)return;var eh=((e.ts-d.now)/3600000)+d.ph,p=P(cx,cy,R+10,h2d(((eh%24)+24)%24));
      var tt=tips?T(tipHead(e.fr||e.t,e.imp==="hi"?"impact fort":"impact moyen",e.imp==="hi"?"var(--down)":"var(--warn)")+tipRow("Heure",u.parisTime(e.ts))+(e.ts>d.now?tipRow("Dans",cd(e.ts-d.now)):"")+
        (e.f?tipRow("Prévision",esc(e.f)):"")+(e.p?tipRow("Précédent",esc(e.p)):"")+(e.a?tipRow("Publié",esc(e.a),"up"):"")):"";
      s+='<g class="hv"'+tt+'><circle class="ev '+e.imp+'" cx="'+f1(p[0])+'" cy="'+f1(p[1])+'" r="5"/>'+(tips?'<circle class="hit" cx="'+f1(p[0])+'" cy="'+f1(p[1])+'" r="12"/>':"")+'</g>';});
    var n=P(cx,cy,R+12,h2d(d.ph));
    s+='<line class="nd" x1="'+cx+'" y1="'+cy+'" x2="'+f1(n[0])+'" y2="'+f1(n[1])+'"/><circle class="ndg" cx="'+f1(n[0])+'" cy="'+f1(n[1])+'" r="10"/><circle class="ndt" cx="'+f1(n[0])+'" cy="'+f1(n[1])+'" r="4.5"/>';
    s+='<circle class="hub" cx="'+cx+'" cy="'+cy+'" r="36"/><text class="big" x="'+cx+'" y="'+(cy+9)+'">'+u.parisTime(d.now)+'</text>';
    return s;},
  macro:function(d,tips){
    var cx=200,cy=130,R=96,list=d.F.length?d.F:new Array(10).fill(null),n=list.length,gap=5,seg=(360-n*gap)/n,s='<circle class="trk" cx="'+cx+'" cy="'+cy+'" r="'+R+'"/>';
    list.forEach(function(f,i){var a0=-90+i*(seg+gap)+gap/2,a1=a0+seg,cl=f?CK.stClass(f):"na",t=P(cx,cy,R+26,(a0+a1)/2),dd=arcD(cx,cy,R,a0,a1);
      var tt=tips&&f?T(tipHead(f.nm,esc(f.val||""))+tipRow("Direction",esc(CK.stLabel(f)),cl==="fav"?"up":cl==="def"?"down":"")+'<span class="tx">'+esc(strip(f.text)).slice(0,230)+'</span><span class="ta">Clic : voir la preuve</span>',"sig:"+f.k):"";
      s+='<g class="hv"'+tt+'><path class="sg '+cl+'" d="'+dd+'"/>'+(tips?'<path class="hit" d="'+dd+'" style="stroke-width:34"/>':"")+(f?'<text class="lb sm" x="'+f1(t[0])+'" y="'+f1(t[1]+4)+'">'+esc(f.sh||f.k)+'</text>':'')+'</g>';});
    s+='<text class="big" x="'+(cx-30)+'" y="'+(cy+4)+'"><tspan class="up">'+d.fav+'↑</tspan></text><text class="big" x="'+(cx+30)+'" y="'+(cy+4)+'"><tspan class="down">'+d.def+'↓</tspan></text><text class="lb" x="'+cx+'" y="'+(cy+32)+'">'+d.neu+' neutres</text>';
    return s;},
  screener:function(d,tips){
    var s='',r=d.rows.length?d.rows:[0,1,2,3,4,5].map(function(){return null;}),mx=Math.max.apply(null,r.map(function(x){return x&&x.sc||1;}))||1;
    r.forEach(function(x,i){var y=34+i*36,w=x?Math.max(10,(x.sc||1)/mx*200):60+((i*37)%90);
      var tt=tips&&x?T(tipHead(x.n,esc(x.mk))+tipRow("Prix",esc(x.px))+tipRow("24 h",esc(x.ch),x.up?"up":"down")+x.cells.slice(0,6).map(function(c){return tipRow(c[0],esc(c[1]));}).join("")+'<span class="ta">Clic : ouvrir le graphique</span>',"chart:"+x.n):"";
      s+='<g class="hv"'+tt+'>'+(tips?'<rect class="hit" x="20" y="'+(y-17)+'" width="360" height="34"/>':"")+'<text class="nm" x="36" y="'+(y+5)+'">'+(x?esc(x.n):"····")+'</text><rect class="bg" x="116" y="'+(y-8)+'" width="200" height="14" rx="7"/><rect class="br" x="116" y="'+(y-8)+'" width="'+f1(w)+'" height="14" rx="7" style="opacity:'+(1-i*.11).toFixed(2)+'"/>'+
        '<text class="vl'+(x?(x.up?" up":" down"):"")+'" x="368" y="'+(y+5)+'">'+(x?esc(x.ch):"")+'</text></g>';});
    return s;},
  liq:function(d,tips){
    var mx=1,s='<line class="mid" x1="20" y1="150" x2="380" y2="150"/>';d.bk.forEach(function(b){mx=Math.max(mx,b.l,b.s);});
    d.bk.forEach(function(b,i){var x=22+i*6,hl=Math.sqrt(b.l/mx)*86,hs=Math.sqrt(b.s/mx)*86;if(!b.n&&!tips)return;
      var t0=new Date(d.now-(59-i)*60000),lab=t0.toLocaleTimeString("fr-FR",{timeZone:"Europe/Paris",hour:"2-digit",minute:"2-digit"});
      var tt=tips&&b.n?T(tipHead(lab,b.n+" liquidation"+(b.n>1?"s":""))+tipRow("Longs liquidés",u.usd(b.l),"down")+tipRow("Shorts liquidés",u.usd(b.s),"up")+(b.top?tipRow("Plus grosse",esc(b.top.base)+" · "+u.usd(b.top.usd)+" · "+esc(b.top.ex)):"")):"";
      s+='<g class="hv"'+tt+'>'+(tips&&b.n?'<rect class="hit" x="'+(x-1)+'" y="60" width="6" height="180"/>':"")+
        (hs>.5?'<rect class="sh" x="'+x+'" y="'+f1(148-hs)+'" width="4" height="'+f1(hs)+'" rx="1.5"/>':"")+(hl>.5?'<rect class="lg" x="'+x+'" y="152" width="4" height="'+f1(hl)+'" rx="1.5"/>':"")+'</g>';});
    s+='<text class="lb al" x="22" y="40">60 dernières minutes</text><text class="big al" x="22" y="74">'+((d.L+d.Sh)?u.usd(d.L+d.Sh):"—")+'</text>'+
      '<text class="lb ar up" x="380" y="40">shorts ↑</text><text class="lb ar down" x="380" y="252">longs ↓</text>';
    return s;},
  news:function(d,tips){
    var s='',it=d.items.slice(0,3);if(!it.length)it=[null,null,null];
    it.forEach(function(x,i){var y=22+i*76,t=x?(x.title||""):"";var l1=t.slice(0,44),l2=t.length>44?t.slice(44,86)+(t.length>86?"…":""):"";
      var tt=tips&&x?T(tipHead(x.ts?u.ago(x.ts):"News","FinancialJuice")+'<span class="tx big">'+esc(t)+'</span>'+(x.link?'<span class="ta">Clic : lire la source</span>':""),x.link?"link:"+x.link:""):"";
      s+='<g class="hv"'+tt+' style="opacity:'+(1-i*.22).toFixed(2)+'"><rect class="nc" x="'+(28+i*6)+'" y="'+y+'" width="'+(344-i*12)+'" height="64" rx="10"/><rect class="na" x="'+(28+i*6)+'" y="'+(y+12)+'" width="3" height="40" rx="1.5"/>'+
        '<text class="lb al" x="'+(44+i*6)+'" y="'+(y+20)+'">'+(x&&x.ts?u.ago(x.ts):"")+'</text><text class="nt" x="'+(44+i*6)+'" y="'+(y+38)+'">'+esc(l1)+'</text><text class="nt" x="'+(44+i*6)+'" y="'+(y+55)+'">'+esc(l2)+'</text></g>';});
    return s;}
};
ART.veille=function(d,tips){
  var st=CK.veille?CK.veille.state():{msgs:[],att:[]},s="",cx=200,cy=134;
  [96,66,36].forEach(function(r,i){s+='<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" style="fill:none;stroke:var(--wc);stroke-opacity:'+(0.18+i*0.1)+';stroke-width:1.5"/>';});
  s+='<line x1="'+cx+'" y1="'+cy+'" x2="'+(cx+92)+'" y2="'+(cy-28)+'" style="stroke:var(--wc);stroke-width:2;stroke-opacity:.7"/><circle cx="'+cx+'" cy="'+cy+'" r="5" style="fill:var(--wc)"/>';
  var pts=st.msgs.slice(-6);pts.forEach(function(m,i){var a=-0.4-i*0.95,rr=40+(m.importance||1)*18,x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr;
    var tt=tips?T(tipHead(esc(m.actif)+" · "+u.parisTime(m.ts),"",m.importance>=2?"var(--warn)":"var(--wc)")+'<span class="tx">'+esc(m.titre)+'</span><span class="ta">Clic : ouvrir l\'agent</span>',"veille"):"";
    s+='<g class="hv"'+tt+'>'+(tips?'<circle class="hit" cx="'+x+'" cy="'+y+'" r="16"/>':'')+'<circle cx="'+x+'" cy="'+y+'" r="'+(4+(m.importance||1)*2)+'" style="fill:var(--wc);opacity:'+(m.importance>=2?1:.55)+'"/></g>';});
  if(!pts.length)s+='<text class="lb sm" x="'+cx+'" y="'+(cy+124)+'">'+(st.active?"Veille active":"Clé IA à ajouter")+'</text>';
  return s;};
var ART_CLOCK=ART.journee;
ART.plan=function(d,tips){return ART_CLOCK(d,tips);};
/* Journée : une page de calendrier avec la date du jour et les annonces du jour (étoiles d'importance) */
ART.journee=function(d,tips){
  var s='',x0=70,y0=22,w=260,h=216,dt=new Date(d.now),
    jour=dt.toLocaleDateString("fr-FR",{timeZone:"Europe/Paris",day:"numeric"}),
    mois=dt.toLocaleDateString("fr-FR",{timeZone:"Europe/Paris",month:"long"}).toUpperCase(),
    sem=dt.toLocaleDateString("fr-FR",{timeZone:"Europe/Paris",weekday:"long"}).toUpperCase();
  s+='<rect x="'+x0+'" y="'+y0+'" width="'+w+'" height="'+h+'" rx="16" style="fill:var(--panel);stroke:var(--wc);stroke-width:2"/>';
  s+='<path d="M'+x0+' '+(y0+16)+'a16 16 0 0 1 16-16h'+(w-32)+'a16 16 0 0 1 16 16v38h-'+w+'z" style="fill:var(--wc);opacity:.9"/>';
  s+='<rect x="'+(x0+54)+'" y="'+(y0-8)+'" width="8" height="24" rx="4" style="fill:var(--text)"/><rect x="'+(x0+w-62)+'" y="'+(y0-8)+'" width="8" height="24" rx="4" style="fill:var(--text)"/>';
  s+='<text class="lb" x="200" y="'+(y0+34)+'" style="fill:#111;font-weight:800;letter-spacing:.12em">'+esc(sem)+' · '+esc(mois)+'</text>';
  s+='<text class="big" x="'+(x0+58)+'" y="'+(y0+112)+'" style="font-size:64px">'+esc(jour)+'</text>';
  var ev=d.cal.filter(function(e){return new Date(e.ts).toDateString()===dt.toDateString();}).slice(0,4);
  ev.forEach(function(e,i){var y=y0+82+i*30,n=e.imp==="hi"?3:e.imp==="md"?2:1,c=e.imp==="hi"?"var(--down)":e.imp==="md"?"var(--warn)":"var(--muted)";
    var tt=tips?T(tipHead(e.fr||e.t,"importance "+n+" sur 3",c)+tipRow("Heure",u.parisTime(e.ts))+(e.ts>d.now?tipRow("Dans",cd(e.ts-d.now)):"")+(e.f?tipRow("Prévision",esc(e.f)):"")+(e.p?tipRow("Précédent",esc(e.p)):"")+(e.a?tipRow("Publié",esc(e.a),"up"):"")):"";
    s+='<g class="hv"'+tt+'><text class="lb" x="'+(x0+150)+'" y="'+(y+4)+'" style="text-anchor:start">'+u.parisTime(e.ts)+'</text><text x="'+(x0+212)+'" y="'+(y+5)+'" style="fill:'+c+';font-size:14px;letter-spacing:1px">'+"★★★".slice(0,n)+'</text>'+(tips?'<rect class="hit" x="'+(x0+140)+'" y="'+(y-14)+'" width="112" height="26"/>':'')+'</g>';});
  if(!ev.length)s+='<text class="lb sm" x="'+(x0+205)+'" y="'+(y0+122)+'">aucune annonce</text>';
  s+='<line x1="'+(x0+16)+'" y1="'+(y0+168)+'" x2="'+(x0+w-16)+'" y2="'+(y0+168)+'" style="stroke:var(--line-2);stroke-width:1"/>';
  s+='<text class="lb" x="200" y="'+(y0+194)+'">'+(d.sess.filter(function(q){return q.open;}).map(function(q){return q.n;}).join(" · ")||"marchés fermés")+'</text>';
  return s;};
ART.net=function(d,tips){
  var sm=CK.netSummary?CK.netSummary():{list:[]},C={ok:"var(--up)",warn:"var(--warn)",down:"var(--down)",idle:"var(--faint)"},s="";
  sm.list.forEach(function(x,i){var c=i%5,r=Math.floor(i/5),cx=40+c*80,cy=36+r*60,col=C[x.st.k];
    var tt=tips?T(tipHead(x.s.name,esc(x.s.p),col)+tipRow("État",esc(x.st.l),x.st.k==="ok"?"up":x.st.k==="down"?"down":"")+"<span class=\"tx\">"+esc(x.st.d)+"</span><span class=\"ta\">Clic : ouvrir Connexions</span>","net:"+x.s.id):"";
    s+="<g class=\"hv\""+tt+">"+(tips?"<rect class=\"hit\" x=\""+(cx-38)+"\" y=\""+(cy-24)+"\" width=\"76\" height=\"56\"/>":"")+
      "<circle cx=\""+cx+"\" cy=\""+cy+"\" r=\"12\" style=\"fill:"+col+";opacity:.18\"/><circle cx=\""+cx+"\" cy=\""+cy+"\" r=\"6\" style=\"fill:"+col+"\"/>"+
      "<text class=\"lb sm\" x=\""+cx+"\" y=\""+(cy+26)+"\">"+esc(x.s.name.split(" ")[0])+"</text></g>";});
  return s;};
function art(i,d,tips){return '<svg class="w-art" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid meet" aria-hidden="true">'+ART[W[i].v](d,tips)+'</svg>';}

/* ---------- Chiffres clés + « À retenir » ---------- */
function stats(i,d){
  var now=d.now;switch(W[i].v){
    case "journee":var op=d.sess.filter(function(s){return s.open;}).map(function(s){return s.n;}),nx=agenda(d)[0];
      return [[u.parisTime(now),"heure de Paris"],[op.length?op.join(" + "):"Aucune","session ouverte"],nx?[cd(nx.ms),"avant "+nx.t,nx.hot?"down":""]:["—","prochain rendez-vous"]];
    case "macro":return [[String(d.fav),"favorables","up"],[String(d.def),"défavorables","down"],[String(d.neu),"neutres"]];
    case "screener":return [[d.setups!=null?String(d.setups):"—","setups"],[d.preset||"—","stratégie"],[d.rows[0]?d.rows[0].n:"—","en tête"]];
    case "liq":var t=d.L+d.Sh;return [[t?u.usd(t):"—","liquidés en 1 h",d.hotLiq?"down":""],[t?Math.round(d.L/t*100)+" %":"—","de longs"],[d.big?u.usd(d.big.usd):"—",d.big?"plus grosse · "+d.big.base:"plus grosse"]];
    case "news":var f=d.items[0];return [[f&&f.ts?u.ago(f.ts):"—","dernière news"],[String(d.recent),"dans l'heure"],["FinancialJuice","source"]];
    case "veille":var vs=CK.veille?CK.veille.state():{msgs:[],att:[]},lm=vs.msgs[vs.msgs.length-1];return [[vs.active?(vs.busy?"Réfléchit":"Active"):"Inactive","agent IA",vs.active?"up":""],[String(vs.att.length),"lectures aujourd'hui"],[lm?u.parisTime(lm.ts):"—","dernière lecture"]];
    case "net":var sm=CK.netSummary?CK.netSummary():{ok:0,warn:0,down:0};return [[sm.ok+"/"+(sm.list||[]).length,"sources actives","up"],[String(sm.warn),"à surveiller",sm.warn?"warn":""],[String(sm.down),"en panne",sm.down?"down":""]];
  }return [];
}
function insights(i,d){
  var now=d.now;switch(W[i].v){
    case "journee":return agenda(d).slice(0,3).map(function(x){return [x.hot?"!":x.k==="hi"?"●":x.k==="md"?"●":"◷",'<b>'+cd(x.ms)+'</b> · '+esc(x.t),x.hot?"down":x.k==="hi"?"down":x.k==="md"?"warn":""];});
    case "macro":return d.F.filter(function(f){return !f.na&&f.impact;}).sort(function(a,b){return (b.str||0)-(a.str||0);}).slice(0,3).map(function(f){var c=CK.stClass(f);return [c==="fav"?"▲":"▼",'<b>'+esc(f.nm)+'</b> · '+esc(f.label||""),c==="fav"?"up":"down"];});
    case "screener":return d.rows.slice(0,3).map(function(x,k){return [String(k+1),'<b>'+esc(x.n)+'</b> · '+esc(x.px)+' · <span class="'+(x.up?"up":"down")+'">'+esc(x.ch)+'</span>',""];});
    case "liq":var L=[];if(d.mg&&d.mg.low)L.push(["↓","Aimant sous le prix · <b>"+u.nf(d.mg.low.px,0)+"</b> ("+esc(d.mg.sym||"BTC")+")","down"]);if(d.mg&&d.mg.high)L.push(["↑","Aimant au-dessus · <b>"+u.nf(d.mg.high.px,0)+"</b>","up"]);
      d.bigs.slice(0,3-L.length).forEach(function(x){L.push(["●","<b>"+esc(x.base)+"</b> "+(x.long?"long":"short")+" liquidé · "+u.usd(x.usd)+" · "+u.ago(x.ts),x.long?"down":"up"]);});return L;
    case "veille":var vs2=CK.veille?CK.veille.state():{msgs:[]};if(!vs2.active)return [["◷","Connexion à l'agent…",""]];return vs2.msgs.slice(-3).reverse().map(function(m){return [m.importance>=2?"!":"●","<b>"+esc(m.actif)+"</b> · "+esc(m.titre),m.importance>=2?"warn":""];}).concat(vs2.msgs.length?[]:[["◷","Première lecture du marché en préparation",""]]);
    case "net":var L2=(CK.netSummary?CK.netSummary().list:[]).filter(function(x){return x.st.k==="down"||x.st.k==="warn";}).slice(0,3);
      return L2.length?L2.map(function(x){return [x.st.k==="down"?"✕":"!","<b>"+esc(x.s.name)+"</b> · "+esc(x.st.l),x.st.k==="down"?"down":"warn"];}):[["✓","Toutes les sources répondent","up"]];
    case "news":return d.items.slice(0,3).map(function(x){return ["◆",'<b>'+(x.ts?u.ago(x.ts):"")+'</b> · '+esc((x.title||"").slice(0,80))+((x.title||"").length>80?"…":""),""];});
  }return [];
}
function metric(i,d){var s=stats(i,d)[0];return s?s[0]+" · "+s[1]:"";}
function hot(i,d){var nx=agenda(d)[0];if(W[i].v==="net")return CK.netSummary&&CK.netSummary().list.some(function(x){return x.st.k==="down"&&x.s.id!=="relay"&&x.s.id!=="ff";});return (W[i].v==="liq"&&d.hotLiq)||(W[i].v==="journee"&&nx&&nx.hot)||(W[i].v==="news"&&d.items[0]&&d.items[0].ts&&d.now-d.items[0].ts<300000);}

/* ---------- Construction : héros (titre + illustration) + rangée de cartes ---------- */
CK.FLOW=true;
var cards=[],glow,heroBox;
function build(){
  var grid=u.$("grid");if(!grid)return;
  ln=document.createElement("section");ln.id="launcher";ln.className="ln";ln.setAttribute("aria-label","Espaces du desk");
  ln.innerHTML='<div class="ln-amb" aria-hidden="true"></div>'+
    '<div class="ln-hero" id="lnHero"><div class="ln-txt"><span class="ln-over">Espace <b id="lnIdx">01</b> / 0'+W.length+'</span>'+
      '<h1 class="ln-title" id="lnTitle"></h1><p class="ln-desc" id="lnDesc"></p><div class="ln-stats" id="lnStats"></div>'+
      '<div class="ln-ins" id="lnIns"><span class="li-h">Points clés</span><div id="lnInsL"></div></div>'+
      '<button type="button" class="ln-go" id="lnGo" data-cur="Ouvrir"><span id="lnGoT">Ouvrir</span><kbd>↵</kbd></button></div>'+
      '<div class="ln-art" id="lnArt"><span class="ln-art-h">Survole pour les détails · clic pour agir</span></div></div>'+
    '<div class="ln-row" id="lnRow" role="listbox" aria-label="Mondes"><i class="ln-glow" aria-hidden="true"></i></div>'+
    '<div class="ln-hint"><kbd>←</kbd><kbd>→</kbd> naviguer <i></i><kbd>↵</kbd> ouvrir <i></i><kbd>1</kbd>–<kbd>'+W.length+'</kbd> accès direct <i></i><kbd>Échap</kbd> accueil</div>'+
    '<div class="ln-tip" id="lnTip" role="tooltip"></div>';
  grid.parentNode.insertBefore(ln,grid);
  var row=u.$("lnRow");glow=row.querySelector(".ln-glow");tip=u.$("lnTip");heroBox=u.$("lnHero");
  W.forEach(function(w,i){var c=document.createElement("button");c.type="button";c.className="ln-card";c.setAttribute("role","option");c.setAttribute("data-cur","Ouvrir");
    c.style.setProperty("--wc",w.col);c.style.setProperty("--d",(i*70)+"ms");
    c.innerHTML='<span class="lc-art"></span><span class="lc-foot"><span class="lc-t"><kbd>'+w.key+'</kbd><b>'+w.name+'</b></span><em></em></span><i class="lc-dot" aria-hidden="true"></i>';
    /* Délai d'intention : traverser les cartes ne change pas le monde */
    c.addEventListener("pointerenter",function(e){if(e.pointerType!=="mouse")return;clearTimeout(hoverT);hoverT=setTimeout(function(){select(i);},140);});
    c.addEventListener("pointerleave",function(){clearTimeout(hoverT);});
    c.addEventListener("pointermove",function(e){var r=c.getBoundingClientRect();c.style.setProperty("--mx",(e.clientX-r.left)+"px");c.style.setProperty("--my",(e.clientY-r.top)+"px");});
    c.addEventListener("focus",function(){select(i);});
    c.addEventListener("click",function(){clearTimeout(hoverT);select(i);enter(i);});
    row.appendChild(c);cards.push(c);});
  var go=u.$("lnGo");go.addEventListener("click",function(){enter(sel);});
  /* Bouton magnétique */
  go.addEventListener("pointermove",function(e){if(reduce)return;var r=go.getBoundingClientRect();go.style.translate=((e.clientX-r.left-r.width/2)*.2).toFixed(1)+"px "+((e.clientY-r.top-r.height/2)*.3).toFixed(1)+"px";});
  go.addEventListener("pointerleave",function(){go.style.translate="";});
  /* L'illustration suit légèrement la souris */
  heroBox.addEventListener("pointermove",function(e){if(reduce)return;var r=heroBox.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
    heroBox.style.setProperty("--px",(x*14).toFixed(1)+"px");heroBox.style.setProperty("--py",(y*10).toFixed(1)+"px");});
  heroBox.addEventListener("pointerleave",function(){heroBox.style.setProperty("--px","0px");heroBox.style.setProperty("--py","0px");});
  /* Illustration interactive */
  var host=u.$("lnArt");
  host.addEventListener("pointermove",function(e){var g=e.target.closest&&e.target.closest("[data-ti]");if(!g){hideTip();return;}showTip(+g.getAttribute("data-ti"),e.clientX,e.clientY);});
  host.addEventListener("pointerleave",hideTip);
  host.addEventListener("click",function(e){var g=e.target.closest&&e.target.closest("[data-ti]");if(!g)return;act(ACTS[+g.getAttribute("data-ti")]);});
  var lock=0;row.addEventListener("wheel",function(e){var dv=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;if(Math.abs(dv)<8)return;e.preventDefault();var t=Date.now();if(t<lock)return;lock=t+280;select(Math.max(0,Math.min(W.length-1,sel+(dv>0?1:-1))));},{passive:false});
  var tx=null;ln.addEventListener("touchstart",function(e){tx=e.touches[0].clientX;},{passive:true});
  ln.addEventListener("touchend",function(e){if(tx==null)return;var dx=e.changedTouches[0].clientX-tx;tx=null;if(Math.abs(dx)>50&&innerWidth>760)select(Math.max(0,Math.min(W.length-1,sel+(dx<0?1:-1))));},{passive:true});
  document.addEventListener("keydown",function(e){
    if(!isHome()||e.ctrlKey||e.metaKey||e.altKey)return;var t=document.activeElement||{};if(/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName||""))return;
    if(document.querySelector('[id^="ov"]:not([hidden])'))return;
    var k=e.key;if(k==="ArrowRight"||k==="ArrowLeft"){e.preventDefault();select(Math.max(0,Math.min(W.length-1,sel+(k==="ArrowRight"?1:-1))));cards[sel].focus({preventScroll:true});}
    else if(k==="Enter"&&(t===document.body||t.classList&&t.classList.contains("ln-card"))){e.preventDefault();enter(sel);}
  });
  buildBar();cursor();
  var br=document.querySelector(".brand");if(br){br.setAttribute("role","link");br.tabIndex=0;br.title="Accueil";br.addEventListener("click",function(){if(!isHome()&&CK.layout)CK.layout.show("home");});
    br.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();br.click();}});}
  var last=CK.ls("world");select(Math.max(0,idxOf(last)),true);
  place();window.addEventListener("resize",function(){place();moveGlow();});
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(moveGlow);
  refresh();setInterval(refresh,2000);
  if(isHome()&&CK.bg&&CK.bg.tint)CK.bg.tint(W[sel].col);
  if(!isHome()&&CK.bg&&CK.bg.slow)CK.bg.slow(true);
}
function isHome(){return document.body.getAttribute("data-view")==="home";}
function place(){var r=(u.$("strip")||document.body).getBoundingClientRect();ln.style.setProperty("--top",Math.round(r.bottom)+"px");}
function moveGlow(){var c=cards[sel];if(!c||!glow)return;glow.style.width=c.offsetWidth+"px";glow.style.transform="translateX("+c.offsetLeft+"px)";}

/* ---------- Bulle ---------- */
function showTip(n,x,y){
  if(tip._n!==n){tip.innerHTML=TIPS[n]||"";tip._n=n;tip.style.setProperty("--tc",W[sel].col);}
  var w=tip.offsetWidth,h=tip.offsetHeight,L=x+20,Tp=y+18;if(L+w>innerWidth-12)L=x-w-20;if(Tp+h>innerHeight-12)Tp=y-h-18;
  tip.style.transform="translate("+Math.round(L)+"px,"+Math.round(Tp)+"px)";tip.classList.add("on");
}
function hideTip(){if(!tip)return;tip.classList.remove("on");tip._n=null;}
function act(a){
  if(!a)return;var k=a.slice(0,a.indexOf(":")),v=a.slice(a.indexOf(":")+1);
  if(k==="chart"&&CK.openChart)CK.openChart("OKX:"+v+"USDT.P",v);
  else if(k==="link")window.open(v,"_blank","noopener");
  else if(k==="net"){enter(5);}
  else if(k==="sig"){enter(1);setTimeout(function(){var el=document.querySelector('#sigList .sg[data-k="'+v+'"]');if(el)el.click();},700);}
}

/* ---------- Chiffres qui défilent jusqu'à leur valeur ---------- */
function countUp(el){
  if(reduce)return;var txt=el.textContent,m=txt.match(/^([^\d−-]*)([−-]?[\d\s ]*\d)(?:,(\d+))?(.*)$/);if(!m||/:/.test(txt))return;
  var dec=m[3]?m[3].length:0,target=parseFloat((m[2].replace(/[\s ]/g,"").replace("−","-"))+(m[3]?"."+m[3]:""));if(!isFinite(target))return;
  var t0=performance.now(),dur=750,fmt=function(v){return m[1]+v.toLocaleString("fr-FR",{minimumFractionDigits:dec,maximumFractionDigits:dec})+m[4];};
  (function step(now){var k=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-k,3);el.textContent=fmt(target*e);if(k<1)requestAnimationFrame(step);else el.textContent=txt;})(t0);
}

/* ---------- Sélection ---------- */
function select(i,first){
  if(i<0||i>=W.length)return;var changed=i!==sel||first;sel=i;var w=W[i],d=D();
  cards.forEach(function(c,k){c.setAttribute("aria-selected",k===i?"true":"false");c.tabIndex=k===i?0:-1;});
  ln.style.setProperty("--wc",w.col);u.$("lnIdx").textContent="0"+(i+1);moveGlow();
  if(isHome()){if(CK.bg&&CK.bg.cam)CK.bg.cam((i-2)*28,-4);if(CK.bg&&CK.bg.tint)CK.bg.tint(w.col);}
  if(!changed)return;hideTip();swap(ln.querySelector(".ln-amb"));
  var h=u.$("lnTitle"),old=h.querySelector(".t:not(.out)"),nt=document.createElement("span");nt.className="t";nt.textContent=w.name;
  if(old&&!reduce&&!first){old.classList.add("out");setTimeout(function(){old.remove();},650);nt.classList.add("in");}else h.innerHTML="";
  h.appendChild(nt);u.$("lnGoT").textContent="Ouvrir "+w.name;
  var ds=u.$("lnDesc");ds.textContent=w.desc;swap(ds);
  paintStats(d,true);paintIns(d,true);
  TIPS=[];ACTS=[];
  var host=u.$("lnArt"),lay=document.createElement("div");lay.className="ln-al";lay.style.color=w.col;lay.innerHTML=art(i,d,true);
  var prevL=artLayer;artLayer=lay;host.appendChild(lay);
  if(prevL&&!reduce){prevL.classList.add("out");setTimeout(function(){prevL.remove();},600);}else if(prevL)prevL.remove();
  if(!reduce)lay.classList.add("in");
}
function swap(el){if(reduce)return;el.classList.remove("swap");void el.offsetWidth;el.classList.add("swap");}
function paintStats(d,anim){
  var st=stats(sel,d),box=u.$("lnStats"),html=st.map(function(s,k){return '<div class="ls" style="--k:'+k+'"><b class="'+(s[2]||"")+'">'+esc(s[0])+'</b><span>'+esc(s[1])+'</span></div>';}).join("");
  if(box._h!==html){box.innerHTML=html;box._h=html;}if(anim){swap(box);[].forEach.call(box.querySelectorAll("b"),countUp);}
}
function paintIns(d,anim){
  var L=insights(sel,d),box=u.$("lnInsL"),html=L.length?L.map(function(x,k){return '<span class="li '+(x[2]||"")+'" style="--k:'+k+'"><i>'+x[0]+'</i><span>'+x[1]+'</span></span>';}).join(""):'<span class="li"><i>·</i><span>Données en cours de chargement…</span></span>';
  if(box._h!==html){box.innerHTML=html;box._h=html;}if(anim)swap(u.$("lnIns"));
}
function refresh(){
  if(!ln)return;var d=D();
  cards.forEach(function(c,i){var a=c.querySelector(".lc-art"),ht=art(i,d,false);if(a._h!==ht){a.innerHTML=ht;a._h=ht;}var m=metric(i,d),em=c.querySelector("em");if(em.textContent!==m)em.textContent=m;c.classList.toggle("hot",!!hot(i,d));});
  paintBar(d);
  if(!isHome())return;
  if(artLayer&&!tip.classList.contains("on")){var T0=TIPS,A0=ACTS;TIPS=[];ACTS=[];var ht=art(sel,d,true);if(artLayer._h!==ht){artLayer.innerHTML=ht;artLayer._h=ht;}else{TIPS=TIPS;}}
  paintStats(d,false);paintIns(d,false);
}

/* ---------- Curseur personnalisé (souris uniquement) ---------- */
function cursor(){
  if(reduce||!window.matchMedia||!matchMedia("(hover:hover) and (pointer:fine)").matches)return;
  var dot=document.createElement("div"),ring=document.createElement("div");dot.className="cur-dot";ring.className="cur-ring";ring.innerHTML='<span></span>';
  document.body.appendChild(ring);document.body.appendChild(dot);document.documentElement.classList.add("cc");
  var x=-100,y=-100,rx=-100,ry=-100,run=false,lab=ring.firstChild;
  var LINK="a,button,[role=option],[role=tab],[role=link],[data-ti],.tk,.sg,.mv,.nw,.crow,tr.clk,label,summary,.preset,.star,.pin";
  function loop(){rx+=(x-rx)*.2;ry+=(y-ry)*.2;dot.style.transform="translate("+x+"px,"+y+"px)";ring.style.transform="translate("+rx.toFixed(1)+"px,"+ry.toFixed(1)+"px)";
    if(Math.abs(x-rx)+Math.abs(y-ry)>.3)requestAnimationFrame(loop);else run=false;}
  document.addEventListener("pointermove",function(e){if(e.pointerType!=="mouse")return;x=e.clientX;y=e.clientY;document.documentElement.classList.remove("cc-out");if(!run){run=true;requestAnimationFrame(loop);}},{passive:true});
  document.addEventListener("pointerover",function(e){var t=e.target;if(!t||!t.closest)return;
    var nat=t.closest("input,textarea,select,canvas,iframe,[contenteditable]"),l=!nat&&t.closest(LINK),c=l&&t.closest("[data-cur]");
    document.documentElement.classList.toggle("cc-nat",!!nat);ring.classList.toggle("link",!!l);ring.classList.toggle("label",!!c);lab.textContent=c?c.getAttribute("data-cur"):"";});
  document.addEventListener("mouseout",function(e){if(!e.relatedTarget)document.documentElement.classList.add("cc-out");});
  document.addEventListener("pointerdown",function(){ring.classList.add("down");});
  document.addEventListener("pointerup",function(){ring.classList.remove("down");});
}

/* ---------- Barre de monde (dans un monde) ---------- */
function buildBar(){
  bar=u.$("doors");if(!bar)return;bar.classList.add("wbar");
  bar.innerHTML='<button type="button" class="wb-back" data-view="home" title="Retour à l&#39;accueil (Échap)"><span class="wbk-ic" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="wbk-t"><small>Retour</small>Accueil</span><kbd>Échap</kbd></button>'+
    '<div class="wb-id"><i></i><b id="wbName"></b><span class="wb-stats" id="wbStats"></span></div>'+
    '<div class="wb-sw" role="tablist">'+W.map(function(w){return '<button type="button" role="tab" data-view="'+w.v+'" style="--wc:'+w.col+'" title="'+w.name+' ('+w.key+')"><i></i><span>'+w.name+'</span><kbd>'+w.key+'</kbd></button>';}).join("")+'</div>';
}
function paintBar(d){
  if(!bar)return;var v=document.body.getAttribute("data-view"),i=idxOf(v);if(i<0)return;d=d||D();
  document.body.style.setProperty("--wc",W[i].col);
  var nm=u.$("wbName");if(nm.textContent!==W[i].name)nm.textContent=W[i].name;
  var html=stats(i,d).map(function(s){return '<span><b class="'+(s[2]||"")+'">'+esc(s[0])+'</b> '+esc(s[1])+'</span>';}).join("");
  var box=u.$("wbStats");if(box._h!==html){box.innerHTML=html;box._h=html;}
  [].forEach.call(bar.querySelectorAll(".wb-sw [data-view]"),function(b){b.setAttribute("aria-selected",b.getAttribute("data-view")===v?"true":"false");});
  /* Hauteur réelle des barres collantes (le header ne colle pas sur mobile) */
  var topEl=document.querySelector(".top"),t=topEl&&getComputedStyle(topEl).position==="sticky"?topEl.offsetHeight:0;
  bar.style.top=t+"px";document.documentElement.style.setProperty("--stick",(t+bar.offsetHeight)+"px");
}
function stagger(){var k=0;[].forEach.call(document.querySelectorAll("#grid .mod:not(.off)"),function(m){m.style.setProperty("--i",k++);});
  var g=u.$("grid");if(reduce||!g)return;g.classList.remove("enter");void g.offsetWidth;g.classList.add("enter");setTimeout(function(){g.classList.remove("enter");},1300);}

/* ---------- Entrer / revenir : la carte grandit jusqu'au monde ---------- */
function enter(i){hideTip();if(CK.sfx&&isHome())CK.sfx.enter();CK.ls("world",W[i].v);if(CK.layout&&CK.layout.show)CK.layout.show(W[i].v);}
var grid0=null;
CK.worlds={
  boot:build,
  before:function(from,to){grid0=grid0||u.$("grid");if(!ln)return;hideTip();
    var fi=idxOf(from),ti=idxOf(to);
    if(from==="home"&&ti>=0){cards.forEach(function(c,k){c.style.viewTransitionName=k===ti?"world":"";});grid0.style.viewTransitionName="";}
    else if(to==="home"&&fi>=0){select(fi);cards.forEach(function(c){c.style.viewTransitionName="";});grid0.style.viewTransitionName="world";}
    else{cards.forEach(function(c){c.style.viewTransitionName="";});grid0.style.viewTransitionName="";}},
  after:function(from,to){if(!ln)return;var fi=idxOf(from),ti=idxOf(to);
    if(from==="home"&&ti>=0){cards.forEach(function(c){c.style.viewTransitionName="";});grid0.style.viewTransitionName="world";CK.ls("world",to);}
    else if(to==="home"&&fi>=0){grid0.style.viewTransitionName="";cards.forEach(function(c,k){c.style.viewTransitionName=k===fi?"world":"";});refresh();setTimeout(function(){if(cards[fi])cards[fi].focus({preventScroll:true});moveGlow();},40);}
    else grid0.style.viewTransitionName="";
    if(ti>=0){if(CK.bg&&CK.bg.slow)CK.bg.slow(true);paintBar();stagger();if(CK.bg&&CK.bg.tint)CK.bg.tint(W[ti].col);if(CK.bg&&CK.bg.cam)CK.bg.cam(0,0);}
    if(to==="home"){if(CK.sfx&&fi>=0)CK.sfx.back();if(CK.bg&&CK.bg.slow)CK.bg.slow(false);document.body.style.removeProperty("--wc");if(CK.bg&&CK.bg.cam)CK.bg.cam((sel-2)*28,-4);if(CK.bg&&CK.bg.tint)CK.bg.tint(W[sel].col);}},
  done:function(){cards.forEach(function(c){c.style.viewTransitionName="";});if(grid0)grid0.style.viewTransitionName="";}
};
})();
