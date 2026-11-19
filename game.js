/* Monster Packs — v3.0
   Same loop as History Packs: spin the pack ring, tear a pack, flip 5 cards, build the collection.
   Monster data lives in monsters.json; each card's artwork is in cards/. */
(() => {
'use strict';

const PACKS = [
  { id:'man-eaters',    name:'Man-Eaters',    rgb:'170,200,228', desc:'Beasts, giants and sea monsters with a taste for people, from the Wendigo to the Kraken.' },
  { id:'witches',       name:'Witches',       rgb:'196,205,96',  desc:'Hags, enchantresses and sorceresses of legend, from Baba Yaga to the Bell Witch.' },
  { id:'ghouls',        name:'Ghouls',        rgb:'232,150,72',  desc:'Revenants, vampires and grave-robbers who would not stay buried.' },
  { id:'cursed-beasts', name:'Cursed Beasts', rgb:'228,60,66',   desc:'Werewolves, hellhounds and shape-shifters cursed into monstrous form.' },
  { id:'spirits',       name:'Spirits',       rgb:'190,165,240', desc:'Banshees, poltergeists and the most famous hauntings on record.' },
];
/* ---------------- coin shop ----------------
   SHOP_MODE 'test': purchases are free and instant, for testing. Nothing is charged.
   To take real payments later, connect a payment provider (e.g. Stripe Checkout) in
   buyBundle() and only add coins after the provider confirms the payment. */
const SHOP_MODE = 'test';
const BUNDLES = [
  { id:'pouch',  name:'Pouch of Coins',  coins:5000,   bonus:0,     price:'$0.99' },
  { id:'sack',   name:'Sack of Coins',   coins:12000,  bonus:1000,  price:'$1.99' },
  { id:'chest',  name:'Chest of Coins',  coins:30000,  bonus:5000,  price:'$4.99', tag:'MOST POPULAR' },
  { id:'hoard',  name:'Dragon Hoard',    coins:65000,  bonus:15000, price:'$9.99' },
  { id:'vault',  name:'Crypt Vault',     coins:150000, bonus:50000, price:'$19.99', tag:'BEST VALUE' },
];
const PACK_COST = 1000, FREE_EVERY = 12*3600*1000, FREE_MAX = 2, PITY = 30;
const SELL = { common:25, rare:150, legendary:1500 };
const RLABEL = { common:'COMMON', rare:'RARE', legendary:'LEGENDARY' };
const DIAM = { common:'◆', rare:'◆◆', legendary:'◆◆◆' };
const SAVE_KEY = 'monsterPacks.v3';

let DB = {}, ALL = [], BYID = {}, PACK_OF = {};
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const fmt = n => n.toLocaleString('en-US');

/* ---------------- state ---------------- */
const fresh = () => ({ coins:10000, free:2, nextFree:null, stash:{}, owned:{}, opened:{}, total:0, sinceLeg:0, badges:{}, sound:true, blood:0, purchases:[] });
let S = fresh();
function load(){ try{ const t = localStorage.getItem(SAVE_KEY); if(t) S = Object.assign(fresh(), JSON.parse(t)); }catch(e){} }
function save(){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(S)); }catch(e){} }

function tickFree(){
  const now = Date.now();
  if(S.free >= FREE_MAX){ S.nextFree = null; return; }
  if(!S.nextFree) S.nextFree = now + FREE_EVERY;
  while(S.free < FREE_MAX && now >= S.nextFree){ S.free++; S.nextFree += FREE_EVERY; }
  if(S.free >= FREE_MAX) S.nextFree = null;
}
function useFree(){ if(S.free >= FREE_MAX) S.nextFree = Date.now() + FREE_EVERY; S.free--; }
function timeLeft(){ if(!S.nextFree) return ''; let s = Math.max(0, Math.ceil((S.nextFree-Date.now())/1000)); const h=Math.floor(s/3600); s%=3600; const m=Math.floor(s/60); return `${h}h ${String(m).padStart(2,'0')}m`; }

/* ---------------- sound ---------------- */
let AC = null;
function ac(){ if(!S.sound) return null; try{ AC = AC || new (window.AudioContext||window.webkitAudioContext)(); if(AC.state==='suspended') AC.resume(); }catch(e){ AC=null; } return AC; }
function tone(f, d=.12, type='sine', v=.08, delay=0){ const a=ac(); if(!a) return; const t=a.currentTime+delay, o=a.createOscillator(), g=a.createGain();
  o.type=type; o.frequency.setValueAtTime(f,t); g.gain.setValueAtTime(v,t); g.gain.exponentialRampToValueAtTime(.0001,t+d); o.connect(g).connect(a.destination); o.start(t); o.stop(t+d+.02); }
