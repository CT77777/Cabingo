import {initBoarding,tickBoarding,boardingChoices,boardingPassable,boardingTaskComplete,boardingReady,boardingTaskActor} from './boarding.mjs?v=0.7.2';
import {getChapter,DEFAULT_CHAPTER_ID} from './chapters/index.mjs?v=0.7.2';

// Pure, deterministic preflight game state. This is a fictional game,
// not aviation training or a representation of real operating procedures.
export const WORLD = Object.freeze({
  minX: -2.77, maxX: 2.77, minZ: .45, maxZ: 15.5,
  rows: Object.freeze([3, 5, 7, 9, 11, 13]),
  radius: .23, speed: 2.35, interactionRadius: 1.1,
  reportPoint: Object.freeze({ x: 0, z: 1.5 })
});

let runSerial = 0;
function emit(s,type,taskId=null,detail={}) {
 s.events.push({runId:s.runId,seq:++s.eventSeq,type,taskId,actionId:s.action?.id??null,detail});
 if(s.events.length>64)s.events.splice(0,s.events.length-64);
}
export function readEvents(s,cursor) {
 return {events:s.events.filter(e=>cursor?.runId!==s.runId||e.seq>cursor.seq),cursor:{runId:s.runId,seq:s.eventSeq}};
}
function actionSteps(a) {
  const tap=label=>({label,mode:'tap'}),hold=label=>({label,mode:'hold'});
  if(a.kind==='handoff')return [tap('呼叫同事'),tap('確認交接內容')];
  if(a.kind==='wait')return [tap('向旅客說明等候安排')];
  const id=a.choice?.id;
  if(id==='check')return [tap('查看現場'),tap('確認狀態')];
  if(a.taskId==='bag')return [hold('抬起行李'),tap('放入可用空櫃並關門')];
  if(a.taskId==='belt')return [tap(id==='diagram'?'指出圖示扣法':'請旅客放下手機'),hold('協助對齊並扣好安全帶')];
  if(a.taskId==='tray')return id==='assist'?[hold('接穩咖啡'),tap('安置桌面物品'),tap('收起餐桌')]:[tap('確認桌面清空'),hold('收起餐桌')];
  if(a.taskId==='water')return [tap('拿起水杯'),hold('倒水至綠色區域後放開')];
  if(a.taskId==='blanket')return [tap('取出毯子'),hold('遞給旅客')];
  return [tap(id==='ask'?'向同事確認消息':'查看資訊板'),tap('向旅客回覆')];
}
function beginAction(s, action) { s.action={...action,id:++s.actionSerial};
 if(s.contextual&&action.kind!=='correction')s.action.duration=action.kind==='clear-hazard'||action.taskId==='bag'&&action.choice?.id!=='check'?2:action.choice?.id==='check'||action.kind==='wait'?.8:action.kind==='handoff'?1:action.choice?.id==='serve'?3:1.5;
 if(s.handsOn&&!s.contextual&&!['correction','clear-hazard'].includes(action.kind))s.action.interaction={steps:actionSteps(action),index:0,held:false,fill:0,retry:false};emit(s,"action-start",action.taskId,{choiceId:action.choice?.id,kind:action.kind}); }
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
  if(s.recovery&&id==='aisle')s.pendingAisleLesson=true;
  if (s.recovery || s.lesson || s.lessonSeen.includes(id)) return false;
  actionInput(s,'cancel');
  s.lesson = { id, ...getChapter(s.chapterId||DEFAULT_CHAPTER_ID).lessons[id] };
  if (id === 'correction' && s.action?.choice?.feedback) s.lesson.copy = `${s.action.choice.feedback} ${s.lesson.copy}`;
  s.player.walking = false;
  return true;
}

