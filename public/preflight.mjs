// Pure, deterministic first-chapter game state. This is a fictional game,
// not aviation training or a representation of real operating procedures.
export const WORLD = Object.freeze({
  minX: -2.77, maxX: 2.77, minZ: .45, maxZ: 15.5,
  rows: Object.freeze([3, 5, 7, 9, 11, 13]),
  radius: .23, speed: 2.35, interactionRadius: 1.1,
  reportPoint: Object.freeze({ x: 0, z: 1.5 })
});

const DEFINITIONS = [
  { id: 'bag', kind: 'safety', title: '行李位置待確認', icon: '!' },
  { id: 'belt', kind: 'safety', title: '準備狀態待確認', icon: '!' },
  { id: 'tray', kind: 'safety', title: '餐桌狀態待確認', icon: '!' },
  { id: 'water', kind: 'service', title: '想要一杯水', icon: '水', spawn: 0, patience: 32 },
  { id: 'blanket', kind: 'service', title: '客艙有點冷', icon: '暖', spawn: 5, patience: 39 },
  { id: 'question', kind: 'service', title: '想知道何時出發', icon: '問', spawn: 10, patience: 46 }
];
const LESSONS = {
  aisle: { title: '有人走到走道了', copy: '需求等太久會出現紅色走道事件。靠近按 E 協助返回座位，再完成原本的服務。' },
  correction: { title: '可以補救，紀錄會保留', copy: '正式巡艙先顯示 2 秒修正回饋，再重新選擇。安全失誤 1 次保留修正評價；2 次本輪需重試，仍可練習。' },
  handoff: { title: '這次交接用掉了', copy: '服務交接每輪只有 1 次。交接後同事需要 12 秒才送達，回饋較少；名額不會恢復，其他需求要自己安排。' }
};
let runSerial = 0;
function emit(s,type,taskId=null,detail={}) {
 s.events.push({runId:s.runId,seq:++s.eventSeq,type,taskId,actionId:s.action?.id??null,detail});
 if(s.events.length>64)s.events.splice(0,s.events.length-64);
}
export function readEvents(s,cursor) {
 return {events:s.events.filter(e=>cursor?.runId!==s.runId||e.seq>cursor.seq),cursor:{runId:s.runId,seq:s.eventSeq}};
}
function beginAction(s, action) { s.action={...action,id:++s.actionSerial};emit(s,"action-start",action.taskId,{choiceId:action.choice?.id,kind:action.kind}); }
const EPSILON = 1e-9;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
function rng(seed) {
  let n = seed >>> 0;
  return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; };
}
function shuffle(list, random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function feedback(s, copy, kind = 'normal') { s.feedback = copy; s.feedbackKind = kind; }
function showLesson(s, id) {
  if (s.lesson || s.lessonSeen.includes(id)) return false;
  s.lesson = { id, ...LESSONS[id] };
  if (id === 'correction' && s.action?.choice?.feedback) s.lesson.copy = `${s.action.choice.feedback} ${s.lesson.copy}`;
  s.player.walking = false;
  return true;
}

export function createState(options = {}) {
  let { seed = 1701, practice = false } = options && typeof options === 'object' ? options : {};
  seed = Number.isFinite(seed) ? seed >>> 0 : 1701;
  const random = rng(seed), rows = shuffle([0, 1, 2, 3, 4, 5], random);
  const tasks = DEFINITIONS.map((d, i) => {
    const row = rows[i], side = random() > .5 ? 'left' : 'right';
    return {
      ...d, row, side, seat: `${row + 1}${side === 'left' ? 'B' : 'C'}`,
      variant: Math.floor(random() * 3), x: 0, z: WORLD.rows[row],
      spawn: d.spawn ?? 0, active: d.kind === 'safety' || d.spawn === 0,
      done: false, assigned: false, late: false, acknowledged: false,
      handoff: false, warned: false, mistakes: 0
    };
  });
  const s = {
    runId: `run-${++runSerial}`, eventSeq:0, events:[], actionSerial:0,
    chapter: 1, seed, practice: !!practice, status: 'briefing', elapsed: 0, duration: 100,
    cameraMode: 'follow', reducedMotion: false,
    player: { x: 0, z: 1.5, angle: 0, walking: false, step: 0 },
    tasks, hazards: [], hazardsCleared: 0, handoffTokens: 1, handoffJob: null,
    safety: 100, comfort: 80, safetyErrors: 0, mistakes: 0, servicePenalty: 0,
    dialog: null, action: null, lesson: null, lessonSeen: [], decisionSerial: 0,
    feedback: 'WASD / 方向鍵走動，靠近標記按 E。先觀察，再選擇處理。',
    feedbackKind: 'normal', near: null, completed: 0, grade: null, result: null,
    endReason: null, reportAttempted: false
  };
  updateNear(s);
  return s;
}

export function start(s) {
  if (s.status !== 'briefing') return false;
  s.status = 'playing';
  for(const t of s.tasks)if(t.active&&t.kind==='service')emit(s,'demand',t.id);
  updateNear(s);
  return true;
}
export function counts(s) {
  const safety = s.tasks.filter(t => t.kind === 'safety' && t.done).length;
  const service = s.tasks.filter(t => t.kind === 'service' && t.done).length;
  return {
    safety, service, hazards: s.hazards.filter(h => !h.done).length,
    completed: safety + service, pending: s.tasks.filter(t => t.active && !t.done).length,
    late: s.tasks.filter(t => t.late).length, handoffs: s.tasks.filter(t => t.done && t.handoff).length
  };
}
export function chapterReady(s) {
  const c = counts(s);
  return c.safety === 3 && c.service === 3 && c.hazards === 0;
}
export function targets(s) {
  return [
    ...s.hazards.filter(h => !h.done).map(h => ({ id: h.id, taskId:h.taskId, x: 0, z: h.z, kind: 'hazard', label: `恢復走道`, active: true, done: false })),
    ...s.tasks.filter(t => t.active && !t.done && !t.assigned).map(t => ({ id: t.id, x: 0, z: t.z, kind: t.kind, label: `${t.title}`, active: true, done: false })),
    { id: 'report', ...WORLD.reportPoint, kind: 'report', label: '前方巡艙回報', active: true, done: s.status === 'finished' && s.endReason === 'complete' }
  ];
}
export function updateNear(s) {
  const options = targets(s), range = WORLD.interactionRadius;
  // An aisle event takes priority even when a seat target is slightly nearer.
  for (const group of ['hazard', 'task', 'report']) {
    let best = null, distance = range;
    for (const t of options) {
      if (t.done || (group === 'hazard' ? t.kind !== 'hazard' : group === 'report' ? t.kind !== 'report' : t.kind === 'hazard' || t.kind === 'report')) continue;
      const d = Math.hypot(s.player.x - t.x, s.player.z - t.z);
      if (d <= distance) { best = t.id; distance = d; }
    }
    if (best) { s.near = best; return best; }
  }
  s.near = null;
  return null;
}

function rectBlocked(x, z, minX, maxX, minZ, maxZ) {
  return Math.hypot(x - clamp(x, minX, maxX), z - clamp(z, minZ, maxZ)) < WORLD.radius;
}
export function canStand(s, x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || x < WORLD.minX || x > WORLD.maxX || z < WORLD.minZ || z > WORLD.maxZ) return false;
  for (const row of WORLD.rows) {
    for (const [minX, maxX] of [[-2.68, -.82], [.82, 2.68]])
      if (rectBlocked(x, z, minX, maxX, row - .48, row + .48)) return false;
  }
  for (const [minZ, maxZ] of [[.35, 1.5], [14.4, 15.6]]) {
    for (const [minX, maxX] of [[-2.7, -.78], [.78, 2.7]])
      if (rectBlocked(x, z, minX, maxX, minZ, maxZ)) return false;
  }
  const bag = s.tasks.find(t => t.id === 'bag');
  if (bag && !bag.done && bag.variant !== 2 && rectBlocked(x, z, -.44, .44, bag.z - .36, bag.z + .36)) return false;
  for (const h of s.hazards) {
    // An event spawned under the player becomes solid as soon as they step
    // out. Escape uses normal movement speed; no teleport or trapping.
    const exiting = h.collisionPending && rectBlocked(s.player.x, s.player.z, -.38, .38, h.z - .34, h.z + .34);
    if (!h.done && !exiting && rectBlocked(x, z, -.38, .38, h.z - .34, h.z + .34)) return false;
  }
  return true;
}
export function move(s, dx, dz, dt) {
  if (s.status !== 'playing' || s.dialog || s.lesson || s.action || !Number.isFinite(dt) || dt <= 0) { s.player.walking = false; return false; }
  dx = Number.isFinite(dx) ? dx : 0; dz = Number.isFinite(dz) ? dz : 0;
  if (!dx && !dz) { s.player.walking = false; return false; }
  dt = Math.min(dt, .1);
  const length = Math.hypot(dx, dz); dx /= length; dz /= length;
  const steps = Math.max(1, Math.ceil(dt * WORLD.speed / .04));
  let moved = false;
  for (let i = 0; i < steps; i++) {
    const x = s.player.x + dx * WORLD.speed * dt / steps;
    if (canStand(s, x, s.player.z)) { moved ||= Math.abs(x - s.player.x) > 1e-7; s.player.x = x; }
    const z = s.player.z + dz * WORLD.speed * dt / steps;
    if (canStand(s, s.player.x, z)) { moved ||= Math.abs(z - s.player.z) > 1e-7; s.player.z = z; }
  }
  s.player.angle = Math.atan2(dx, dz); s.player.walking = moved;
  if (moved) s.player.step += dt * 9;
  updateNear(s);
  return moved;
}

