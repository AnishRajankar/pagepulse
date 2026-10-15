const {chromium} = require('playwright');
const {assertPublic} = require('./security');
let browser;
async function getBrowser() {
  if (!browser || !browser.isConnected()) browser = await chromium.launch({headless:true, args:['--disable-dev-shm-usage']});
  return browser;
}
async function capture(url, watches = [], picker = false) {
  await assertPublic(url);
  const b = await getBrowser();
  const context = await b.newContext({viewport:{width:1440,height:1000}, locale:'en-US', timezoneId:'UTC', serviceWorkers:'block', acceptDownloads:false, userAgent:'PagePulse/1.0 (public-page change monitor)'});
  const deadline = setTimeout(()=>context.close().catch(()=>{}),60000);
  let blocked = false;
  // Validate navigations, redirects, frames, and every subresource. Never reuse cookies.
  const checks = new Map();
  await context.route('**/*', async route => {
    const requestURL = route.request().url();
    try {
      const host = new URL(requestURL).hostname;
      if (!checks.has(host)) checks.set(host, assertPublic(requestURL));
      await checks.get(host);
      // Validate protocol/port even when hostname was previously checked.
      require('./security').canonicalURL(requestURL);
      if (['media','font'].includes(route.request().resourceType())) return route.abort();
      await route.continue();
    } catch { if(route.request().isNavigationRequest() && route.request().frame() === page.mainFrame()) blocked=true; await route.abort(); }
  });
  await context.routeWebSocket('**/*', socket=>socket.close());
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  try {
    const response = await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForTimeout(1600);
    if (blocked) throw new Error('BLOCKED: destination is not a public page.');
    if (!response || response.status() >= 400) throw new Error(`${[401,403,429].includes(response?.status())?'BLOCKED':'ERROR'}: HTTP ${response?.status() || 'no response'}`);
    const body = await page.locator('body').innerText({timeout:10000});
    if (/verify you are human|checking your browser|attention required!.*cloudflare|complete the captcha|access denied|just a moment\.\.\./i.test(body.slice(0,12000))) throw new Error('BLOCKED: CAPTCHA or access challenge; last good version retained.');
    const results=[];
    for (const w of watches) {
      try {
        const settings={watch:JSON.parse(w.watch_selectors),ignore:JSON.parse(w.ignore_selectors),noise:!!w.noise};
        const text=await page.evaluate(({watch,ignore,noise})=>{
          const clone=document.body.cloneNode(true);
          clone.querySelectorAll('script,style,noscript,svg').forEach(e=>e.remove());
          const auto=noise?['[role="timer"]','[data-ad]','[data-ad-slot]','[aria-roledescription="carousel"]','.advertisement','.ad-banner']:[];
          for(const s of [...ignore,...auto]) clone.querySelectorAll(s).forEach(e=>e.remove());
          const nodes=watch.length?watch.flatMap(s=>[...clone.querySelectorAll(s)]):[clone];
          if(!nodes.length) throw Error('Watch selector matched no elements.');
          // innerText on detached nodes is unreliable; preserve block boundaries explicitly.
          function textOf(n){if(n.nodeType===3)return n.textContent;if(n.nodeType!==1)return '';const content=[...n.childNodes].map(textOf).join('');return /^(DIV|P|H[1-6]|LI|TR|SECTION|ARTICLE|BR|HEADER|FOOTER|MAIN)$/.test(n.tagName)?'\n'+content+'\n':content+' ';}
          return nodes.map(textOf).join('\n').slice(0,500000);
        },settings);
        const hidden=[];
        for(const s of settings.ignore) hidden.push(page.locator(s));
        const screenshot=await page.screenshot({type:'png',animations:'disabled',mask:hidden,maskColor:'#e5e7eb'});
        results.push({watch:w,text,screenshot});
      } catch(e) {results.push({watch:w,error:e.message});}
    }
    if(picker){
      const boxes=await page.evaluate(()=>{
        const selector=e=>{if(e.id)return '#'+CSS.escape(e.id); const parts=[];for(let n=e;n&&n!==document.body;n=n.parentElement){const sib=[...n.parentElement.children].filter(x=>x.tagName===n.tagName);parts.unshift(n.tagName.toLowerCase()+`:nth-of-type(${sib.indexOf(n)+1})`);}return 'body '+parts.join(' > ');};
        return [...document.querySelectorAll('main,section,article,header,footer,nav,h1,h2,h3,p,button,a,table,div')].map(e=>{const r=e.getBoundingClientRect();return {selector:selector(e),x:r.x,y:r.y,width:r.width,height:r.height,label:e.innerText?.slice(0,70)||e.tagName};}).filter(r=>r.width>25&&r.height>12&&r.y>=0&&r.y+r.height<=1000&&r.x>=0&&r.x+r.width<=1440).slice(0,650);
      });
      return {screenshot:(await page.screenshot({animations:'disabled'})).toString('base64'),boxes};
    }
    return results;
  } finally { clearTimeout(deadline); await context.close(); }
}
async function closeBrowser(){if(browser)await browser.close();}
module.exports={capture,closeBrowser};