export function createState(options = {}) {
  let { seed = 1701, practice = false, handsOn = false, contextual = false, chapterId = DEFAULT_CHAPTER_ID } = options && typeof options === 'object' ? options : {};
  const chapter=getChapter(chapterId);
  if(!chapter?.available)throw new RangeError('此章節尚未開放');
  seed = Number.isFinite(seed) ? seed >>> 0 : 1701;
  const random = rng(seed), rows = shuffle([0, 1, 2, 3, 4, 5], random);
  const tasks = chapter.tasks.map((d, i) => {
    const row = d.row ?? rows[i], side = d.side ?? (random() > .5 ? 'left' : 'right');
    return {
      ...d, characterId:d.characterId||(d.id==='belt'?'elder':null), row, side, seat: `${row + 1}${side === 'left' ? 'B' : 'C'}`,
      variant: d.variant ?? Math.floor(random() * 3), x: 0, z: WORLD.rows[row],
      spawn: d.spawn ?? 0, active: d.kind === 'safety' || d.spawn === 0,
      done: false, assigned: false, late: false, acknowledged: false,
      handoff: false, warned: false, mistakes: 0
    };
  });
  const s = {
    runId: `run-${++runSerial}`, eventSeq:0, events:[], actionSerial:0,
    chapter: chapter.order, chapterId: chapter.id, seed, handsOn: !!handsOn, contextual: !!contextual, practice: !!practice, status: 'briefing', elapsed: 0, duration: chapter.duration,
    characterMemory:options?.characterMemory&&typeof options.characterMemory==='object'?options.characterMemory:{},
    cameraMode: 'follow', reducedMotion: false,
    player: { x: 0, z: 1.5, angle: 0, walking: false, step: 0 },
    tasks, encounters:[], judgments:[], hazards: [], hazardsCleared: 0, handoffTokens: chapter.handoffTokens, handoffJob: null,
    safety: 100, comfort: 80, safetyErrors: 0, mistakes: 0, servicePenalty: 0,
    dialog: null, action: null, lesson: null, lessonSeen: [], decisionSerial: 0,
    feedback: 'WASD / 方向鍵走動，靠近標記按空白鍵。先觀察，再選擇處理。',
    feedbackKind: 'normal', near: null, completed: 0, grade: null, result: null,
    endReason: null, reportAttempted: false
  };
  if(chapterId==='boarding'){initBoarding(s);if(options.guidedBoarding&&contextual)s.boarding.coach={examined:[],briefed:false,ready:false};}
  updateNear(s);
  return s;
}

