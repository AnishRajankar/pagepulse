'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',activity:'M2 12h4l3-8 6 16 3-8h4',bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z',code:'m8 6-6 6 6 6 M16 6l6 6-6 6 M14 3l-4 18',plus:'M12 5v14 M5 12h14',search:'M21 21l-5-5 M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14',refresh:'M20 7V2l-3 3a8 8 0 1 0 3 10 M20 7h-5',clock:'M12 8v5l3 2 M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',pause:'M8 5v14 M16 5v14',play:'m8 5 11 7-11 7z',edit:'m15 4 5 5-11 11-6 1 1-6z M13 6l5 5',trash:'M3 6h18 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',arrow:'M5 12h14 M14 7l5 5-5 5',back:'M19 12H5 M10 7l-5 5 5 5',shield:'m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6z M8 12l3 3 5-6',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',check:'m5 12 4 4L19 6',external:'M14 3h7v7 M21 3 10 14 M10 3H3v18h18v-7',rss:'M4 11a9 9 0 0 1 9 9 M4 4a16 16 0 0 1 16 16 M5 19a1 1 0 1 1 0-2 1 1 0 0 1 0 2z',chart:'M3 3v18h18 M7 16l4-4 4 4 4-8',ai:'M12 2a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5 M4 20a8 8 0 0 1 16 0',puzzle:'M20.5 9.5c.28-.28.28-.74 0-1.03l-5-5a.73.73 0 0 0-1.03 0L13 4.94A2.5 2.5 0 0 0 9.5 8.5L4 14l2 2 1.41-1.41A2.5 2.5 0 0 0 11 17.5l-1.5 1.5 2 2 5.5-5.5a2.5 2.5 0 0 0 3.56-3.56L22 10.5l-1.5-1z'};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(paths[n]||paths.grid).split(' M').map((p,i)=>`<path d="${i?'M':''}${p}"/>`).join('')}</svg>`;
const state={page:'monitors',watches:[],stats:{},activity:[],config:{channels:{}},filter:'all',query:'',watch:null,versions:[],mode:'text',before:null,after:null};
async function api(url, options={}) {const r=await fetch(url,{...options,headers:{'Content-Type':'application/json',...options.headers}});let data;try{data=await r.json();}catch{throw Error(`Request failed (${r.status})`);}if(!r.ok)throw Error(data.error||'Request failed.');return data;}
const post=(url,body={})=>api(url,{method:'POST',body:JSON.stringify(body)});
let toastTimer;function toast(message,type=''){const el=$('#toast');el.textContent=message;el.className='show'+(type?' '+type:'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.className='',4500);}
function ago(t){if(!t)return 'Not yet';let n=Math.max(0,Date.now()-t);return n<60000?'Just now':n<3600000?`${Math.floor(n/60000)} min ago`:n<86400000?`${Math.floor(n/3600000)} hr ago`:`${Math.floor(n/86400000)} days ago`;}
const date=t=>new Date(t).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
const interval=n=>n<60?`${n} min`:n===1440?'24 hours':`${+(n/60).toFixed(1)} hour${n===60?'':'s'}`;
function badge(w){const s=w.paused?'paused':w.status;return `<span class="badge ${esc(s)}"><span class="status-dot"></span>${esc({ok:'Up to date',pending:'Awaiting check',paused:'Paused',blocked:'Blocked',error:'Check failed',noisy:'Noisy page'}[s]||s)}</span>`;}
function heading(title,sub,actions=''){return `<div class="page-heading"><div><div class="eyebrow">A LITTLE LESS CHECKING. A LOT MORE KNOWING.</div><h1>${title}</h1><p class="subtitle">${sub}</p></div><div class="heading-actions">${actions}</div></div>`;}
async function refresh(render=true){const [data,activity,config]=await Promise.all([api('/api/watches'),api('/api/activity'),api('/api/config')]);Object.assign(state,data,{activity,config});$('#nav-count').textContent=state.watches.length;if(render)renderPage();}
function nav(page){state.page=page;state.watch=null;history.replaceState({},'',location.pathname);$$('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('#crumb').textContent={monitors:'Monitors',activity:'Change activity',alerts:'Notifications',settings:'Settings'}[page];renderPage();}
function renderPage(){if(state.watch)return;({monitors:renderMonitors,activity:renderActivity,alerts:renderAlerts,settings:renderSettings}[state.page]||renderMonitors)();}
function renderMonitors(){
  const s=state.stats;
  $('#main').innerHTML=heading('Your eyes on the web.','Watch what matters. We\'ll let you know when something changes.',
    `<a class="btn" href="/api/rss" target="_blank" rel="noreferrer" title="Global RSS feed">${icon('rss')}RSS</a><button class="btn" id="btn-refresh" data-action="refresh">${icon('refresh')}Refresh</button><button class="btn primary" id="btn-add" data-action="add">${icon('plus')}New monitor</button>`)+
  `<div class="stats">${[['Total monitors',s.total||0,'Across your workspace','grid'],['Live monitors',s.active||0,'Public pages, automatically checked','eye'],['Changes today',s.changes||0,'Content changes in the last 24 hours','activity'],['Needs attention',s.issues||0,'Errors, blocks & noisy pages','shield']].map(([label,value,foot,i])=>`<div class="stat"><div class="stat-label">${label}${icon(i)}</div><div class="stat-number">${value.toString().padStart(2,'0')}</div><div class="stat-foot">${foot}</div></div>`).join('')}</div>
  <section class="panel"><div class="table-toolbar"><div class="tabs">${[['all','All monitors'],['active','Active'],['attention','Needs attention'],['paused','Paused']].map(([v,l])=>`<button class="tab ${state.filter===v?'active':''}" data-filter="${v}">${l}${v==='all'?`<span class="tab-count">${s.total||0}</span>`:''}</button>`).join('')}</div><div class="toolbar-right"><label class="search">${icon('search')}<input id="search" type="search" placeholder="Find a monitor…" value="${esc(state.query)}" aria-label="Find a monitor"><kbd>/</kbd></label></div></div>
  <div class="table-scroll"><table><thead><tr><th>MONITOR</th><th>STATUS</th><th>LAST CHECKED</th><th class="hide-small">LAST CHANGED</th><th class="hide-medium">INTERVAL</th><th></th></tr></thead><tbody id="monitor-rows"></tbody></table></div>
  <div class="table-footer"><span id="row-count"></span><span>${s.queued||0} checks queued <span class="muted">·</span> Auto-refreshes every 15s</span></div></section>
  <div class="bottom-grid"><section><div class="section-heading"><h2>Recent changes</h2><button class="text-link" data-page="activity">View activity →</button></div><div class="panel activity-card">${activityRows(state.activity.slice(0,3))}</div></section>
  <section><div class="section-heading"><h2>Thoughtfully quiet</h2><span class="muted">✳</span></div><div class="insight-card"><div class="insight-tag">${icon('shield')} BUILT TO FIND THE SIGNAL</div><h3>The important changes.<br>Not the busywork.</h3><p>Timestamps, ads, and rotating noise? Filtered. The things you care about? Front and center.</p><button class="text-link" data-page="settings">Explore noise filtering →</button><div class="orbit"></div></div></section></div>`;
  renderRows();
}
function renderRows(){
  const list=state.watches.filter(w=>(!state.query||`${w.name} ${w.url}`.toLowerCase().includes(state.query.toLowerCase()))&&(state.filter==='all'||state.filter==='active'&&!w.paused||state.filter==='paused'&&w.paused||state.filter==='attention'&&['error','blocked','noisy'].includes(w.status)));
  $('#monitor-rows').innerHTML=list.map((w,i)=>`<tr>
    <td><div class="monitor-cell"><div class="site-icon c${i%4}">${esc(w.name[0].toUpperCase())}</div><div>
      <button class="monitor-name" data-action="detail" data-id="${w.id}">${esc(w.name)}</button>${w.demo?'<span class="sample-label">SAMPLE</span>':''}
      <div class="monitor-url">${esc(w.url.replace(/^https?:\/\//,''))}</div></div></div></td>
    <td title="${esc(w.error||'')}">${badge(w)}</td>
    <td class="time-cell">${ago(w.last_checked)}<small>${w.demo?'Sample data':w.last_checked?'Browser check':'First check queued'}</small></td>
    <td class="time-cell hide-small">${ago(w.last_changed)}<small>${w.versions} version${w.versions===1?'':'s'} saved</small></td>
    <td class="hide-medium"><span class="interval">${icon('clock')}${interval(w.interval_min)}</span></td>
    <td><div class="row-actions">
      <button type="button" title="Check now" aria-label="Check ${esc(w.name)} now" data-action="check" data-id="${w.id}">${icon('refresh')}</button>
      <button type="button" title="${w.paused?'Resume':'Pause'}" aria-label="${w.paused?'Resume':'Pause'} ${esc(w.name)}" data-action="pause" data-id="${w.id}">${icon(w.paused?'play':'pause')}</button>
      <button type="button" title="Edit monitor" aria-label="Edit ${esc(w.name)}" data-action="edit" data-id="${w.id}">${icon('edit')}</button>
    </div></td></tr>`).join('')||`<tr><td colspan="6"><div class="empty"><h2>${state.watches.length?'No matching monitors':'A quieter way to keep up.'}</h2><p>${state.watches.length?'Try another search or filter.':'Add a public page and we\'ll keep an eye on it for you.'}</p><button class="btn primary" data-action="add">${icon('plus')}Create a monitor</button></div></td></tr>`;
  $('#row-count').textContent=`Showing ${list.length} of ${state.watches.length} monitors`;
}
function activityRows(rows){
  return rows.map(a=>`<div class="activity-row" data-action="detail" data-id="${a.watch_id}" role="button" tabindex="0">
    <span class="activity-icon">${icon('activity')}</span>
    <div class="activity-content"><strong>${esc(a.name)} ${a.demo?'<span class="sample-label">SAMPLE</span>':''}</strong>
    <p title="${esc(a.summary)}">${esc(a.smart_summary||a.summary)}</p></div>
    <time>${ago(a.created_at)}</time></div>`).join('')||'<div class="empty">Your first change will appear here.</div>';
}
function renderActivity(){$('#main').innerHTML=heading('The web doesn\'t stand still.','A running record of the changes your monitors have noticed.')+`<section class="panel activity-full">${activityRows(state.activity)}</section>`;}
async function renderAlerts(){
  $('#main').innerHTML=heading('Only the things that matter.','Delivery status for your email, Discord, and Telegram notifications.')+'<div class="panel loading">Loading notifications…</div>';
  try{
    const rows=await api('/api/alerts');
    if(state.page!=='alerts')return;
    $('#main').innerHTML=heading('Only the things that matter.','Delivery status for your email, Discord, and Telegram notifications.',
      `<button class="btn" data-page="settings">${icon('settings')}Configure channels</button>`)+
    `<section class="panel table-scroll"><table><thead><tr><th>MONITOR</th><th>CHANNEL</th><th>STATUS</th><th>ATTEMPTS</th><th>DETAIL</th></tr></thead><tbody>
    ${rows.map(a=>`<tr><td>${esc(a.name)}</td><td>${esc(a.channel)}</td><td><span class="badge ${a.state==='sent'?'ok':a.state==='failed'?'error':'pending'}">${esc(a.state)}</span></td><td>${a.attempts}</td><td>${esc(a.error||(a.sent_at?date(a.sent_at):'Awaiting delivery / daily digest'))}</td></tr>`).join('')||
    '<tr><td colspan="5"><div class="empty"><h2>Quiet for now.</h2><p>Configure a channel in your .env file, then enable it on a monitor.<br>Initial baselines do not send alerts.</p></div></td></tr>'}
    </tbody></table></section>`;
  }catch(e){toast(e.message);}
}
function renderSettings(){
  const base=(window.location.origin).replace(/\/$/,'');
  $('#main').innerHTML=heading('Make yourself at home.','Your monitoring defaults, notification connections, and privacy at a glance.')+
  `<section class="panel settings-card"><h2>Notification connections</h2><p>Credentials stay on the server in your <span class="code">.env</span> file. Restart the app after changing them.</p>
  ${[['email','Email','SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, MAIL_TO'],['discord','Discord','DISCORD_WEBHOOK_URL'],['telegram','Telegram','TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID']].map(([k,n,vars])=>`<div class="integration"><div><h3>${n}</h3><p>${vars}</p></div><span class="badge ${state.config.channels[k]?'ok':'pending'}">${state.config.channels[k]?'Configured':'Not configured'}</span></div>`).join('')}
  <p>Daily digests send after <span class="code">DIGEST_HOUR_UTC</span> (default: 08:00 UTC). Immediate notifications are limited to one per monitor per hour. Repeatedly changing pages are marked noisy after 3 consecutive changes; alerts resume after an unchanged check.</p></section>
  <section class="panel settings-card"><h2>RSS Feeds</h2><p>Subscribe to change alerts in any RSS reader. Each monitor has its own feed.</p>
  <div class="integration"><div><h3>Global feed</h3><p>All monitors combined</p></div><a class="btn" href="/api/rss" target="_blank" rel="noreferrer">${icon('rss')} Subscribe</a></div>
  <p class="hint">Per-monitor feeds are accessible from the monitor detail page.</p></section>
  <section class="panel settings-card"><h2>Browser Extension</h2><p>Install the PagePulse browser extension to add page monitors directly from any tab.</p>
  <div class="integration"><div><h3>Chrome / Edge / Brave</h3><p>Load the <span class="code">extension/</span> folder as an unpacked extension in developer mode.</p></div><a class="btn" href="https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked" target="_blank" rel="noreferrer">${icon('external')} How to install</a></div></section>
  <section class="panel settings-card"><h2>Noise filtering, without surprises.</h2><p>Enable smart filtering per monitor to normalize timestamps, counters, and random tokens, and ignore common ad and carousel regions. Prices and ordinary numbers remain meaningful. Use CSS selectors or the visual picker to narrow the page further.</p><p><strong>High:</strong> any normalized text change. <strong>Balanced:</strong> at least 0.5% changed text. <strong>Low:</strong> at least 3%. These thresholds compare against the last stored version, so small changes can accumulate.</p><p>Visual diffs explain text-triggered versions; visual-only changes do not trigger new snapshots in this MVP. Screenshots capture the first 1440 × 1000 pixels.</p></section>
  <section class="panel settings-card"><h2>Public pages. Private workspace.</h2><p>No stored website logins, cookies, or credentials. Private and reserved addresses are blocked. Checks share one fetch for a URL and observe a 60-second per-host cooldown by default.</p><div class="tip">${state.config.authEnabled?'Workspace authentication is enabled.':'Local single-user mode. Set APP_PASSWORD and use HTTPS before making this app publicly accessible.'} This is a single-process MVP, not a hosted multi-user service.</div></section>`;
}
function closeModal(){$('#modal-root').innerHTML='';}
function openForm(id){
  const w=id?state.watches.find(w=>w.id===+id):null;
  const values=w||{name:'',url:'',interval_min:60,sensitivity:'balanced',noise:1,watch_selectors:'[]',ignore_selectors:'[]',keywords:'',channels:'[]',digest:0};
  const channels=JSON.parse(values.channels);
  $('#modal-root').innerHTML=`<div class="overlay"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="form-title">
  <div class="modal-head"><div><h2 id="form-title">${w?'Fine-tune your monitor':'Keep an eye on something.'}</h2><p>${w?'Adjust what matters and how often to check.':'A public URL. A little context. We\'ll take it from here.'}</p></div><button type="button" class="close" data-action="close" aria-label="Close">×</button></div>
  <form id="monitor-form" data-id="${w?.id||''}"><div class="form-body">
    <div class="field"><label for="f-name">Monitor name</label><input id="f-name" name="name" placeholder="e.g. Linear pricing" maxlength="100" required value="${esc(values.name)}"></div>
    <div class="field"><label for="f-url">Public page URL</label><input id="f-url" name="url" type="url" placeholder="https://example.com/pricing" required value="${esc(values.url)}" ${w?'readonly':''}><small>Public pages only. No logins or stored credentials.</small></div>
    <div class="form-grid">
      <div class="field"><label for="f-interval">Check every</label><select id="f-interval" name="interval_min">${[15,30,60,180,360,720,1440].map(n=>`<option value="${n}" ${values.interval_min===n?'selected':''}>${interval(n)}</option>`).join('')}${![15,30,60,180,360,720,1440].includes(values.interval_min)?`<option selected value="${values.interval_min}">${interval(values.interval_min)}</option>`:''}</select></div>
      <div class="field"><label for="f-sensitivity">Change sensitivity</label><select id="f-sensitivity" name="sensitivity">${['high','balanced','low'].map(s=>`<option ${s===values.sensitivity?'selected':''} value="${s}">${s[0].toUpperCase()+s.slice(1)}${s==='balanced'?' · recommended':''}</option>`).join('')}</select></div>
    </div>
    <div class="form-section"><h3>Choose your signal</h3>
      <div class="field"><label for="f-watch">Regions to watch · CSS selectors, one per line</label><textarea id="f-watch" name="watch_selectors" placeholder="Leave blank to watch the whole page">${esc(JSON.parse(values.watch_selectors).join('\n'))}</textarea></div>
      <div class="field"><label for="f-ignore">Regions to ignore · CSS selectors, one per line</label><textarea id="f-ignore" name="ignore_selectors" placeholder=".advertisement&#10;.rotating-banner">${esc(JSON.parse(values.ignore_selectors).join('\n'))}</textarea></div>
      <button class="btn" type="button" id="btn-picker" data-action="picker">${icon('eye')}Select regions visually</button>
      <div class="field"><label class="check-label"><input name="noise" type="checkbox" ${values.noise?'checked':''}>Filter timestamps, counters, ads, and random tokens</label></div>
    </div>
    <div class="form-section"><h3>Send a heads-up</h3>
      <div class="channel-row">${['email','discord','telegram'].map(c=>`<label title="${state.config.channels[c]?'Configured':'Configure this channel in .env first'}"><input type="checkbox" name="channels" value="${c}" ${channels.includes(c)?'checked':''} ${state.config.channels[c]?'':'disabled'}>${c[0].toUpperCase()+c.slice(1)}</label>`).join('')}</div>
      <div class="field"><label class="check-label"><input type="checkbox" name="digest" ${values.digest?'checked':''}>Bundle notifications into a daily digest</label></div>
      <div class="field"><label for="f-keywords">Only alert for these keywords · optional</label><input id="f-keywords" name="keywords" placeholder="price, available, release" value="${esc(values.keywords)}"><small>Comma-separated. Alerts match words in the change summary.</small></div>
    </div>
    <div id="form-error" class="error-text" role="alert"></div>
    <div class="tip">Failures and CAPTCHA challenges are never saved as content changes. Your last good version stays safe.</div>
  </div>
  <div class="modal-foot">${w?`<button type="button" class="btn danger" data-action="delete" data-id="${w.id}">${icon('trash')}Delete</button>`:''}
    <button type="button" class="btn" data-action="close">Cancel</button>
    <button type="submit" class="btn primary">${w?'Save changes':'Create monitor'}${icon('arrow')}</button>
  </div></form></section></div>`;
  $('#f-name').focus();
}
async function saveForm(form){
  const submit=form.querySelector('[type="submit"]');submit.disabled=true;$('#form-error').textContent='';
  const fd=new FormData(form);
  const body={name:fd.get('name'),url:fd.get('url'),interval_min:+fd.get('interval_min'),sensitivity:fd.get('sensitivity'),watch_selectors:fd.get('watch_selectors').split('\n').map(s=>s.trim()).filter(Boolean),ignore_selectors:fd.get('ignore_selectors').split('\n').map(s=>s.trim()).filter(Boolean),noise:fd.has('noise'),channels:fd.getAll('channels'),keywords:fd.get('keywords'),digest:fd.has('digest')};
  try{
    await api(form.dataset.id?`/api/watches/${form.dataset.id}`:'/api/watches',{method:form.dataset.id?'PUT':'POST',body:JSON.stringify(body)});
    closeModal();state.watch=null;await refresh();toast(form.dataset.id?'Monitor updated.':'Monitor created. First check is queued.');
  }catch(e){$('#form-error').textContent=e.message;submit.disabled=false;}
}

// ── Number tracking chart ──────────────────────────────────────────────────
function renderChart(canvas, series) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PAD = {top:18,right:20,bottom:36,left:52};
  const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;
  ctx.clearRect(0, 0, W, H);
  if (!series || !series.points || series.points.length < 1) {
    ctx.fillStyle = '#9ba48f';ctx.font = '12px Inter, sans-serif';ctx.textAlign = 'center';
    ctx.fillText('No data yet — numbers will appear after a check.', W/2, H/2);return;
  }
  const pts = series.points;
  const minV = Math.min(...pts.map(p=>p.value));
  const maxV = Math.max(...pts.map(p=>p.value));
  const range = maxV - minV || 1;
  const minT = pts[0].created_at, maxT = pts[pts.length-1].created_at || minT+1;
  const xOf = t => PAD.left + (t - minT) / (maxT - minT || 1) * cW;
  const yOf = v => PAD.top + cH - (v - minV) / range * cH;
  // Grid
  ctx.strokeStyle = '#e6e9e4'; ctx.lineWidth = 1;
  for (let i=0;i<=4;i++){
    const y = PAD.top + cH * i / 4;
    ctx.beginPath();ctx.moveTo(PAD.left, y);ctx.lineTo(PAD.left+cW, y);ctx.stroke();
    const val = maxV - range * i/4;
    ctx.fillStyle='#9ba48f';ctx.font='10px Inter,sans-serif';ctx.textAlign='right';
    ctx.fillText(val.toFixed(val%1?1:0), PAD.left-6, y+4);
  }
  // Area fill
  const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top+cH);
  grad.addColorStop(0,'rgba(39,114,88,0.18)');grad.addColorStop(1,'rgba(39,114,88,0.01)');
  ctx.beginPath();ctx.moveTo(xOf(pts[0].created_at), PAD.top+cH);
  for (const p of pts) ctx.lineTo(xOf(p.created_at), yOf(p.value));
  ctx.lineTo(xOf(pts[pts.length-1].created_at), PAD.top+cH);
  ctx.closePath();ctx.fillStyle=grad;ctx.fill();
  // Line
  ctx.beginPath();ctx.strokeStyle='#277258';ctx.lineWidth=2;ctx.lineJoin='round';
  for (let i=0;i<pts.length;i++){
    if(i===0)ctx.moveTo(xOf(pts[i].created_at),yOf(pts[i].value));
    else ctx.lineTo(xOf(pts[i].created_at),yOf(pts[i].value));
  }
  ctx.stroke();
  // Dots
  for (const p of pts){
    ctx.beginPath();ctx.arc(xOf(p.created_at),yOf(p.value),4,0,Math.PI*2);
    ctx.fillStyle='#277258';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
  }
  // X-axis labels
  ctx.fillStyle='#9ba48f';ctx.font='9px Inter,sans-serif';ctx.textAlign='center';
  const step = Math.max(1, Math.floor(pts.length/4));
  for (let i=0;i<pts.length;i+=step){
    const p=pts[i], x=xOf(p.created_at);
    const d=new Date(p.created_at);
    ctx.fillText(`${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`, x, PAD.top+cH+20);
  }
}

async function renderNumbersTab(watchId, container) {
  container.innerHTML = '<div class="loading">Loading number tracking…</div>';
  try {
    const series = await api(`/api/watches/${watchId}/numbers`);
    if (!series.length) {
      container.innerHTML = '<div class="empty"><h2>No numbers tracked yet.</h2><p>Numbers like prices and counts will appear here after a check.</p></div>';
      return;
    }
    let activeSeries = series[0];
    const tabs = series.map((s,i)=>`<button class="tab ${i===0?'active':''}" data-chartlabel="${esc(s.label)}">${esc(s.label)}</button>`).join('');
    container.innerHTML = `<div class="chart-section">
      <div class="chart-tabs">${tabs}</div>
      <div class="chart-wrap"><canvas id="number-chart" width="700" height="240"></canvas></div>
      <div class="chart-meta" id="chart-meta"></div>
    </div>`;
    function drawActive(){
      const canvas = $('#number-chart');if(!canvas)return;
      renderChart(canvas, activeSeries);
      const meta = $('#chart-meta');if(!meta)return;
      const pts = activeSeries.points;
      if(pts.length > 1){
        const first = pts[0].value, last = pts[pts.length-1].value;
        const diff = last - first, pct = ((diff/Math.abs(first||1))*100).toFixed(1);
        meta.innerHTML = `<span class="${diff>0?'green':diff<0?'orange':'muted'}">${diff>0?'▲':'▼'} ${Math.abs(diff).toFixed(2)} (${pct}%)</span> since first capture &nbsp;·&nbsp; Latest: <strong>${last}</strong> &nbsp;·&nbsp; ${pts.length} data points`;
      } else {
        meta.innerHTML = `Latest: <strong>${pts[0]?.value??'–'}</strong> · ${pts.length} data point${pts.length===1?'':'s'}`;
      }
    }
    drawActive();
    container.addEventListener('click', e=>{
      const tab = e.target.closest('[data-chartlabel]');
      if(!tab)return;
      $$('[data-chartlabel]').forEach(t=>t.classList.toggle('active',t===tab));
      activeSeries = series.find(s=>s.label===tab.dataset.chartlabel)||series[0];
      drawActive();
    });
  } catch(e){ container.innerHTML=`<div class="empty"><p>${esc(e.message)}</p></div>`; }
}

async function detail(id){
  state.watch=state.watches.find(w=>w.id===+id);
  if(!state.watch){toast('Monitor not found.');return;}
  const w=state.watch;
  const requestedVersion=new URLSearchParams(location.search).get('version');
  history.replaceState({},'',`?watch=${w.id}${requestedVersion?'&version='+encodeURIComponent(requestedVersion):''}`);
  $('#crumb').textContent=w.name;
  $('#main').innerHTML='<div class="loading">Opening your version history…</div>';
  try{
    state.versions=await api(`/api/watches/${w.id}/versions`);
    if(!state.watch||state.watch.id!==w.id)return;
    const versions=state.versions;
    const wanted=new URLSearchParams(location.search).get('version');
    state.after=versions.find(v=>v.id===+wanted)?.id||versions[0]?.id;
    state.before=versions[1]?.id||versions[0]?.id;
    state.mode='text';
    const rssUrl=`/api/watches/${w.id}/rss`;
    $('#main').innerHTML=`<div class="detail-top">
      <button type="button" class="icon-btn" data-page="monitors" aria-label="Back">${icon('back')}</button>
      <span class="eyebrow">MONITOR DETAILS ${w.demo?'· SAMPLE DATA':''}</span>
    </div>
    ${heading(esc(w.name),`<a href="${esc(w.url)}" target="_blank" rel="noreferrer">${esc(w.url)} ↗</a>`,
      `<a class="btn" href="${esc(rssUrl)}" target="_blank" rel="noreferrer" title="RSS feed for this monitor">${icon('rss')}RSS</a>
       <button type="button" class="btn" data-action="edit" data-id="${w.id}">${icon('edit')}Edit monitor</button>
       <button type="button" class="btn primary" data-action="check" data-id="${w.id}">${icon('refresh')}Check now</button>`)}
    <div class="detail-meta">${badge(w)}<span class="hint">Every ${interval(w.interval_min)} · ${versions.length} saved versions · ${esc(w.sensitivity)} sensitivity</span></div>
    ${w.error?`<div class="error-text">${esc(w.error)}</div>`:''}
    ${w.status==='noisy'?'<div class="tip">This page changes on every check. Alerts are temporarily suppressed until the page stabilizes. Try ignoring dynamic regions or lowering sensitivity.</div><br>':''}
    ${versions.length?`
    <div class="diff-tabs detail-section-tabs">
      ${[['versions','Version timeline'],['numbers','Number tracking'],].map(([m,l])=>`<button type="button" class="tab ${m==='versions'?'active':''}" data-detail-tab="${m}">${m==='numbers'?icon('chart'):''}${l}</button>`).join('')}
    </div>
    <div id="detail-tab-content">
    <div class="detail-layout" id="tab-versions">
      <aside class="panel timeline"><h3>Version timeline</h3>
        ${versions.map(v=>`<div class="version-item ${v.id===state.after?'active':''}" data-action="version" data-id="${v.id}" role="button" tabindex="0">
          <time>${date(v.created_at)}</time>
          <p title="${esc(v.summary)}">${esc((v.smart_summary||v.summary).slice(0,100))}</p>
          <strong>${v.change_pct?`${v.change_pct.toFixed(1)}% changed`:'Baseline'}</strong>
        </div>`).join('')}
      </aside>
      <section class="panel comparison">
        <div class="comparison-toolbar">
          <span class="hint">Compare</span>
          <select id="before-version" aria-label="Before version">${versionOptions(state.before)}</select>
          <span class="muted">→</span>
          <select id="after-version" aria-label="After version">${versionOptions(state.after)}</select>
        </div>
        <div class="diff-tabs">${[['text','Text diff'],['screens','Side by side'],['visual','Visual diff']].map(([m,l])=>`<button type="button" class="tab ${state.mode===m?'active':''}" data-mode="${m}">${l}</button>`).join('')}</div>
        <div class="comparison-note" id="comparison-summary"></div>
        <div class="diff-body" id="diff-body"></div>
      </section>
    </div>
    <div id="tab-numbers" hidden><div id="numbers-container" class="panel" style="padding:20px;min-height:200px"></div></div>
    </div>`:'<div class="panel empty"><h2>Your first version is on its way.</h2><p>The first successful browser check creates a baseline.<br>Subsequent content changes appear here.</p><button type="button" class="btn" data-action="reload-detail">Refresh history</button></div>'}`;
    if(versions.length){
      await loadComparison();
      // Wire detail tab switching
      $$('[data-detail-tab]').forEach(btn=>{
        btn.addEventListener('click',async()=>{
          $$('[data-detail-tab]').forEach(b=>b.classList.toggle('active',b===btn));
          const tab=btn.dataset.detailTab;
          const vTab=$('#tab-versions'),nTab=$('#tab-numbers');
          if(tab==='versions'){vTab.removeAttribute('hidden');nTab.setAttribute('hidden','');}
          else{vTab.setAttribute('hidden','');nTab.removeAttribute('hidden');
            await renderNumbersTab(w.id,$('#numbers-container'));
          }
        });
      });
    }
  }catch(e){toast(e.message);}
}
function versionOptions(selected){return state.versions.map(v=>`<option value="${v.id}" ${v.id===selected?'selected':''}>${esc(date(v.created_at))}</option>`).join('');}
async function loadComparison(){
  if(!$('#diff-body'))return;
  $('#diff-body').innerHTML='<div class="loading">Comparing versions…</div>';
  try{
    const d=await api(`/api/compare?before=${state.before}&after=${state.after}`);
    if(!$('#diff-body'))return;
    state.comparison=d;
    const summaryEl=$('#comparison-summary');
    if(summaryEl) summaryEl.innerHTML=state.before===state.after?
      'Baseline view · Select two different versions to see a change.':
      `<span>${d.pct.toFixed(1)}% text changed</span> <span class="ai-badge">${icon('ai')} AI summary</span> <em>${esc(d.after?.smart_summary||d.summary)}</em>`;
    renderDiff();
  }catch(e){if($('#diff-body'))$('#diff-body').textContent=e.message;}
}
function renderDiff(){
  const d=state.comparison;if(!d||!$('#diff-body'))return;
  $$('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));
  $('#diff-body').innerHTML=state.mode==='text'?
    `<div class="diff-text">${d.parts.map(p=>p.added?`<ins>${esc(p.value)}</ins>`:p.removed?`<del>${esc(p.value)}</del>`:esc(p.value)).join('')}</div>`:
    state.mode==='screens'?
    `<div class="screens"><div><h3>BEFORE · ${esc(date(d.before.created_at))}</h3><a href="/screenshots/${encodeURIComponent(d.before.screenshot)}" target="_blank"><img alt="Previous page screenshot" src="/screenshots/${encodeURIComponent(d.before.screenshot)}"></a></div><div><h3>AFTER · ${esc(date(d.after.created_at))}</h3><a href="/screenshots/${encodeURIComponent(d.after.screenshot)}" target="_blank"><img alt="New page screenshot" src="/screenshots/${encodeURIComponent(d.after.screenshot)}"></a></div></div>`:
    `<p class="hint">Orange pixels highlight visual differences. Screenshots may include dynamic regions not involved in the text trigger.</p><img class="diff-image" alt="Highlighted screenshot differences" src="/api/visual-diff?before=${state.before}&after=${state.after}">`;
}
let pickerData=null,pickerForm=null,pickerChoice=null;
async function openPicker(button){
  const url=$('#f-url')?.value;
  if(!url){$('#form-error').textContent='Enter a public page URL first.';return;}
  button.disabled=true;button.textContent='Rendering page…';
  try{
    pickerData=await post('/api/picker',{url});
    pickerForm=$('#monitor-form');
    const modal=$('#modal-root').firstElementChild;modal.hidden=true;
    const holder=document.createElement('div');
    holder.id='picker-overlay';holder.className='overlay';
    holder.innerHTML=`<section class="modal picker-modal" role="dialog" aria-modal="true" aria-label="Visual region picker">
      <div class="modal-head"><div><h2>Point to what matters.</h2><p>Click a region to save its CSS selector. First viewport only.</p></div><button type="button" class="close" data-action="picker-close" aria-label="Close picker">×</button></div>
      <div class="picker-tools"><label><input type="radio" name="picker-mode" value="watch" checked> Watch region</label><label><input type="radio" name="picker-mode" value="ignore"> Ignore region</label><span id="picker-selector" class="hint">Hover over the page</span></div>
      <div class="picker-tools" id="picker-chips"></div>
      <div class="picker-surface" id="picker-surface"><img src="data:image/png;base64,${pickerData.screenshot}" alt="Page preview — click a region to select"><div class="picker-highlight" id="picker-highlight"></div></div>
      <div class="modal-foot"><button type="button" class="btn primary" data-action="picker-close">Done selecting</button></div>
    </section>`;
    $('#modal-root').appendChild(holder);
    renderChips();
    const surface=$('#picker-surface');
    surface.addEventListener('mousemove',e=>{
      const r=surface.getBoundingClientRect(),x=(e.clientX-r.left)*1440/r.width,y=(e.clientY-r.top)*1440/r.width;
      const matches=pickerData.boxes.filter(b=>x>=b.x&&x<=b.x+b.width&&y>=b.y&&y<=b.y+b.height).sort((a,b)=>a.width*a.height-b.width*b.height);
      pickerChoice=matches[0];
      const high=$('#picker-highlight');
      if(!pickerChoice){high.style.display='none';return;}
      const b=pickerChoice;
      Object.assign(high.style,{display:'block',left:`${b.x/14.4}%`,top:`${b.y/10}%`,width:`${b.width/14.4}%`,height:`${b.height/10}%`});
      $('#picker-selector').textContent=b.selector;
    });
    surface.addEventListener('click',()=>{
      if(!pickerChoice)return;
      const mode=document.querySelector('[name="picker-mode"]:checked').value;
      const field=pickerForm.querySelector(`[name="${mode==='watch'?'watch':'ignore'}_selectors"]`);
      const selectors=field.value.split('\n').filter(Boolean);
      if(!selectors.includes(pickerChoice.selector))selectors.push(pickerChoice.selector);
      field.value=selectors.join('\n');renderChips();
    });
  }catch(e){if($('#form-error'))$('#form-error').textContent=e.message;}
  finally{button.disabled=false;button.innerHTML=icon('eye')+'Select regions visually';}
}
function renderChips(){
  const chips=$('#picker-chips');if(!chips)return;
  chips.innerHTML=['watch','ignore'].map(mode=>pickerForm.querySelector(`[name="${mode}_selectors"]`).value.split('\n').filter(Boolean).map(s=>`<span class="selector-chip ${mode==='ignore'?'ignore':''}">${mode}: ${esc(s)}</span>`).join('')).join('')||'<span class="hint">No regions selected yet. You can remove selectors in the form afterward.</span>';
}
function closePicker(){$('#picker-overlay')?.remove();const overlay=$('#modal-root > .overlay');if(overlay)overlay.hidden=false;}

// ── Unified event delegation ───────────────────────────────────────────────
document.addEventListener('click',async e=>{
  // nav items
  const page=e.target.closest('[data-page]');
  if(page){nav(page.dataset.page);return;}
  // filter tabs
  const filter=e.target.closest('[data-filter]');
  if(filter){state.filter=filter.dataset.filter;renderMonitors();return;}
  // diff mode tabs
  const mode=e.target.closest('[data-mode]');
  if(mode){state.mode=mode.dataset.mode;renderDiff();return;}
  // action buttons
  const b=e.target.closest('[data-action]');
  if(!b)return;
  const {action,id}=b.dataset;
  try{
    switch(action){
      case 'add':openForm();break;
      case 'edit':openForm(id);break;
      case 'close':closeModal();break;
      case 'refresh':await refresh();toast('Dashboard refreshed.');break;
      case 'detail':await detail(id);break;
      case 'reload-detail':await detail(state.watch.id);break;
      case 'check':
        await post(`/api/watches/${id}/check`);
        toast('Check queued. Host cooldowns still apply.');
        await refresh(!state.watch);
        break;
      case 'pause':
        await post(`/api/watches/${id}/pause`);
        await refresh();
        toast('Monitor updated.');
        break;
      case 'delete':
        if(confirm('Delete this monitor and all its saved versions?')){
          await api(`/api/watches/${id}`,{method:'DELETE'});
          closeModal();state.watch=null;await refresh();toast('Monitor deleted.');
        }
        break;
      case 'version':
        state.after=+id;
        const av=$('#after-version');if(av)av.value=id;
        $$('.version-item').forEach(v=>v.classList.toggle('active',v.dataset.id===id));
        await loadComparison();
        break;
      case 'picker':await openPicker(b);break;
      case 'picker-close':closePicker();break;
    }
  }catch(err){toast(err.message);}
});
// keyboard activation for role=button divs
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'||e.key===' '){
    const b=e.target.closest('[data-action],[data-page],[data-filter],[data-mode]');
    if(b&&b.tagName!=='BUTTON'&&b.tagName!=='A'){e.preventDefault();b.click();}
  }
  if(e.key==='Escape'){if($('#picker-overlay'))closePicker();else closeModal();}
  if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();$('#search')?.focus();}
});
document.addEventListener('submit',e=>{if(e.target.id==='monitor-form'){e.preventDefault();saveForm(e.target);}});
document.addEventListener('input',e=>{if(e.target.id==='search'){state.query=e.target.value;renderRows();}});
document.addEventListener('change',e=>{
  if(e.target.id==='before-version'){state.before=+e.target.value;loadComparison();}
  if(e.target.id==='after-version'){state.after=+e.target.value;loadComparison();}
});
$$('[data-icon]').forEach(e=>e.innerHTML=icon(e.dataset.icon));
(async()=>{
  try{
    await refresh();
    const watch=new URLSearchParams(location.search).get('watch');
    if(watch)await detail(watch);
  }catch(e){
    $('#main').innerHTML=`<div class="empty"><h2>Couldn't reach the server.</h2><p>${esc(e.message)}</p><button class="btn" data-action="refresh">Try again</button></div>`;
  }
})();
setInterval(()=>{
  if(!$('#modal-root').children.length&&!state.watch&&document.visibilityState==='visible'&&document.activeElement.id!=='search')
    refresh().catch(()=>{});
},15000);
