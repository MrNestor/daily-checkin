// ============================================================
//  每日签到 — Cloudflare Worker + KV
//  功能：HTML 页面 + API 接口，全部在单个 Worker 中
// ============================================================

const USERS = ['156', '186', '189'];

// ---------- API 路由 ----------

async function getData(env) {
  const data = {};
  // 并行读取三个用户的 KV 数据，降低延迟(citation:2)
  const entries = await Promise.all(
    USERS.map(async (uid) => {
      const raw = await env.CHECKIN_KV.get(`checkin:${uid}`, 'json');
      return [uid, raw || []];
    })
  );
  for (const [uid, dates] of entries) {
    data[uid] = dates;
  }
  return data;
}

async function doCheckin(uid, env) {
  const today = ds(new Date());
  const key = `checkin:${uid}`;
  const dates = (await env.CHECKIN_KV.get(key, 'json')) || [];
  if (dates.indexOf(today) === -1) {
    dates.push(today);
    await env.CHECKIN_KV.put(key, JSON.stringify(dates));
  }
  return dates;
}

// ---------- Worker 入口 ----------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // GET /api/data — 获取所有签到数据
    if (url.pathname === '/api/data' && request.method === 'GET') {
      const data = await getData(env);
      return jsonResponse(data);
    }

    // POST /api/checkin — 签到
    if (url.pathname === '/api/checkin' && request.method === 'POST') {
      const body = await request.json();
      const uid = body.user;
      if (!uid || USERS.indexOf(uid) === -1) {
        return jsonResponse({ error: 'invalid user' }, 400);
      }
      const dates = await doCheckin(uid, env);
      return jsonResponse({ user: uid, dates });
    }

    // GET / — 返回签到页面
    return new Response(HTML_PAGE, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
};

// ---------- 工具函数 ----------

function ds(d) {
  // 直接用 Intl 拿北京时间的年月日，en-CA 输出 YYYY-MM-DD 格式
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai'
  }).format(d);
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ---------- 前端 HTML ----------