export function start(s) {
  if (s.status !== 'briefing') return false;
  s.status = 'playing';
  for(const t of s.tasks)if(t.active&&t.kind==='service')emit(s,'demand',t.id);
  updateNear(s);
  if(s.contextual&&!s.boarding)showLesson(s,'serviceIntro');
  if(s.boarding?.coach)showLesson(s,'boardingWelcome');
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
  if(s.boarding)return boardingReady(s);
  const c = counts(s);
  return s.tasks.every(t=>t.done) && c.hazards === 0;
}
export function targets(s) {
  return [
    ...s.hazards.filter(h => !h.done).map(h => ({ id: h.id, taskId:h.taskId, x: 0, z: h.z, kind: 'hazard', label: `恢復走道`, active: true, done: false })),
    ...s.tasks.filter(t => t.active && !t.done && !t.assigned&&(!s.boarding||(['guide','bag'].includes(t.id)||s.boarding.formal)&&boardingTaskActor(s,t.id)&&(t.id!=='seat'||s.boarding.actors.filter(a=>a.taskId==='seat').every(a=>a.status==='waiting')))).map(t => {const a=s.boarding&&t.id!=='bag'?boardingTaskActor(s,t.id):null;return { id: t.id, x:a?.x||0, z:a?.z??t.z, kind: t.kind, label: `${t.title}`, active: true, done: false };}),
    { id: 'report', ...WORLD.reportPoint, kind: 'report', label: '前方巡艙回報', active: true, done: s.status === 'finished' && s.endReason === 'complete' }
  ];
}
export function updateNear(s) {
  const options = targets(s), range = WORLD.interactionRadius;
  // An aisle event takes priority even when a seat target is slightly nearer.
  for (const group of (s.boarding?['hazard','safety','service','report']:['hazard', 'task', 'report'])) {
    let best = null, distance = range;
    for (const t of options) {
      if(t.done||(group==='task'?t.kind==='hazard'||t.kind==='report':t.kind!==group))continue;
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
  if(s.boarding&&!boardingPassable(s,x,z))return false;
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
  if (s.status !== 'playing' || s.dialog || s.lesson || s.recovery || s.action || !Number.isFinite(dt) || dt <= 0) { s.player.walking = false; return false; }
  dx = Number.isFinite(dx) ? dx : 0; dz = Number.isFinite(dz) ? dz : 0;
  if (!dx && !dz) { s.player.walking = false; return false; }
  dt = Math.min(dt, .1);
  const length = Math.hypot(dx, dz); dx /= Math.max(1,length); dz /= Math.max(1,length);
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
  if(s.boarding&&t.id!=='bag'){const d=boardingChoices(s,t);t.quote=d.quote;t.description=d.description;return {id:t.id,title:t.title,...d,choices:shuffle(d.choices,rng(s.seed+s.decisionSerial++*97))};}
  const v = t.variant;
  const mk = (id, label, good, duration = 5, extra = {}) => ({ id, label, good, duration, tags: [`${duration}秒`], ...extra });
  const repaired = '確認完成，繼續巡艙。';
  let quote, description, choices, practiceQuote;
  if (t.id === 'bag') {
    quote = ['我的包可以放哪裡？', '這個包還沒放好。', '我已經放好了。'][v];
    description = ['走道有行李，頭頂櫃還有空位。', '走道有行李；旅客上方已滿，另一側有可用空櫃。', '行李已收妥，走道保持淨空。'][v];
    choices = [mk('stow', '幫你放進可用空櫃', v !== 2, 5), mk('relocate', v===1?'擠進旅客上方已滿的櫃子':'先把行李留在走道', false, 6), mk('check', '查看已收好的行李', v === 2, 4)];
    choices.forEach(c => { c.feedback = c.good ? repaired : ['走道有行李，頭頂櫃有空位；現在需要協助收妥。', '旅客上方已滿，但另一側有空櫃；請使用畫面中的可用空櫃。', '行李已收妥、走道淨空；現在只需查看確認。'][v]; });
  } else if (t.id === 'belt') {
    quote = ['嗯？你剛剛說什麼？', '這個圖示是什麼意思？', '這樣可以了嗎？'][v];
    practiceQuote=quote;
    description = ['旅客盯著手機，安全帶尚未扣好。', '旅客指著圖示，安全帶尚未扣好。', '旅客已扣好安全帶，等你查看。'][v];
    if(s.characterMemory?.elder?.helped)quote=`又見面了，謝謝你登機時幫我。${quote}`;
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
      mk('handoff', t.id === 'water' ? '請同事送水' : '請同事拿毯子', available, 3, { handoff: true, tags: ['3秒', '你可以繼續巡艙'], feedback: available ? '已交接，待同事送達。回饋較少，名額用完不會恢復。' : '交接名額已用完，請親自協助或安排等候。' }),
      mk('wait', s.hazards.some(h=>!h.done)||urgent?'我先清理走道，再來協助您':s.tasks.some(t=>t.kind==='safety'&&!t.done)?'我先完成安全檢查，再回來':'我會回來送上，請稍等', !t.acknowledged, 3, { ack: true, tags: ['3秒', '旅客留在座位等候'], feedback: !t.acknowledged ? '旅客願意再等一下，需求還沒完成。' : '已延長過等候，重複說明不會完成需求。' })
    ];
    choices=choices.filter(c=>!c.handoff||available).filter(c=>!c.ack||!t.acknowledged);
    if(urgent&&t.acknowledged)choices.push(mk('leave','先清理走道行李，馬上回來',true,0,{leave:true,tags:[]}));
  }
  if(s.handsOn&&!s.contextual)for(const c of choices){
    const steps=actionSteps({kind:c.handoff?'handoff':c.ack?'wait':'task',taskId:t.id,choice:c});
    c.tags=[`${steps.length} 步操作`,...c.tags.filter(tag=>!/^\d+秒$/.test(tag))];
  }
  if(s.contextual)for(const c of choices)c.tags=c.tags.filter(tag=>!/^\d+秒$/.test(tag));
  t.quote = quote; t.description = description;
  return { handoffHint: null, id: t.id, title: t.title, quote, practiceQuote:practiceQuote??quote, description, choices: shuffle(choices, rng(s.seed + s.decisionSerial++ * 97)) };
}

export function interact(s) {
  if (s.status !== 'playing' || s.dialog || s.lesson || s.recovery) return false;
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
      feedback(s, s.boarding?`尚有 ${s.boarding.actors.filter(a=>!['seated','exited'].includes(a.status)).length} 位旅客未到位；完成所有需求、讓走道淨空後再回報。`:`尚需檢查 ${s.tasks.filter(t=>t.kind==='safety').length - c.safety} 項、需求 ${s.tasks.filter(t=>t.kind==='service').length - c.service} 個、走道 ${c.hazards} 件；完成後再回報。`, 'warning'); return false;
    }
    finish(s, 'complete'); return true;
  }
  const task = s.tasks.find(t => t.id === s.near && t.active && !t.done && !t.assigned);
  if (!task) { feedback(s, '靠近座位旁的標記，按空白鍵 查看情境。'); return false; }
  if(!s.encounters.includes(task.id))s.encounters.push(task.id);
  s.dialog = choicesFor(s, task); s.player.walking = false; return true;
}
export function closeDialog(s) {
  if (!s.dialog) return false;
  s.dialog = null; s.player.walking = false;
  feedback(s, '可以再觀察眼前情境，靠近後按空白鍵。');
  return true;
}
export function choose(s, index) {
  if (s.status !== 'playing' || !s.dialog || s.lesson || s.recovery || s.action || !Number.isInteger(index)) return false;
  const t = s.tasks.find(t => t.id === s.dialog.id), choice = s.dialog.choices[index];
  if (!t || !choice) return false;
  if(t.id==='guide'&&s.boarding?.coach&&s.boarding.coach.examined.length<2)return false;
  if(choice.leave){s.dialog=null;s.player.walking=false;feedback(s,'先處理走道行李，再回來完成服務。');return true;}
  let judgment=s.judgments.find(j=>j.taskId===t.id);
  if(!judgment){judgment={taskId:t.id,title:t.title,variant:t.variant,context:s.dialog.description,attempts:0,incorrect:0};s.judgments.push(judgment);}
  judgment.context=s.dialog.description;judgment.mode=s.practice?'practice':s.boarding&&!s.boarding.formal?'tutorial':'formal';
  if(!judgment.attempts)judgment.firstChoice={label:choice.label,good:choice.good,mode:judgment.mode};
  if(!choice.good&&(t.kind==='safety'||choice.safetyError))judgment.safetyIncorrect=(judgment.safetyIncorrect||0)+1;
  judgment.attempts++;if(!choice.good)judgment.incorrect++;judgment.choiceId=choice.id;judgment.choiceLabel=choice.label;judgment.good=choice.good;judgment.feedback=choice.feedback;
  // Preserve the actual missed decision: later service choices can have a
  // different aisle, wait or handoff context. Practice never replays the run.
  if(!choice.good)judgment.retryDecision={
    title:s.dialog.title,quote:s.dialog.practiceQuote??s.dialog.quote,description:s.dialog.description,
    task:{id:t.id,variant:t.variant,side:t.side},
    choices:s.dialog.choices.map(c=>({label:c.label,good:c.good,feedback:c.feedback,tags:[...c.tags]}))
  };
  emit(s,'choice',t.id,{choiceId:choice.id});
  if(!choice.good)emit(s,'mistake',t.id,{choiceId:choice.id});
  const decision = s.dialog;
  s.dialog = null; s.player.walking = false;
  if (!choice.good && s.contextual) {
    s.recovery={taskId:t.id,copy:choice.feedback,ready:s.practice||!!(s.boarding&&!s.boarding.formal),decision};
    if(!s.practice&&!(s.boarding&&!s.boarding.formal)){t.mistakes++;s.mistakes++;if(t.kind==='safety'||choice.safetyError){s.safetyErrors++;s.safety=clamp(s.safety-20,0,100);}else penalizeService(s,9);beginAction(s,{kind:'correction',taskId:t.id,time:0,duration:2,choice});}
    feedback(s,choice.feedback,'warning');return true;
  }
  if (!choice.good) {
    if (s.practice || s.boarding&&!s.boarding.formal) {
      // Keep the same options in place; the controller requires a fresh input.
      decision.recoveryFeedback = `${choice.feedback} 可直接重選，教學與練習不扣分。`;
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
    if(!choice.ack&&!choice.handoff)emit(s,'correct',t.id);
    beginAction(s, { kind: choice.handoff ? 'handoff' : choice.ack ? 'wait' : 'task', taskId: t.id, time: 0, duration: choice.duration, choice });
    feedback(s, t.kind === 'safety' ? '依眼前情境完成確認…' : choice.handoff ? '聯繫同事交接，完成後仍需等候送達…' : choice.ack ? '正在說明等候安排…' : '正在協助旅客…');
  }
  return true;
}
// Press/release controls complete work; elapsed time alone never advances a step.
function updateActionProgress(a){const i=a.interaction;a.time=a.duration*(i.index+Math.min(.45,i.fill/.65*.45))/i.steps.length;}
function nextActionStep(s){const a=s.action,i=a.interaction;i.index++;i.fill=0;i.held=false;i.retry=false;
 if(i.index>=i.steps.length){finishAction(s);return;}updateActionProgress(a);}
export function actionInput(s,input){
 const a=s.action,i=a?.interaction;
 if(!i)return false;
 if(input==='cancel'){i.held=false;i.fill=0;updateActionProgress(a);return true;}
 if(s.status!=='playing'||s.dialog||s.lesson)return false;
 const step=i.steps[i.index];
 if(input==='press'){
   if(i.held)return false;
   if(step.mode==='tap')nextActionStep(s);else{i.held=true;i.fill=0;i.retry=false;}
   return true;
 }
 if(input==='release'&&i.held){
   i.held=false;
   if(i.fill>=.55&&i.fill<=1.05)nextActionStep(s);
   else{i.fill=0;i.retry=true;updateActionProgress(a);feedback(s,'再試一次：按住，進入綠色區域就放開。不扣判斷分。');}
   return true;
 }
 return false;
}
export function dismissLesson(s) {
  if (!s.lesson || s.status !== 'playing') return false;
  if (!['boardingWelcome','boardingReady'].includes(s.lesson.id)&&!s.lessonSeen.includes(s.lesson.id)) s.lessonSeen.push(s.lesson.id);
  if(s.lesson.id==='boardingReady'&&s.boarding?.coach){s.boarding.coach.briefed=true;s.boarding.time=0;s.boarding.formal=true;s.boarding.tutorialStep=4;for(const t of s.tasks)if(!t.done)t.spawn=s.elapsed;}
  s.lesson = null; return true;
}
export function pause(s) {
  if (s.status !== 'playing') return false;
  actionInput(s,'cancel'); s.status = 'paused'; s.player.walking = false; return true;
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
  if(s.boarding)boardingTaskComplete(s,t);
  t.done = true; t.assigned = false; t.handoff = handoff; t.completedAt = s.elapsed; s.completed++; emit(s,'complete',t.id,{handoff});
  if (t.kind === 'service') creditService(s, s.boarding?(t.late?3:10):handoff ? (t.late ? 1 : 3) : (t.late ? 3 : 7));
}
function finishAction(s) {
  const a = s.action, t = s.tasks.find(t => t.id === a.taskId);
  s.action = null;
  if (a.kind === 'clear-hazard') {
    const h = s.hazards.find(h => h.id === a.hazardId);
    if (h && !h.done) { h.done = true;h.returnedAt=s.elapsed; s.hazardsCleared++; emit(s,'hazard-clear',h.taskId); }
    feedback(s, '走道已恢復。原本的服務需求仍需處理，紅色事件不等於已送達。', 'good');
  } else if (a.kind === 'correction') {if(s.recovery)s.recovery.ready=true;feedback(s, `${a.choice.feedback} 可按空白鍵 重選；本次失誤仍保留。`, 'warning');}
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
  s.recovery=null;s.status = 'finished'; s.endReason = reason; s.dialog = null; s.action = null; s.lesson = null;
  s.player.walking = false;
  s.grade = reason !== 'complete' || !chapterReady(s) ? 'incomplete' : s.safetyErrors >= 2 ? 'retry' : s.safetyErrors === 1 ? 'recovered' : 'clean';
  s.result = s.grade; emit(s,'finish',null,{grade:s.grade});
  feedback(s, reason === 'complete' ? '巡艙回報完成。' : '行動時間已用完，查看本輪回顧。', s.grade === 'clean' || s.grade === 'recovered' ? 'good' : 'warning');
}
export function tick(s, dt, input = { x: 0, z: 0 }) {
  if (s.status !== 'playing' || s.dialog || s.lesson || s.recovery?.ready || !Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, .1);
  if(!s.boarding||s.boarding.formal)s.elapsed = s.practice ? s.elapsed + dt : Math.min(s.duration, s.elapsed + dt);
  if(!s.practice){s.timeWarned??=[];for(const level of [30,10])if(s.duration-s.elapsed<=level&&!s.timeWarned.includes(level)){s.timeWarned.push(level);s.timeWarnedAt??={};s.timeWarnedAt[level]=s.elapsed;emit(s,'time-warning',null,{level});}}
  // Deadline evaluation deliberately precedes demand, handoff, and action credit.
  if (!s.practice && s.elapsed + EPSILON >= s.duration) {
    s.elapsed = s.duration; finish(s, 'timeout'); return;
  }
  if(!s.boarding)demandTick(s);
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
    if(s.action.interaction){const i=s.action.interaction;if(i.held){i.fill=Math.min(1.2,i.fill+dt);updateActionProgress(s.action);}}
    else {s.action.time = Math.min(s.action.duration, s.action.time + dt);
    if (s.action.duration - s.action.time <= EPSILON) { s.action.time = s.action.duration; finishAction(s); }}
  } else move(s, input?.x, input?.z, dt);
  for (const h of s.hazards) {
    if (h.collisionPending && !rectBlocked(s.player.x, s.player.z, -.38, .38, h.z - .34, h.z + .34)) h.collisionPending = false;
  }
  if(s.boarding){tickBoarding(s,dt);if(s.boarding.coach?.ready&&!s.boarding.coach.briefed)showLesson(s,'boardingReady');}
  updateNear(s);
}

export function ackRecovery(s){
 if(s.status!=='playing'||!s.recovery?.ready)return false;
 const decision=s.recovery.decision;s.recovery=null;s.dialog=decision;s.player.walking=false;if(s.pendingAisleLesson){s.pendingAisleLesson=false;showLesson(s,'aisle');}return true;
}