function choicesFor(s, t) {
  const v = t.variant;
  const mk = (id, label, good, duration = 5, extra = {}) => ({ id, label, good, duration, tags: [`${duration}秒`], ...extra });
  const repaired = '確認完成，繼續巡艙。';
  let quote, description, choices;
  if (t.id === 'bag') {
    quote = ['我的包可以放哪裡？', '這個包還沒放好。', '我已經放好了。'][v];
    description = ['走道有行李，頭頂櫃還有空位。', '走道有行李，附近頭頂櫃已滿。', '行李已收妥，走道保持淨空。'][v];
    choices = [mk('stow', '幫你放進空櫃', v === 0, 5), mk('relocate', '協調其他可用位置', v === 1, 6), mk('check', '查看已收好的行李', v === 2, 4)];
    choices.forEach(c => { c.feedback = c.good ? repaired : ['走道有行李，頭頂櫃有空位；現在需要協助收妥。', '附近頭頂櫃已滿；需要協調畫面中的其他空位。', '行李已收妥、走道淨空；現在只需查看確認。'][v]; });
  } else if (t.id === 'belt') {
    quote = ['嗯？你剛剛說什麼？', '這個圖示是什麼意思？', '這樣可以了嗎？'][v];
    description = ['旅客盯著手機，安全帶尚未扣好。', '旅客指著圖示，安全帶尚未扣好。', '旅客已扣好安全帶，等你查看。'][v];
    choices = [mk('attention', '先請旅客抬頭，再示範扣法', v === 0), mk('diagram', '先指圖示，讓旅客照著操作', v === 1, 6), mk('check', '查看扣好的安全帶', v === 2, 4)];
    choices.forEach(c => { c.feedback = c.good ? repaired : ['旅客正看手機、還沒扣好；需要先引起注意。', '旅客指著圖示、還沒扣好；需要說明圖示。', '安全帶已扣好；現在只需查看確認。'][v]; });
  } else if (t.id === 'tray') {
    quote = ['現在可以收桌子嗎？', '我還拿著咖啡呢。', '桌子收好了。'][v];
    description = ['餐桌展開，桌面已清空。', '餐桌展開，桌上有物品，旅客手拿咖啡。', '餐桌已收妥，旅客等你查看。'][v];
    choices = [mk('fold', '請把空餐桌收起', v === 0), mk('assist', '幫忙安置咖啡和物品', v === 1, 6), mk('check', '查看收妥的餐桌', v === 2, 4)];
    choices.forEach(c => { c.feedback = c.good ? repaired : ['餐桌展開但已清空；現在可以請旅客收起。', '桌上有物品，旅客拿著咖啡；需要協助安置物品。', '餐桌已收妥；現在只需查看確認。'][v]; });
  } else if (t.id === 'question') {
    const known = v !== 0;
    quote = '大概何時出發？'; description = `資訊板：${known ? '預估稍後，時間可能調整。' : '目前沒有確認的預估。'}`;
    choices = [mk('estimate', '預估稍後，可能調整', known, 4), mk('unknown', '還沒確定，有消息告訴您', !known, 4), mk('ask', '向同事確認最新消息', true, 9)];
    choices.forEach(c => { c.feedback = c.good ? '旅客收到與資訊板一致的回覆。' : known ? '資訊板已有預估、仍可能調整；這句回覆漏掉了已知資訊。' : '資訊板還沒有確認的預估；現在不能提供出發時間。'; });
  } else {
    const urgent = s.tasks.find(x => x.id === 'bag' && !x.done && x.variant !== 2);
    const available = s.handoffTokens > 0 && !s.handoffJob;
    quote = t.id === 'water' ? '可以給我一杯水嗎？' : '可以給我一條毯子嗎？';
    description = `${urgent ? `附近的行李仍擋在走道。` : '走道行李已清除。'}${t.acknowledged ? '旅客已接受過一次等候安排。' : '旅客正在座位等候。'}`;
    choices = [
      mk('serve', t.id === 'water' ? '我來送水' : '我來拿毯子', !urgent, 8, { safetyError: !!urgent, feedback: urgent ? '走道仍被行李占用，現在應先處理行李；可回應等候或交接。' : '旅客需求已完成。' }),
      mk('handoff', t.id === 'water' ? '請同事送水' : '請同事拿毯子', available, 3, { handoff: true, tags: ['3秒', `交接剩${s.handoffTokens}次`, '同事需12秒'], feedback: available ? '已交接，待同事送達。回饋較少，名額用完不會恢復。' : '交接名額已用完，請親自協助或安排等候。' }),
      mk('wait', '請稍等，我會回來', !t.acknowledged, 3, { ack: true, tags: ['3秒', `等候+${t.acknowledged ? 0 : 12}秒`, `剩${t.acknowledged ? 0 : 1}次`], feedback: !t.acknowledged ? '旅客願意再等一下，需求還沒完成。' : '已延長過等候，重複說明不會完成需求。' })
    ];
  }
  // One playful reply stays situational: humor is not a correctness signal.
  if(t.kind==='safety'){
    const funnyIndex=(s.seed+s.decisionSerial+t.id.charCodeAt(0))%3;
    const playful={bag:{stow:'幫行李入住空櫃，走道別加床',relocate:'幫行李找新家，先協調其他空位',check:'行李點名，我來查看收妥狀態'},belt:{attention:'手機先休息，我示範扣安全帶',diagram:'讓圖示當翻譯，我說明扣法',check:'扣環點名，我來查看扣法'},tray:{fold:'空餐桌下班了，請收起',assist:'咖啡先安頓，我幫忙收桌面',check:'餐桌查房，我來查看收妥狀態'}};
    choices[funnyIndex].label=playful[t.id][choices[funnyIndex].id];
    choices[funnyIndex].humorous=true;
  }else{
    const funny=choices.find(c=>c.id===(t.id==='question'?'ask':'wait'));
    funny.label=t.id==='water'?'我去請水杯出場，請稍等':t.id==='blanket'?'我去叫毯子起床，請稍等':'我去問問消息有沒有睡醒';funny.humorous=true;
  }
  t.quote = quote; t.description = description;
  return { handoffHint: choices.some(c=>c.handoff) ? '每輪限 1 次。確認交接後，同事再過 12 秒送達；期間可繼續巡艙，服務回饋較少。' : null, id: t.id, title: t.title, quote, description, choices: shuffle(choices, rng(s.seed + s.decisionSerial++ * 97)) };
}