function noise(d=.25, v=.12, hp=1200){ const a=ac(); if(!a) return; const n=a.sampleRate*d, b=a.createBuffer(1,n,a.sampleRate), x=b.getChannelData(0);
  for(let i=0;i<n;i++) x[i]=(Math.random()*2-1)*(1-i/n); const s=a.createBufferSource(), f=a.createBiquadFilter(), g=a.createGain();
  f.type='highpass'; f.frequency.value=hp; g.gain.value=v; s.buffer=b; s.connect(f).connect(g).connect(a.destination); s.start(); }
const SFX = {
  tick(){ tone(820,.04,'square',.025); },
  rip(){ noise(.08,.05,2500); },
  tear(){ noise(.45,.16,900); },
  flip(){ noise(.07,.07,3000); tone(520,.06,'triangle',.03); },
  rare(){ [660,880,1100].forEach((f,i)=>tone(f,.25,'triangle',.06,i*.07)); },
  legend(){ [392,523,659,784,1046,1318].forEach((f,i)=>tone(f,.5,'triangle',.07,i*.08)); tone(98,1.2,'sawtooth',.05); },
  coin(){ tone(1320,.08,'square',.03); tone(1760,.12,'square',.03,.06); },
  thud(){ tone(70,.3,'sine',.18); },
};

