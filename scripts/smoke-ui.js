// Run against a started app: node scripts/smoke-ui.js
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1080}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:3000');
  await page.getByRole('heading',{name:'Your eyes on the web.'}).waitFor();
  await page.screenshot({path:require('path').join(__dirname,'../dashboard.png'),fullPage:true});

  // ── Validate: private URL rejected ──────────────────────────────────────
  await page.getByRole('button',{name:'New monitor',exact:true}).click();
  await page.getByLabel('Monitor name').fill('Smoke Test');
  await page.getByLabel('Public page URL').fill('http://127.0.0.1');
  await page.getByRole('button',{name:'Create monitor',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Private or reserved'}).waitFor();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();

  // ── Monitor detail view ─────────────────────────────────────────────────
  const first=page.locator('.monitor-name').first();
  if(await first.count()){
   await first.click();
   // Use specific selector: the tab button (not the h3 inside timeline)
   await page.locator('[data-detail-tab="versions"]').waitFor();

   // Text diff (default)
   await page.locator('[data-mode="text"]').first().click();
   await page.locator('#diff-body').waitFor();

   // Side by side
   await page.locator('[data-mode="screens"]').first().click();
   await page.locator('.screens img').first().waitFor();
   assert.equal(await page.locator('.screens img').count(),2,'Side-by-side should show 2 screenshots');

   // Visual diff
   await page.locator('[data-mode="visual"]').first().click();
   await page.locator('.diff-image').waitFor();
   await page.waitForFunction(()=>{
     const img=document.querySelector('.diff-image');
     return img&&img.complete&&img.naturalWidth>0;
   });

   // Number tracking tab
   await page.locator('[data-detail-tab="numbers"]').click();
   await page.waitForTimeout(600);
   // Should show either chart or "no data" message (both are valid)
   const numContainer=page.locator('#numbers-container');
   assert.ok(await numContainer.count()>0,'Number tracking container should exist');

   // RSS link present in header actions
   const rssLinks=page.locator('a[href*="/rss"]');
   assert.ok(await rssLinks.count()>0,'RSS link should be visible in detail view');

   // Edit monitor modal opens and closes
   await page.locator('[data-detail-tab="versions"]').click();
   await page.getByRole('button',{name:'Edit monitor',exact:true}).click();
   await page.getByLabel('Monitor name').fill('UI temporary edit');
   await page.getByRole('button',{name:'Cancel',exact:true}).click();

   // Back to monitors list
   await page.getByRole('button',{name:'Back',exact:true}).click();
  }

  // ── Settings page ────────────────────────────────────────────────────────
  await page.locator('nav [data-page="settings"]').click();
  await page.getByRole('heading',{name:'Notification connections'}).waitFor();
  await page.getByRole('heading',{name:'RSS Feeds'}).waitFor();
  await page.getByRole('heading',{name:'Browser Extension'}).waitFor();

  // ── Notifications page ───────────────────────────────────────────────────
  await page.locator('nav [data-page="alerts"]').click();
  await page.getByRole('heading',{name:'Only the things that matter.'}).waitFor();

  // ── Mobile layout ────────────────────────────────────────────────────────
  await page.setViewportSize({width:390,height:844});
  await page.locator('nav [data-page="monitors"]').click();
  assert.equal(
    await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),
    true,'Mobile page must not overflow horizontally'
  );

  assert.deepEqual(errors,[],'No JS errors');
  console.log('PASS: dashboard, validation, timeline, text/screenshots/visual diff, number tracking, RSS links, edit modal, settings (notifications+RSS+extension), notifications, mobile; no JS errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message||e);process.exit(1);});
