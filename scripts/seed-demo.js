require('dotenv').config();
const {chromium}=require('playwright');
const {db,root}=require('../lib/db');
const {hash,compare}=require('../lib/detection');
const fs=require('fs');const path=require('path');
(async()=>{
 if(db.prepare('SELECT id FROM watches WHERE demo=1 LIMIT 1').get()){console.log('Sample monitors already exist. Nothing changed.');db.close();return;}
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const examples=[
 {name:'Linear · Pricing',url:'https://linear.app/pricing',title:'Make work flow.',sub:'Purpose-built for modern product teams.',old:'Standard plan: $10 per member / month',now:'Standard plan: $12 per member / month',color:'#695dc9',interval:60},
 {name:'Vercel · Changelog',url:'https://vercel.com/changelog',title:'Build something remarkable.',sub:'The latest updates from our platform.',old:'Deployments: improved build logs',now:'Deployments: improved build logs\nNew: faster edge functions in Asia Pacific',color:'#202b28',interval:30},
 {name:'Notion · What’s new',url:'https://www.notion.com/releases',title:'Your ideas. Connected.',sub:'One space for your work and your imagination.',old:'New calendar integrations are here.',now:'New calendar integrations are here.\nMeet the redesigned home for your projects.',color:'#b26d41',interval:180},
 {name:'Stripe · Documentation',url:'https://docs.stripe.com/changelog',title:'The payments changelog.',sub:'Everything new in the Stripe API.',old:'API version: 2026-09-30',now:'API version: 2026-09-30\nAdded support for new payment methods.',color:'#6268b6',interval:60}
 ];
 try{for(let i=0;i<examples.length;i++){
  const e=examples[i],now=Date.now(),baseline=now-(24+i*4)*3600000,changed=now-(i*37+8)*60000;
  db.prepare('INSERT OR IGNORE INTO targets(url,host,next_run) VALUES(?,?,?)').run(e.url,new URL(e.url).hostname,now+e.interval*60000);
  const target=db.prepare('SELECT id FROM targets WHERE url=?').get(e.url);
  const w=db.prepare("INSERT INTO watches(target_id,name,interval_min,sensitivity,demo,status,last_checked,last_changed,created_at) VALUES(?,?,?,'balanced',1,'ok',?,?,?)").run(target.id,e.name,e.interval,now-i*4*60000,changed,baseline).lastInsertRowid;
  let previous='';
  for(const [idx,content] of [e.old,e.now].entries()){
   const text=`${e.title}\n${e.sub}\n${content}\nThis is illustrative sample content, not a capture of the linked website.`;
   await page.setContent(`<!doctype html><html><body style="margin:0;font-family:Arial;background:#f8f9f6;color:#24392c"><header style="padding:30px 80px;border-bottom:1px solid #e1e4dc;display:flex;justify-content:space-between"><b style="font-size:25px;color:${e.color}">${e.name.split(' · ')[0]}</b><span>Product　 Resources　 Pricing　 Log in　 →</span></header><main style="padding:110px 130px"><div style="font-size:12px;letter-spacing:3px;color:${e.color}">ILLUSTRATIVE SAMPLE PAGE</div><h1 style="font-size:66px;letter-spacing:-3px;max-width:900px">${e.title}</h1><p style="font-size:24px;color:#819078">${e.sub}</p><article style="background:white;border:1px solid #e3e7dc;padding:45px;border-radius:18px;margin-top:60px;max-width:800px"><h2 style="font-size:22px">What’s new</h2><p style="white-space:pre-line;font-size:22px;line-height:1.8">${content}</p><button style="background:${e.color};border:0;padding:15px 25px;border-radius:6px;color:white">Learn more →</button></article><p style="font-size:12px;color:#9ba48f;margin-top:45px">Sample data for exploring PagePulse. Not an actual capture of this website.</p></main></body></html>`);
   const filename=`demo-${w}-${idx}.png`;
   await page.screenshot({path:path.join(root,'screenshots',filename)});
   const delta=idx?compare(previous,text):{summary:'Initial baseline captured.',pct:0};
   db.prepare('INSERT INTO snapshots(watch_id,created_at,hash,text,screenshot,summary,change_pct) VALUES(?,?,?,?,?,?,?)').run(w,idx?changed:baseline,hash(text),text,filename,delta.summary,delta.pct);previous=text;
  }
 }
 console.log('Created 4 clearly labeled sample monitors with 2 versions each. Sample monitors never make network requests.');
 }finally{await browser.close();db.close();}
})().catch(e=>{console.error(e);process.exit(1);});