/* ---------------- helpers ---------------- */
function hash(s){ let h=2166136261; for(const c of s){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return h>>>0; }
function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
function ownedCount(){ return Object.keys(S.owned).length; }
function packSize(pid){ return (DB[pid]||[]).length; }
function foundIn(pid){ return (DB[pid]||[]).filter(m=>S.owned[m.id]).length; }
function packOf(id){ return PACKS.find(p=>p.id===PACK_OF[id]); }

function atlasStyle(m){ if(!m.atlas) return `background-image:url('${m.card}');background-size:cover;background-position:center`;
  const [s,x,y,w,h,W,H]=m.atlas;
  return `background-image:url('${s}?v=5');background-size:${W/w*100}% ${H/h*100}%;background-position:${W>w?x/(W-w)*100:0}% ${H>h?y/(H-h)*100:0}%`; }
function cardEl(m, o={}){
  if(m.card){
    const d=document.createElement('div');
    d.className=`card face ${m.rarity}${m.wide?' wide':''}${m.tall?' tall':''}${m.slim?' slim':''}${o.mini?' mini':''}${o.locked?' locked':''}`;
    if(m.ar) d.style.aspectRatio=m.ar;
    d.innerHTML=`<div class="in"><i class="cimg" role="img" aria-label="${o.locked?'Unknown monster':m.name}" style="${atlasStyle(m)}"></i>
      <div class="chips"><span class="chip">${RLABEL[m.rarity]} ${DIAM[m.rarity]}</span>${o.isNew?'<span class="chip new2">NEW</span>':''}${o.qty>1?`<span class="chip">×${o.qty}</span>`:''}</div>
      ${o.locked?'<div class="lockq">???</div>':''}</div>`;
    return d;
  }
  const p = packOf(m.id), h = hash(m.id), z = 140 + h%110, px = 8 + (h>>>4)%84, py = 12 + (h>>>9)%76;
  const tile = m.tile!=null ? `<i class="tile" style="background-image:url('sheets/${p.id}.webp');background-position:${(m.tile%10)/9*100}% ${Math.floor(m.tile/10)/9*100}%"></i>` : '';
  const art = m.tile!=null ? '' : `background-image:url('art/${p.id}.webp');background-size:auto ${z}%;background-position:${px}% ${py}%`;
  const d = document.createElement('div');
  d.className = `card ${m.rarity}${o.mini?' mini':''}${o.locked?' locked':''}`;
  d.style.setProperty('--pc', p.rgb);
  d.innerHTML = `<div class="in">
    <div class="hd"><span>${RLABEL[m.rarity]}</span><span>${DIAM[m.rarity]}</span></div>
    <div class="art" style="${art}">${tile}${o.isNew?'<span class="new">NEW</span>':''}${o.qty>1?`<span class="qty">×${o.qty}</span>`:''}<span class="tag">${p.name}</span></div>
    <div class="ft"><div class="nm">${o.locked?'???':m.name}</div><div class="or">${o.locked?'Not found yet':`${m.origin} · ${m.era}`}</div>${o.locked?'':`<div class="lr">${m.lore}</div>`}</div></div>`;
  return d;
}

/* ---------------- toast & modals ---------------- */
let toastQ = [], toastBusy = false;
function toast(t, s){ toastQ.push([t,s]); if(!toastBusy) nextToast(); }
function nextToast(){ const it = toastQ.shift(); if(!it){ toastBusy=false; return; } toastBusy=true;
  $('#toast .ti').innerHTML = /coin/i.test(it[0]) ? '<img src="coin.webp" alt="" style="width:34px;height:34px">' : '🏅'; $('#toastT').textContent = it[0]; $('#toastS').textContent = it[1]; const el=$('#toast'); el.classList.add('show'); SFX.coin();
  setTimeout(()=>{ el.classList.remove('show'); setTimeout(nextToast,400); }, 2600); }
function openModal(id){ $('#m-'+id).classList.add('show'); }
function closeModals(){ $$('.modal').forEach(m=>m.classList.remove('show')); }
$$('[data-modal]').forEach(b=>b.addEventListener('click',()=>{ if(b.dataset.modal==='badges') renderBadges(); if(b.dataset.modal==='odds') $('#oddsTitle').textContent = PACKS[front()].name+' odds'; openModal(b.dataset.modal); }));
document.addEventListener('click',e=>{ if(e.target.matches('[data-close]') || e.target.classList.contains('modal')) closeModals(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeModals(); });
const STACK = { pouch:1, sack:2, chest:3, hoard:4, vault:5 };
const coinStack = n => `<span class="cstack" style="--n:${n}">${'<img src="coin.webp" alt="">'.repeat(n)}</span>`;
function renderShop(){
  $('#bundles').innerHTML = BUNDLES.map(b=>`<div class="bundle">${b.tag?`<span class="ribbon">${b.tag}</span>`:''}
    <div class="stack">${coinStack(STACK[b.id])}</div><div class="amt">${fmt(b.coins+b.bonus)}</div>
    <div class="bonus">${b.bonus?`includes +${fmt(b.bonus)} bonus`:''}</div><div class="nm">${b.name}</div>
    <button class="price" data-buy="${b.id}">${b.price}</button></div>`).join('');
  const n=(S.purchases||[]).length;
  $('#shopNote').textContent = n ? `Test purchases made on this device: ${n}. Coins have no real-world value.` : 'Coins have no real-world value and can only be used in Monster Packs.';
  $$('[data-buy]').forEach(btn=>btn.onclick=()=>buyBundle(BUNDLES.find(b=>b.id===btn.dataset.buy)));
}
function buyBundle(b){
  const total=b.coins+b.bonus;
  confirmBox('Test purchase',
    `<b>${b.name}</b>: ${fmt(total)} coins for <b>${b.price}</b>.<br><br><span style="color:#cfe8ff">🧪 Test mode: no money will be charged and no payment details are needed.</span>`,
    'Complete test purchase', ()=>{
      S.coins+=total; (S.purchases=S.purchases||[]).push({ id:b.id, coins:total, price:b.price, t:Date.now(), test:true });
      save(); hud(); SFX.coin(); toast('Coins added!', `+${fmt(total)} coins · test purchase, nothing charged`);
    });
}
function openShop(){ renderShop(); openModal('shop'); }
$('#shopBtn').onclick=openShop;
$$('[data-shop]').forEach(b=>b.onclick=openShop);
function confirmBox(title, body, okText, fn){ $('#cfT').textContent=title; $('#cfB').innerHTML=body; const ok=$('#cfOk'); ok.textContent=okText;
  ok.onclick=()=>{ closeModals(); fn(); }; openModal('confirm'); }
function showBig(m){ const box=$('#bigCard'); box.innerHTML=''; const o=S.owned[m.id]; box.appendChild(cardEl(m,{qty:o?o.n:0, locked:!o}));
  const p=document.createElement('div'); p.className='lorebox';
  p.innerHTML = o ? `<b>${m.name}</b><span>${m.origin} · ${packOf(m.id).name}</span><p>${m.lore}</p>` : `<b>???</b><p>Find this monster in a ${packOf(m.id).name} pack to learn its legend.</p>`;
  box.appendChild(p); openModal('card'); }

/* ---------------- badges ---------------- */
const BADGES = [
  { id:'first', n:'First Find', d:'Find your first monster', r:500, ok:()=>ownedCount()>=1 },
  { id:'rare', n:'Gold Glint', d:'Find a Rare monster', r:500, ok:()=>ALL.some(m=>m.rarity==='rare'&&S.owned[m.id]) },
  { id:'leg', n:'Legend Hunter', d:'Find a Legendary monster', r:2000, ok:()=>ALL.some(m=>m.rarity==='legendary'&&S.owned[m.id]) },
  { id:'tasted', n:'Taste of Everything', d:'Open one of each pack', r:1500, ok:()=>PACKS.every(p=>(S.opened[p.id]||0)>0) },
  { id:'p10', n:'Ten Packs Torn', d:'Open 10 packs', r:1000, ok:()=>S.total>=10 },
  { id:'p50', n:'Pack Ripper', d:'Open 50 packs', r:3000, ok:()=>S.total>=50 },
  { id:'p200', n:'Crypt Raider', d:'Open 200 packs', r:8000, ok:()=>S.total>=200 },
  { id:'c10', n:'Bestiary Begun', d:'Collect 10 different monsters', r:1000, ok:()=>ownedCount()>=10 },
  { id:'c25', n:'Monster Scholar', d:'Collect 25 different monsters', r:3000, ok:()=>ownedCount()>=25 },
  { id:'c50', n:'Keeper of the Crypt', d:'Collect 50 different monsters', r:6000, ok:()=>ownedCount()>=50 },
  { id:'c75', n:'Monster Hunter', d:'Collect 75 different monsters', r:10000, ok:()=>ownedCount()>=75 },
  { id:'c100', n:'Monster Slayer', d:'Collect 100 different monsters', r:12000, ok:()=>ownedCount()>=100 },
  { id:'c150', n:'Lord of Legends', d:'Collect 150 different monsters', r:15000, ok:()=>ownedCount()>=150 },
  { id:'c200', n:'Keeper of Nightmares', d:'Collect 200 different monsters', r:18000, ok:()=>ownedCount()>=200 },
  { id:'c250', n:'Monster Master', d:'Collect 250 different monsters', r:22000, ok:()=>ownedCount()>=250 },
  { id:'c300', n:'Legend of the Crypt', d:'Collect 300 different monsters', r:26000, ok:()=>ownedCount()>=300 },
  { id:'c350', n:'Grand Bestiary', d:'Collect 350 different monsters', r:30000, ok:()=>ownedCount()>=350 },
  { id:'c400', n:'Crypt Keeper Supreme', d:'Collect 400 different monsters', r:35000, ok:()=>ownedCount()>=400 },
  { id:'c450', n:'Monster Sovereign', d:'Collect 450 different monsters', r:40000, ok:()=>ownedCount()>=450 },
  { id:'blood', n:'Blood Moon', d:'Open a Blood Moon Pack', r:5000, ok:()=>S.blood>0 },
  ...PACKS.map(p=>({ id:'all-'+p.id, n:`Complete ${p.name}`, get d(){ return `Collect all ${packSize(p.id)} ${p.name}`; }, r:5000, ok:()=>packSize(p.id)>0 && foundIn(p.id)===packSize(p.id) })),
  { id:'call', n:'Master of Monsters', get d(){ return `Collect all ${ALL.length} monsters`; }, r:25000, ok:()=>ALL.length>0 && ownedCount()>=ALL.length },
];
function checkBadges(){ for(const b of BADGES){ if(!S.badges[b.id] && b.ok()){ S.badges[b.id]=Date.now(); S.coins+=b.r; toast('Badge earned: '+b.n, `${b.d} · +${fmt(b.r)} coins`); } } save(); hud(); }
function renderBadges(){ $('#badgeList').innerHTML = `<p>${Object.keys(S.badges).length} of ${BADGES.length} earned.</p>` + BADGES.map(b=>
  `<div class="sec" style="display:flex;gap:10px;align-items:center;opacity:${S.badges[b.id]?1:.55}"><span style="font-size:22px">${S.badges[b.id]?'🏅':'🔒'}</span><div style="flex:1"><b>${b.n}</b><br>${b.d}</div><span class="c-r">+${fmt(b.r)}</span></div>`).join(''); }

/* ---------------- HUD ---------------- */
function hud(){
  tickFree();
  $('#coinN').textContent = fmt(S.coins);
  $('#freeTxt').innerHTML = S.free>0 ? `Free packs ready: <b>${S.free}</b>` : `Next free pack in <b>${timeLeft()}</b>`;
  const n = ownedCount();
  $('#colTxt').textContent = `Collected ${n} / ${ALL.length}`;
  $('#colBar').style.width = (ALL.length? n/ALL.length*100 : 0)+'%';
  $('#pityTxt').textContent = `Legendary within ${PITY - S.sinceLeg} pack${PITY-S.sinceLeg===1?'':'s'}`;
  const st = Object.values(S.stash).reduce((a,b)=>a+b,0);
  $('#stashTxt').textContent = `My Stash · ${st}`;
  $('#soundBtn').innerHTML = S.sound ? '<span class="ni">🔊</span><span class="nl">Sound: On</span>' : '<span class="ni">🔈</span><span class="nl">Sound: Off</span>';
  packInfo();
}
function openLabel(pid){
  if(S.free>0) return { t:'OPEN FREE PACK', s:'', ok:true };
  if((S.stash[pid]||0)>0) return { t:'OPEN PACK', s:`from your stash · ${S.stash[pid]} left`, ok:true };
  if(S.coins>=PACK_COST) return { t:'BUY & OPEN', s:`1,000 coins`, ok:true };
  return { t:'NOT ENOUGH COINS', s:`next free pack in ${timeLeft()}`, ok:false };
}
function packInfo(){
  const p = PACKS[front()];
  $('#pName').textContent = p.name; $('#pDesc').textContent = p.desc;
  $('#pFound').textContent = `${foundIn(p.id)} of ${packSize(p.id)} found`;
  $('#dots').innerHTML = Array.from({length:FREE_MAX},(_,i)=>`<i class="${i<S.free?'':'off'}"></i>`).join('') +
    (S.free>0 ? `<span>&nbsp;${S.free} free pack${S.free>1?'s':''} ready</span>` : `<span class="wait">&nbsp;next free pack in ${timeLeft()}</span>`);
  const L = openLabel(p.id), b = $('#openBtn');
  b.innerHTML = L.t + (L.s?`<small>${L.s}</small>`:''); b.disabled = !L.ok;
  $('#buyBtn').disabled = S.coins < PACK_COST;
  document.documentElement.style.setProperty('--glow', p.rgb);
}

/* ---------------- pack ring ---------------- */
const ring = $('#ring'); let ringEls = [], pos = 0, target = 0, vel = 0, lastFront = -1;
function front(){ return ((Math.round(target) % PACKS.length) + PACKS.length) % PACKS.length; }
function buildRing(){
  PACKS.forEach((p,i)=>{ const d=document.createElement('div'); d.className='rp';
    d.innerHTML=`<img src="packs/${p.id}.webp" alt="${p.name} pack"><div class="shadow"></div>`;
    d.addEventListener('click',e=>{ if(dragMoved) return; const f=front(); if(i===f){ $('#openBtn').click(); return; }
      let diff=((i-f)%5+5)%5; if(diff>2) diff-=5; target+=diff; });
    ring.appendChild(d); ringEls.push(d); });
}
function layoutRing(){
  const W = ring.clientWidth, H = ring.clientHeight, N = PACKS.length;
  const ph = Math.max(150, Math.min(H*0.9, 480)); ring.style.setProperty('--ph', ph+'px');
  const R = Math.min(W*0.34, ph*0.95);
  ringEls.forEach((el,i)=>{
    let rel = i - pos; rel = ((rel % N) + N + N/2) % N - N/2;
    const a = rel * (2*Math.PI/N), c = Math.cos(a), f = (c+1)/2;
    const sc = 0.5 + 0.5*Math.pow(f,1.6);
    const x = Math.sin(a)*R, y = -(1-sc)*ph*0.18;
    el.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px) scale(${sc}) rotateY(${-rel*16}deg)`;
    el.style.zIndex = Math.round(f*100);
    el.style.filter = `brightness(${0.35+0.65*Math.pow(f,1.3)})`;
    el.style.opacity = c < -0.5 ? 0.55 : 1;
    el.classList.toggle('front', Math.abs(rel) < 0.15);
  });
}
function animRing(){
  if(!dragging){ pos += (target-pos)*0.14; if(Math.abs(target-pos)<0.0005) pos=target; }
  const f = ((Math.round(pos)%5)+5)%5; if(f!==lastFront){ if(lastFront>=0) SFX.tick(); lastFront=f; }
  layoutRing(); requestAnimationFrame(animRing);
}
let dragging=false, dragMoved=false, dx0=0, pos0=0, lastX=0, lastT=0;
ring.addEventListener('pointerdown',e=>{ if(e.target.closest('.arrow')) return; dragging=true; dragMoved=false; dx0=e.clientX; pos0=pos; lastX=e.clientX; lastT=performance.now(); vel=0; ring.classList.add('drag'); });
window.addEventListener('pointermove',e=>{ if(!dragging) return; const dx=e.clientX-dx0; if(Math.abs(dx)>6) dragMoved=true;
  const step = Math.max(120, ring.clientWidth*0.22); pos = pos0 - dx/step;
  const now=performance.now(); vel = (e.clientX-lastX)/Math.max(1,now-lastT); lastX=e.clientX; lastT=now; });
window.addEventListener('pointerup',()=>{ if(!dragging) return; dragging=false; ring.classList.remove('drag');
  if(dragMoved){ target = Math.round(pos - vel*0.9); packInfo(); } setTimeout(()=>dragMoved=false,0); });
$('#prev').onclick=()=>{ target-=1; packInfo(); }; $('#next').onclick=()=>{ target+=1; packInfo(); };
document.addEventListener('keydown',e=>{ if(!$('#packs').classList.contains('show')||$('.modal.show')) return;
  if(e.key==='ArrowLeft'){ target-=1; packInfo(); } if(e.key==='ArrowRight'){ target+=1; packInfo(); } if(e.key==='Enter') $('#openBtn').click(); });
setInterval(()=>{ const f=front(); if(f!==packInfo.last){ packInfo.last=f; packInfo(); } },120);

/* ---------------- screens ---------------- */
function go(id){ $$('.screen').forEach(s=>s.classList.toggle('show', s.id===id));
  $$('[data-go]').forEach(b=>b.classList.toggle('on', b.dataset.go===id || (id==='open'&&b.dataset.go==='packs')));
  if(id==='inv') renderInv(); if(id==='packs') hud(); }
$$('[data-go]').forEach(b=>b.addEventListener('click',()=>{ if(opening && !$('#summary').classList.contains('show')) return; opening=false; go(b.dataset.go); }));
$('#soundBtn').onclick=()=>{ S.sound=!S.sound; save(); hud(); if(S.sound) SFX.coin(); };

/* ---------------- buying & stash ---------------- */
$('#buyBtn').onclick=()=>{ const p=PACKS[front()]; if(S.coins<PACK_COST) return;
  confirmBox('Buy a pack', `Buy one <b>${p.name}</b> pack for 1,000 coins? It goes into My Stash so you can open it whenever you like.`, 'Buy · 1,000', ()=>{
    S.coins-=PACK_COST; S.stash[p.id]=(S.stash[p.id]||0)+1; save(); SFX.coin(); hud(); }); };
$('#stashBtn').onclick=()=>{ const rows = PACKS.map(p=>`<div class="sec" style="display:flex;align-items:center;gap:10px"><img src="packs/${p.id}.webp" style="height:46px"><b style="flex:1">${p.name}</b><span>${S.stash[p.id]||0}</span>${(S.stash[p.id]||0)>0?`<button class="btn-s" data-stash="${p.id}" style="padding:6px 12px">Open</button>`:''}</div>`).join('');
  confirmBox('My Stash', rows + '<p style="margin-top:8px;color:#9b968d">Packs you buy wait here, sealed, until you open them.</p>', 'Close', ()=>{});
  $$('[data-stash]').forEach(b=>b.onclick=()=>{ closeModals(); const i=PACKS.findIndex(p=>p.id===b.dataset.stash); target += ((i-front())%5+5)%5 > 2 ? ((i-front())%5+5)%5-5 : ((i-front())%5+5)%5; startOpen(i,'stash'); }); };

/* ---------------- pulling ---------------- */
function rollPack(pid){
  const pool = DB[pid], by = r => pool.filter(m=>m.rarity===r);
  const god = Math.random() < 1/2000; const rar = [];
  for(let i=0;i<5;i++){
    const x = Math.random();
    if(god) rar.push(x<0.15?'legendary':'rare');
    else if(i<4) rar.push(x<0.002?'legendary':x<0.12?'rare':'common');
    else rar.push(x<0.015?'legendary':'rare');
  }
  if(god && !rar.includes('legendary')) rar[4]='legendary';
  if(!rar.includes('legendary') && S.sinceLeg >= PITY-1){
    rar[4]='legendary';
    const missing = by('legendary').filter(m=>!S.owned[m.id]);
    const cards = rar.map((r,i)=> i===4 && missing.length ? pick(missing) : pick(by(r)));
    return { cards, god };
  }
  return { cards: rar.map(r=>pick(by(r))), god };
}

let opening=false, cur=null, pulls=[], ri=0, tearP=0, tearing=false, tornDone=false;
const opack = $('#opack');
$('#openBtn').onclick=()=>startOpen(front());
function startOpen(i, from){
  const p = PACKS[i]; tickFree();
  if(from!=='stash'){
    if(S.free>0) useFree();
    else if((S.stash[p.id]||0)>0) S.stash[p.id]--;
    else if(S.coins>=PACK_COST) S.coins-=PACK_COST;
    else return;
  } else { if(!(S.stash[p.id]>0)) return; S.stash[p.id]--; }
  cur = p; opening = true;
  const r = rollPack(p.id); pulls = r.cards.map(m=>({ m, isNew:false }));
  // record now so nothing is lost on refresh
  const seen = new Set();
  pulls.forEach(x=>{ const o=S.owned[x.m.id]; if(!o && !seen.has(x.m.id)){ x.isNew=true; seen.add(x.m.id); }
    S.owned[x.m.id] = { n:(o?o.n:0)+1, t:o?o.t:Date.now()+seen.size }; });
  S.total++; S.opened[p.id]=(S.opened[p.id]||0)+1;
  if(r.god) S.blood++;
  S.sinceLeg = pulls.some(x=>x.m.rarity==='legendary') ? 0 : S.sinceLeg+1;
  cur.god = r.god; save(); hud();
  // set up tear view
  go('open'); $('#reveal').classList.remove('show'); $('#summary').classList.remove('show');
  opack.style.display=''; $('#ohint').style.display=''; $('#obot').style.display='';
  opack.className='opack'; tornDone=false; setTear(0);
  $$('#opack .layer').forEach(l=>l.style.backgroundImage=`url(packs/${p.id}.webp)`);
  $('#ohint').textContent = r.god ? '🩸 A Blood Moon rises… tear across the top of the pack' : 'Tear across the top of the pack to open it';
  document.documentElement.style.setProperty('--glow', r.god ? '255,40,50' : p.rgb);
  SFX.thud();
}
function setTear(p){ tearP=p; opack.style.setProperty('--p',(p*100)+'%'); opack.style.setProperty('--pn',p); opack.style.setProperty('--cut','13%'); }
opack.addEventListener('pointerdown',e=>{ if(tornDone) return; const r=opack.getBoundingClientRect(); if(e.clientY-r.top > r.height*0.32) return;
  tearing=true; opack.setPointerCapture(e.pointerId); moveTear(e); });
opack.addEventListener('pointermove',e=>{ if(tearing) moveTear(e); });
opack.addEventListener('pointerup',()=>{ tearing=false; });
function moveTear(e){ const r=opack.getBoundingClientRect(); const p=Math.min(1,Math.max(0,(e.clientX-r.left)/r.width));
  if(p>tearP+0.01){ if(Math.random()<.5) SFX.rip(); setTear(p); } if(tearP>0.9) finishTear(); }
$('#tapBtn').onclick=()=>{ if(tornDone) return; let p=tearP; const t=setInterval(()=>{ p+=0.06; setTear(Math.min(1,p)); SFX.rip(); if(p>=0.92){ clearInterval(t); finishTear(); } },28); };
$('#backBtn').onclick=()=>{ if(tornDone) return; tornDone=true; showSummary(); };
function finishTear(){ if(tornDone) return; tornDone=true; setTear(1); SFX.tear(); opack.classList.add('flying');
  $('#ohint').style.display='none'; $('#obot').style.display='none';
  setTimeout(()=>opack.classList.add('drop'),450);
  setTimeout(()=>{ opack.style.display='none'; startReveal(); },1150); }

/* ---------------- reveal ---------------- */
function startReveal(){ ri=0; $('#reveal').classList.add('show'); showCard(); }
function showCard(){
  const slot=$('#slot'), x=pulls[ri], old=slot.querySelector('.card');
  slot.classList.toggle('wide', !!x.m.wide); slot.classList.toggle('tall', !!x.m.tall); slot.classList.toggle('slim', !!x.m.slim); slot.style.aspectRatio = x.m.ar || '';
  if(old){ old.classList.remove('in'); old.classList.add('out'); setTimeout(()=>old.remove(),360); }
  const c = cardEl(x.m,{ isNew:x.isNew }); c.classList.add('in'); slot.appendChild(c);
  const rays=$('#rays'); rays.classList.toggle('on', x.m.rarity!=='common');
  rays.style.setProperty('--ray', x.m.rarity==='legendary' ? '255,140,230' : '255,196,70');
  if(x.m.rarity==='legendary'){ SFX.legend(); const f=$('#flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
  else if(x.m.rarity==='rare') SFX.rare(); else SFX.flip();
  $('#rlore').textContent = x.m.lore;
  $('#rcount').textContent = `${ri+1} / 5  ·  ${ri<4?'tap or swipe for the next card':'tap to see your pulls'}`;
}
function nextCard(){ if(!$('#reveal').classList.contains('show')) return; if(ri<4){ ri++; showCard(); } else showSummary(); }
let sx=null; const slotEl=$('#slot');
slotEl.addEventListener('pointerdown',e=>{ sx=e.clientX; });
slotEl.addEventListener('pointerup',e=>{ if(sx===null) return; sx=null; nextCard(); });
$('#reveal').addEventListener('click',e=>{ if(e.target.id==='reveal' || e.target.id==='rcount' || e.target.id==='rlore') nextCard(); });
$('#skipBtn').onclick=e=>{ e.stopPropagation(); showSummary(); };
document.addEventListener('keydown',e=>{ if((e.key===' '||e.key==='ArrowRight'||e.key==='Enter') && $('#reveal').classList.contains('show')){ e.preventDefault(); nextCard(); } });

function showSummary(){
  opack.style.display='none'; $('#ohint').style.display='none'; $('#obot').style.display='none';
  $('#reveal').classList.remove('show'); $('#rays').classList.remove('on');
  const sm=$('#summary'); sm.classList.add('show'); const box=$('#pulls'); box.innerHTML='';
  pulls.forEach((x,i)=>{ const c=cardEl(x.m,{isNew:x.isNew, mini:true}); c.style.animationDelay=(i*.08)+'s'; c.onclick=()=>showBig(x.m); box.appendChild(c); });
  const nn = pulls.filter(x=>x.isNew).length;
  $('#sumTxt').textContent = (cur.god?'🩸 Blood Moon Pack! ':'') + (nn ? `${nn} new for your collection!` : 'No new monsters this time. Sell duplicates in your Inventory for coins.');
  const L = openLabel(cur.id), ab=$('#againBtn'); ab.textContent = 'Open another' + (L.ok ? (S.free>0?' (free)':(S.stash[cur.id]>0?' (stash)':' · 1,000')) : ''); ab.disabled=!L.ok;
  checkBadges();
}
$('#againBtn').onclick=()=>startOpen(PACKS.indexOf(cur));
$('#seeColl').onclick=()=>{ opening=false; go('inv'); };
$('#toPacks').onclick=()=>{ opening=false; go('packs'); };

/* ---------------- inventory ---------------- */
const F = { view:'mine', rarity:'all', pack:'all', sort:'newest' };
function pills(el, key, items){ el.innerHTML = items.map(([v,l])=> v===null?`<span class="lbl">${l}</span>`:`<button class="pill${F[key]===v?' on':''}" data-k="${key}" data-v="${v}">${l}</button>`).join(''); }
function renderInv(){
  const n=ownedCount(), cnt=r=>ALL.filter(m=>m.rarity===r&&S.owned[m.id]).length;
  const tot=r=>ALL.filter(m=>m.rarity===r).length;
  $('#invStats').innerHTML = `Collected ${n} / ${ALL.length}<small>Common ${cnt('common')}/${tot('common')} · Rare ${cnt('rare')}/${tot('rare')} · Legendary ${cnt('legendary')}/${tot('legendary')}</small>`;
  pills($('#fRarity'),'rarity',[['all','All'],['common','Common'],['rare','Rare'],['legendary','Legendary'],[null,'Sort:'],...[['newest','Newest'],['name','Name A–Z'],['pack','Pack']].map(([v,l])=>[v,l])]);
  // sort pills use key 'sort'
  $$('#fRarity .pill').forEach(b=>{ if(['newest','name','pack'].includes(b.dataset.v)){ b.dataset.k='sort'; b.classList.toggle('on',F.sort===b.dataset.v); } });
  pills($('#fPack'),'pack',[['all','All packs'],...PACKS.map(p=>[p.id,`${p.name} ${foundIn(p.id)}/${packSize(p.id)}`])]);
  $$('.invtop [data-view]').forEach(b=>b.classList.toggle('on',b.dataset.view===F.view));
  let list = ALL.filter(m=> (F.view==='catalog' || S.owned[m.id]) && (F.rarity==='all'||m.rarity===F.rarity) && (F.pack==='all'||PACK_OF[m.id]===F.pack));
  const ro={legendary:0,rare:1,common:2};
  if(F.sort==='name') list.sort((a,b)=>a.name.localeCompare(b.name));
  else if(F.sort==='pack') list.sort((a,b)=>PACKS.findIndex(p=>p.id===PACK_OF[a.id])-PACKS.findIndex(p=>p.id===PACK_OF[b.id]) || ro[a.rarity]-ro[b.rarity]);
  else list.sort((a,b)=> F.view==='catalog' ? (ro[a.rarity]-ro[b.rarity]) : ((S.owned[b.id]?.t||0)-(S.owned[a.id]?.t||0)));
  const g=$('#grid'); g.innerHTML='';
  if(!list.length){ g.innerHTML=`<div class="empty">${F.view==='mine'&&!n?'Nothing yet. Open a pack to start your bestiary.':'No monsters match these filters.'}</div>`; }
  const frag=document.createDocumentFragment();
  list.forEach(m=>{ const o=S.owned[m.id]; const c=cardEl(m,{mini:true, qty:o?o.n:0, locked:!o}); c.onclick=()=>showBig(m); frag.appendChild(c); });
  g.appendChild(frag);
  const dupes = ALL.reduce((s,m)=>{ const o=S.owned[m.id]; return s + (o&&o.n>1 ? (o.n-1)*SELL[m.rarity] : 0); },0);
  $('#sellBtn').disabled = !dupes; $('#sellBtn').textContent = dupes ? `Sell duplicates · +${fmt(dupes)}` : 'No duplicates to sell';
  $('#sellBtn').dataset.amt = dupes;
}
document.addEventListener('click',e=>{ const b=e.target.closest('#inv .pill'); if(!b) return;
  if(b.dataset.view){ F.view=b.dataset.view; } else { F[b.dataset.k]=b.dataset.v; } renderInv(); });
$('#sellBtn').onclick=()=>{ const amt=+$('#sellBtn').dataset.amt; if(!amt) return;
  confirmBox('Sell duplicates', `Sell every extra copy and keep one of each monster? You'll get <b>${fmt(amt)} coins</b>.<br><br>Common 25 · Rare 150 · Legendary 1,500 each.`, `Sell · +${fmt(amt)}`, ()=>{
    for(const m of ALL){ const o=S.owned[m.id]; if(o&&o.n>1) o.n=1; } S.coins+=amt; save(); SFX.coin(); hud(); renderInv(); }); };

/* ---------------- embers ---------------- */
for(let i=0;i<14;i++){ const e=document.createElement('i'); e.className='ember'; e.style.left=(Math.random()*100)+'%'; e.style.bottom=(Math.random()*20-5)+'%';
  e.style.animationDuration=(8+Math.random()*10)+'s'; e.style.animationDelay=(-Math.random()*15)+'s'; $('#bg').appendChild(e); }

/* ---------------- boot ---------------- */
async function boot(){
  load(); tickFree();
  $('#loadPacks').innerHTML = PACKS.map(p=>`<img src="packs/${p.id}.webp" alt="">`).join('');
  try{ DB = await (await fetch('monsters.json')).json(); }catch(e){ $('#loading .t').textContent='Could not load monsters.json'; return; }
  for(const p of PACKS) for(const m of DB[p.id]){ ALL.push(m); BYID[m.id]=m; PACK_OF[m.id]=p.id; }
  buildRing(); hud(); requestAnimationFrame(animRing);
  await Promise.all(PACKS.map(p=>new Promise(r=>{ const i=new Image(); i.onload=i.onerror=r; i.src=`packs/${p.id}.webp`; })));
  setTimeout(()=>$('#loading').classList.add('done'),700);
  setInterval(hud, 30000);
  checkBadges();
}
boot();
})();
