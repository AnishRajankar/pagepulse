require('dotenv').config();
const express=require('express');const helmet=require('helmet');const path=require('path');const fs=require('fs');const crypto=require('crypto');
const {db,root}=require('./lib/db');const {canonicalURL,assertPublic}=require('./lib/security');const {compare}=require('./lib/detection');const {availableChannels}=require('./lib/alerts');const {capture,closeBrowser}=require('./lib/browser');const worker=require('./lib/worker');
const app=express();
app.disable('x-powered-by');app.use(helmet({contentSecurityPolicy:{directives:{'img-src':["'self'",'data:'],'style-src':["'self'","'unsafe-inline'"],'script-src':["'self'"],'frame-ancestors':null}},crossOriginEmbedderPolicy:false,frameguard:false}));
if(process.env.APP_PASSWORD) app.use((req,res,next)=>{
  const credential=Buffer.from((req.headers.authorization||'').split(' ')[1]||'','base64').toString();
  const expected=`${process.env.APP_USER||'admin'}:${process.env.APP_PASSWORD}`;
  const a=crypto.createHash('sha256').update(credential).digest(),b=crypto.createHash('sha256').update(expected).digest();
  if(!crypto.timingSafeEqual(a,b))return res.set('WWW-Authenticate','Basic realm="PagePulse"').status(401).send('Authentication required.');next();
});
app.use(express.json({limit:'100kb'}));
app.use('/api',(req,res,next)=>{
  // Reject browser cross-origin mutations, including authenticated CSRF.
  if(!['GET','HEAD'].includes(req.method)&&req.headers['sec-fetch-site']==='cross-site')return res.status(403).json({error:'Cross-site writes are not allowed.'});
  res.set('Cache-Control','no-store'); next();
});
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const mustWatch=id=>{const w=db.prepare('SELECT w.*,t.url FROM watches w JOIN targets t ON t.id=w.target_id WHERE w.id=?').get(id);if(!w)throw Object.assign(Error('Monitor not found.'),{status:404});return w;};
function validate(body){
  const name=String(body.name||'').trim();if(!name||name.length>100)throw Error('A name of 1–100 characters is required.');
  const interval=+body.interval_min;if(!Number.isInteger(interval)||interval<15||interval>1440)throw Error('Check interval must be 15–1440 minutes.');
  if(!['high','balanced','low'].includes(body.sensitivity))throw Error('Choose a valid sensitivity.');
  for(const field of ['watch_selectors','ignore_selectors'])if(!Array.isArray(body[field])||body[field].length>20||body[field].some(s=>typeof s!=='string'||!s.trim()||s.length>500))throw Error('Selectors must be a list of up to 20 CSS selectors.');
  const channels=(body.channels||[]).filter(c=>['email','discord','telegram'].includes(c));
  return {name,interval,sensitivity:body.sensitivity,watch:JSON.stringify(body.watch_selectors),ignore:JSON.stringify(body.ignore_selectors),noise:body.noise!==false?1:0,keywords:String(body.keywords||'').slice(0,300),channels:JSON.stringify(channels),digest:body.digest?1:0};
}
app.get('/api/config',(req,res)=>res.json({channels:availableChannels(),authEnabled:!!process.env.APP_PASSWORD}));
app.get('/api/watches',(req,res)=>{
  const watches=db.prepare(`SELECT w.*,t.url,t.next_run,(SELECT COUNT(*) FROM snapshots s WHERE s.watch_id=w.id) AS versions,(SELECT change_pct FROM snapshots s WHERE s.watch_id=w.id ORDER BY id DESC LIMIT 1) AS change_pct FROM watches w JOIN targets t ON t.id=w.target_id ORDER BY w.created_at DESC`).all();
  const stats={total:watches.length,active:watches.filter(w=>!w.paused&&!w.demo).length,changes:db.prepare('SELECT COUNT(*) AS n FROM snapshots WHERE created_at>? AND summary<>?').get(Date.now()-86400000,'Initial baseline captured.').n,issues:watches.filter(w=>['error','blocked','noisy'].includes(w.status)).length,queued:db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n};
  res.json({watches,stats});
});
app.post('/api/watches',wrap(async(req,res)=>{
  const v=validate(req.body);const url=await assertPublic(req.body.url);const now=Date.now();
  const id=db.transaction(()=>{
    db.prepare('INSERT OR IGNORE INTO targets(url,host,next_run) VALUES(?,?,?)').run(url,new URL(url).hostname,now);
    const target=db.prepare('SELECT id FROM targets WHERE url=?').get(url);
    const result=db.prepare('INSERT INTO watches(target_id,name,interval_min,sensitivity,watch_selectors,ignore_selectors,noise,keywords,channels,digest,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(target.id,v.name,v.interval,v.sensitivity,v.watch,v.ignore,v.noise,v.keywords,v.channels,v.digest,now);
    worker.requestCheck(target.id);return result.lastInsertRowid;
  })();res.status(201).json({id});
}));
app.put('/api/watches/:id',wrap(async(req,res)=>{
  const w=mustWatch(req.params.id),v=validate(req.body);
  db.prepare('UPDATE watches SET name=?,interval_min=?,sensitivity=?,watch_selectors=?,ignore_selectors=?,noise=?,keywords=?,channels=?,digest=? WHERE id=?').run(v.name,v.interval,v.sensitivity,v.watch,v.ignore,v.noise,v.keywords,v.channels,v.digest,w.id);
  res.json({ok:true});
}));
app.post('/api/watches/:id/pause',(req,res,next)=>{try{const w=mustWatch(req.params.id);db.prepare('UPDATE watches SET paused=? WHERE id=?').run(w.paused?0:1,w.id);res.json({ok:true});}catch(e){next(e);}});
app.post('/api/watches/:id/check',(req,res,next)=>{try{const w=mustWatch(req.params.id);if(w.demo)throw Error('This is sample data. Add a real URL to run live checks.');if(w.paused)throw Error('Resume this monitor before checking.');worker.requestCheck(w.target_id,true);res.json({ok:true,message:'Check queued. Per-host rate limits still apply.'});}catch(e){next(e);}});
app.delete('/api/watches/:id',(req,res,next)=>{try{const w=mustWatch(req.params.id);const files=db.prepare('SELECT screenshot FROM snapshots WHERE watch_id=?').all(w.id);db.prepare('DELETE FROM watches WHERE id=?').run(w.id);for(const f of files)try{fs.unlinkSync(path.join(root,'screenshots',f.screenshot));}catch{}res.json({ok:true});}catch(e){next(e);}});
app.get('/api/watches/:id/versions',(req,res,next)=>{try{mustWatch(req.params.id);res.json(db.prepare('SELECT id,created_at,summary,smart_summary,change_pct,screenshot FROM snapshots WHERE watch_id=? ORDER BY id DESC LIMIT 300').all(req.params.id));}catch(e){next(e);}});

// Number tracking chart data
app.get('/api/watches/:id/numbers',(req,res,next)=>{
  try{
    mustWatch(req.params.id);
    // Get distinct labels
    const labels=db.prepare("SELECT DISTINCT label FROM number_snapshots WHERE watch_id=? ORDER BY label").all(req.params.id);
    // For each label, return time series
    const series=labels.map(({label})=>{
      const points=db.prepare("SELECT value,created_at FROM number_snapshots WHERE watch_id=? AND label=? ORDER BY created_at ASC LIMIT 100").all(req.params.id,label);
      return {label,points};
    });
    res.json(series);
  }catch(e){next(e);}
});

app.get('/api/compare',(req,res,next)=>{try{
  const a=db.prepare('SELECT * FROM snapshots WHERE id=?').get(req.query.before),b=db.prepare('SELECT * FROM snapshots WHERE id=?').get(req.query.after);
  if(!a||!b||a.watch_id!==b.watch_id)throw Error('Select two versions from the same monitor.');
  res.json({before:a,after:b,...compare(a.text,b.text)});
}catch(e){next(e);}});
app.get('/api/visual-diff',(req,res,next)=>{try{
  const a=db.prepare('SELECT * FROM snapshots WHERE id=?').get(req.query.before),b=db.prepare('SELECT * FROM snapshots WHERE id=?').get(req.query.after);
  if(!a||!b||a.watch_id!==b.watch_id)throw Error('Select versions from the same monitor.');
  const {PNG}=require('pngjs'),pixelmatch=require('pixelmatch');const one=PNG.sync.read(fs.readFileSync(path.join(root,'screenshots',a.screenshot))),two=PNG.sync.read(fs.readFileSync(path.join(root,'screenshots',b.screenshot)));
  if(one.width!==two.width||one.height!==two.height)throw Error('Screenshot dimensions differ. Use side-by-side view.');
  const output=new PNG({width:one.width,height:one.height});pixelmatch(one.data,two.data,output.data,one.width,one.height,{threshold:0.15,diffColor:[242,92,54],alpha:0.35});res.type('png').send(PNG.sync.write(output));
}catch(e){next(e);}});
let picking=false,lastPicker=0;
app.post('/api/picker',wrap(async(req,res)=>{
  if(picking||Date.now()-lastPicker<10000)return res.status(429).json({error:'The visual picker is busy. Please wait a few seconds.'});
  const url=await assertPublic(req.body.url),host=new URL(url).hostname;
  const limit=db.prepare('SELECT next_at FROM host_limits WHERE host=?').get(host);
  if(limit?.next_at>Date.now())return res.status(429).json({error:`This host is cooling down. Try in ${Math.ceil((limit.next_at-Date.now())/1000)} seconds.`});
  picking=true;lastPicker=Date.now();
  db.prepare('INSERT INTO host_limits(host,next_at) VALUES(?,?) ON CONFLICT(host) DO UPDATE SET next_at=excluded.next_at').run(host,Date.now()+Math.max(1000,+(process.env.HOST_DELAY_MS||60000)));
  try{res.json(await capture(url,[],true));}finally{picking=false;}
}));
app.get('/api/activity',(req,res)=>res.json(db.prepare(`SELECT s.id,s.watch_id,s.created_at,s.summary,s.smart_summary,s.change_pct,w.name,w.demo FROM snapshots s JOIN watches w ON w.id=s.watch_id ORDER BY s.created_at DESC LIMIT 25`).all()));
app.get('/api/alerts',(req,res)=>res.json(db.prepare('SELECT a.id,a.channel,a.state,a.attempts,a.error,a.sent_at,a.run_at,w.name FROM alerts a JOIN watches w ON w.id=a.watch_id ORDER BY a.id DESC LIMIT 100').all()));

// Per-page RSS feed
app.get('/api/watches/:id/rss',(req,res,next)=>{
  try{
    const w=mustWatch(req.params.id);
    const snapshots=db.prepare('SELECT id,created_at,summary,smart_summary,change_pct FROM snapshots WHERE watch_id=? ORDER BY id DESC LIMIT 50').all(req.params.id);
    const base=(process.env.BASE_URL||`http://localhost:${process.env.PORT||3000}`).replace(/\/$/,'');
    const esc=(s)=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const items=snapshots.map(s=>`
    <item>
      <title>${esc(s.smart_summary||s.summary)} — ${esc(w.name)}</title>
      <link>${esc(base)}/?watch=${w.id}&amp;version=${s.id}</link>
      <guid isPermaLink="true">${esc(base)}/?watch=${w.id}&amp;version=${s.id}</guid>
      <pubDate>${new Date(s.created_at).toUTCString()}</pubDate>
      <description><![CDATA[<p><strong>${esc(w.name)}</strong></p><p>${esc(s.smart_summary||s.summary)}</p>${s.change_pct?`<p>Change: ${s.change_pct.toFixed(1)}%</p>`:''}]]></description>
      <category>${s.change_pct>0?'change':'baseline'}</category>
    </item>`).join('');
    const xml=`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>PagePulse: ${esc(w.name)}</title>
    <link>${esc(w.url)}</link>
    <description>Change monitor for ${esc(w.url)} · PagePulse</description>
    <language>en</language>
    <atom:link href="${esc(base)}/api/watches/${w.id}/rss" rel="self" type="application/rss+xml"/>
    <ttl>${w.interval_min}</ttl>
    ${items}
  </channel>
</rss>`;
    res.type('application/rss+xml').send(xml);
  }catch(e){next(e);}
});

// RSS feed for all monitors (dashboard)
app.get('/api/rss',(req,res)=>{
  const snapshots=db.prepare(`SELECT s.id,s.watch_id,s.created_at,s.summary,s.smart_summary,s.change_pct,w.name,t.url FROM snapshots s JOIN watches w ON w.id=s.watch_id JOIN targets t ON t.id=w.target_id WHERE w.demo=0 ORDER BY s.created_at DESC LIMIT 50`).all();
  const base=(process.env.BASE_URL||`http://localhost:${process.env.PORT||3000}`).replace(/\/$/,'');
  const esc=(s)=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const items=snapshots.map(s=>`
    <item>
      <title>${esc(s.smart_summary||s.summary)} — ${esc(s.name)}</title>
      <link>${esc(base)}/?watch=${s.watch_id}&amp;version=${s.id}</link>
      <guid isPermaLink="true">${esc(base)}/?watch=${s.watch_id}&amp;version=${s.id}</guid>
      <pubDate>${new Date(s.created_at).toUTCString()}</pubDate>
      <description><![CDATA[<p><strong>${esc(s.name)}</strong></p><p>${esc(s.smart_summary||s.summary)}</p>]]></description>
    </item>`).join('');
  const xml=`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>PagePulse · All monitors</title>
    <link>${esc(base)}</link>
    <description>All website change alerts from PagePulse</description>
    <language>en</language>
    <atom:link href="${esc(base)}/api/rss" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;
  res.type('application/rss+xml').send(xml);
});

app.use('/screenshots',express.static(path.join(root,'screenshots'),{immutable:true,maxAge:'1d'}));
app.use(express.static(path.join(__dirname,'public')));
app.use((err,req,res,next)=>{console.error(err.message);res.status(err.status||400).json({error:err.message||'Request failed.'});});
if(require.main===module){const server=app.listen(+(process.env.PORT||3000),'0.0.0.0',()=>{console.log(`PagePulse listening on port ${process.env.PORT||3000}`);if(!process.env.APP_PASSWORD)console.log('Local single-user mode: set APP_PASSWORD before public deployment.');worker.start();});let exiting=false;for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{if(exiting)return;exiting=true;server.close();await worker.stop();await closeBrowser();db.close();process.exit(0);});}
module.exports=app;
