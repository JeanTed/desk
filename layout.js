/* ================================================================
   COCKPIT — Portes + agencement libre
   Un accueil (vue d'ensemble) et des « portes » plein écran : Screener,
   Liquidations, Macro, News. Chaque porte a sa propre grille de 12 colonnes :
   chaque bloc a une position (x, y) et une taille (w, h), réglable avec le
   bouton « Disposition ». Passage d'une porte à l'autre : touches 1 à 5,
   clic sur un onglet ou sur « Ouvrir » dans un bloc de l'accueil.
   ================================================================ */
(function(){
"use strict";
var CK=window.CK,u=CK.u;
var COLS=12,ROW=10,GAP=16;
var VIEWS0=[
  {id:"home",name:"Accueil",key:"0"},
  {id:"plan",name:"Plan NDX",key:"1"},
  {id:"journee",name:"Journée",key:"2"},
  {id:"news",name:"News",key:"3"},
  {id:"net",name:"Connexions",key:"4"}
];
/* Espaces décochés dans le Studio : retirés de la navigation */
var VIEWS=VIEWS0.filter(function(v){var e=(CK.cfg&&CK.cfg().espaces)||{};return v.id==="home"||e[v.id]!==false;});VIEWS.forEach(function(v,i){if(v.id!=="home")v.key=String(i);});
function viewOn(id){return VIEWS.some(function(v){return v.id===id;});}
/* « Mondes » = l'écran de sélection (aucun bloc) ; chaque monde a sa grille */
var DEFAULTS={
  home:[],
  plan:[{id:"plan",x:0,y:0,w:6,h:70},{id:"ctx",x:6,y:0,w:6,h:70},{id:"opts",x:0,y:70,w:12,h:50}],
  journee:[{id:"day",x:0,y:0,w:12,h:33},{id:"levels",x:0,y:33,w:5,h:50},{id:"opts",x:5,y:33,w:7,h:50},{id:"events",x:0,y:83,w:7,h:50},{id:"deriv",x:7,y:83,w:5,h:34}],
  news:[{id:"news",x:0,y:0,w:8,h:84},{id:"events",x:8,y:0,w:4,h:84}],
  net:[{id:"net",x:0,y:0,w:12,h:84}]
};
/* Où mène « Ouvrir » depuis un bloc */
var DOOR={plan:"plan",ctx:"plan",day:"journee",events:"journee",news:"news"};
var LAYV="12";
var MIN={plan:[4,40],ctx:[4,40],veille:[6,40],corr:[3,30],levels:[3,30],opts:[3,30],book:[3,30],net:[6,40],day:[6,28],map:[3,36],events:[2,24],deriv:[3,16],movers:[3,26],liq:[3,40],news:[3,24],screener:[3,36]};
var NAMES={plan:"Plan du jour",ctx:"Contexte de marché",veille:"Agent de veille",corr:"Corrélations du BTC",levels:"Niveaux clés",opts:"Options",book:"Carnet d'ordres agrégé",net:"Connexions",day:"Journée de trading",map:"Signaux",events:"Agenda éco",deriv:"Dérivés",liq:"Liquidations",movers:"Top mouvements",screener:"Screener",news:"News"};
var grid,all={},view="home",lay=[],editing=false,stacked=false,ph=null;
var reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;

function vis(it){var m=mod(it.id);return m&&!m.hidden;}
function mod(id){return grid.querySelector('.mod[data-mod="'+id+'"]');}
function copy(a){return a.map(function(x){return {id:x.id,x:+x.x,y:+x.y,w:+x.w,h:+x.h};});}
function clean(a){var seen={};return copy((a||[]).filter(function(x){return x&&x.id&&MIN[x.id]&&x.h!=null&&x.x!=null&&!seen[x.id]&&(seen[x.id]=1);}));}
function load(){
  /* Une disposition enregistrée avant les portes (v4) est remplacée par la nouvelle */
  var mine=CK.lsj("cfg"),c=CK.cfg().layout;
  if(mine&&mine.layout&&CK.ls("layoutV")!==LAYV)c=CK.BAKED.layout;
  var obj=c&&typeof c==="object"&&!Array.isArray(c)?c:{};
  VIEWS.forEach(function(v){var a=clean(obj[v.id]);all[v.id]=a.length?a:copy(DEFAULTS[v.id]);all[v.id].forEach(clamp);});
  var last=CK.ls("view");view=all[last]?last:"home";lay=all[view];resolve(null);
}
function clamp(it){var m=MIN[it.id]||[3,16];it.w=Math.max(m[0],Math.min(COLS,Math.round(it.w)));it.h=Math.max(m[1],Math.round(it.h));it.x=Math.max(0,Math.min(COLS-it.w,Math.round(it.x)));it.y=Math.max(0,Math.round(it.y));}
function hit(a,b){return a!==b&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
/* Gravité : chaque bloc remonte au plus haut sans chevaucher ; le bloc tenu reste où il est */
function resolve(fixed){
  var placed=fixed?[fixed]:[];
  lay.filter(function(it){return it!==fixed&&vis(it);}).sort(function(a,b){return a.y-b.y||a.x-b.x;}).forEach(function(it){
    it.y=0;while(placed.some(function(p){return hit(p,it);}))it.y++;placed.push(it);});
}
function colW(){return (grid.clientWidth-GAP*(COLS-1))/COLS;}
function px(it){var cw=colW();return {l:it.x*(cw+GAP),t:it.y*ROW,w:it.w*cw+(it.w-1)*GAP,h:it.h*ROW-GAP};}
/* Mode « flux » (écran des mondes) : chaque monde est une grille CSS responsive, pas de positions au pixel */
function flow(){
  grid.classList.add("flow");grid.classList.remove("stacked");grid.setAttribute("data-w",view);grid.style.height="";
  var inView={};lay.slice().sort(function(a,b){return a.y-b.y||a.x-b.x;}).forEach(function(it,i){inView[it.id]=it;it.i=i;});
  [].forEach.call(grid.querySelectorAll(".mod"),function(m){var id=m.getAttribute("data-mod"),it=inView[id];m.classList.toggle("off",!it);m.style.transform="";m.style.width="";m.style.height="";
    if(it){m.style.order=it.i;m.style.setProperty("--span",it.w);}
    var go=m.querySelector(".door-go");if(go)go.hidden=true;});
}
function render(skip){
  if(CK.FLOW){flow();return;}
  stacked=grid.clientWidth<860;grid.classList.toggle("stacked",stacked);
  var inView={};lay.forEach(function(it){inView[it.id]=1;});
  [].forEach.call(grid.querySelectorAll(".mod"),function(m){var id=m.getAttribute("data-mod");m.classList.toggle("off",!inView[id]);
    var go=m.querySelector(".door-go");if(go)go.hidden=!DOOR[id]||DOOR[id]===view||!viewOn(DOOR[id]);});
  var n=0,maxY=0;
  lay.slice().sort(function(a,b){return a.y-b.y||a.x-b.x;}).forEach(function(it){var m=mod(it.id);if(!m)return;
    if(stacked){m.style.transform="";m.style.width="";m.style.height="";grid.appendChild(m);}
    if(m.hidden)return;n++;var no=m.querySelector(".mno");if(no)no.textContent=(n<10?"0":"")+n;
    if(stacked||it===skip)return;var p=px(it);m.style.width=p.w+"px";m.style.height=p.h+"px";m.style.transform="translate("+p.l+"px,"+p.t+"px)";maxY=Math.max(maxY,it.y+it.h);});
  grid.style.height=stacked?"":(maxY*ROW)+"px";
}
function save(){var C=CK.merge(CK.cfg(),{}),o={};VIEWS.forEach(function(v){o[v.id]=copy(all[v.id]);});C.layout=o;CK.setCfg(C,true);CK.ls("layoutV",LAYV);}
function itemOf(m){var id=m.getAttribute("data-mod");return lay.filter(function(x){return x.id===id;})[0];}
function kick(){setTimeout(function(){window.dispatchEvent(new Event("resize"));},40);}

/* ---------- Portes ---------- */
var nav,ind;
function paintNav(){
  if(!nav)return;var on=null;
  [].forEach.call(nav.querySelectorAll("[data-view]"),function(b){var a=b.getAttribute("data-view")===view;b.setAttribute("aria-selected",a?"true":"false");b.tabIndex=a?0:-1;if(a)on=b;});
  if(on&&ind){ind.style.width=on.offsetWidth+"px";ind.style.transform="translateX("+on.offsetLeft+"px)";}
}
function show(v,opts){
  if(!all[v]||(v===view&&!(opts&&opts.force)))return;
  if(editing)setEditing(false);
  var from=VIEWS.map(function(x){return x.id;}).indexOf(view),to=VIEWS.map(function(x){return x.id;}).indexOf(v);
  var prev=view;if(CK.worlds)CK.worlds.before(prev,v);
  function apply(){if(editing)setEditing(false);view=v;lay=all[v];CK.ls("view",v);resolve(null);render();paintNav();document.body.setAttribute("data-view",v);if(v==="news")seenNews();if(CK.worlds)CK.worlds.after(prev,v);}
  document.documentElement.style.setProperty("--dir",to>=from?"1":"-1");
  if(document.startViewTransition&&!reduce&&!stacked){
    grid.classList.add("vt");var t=CK.vt(apply);
    if(t)t.finished.then(done,done);else done();function done(){grid.classList.remove("vt");if(CK.worlds)CK.worlds.done();kick();}
  }else{apply();if(CK.worlds)CK.worlds.done();if(!reduce){grid.classList.remove("swap");void grid.offsetWidth;grid.classList.add("swap");}kick();}
  window.scrollTo(0,0);
}
/* Indicateurs en direct sur chaque onglet */
var newsSeen=+(CK.ls("newsSeen")||0);if(!newsSeen){newsSeen=Date.now();CK.ls("newsSeen",String(newsSeen));}
function seenNews(){newsSeen=Date.now();CK.ls("newsSeen",String(newsSeen));}
function chips(){
  if(!nav)return;var S=CK.S||{},now=Date.now();
  function set(id,txt,hot){var el=u.$("dz-"+id);if(!el)return;if(el.textContent!==txt)el.textContent=txt;var b=el.closest("button");if(b)b.classList.toggle("hot",!!hot);}
  var sess=u.$("islText");set("journee",sess?sess.textContent:"",false);
  var F=S.factors||[],fv=0,df=0;F.forEach(function(f){if(f.na)return;if(f.impact>0)fv++;else if(f.impact<0)df++;});set("macro",F.length?fv+"↑ "+df+"↓":"",false);
  var sm=(u.$("scanMeta")||{}).textContent||"",mt=sm.match(/(\d+)\s*résultat/);set("screener",mt?mt[1]+" setup"+(mt[1]==="1"?"":"s"):"",false);
  var L=0,big=false;(S.liqHist||[]).forEach(function(x){if(now-x.ts<3600000)L+=x.usd;if(now-x.ts<300000&&x.usd>=1e6)big=true;});
  set("liq",L?u.usd(L)+" / 1 h":"",big);
  var nw=((S.news&&S.news.macro)||[]).filter(function(x){return x.ts&&x.ts>newsSeen&&view!=="news";}).length;set("news",nw?nw+" nouvelle"+(nw>1?"s":""):"",nw>0);
}
function buildNav(){
  nav=u.$("doors");if(!nav)return;
  nav.innerHTML='<i class="dz-ind" aria-hidden="true"></i>'+VIEWS.map(function(v){return '<button type="button" role="tab" data-view="'+v.id+'"><kbd>'+v.key+'</kbd><span class="dz-n">'+v.name+'</span><small class="dz-v" id="dz-'+v.id+'"></small></button>';}).join("");
  ind=nav.querySelector(".dz-ind");
  nav.addEventListener("click",function(e){var b=e.target.closest("[data-view]");if(b)show(b.getAttribute("data-view"));});
  nav.addEventListener("keydown",function(e){if(e.key!=="ArrowRight"&&e.key!=="ArrowLeft")return;var ids=VIEWS.map(function(x){return x.id;}),i=ids.indexOf(view)+(e.key==="ArrowRight"?1:-1);
    if(i<0||i>=ids.length)return;e.preventDefault();show(ids[i]);var b=nav.querySelector('[data-view="'+ids[i]+'"]');if(b)b.focus();});
  document.addEventListener("keydown",function(e){
    if(e.ctrlKey||e.metaKey||e.altKey)return;var t=document.activeElement||{};
    if(/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName||"")||t.isContentEditable)return;
    if(document.querySelector('[id^="ov"]:not([hidden])'))return;
    VIEWS.forEach(function(v){if(e.key===v.key){e.preventDefault();show(v.id);}});
    if(e.key==="Escape"&&view!=="home"&&!editing){e.preventDefault();show("home");}
  });
  /* Bouton « Ouvrir » dans l'en-tête des blocs qui ont une porte */
  [].forEach.call(grid.querySelectorAll(".mod"),function(m){var id=m.getAttribute("data-mod"),hd=m.querySelector(".mhd");if(!DOOR[id]||!viewOn(DOOR[id])||!hd||hd.querySelector(".door-go"))return;
    var b=document.createElement("button");b.type="button";b.className="door-go";b.setAttribute("data-door",DOOR[id]);
    b.innerHTML='Ouvrir <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 11 11 5M6 5h5v5"/></svg>';b.title="Ouvrir en plein écran ("+VIEWS.filter(function(v){return v.id===DOOR[id];})[0].name+")";hd.appendChild(b);
    m.style.viewTransitionName="m-"+id;});
  grid.addEventListener("click",function(e){var b=e.target.closest("[data-door]");if(b)show(b.getAttribute("data-door"));});
  document.body.setAttribute("data-view",view);
  paintNav();chips();setInterval(chips,2000);
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(paintNav);
}

/* ---------- Glisser / redimensionner ---------- */
var act=null;
function placeholder(it){if(!ph){ph=document.createElement("div");ph.className="ph";grid.appendChild(ph);}var p=px(it);ph.style.width=p.w+"px";ph.style.height=p.h+"px";ph.style.transform="translate("+p.l+"px,"+p.t+"px)";ph.hidden=false;}
/* Dans les espaces : on glisse un bloc par son en-tête pour changer sa place (les autres se décalent en direct),
   on tire son bord droit pour changer sa largeur (de 3 à 12 colonnes). */
var fa=null;
function oneCol(){return getComputedStyle(grid).gridTemplateColumns.split(" ").length<2;}
function fOrder(){return lay.filter(vis).sort(function(a,b){return a.y-b.y||a.x-b.x;});}
function fRenum(list){list.forEach(function(it,i){it.x=0;it.y=i*100;});}
function fDown(e){
  var rz=e.target.closest(".rz"),hd=e.target.closest(".mhd");if(!rz&&!hd)return;if(!rz&&e.target.closest("button,input,select,a"))return;
  var m=(rz||hd).closest(".mod"),it=itemOf(m);if(!it)return;if(rz&&oneCol())return;e.preventDefault();
  var r=m.getBoundingClientRect();
  fa={m:m,it:it,mode:rz?"rz":"mv",ox:e.clientX-r.left,oy:e.clientY-r.top,left:r.left};
  if(!rz){var g=document.createElement("div");g.className="fghost";g.textContent=NAMES[it.id]||it.id;g.style.width=Math.min(r.width,360)+"px";
    g.style.transform="translate("+(e.clientX-Math.min(fa.ox,Math.min(r.width,360)-20))+"px,"+(e.clientY-20)+"px)";document.body.appendChild(g);fa.g=g;fa.gx=Math.min(fa.ox,Math.min(r.width,360)-20);}
  else{var b=document.createElement("div");b.className="fspan";m.appendChild(b);fa.b=b;b.textContent=it.w+" / 12";}
  m.classList.add(rz?"resizing":"dragging");document.body.classList.add("fdrag");
  document.addEventListener("pointermove",fMove);document.addEventListener("pointerup",fUp,{once:true});
}
function fMove(e){
  if(!fa)return;var it=fa.it;
  if(fa.mode==="rz"){
    var cs=getComputedStyle(grid),gap=parseFloat(cs.columnGap)||16,cw=(grid.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight)-gap*(COLS-1))/COLS;
    var w=Math.round((e.clientX-fa.left+gap)/(cw+gap)),mn=(MIN[it.id]||[3])[0];w=Math.max(Math.max(3,mn),Math.min(COLS,w));
    if(w!==it.w){it.w=w;fa.m.style.setProperty("--span",w);fa.b.textContent=w+" / 12";}
    return;}
  fa.g.style.transform="translate("+(e.clientX-fa.gx)+"px,"+(e.clientY-20)+"px)";
  /* bloc survolé : on insère avant ou après selon la moitié visée */
  var el=document.elementFromPoint(e.clientX,e.clientY),t=el&&el.closest&&el.closest(".grid.flow .mod:not(.off)");if(!t||t===fa.m)return;
  var ti=itemOf(t);if(!ti)return;var r=t.getBoundingClientRect(),list=fOrder(),from=list.indexOf(it);list.splice(from,1);
  var horiz=r.width<grid.clientWidth*.8,after=horiz?e.clientX>r.left+r.width/2:e.clientY>r.top+r.height/2,to=list.indexOf(ti)+(after?1:0);
  list.splice(to,0,it);if(list.indexOf(it)===from)return;
  /* animation FLIP des autres blocs */
  var mods=[].slice.call(grid.querySelectorAll(".mod:not(.off)")),first=mods.map(function(x){return x.getBoundingClientRect();});
  fRenum(list);flow();
  mods.forEach(function(x,k){if(x===fa.m)return;var n=x.getBoundingClientRect(),dx=first[k].left-n.left,dy=first[k].top-n.top;if(!dx&&!dy)return;
    if(x.animate&&!reduce)x.animate([{translate:dx+"px "+dy+"px"},{translate:"0 0"}],{duration:280,easing:"cubic-bezier(.2,.8,.2,1)"});});
}
function fUp(){
  document.removeEventListener("pointermove",fMove);if(!fa)return;
  fa.m.classList.remove("dragging","resizing");document.body.classList.remove("fdrag");if(fa.g)fa.g.remove();if(fa.b)fa.b.remove();
  fRenum(fOrder());resolve(null);flow();fa=null;save();kick();
}
function onDown(e){
  if(editing&&CK.FLOW&&e.button<1)return fDown(e);
  if(!editing||stacked||e.button>0)return;
  var rz=e.target.closest(".rz"),hd=e.target.closest(".mhd");if(!rz&&!hd)return;if(!rz&&e.target.closest("button,input,select,a"))return;
  var m=(rz||hd).closest(".mod"),it=itemOf(m);if(!it)return;e.preventDefault();
  var g=grid.getBoundingClientRect(),p=px(it);
  act={m:m,it:it,mode:rz?"rz":"mv",sx:e.clientX,sy:e.clientY,ox:e.clientX-g.left-p.l,oy:e.clientY-g.top-p.t,w0:p.w,h0:p.h};
  m.classList.add(rz?"resizing":"dragging");placeholder(it);
  document.addEventListener("pointermove",onMove);document.addEventListener("pointerup",onUp,{once:true});
}
function onMove(e){
  if(!act)return;var g=grid.getBoundingClientRect(),cw=colW(),it=act.it,m=act.m,bx=it.x,by=it.y,bw=it.w,bh=it.h;
  if(act.mode==="mv"){var l=e.clientX-g.left-act.ox,t=e.clientY-g.top-act.oy;m.style.transform="translate("+l+"px,"+t+"px)";
    it.x=Math.round(l/(cw+GAP));it.y=Math.round(t/ROW);}
  else{var w=act.w0+(e.clientX-act.sx),h=act.h0+(e.clientY-act.sy);m.style.width=w+"px";m.style.height=h+"px";
    it.w=Math.round((w+GAP)/(cw+GAP));it.h=Math.round((h+GAP)/ROW);}
  clamp(it);if(it.x!==bx||it.y!==by||it.w!==bw||it.h!==bh){resolve(it);render(it);placeholder(it);}
}
function onUp(){
  document.removeEventListener("pointermove",onMove);if(!act)return;var m=act.m;
  m.classList.remove("dragging","resizing");resolve(null);render();if(ph)ph.hidden=true;act=null;save();
  setTimeout(function(){window.dispatchEvent(new Event("resize"));},260);
}
/* ---------- Mode disposition (s'applique à la porte ouverte) ---------- */
function tools(){
  [].forEach.call(grid.querySelectorAll(".mod"),function(m){
    if(!m.querySelector(".rz")){var r=document.createElement("button");r.type="button";r.className="rz";r.setAttribute("aria-label","Redimensionner");m.appendChild(r);}
    var hd=m.querySelector(".mhd");if(hd&&!hd.querySelector(".edit-tools")){var t=document.createElement("div");t.className="edit-tools";t.innerHTML='<button type="button" data-hide>Retirer</button>';hd.appendChild(t);}});
}
function renderAdd(){
  var here={};lay.forEach(function(it){here[it.id]=1;});
  var ids=Object.keys(NAMES).filter(function(id){var m=mod(id);return m&&!here[id];}),box=u.$("layAdd");
  box.innerHTML=ids.length?'<span>Ajouter ici :</span>'+ids.map(function(id){return '<button type="button" class="btn sm" data-add="'+id+'">'+NAMES[id]+'</button>';}).join(""):"";
}
function setEditing(on){
  if(CK.FLOW&&on&&view==="home"){CK.toast("Ouvre un espace pour réorganiser ses blocs.");return;}
  editing=on;document.body.classList.toggle("editing",on);u.$("editBar").hidden=!on;u.$("btnLayout").setAttribute("aria-pressed",on?"true":"false");
  if(on){tools();renderAdd();if(CK.FLOW&&oneCol())CK.toast("Sur petit écran, glisse les en-têtes pour changer l'ordre des blocs.");else if(stacked&&!CK.FLOW)CK.toast("Agrandis la fenêtre pour déplacer les blocs librement.");}
  else if(CK.FLOW)flow();
}
CK.layout={
  boot:function(){
    grid=u.$("grid");if(!grid)return;load();buildNav();render();
    var rt=null;window.addEventListener("resize",function(){if(act)return;clearTimeout(rt);rt=setTimeout(function(){render();paintNav();},60);});
    grid.addEventListener("pointerdown",onDown);
    grid.addEventListener("click",function(e){var b=e.target.closest("[data-hide]");if(!b)return;var id=b.closest(".mod").getAttribute("data-mod");
      lay.splice(lay.indexOf(itemOf(b.closest(".mod"))),1);resolve(null);render();renderAdd();save();});
    u.$("layAdd").addEventListener("click",function(e){var b=e.target.closest("[data-add]");if(!b)return;var id=b.getAttribute("data-add"),d=MIN[id];
      var C=CK.merge(CK.cfg(),{});if(C.modules[id]===false){C.modules[id]=true;CK.setCfg(C,true);CK.applyIdentity();}
      lay.push({id:id,x:0,y:999,w:Math.max(d[0],4),h:Math.max(d[1],40)});resolve(null);render();renderAdd();save();kick();});
    u.$("btnLayout").addEventListener("click",function(){setEditing(!editing);});
    u.$("layDone").addEventListener("click",function(){setEditing(false);});
    u.$("layReset").addEventListener("click",function(){all[view]=copy(DEFAULTS[view]);lay=all[view];resolve(null);render();renderAdd();save();setTimeout(function(){window.dispatchEvent(new Event("resize"));},260);});
  },
  refresh:function(){if(!grid)return;resolve(null);render();},
  edit:setEditing,
  show:show,
  view:function(){return view;},
  /* Studio : quels blocs sont dans quel espace */
  spaces:function(){return VIEWS.filter(function(v){return v.id!=="home";}).map(function(v){
    var ids=DEFAULTS[v.id].map(function(x){return x.id;});all[v.id].forEach(function(x){if(ids.indexOf(x.id)<0)ids.push(x.id);});
    return {id:v.id,name:v.name,blocks:ids.map(function(id){return {id:id,name:NAMES[id]||id,on:all[v.id].some(function(x){return x.id===id;})};})};});},
  toggle:function(w,id,on){var a=all[w];if(!a)return;var i=-1;a.forEach(function(x,k){if(x.id===id)i=k;});
    if(on&&i<0){var d=DEFAULTS[w].filter(function(x){return x.id===id;})[0]||{id:id,x:0,y:999,w:12,h:(MIN[id]||[3,40])[1]};a.push({id:d.id,x:d.x,y:d.y,w:d.w,h:d.h});}
    else if(!on&&i>=0)a.splice(i,1);
    if(w===view){lay=a;resolve(null);render();kick();}save();},
  has:function(id){return lay.some(function(it){return it.id===id;});}
};
})();
