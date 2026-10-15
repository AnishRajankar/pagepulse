const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');const os=require('os');const path=require('path');
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'pagepulse-test-'));
const {normalize,hash,compare,smartSummary,extractNumbers}=require('../lib/detection');
const {canonicalURL,isPublicIP,assertPublic}=require('../lib/security');
const {db}=require('../lib/db');
const {requestCheck,saveResult}=require('../lib/worker');
const app=require('../server');
after(()=>{db.close();fs.rmSync(process.env.DATA_DIR,{recursive:true,force:true});});
test('normalizes timestamps, counters, UUIDs but preserves prices',()=>{
 const a=normalize('Price $29\n2026-01-01 12:30\n500 views\nabcdef1234567890abcdef1234');
 const b=normalize('Price $29\n2026-09-15 13:50\n900 views\n1234567890abcdef12345678');
 assert.equal(a,b);assert.notEqual(hash(a),hash(normalize('Price $39')));
});
test('noise filtering is optional',()=>assert.notEqual(normalize('12:30',false),normalize('13:45',false)));
test('diff explains additions and removals',()=>{const d=compare('Plan $10','Plan $12');assert.ok(d.pct>0);assert.ok(d.parts.some(x=>x.added));assert.match(d.summary,/12/);});
test('smartSummary detects price change',()=>{
 const s=smartSummary('Plan costs $10 per month','Plan costs $12 per month','');
 assert.match(s,/\$10.*\$12|\$12/i);
});
test('smartSummary detects new content addition',()=>{
 const s=smartSummary('Hello world','Hello world and new content here','');
 assert.match(s,/new content|added/i);
});
test('extractNumbers finds prices and metrics',()=>{
 const nums=extractNumbers('Price: $29\nUsers: 1,500\nAPI version: 2026-09-30');
 assert.ok(nums.length>0);
 assert.ok(nums.some(n=>n.value===29||n.value===1500));
});
test('canonical URLs preserve query parameters and remove fragments',()=>assert.equal(canonicalURL('https://example.com/a?q=1#top'),'https://example.com/a?q=1'));
test('rejects credentials and dangerous protocols or ports',()=>{for(const u of ['file:///etc/passwd','http://user:pass@example.com','http://example.com:3000','javascript:alert(1)'])assert.throws(()=>canonicalURL(u));});
test('blocks private and reserved network addresses',async()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','100.64.0.1','0.0.0.0','::1','fe80::1','::ffff:127.0.0.1','2001:db8::1'])assert.equal(isPublicIP(ip),false,ip);
 assert.equal(isPublicIP('8.8.8.8'),true);assert.equal(isPublicIP('2606:4700:4700::1111'),true);
 await assert.rejects(assertPublic('http://127.0.0.1'));await assert.rejects(assertPublic('http://localhost'));
});
function watch(name='Test'){
 db.prepare('INSERT OR IGNORE INTO targets(url,host,next_run) VALUES(?,?,?)').run('https://example.com/','example.com',Date.now());
 const target=db.prepare('SELECT id FROM targets LIMIT 1').get();
 const id=db.prepare("INSERT INTO watches(target_id,name,interval_min,sensitivity,created_at) VALUES(?,?,15,'high',?)").run(target.id,name,Date.now()).lastInsertRowid;
 return db.prepare('SELECT * FROM watches WHERE id=?').get(id);
}
test('shared URL queue deduplicates jobs',()=>{const w=watch();requestCheck(w.target_id);requestCheck(w.target_id);assert.equal(db.prepare('SELECT COUNT(*) n FROM jobs WHERE target_id=?').get(w.target_id).n,1);});
test('stores baseline and changed content only, preserves last good on error',()=>{
 const w=watch('Snapshots');const result=text=>({watch:db.prepare('SELECT * FROM watches WHERE id=?').get(w.id),text,screenshot:Buffer.from('test-image')});
 saveResult(result('Price $20'));saveResult(result('Price $20'));assert.equal(db.prepare('SELECT COUNT(*) n FROM snapshots WHERE watch_id=?').get(w.id).n,1);
 saveResult(result('Price $30'));assert.equal(db.prepare('SELECT COUNT(*) n FROM snapshots WHERE watch_id=?').get(w.id).n,2);
 saveResult({watch:w,error:'Selector missing'});assert.equal(db.prepare('SELECT COUNT(*) n FROM snapshots WHERE watch_id=?').get(w.id).n,2);assert.equal(db.prepare('SELECT status FROM watches WHERE id=?').get(w.id).status,'error');
});
test('smart_summary is stored in snapshot',()=>{
 const w=watch('SmartSummary');
 const result=text=>({watch:db.prepare('SELECT * FROM watches WHERE id=?').get(w.id),text,screenshot:Buffer.from('test-image')});
 saveResult(result('Price $20'));
 saveResult(result('Price $40'));
 const snap=db.prepare('SELECT smart_summary FROM snapshots WHERE watch_id=? ORDER BY id DESC LIMIT 1').get(w.id);
 assert.ok(snap.smart_summary,'smart_summary should be set');
});
test('number_snapshots are stored after a content change',()=>{
 const w=watch('Numbers');
 const result=text=>({watch:db.prepare('SELECT * FROM watches WHERE id=?').get(w.id),text,screenshot:Buffer.from('test-image')});
 saveResult(result('Price: $20\nUsers: 500'));
 saveResult(result('Price: $25\nUsers: 600'));
 const nums=db.prepare('SELECT COUNT(*) n FROM number_snapshots WHERE watch_id=?').get(w.id);
 assert.ok(nums.n>0,'should have tracked numbers');
});
test('repeatedly changing pages are flagged noisy and stabilize on unchanged text',()=>{
 const w=watch('Noisy');for(const text of ['one','two','three','four'])saveResult({watch:db.prepare('SELECT * FROM watches WHERE id=?').get(w.id),text,screenshot:Buffer.from('test')});
 assert.equal(db.prepare('SELECT status FROM watches WHERE id=?').get(w.id).status,'noisy');
 saveResult({watch:db.prepare('SELECT * FROM watches WHERE id=?').get(w.id),text:'four',screenshot:Buffer.from('test')});
 assert.equal(db.prepare('SELECT status FROM watches WHERE id=?').get(w.id).status,'ok');
});
test('HTTP API validates, lists, pauses, compares, and deletes',async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  let r=await fetch(base+'/api/watches');assert.equal(r.status,200);const data=await r.json();assert.ok(data.watches.length>0);
  r=await fetch(base+'/api/watches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'bad',url:'http://localhost',interval_min:1})});assert.equal(r.status,400);
  r=await fetch(base+'/api/watches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'bad',url:'http://127.0.0.1',interval_min:15,sensitivity:'balanced',watch_selectors:[],ignore_selectors:[]})});assert.equal(r.status,400);
  const w=watch('API');r=await fetch(base+`/api/watches/${w.id}/pause`,{method:'POST'});assert.equal(r.status,200);assert.equal(db.prepare('SELECT paused FROM watches WHERE id=?').get(w.id).paused,1);
  r=await fetch(base+`/api/watches/${w.id}`,{method:'DELETE'});assert.equal(r.status,200);assert.equal(db.prepare('SELECT id FROM watches WHERE id=?').get(w.id),undefined);
  r=await fetch(base+'/api/compare?before=999999&after=999998');assert.equal(r.status,400);
  r=await fetch(base+'/api/watches',{method:'POST',headers:{'Sec-Fetch-Site':'cross-site','Content-Type':'application/json'},body:'{}'});assert.equal(r.status,403);
  // RSS feed
  r=await fetch(base+'/api/rss');assert.equal(r.status,200);assert.ok(r.headers.get('content-type').includes('rss+xml'));
  // Number tracking API
  const wn=watch('NumAPI');r=await fetch(base+`/api/watches/${wn.id}/numbers`);assert.equal(r.status,200);const nums=await r.json();assert.ok(Array.isArray(nums));
 }finally{await new Promise(r=>server.close(r));}
});
