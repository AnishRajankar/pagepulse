const fs=require('fs');const path=require('path');
const {db,root}=require('./db');const {capture}=require('./browser');const {normalize,hash,compare,smartSummary,extractNumbers}=require('./detection');const {queueAlerts,deliverAlerts}=require('./alerts');
let timer,active=0,stopping=false;
const running=new Set();
function requestCheck(targetId,force=false){
  const t=db.prepare('SELECT * FROM targets WHERE id=?').get(targetId);if(!t)return;
  const limit=db.prepare('SELECT next_at FROM host_limits WHERE host=?').get(t.host);
  db.prepare('INSERT OR IGNORE INTO jobs(target_id,run_at) VALUES(?,?)').run(targetId,Math.max(Date.now(),limit?.next_at||0));
  if(force)db.prepare('UPDATE jobs SET force=1 WHERE target_id=?').run(targetId);
}
function saveResult({watch:w,text,screenshot,error}){
  const now=Date.now();
  if(error){db.prepare("UPDATE watches SET status='error',error=?,last_checked=? WHERE id=?").run(error,now,w.id);return;}
  const normalized=normalize(text,!!w.noise), digest=hash(normalized);
  if(!normalized){db.prepare("UPDATE watches SET status='error',error='No readable text in selected region; last good version retained.',last_checked=? WHERE id=?").run(now,w.id);return;}
  const previous=db.prepare('SELECT * FROM snapshots WHERE watch_id=? ORDER BY id DESC LIMIT 1').get(w.id);
  const delta=previous?compare(previous.text,normalized):{pct:0,summary:'Initial baseline captured.'};
  const threshold={high:0,balanced:0.5,low:3}[w.sensitivity];
  if(previous&&(previous.hash===digest||delta.pct<threshold)){
    db.prepare("UPDATE watches SET status='ok',error=NULL,last_checked=?,change_streak=0 WHERE id=?").run(now,w.id);return;
  }
  // Generate AI-style smart one-line summary
  const aiSummary=previous?smartSummary(previous.text,normalized,delta.summary):'Initial baseline captured.';
  const streak=previous?w.change_streak+1:0;
  const file=`${w.id}-${now}-${digest.slice(0,8)}.png`;
  fs.writeFileSync(path.join(root,'screenshots',file),screenshot);
  db.transaction(()=>{
    // A deleted watch must never create an orphan snapshot.
    if(!db.prepare('SELECT id FROM watches WHERE id=?').get(w.id)){fs.unlinkSync(path.join(root,'screenshots',file));return;}
    const snapshotId=db.prepare('INSERT INTO snapshots(watch_id,created_at,hash,text,screenshot,summary,smart_summary,change_pct) VALUES(?,?,?,?,?,?,?,?)').run(w.id,now,digest,normalized,file,delta.summary,aiSummary,delta.pct).lastInsertRowid;
    db.prepare('UPDATE watches SET status=?,error=NULL,last_checked=?,last_changed=?,change_streak=? WHERE id=?').run(streak>=3?'noisy':'ok',now,now,streak,w.id);
    // Store number snapshots for tracking/charts
    try {
      const nums=extractNumbers(normalized);
      for(const n of nums){
        db.prepare('INSERT INTO number_snapshots(watch_id,snapshot_id,label,value,type,created_at) VALUES(?,?,?,?,?,?)').run(w.id,snapshotId,n.label,n.value,n.type,now);
      }
    } catch(e){console.error('Number tracking:',e.message);}
    if(previous)queueAlerts({...w,change_streak:streak},snapshotId,aiSummary);
  })();
}
async function execute(job){
  active++;running.add(job.target_id);
  const target=db.prepare('SELECT * FROM targets WHERE id=?').get(job.target_id);
  db.prepare("UPDATE jobs SET state='running' WHERE id=?").run(job.id);
  const delay=Math.max(1000,+(process.env.HOST_DELAY_MS||60000));
  db.prepare('INSERT INTO host_limits(host,next_at) VALUES(?,?) ON CONFLICT(host) DO UPDATE SET next_at=excluded.next_at').run(target.host,Date.now()+delay);
  try{
    const watches=db.prepare('SELECT * FROM watches WHERE target_id=? AND paused=0 AND demo=0 AND (?=1 OR last_checked IS NULL OR last_checked+interval_min*60000<=?)').all(target.id,job.force||0,Date.now());
    if(watches.length){const results=await capture(target.url,watches);for(const result of results) if(db.prepare('SELECT id FROM watches WHERE id=?').get(result.watch.id))saveResult(result);}
    db.prepare('UPDATE targets SET failures=0 WHERE id=?').run(target.id);
    db.prepare('DELETE FROM jobs WHERE id=?').run(job.id);
  }catch(e){
    const blocked=/BLOCKED|Private|reserved|not allowed/i.test(e.message);
    db.prepare('UPDATE watches SET status=?,error=?,last_checked=? WHERE target_id=? AND paused=0 AND demo=0').run(blocked?'blocked':'error',e.message.slice(0,400),Date.now(),target.id);
    db.prepare('UPDATE targets SET failures=failures+1 WHERE id=?').run(target.id);
    if(job.attempts<2&&!blocked)db.prepare("UPDATE jobs SET state='queued',attempts=attempts+1,run_at=? WHERE id=?").run(Date.now()+delay*2**job.attempts,job.id);
    else db.prepare('DELETE FROM jobs WHERE id=?').run(job.id);
  }finally{
    const next=db.prepare('SELECT MIN(COALESCE(last_checked,?)+interval_min*60000) AS due FROM watches WHERE target_id=? AND paused=0 AND demo=0').get(Date.now(),target.id).due||Date.now()+86400000;
    const failures=db.prepare('SELECT failures FROM targets WHERE id=?').get(target.id).failures;
    db.prepare('UPDATE targets SET next_run=? WHERE id=?').run(Math.max(next,Date.now()+Math.min(86400000,delay*2**Math.min(failures,10))),target.id);
    active--;running.delete(job.target_id);
  }
}
function tick(){
  if(stopping)return;
  const due=db.prepare('SELECT DISTINCT t.id FROM targets t JOIN watches w ON w.target_id=t.id WHERE t.next_run<=? AND w.paused=0 AND w.demo=0').all(Date.now());
  for(const t of due)requestCheck(t.id);
  const jobs=db.prepare("SELECT j.*,t.host FROM jobs j JOIN targets t ON t.id=j.target_id WHERE j.state='queued' AND j.run_at<=? ORDER BY j.run_at LIMIT 100").all(Date.now());
  for(const job of jobs){
    if(active>=Math.min(8,+(process.env.CONCURRENCY||2)))break;
    const limit=db.prepare('SELECT next_at FROM host_limits WHERE host=?').get(job.host);
    if(limit?.next_at>Date.now())continue;
    if(!running.has(job.target_id))execute(job).catch(e=>console.error('Worker:',e.message));
  }
  deliverAlerts().catch(e=>console.error('Alerts:',e.message));
}
function start(){db.prepare("UPDATE jobs SET state='queued' WHERE state='running'").run();timer=setInterval(tick,3000);tick();}
async function stop(){stopping=true;clearInterval(timer);while(active)await new Promise(r=>setTimeout(r,100));}
module.exports={start,stop,requestCheck,saveResult};
