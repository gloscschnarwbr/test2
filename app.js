/* Main features: adjustable reels, jackpot scaling, payouts, local leaderboard,
   optional Firebase Auth + Firestore for per-user cloud scores (no global leaderboard). */

// ----- Slot Symbols, Weights, and Payout Ratios (standard-ish) -----
// We use weights for symbol likelihood and a payout table for N-of-a-kind.
// Rarer symbols pay more.
const SYMBOLS = [
  {icon:"🍒", weight: 6, pay:{2: 5, 3: 20, 4: 40, 5: 80}},
  {icon:"🍋", weight: 6, pay:{2: 5, 3: 15, 4: 30, 5: 60}},
  {icon:"🍊", weight: 6, pay:{2: 5, 3: 15, 4: 30, 5: 60}},
  {icon:"🔔", weight: 4, pay:{2:10, 3: 30, 4: 80, 5:160}},
  {icon:"⭐", weight: 3, pay:{2:20, 3: 60, 4:150, 5:300}},
  {icon:"💎", weight: 2, pay:{2:30, 3:100, 4:250, 5:500}},
  {icon:"7️⃣", weight: 1, pay:{2:50, 3:200, 4:500, 5:1000}} // rare & pays high
];

// Build a weighted pool for random selection
function buildPool() {
  const pool = [];
  SYMBOLS.forEach(s => { for (let i=0;i<s.weight;i++) pool.push(s.icon); });
  return pool;
}
let POOL = buildPool();

// ----- UI Elements -----
const reelCountEl = document.getElementById('reelCount');
const customWrap = document.getElementById('customWrap');
const customReels = document.getElementById('customReels');
const baseJackEl = document.getElementById('baseJack');
const betEl = document.getElementById('bet');
const slotArea = document.getElementById('slotArea');
const spinBtn = document.getElementById('spinBtn');
const resultEl = document.getElementById('result');
const rulesEl = document.getElementById('rules');
const balanceEl = document.getElementById('balance');
const add100Btn = document.getElementById('add100');
const resetBalBtn = document.getElementById('resetBal');
const localLbEl = document.getElementById('localLb');
const saveScoreBtn = document.getElementById('saveScore');
const clearLbBtn = document.getElementById('clearLb');
const playerNameEl = document.getElementById('playerName');
const saveNameBtn = document.getElementById('saveName');
const toast = document.getElementById('toast');
const userBox = document.getElementById('userBox');
const googleBtn = document.getElementById('googleBtn');
const emailBtn = document.getElementById('emailBtn');
const logoutBtn = document.getElementById('logoutBtn');
const pushScoreBtn = document.getElementById('pushScore');
const pullScoresBtn = document.getElementById('pullScores');
const cloudScoresEl = document.getElementById('cloudScores');

// ----- State -----
let reelCount = 5;
let balance = 0;
let localLb = [];
let playerName = "";
let user = null; // firebase auth user

// ----- Storage Helpers (local) -----
function loadState(){
  const st = JSON.parse(localStorage.getItem('ls_main_state')||'{}');
  reelCount = st.reelCount || 5;
  balance = st.balance || 0;
  localLb = st.localLb || [];
  playerName = st.playerName || "";
  baseJackEl.value = st.baseJack || 1000;
  betEl.value = st.bet || 10;

  reelCountEl.value = (reelCount===3||reelCount===5||reelCount===10) ? String(reelCount) : 'custom';
  if(reelCountEl.value==='custom'){ customWrap.classList.remove('hide'); customReels.value = reelCount; }
  playerNameEl.value = playerName;
  balanceEl.textContent = balance;
  renderReels();
  renderLocalLb();
  updateRules();
}
function saveState(){
  localStorage.setItem('ls_main_state', JSON.stringify({
    reelCount, balance, localLb, playerName,
    baseJack: Number(baseJackEl.value)||1000,
    bet: Number(betEl.value)||10
  }));
}

// ----- UI helpers -----
function toastMsg(msg, ms=1600){
  toast.textContent = msg; toast.classList.remove('hide');
  setTimeout(()=>toast.classList.add('hide'), ms);
}
function renderReels(){
  slotArea.innerHTML='';
  for(let i=0;i<reelCount;i++){
    const d = document.createElement('div');
    d.className='reel'; d.textContent = POOL[Math.floor(Math.random()*POOL.length)];
    slotArea.appendChild(d);
  }
}
function updateRules(){
  rulesEl.innerHTML = `All-match = Jackpot <b>${jackpotFor(reelCount)}</b> pts. Rarer symbols pay more on 2+ matches.`;
}