const HTML_PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>每日签到</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Noto+Serif+SC:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #F0F5FA;
      --white: #FFFFFF;
      --accent: #4A8EC4;
      --accent-dk: #3979AF;
      --accent-bg: #DEEAF6;
      --ink: #1C293D;
      --ink2: #566378;
      --ink3: #96A3B5;
      --green: #4A9B76;
      --green-bg: #E5F5ED;
      --red: #CC6B64;
      --red-bg: #FBE9E7;
      --bdr: #D3DEE9;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Noto Serif SC', 'Songti SC', serif;
      background:
        radial-gradient(ellipse at 18% 0%, rgba(74,142,196,.07) 0%, transparent 50%),
        radial-gradient(ellipse at 82% 100%, rgba(74,142,196,.05) 0%, transparent 50%),
        var(--bg);
      color: var(--ink);
      min-height: 100vh;
      padding: 48px 24px 60px;
      -webkit-font-smoothing: antialiased;
    }
    .wrap { max-width: 1080px; margin: 0 auto; }
    .hdr { text-align: center; margin-bottom: 44px; }
    .hdr h1 { font-size: 2rem; font-weight: 700; letter-spacing: .12em; margin-bottom: 8px; }
    .hdr-date { font-family: 'DM Mono', monospace; font-size: .82rem; color: var(--ink3); font-weight: 300; }
    .hdr-tag {
      display: inline-block; margin-top: 10px;
      font-family: 'DM Mono', monospace; font-size: .65rem;
      color: var(--accent); background: var(--accent-bg);
      padding: 3px 10px; border-radius: 10px;
    }

    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }

    .card {
      position: relative; overflow: hidden;
      background: var(--white); border: 1px solid var(--bdr); border-radius: 14px;
      padding: 26px 22px;
      box-shadow: 0 1px 3px rgba(0,0,0,.03), 0 6px 20px rgba(0,0,0,.03);
      transition: transform .3s ease, box-shadow .3s ease;
      opacity: 0; animation: fadeUp .5s ease forwards;
    }
    .card:nth-child(2) { animation-delay: .1s; }
    .card:nth-child(3) { animation-delay: .2s; }
    .card:hover { transform: translateY(-3px); box-shadow: 0 6px 28px rgba(74,142,196,.12); }
    .card::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0;
      height: 3px; background: transparent; transition: background .4s;
    }
    .card.has-streak::before { background: linear-gradient(90deg, var(--accent), transparent 80%); }
    .card.has-goal::before { background: linear-gradient(90deg, var(--green), transparent 80%); }

    .card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
    .uname { font-family: 'DM Mono', monospace; font-size: 1.5rem; font-weight: 500; }
    .badge { font-family: 'DM Mono', monospace; font-size: .75rem; font-weight: 400; padding: 4px 12px; border-radius: 16px; }
    .badge-none { background: var(--bg); color: var(--ink3); }
    .badge-act { background: var(--accent-bg); color: var(--accent); }
    .badge-ok { background: var(--green-bg); color: var(--green); }

    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 18px; }
    .stat { text-align: center; padding: 10px 4px; background: var(--bg); border-radius: 10px; }
    .stat-v { font-family: 'DM Mono', monospace; font-size: 1.2rem; font-weight: 500; line-height: 1.2; }
    .stat-l { font-size: .65rem; color: var(--ink3); margin-top: 3px; }

    .prog { margin-bottom: 18px; }
    .prog-head { display: flex; justify-content: space-between; margin-bottom: 7px; }
    .prog-lbl { font-size: .72rem; color: var(--ink2); }
    .prog-n { font-family: 'DM Mono', monospace; font-size: .72rem; color: var(--ink3); }
    .prog-bar { width: 100%; height: 5px; background: var(--bdr); border-radius: 3px; overflow: hidden; }
    .prog-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, var(--accent), #6CA8D8); transition: width .6s cubic-bezier(.22,1,.36,1); }
    .prog-fill.done { background: linear-gradient(90deg, var(--green), #6EBE96); }

    .tl { margin-bottom: 18px; }
    .tl-head { font-size: .7rem; color: var(--ink3); margin-bottom: 8px; }
    .tl-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
    .tl-day {
      aspect-ratio: 1; border-radius: 6px;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      font-family: 'DM Mono', monospace;
      border: 1.5px solid var(--bdr); background: var(--white); color: var(--ink3); transition: all .2s;
    }
    .tl-day .d { font-size: .68rem; line-height: 1; }
    .tl-day .w { font-size: .38rem; margin-top: 2px; opacity: .6; }
    .tl-day.on { background: var(--accent); border-color: var(--accent); color: #fff; }
    .tl-day.on .w { opacity: .75; }
    .tl-day.off { background: var(--red-bg); border-color: rgba(204,107,100,.2); color: var(--red); }
    .tl-day.now { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-bg); }
    .tl-day.now.on { box-shadow: 0 0 0 2px rgba(74,142,196,.2); }

    .btn-in {
      width: 100%; padding: 12px; border: none; border-radius: 10px;
      font-family: 'Noto Serif SC', serif; font-size: .92rem; font-weight: 600;
      cursor: pointer; transition: all .25s ease; letter-spacing: .06em; user-select: none;
    }
    .btn-go { background: var(--accent); color: #fff; animation: pulse 2.5s ease-in-out infinite; }
    .btn-go:hover { background: var(--accent-dk); transform: translateY(-1px); }
    .btn-go:active { transform: translateY(0); }
    .btn-ok { background: var(--accent-bg); color: var(--accent); cursor: default; }

    .msg { margin-top: 12px; padding: 9px 12px; border-radius: 8px; font-size: .78rem; line-height: 1.5; text-align: center; }
    .msg-ok { background: var(--green-bg); color: var(--green); }
    .msg-warn { background: var(--red-bg); color: var(--red); }
    .msg-info { background: var(--accent-bg); color: var(--accent); }

    .hist { margin-top: 14px; }
    .hist-btn { background: none; border: none; font-family: 'Noto Serif SC', serif; font-size: .75rem; color: var(--ink3); cursor: pointer; padding: 3px 0; border-bottom: 1px dashed var(--bdr); transition: color .2s; }
    .hist-btn:hover { color: var(--accent); }
    .hist-list { margin-top: 8px; max-height: 160px; overflow-y: auto; display: none; }
    .hist-list.show { display: block; }
    .hist-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #E8EDF3; font-size: .75rem; }
    .hist-row:last-child { border-bottom: none; }
    .hist-row .hd { font-family: 'DM Mono', monospace; color: var(--ink2); font-size: .72rem; }
    .hist-row .hw { color: var(--ink3); font-size: .7rem; }

    .loading { text-align: center; padding: 80px 0; color: var(--ink3); font-size: .9rem; }

    @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(74,142,196,.25); } 50% { box-shadow: 0 0 0 8px rgba(74,142,196,0); } }
    @keyframes pop { 0% { transform: scale(1); } 40% { transform: scale(1.025); } 100% { transform: scale(1); } }
    .card.pop { animation: pop .4s ease !important; opacity: 1 !important; }

    @media (max-width: 900px) {
      .grid { grid-template-columns: 1fr; max-width: 400px; margin: 0 auto; }
      body { padding: 32px 16px 48px; }
      .hdr h1 { font-size: 1.6rem; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="hdr">
      <h1>每日签到</h1>
      <p class="hdr-date" id="hd"></p>
      <span class="hdr-tag">Cloudflare KV 持久存储</span>
    </header>
    <main class="grid" id="g">
      <div class="loading" style="grid-column:1/-1">加载中...</div>
    </main>
  </div>

  <script>
    var USERS = ${JSON.stringify(USERS)};
    var GOAL = 7;
    var TL_DAYS = 14;
    var WK = ['日','一','二','三','四','五','六'];

    var BASE = location.origin;

    function ds(d) {
      return d.getFullYear() + '-' +
        String(d.getMonth()+1).padStart(2,'0') + '-' +
        String(d.getDate()).padStart(2,'0');
    }
    function todayStr() { return ds(new Date()); }
    function pd(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1]-1, p[2]); }

    function calcStreak(dates) {
      if (!dates.length) return 0;
      var s = new Set(dates), t = todayStr(), start;
      if (s.has(t)) { start = new Date(); }
      else { var y = new Date(); y.setDate(y.getDate()-1); if (s.has(ds(y))) start = y; else return 0; }
      var n = 0, c = new Date(start);
      while (s.has(ds(c))) { n++; c.setDate(c.getDate()-1); }
      return n;
    }
    function calcLongest(dates) {
      if (!dates.length) return 0;
      var sorted = dates.slice().sort(), best = 1, cur = 1;
      for (var i = 1; i < sorted.length; i++) {
        var diff = Math.round((pd(sorted[i]) - pd(sorted[i-1])) / 864e5);
        if (diff === 1) { cur++; if (cur > best) best = cur; }
        else if (diff > 1) cur = 1;
      }
      return best;
    }

    async function fetchData() {
      var r = await fetch(BASE + '/api/data');
      return r.json();
    }

    async function doCk(uid) {
      var r = await fetch(BASE + '/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: uid })
      });
      await r.json();
      // 重新拉取全量数据，确保前后端一致
      var allData = await fetchData();
      render(uid, allData);   // uid 作为 checkedUser 触发动画，allData 更新页面
    }

    function togH(uid) {
      var list = document.getElementById('hl-' + uid);
      var btn  = document.getElementById('hb-' + uid);
      var open = list.classList.toggle('show');
      btn.textContent = open ? '收起签到记录 ▴' : '查看签到记录 (' + (window._data[uid]||[]).length + '天) ▾';
    }

    function render(checkedUser, data) {
      if (data) window._data = data;
      data = window._data || {};
      var t = todayStr();
      var now = new Date();

      document.getElementById('hd').textContent =
        now.getFullYear() + '年' + (now.getMonth()+1) + '月' + now.getDate() + '日 星期' + WK[now.getDay()];

      var html = '';
      USERS.forEach(function(uid) {
        var dates = data[uid] || [];
        var streak  = calcStreak(dates);
        var longest = calcLongest(dates);
        var total   = dates.length;
        var isDone  = dates.indexOf(t) !== -1;
        var pct     = Math.min(streak / GOAL, 1);

        var cardCls = 'card';
        if (streak >= GOAL) cardCls += ' has-goal';
        else if (streak > 0) cardCls += ' has-streak';

        var badgeCls, badgeTx;
        if (streak >= GOAL) { badgeCls = 'badge-ok'; badgeTx = streak + '天 ✓'; }
        else if (streak > 0) { badgeCls = 'badge-act'; badgeTx = streak + '天连续'; }
        else { badgeCls = 'badge-none'; badgeTx = '未连续'; }

        var dateSet = new Set(dates);
        var firstDate = total > 0 ? dates.slice().sort()[0] : null;
        var tlHtml = '';
        for (var i = TL_DAYS - 1; i >= 0; i--) {
          var d = new Date(); d.setDate(d.getDate() - i);
          var dss = ds(d);
          var ck = dateSet.has(dss);
          var isT = (i === 0);
          var isM = i > 0 && !ck && firstDate && dss >= firstDate;
          var cls = 'tl-day';
          if (ck) cls += ' on';
          else if (isM) cls += ' off';
          if (isT) cls += ' now';
          tlHtml += '<div class="' + cls + '" title="' + dss + '"><span class="d">' + d.getDate() + '</span><span class="w">' + WK[d.getDay()] + '</span></div>';
        }

        var sorted = dates.slice().sort().reverse();
        var histHtml = '';
        sorted.forEach(function(h) {
          var hd = pd(h);
          histHtml += '<div class="hist-row"><span class="hd">' + h + '</span><span class="hw">周' + WK[hd.getDay()] + '</span></div>';
        });
        if (!histHtml) histHtml = '<div class="hist-row" style="justify-content:center;color:var(--ink3)">暂无记录</div>';

        var msg = '';
        if (streak >= GOAL && isDone) msg = '<div class="msg msg-ok">已达成连续' + GOAL + '天签到目标！请继续保持</div>';
        else if (streak >= GOAL && !isDone) msg = '<div class="msg msg-info">已达成连续' + GOAL + '天目标！今日签到可继续保持</div>';
        else if (streak > 0 && isDone) msg = '<div class="msg msg-info">已连续签到' + streak + '天，再坚持' + (GOAL - streak) + '天达成目标</div>';
        else if (streak > 0 && !isDone) msg = '<div class="msg msg-warn">今日尚未签到，当前连续' + streak + '天，签到可保持记录</div>';
        else if (total > 0 && !isDone) msg = '<div class="msg msg-warn">签到已中断，今天重新开始吧</div>';

        var btn = isDone
          ? '<button class="btn-in btn-ok">✓ 今日已签到</button>'
          : '<button class="btn-in btn-go" onclick="doCk(\\'' + uid + '\\')">签到</button>';

        html += '<div class="' + cardCls + '">' +
          '<div class="card-top"><span class="uname">' + uid + '</span><span class="badge ' + badgeCls + '">' + badgeTx + '</span></div>' +
          '<div class="stats">' +
            '<div class="stat"><div class="stat-v">' + streak + '</div><div class="stat-l">连续天数</div></div>' +
            '<div class="stat"><div class="stat-v">' + total + '</div><div class="stat-l">总计签到</div></div>' +
            '<div class="stat"><div class="stat-v">' + longest + '</div><div class="stat-l">最长连续</div></div>' +
          '</div>' +
          '<div class="prog"><div class="prog-head"><span class="prog-lbl">目标进度</span><span class="prog-n">' + Math.min(streak, GOAL) + '/' + GOAL + ' 天</span></div>' +
            '<div class="prog-bar"><div class="prog-fill' + (streak >= GOAL ? ' done' : '') + '" style="width:' + (pct*100) + '%"></div></div></div>' +
          '<div class="tl"><div class="tl-head">最近' + TL_DAYS + '天</div><div class="tl-grid">' + tlHtml + '</div></div>' +
          btn + msg +
          '<div class="hist"><button class="hist-btn" id="hb-' + uid + '" onclick="togH(\\'' + uid + '\\')">查看签到记录 (' + total + '天) ▾</button>' +
          '<div class="hist-list" id="hl-' + uid + '">' + histHtml + '</div></div></div>';
      });

      document.getElementById('g').innerHTML = html;

      if (checkedUser && typeof checkedUser === 'string') {
        var cards = document.querySelectorAll('.card');
        cards.forEach(function(c) { c.style.animation = 'none'; c.style.opacity = '1'; });
        var idx = USERS.indexOf(checkedUser);
        if (idx >= 0 && cards[idx]) {
          cards[idx].classList.add('pop');
          setTimeout(function() { cards[idx].classList.remove('pop'); }, 450);
        }
      }
    }

    // 初始加载
    fetchData().then(function(data) {
      render(null, data);
    });
  </script>
</body>
</html>`;
