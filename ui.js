/* ================================================================
   COCKPIT — interface : Studio, story, brief, IA, alertes, calcul, palette
   ================================================================ */
(function(){
"use strict";
var CK=window.CK,u=CK.u,$=u.$,esc=u.esc,nf=u.nf,px=u.px,pct=u.pct,usd=u.usd,S=CK.S;
var UI=CK.ui={};

/* ---------------- Studio ---------------- */
function fld(label,html,full){return '<label class="fld'+(full?" full":"")+'">'+label+html+'</label>';}
function seg(id,cur,opts){return '<div class="st-seg" id="'+id+'" role="group">'+opts.map(function(o){return '<button type="button" data-v="'+o[0]+'" aria-pressed="'+(String(cur)===o[0]?"true":"false")+'">'+o[1]+'</button>';}).join("")+'</div>';}
/* Studio : l'essentiel visible, le reste replié. Tout s'applique tout de suite. */
function renderStudio(){
  var C=CK.cfg(),sp=CK.layout&&CK.layout.spaces?CK.layout.spaces():[];
  var h=''+'<div class="st-sec"><h4>Mon desk</h4><div class="st-grid">'+
    fld("Nom",'<input id="sName" maxlength="24" value="'+esc(C.name)+'">')+fld("Sous-titre",'<input id="sTag" maxlength="40" value="'+esc(C.tagline)+'">')+
    ""+'</div></div>'+
    '<div class="st-sec"><h4>Espaces affichés</h4><p class="st-hint">Décoche un espace qui ne t\'intéresse pas : il disparaît de l\'accueil et de la navigation (la page se recharge).</p><div class="st-chips">'+
    [["plan","Plan Futures"],["journee","Journée"],["news","News"],["net","Connexions"]].map(function(x){var on=(C.espaces||{})[x[0]]!==false;return '<button type="button" class="st-chip" data-esp="'+x[0]+'" aria-pressed="'+on+'">'+(on?"✓ ":"")+x[1]+'</button>';}).join("")+'</div></div>'+
    '<div class="st-sec"><h4>Blocs de chaque espace</h4><p class="st-hint">Clique sur un bloc pour l\'afficher ou le masquer. Pour changer l\'ordre ou la largeur : ouvre l\'espace puis le bouton Disposition.</p>'+
    sp.map(function(s){return '<div class="st-space"><b>'+esc(s.name)+'</b><div class="st-chips">'+s.blocks.map(function(bk){return '<button type="button" class="st-chip" data-sp="'+s.id+'" data-bk="'+bk.id+'" aria-pressed="'+(bk.on&&C.modules[bk.id]!==false?"true":"false")+'">'+esc(bk.name)+'</button>';}).join("")+'</div></div>';}).join("")+
    '<button type="button" class="btn sm" id="sLayout">Réorganiser l\'espace ouvert</button></div>'+
    '<div class="st-sec"><h4>Affichage</h4><div class="st-rows">'+
    '<div class="st-row"><span>Thème au lancement</span>'+seg("sTheme",C.theme==="light"?"light":"dark",[["dark","Sombre"],["light","Clair"]])+'</div>'+
    '<div class="st-row"><span>News</span>'+seg("sLang",C.newsLang==="vo"?"vo":"fr",[["fr","En français"],["vo","Version originale"]])+'</div>'+
    '<label class="chk"><input type="checkbox" id="sBeg"'+(C.beginner?" checked":"")+'> Mode débutant : un « ? » explique chaque bloc</label></div></div>'+
    '<p class="note">Tout est enregistré dans ce navigateur.'+'</p>';
  $("studioBody").innerHTML=h;
}
function segVal(id){var b=document.querySelector("#"+id+' [aria-pressed="true"]');return b?b.getAttribute("data-v"):"";}
function readStudio(){
  var C=CK.merge(CK.cfg(),{}),v=function(id){return $(id).value;};
  C.name=v("sName").trim()||"DAMOUR GLOBAL";C.tagline=v("sTag").trim();
  C.theme=segVal("sTheme")||"dark";C.newsLang=segVal("sLang")||"fr";C.beginner=$("sBeg").checked;
  C.watchlist=[];
  return C;
}
function applyLive(C,prev){
  CK.setCfg(C,true);CK.applyIdentity();
  if(prev.newsLang!==C.newsLang){S.newsLang=C.newsLang;CK.renderNews();}
}
function wireStudio(){
  $("btnStudio").addEventListener("click",function(){renderStudio();CK.openOv("ovStudio");});
  var deb=null;
  $("studioBody").addEventListener("input",function(){clearTimeout(deb);deb=setTimeout(function(){var prev=CK.cfg();applyLive(readStudio(),prev);},150);});
  $("studioBody").addEventListener("change",function(){var prev=CK.cfg();applyLive(readStudio(),prev);});
  $("studioBody").addEventListener("click",function(e){
    if(e.target.id==="sLayout"){CK.closeOv($("ovStudio"));setTimeout(function(){CK.layout.edit(true);},220);return;}
    var sb=e.target.closest(".st-seg button");
    if(sb){sb.parentNode.querySelectorAll("button").forEach(function(x){x.setAttribute("aria-pressed",x===sb?"true":"false");});var prev=CK.cfg();applyLive(readStudio(),prev);
      if(sb.parentNode.id==="sTheme")CK.setTheme(sb.getAttribute("data-v"),sb);return;}
    var es=e.target.closest("[data-esp]");if(es){var C2=CK.merge(CK.cfg(),{}),k=es.getAttribute("data-esp");C2.espaces=C2.espaces||{};C2.espaces[k]=C2.espaces[k]===false;
      var reste=["plan","journee","news","net"].filter(function(x){return C2.espaces[x]!==false;}).length;if(!reste){CK.toast("Garde au moins un espace.");return;}
      CK.setCfg(C2,true);CK.toast("Espace "+(C2.espaces[k]===false?"masqué":"affiché")+". Rechargement…");setTimeout(function(){location.reload();},700);return;}
    var ch=e.target.closest(".st-chip");if(!ch)return;
    var on=ch.getAttribute("aria-pressed")!=="true",id=ch.getAttribute("data-bk");ch.setAttribute("aria-pressed",on?"true":"false");
    /* un bloc masqué globalement redevient visible quand on l'active */
    if(on&&CK.cfg().modules[id]===false){var C=CK.merge(CK.cfg(),{});C.modules[id]=true;CK.setCfg(C,true);CK.applyIdentity();}
    CK.layout.toggle(ch.getAttribute("data-sp"),id,on);
  });
  $("stReset").addEventListener("click",function(){var prev=CK.cfg();CK.setCfg(CK.BAKED,false);CK.lsj("cfg",null);applyLive(CK.BAKED,prev);CK.lsj("cfg",null);if(CK.layout)CK.layout.refresh();renderStudio();CK.toast("Réglages d'origine restaurés");});
  
}


function copy(text){if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(text).catch(function(){return fallbackCopy(text);});return Promise.resolve(fallbackCopy(text));}
function fallbackCopy(text){var ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();try{document.execCommand("copy");}catch(e){}ta.remove();}
UI.copy=copy;

function hexA(c,a){if(/^rgba?\(/.test(c))return c;var h=c.replace("#","");if(h.length===3)h=h.split("").map(function(z){return z+z;}).join("");var n=parseInt(h,16);return "rgba("+(n>>16&255)+","+(n>>8&255)+","+(n&255)+","+a+")";}
UI.hexA=hexA;

/* ---------------- Alertes ---------------- */
var alerts=CK.lsj("alerts")||[];
CK.alertInsts=function(){return [];};
function saveAlerts(){CK.lsj("alerts",alerts);var n=$("alertCount");n.hidden=!alerts.length;n.textContent=alerts.length;}
function renderAlerts(){$("alList").innerHTML=alerts.length?alerts.map(function(a){return '<div class="al">'+u.logo(a.base)+'<span><b>'+esc(a.base)+'</b> '+(a.cond==="above"?"passe au-dessus de":"passe en dessous de")+' <span class="mono">'+px(a.px)+'</span></span><button type="button" class="x" data-del="'+a.id+'" aria-label="Supprimer">×</button></div>';}).join(""):'<div class="empty">Aucune alerte de prix.</div>';
  $("alRose").checked=CK.ls("alRose")==="1";}
var actx=null;
function beep(){try{actx=actx||new (window.AudioContext||window.webkitAudioContext)();var o=actx.createOscillator(),g=actx.createGain();o.type="sine";o.frequency.setValueAtTime(880,actx.currentTime);o.frequency.setValueAtTime(1320,actx.currentTime+0.12);
  g.gain.setValueAtTime(0.0001,actx.currentTime);g.gain.exponentialRampToValueAtTime(0.18,actx.currentTime+0.02);g.gain.exponentialRampToValueAtTime(0.0001,actx.currentTime+0.4);o.connect(g);g.connect(actx.destination);o.start();o.stop(actx.currentTime+0.42);}catch(e){}}
function notify(title,body){if(CK.sfx&&CK.sfx.news)CK.sfx.news();else beep();CK.toast("<b>"+esc(title)+"</b><br>"+esc(body),{ms:9000});
  try{if("Notification" in window&&Notification.permission==="granted")new Notification(title,{body:body});}catch(e){}}
CK.checkAlerts=function(inst,last){if(!alerts.length)return;var hit=[];
  alerts.forEach(function(a){if(a.base+"-USDT"!==inst)return;if((a.cond==="above"&&last>=a.px)||(a.cond==="below"&&last<=a.px))hit.push(a);});
  if(!hit.length)return;hit.forEach(function(a){notify(a.base+" à "+px(last),"Ton alerte : "+(a.cond==="above"?"au-dessus de ":"en dessous de ")+px(a.px));});
  alerts=alerts.filter(function(a){return hit.indexOf(a)<0;});saveAlerts();if(!$("ovAlerts").hidden)renderAlerts();};
CK.onFactorChange=function(ch){if(CK.ls("alRose")!=="1")return;var L={1:"favorable","0":"neutre","-1":"défavorable"};
  ch.forEach(function(c){notify("Carte : "+c.f.nm,"Passe de "+L[String(c.from)]+" à "+L[String(c.f.impact)]+". "+c.f.label+".");});};
function wireAlerts(){}

/* ---------------- Calculateur ---------------- */
function calc(){
  var g=function(id){var v=parseFloat(String($(id).value).replace(",","."));return isNaN(v)?null:v;};
  var cap=g("cCap"),rk=g("cRisk"),en=g("cIn"),sl=g("cSl"),tp=g("cTp"),out=$("cOut");
  if(cap==null||rk==null||en==null||sl==null){out.innerHTML='<div class="note" style="grid-column:1/-1">Renseigne le capital, le risque, l\'entrée et le stop.</div>';return;}
  if(en===sl||cap<=0||rk<=0||en<=0||sl<=0){out.innerHTML='<div class="err" style="grid-column:1/-1">Le stop doit être différent de l\'entrée, et les valeurs positives.</div>';return;}
  var pt=parseFloat($("cCt").value)||2,nm=$("cCt").options[$("cCt").selectedIndex].text.split(" ")[0];
  var lng=sl<en,risk=cap*rk/100,dist=Math.abs(en-sl),rpc=dist*pt,n=Math.floor(risk/rpc),real=n*rpc;
  var tpOk=tp!=null&&(lng?tp>en:tp<en),rr=tpOk?Math.abs(tp-en)/dist:null;
  function t(k,v,s){return '<div class="dv"><div class="k">'+k+'</div><div class="v">'+v+'</div>'+(s?'<div class="s">'+s+'</div>':'')+'</div>';}
  out.innerHTML=t("Sens",lng?'<span class="up">Long</span>':'<span class="down">Short</span>',"stop à "+nf(dist,2)+" points ("+nf(dist/en*100,2)+" %)")+t("Contrats "+nm,n>0?nf(n,0):'<span class="down">0</span>',n>0?"risque de "+usd(risk)+" ÷ "+usd(rpc)+" par contrat":"le stop est trop large pour ce risque : "+usd(rpc)+" par contrat")+
    t("Risque par contrat",usd(rpc),nf(dist,2)+" pts × "+pt+" $")+t("Perte si stop",n>0?'<span class="down">−'+usd(real)+'</span>':"—",n>0?nf(real/cap*100,2)+" % du capital":"")+
    t("Gain à l'objectif",tpOk&&n>0?'<span class="up">+'+usd(n*Math.abs(tp-en)*pt)+'</span>':"—",tp!=null&&!tpOk?"objectif du mauvais côté de l'entrée":tpOk?nf(Math.abs(tp-en),2)+" pts":"")+
    (rr!=null?t("Ratio risque / rendement","1 : "+nf(rr,2),rr<1.5?"faible":rr>=3?"excellent":"correct"):"");
}
function wireCalc(){$("btnCalc").addEventListener("click",function(){calc();CK.openOv("ovCalc");});
  ["cCap","cRisk","cIn","cSl","cTp","cCt"].forEach(function(id){$(id).addEventListener("input",calc);});}

/* ---------------- Palette ⌘K ---------------- */
var palSel=0,palItems=[];
function cmds(){return [
  {t:"Affichage sombre",k:"thème",run:function(){CK.setTheme("dark");}},{t:"Affichage clair",k:"thème",run:function(){CK.setTheme("light");}},
  {t:"Ouvrir le Studio",k:"personnaliser",run:function(){$("btnStudio").click();}},{t:"Déplacer les blocs",k:"disposition",run:function(){CK.layout.edit(true);}},
  
  {t:"Calculateur de position",k:"risque",run:function(){$("btnCalc").click();}},
  {t:(CK.cfg().beginner?"Désactiver":"Activer")+" le mode débutant",k:"aide",run:function(){var C=CK.merge(CK.cfg(),{beginner:!CK.cfg().beginner});CK.setCfg(C,true);CK.applyIdentity();}}
];}
function renderPal(){var q=$("palIn").value.trim(),ql=q.toLowerCase();palItems=cmds().filter(function(c){return !ql||(c.t+" "+c.k).toLowerCase().indexOf(ql)>=0;});
  palSel=Math.min(palSel,Math.max(0,palItems.length-1));
  $("palList").innerHTML=palItems.map(function(c,i){return '<div class="pi'+(i===palSel?" on":"")+'" data-i="'+i+'" role="option">'+esc(c.t)+'<small>'+esc(c.k)+'</small></div>';}).join("")||'<div class="empty">Aucune commande.</div>';}
function runPal(i){var c=palItems[i];if(!c)return;CK.closeOv($("ovPalette"));setTimeout(c.run,60);}
function openPal(){$("palIn").value="";palSel=0;renderPal();CK.openOv("ovPalette");}
function wirePal(){
  $("btnPalette").addEventListener("click",openPal);
  $("palIn").addEventListener("input",function(){palSel=0;renderPal();});
  $("palIn").addEventListener("keydown",function(e){if(e.key==="ArrowDown"){e.preventDefault();palSel=Math.min(palItems.length-1,palSel+1);renderPal();}else if(e.key==="ArrowUp"){e.preventDefault();palSel=Math.max(0,palSel-1);renderPal();}else if(e.key==="Enter"){e.preventDefault();runPal(palSel);}});
  $("palList").addEventListener("click",function(e){var p=e.target.closest(".pi");if(p)runPal(+p.getAttribute("data-i"));});
  document.addEventListener("keydown",function(e){
    if((e.ctrlKey||e.metaKey)&&(e.key==="k"||e.key==="K")){e.preventDefault();if($("ovPalette").hidden)openPal();else CK.closeOv($("ovPalette"));return;}
    var typing=/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement||{}).tagName||"");
  });
}

function wireOwn(){var b=$("btnOwn");if(!b)return;b.addEventListener("click",function(){CK.openOv("ovOwn");});
  $("ownCopy").addEventListener("click",function(){copy($("ownPrompt").textContent).then(function(){CK.toast("<b>Texte copié.</b> Colle-le dans Claude Code.");});});}
UI.boot=function(){wireOwn();wireStudio();wireAlerts();wireCalc();wirePal();};
})();