export function interact(s) {
  if (s.status !== 'playing' || s.dialog || s.lesson) return false;
  if (s.action) { feedback(s, '正在處理，完成後再繼續。'); return false; }
  updateNear(s);
  const hazard = s.hazards.find(h => h.id === s.near && !h.done);
  if (hazard) {
    beginAction(s, { kind: 'clear-hazard', taskId: hazard.taskId, hazardId: hazard.id, time: 0, duration: 5, choice: null });
    s.player.walking = false; feedback(s, `走道旅客 · 協助旅客返回座位，恢復走道。`); return true;
  }
  if (s.near === 'report') {
    if (!chapterReady(s)) {
      const c = counts(s); s.reportAttempted = true;
      feedback(s, `尚需檢查 ${3 - c.safety} 項、需求 ${3 - c.service} 個、走道 ${c.hazards} 件；完成後再回報。`, 'warning'); return false;
    }
    finish(s, 'complete'); return true;
  }
  const task = s.tasks.find(t => t.id === s.near && t.active && !t.done && !t.assigned);
  if (!task) { feedback(s, '靠近座位旁的標記，按 E 查看情境。'); return false; }
  s.dialog = choicesFor(s, task); s.player.walking = false; return true;
}
export function closeDialog(s) {
  if (!s.dialog) return false;
  s.dialog = null; s.player.walking = false;
  feedback(s, '可以再觀察眼前情境，靠近後按 E。');
  return true;
}
export function choose(s, index) {
  if (s.status !== 'playing' || !s.dialog || s.lesson || s.action || !Number.isInteger(index)) return false;
  const t = s.tasks.find(t => t.id === s.dialog.id), choice = s.dialog.choices[index];
  if (!t || !choice) return false;
  emit(s,'choice',t.id,{choiceId:choice.id});
  if(!choice.good)emit(s,'mistake',t.id,{choiceId:choice.id});
  const decision = s.dialog;
  s.dialog = null; s.player.walking = false;
  if (!choice.good) {
    if (s.practice) {
      // Keep the same options in place; the controller requires a fresh input.
      decision.recoveryFeedback = `${choice.feedback} 可直接重選，練習不扣分。`;
      decision.retrySerial = (decision.retrySerial || 0) + 1;
      s.dialog = decision;
      feedback(s, decision.recoveryFeedback, 'warning');
      return true;
    }
    if (!s.practice) {
      t.mistakes++; s.mistakes++;
      if (t.kind === 'safety' || choice.safetyError) { s.safetyErrors++; s.safety = clamp(s.safety - 20, 0, 100); }
      else penalizeService(s, 9);
    }
    beginAction(s, { kind: 'correction', taskId: t.id, time: 0, duration: 2, choice });
    feedback(s, choice.feedback, 'warning'); showLesson(s, 'correction');
  } else {
    beginAction(s, { kind: choice.handoff ? 'handoff' : choice.ack ? 'wait' : 'task', taskId: t.id, time: 0, duration: choice.duration, choice });
    feedback(s, t.kind === 'safety' ? '依眼前情境完成確認…' : choice.handoff ? '聯繫同事交接，完成後仍需等候送達…' : choice.ack ? '正在說明等候安排…' : '正在協助旅客…');
  }
  return true;
}
export function dismissLesson(s) {
  if (!s.lesson || s.status !== 'playing') return false;
  if (!s.lessonSeen.includes(s.lesson.id)) s.lessonSeen.push(s.lesson.id);
  s.lesson = null; return true;
}
export function pause(s) {
  if (s.status !== 'playing') return false;
  s.status = 'paused'; s.player.walking = false; return true;
}
export function resume(s) {
  if (s.status !== 'paused') return false;
  s.status = 'playing'; s.player.walking = false; return true;
}