// ----- Jackpot Scaling -----
// Base on 3 reels, scale by (reels/3)^1.5
function jackpotFor(reels){
  const base = Number(baseJackEl.value) || 1000;
  return Math.round(base * Math.pow(reels/3, 1.5));
}

// ----- Spin Helpers -----
function pickSymbols(n){
  const out = [];
  for(let i=0;i<n;i++){
    out.push(POOL[Math.floor(Math.random()*POOL.length)]);
  }
  return out;
}
function getSymbolMeta(icon){ return SYMBOLS.find(s=>s.icon===icon); }

// Calculate payout: if all equal -> jackpot; else sum best match by symbol using its pay table.
// Payouts are scaled by bet.
function calcPayout(symbols, bet){
  // all same?
  if(symbols.every(s => s===symbols[0])){
    return jackpotFor(symbols.length) * bet;
  }
  // count each symbol
  const counts = {};
  symbols.forEach(s => counts[s] = (counts[s]||0)+1);
  let best = 0;
  for(const [icon, k] of Object.entries(counts)){
    if(k>=2){
      const meta = getSymbolMeta(icon);
      // pay table supports up to 5-kind; approximate for >5 by linear extension
      const key = Math.min(k, 5);
      const ratio = meta.pay[key] || 0;
      best = Math.max(best, ratio * bet);
    }
  }
  return Math.round(best);
}

// ----- Spin animation -----
function doSpin(){
  const bet = Math.max(1, Number(betEl.value)||1);
  if(balance < bet){ toastMsg('Not enough points'); return; }
  balance -= bet; balanceEl.textContent = balance; saveState();
  spinBtn.disabled = true;

  const reels = Array.from(slotArea.children);
  reels.forEach(r=> r.classList.add('spin'));

  const frames = 14; let f=0;
  const it = setInterval(()=>{
    reels.forEach(r=> r.textContent = POOL[Math.floor(Math.random()*POOL.length)]);
    if(++f >= frames){
      clearInterval(it);
      const final = pickSymbols(reels.length);
      reels.forEach((r,i)=>{ r.classList.remove('spin'); r.textContent = final[i]; });
      const win = calcPayout(final, bet);
      if(win>0){
        balance += win;
        resultEl.innerHTML = `Win <b>${win}</b> pts &nbsp; ${final.join(' ')}`;
        toastMsg(`+${win} pts`);
      }else{
        resultEl.textContent = `No win ${final.join(' ')}`;
      }
      balanceEl.textContent = balance; saveState();
      spinBtn.disabled = false;
    }
  }, 80);
}

// ----- Local Leaderboard -----
function renderLocalLb(){
  localLbEl.innerHTML = '';
  if(localLb.length===0){ localLbEl.innerHTML = `<div class="muted small">No entries yet.</div>`; return; }
  const list = [...localLb].sort((a,b)=>b.score-a.score).slice(0,50);
  list.forEach((e,i)=>{
    const row = document.createElement('div'); row.className='rowline';
    row.innerHTML = `<div><b>#${i+1}</b> ${escapeHtml(e.name||'Anon')} <span class="muted small">${new Date(e.at).toLocaleString()}</span></div>
                     <div><b>${e.score}</b> <span class="muted small">reels:${e.reels}</span></div>`;
    localLbEl.appendChild(row);
  });
}
function saveLocalScore(){
  const entry = {name: (playerName||'Anon'), score: balance, reels: reelCount, at: Date.now()};
  localLb.push(entry);
  // keep top 200
  localLb = localLb.sort((a,b)=>b.score-a.score).slice(0,200);
  saveState(); renderLocalLb(); toastMsg('Saved to device leaderboard');
}

