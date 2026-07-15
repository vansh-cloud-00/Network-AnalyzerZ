(function(){
  // ================= AUTH LOGIC =================
  const cmdText = "authenticate --user";
  const typedEl = document.getElementById('typedCmd');
  let ti = 0;
  (function type(){ if(ti<=cmdText.length){ typedEl.textContent = cmdText.slice(0,ti); ti++; setTimeout(type,45);} })();

  const tabs = document.querySelectorAll('.tab');
  const forms = { login: document.getElementById('loginForm'), register: document.getElementById('registerForm') };
  tabs.forEach(tab=>{
    tab.addEventListener('click', ()=>{
      tabs.forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      Object.values(forms).forEach(f=>f.classList.remove('active'));
      forms[tab.dataset.tab].classList.add('active');
    });
  });

  function loadUsers(){
    try{
      const raw = localStorage.getItem('ps_users');
      const users = raw ? JSON.parse(raw) : {};
      if(!users['admin']) users['admin'] = 'admin123';
      return users;
    }catch(e){ return {admin:'admin123'}; }
  }
  function saveUsers(u){ localStorage.setItem('ps_users', JSON.stringify(u)); }
  function showMsg(el,text,type){ el.textContent = text; el.className = 'msg show '+type; }

  const loginForm = document.getElementById('loginForm');
  const loginBtn = document.getElementById('loginBtn');
  const loginMsg = document.getElementById('loginMsg');
  loginForm.addEventListener('submit', function(e){
    e.preventDefault();
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value;
    const users = loadUsers();
    loginBtn.disabled = true; loginBtn.textContent = 'authenticating...';
    setTimeout(()=>{
      if(users[user] && users[user]===pass){
        showMsg(loginMsg, `Access granted. Welcome, ${user}.`, 'success');
        setTimeout(()=>enterDashboard(user), 450);
      } else {
        showMsg(loginMsg, 'Access denied — invalid username or password.', 'error');
        loginBtn.disabled = false; loginBtn.textContent = './Login';
      }
    }, 300);
  });

  const registerForm = document.getElementById('registerForm');
  const registerBtn = document.getElementById('registerBtn');
  const registerMsg = document.getElementById('registerMsg');
  registerForm.addEventListener('submit', function(e){
    e.preventDefault();
    const user = document.getElementById('regUser').value.trim();
    const pass = document.getElementById('regPass').value;
    const pass2 = document.getElementById('regPass2').value;
    const users = loadUsers();
    if(user.length<3){ showMsg(registerMsg,'Username must be at least 3 characters.','error'); return; }
    if(users[user]){ showMsg(registerMsg,'That username is already taken.','error'); return; }
    if(pass.length<6){ showMsg(registerMsg,'Password must be at least 6 characters.','error'); return; }
    if(pass!==pass2){ showMsg(registerMsg,'Passwords do not match.','error'); return; }
    registerBtn.disabled = true; registerBtn.textContent = 'creating account...';
    setTimeout(()=>{
      users[user]=pass; saveUsers(users);
      showMsg(registerMsg, `Account created for ${user}. Signing you in...`, 'success');
      setTimeout(()=>enterDashboard(user), 500);
    }, 300);
  });

  function enterDashboard(username){
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('dashboardScreen').style.display = 'block';
    document.getElementById('userName').textContent = username;
    resizeCanvas(); drawWave(); renderStats();
    resolveConnection();
  }
  document.getElementById('logoutBtn').addEventListener('click', ()=>{
    stopMonitoring();
    document.getElementById('dashboardScreen').style.display = 'none';
    document.getElementById('authScreen').style.display = 'flex';
    loginForm.reset(); loginBtn.disabled=false; loginBtn.textContent='Login';
    loginMsg.classList.remove('show');
  });

  // ================= REAL IP / CONNECTION INFO =================
  const ipCheckInput = document.getElementById('ipCheckInput');
  const ipCheckBtn = document.getElementById('ipCheckBtn');
  const ipCheckMsg = document.getElementById('ipCheckMsg');

  function showIpMsg(text){
    ipCheckMsg.textContent = text;
    ipCheckMsg.style.display = text ? 'block' : 'none';
  }

  function setConnFields(ip, geo){
    document.getElementById('connIp').textContent = ip;
    document.getElementById('connCity').textContent = geo.city || 'unknown';
    document.getElementById('connRegion').textContent = geo.region || 'unknown';
    document.getElementById('connCountry').textContent = geo.country || 'unknown';
    document.getElementById('connIsp').textContent = geo.isp || 'unknown';
    const src = document.getElementById('connSource');
    src.textContent = 'IP-based (approximate)';
    src.style.color = 'var(--text-dim)';
  }

  // Detects private/reserved IP ranges that no public geo-IP database can
  // ever locate (RFC 1918 + loopback + link-local) — this is expected,
  // not an error condition, so it gets its own friendly message.
  function isPrivateIp(ip){
    const parts = ip.split('.').map(Number);
    if(parts.length !== 4 || parts.some(n => isNaN(n))) return false;
    const [a,b] = parts;
    if(a === 10) return true;
    if(a === 172 && b >= 16 && b <= 31) return true;
    if(a === 192 && b === 168) return true;
    if(a === 127) return true;
    if(a === 169 && b === 254) return true;
    return false;
  }

  // Tries ipapi.co first, falls back to ipwho.is if that fails/blocks
  // (some geo-IP APIs reject requests coming from a file:// page, whose
  // Origin header is "null" — the fallback avoids that being a dead end).
  async function fetchGeo(ip){
    try{
      const r = await fetch(`https://ipapi.co/${ip}/json/`);
      const d = await r.json();
      if(!d.error){
        return { city:d.city, region:d.region, country:d.country_name, isp:d.org };
      }
      throw new Error(d.reason || 'ipapi.co error');
    }catch(e1){
      const r2 = await fetch(`https://ipwho.is/${ip}`);
      const d2 = await r2.json();
      if(d2 && d2.success !== false){
        return { city:d2.city, region:d2.region, country:d2.country, isp:(d2.connection && d2.connection.isp) || 'unknown' };
      }
      throw new Error((d2 && d2.message) || 'lookup failed on both providers');
    }
  }

  async function checkIp(target){
    showIpMsg('');
    if(target && isPrivateIp(target)){
      showIpMsg(`${target} is a private/local network address — it only exists inside a home or office network and has no public location. Millions of other networks reuse the same address, so no geo-IP service anywhere can locate it. Use the "Detect My Local IP" or "get-my-ip.bat" tool to confirm it's yours, or check your Public IP above instead.`);
      return;
    }
    ipCheckBtn.disabled = true; ipCheckBtn.textContent = 'Checking...';
    try{
      let ip = target;
      if(!ip){
        const res = await fetch('https://api.ipify.org?format=json', {cache:'no-store'});
        const data = await res.json();
        ip = data.ip;
        document.getElementById('userIp').textContent = ip;
      }
      const geo = await fetchGeo(ip);
      setConnFields(ip, geo);
    }catch(e){
      showIpMsg('Lookup failed: ' + e.message + ' — try again or enter a different IP.');
    }finally{
      ipCheckBtn.disabled = false; ipCheckBtn.textContent = 'Check';
    }
  }

  function resolveConnection(){ checkIp(null); }

  ipCheckBtn.addEventListener('click', () => checkIp(ipCheckInput.value.trim() || null));
  ipCheckInput.addEventListener('keydown', (e) => { if(e.key === 'Enter'){ e.preventDefault(); checkIp(ipCheckInput.value.trim() || null); } });

  // ---- Detect local (LAN) IP via WebRTC ICE candidates ----
  const localIpBtn = document.getElementById('localIpBtn');
  const connLocalIp = document.getElementById('connLocalIp');

  function detectLocalIp(){
    if(!window.RTCPeerConnection){
      showIpMsg('WebRTC is not supported by this browser — local IP cannot be detected.');
      return;
    }
    showIpMsg('');
    localIpBtn.disabled = true; localIpBtn.textContent = 'Detecting...';
    connLocalIp.textContent = 'detecting…';

    const pc = new RTCPeerConnection({ iceServers: [] });
    let found = false;
    const timeout = setTimeout(() => {
      if(!found){
        connLocalIp.textContent = 'not found (blocked by browser)';
        showIpMsg('Your browser hid the local IP (mDNS privacy protection) — this is normal in modern Chrome/Edge and cannot be bypassed from a webpage.');
      }
      localIpBtn.disabled = false; localIpBtn.textContent = '🔍 Detect My Local IP';
      pc.close();
    }, 3000);

    pc.createDataChannel('');
    pc.onicecandidate = (ice) => {
      if(found || !ice || !ice.candidate || !ice.candidate.candidate) return;
      const candidate = ice.candidate.candidate;
      const ipv4Match = candidate.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
      const mdnsMatch = candidate.match(/([a-f0-9-]{20,}\.local)/i);
      if(ipv4Match){
        found = true;
        clearTimeout(timeout);
        connLocalIp.textContent = ipv4Match[1];
        localIpBtn.disabled = false; localIpBtn.textContent = '🔍 Detect My Local IP';
        pc.close();
      } else if(mdnsMatch && connLocalIp.textContent === 'detecting…'){
        connLocalIp.textContent = 'hidden behind mDNS (' + mdnsMatch[1] + ')';
      }
    };
    pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(() => {
      clearTimeout(timeout);
      connLocalIp.textContent = 'detection failed';
      localIpBtn.disabled = false; localIpBtn.textContent = '🔍 Detect My Local IP';
    });
  }
  localIpBtn.addEventListener('click', detectLocalIp);

  // ---- Real local IP, passed in via get-my-ip.bat (?localip=...) ----
  // This is the ONLY way to get your true system IP reliably — the WebRTC
  // trick above is blocked by mDNS privacy protection in modern browsers.
  (function readLocalIpFromUrl(){
    const params = new URLSearchParams(window.location.search);
    const fromBat = params.get('localip');
    if(fromBat && /^\d{1,3}(\.\d{1,3}){3}$/.test(fromBat)){
      connLocalIp.textContent = fromBat + ' (confirmed via ipconfig)';
      connLocalIp.style.color = 'var(--live)';
    }
  })();

  // ---- Real GPS location (more precise than IP-based geolocation) ----
  const gpsBtn = document.getElementById('gpsBtn');
  const connSource = document.getElementById('connSource');
  const connCoords = document.getElementById('connCoords');

  function useGpsLocation(){
    if(!navigator.geolocation){
      showIpMsg('Geolocation is not supported by this browser.');
      return;
    }
    showIpMsg('');
    gpsBtn.disabled = true; gpsBtn.textContent = 'Requesting GPS permission...';

    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude, lon = pos.coords.longitude, acc = Math.round(pos.coords.accuracy);
      connCoords.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)} (±${acc}m)`;
      gpsBtn.textContent = 'Resolving address...';
      try{
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=12`);
        const data = await res.json();
        const a = data.address || {};
        document.getElementById('connCity').textContent = a.city || a.town || a.village || a.county || 'unknown';
        document.getElementById('connRegion').textContent = a.state || 'unknown';
        document.getElementById('connCountry').textContent = a.country || 'unknown';
        connSource.textContent = 'GPS (precise, device location)';
        connSource.style.color = 'var(--live)';
      }catch(e){
        showIpMsg('Got GPS coordinates but reverse-geocoding (address lookup) failed: ' + e.message);
      }finally{
        gpsBtn.disabled = false; gpsBtn.textContent = '📍 Use My GPS Location (precise)';
      }
    }, (err) => {
      let msg = 'Could not get GPS location: ';
      if(err.code === 1) msg += 'permission denied. Allow location access in your browser to use this.';
      else if(err.code === 2) msg += 'position unavailable.';
      else msg += 'request timed out.';
      showIpMsg(msg);
      gpsBtn.disabled = false; gpsBtn.textContent = '📍 Use My GPS Location (precise)';
    }, { enableHighAccuracy:true, timeout:10000 });
  }
  gpsBtn.addEventListener('click', useGpsLocation);

  // ================= LIVE DASHBOARD (real browser network activity) =================
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const clearBtn = document.getElementById('clearBtn');
  const filterSel = document.getElementById('filterSel');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const logEl = document.getElementById('log');
  const pktCountEl = document.getElementById('pktCount');
  const cardTotal = document.getElementById('cardTotal');
  const cardBytes = document.getElementById('cardBytes');
  const ppsVal = document.getElementById('ppsVal');
  const protoListEl = document.getElementById('protoList');
  const srcListEl = document.getElementById('srcList');
  const canvas = document.getElementById('wave');
  const ctx = canvas.getContext('2d');
  const pingBtn = document.getElementById('pingBtn');
  const pingTarget = document.getElementById('pingTarget');

  let running = false;
  let total = 0, bytes = 0;
  const protoCounts = {HTTPS:0, HTTP:0, FETCH:0, PING:0};
  const srcCounts = {};
  let waveData = new Array(80).fill(0);
  let ticksThisSecond = 0;
  let secTimer = null;
  let perfObserver = null;
  let heartbeatTimer = null;

  function resizeCanvas(){
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width * devicePixelRatio;
    canvas.height = r.height * devicePixelRatio;
    ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
  }
  window.addEventListener('resize', resizeCanvas);

  function drawWave(){
    const w = canvas.getBoundingClientRect().width, h = canvas.getBoundingClientRect().height;
    ctx.clearRect(0,0,w,h);
    ctx.strokeStyle = 'rgba(23,50,74,0.6)'; ctx.lineWidth = 1;
    for(let i=0;i<=4;i++){ const y=(h/4)*i; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
    const max = Math.max(5, ...waveData);
    const stepX = w/(waveData.length-1);
    ctx.beginPath();
    waveData.forEach((v,i)=>{ const x=i*stepX, y=h-(v/max)*h*0.9-4; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
    ctx.strokeStyle = '#4fd1c5'; ctx.lineWidth = 2; ctx.shadowColor='#4fd1c5'; ctx.shadowBlur=8; ctx.stroke(); ctx.shadowBlur=0;
    ctx.lineTo(w,h); ctx.lineTo(0,h); ctx.closePath();
    const grad = ctx.createLinearGradient(0,0,0,h);
    grad.addColorStop(0,'rgba(79,209,197,0.25)'); grad.addColorStop(1,'rgba(79,209,197,0)');
    ctx.fillStyle = grad; ctx.fill();
  }
  function pushWave(v){ waveData.push(v); waveData.shift(); drawWave(); }
  function fmtTime(){ const d=new Date(); return d.toTimeString().split(' ')[0]+'.'+String(d.getMilliseconds()).padStart(3,'0'); }

  function addRow(proto, src, dst, size){
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <span class="t">${fmtTime()}</span>
      <span class="tag ${proto}">${proto}</span>
      <span class="addr">${src}</span>
      <span class="addr"><span class="arrow">→</span> ${dst}</span>
      <span class="sz">${size}B</span>`;
    logEl.insertBefore(row, logEl.firstChild);
    while(logEl.children.length > 150){ logEl.removeChild(logEl.lastChild); }
  }

  function renderStats(){
    cardTotal.textContent = total.toLocaleString();
    cardBytes.innerHTML = (bytes/1024).toFixed(1) + '<span>KB</span>';
    pktCountEl.textContent = total.toLocaleString();
    const maxProto = Math.max(1, ...Object.values(protoCounts));
    protoListEl.innerHTML = Object.entries(protoCounts).map(([p,c])=>{
      const pct = total ? (c/total*100).toFixed(1) : 0;
      return `<div class="proto-item"><div class="lbl"><span class="name">${p}</span><span>${c} (${pct}%)</span></div>
        <div class="bar-bg"><div class="bar-fill ${p}" style="width:${(c/maxProto*100)}%"></div></div></div>`;
    }).join('');
    const topSrc = Object.entries(srcCounts).sort((a,b)=>b[1]-a[1]).slice(0,6);
    srcListEl.innerHTML = topSrc.length ? topSrc.map(([host,c])=>
      `<div class="talker"><span class="ip">${host}</span><span class="n">${c} req</span></div>`
    ).join('') : `<div class="talker"><span class="n">No data yet</span></div>`;
  }

  function classifyEntry(entry){
    if(entry.name.startsWith('https://')) return entry.initiatorType==='fetch'||entry.initiatorType==='xmlhttprequest' ? 'FETCH' : 'HTTPS';
    if(entry.name.startsWith('http://')) return 'HTTP';
    return 'FETCH';
  }

  function handleResourceEntry(entry){
    if(!running) return;
    let host;
    try{ host = new URL(entry.name).host; }catch(e){ host = entry.name; }
    const proto = classifyEntry(entry);
    const size = Math.round(entry.transferSize || entry.encodedBodySize || 0);
    const myIp = document.getElementById('connIp').textContent;

    total++; bytes += size;
    protoCounts[proto] = (protoCounts[proto]||0)+1;
    srcCounts[host] = (srcCounts[host]||0)+1;
    ticksThisSecond++;

    const filter = filterSel.value;
    if(filter==='ALL' || filter===proto){
      addRow(proto, myIp==='resolving…'?'you':myIp, host, size);
    }
    renderStats();
  }

  function startMonitoring(){
    if(running) return;
    running = true;
    statusDot.classList.remove('off');
    statusText.textContent = 'Monitoring — live browser network activity';
    startBtn.disabled = true; stopBtn.disabled = false;

    perfObserver = new PerformanceObserver((list)=>{
      list.getEntries().forEach(handleResourceEntry);
    });
    perfObserver.observe({ type:'resource', buffered:true });

    // heartbeat: periodically fetch a tiny real resource so the monitor has
    // continuous live activity to show, even if the page itself is idle
    heartbeatTimer = setInterval(()=>{
      fetch('https://api.ipify.org?format=json&_=' + Date.now(), {cache:'no-store'}).catch(()=>{});
    }, 4000);

    secTimer = setInterval(()=>{
      ppsVal.innerHTML = ticksThisSecond + ' <span style="font-size:12px;color:var(--text-dim);">req/s</span>';
      pushWave(ticksThisSecond);
      ticksThisSecond = 0;
    }, 1000);
  }

  function stopMonitoring(){
    running = false;
    statusDot.classList.add('off');
    statusText.textContent = 'Idle — press Start Monitoring';
    startBtn.disabled = false; stopBtn.disabled = true;
    if(perfObserver){ perfObserver.disconnect(); perfObserver = null; }
    if(secTimer){ clearInterval(secTimer); secTimer = null; }
    if(heartbeatTimer){ clearInterval(heartbeatTimer); heartbeatTimer = null; }
    ppsVal.innerHTML = '0 <span style="font-size:12px;color:var(--text-dim);">req/s</span>';
  }

  function clearAll(){
    total = 0; bytes = 0;
    Object.keys(protoCounts).forEach(k=>protoCounts[k]=0);
    Object.keys(srcCounts).forEach(k=>delete srcCounts[k]);
    waveData = new Array(80).fill(0);
    logEl.innerHTML = '';
    renderStats(); drawWave();
  }

  // ---- real ping: measures actual round-trip time to a real host via fetch ----
  async function pingHost(){
    const target = pingTarget.value.trim();
    if(!target) return;
    pingBtn.disabled = true; pingBtn.textContent = 'Pinging...';
    const url = target.startsWith('http') ? target : `https://${target}`;
    const t0 = performance.now();
    try{
      await fetch(url, { mode:'no-cors', cache:'no-store' });
      const rtt = Math.round(performance.now() - t0);
      total++; bytes += 64;
      protoCounts.PING = (protoCounts.PING||0)+1;
      srcCounts[target] = (srcCounts[target]||0)+1;
      const filter = filterSel.value;
      const myIp = document.getElementById('connIp').textContent;
      if(filter==='ALL' || filter==='PING'){
        addRow('PING', myIp==='resolving…'?'you':myIp, `${target} (${rtt}ms RTT)`, 64);
      }
      renderStats();
    }catch(e){
      addRow('PING', 'you', `${target} — unreachable/blocked`, 0);
    }finally{
      pingBtn.disabled = false; pingBtn.textContent = 'Ping';
    }
  }
  pingBtn.addEventListener('click', pingHost);
  pingTarget.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); pingHost(); } });

  startBtn.addEventListener('click', startMonitoring);
  stopBtn.addEventListener('click', stopMonitoring);
  clearBtn.addEventListener('click', clearAll);
})();
