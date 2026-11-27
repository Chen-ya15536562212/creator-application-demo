(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const DAYS = 3, WATCH = 5, VIDEO_RICE = 10, DAILY_RICE = 100, DAY_MS = 86400000, SAVE_KEY = 'lofter-watch-streak-v3';
  const DAILY_LIMIT = Math.floor(DAILY_RICE / VIDEO_RICE), COUPON_COST = 100;
  const SOURCES = [
    {tag:'国风 · 短剧', author:'青禾影视', title:'雪落长安', likes:202},
    {tag:'游戏 · 高光', author:'NightZ', title:'最后一波团战', likes:328},
    {tag:'生活 · 夜宵', author:'一只小满', title:'夜市的烟火气', likes:96}
  ];
  const FEED = Array.from({length:DAILY_LIMIT + 1}, (_, index) => ({
    ...SOURCES[index % SOURCES.length],
    source:index % SOURCES.length + 1,
    offset:Math.floor(index / SOURCES.length) * 3.5
  }));
  const dateFormatter = new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',timeZone:'UTC'});
  const video = $('video'), player = $('player'), discovery = $('discovery');
  const rewardPanel = $('rewardPanel');
  const params = new URLSearchParams(location.search);
  const invited = params.get('eligible') === '1';
  if (params.get('review') === '1') document.body.classList.add('is-review');
  const state = {view:'home', index:0, liked:new Set(), hidden:false, entryHidden:false, watched:new Map(), paid:new Set(), streak:0, total:0, lastAward:null, offset:0, frameClaimed:false, couponRedeemed:false};
  const day = () => {
    const now = new Date();
    return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS + state.offset;
  };
  let activeDay = day(), lastMedia, lastWall, gesture, hintTimer, resumeOnVisible = false, mediaFailed = false, lastWheel = -Infinity, lastDayCheck = -Infinity, ignoreClick = 0;
  const complete = () => state.streak === DAYS;
  const awardedToday = () => state.lastAward === activeDay;
  const stage = () => Math.min(DAYS, state.streak + Number(!awardedToday()));
  const closed = () => complete() && !awardedToday();
  const dailyFull = () => state.paid.size >= DAILY_LIMIT;
  const clipPaid = () => state.paid.has(state.index);
  const clipTime = () => state.watched.get(state.index) || 0;
  const balance = () => state.total - (state.couponRedeemed ? COUPON_COST : 0);
  const validClip = index => Number.isInteger(index) && index >= 0 && index < FEED.length;

  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (Number.isInteger(saved?.offset) && saved.offset >= 0 && Number.isInteger(saved.streak) && saved.streak >= 0 && saved.streak <= DAYS) {
      state.offset = saved.offset; state.streak = saved.streak;
      state.total = Number.isInteger(saved.total) && saved.total >= 0 ? saved.total : 0;
      state.frameClaimed = saved.frameClaimed === true && complete();
      state.couponRedeemed = saved.couponRedeemed === true && state.total >= COUPON_COST;
      state.lastAward = Number.isInteger(saved.lastAward) ? saved.lastAward : null;
      activeDay = day();
      if (saved.day === activeDay) {
        if (Array.isArray(saved.paid)) state.paid = new Set(saved.paid.filter(validClip).slice(0,DAILY_LIMIT));
        if (Array.isArray(saved.watched)) state.watched = new Map(saved.watched.filter(entry => Array.isArray(entry) && validClip(entry[0]) && Number.isFinite(entry[1]) && entry[1] >= 0 && entry[1] <= WATCH));
      }
      if (!complete() && !awardedToday() && state.lastAward !== activeDay - 1) state.streak = 0;
    }
  } catch {}

  function persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({day:activeDay, watched:[...state.watched], paid:[...state.paid], streak:state.streak, total:state.total, lastAward:state.lastAward, offset:state.offset, frameClaimed:state.frameClaimed, couponRedeemed:state.couponRedeemed}));
    } catch {}
  }
  function clearClock() { lastMedia = lastWall = undefined; }
  function syncDay() {
    const today = day();
    if (today === activeDay) return;
    activeDay = today; state.watched.clear(); state.paid.clear();
    if (!complete() && state.lastAward !== activeDay - 1) state.streak = 0;
    $('announce').textContent = '';
    clearClock(); closeHint(); persist(); paintReward();
  }
  function paintReward() {
    const done = clipPaid() || dailyFull() || closed();
    $('rewardRail').hidden = state.hidden;
    $('quietOpen').hidden = !state.hidden;
    $('rewardRail').classList.toggle('earned', done);
    $('ringIcon').setAttribute('href', done ? '#i-check' : '#i-gift');
    $('hangWord').textContent = closed() ? '三日已完成' : dailyFull() ? '今日已领满' : `今日 ${state.paid.size}/${DAILY_LIMIT} 条`;
    $('rewardOpen').setAttribute('aria-label', closed() ? '查看打卡和奖励，三日任务已完成' : `查看打卡和奖励，今日已获奖 ${state.paid.size}/${DAILY_LIMIT} 条`);
    $('doneStat').textContent = `${state.streak} / ${DAYS} 天`;
    $('pointsStat').textContent = `${state.total} 乐乎米`;
    $('dayStat').textContent = dateFormatter.format(activeDay * DAY_MS);
    paintProgress();
    if (!rewardPanel.hidden) paintPanel();
  }
  function paintProgress() {
    const done = clipPaid() || dailyFull() || closed();
    $('ring').style.strokeDashoffset = String(done ? 0 : 100 * Math.min(clipTime() / WATCH, 1));
  }
  function closeHint() {
    clearTimeout(hintTimer);
    $('rewardHint').hidden = true;
    $('rewardRail').classList.remove('just-earned');
  }
  function showHint(title, detail, earned = false) {
    if (state.hidden || state.view !== 'player' || !rewardPanel.hidden) return;
    closeHint();
    $('hintTitle').textContent = title; $('hintDetail').textContent = detail;
    $('rewardHint').classList.toggle('is-earned', earned);
    $('rewardHint').hidden = false;
    if (earned) $('rewardRail').classList.add('just-earned');
    $('announce').textContent = `${title}。${detail}`;
    hintTimer = setTimeout(closeHint, earned && !dailyFull() ? 2200 : 3600);
  }
  function paintPanel() {
    $('panelBalance').textContent = balance();
    $('panelStreak').textContent = `连续打卡 ${state.streak}/${DAYS} 天`;
    Array.from($('daySteps').children).forEach((step, index) => {
      const done = index < state.streak;
      step.classList.toggle('done', done);
      step.textContent = `第 ${index + 1} 天${done ? ' ✓' : ''}`;
      step.setAttribute('aria-label', `第 ${index + 1} 天${done ? '已打卡' : '未打卡'}`);
    });
    $('panelNext').textContent = complete() ? '三日任务已完成' : awardedToday() ? '今日已打卡，明天再来' : `今天首条看超过 ${WATCH} 秒，即可打卡`;
    $('claimFrame').disabled = !complete() || state.frameClaimed;
    $('claimFrame').textContent = state.frameClaimed ? '已领取' : complete() ? '领取' : '未解锁';
    $('redeemCoupon').disabled = state.couponRedeemed || balance() < COUPON_COST;
    $('redeemCoupon').textContent = state.couponRedeemed ? '已兑换' : balance() >= COUPON_COST ? '兑换' : '未攒够';
    $('couponDescription').textContent = state.couponRedeemed ? '已发至券包（演示）' : `${COUPON_COST} 乐乎米兑换`;
    $('permissionDescription').textContent = invited ? (complete() ? '仅开放兑换资格，不代表到账' : '已受邀 · 打卡满三天开启') : '仅受邀用户开放，打卡不保证获得';
    $('permissionState').textContent = invited ? (complete() ? '已开放' : '未开启') : '受邀开放';
    $('permissionState').classList.toggle('is-open', invited && complete());
  }
  function closePanel(restoreFocus = false) {
    if (rewardPanel.hidden) return;
    rewardPanel.hidden = true;
    clearClock();
    $('rewardOpen').setAttribute('aria-expanded','false');
    if (restoreFocus) $('rewardOpen').focus({preventScroll:true});
  }
  function togglePanel() {
    syncDay();
    if (!rewardPanel.hidden) { closePanel(true); return; }
    clearClock(); closeHint();
    $('panelStatus').hidden = true;
    paintPanel();
    rewardPanel.hidden = false;
    $('rewardOpen').setAttribute('aria-expanded','true');
    $('panelTitle').focus({preventScroll:true});
  }
  function claimReward(type) {
    if (rewardPanel.hidden) return;
    let message;
    if (type === 'frame') {
      if (!complete() || state.frameClaimed) return;
      state.frameClaimed = true;
      message = '头像框已领取，可在装扮中查看（演示）';
    } else {
      if (state.couponRedeemed || balance() < COUPON_COST) return;
      state.couponRedeemed = true;
      message = `已扣 ${COUPON_COST} 乐乎米，优惠券已发至券包（演示）`;
    }
    persist(); paintPanel();
    $('panelStatus').textContent = message;
    $('panelStatus').hidden = false;
    $('panelClose').focus({preventScroll:true});
  }
  function paintLike() {
    const liked = state.liked.has(state.index);
    $('like').setAttribute('aria-pressed', liked);
    $('likeCount').textContent = FEED[state.index].likes + Number(liked);
  }
  function paintPlayback() {
    $('playBadge').hidden = !video.paused && !mediaFailed;
    $('playfield').setAttribute('aria-label', mediaFailed ? '重试播放' : video.paused ? '播放视频' : '暂停视频');
  }
  function play() {
    if (state.view === 'player' && !document.hidden) video.play().catch(paintPlayback);
  }
  function openClip(index) {
    const entering = state.view === 'home';
    state.view = 'player'; state.index = index; mediaFailed = false;
    clearClock(); syncDay();
    discovery.hidden = true; player.hidden = false;
    const clip = FEED[index];
    $('videoTag').textContent = clip.tag;
    $('videoAuthor').textContent = `@${clip.author}`;
    $('caption').textContent = `${clip.title} · 片段 ${Math.floor(index / SOURCES.length) + 1}`;
    $('viewLabel').textContent = '视频流 · 三日积分任务';
    video.poster = `media/clip-${clip.source}.jpg`;
    video.src = `media/clip-${clip.source}.mp4`;
    if (!entering) { closeHint(); closePanel(); }
    paintLike(); paintReward(); paintPlayback(); play();
    if (entering) $('playfield').focus({preventScroll:true});
  }
  function home() {
    state.view = 'home'; resumeOnVisible = false; clearClock(); closeHint(); closePanel(); persist();
    video.pause(); player.hidden = true; discovery.hidden = false;
    $('viewLabel').textContent = '发现页 · LOFTER 实拍底图';
    (state.entryHidden ? $('feedTab') : $('homeEdge')).focus({preventScroll:true});
  }
  function step(delta) {
    if (state.view !== 'player') return;
    openClip((state.index + delta + FEED.length) % FEED.length);
  }
  function togglePlayback() {
    clearClock();
    if (mediaFailed) openClip(state.index);
    else if (video.paused) play();
    else video.pause();
  }
  function clock(now) {
    requestAnimationFrame(clock);
    if (now - lastDayCheck > 1000) { lastDayCheck = now; syncDay(); }
    if (state.view !== 'player' || !rewardPanel.hidden || clipPaid() || dailyFull() || closed() || video.paused || video.seeking || video.readyState < 3 || document.hidden) {
      clearClock(); return;
    }
    const media = video.currentTime;
    if (lastMedia !== undefined) {
      let delta = media - lastMedia;
      if (delta < 0 && lastMedia > video.duration - .5 && media < .5) delta += video.duration;
      const elapsed = Math.min((now - lastWall) / 1000,.3);
      if (delta > 0 && elapsed > 0 && delta <= elapsed + .18) state.watched.set(state.index, clipTime() + delta);
    }
    lastMedia = media; lastWall = now;
    if (clipTime() - WATCH <= .000001) { paintProgress(); return; }
    syncDay();
    if (clipTime() - WATCH <= .000001) return;
    const firstToday = !awardedToday();
    if (firstToday) { state.lastAward = activeDay; state.streak += 1; }
    state.watched.delete(state.index); state.paid.add(state.index); state.total += VIDEO_RICE;
    persist(); paintReward();
    const checkpoint = complete() ? '三日打卡完成 · 点礼物领相框' : state.streak === DAYS - 1 ? '第 2 天已打卡 · 明天回来领相框' : '第 1 天已打卡 · 点礼物看福利';
    const detail = firstToday ? checkpoint : dailyFull() ? (complete() ? `今日领满 ${DAILY_RICE} · 三日已完成` : `今日领满 ${DAILY_RICE} · 明天还能再来`) : `今日已领 ${state.paid.size}/${DAILY_LIMIT} 条`;
    showHint(`+${VIDEO_RICE} 乐乎米已到账`, detail, true);
  }
  function toggleReward(hidden) {
    state.hidden = hidden; closeHint(); closePanel(); paintReward();
    $(hidden ? 'quietOpen' : 'rewardOpen').focus({preventScroll:true});
  }
  function reset() {
    Object.assign(state, {streak:0,total:0,lastAward:null,offset:0,hidden:false,entryHidden:false,frameClaimed:false,couponRedeemed:false});
    state.watched.clear(); state.paid.clear();
    activeDay = day(); state.liked.clear();
    $('announce').textContent = '';
    $('homeEdge').hidden = $('hideEntry').hidden = false;
    home(); persist(); paintReward();
  }
  function advance(days) {
    state.offset += days; syncDay();
  }

  for (const control of ['homeEdge','feedTab','firstCard']) $(control).addEventListener('click', () => openClip(0));
  $('hideEntry').addEventListener('click', () => {
    state.entryHidden = true;
    $('homeEdge').hidden = $('hideEntry').hidden = true;
    $('feedTab').focus({preventScroll:true});
  });
  $('rewardOpen').addEventListener('click',togglePanel);
  $('panelClose').addEventListener('click',() => closePanel(true));
  $('claimFrame').addEventListener('click',() => claimReward('frame'));
  $('redeemCoupon').addEventListener('click',() => claimReward('coupon'));
  $('hideReward').addEventListener('click',() => toggleReward(true));
  $('quietOpen').addEventListener('click',() => toggleReward(false));
  $('tomorrow').addEventListener('click',() => advance(1));
  $('skipDay').addEventListener('click',() => advance(2));
  $('reset').addEventListener('click',reset);
  $('back').addEventListener('click',home);
  $('next').addEventListener('click',() => step(1));
  $('playfield').addEventListener('click',() => {
    if (performance.now() < ignoreClick) return;
    if (!rewardPanel.hidden) closePanel(true);
    else togglePlayback();
  });
  $('like').addEventListener('click',() => {
    state.liked.has(state.index) ? state.liked.delete(state.index) : state.liked.add(state.index);
    paintLike();
  });
  video.addEventListener('loadedmetadata',() => {
    clearClock();
    const offset = Math.max(0, Math.min(FEED[state.index].offset, video.duration - WATCH - .2));
    if (offset > 0) video.currentTime = offset;
  });
  ['play','pause','playing','waiting','canplay'].forEach(event => video.addEventListener(event,paintPlayback));
  video.addEventListener('seeking',clearClock);
  video.addEventListener('error',() => { mediaFailed = true; clearClock(); paintPlayback(); });
  document.addEventListener('visibilitychange',() => {
    clearClock();
    if (document.hidden) {
      resumeOnVisible = state.view === 'player' && !video.paused;
      video.pause(); closeHint(); persist();
    } else {
      syncDay();
      if (resumeOnVisible) { resumeOnVisible = false; play(); }
    }
  });
  player.addEventListener('wheel',event => {
    if (event.target.closest?.('#rewardPanel') || Math.abs(event.deltaY) < 8) return;
    event.preventDefault();
    const now = performance.now();
    if (now - lastWheel > 360) { lastWheel = now; step(Math.sign(event.deltaY)); }
  },{passive:false});
  $('playfield').addEventListener('pointerdown',event => {
    if (event.button !== 0) return;
    gesture = {id:event.pointerId,x:event.clientX,y:event.clientY};
    $('playfield').setPointerCapture(event.pointerId);
  });
  $('playfield').addEventListener('pointercancel',() => { gesture = undefined; });
  $('playfield').addEventListener('pointerup',event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const deltaX = event.clientX - gesture.x, deltaY = event.clientY - gesture.y;
    gesture = undefined;
    if (Math.abs(deltaY) < 44 || Math.abs(deltaY) < Math.abs(deltaX) * 1.2) return;
    ignoreClick = performance.now() + 320; step(deltaY < 0 ? 1 : -1);
  });
  document.addEventListener('keydown',event => {
    if (state.view !== 'player' || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') { closeHint(); closePanel(true); }
    if (event.target.closest?.('#rewardPanel')) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); step(event.key === 'ArrowDown' ? 1 : -1);
    }
    if (event.code === 'Space' && !event.target.closest?.('button')) { event.preventDefault(); togglePlayback(); }
  });
  paintReward(); paintPlayback(); requestAnimationFrame(clock);
  if (params.get('view') === 'player') openClip(0);
})();