// ----- Auth + Cloud (optional) -----
let fb = {app:null, auth:null, db:null};
function initFirebaseIfConfigured(){
  const cfg = window.FIREBASE_CONFIG;
  if(!cfg || !cfg.apiKey){ userBox.textContent = 'Offline/local mode (not signed in)'; return; }
  try{
    fb.app = firebase.initializeApp(cfg);
    fb.auth = firebase.auth();
    fb.db = firebase.firestore();
    // enable offline persistence for Firestore
    fb.db.enablePersistence({synchronizeTabs:true}).catch(()=>{});

    fb.auth.onAuthStateChanged(u=>{
      user = u || null;
      if(user){
        userBox.textContent = `${user.displayName||user.email} — signed in`;
      } else {
        userBox.textContent = 'Not signed in';
      }
    });
  }catch(e){
    console.error(e);
    userBox.textContent = 'Firebase init failed; running local-only';
  }
}

async function signInGoogle(){
  if(!fb.auth){ toastMsg('Auth not configured'); return; }
  const provider = new firebase.auth.GoogleAuthProvider();
  await fb.auth.signInWithPopup(provider);
}
async function signInEmail(){
  if(!fb.auth){ toastMsg('Auth not configured'); return; }
  const email = prompt('Email:');
  if(!email) return;
  const pass = prompt('Password (min 6 chars):');
  if(!pass) return;
  try{
    await fb.auth.signInWithEmailAndPassword(email, pass);
  }catch(e){
    // if user not found -> create
    if(e.code==='auth/user-not-found'){
      await fb.auth.createUserWithEmailAndPassword(email, pass);
    }else throw e;
  }
}
async function logout(){
  if(fb.auth) await fb.auth.signOut();
}

// Cloud score = per-user private history (top N)
async function pushCloudScore(){
  if(!user || !fb.db){ toastMsg('Sign in first'); return; }
  const ref = fb.db.collection('users').doc(user.uid).collection('scores');
  await ref.add({score: balance, reels: reelCount, at: firebase.firestore.FieldValue.serverTimestamp()});
  toastMsg('Saved to cloud');
}
async function pullCloudScores(){
  cloudScoresEl.innerHTML = '';
  if(!user || !fb.db){ cloudScoresEl.innerHTML = '<div class="muted small">Sign in to view.</div>'; return; }
  const ref = fb.db.collection('users').doc(user.uid).collection('scores').orderBy('score','desc').limit(50);
  const snap = await ref.get();
  if(snap.empty){ cloudScoresEl.innerHTML = '<div class="muted small">No cloud scores yet.</div>'; return; }
  snap.forEach(doc=>{
    const d = doc.data();
    const row = document.createElement('div'); row.className='rowline';
    const ts = d.at?.toDate ? d.at.toDate() : new Date();
    row.innerHTML = `<div>${ts.toLocaleString()}</div><div><b>${d.score}</b> <span class="muted small">reels:${d.reels||'-'}</span></div>`;
    cloudScoresEl.appendChild(row);
  });
}

// ----- Utilities -----
function escapeHtml(s){ return String(s).replace(/[&<>\"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m]); }

// ----- Events -----
reelCountEl.addEventListener('change', ()=>{
  if(reelCountEl.value==='custom'){ customWrap.classList.remove('hide'); reelCount = Number(customReels.value)||5; }
  else { customWrap.classList.add('hide'); reelCount = Number(reelCountEl.value); }
  renderReels(); updateRules(); saveState();
});
customReels.addEventListener('change', ()=>{
  let v = Math.max(3, Math.min(20, Number(customReels.value)||5));
  reelCount = v; renderReels(); updateRules(); saveState();
});
spinBtn.addEventListener('click', doSpin);
add100Btn.addEventListener('click', ()=>{ balance+=100; balanceEl.textContent=balance; saveState(); });
resetBalBtn.addEventListener('click', ()=>{ if(confirm('Reset balance to 0?')){ balance=0; balanceEl.textContent=0; saveState(); }});
saveScoreBtn.addEventListener('click', saveLocalScore);
clearLbBtn.addEventListener('click', ()=>{ if(confirm('Clear local leaderboard?')){ localLb=[]; saveState(); renderLocalLb(); }});
saveNameBtn.addEventListener('click', ()=>{ playerName = playerNameEl.value.trim(); saveState(); toastMsg('Name saved'); });
pushScoreBtn.addEventListener('click', pushCloudScore);
pullScoresBtn.addEventListener('click', pullCloudScores);
window.addEventListener('beforeunload', saveState);

// ----- PWA SW registration -----
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}

// ----- Init -----
loadState();
initFirebaseIfConfigured();
