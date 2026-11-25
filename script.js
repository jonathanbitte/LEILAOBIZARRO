const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let lastBid=-1,S=null,off=0,ses=JSON.parse(sessionStorage.getItem('ses')||'null'),es;
$('name').value=localStorage.getItem('nome')||'';

async function api(p,b){
  const r=await fetch('/api/'+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
  return r.json();
}
const act=(p,b={})=>api(p,{...b,room:ses.room,pid:ses.pid});
async function enter(path,data){
  const nome=$('name').value.trim();
  if(!nome){$('err').textContent='Digite seu nome!';return}
  localStorage.setItem('nome',nome);
  const r=await api(path,{...data,name:nome});
  if(r.error){$('err').textContent=r.error;return}
  ses={room:r.room,pid:r.pid};sessionStorage.setItem('ses',JSON.stringify(ses));connect();
}
$('create').onclick=()=>enter('create',{secs:$('secs').value,extra:$('extra').value,money:$('money0').value,maxBid:$('maxbid').value});
$('enter').onclick=()=>enter('join',{room:$('code').value.trim()});
function connect(){
  if(es)es.close();
  es=new EventSource(`/events?room=${ses.room}&pid=${ses.pid}`);
  es.onmessage=e=>{S=JSON.parse(e.data);off=S.now-Date.now();render()};
  es.onerror=()=>{if(es.readyState===2){sessionStorage.removeItem('ses');ses=null;show('join')}};
}
if(ses)connect();

function show(id){['join','lobby','vote','game','battle','end'].forEach(s=>$(s).hidden=s!==id)}
const players=(arr,money)=>arr.map(p=>`<div class="pl ${p.id===S.you?'me':''}"><b>${esc(p.name)}${p.id===S.host?' 👑':''}</b><span>${money?'R$ '+p.money+' · '+(p.items.join(' ')||'—'):(p.voted?'✅ votou':'')}</span></div>`).join('');

function render(){
  const me=S.players.find(p=>p.id===S.you),isHost=S.you===S.host;
  if(S.phase==='lobby'){
    show('lobby');showRank=false;ran=false;$('lcode').textContent=S.code;
    $('lcfg').textContent=`⏱ ${S.secs}s por item · +${S.extra}s a cada lance · 💰 R$ ${S.money}${S.maxBid?' · 🔒 lance máx. R$ '+S.maxBid:''}`;
    $('lplayers').innerHTML=players(S.players);
    $('start').hidden=!isHost;$('start').disabled=false;
    $('lwait').textContent=isHost?(S.players.length<2?'Pode começar sozinho pra testar (ou espere alguém entrar com o código).':''):'Esperando o 👑 começar...';
  }else if(S.phase==='vote'){
    show('vote');
    $('vthemes').innerHTML=S.themes.map((t,i)=>!t?'':`<button data-t="${i}" class="${S.myVote===i?'sel':''}">${esc(t)}</button>`).join('');
    $('vinfo').innerHTML=`Empate = sorteio · mais votos ganha.<br>Votaram: ${S.players.filter(p=>p.voted).length}/${S.players.length}`;
  }else if(S.phase==='auction'||S.phase==='sold'){
    show('game');
    $('gtitle').textContent=S.theme;$('money').textContent=me.money;
    
    $('chars').innerHTML=S.chars.map(n=>`<span class="${n.by?'got':''}">${esc(n.t)}${n.by?' ('+esc(n.by)+')':''}</span>`).join('');$('emoji').textContent=S.item.e;$('iname').textContent=S.item.n;$('ab').textContent='✨ '+S.item.ab;
    $('bid').textContent=S.bid;if(lastBid!==S.bid){lastBid=S.bid;const b=$('bid');b.classList.remove('pop');void b.offsetWidth;b.classList.add('pop')}
    $('who').textContent=S.bidder?(S.bidderId===S.you?'você':S.bidder):'sem lance (comece com R$ 1!)';
    $('count').textContent=`Item ${S.idx+1} de ${S.total}`;
    $('last').textContent=S.phase==='sold'?S.last:'';
    $('gplayers').innerHTML=players(S.players,true);
    updBtns();
  }else if(S.phase==='battle'&&!showRank){
    show('battle');runBattles();
  }else if(S.phase==='end'||S.phase==='battle'){
    show('end');
    $('rank').innerHTML=(S.champ?`<p>🥊 Campeão da batalha: <b>${esc(S.champ)}</b> (+200 pts)</p>`:'')+[...S.players].sort((a,b)=>b.score-a.score).map((p,i)=>`<div class="pl ${p.id===S.you?'me':''}"><b>${['🥇','🥈','🥉'][i]||i+1+'º'} ${esc(p.name)}</b><span>${p.score} pts · sobrou R$ ${p.money}<br>${p.items.join(' ')}</span></div>`).join('');
    $('again').hidden=S.you!==S.host;$('ewait').textContent=S.you===S.host?'':'Esperando o 👑...';
  }
}
function updBtns(){
  const me=S.players.find(p=>p.id===S.you);
  document.querySelectorAll('#btns button').forEach(b=>{
    const eff=S.maxBid?Math.min(S.bid+ +b.dataset.add,S.maxBid):S.bid+ +b.dataset.add;
    b.disabled=S.phase!=='auction'||S.bidderId===S.you||eff>me.money;
  });
}
document.querySelectorAll('#btns button').forEach(b=>b.onclick=()=>act('bid',{add:+b.dataset.add}));
$('vthemes').onclick=e=>{const t=e.target.closest('button');if(t)act('vote',{theme:+t.dataset.t})};
$('start').onclick=()=>act('start');
$('again').onclick=()=>act('again');

// cronômetro: usa o horário do servidor (endsAt), sem acumular erro
setInterval(()=>{
  if(!S||S.phase!=='auction'){if(S&&S.phase==='sold'){$('timer').style.width='0%';$('sec').textContent='Vendido!'}return}
  const rem=Math.max(0,S.endsAt-(Date.now()+off));
  $('timer').style.width=Math.min(100,rem/(S.secs*1000)*100)+'%';
  $('sec').textContent=(rem/1000).toFixed(1)+'s';$('sec').classList.toggle('low',rem<3000);
},100);

// ===== BATALHA (SVG animado) =====
// Fotos: coloque img/<nome-do-personagem>.png (veja img/LEIA-ME.txt). Sem foto, aparece o emoji.
let showRank=false,ran=false;
const EXT=['png','jpg','jpeg','webp'];
function imgNext(el){const i=+(el.dataset.i||0)+1;if(i>=EXT.length){el.remove();return}el.dataset.i=i;el.setAttribute('href',el.getAttribute('href').replace(/\.\w+$/,'.'+EXT[i]))}
const slug=n=>n.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const ease=k=>k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
const tw=(fn,ms)=>new Promise(res=>{const t0=performance.now();(function f(t){const k=Math.min(1,(t-t0)/ms);fn(k);k<1?requestAnimationFrame(f):res()})(t0)});
const fighter=(f,id,x)=>`<g id="f${id}" transform="translate(${x},185)"><clipPath id="c${id}"><circle r="48"/></clipPath><circle r="54" fill="#1b1730" stroke="${f.col}" stroke-width="6"/><text y="18" font-size="54" text-anchor="middle">${f.e}</text><image href="img/${slug(f.n)}.png" x="-48" y="-48" width="96" height="96" preserveAspectRatio="xMidYMid slice" clip-path="url(#c${id})" onerror="imgNext(this)"/></g>`;
function arena(a,b){
  const lab=(k,f,x)=>`<text x="${k==='a'?20:620}" y="24" text-anchor="${k==='a'?'start':'end'}" fill="#fff" font-size="15" font-weight="700">${esc(f.pname)}: ${esc(f.n)}</text><text x="${k==='a'?20:620}" y="42" text-anchor="${k==='a'?'start':'end'}" fill="#ffb300" font-size="13">✨ ${esc(f.ab)}</text><rect x="${x}" y="50" width="280" height="12" rx="6" fill="#3a3556"/><rect id="hp${k}" x="${x}" y="50" width="280" height="12" rx="6" fill="#69f0ae"/>`;
  $('arena').innerHTML=`<rect width="640" height="300" fill="#251b4a" rx="14"/><rect y="245" width="640" height="55" fill="#0e0c18"/>${lab('a',a,20)}${lab('b',b,340)}${fighter(a,'a',120)}${fighter(b,'b',520)}<polygon id="fx" opacity="0" points="0,-46 12,-14 44,-20 20,4 40,34 6,18 -10,46 -14,16 -44,12 -22,-8 -34,-38 -6,-20" fill="#ffeb3b" stroke="#ff5722" stroke-width="3"/><text id="abt" x="320" y="108" text-anchor="middle" fill="#fff" font-size="24" font-weight="800" stroke="#000" stroke-width=".8"></text>`;
}
async function fight(f){
  const {a,b,win}=f,fm={a,b},L=win==='a'?'b':'a',ratio=f.ratio;
  const hp={a:100,b:100},home={a:120,b:520},dir={a:1,b:-1};
  arena(a,b);
  const setHp=(k,v)=>{const r=$('hp'+k),w=280*Math.max(0,v)/100;r.setAttribute('width',w);if(k==='b')r.setAttribute('x',620-w);r.setAttribute('fill',v>50?'#69f0ae':v>25?'#ffb300':'#ff5252')};
  const pos=(k,dx,dy=0,rot=0)=>$('f'+k).setAttribute('transform',`translate(${home[k]+dx},${185+dy}) rotate(${rot})`);
  await wait(900);
  for(const att of [win,L,win,L,win]){
    const def=att==='a'?'b':'a';
    $('abt').textContent=fm[att].ab;
    await tw(k=>pos(att,dir[att]*230*ease(k)),350);
    $('fx').setAttribute('transform',`translate(${home[def]-dir[att]*10},185)`);$('fx').setAttribute('opacity',1);
    hp[def]=Math.max(0,hp[def]-(att===win?34:Math.round(ratio*ratio*28)));
    if(att===win&&hp[def]<=2)hp[def]=0;
    setHp(def,hp[def]);
    await tw(k=>pos(def,dir[att]*28*Math.sin(k*Math.PI)+Math.sin(k*40)*6*(1-k)),320);
    $('fx').setAttribute('opacity',0);
    await tw(k=>pos(att,dir[att]*230*(1-ease(k))),300);
  }
  setHp(L,0);
  await tw(k=>{pos(L,-dir[L]*70*k,90*k,-dir[L]*80*k);$('f'+L).setAttribute('opacity',1-k*.6)},700);
  $('abt').textContent=`🏆 ${fm[win].n} venceu!`;
  for(let i=0;i<2;i++)await tw(k=>pos(win,0,-34*Math.sin(k*Math.PI)),450);
}
async function runBattles(){
  if(ran)return;ran=true;$('bnext').hidden=true;
  const bs=S.battles;
  for(let i=0;i<bs.length;i++){$('btitle').textContent=`🥊 Batalha ${i+1}/${bs.length} — ${S.theme}`;await fight(bs[i]);await wait(1800)}
  $('bnext').hidden=false;
}
$('bnext').onclick=()=>{showRank=true;render()};