// Servidor sem dependências: node server.js  (abre em http://localhost:3000)
const http=require('http'),fs=require('fs'),path=require('path');
const TEMAS=require('./temas.js'),CH=require('./chars.js'),PORT=process.env.PORT||3000,rooms=new Map();
const FILES={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/script.js':'script.js'};
const TYPES={'.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript'};
const uid=()=>Math.random().toString(36).slice(2,10);
const shuf=a=>a.map(v=>[Math.random(),v]).sort((x,y)=>x[0]-y[0]).map(x=>x[1]);
const clamp=(v,a,b,d)=>{v=+v;return isNaN(v)?d:Math.min(b,Math.max(a,Math.round(v)))};
const parse=s=>s.split(',').map(x=>{const m=x.match(/^(\S+) (.+?) (\d+)(\*?)$/);return{e:m[1],n:m[2],p:+m[3],ess:!!m[4]}});
const mkPlayer=n=>({id:uid(),name:String(n||'Jogador').trim().slice(0,16)||'Jogador',money:0,items:[],vote:null,res:null});
const score=q=>q.items.length*50+q.money+(q.bonus||0),strip=({pow,pid,...x})=>x;

function view(r,p){
  const ps=[...r.players.values()],it=r.items&&r.idx>=0?r.items[r.idx]:null;
  return{code:r.code,you:p.id,host:r.host,secs:r.secs,money:r.money,maxBid:r.maxBid,extra:r.extra,phase:r.phase,now:Date.now(),
    players:ps.map(q=>({id:q.id,name:q.name,money:q.money,voted:q.vote!=null,items:q.items.map(i=>i.e+' '+i.n),score:score(q)})),
    themes:r.phase==='vote'?TEMAS.map((t,i)=>CH[i]?t.n:null):undefined,myVote:p.vote,
    theme:r.theme!=null?TEMAS[r.theme].n:null,
    
    item:it&&(r.phase==='auction'||r.phase==='sold')?{e:it.e,n:it.n,ch:true,ab:it.ab}:null,chars:r.items?r.items.filter(i=>i.ch).map(i=>({t:`${i.e} ${i.n}`,by:i.by||null})):[],battles:r.battles?r.battles.map(b=>({a:strip(b.a),b:strip(b.b),win:b.win,ratio:b.ratio})):null,champ:r.champ||null,idx:r.idx,total:r.items?r.items.length:0,
    bid:r.bid,bidder:r.bidder?r.players.get(r.bidder).name:null,bidderId:r.bidder,
    endsAt:r.phase==='auction'?r.endsAt:null,last:r.last};
}
function send(r){for(const p of r.players.values())if(p.res)p.res.write('data: '+JSON.stringify(view(r,p))+'\n\n')}
function sched(r){clearTimeout(r.t);r.t=setTimeout(()=>closeItem(r),Math.max(0,r.endsAt-Date.now())+30)}
function nextItem(r){
  r.idx++;r.last=null;
  if(r.idx>=r.items.length){clearTimeout(r.t);if(r.items.some(i=>i.ch)){doBattles(r);r.phase='battle'}else r.phase='end';return send(r)}
  r.phase='auction';r.bid=0;r.bidder=null;r.endsAt=Date.now()+r.secs*1000;sched(r);send(r);
}
function closeItem(r){
  if(r.phase!=='auction')return;
  if(Date.now()<r.endsAt)return sched(r);
  const it=r.items[r.idx];
  if(r.bidder){const w=r.players.get(r.bidder);w.money-=r.bid;w.items.push(it);it.by=w.name;r.last=`${it.e} ${it.n} → ${w.name} por R$ ${r.bid}`}
  else r.last=`${it.e} ${it.n} ficou sem lance`;
  r.phase='sold';send(r);r.t=setTimeout(()=>nextItem(r),3000);
}
const parseCh=s=>s?s.split(';').map(x=>{const[a,pow,ab,col]=x.split('|'),m=a.match(/^(\S+) (.+)$/);return{e:m[1],n:m[2],p:0,ess:false,ch:true,pow:+pow,ab,col}}):[];
function doBattles(r){
  const F=shuf([...r.players.values()].map(p=>{const c=p.items.filter(i=>i.ch).sort((a,b)=>b.pow-a.pow)[0]||{e:'👊',n:'Punhos nus',pow:5,ab:'Soco de desespero',col:'#9e9e9e'};return{pid:p.id,pname:p.name,e:c.e,n:c.n,pow:c.pow,ab:c.ab,col:c.col}}));
  if(F.length<2){const pool=parseCh(CH[r.theme]),c=pool[Math.floor(Math.random()*pool.length)];F.push({pid:'bot',pname:'🤖 Bot',e:c.e,n:c.n,pow:c.pow,ab:c.ab,col:c.col})} // teste solo: entra um bot
  let cur=F[0];r.battles=[];
  for(let k=1;k<F.length;k++){const b=F[k],win=cur.pow===b.pow?(Math.random()<.5?'a':'b'):(cur.pow>b.pow?'a':'b');r.battles.push({a:cur,b,win,ratio:Math.min(cur.pow,b.pow)/Math.max(cur.pow,b.pow)});if(win==='b')cur=b}
  const w=r.players.get(cur.pid);if(w)w.bonus=200;r.champ=cur.pname; // mais poder sempre vence
}
function startGame(r,theme){
  r.theme=theme;r.items=shuf(parseCh(CH[theme]));r.battles=null;r.champ=null;r.idx=-1;
  const budget=r.money;
  for(const p of r.players.values()){p.money=budget;p.items=[];p.bonus=0}
  nextItem(r);
}
function resolveVote(r){
  const c={};for(const p of r.players.values())c[p.vote]=(c[p.vote]||0)+1;
  const max=Math.max(...Object.values(c)),top=Object.keys(c).filter(k=>c[k]===max);
  startGame(r,+top[Math.floor(Math.random()*top.length)]); // empate = sorteio
}
const body=req=>new Promise(ok=>{let d='';req.on('data',c=>d+=c);req.on('end',()=>{try{ok(JSON.parse(d||'{}'))}catch{ok({})}})});
const json=(res,o,c=200)=>{res.writeHead(c,{'Content-Type':'application/json'});res.end(JSON.stringify(o))};

http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://x'),P=u.pathname;
  if(req.method==='GET'&&P==='/events'){
    const r=rooms.get(u.searchParams.get('room')),p=r&&r.players.get(u.searchParams.get('pid'));
    if(!p){res.writeHead(404);return res.end()}
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache',Connection:'keep-alive'});
    p.res=res;res.write('data: '+JSON.stringify(view(r,p))+'\n\n');
    const ka=setInterval(()=>res.write(':\n\n'),20000);
    req.on('close',()=>{clearInterval(ka);if(p.res===res)p.res=null});return;
  }
  if(req.method==='POST'){
    const b=await body(req);
    if(P==='/api/create'){
      let code;do{code=Math.random().toString(36).slice(2,6).toUpperCase()}while(rooms.has(code));
      const p=mkPlayer(b.name),r={code,host:p.id,secs:clamp(b.secs,5,60,15),money:clamp(b.money,50,2000,300),maxBid:clamp(b.maxBid,0,2000,0),extra:clamp(b.extra,1,15,5),phase:'lobby',players:new Map([[p.id,p]]),items:null,idx:-1,theme:null,bid:0,bidder:null,last:null};
      rooms.set(code,r);return json(res,{room:code,pid:p.id});
    }
    if(P==='/api/join'){
      const r=rooms.get(String(b.room||'').toUpperCase());
      if(!r)return json(res,{error:'Sala não encontrada'},404);
      if(r.phase!=='lobby'||r.players.size>=8)return json(res,{error:'Sala fechada ou cheia'},400);
      const p=mkPlayer(b.name);r.players.set(p.id,p);send(r);return json(res,{room:r.code,pid:p.id});
    }
    const r=rooms.get(b.room),p=r&&r.players.get(b.pid);
    if(!p)return json(res,{error:'Sessão inválida'},404);
    const host=p.id===r.host;
    if(P==='/api/start'&&host&&r.phase==='lobby'&&r.players.size>=1){r.phase='vote';for(const q of r.players.values())q.vote=null;send(r)}
    else if(P==='/api/vote'&&r.phase==='vote'&&CH[b.theme]){p.vote=+b.theme;[...r.players.values()].every(q=>q.vote!=null)?resolveVote(r):send(r)}
    else if(P==='/api/bid'&&r.phase==='auction'&&[1,5,10].includes(b.add)){
      const nb=r.maxBid?Math.min(r.bid+b.add,r.maxBid):r.bid+b.add;
      if(r.bidder!==p.id&&nb>r.bid&&nb<=p.money&&Date.now()<r.endsAt){r.bid=nb;r.bidder=p.id;r.endsAt=Math.max(r.endsAt,Date.now()+r.extra*1000);if(r.maxBid&&nb>=r.maxBid)r.endsAt=Date.now();sched(r);send(r)}
    }
    else if(P==='/api/again'&&host&&(r.phase==='end'||r.phase==='battle')){r.phase='lobby';r.items=null;r.idx=-1;r.theme=null;for(const q of r.players.values()){q.money=0;q.items=[];q.vote=null;q.bonus=0}send(r)}
    return json(res,{ok:1});
  }
  if(P.startsWith('/img/')){
    const fp=path.join(__dirname,'img',path.basename(decodeURIComponent(P))),T={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
    if(T[path.extname(fp).toLowerCase()]&&fs.existsSync(fp)){res.writeHead(200,{'Content-Type':T[path.extname(fp).toLowerCase()]});return res.end(fs.readFileSync(fp))}
    res.writeHead(404);return res.end();
  }
  const f=FILES[P];
  if(!f){res.writeHead(404);return res.end('404')}
  res.writeHead(200,{'Content-Type':TYPES[path.extname(f)]});res.end(fs.readFileSync(path.join(__dirname,f)));
}).listen(PORT,'0.0.0.0',()=>{console.log('\n🔨 LEILÃO BIZARRO no ar!\n  Você (este PC):  http://localhost:'+PORT);
  for(const l of Object.values(require('os').networkInterfaces()))for(const i of l)if(i.family==='IPv4'&&!i.internal)console.log('  Mesma rede Wi-Fi: http://'+i.address+':'+PORT);
  console.log('  Pela internet: rode  npx cloudflared tunnel --url http://localhost:'+PORT+'\n  (Ctrl+C para fechar)\n')});