function penalizeService(s, amount) {
  if (s.practice) return;
  s.servicePenalty += amount;
  s.comfort = clamp(s.comfort - amount, 0, Math.max(0, 100 - s.servicePenalty));
}
function creditService(s, amount) { s.comfort = clamp(s.comfort + amount, 0, Math.max(0, 100 - s.servicePenalty)); }
function completeTask(s, t, handoff = false) {
  t.done = true; t.assigned = false; t.handoff = handoff; t.completedAt = s.elapsed; s.completed++; emit(s,'complete',t.id,{handoff});
  if (t.kind === 'service') creditService(s, handoff ? (t.late ? 1 : 3) : (t.late ? 3 : 7));
}
function finishAction(s) {
  const a = s.action, t = s.tasks.find(t => t.id === a.taskId);
  s.action = null;
  if (a.kind === 'clear-hazard') {
    const h = s.hazards.find(h => h.id === a.hazardId);
    if (h && !h.done) { h.done = true; s.hazardsCleared++; emit(s,'hazard-clear',h.taskId); }
    feedback(s, '走道已恢復。原本的服務需求仍需處理，紅色事件不等於已送達。', 'good');
  } else if (a.kind === 'correction') feedback(s, `${a.choice.feedback} 可按 E 重選；本次失誤仍保留。`, 'warning');
  else if (t) {
    if (a.choice.ack) { t.acknowledged = true; t.patience += 12; t.warned = false; }
    else if (a.choice.handoff) { s.handoffTokens--; t.assigned = true; s.handoffJob = { taskId: t.id, remaining: 12 }; }
    else completeTask(s, t);
    feedback(s, a.choice.feedback, 'good');

  }
  updateNear(s);
}
function demandTick(s) {
  for (const t of s.tasks) {
    if (t.kind !== 'service') continue;
    if (!t.active && s.elapsed + EPSILON >= t.spawn) { t.active = true; emit(s,'demand',t.id); feedback(s, `${t.title} 新需求：${t.title}`); }
    if (!t.active || t.done || t.assigned || (s.action?.taskId === t.id && s.action.kind !== 'correction')) continue;
    const age = s.elapsed - t.spawn;
    if (!t.warned && age + EPSILON >= t.patience - 10) { t.warned = true; feedback(s, `${t.title} 等候接近上限；10 秒內未回應，可能走到走道詢問。`, 'warning'); }
    if (!t.late && age + EPSILON >= t.patience) {
      t.late = true; penalizeService(s, 8);
      const h = { id: `hazard-${t.id}`, taskId: t.id, seat: t.seat, x: 0, z: t.z, row: t.row, done: false };
      h.collisionPending = rectBlocked(s.player.x, s.player.z, -.38, .38, h.z - .34, h.z + .34);
      s.hazards.push(h);
      feedback(s, `${t.title} 的旅客已走到走道詢問。紅色標記需先處理，服務需求仍保留。`, 'warning');
      showLesson(s, 'aisle');
    }
  }
}
function finish(s, reason) {
  s.status = 'finished'; s.endReason = reason; s.dialog = null; s.action = null; s.lesson = null;
  s.player.walking = false;
  s.grade = reason !== 'complete' || !chapterReady(s) ? 'incomplete' : s.safetyErrors >= 2 ? 'retry' : s.safetyErrors === 1 ? 'recovered' : 'clean';
  s.result = s.grade; emit(s,'finish',null,{grade:s.grade});
  feedback(s, reason === 'complete' ? '巡艙回報完成。' : '行動時間已用完，查看本輪回顧。', s.grade === 'clean' || s.grade === 'recovered' ? 'good' : 'warning');
}
export function tick(s, dt, input = { x: 0, z: 0 }) {
  if (s.status !== 'playing' || s.dialog || s.lesson || !Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, .1);
  s.elapsed = s.practice ? s.elapsed + dt : Math.min(s.duration, s.elapsed + dt);
  // Deadline evaluation deliberately precedes demand, handoff, and action credit.
  if (!s.practice && s.elapsed + EPSILON >= s.duration) {
    s.elapsed = s.duration; finish(s, 'timeout'); return;
  }
  demandTick(s);
  if (s.lesson) { updateNear(s); return; }
  if (s.handoffJob) {
    s.handoffJob.remaining = Math.max(0, s.handoffJob.remaining - dt);
    if (s.handoffJob.remaining <= EPSILON) {
      const t = s.tasks.find(t => t.id === s.handoffJob.taskId);
      completeTask(s, t, true); s.handoffJob = null;
      feedback(s, `${t.title}：同事已完成需求。交接名額不會恢復。`, 'good');
    }
  }
  if (s.action) {
    s.player.walking = false;
    s.action.time = Math.min(s.action.duration, s.action.time + dt);
    if (s.action.duration - s.action.time <= EPSILON) { s.action.time = s.action.duration; finishAction(s); }
  } else move(s, input?.x, input?.z, dt);
  for (const h of s.hazards) {
    if (h.collisionPending && !rectBlocked(s.player.x, s.player.z, -.38, .38, h.z - .34, h.z + .34)) h.collisionPending = false;
  }
  updateNear(s);
}
