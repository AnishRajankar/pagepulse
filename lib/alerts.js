const {db} = require('./db');
const nodemailer = require('nodemailer');
function availableChannels(){return {email:!!(process.env.SMTP_HOST&&process.env.MAIL_TO),discord:!!process.env.DISCORD_WEBHOOK_URL,telegram:!!(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_CHAT_ID)};}
async function send(channel, text) {
  if(channel==='email'){
    const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:+(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}:undefined,connectionTimeout:15000,socketTimeout:20000});
    await transport.sendMail({from:process.env.MAIL_FROM,to:process.env.MAIL_TO,subject:'PagePulse · Website changes',text}); return;
  }
  const url=channel==='discord'?process.env.DISCORD_WEBHOOK_URL:`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const payload=channel==='discord'?{content:text.slice(0,1900),allowed_mentions:{parse:[]}}:{chat_id:process.env.TELEGRAM_CHAT_ID,text:text.slice(0,4000),disable_web_page_preview:true};
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error(`Notification provider returned HTTP ${r.status}`);
}
function queueAlerts(w,snapshotId,summary) {
  if(w.change_streak>=3) return;
  if(w.keywords && !w.keywords.split(',').some(k=>summary.toLowerCase().includes(k.trim().toLowerCase())))return;
  const recent=db.prepare('SELECT a.id FROM alerts a JOIN snapshots s ON s.id=a.snapshot_id WHERE a.watch_id=? AND s.created_at>? LIMIT 1').get(w.id,Date.now()-3600000);
  if(recent&&!w.digest)return;
  const config=availableChannels();
  for(const channel of JSON.parse(w.channels)) if(config[channel]) db.prepare('INSERT OR IGNORE INTO alerts(watch_id,snapshot_id,channel,run_at) VALUES(?,?,?,?)').run(w.id,snapshotId,channel,Date.now());
}
let working=false;
async function deliverAlerts(){
  if(working)return;working=true;
  try{
    const rows=db.prepare(`SELECT a.*,w.name,w.digest,s.summary,s.created_at FROM alerts a JOIN watches w ON w.id=a.watch_id JOIN snapshots s ON s.id=a.snapshot_id WHERE a.state='pending' AND a.run_at<=? ORDER BY a.id LIMIT 100`).all(Date.now());
    const hour=+(process.env.DIGEST_HOUR_UTC||8); const groups=new Map(); const counts={};
    for(const r of rows){
      const now=new Date();const cutoff=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate(),hour);
      // Digest includes events prior to today's cutoff; later events wait until tomorrow.
      if(r.digest&&(Date.now()<cutoff||r.created_at>cutoff))continue;
      const count=counts[r.channel]||0;counts[r.channel]=count+1;
      const key=r.digest?`digest:${r.channel}:${Math.floor(count/2)}`:`one:${r.id}`;
      if(!groups.has(key))groups.set(key,[]); groups.get(key).push(r);
    }
    for(const items of groups.values()){
      const base=(process.env.BASE_URL||'http://localhost:3000').replace(/\/$/,'');
      const text=(items[0].digest?'Your daily PagePulse digest\n\n':'PagePulse detected a change\n\n')+items.map(a=>`${a.name}\n${a.summary}\n${base}/?watch=${a.watch_id}&version=${a.snapshot_id}`).join('\n\n');
      try {await send(items[0].channel,text);for(const a of items)db.prepare("UPDATE alerts SET state='sent',sent_at=?,error=NULL WHERE id=?").run(Date.now(),a.id);}
      catch(e){for(const a of items)db.prepare("UPDATE alerts SET attempts=attempts+1,state=?,run_at=?,error=? WHERE id=?").run(a.attempts>=4?'failed':'pending',Date.now()+60000*2**a.attempts,e.message,a.id);}
    }
  } finally{working=false;}
}
module.exports={availableChannels,queueAlerts,deliverAlerts};
