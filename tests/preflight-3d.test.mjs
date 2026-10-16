import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as game from '../public/preflight.mjs';

// Independent first-chapter tests. Completion scenarios use frame inputs only:
// no player, task, clock, score, hazard or inventory state is teleported/set.
// Isolated fixtures for impossible terminal races/gates are labelled explicitly.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { WORLD, createState, start, tick, interact, choose, closeDialog, pause,
  resume, dismissLesson, canStand, move, updateNear, targets, counts, chapterReady } = game;
const DT = 1 / 60, EPS = 1e-8;
const tests = [], simulations = [], evidence = {};
const clone = value => structuredClone(value);
const approx = (a,b,message='') => assert(Math.abs(a-b)<EPS, `${message}: expected ${b}, got ${a}`);
const task = (s,id) => s.tasks.find(t=>t.id===id);
const openHazards = s => s.hazards.filter(h=>!h.done);
const actionKind = s => s.action?.system ?? s.action?.kind;
const dialogId = s => s.dialog?.taskId ?? s.dialog?.id;
const choices = s => s.dialog?.choices ?? [];
const goodSelf = c => c.good && !c.handoff && c.id!=='ask';
const stateView = s => ({ status:s.status, elapsed:+s.elapsed.toFixed(6),
  x:+s.player.x.toFixed(6), z:+s.player.z.toFixed(6), action:actionKind(s),
  completed:s.completed, safetyErrors:s.safetyErrors, servicePenalty:s.servicePenalty,
  handoffTokens:s.handoffTokens, handoffRemaining:s.handoffJob?.remaining ?? null,
  hazards:openHazards(s).map(h=>h.id), grade:s.grade ?? s.result });
function record(s,event,extra={}) { if(s._trace) s._trace.events.push({event,...stateView(s),...extra}); }
function fresh(seed=7, practice=false, traced=false) {
  const s=createState({seed,practice}); assert.equal(start(s),true);
  if(traced) Object.defineProperty(s,'_trace',{value:{seed,practice,events:[],path:[],frames:0,maxStep:0},enumerable:false});
  record(s,'start'); return s;
}
function numericPlayer(s) {
  for(const name of ['x','z','angle','step']) assert(Number.isFinite(s.player[name]),`player.${name} must remain finite`);
}
function frame(s, dt=DT, input={x:0,z:0}) {
  const before={x:s.player.x,z:s.player.z}; tick(s,dt,input); numericPlayer(s);
  const distance=Math.hypot(s.player.x-before.x,s.player.z-before.z);
  assert(distance<=WORLD.speed*Math.min(dt,.1)+EPS,`frame movement cannot exceed configured speed: seed=${s.seed}, elapsed=${s.elapsed}, before=${JSON.stringify(before)}, after=${JSON.stringify({x:s.player.x,z:s.player.z})}, distance=${distance}, allowed=${WORLD.speed*Math.min(dt,.1)}`);
  assert(canStand(s,s.player.x,s.player.z),'every normal frame ends in a legal position');
  if(s._trace) {
    s._trace.frames++; s._trace.maxStep=Math.max(s._trace.maxStep,distance);
    if(s._trace.frames%15===0||distance===0&&s.action?.time===0) s._trace.path.push([+s.elapsed.toFixed(6),+s.player.x.toFixed(6),+s.player.z.toFixed(6)]);
  }
}
function dismiss(s) {
  if(s.lesson) { record(s,`lesson:${typeof s.lesson==='string'?s.lesson:s.lesson.id}`); assert.equal(dismissLesson(s),true); }
}
function advance(s, seconds, {autoLessons=true,input={x:0,z:0}}={}) {
  for(let t=0;t<seconds-EPS;t+=DT) { if(autoLessons) dismiss(s); frame(s,Math.min(DT,seconds-t),input); }
  if(autoLessons) dismiss(s);
}
function untilElapsed(s,value) {
  assert(value>=s.elapsed-EPS);
  while(s.elapsed<value-EPS&&s.status==='playing') { dismiss(s); frame(s,Math.min(DT,value-s.elapsed)); }
  dismiss(s);
}
function finishAction(s) {
  assert(s.action,'an action must exist'); const kind=actionKind(s),before={x:s.player.x,z:s.player.z};
  let guard=0;
  while(s.action&&s.status==='playing'&&guard++<2000) {
    dismiss(s); frame(s,Math.min(DT,s.action.duration-s.action.time||DT),{x:1,z:1});
    approx(s.player.x,before.x,'action freezes x'); approx(s.player.z,before.z,'action freezes z');
  }
  assert(guard<2000,`action ${kind} must terminate`); dismiss(s); record(s,`action-complete:${kind}`);
}
function clearHazard(s) {
  assert(s.near?.startsWith('hazard-')); const id=s.near;
  assert.equal(interact(s),true); assert.equal(actionKind(s),'clear-hazard');
  assert.equal(s.action.duration,5); record(s,`clear:${id}`); finishAction(s);
  assert(s.hazards.find(h=>h.id===id).done); return true;
}
function walkZ(s,z,{hesitation=0,clear=true}={}) {
  if(hesitation) advance(s,hesitation);
  let guard=0;
  while(Math.abs(s.player.z-z)>EPS&&s.status==='playing'&&guard++<5000) {
    dismiss(s); updateNear(s);
    if(clear&&s.near?.startsWith('hazard-')) { clearHazard(s); continue; }
    const bag=task(s,'bag');
    if(clear&&!bag.done&&bag.variant!==2&&s.near==='bag'&&((s.player.z<bag.z&&z>bag.z)||(s.player.z>bag.z&&z<bag.z))) {
      assert.equal(interact(s),true);pick(s,goodSelf);finishAction(s);continue;
    }
    const distance=z-s.player.z;
    frame(s,Math.min(DT,Math.abs(distance)/WORLD.speed),{x:0,z:Math.sign(distance)});
  }
  if(s.status==='finished') return false;
  assert(guard<5000,`walk to z=${z} stuck at ${s.player.z}`);
  approx(s.player.z,z,'walking reaches requested row');
  updateNear(s); if(clear&&s.near?.startsWith('hazard-')) clearHazard(s);
  record(s,`arrive:${z}`); return true;
}
function openTask(s,id,hesitation=0) {
  const t=task(s,id); if(!t.active) untilElapsed(s,t.spawn);
  const destination=t.z+(s.player.z>t.z?.85:-.85);
  if(!walkZ(s,destination,{hesitation})) return false;
  assert.equal(interact(s),true,`interact at ${id}`); assert.equal(dialogId(s),id,`dialog for ${id}`);
  record(s,`open:${id}`,{description:s.dialog.description,choices:choices(s).map(c=>({text:c.text??c.label,good:c.good,tags:c.tags}))});
  return true;
}
function pick(s,predicate) {
  const index=typeof predicate==='number'?predicate:choices(s).findIndex(predicate);
  assert(index>=0,'requested choice must exist'); const selected=clone(choices(s)[index]);
  assert.equal(choose(s,index),true); record(s,'choose',{choice:selected}); return selected;
}
function serve(s,id,mode='self',hesitation=0) {
  if(!openTask(s,id,hesitation)) return false;
  pick(s,mode==='handoff'?c=>c.handoff:mode==='ack'?c=>c.ack:goodSelf);
  finishAction(s); return s.status==='playing';
}
function finishChapter(s,hesitation=0) {
  if(s.handoffJob) advance(s,s.handoffJob.remaining);
  if(!walkZ(s,WORLD.reportPoint?.z??1.6,{hesitation})) return false;
  assert(chapterReady(s),'chapter must be ready before report');
  assert.equal(interact(s),true); record(s,'report'); assert.equal(s.status,'finished'); return true;
}
function completeRoute({seed=7,errors=0,hesitation=0,handoff=false,strategy='safety-first'}={}) {
  const s=fresh(seed,false,true);
  const safety=s.tasks.filter(t=>t.kind==='safety').sort((a,b)=>a.z-b.z);
  for(const [index,t] of safety.entries()) {
    if(t.done) continue;
    if(!openTask(s,t.id,hesitation)) break;
    for(let n=0;index===0&&n<errors;n++) {pick(s,c=>!c.good);finishAction(s);assert.equal(interact(s),true);}
    pick(s,goodSelf);finishAction(s);
  }
  for(const id of ['water','blanket']) {
    if(s.status!=='playing') break;
    serve(s,id,handoff&&id==='water'?'handoff':'self',hesitation);
  }
  if(s.status==='playing') finishChapter(s,hesitation);
  const result={seed,strategy,errors,hesitation,handoff,...stateView(s),remaining:+(s.duration-s.elapsed).toFixed(6),
    safetyDone:s.tasks.filter(t=>t.kind==='safety'&&t.done).length,serviceDone:s.tasks.filter(t=>t.kind==='service'&&t.done).length,
    hazardsTriggered:s.hazards.length,hazardsCleared:s.hazardsCleared,
    route:s._trace}; simulations.push(result); return s;
}
function test(name,run) {
  try {run();tests.push({name,passed:true});console.log('PASS',name);}
  catch(error){tests.push({name,passed:false,error:error.message,stack:error.stack});console.error('FAIL',name,'\n',error.stack);}
}

// TESTS

test('world contract has six rows, 100-second clock and isolated state',()=>{
  assert.deepEqual(WORLD.rows,[3,5,7,9,11,13]);approx(WORLD.radius,.23);approx(WORLD.speed,2.35);
  approx(WORLD.interactionRadius,1.1);approx(WORLD.minZ,.45);approx(WORLD.maxZ,15.5);
  const a=createState({seed:7}),b=createState({seed:7});assert.notEqual(a.runId,b.runId);assert.deepEqual({...a,runId:null},{...b,runId:null});
  assert.equal(a.duration,100);assert.equal(a.status,'briefing');assert.equal(a.tasks.length,5);
  assert.equal(a.safety,100);assert.equal(a.comfort,80);assert.equal(a.completed,0);
  assert.equal(a.handoffTokens,1);assert.equal(a.handoffJob,null);assert.equal(a.lesson,null);
  assert.equal(a.dialog,null);assert.equal(a.action,null);assert.equal(chapterReady(a),false);
  a.tasks[0].done=true;a.player.x=1;a.lessonSeen.push('correction');
  assert.equal(b.tasks[0].done,false);assert.equal(b.player.x,0);assert.deepEqual(b.lessonSeen,[]);
});
test('seeded rows, side and variants exactly match the original 2D scenario generator',()=>{
  const seats=new Set(),variants={bag:new Set(),belt:new Set(),tray:new Set()};
  for(const seed of [1,7,37,101,1001,9999,135791,246810,9876543]) {
    let n=seed>>>0;const rand=()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296);
    const rows=[0,1,2,3,4,5];for(let i=5;i>0;i--){const j=Math.floor(rand()*(i+1));[rows[i],rows[j]]=[rows[j],rows[i]];}
    const s=createState({seed});assert.equal(new Set(s.tasks.map(t=>t.row)).size,5);
    for(const [i,t] of s.tasks.entries()) {
      const side=rand()>.5?'left':'right',variant=Math.floor(rand()*3);
      assert.equal(t.row,rows[i]);assert.equal(t.side,side);assert.equal(t.variant,variant);
      assert.equal(t.seat,`${rows[i]+1}${side==='left'?'B':'C'}`);assert.equal(t.z,WORLD.rows[t.row]);
      if(variants[t.id]) variants[t.id].add(t.variant);
    }
    seats.add(s.tasks.map(t=>t.seat).join(','));
  }
  assert(seats.size>=6);for(const values of Object.values(variants)) assert.equal(values.size,3);
});
test('briefing and terminal APIs cannot start gameplay implicitly',()=>{
  const s=createState();const before=clone(s);tick(s,DT,{x:0,z:1});move(s,1,1,DT);
  assert.equal(interact(s),false);assert.equal(choose(s,0),false);assert.equal(pause(s),false);assert.equal(resume(s),false);
  assert.equal(dismissLesson(s),false);assert.deepEqual(s,before);assert.equal(start(s),true);assert.equal(start(s),false);
});
test('nonfinite positions and all outer world boundaries are enforced',()=>{
  const s=fresh();for(const v of [NaN,Infinity,-Infinity,undefined,null,'0',{},[]]) {
    assert.equal(canStand(s,v,2),false);assert.equal(canStand(s,0,v),false);
  }
  assert.equal(canStand(s,WORLD.minX,2),true);assert.equal(canStand(s,WORLD.maxX,2),true);
  assert.equal(canStand(s,0,WORLD.minZ),true);assert.equal(canStand(s,0,WORLD.maxZ),true);
  assert.equal(canStand(s,WORLD.minX-.001,2),false);assert.equal(canStand(s,WORLD.maxX+.001,2),false);
  assert.equal(canStand(s,0,WORLD.minZ-.001),false);assert.equal(canStand(s,0,WORLD.maxZ+.001),false);
});
test('both seat banks, front and rear fixtures remain solid with radius clearance',()=>{
  const s=fresh();
  for(const z of WORLD.rows)for(const side of [-1,1]){
    assert.equal(canStand(s,side*1.6,z),false);assert.equal(canStand(s,side*.60,z),false);
    assert.equal(canStand(s,side*1.6,z+.70),false);assert.equal(canStand(s,side*1.6,z+.72),true);
  }
  for(const z of [.8,14.9])for(const side of [-1,1])assert.equal(canStand(s,side*1.3,z),false);
});
test('an aisle bag blocks crossing until its timed action completes',()=>{
  const s=fresh(7);const bag=task(s,'bag');assert.notEqual(bag.variant,2);
  walkZ(s,bag.z-.85);assert.equal(s.near,'bag');
  for(let x=WORLD.minX;x<=WORLD.maxX;x+=.01)assert.equal(canStand(s,x,bag.z),false);
  advance(s,1,{input:{x:0,z:1}});assert(s.player.z<=bag.z-.36-WORLD.radius+EPS);
  assert.equal(interact(s),true);const c=pick(s,goodSelf);advance(s,c.duration-DT);
  assert.equal(bag.done,false);assert.equal(canStand(s,0,bag.z),false);frame(s);
  assert.equal(bag.done,true);assert.equal(canStand(s,0,bag.z),true);walkZ(s,bag.z+.85);
});
test('movement normalization, dt clamp and finite-axis guards preserve a bounded speed',()=>{
  const cardinal=fresh(),diagonal=fresh();frame(cardinal,.1,{x:0,z:1});frame(diagonal,.1,{x:1,z:1});
  approx(Math.hypot(cardinal.player.x,cardinal.player.z-1.5),WORLD.speed*.1);
  approx(Math.hypot(diagonal.player.x,diagonal.player.z-1.5),WORLD.speed*.1);
  const delayed=fresh();tick(delayed,1000,{x:0,z:1});approx(delayed.elapsed,.1);approx(delayed.player.z,1.735);
  for(const input of [null,{},[],{x:NaN,z:1},{x:Infinity,z:1},{x:1,z:NaN},{x:'1',z:0},{x:0,z:'1'},{x:null,z:1}]){
    const s=fresh(),before=clone(s.player);assert.doesNotThrow(()=>frame(s,DT,input));
    if(!Number.isFinite(input?.x))assert.equal(s.player.x,before.x);
    if(!Number.isFinite(input?.z))assert.equal(s.player.z,before.z);
  }
});
test('invalid dt and choice indices leave state unchanged',()=>{
  for(const dt of [0,-1,NaN,Infinity,-Infinity,null,undefined,'0.1']){
    const s=fresh(),before=clone(s);tick(s,dt,{x:1,z:1});assert.deepEqual(s,before);
    move(s,1,1,dt);assert.deepEqual(s,before);
  }
  const s=fresh();openTask(s,'bag');const before=clone(s);
  for(const index of [-1,3,4,.5,NaN,Infinity,null,undefined,'0',{},[]]){
    assert.equal(choose(s,index),false);assert.deepEqual(s,before);
  }
});
test('createState sanitizes invalid seed values and non-object options',()=>{
  for(const options of [null,undefined,{},[],0,'bad',{seed:NaN},{seed:Infinity},{seed:'7'},{seed:null}]){
    let s;assert.doesNotThrow(()=>s=createState(options));numericPlayer(s);
    assert.equal(s.tasks.length,5);assert(Number.isFinite(s.seed));
    assert(s.tasks.every(t=>Number.isInteger(t.variant)&&t.variant>=0&&t.variant<=2));
  }
});
test('all six choice permutations occur and replaying a seed repeats orders',()=>{
  const s=fresh(101);openTask(s,'bag');const orders=new Set();
  for(let i=0;i<48;i++){
    const order=choices(s).map(c=>c.id);orders.add(order.join(','));assert.equal(new Set(order).size,3);
    assert.equal(choices(s).filter(c=>c.good).length,1);closeDialog(s);assert.equal(interact(s),true);
  }
  assert.equal(orders.size,6);evidence.choicePermutations=[...orders];
  const a=fresh(37),b=fresh(37);openTask(a,'bag');openTask(b,'bag');assert.deepEqual(a.dialog,b.dialog);
});
test('every safety variant states its observable clue and has one appropriate action',()=>{
  const expected={bag:[['空位','stow'],['已滿','stow'],['已收妥','check']],
    belt:[['手機','attention'],['圖示','diagram'],['扣好','check']],
    tray:[['清空','fold'],['咖啡','assist'],['收妥','check']]};
  const seen={bag:new Set(),belt:new Set(),tray:new Set()};
  for(const seed of Array.from({length:16},(_,i)=>(i+1)*7919))for(const id of ['bag','belt','tray']){
    const s=fresh(seed);openTask(s,id);const t=task(s,id),[clue,correct]=expected[id][t.variant];
    assert(s.dialog.quote.length>0);assert(s.dialog.description.includes(clue));
    assert.equal(choices(s).filter(c=>c.good).length,1);assert.equal(choices(s).find(c=>c.good).id,correct);
    for(const c of choices(s)){assert(c.label.length>0);assert(Number.isFinite(c.duration));assert(c.tags.every(tag=>/\d/.test(tag)),'all choice tags must be neutral numeric information');}
    seen[id].add(t.variant);
  }
  for(const [id,values]of Object.entries(seen))assert.equal(values.size,3,id);
});
test('Departure-time question is removed from the chapter',()=>{assert(!fresh().tasks.some(t=>t.id==='question'));});
test('practice reading freezes elapsed, movement, demand timers and all progress',()=>{
  const s=fresh(7,true);openTask(s,'bag');const before=clone(s);
  advance(s,60,{input:{x:1,z:1},autoLessons:false});assert.deepEqual(s,before);
  move(s,1,1,.1);assert.deepEqual(s,before);assert.equal(interact(s),false);
  assert.equal(closeDialog(s),true);frame(s);assert(s.elapsed>before.elapsed);
});
test('wrong safety choice pauses for first explanation then costs exactly two seconds',()=>{
  const s=fresh();openTask(s,'bag');const at=s.elapsed,wrong=pick(s,c=>!c.good);
  assert.equal(s.safetyErrors,1);assert.equal(s.mistakes,1);assert.equal(s.safety,80);
  assert.equal(actionKind(s),'correction');assert.equal(s.action.duration,2);assert.equal(task(s,'bag').done,false);
  assert.equal(s.feedback,wrong.feedback);assert.equal(s.feedbackKind,'warning');
  assert.equal(s.lesson.id,'correction');assert.match(s.lesson.copy,/2 秒/);const frozen=clone(s);
  advance(s,30,{autoLessons:false,input:{x:1,z:1}});assert.deepEqual(s,frozen);approx(s.elapsed,at);
  assert.equal(choose(s,0),false);assert.equal(interact(s),false);dismiss(s);
  advance(s,2-DT);assert(s.action);assert.equal(interact(s),false);assert.equal(choose(s,0),false);
  frame(s);assert.equal(s.action,null);approx(s.elapsed,at+2);
  assert.equal(s.safetyErrors,1);assert.equal(s.mistakes,1);assert.equal(s.safety,80);assert.equal(task(s,'bag').done,false);
  assert.equal(interact(s),true);pick(s,c=>!c.good);assert.equal(s.lesson,null,'first correction tip is not repeated');
  assert.equal(s.action.duration,2);finishAction(s);
  assert.equal(s.safetyErrors,2);assert.equal(s.mistakes,2);assert.equal(s.safety,60);assert.equal(task(s,'bag').mistakes,2);
});
test('formal correction pause freezes the exact remaining time and preserves penalties',()=>{
  const s=fresh();openTask(s,'bag');pick(s,c=>!c.good);dismiss(s);advance(s,.75);
  assert.equal(pause(s),true);const frozen=clone(s);advance(s,20,{autoLessons:false});assert.deepEqual(s,frozen);
  assert.equal(interact(s),false);assert.equal(choose(s,0),false);assert.equal(resume(s),true);
  advance(s,1.25-DT);assert(s.action);assert.equal(interact(s),false);frame(s);assert.equal(s.action,null);
  assert.equal(s.safetyErrors,1);assert.equal(s.safety,80);assert.equal(interact(s),true);
});
test('explicit pause freezes active actions, lessons, dialog and handoff clocks',()=>{
  for(const mode of ['movement','dialog','action','lesson','handoff']){
    const s=fresh(7);
    if(mode==='dialog'||mode==='action'||mode==='lesson'){
      openTask(s,'bag');if(mode==='action'){pick(s,goodSelf);advance(s,.5);}if(mode==='lesson')pick(s,c=>!c.good);
    }
    if(mode==='handoff')serve(s,'water','handoff');
    assert.equal(pause(s),true);const before=clone(s);advance(s,10,{autoLessons:false,input:{x:1,z:1}});
    move(s,1,1,.1);assert.deepEqual(s,before);assert.equal(choose(s,0),false);assert.equal(interact(s),false);
    assert.equal(pause(s),false);assert.equal(resume(s),true);assert.equal(resume(s),false);
    if(mode==='lesson'){const current=clone(s);frame(s);assert.deepEqual(s,current);}
    else {frame(s);assert(s.elapsed>before.elapsed);}
  }
});
test('completed safety actions credit once and cannot be repeated',()=>{
  const s=fresh();openTask(s,'bag');pick(s,goodSelf);const duration=s.action.duration;
  assert.equal(choose(s,0),false);assert.equal(interact(s),false);advance(s,duration-DT);assert.equal(s.completed,0);
  frame(s);assert.equal(task(s,'bag').done,true);assert.equal(s.completed,1);
  const score=s.safety;advance(s,1);assert.equal(s.completed,1);assert.equal(s.safety,score);
  assert(!targets(s).some(t=>t.id==='bag'));
});
test('delegated recording completes in 1 second without delivery or reduced credit',()=>{
 const s=fresh(7);openTask(s,'water');const before=s.comfort;pick(s,c=>c.handoff);
 assert.equal(s.action.duration,1);advance(s,1-DT);assert(!task(s,'water').done);frame(s);
 assert(task(s,'water').done&&task(s,'water').deferred&&task(s,'water').handoff);assert.equal(s.handoffJob,null);assert.equal(s.handoffTokens,0);assert.equal(s.comfort,before+8);
});
test('formal dialog keeps counting without restoring unavailable delegation',()=>{
  const s=fresh(7);serve(s,'water','handoff');openTask(s,'blanket');const before=clone(s);
  advance(s,1,{autoLessons:false});approx(s.elapsed,before.elapsed+1);assert.deepEqual(s.player,before.player);assert.deepEqual(s.dialog,before.dialog);assert(!choices(s).some(c=>c.handoff));
  assert.equal(s.handoffTokens,0);assert.equal(task(s,'blanket').done,false);assert.equal(s.mistakes,0);
});
test('recording a deferred request takes 3 seconds and stops patience permanently',()=>{
 const s=fresh(7),patience=task(s,'water').patience;openTask(s,'water');pick(s,c=>c.ack);
 advance(s,3-DT);assert(!task(s,'water').done);frame(s);assert(task(s,'water').done&&task(s,'water').deferred);
 assert.equal(task(s,'water').patience,patience);assert(!targets(s).some(t=>t.id==='water'));advance(s,20);assert(!task(s,'water').late);assert.equal(s.mistakes,0);
});
test('personal service with unresolved visible baggage is a retained safety error',()=>{
  // Seed 7 places water before the solid bag, making this mistake physically reachable.
  const s=fresh(7);assert.notEqual(task(s,'bag').variant,2);openTask(s,'water');
  assert.equal(task(s,'bag').done,false);const c=choices(s).find(c=>c.id==='serve');
  assert.equal(c.good,false);assert.equal(c.safetyError,true);assert.match(s.dialog.description,/最後安全檢查/);
  pick(s,c=>c.id==='serve');finishAction(s);assert.equal(s.safetyErrors,1);assert.equal(s.safety,80);
  assert.equal(task(s,'water').done,false);assert.equal(task(s,'bag').done,false);
});
test('service spawns at 0 and 5 seconds and warns exactly 10 seconds before each hazard',()=>{
  const s=fresh(7);assert.deepEqual(['water','blanket'].map(id=>task(s,id).active),[true,false]);
  untilElapsed(s,5-DT);assert.equal(task(s,'blanket').active,false);frame(s);assert.equal(task(s,'blanket').active,true);
  for(const [id,spawn,patience]of [['water',0,32],['blanket',5,39]]){
    const q=fresh(7);assert.equal(task(q,id).spawn,spawn);assert.equal(task(q,id).patience,patience);
    untilElapsed(q,spawn+patience-10-DT);assert.equal(task(q,id).warned,false);frame(q);assert.equal(task(q,id).warned,true);
    assert.equal(task(q,id).late,false);untilElapsed(q,spawn+patience-DT);assert.equal(task(q,id).late,false);frame(q);
    assert.equal(task(q,id).late,true);assert(q.hazards.some(h=>h.id===`hazard-${id}`));
  }
});
test('late-service hazard blocks crossing, is recoverable in 5 seconds and leaves original demand open',()=>{
  const s=fresh(7);untilElapsed(s,32);assert.equal(task(s,'water').late,true);
  const h=s.hazards.find(h=>h.id==='hazard-water');assert(h);assert.equal(canStand(s,0,h.z),false);
  const penalty=s.servicePenalty;advance(s,1);assert.equal(s.servicePenalty,penalty);
  walkZ(s,h.z-.85,{clear:false});assert.equal(s.near,h.id);assert.equal(interact(s),true);
  advance(s,5-DT);assert.equal(h.done,false);frame(s);assert.equal(h.done,true);assert.equal(s.hazardsCleared,1);
  assert.equal(task(s,'water').done,false);assert.equal(canStand(s,0,h.z),true);
  serve(s,'bag');serve(s,'water');assert.equal(task(s,'water').done,true);
  assert(s.servicePenalty>=8);assert(s.comfort<=100-s.servicePenalty);
});
test('first aisle lesson is remembered and further hazards still accrue consequences',()=>{
  const s=fresh(7);untilElapsed(s,32-DT);frame(s);assert.equal(s.lesson.id,'aisle');dismiss(s);
  untilElapsed(s,44-DT);frame(s);assert.equal(s.lesson,null);assert.equal(s.hazards.length,2);
  assert.equal(s.servicePenalty,16);assert.equal(s.lessonSeen.filter(id=>id==='aisle').length,1);
});
test('report requires all three safety confirmations and no open hazards',()=>{
  // Isolated prerequisite fixtures validate every finish-gate combination.
  for(const missing of ['bag','belt','tray','hazard']){
    const s=fresh();for(const t of s.tasks)t.done=t.id!==missing;
    s.completed=s.tasks.filter(t=>t.done).length;
    if(missing==='hazard')s.hazards.push({id:'hazard-water',taskId:'water',x:0,z:13,done:false});
    assert.equal(chapterReady(s),false);assert.equal(interact(s),false);assert.equal(s.status,'playing');assert.equal(s.reportAttempted,true);
  }
});
test('recorded service need not be delivered before the cabin-secure report',()=>{
 const s=fresh(6);for(const t of s.tasks.filter(t=>t.kind==='safety').sort((a,b)=>a.z-b.z))if(!t.done)serve(s,t.id);
 serve(s,'water','handoff');assert.equal(s.handoffJob,null);assert(task(s,'water').deferred);assert(chapterReady(s));
 walkZ(s,WORLD.reportPoint.z);assert(interact(s));assert.equal(s.status,'finished');
});
test('hard cutoff cancels a nearly complete task and pending handoff before same-frame credit',()=>{
  // Exact terminal-race fixture: only elapsed/action remaining are set deliberately.
  const s=fresh();openTask(s,'bag');pick(s,goodSelf);s.elapsed=100-DT;s.action.time=s.action.duration-DT;
  frame(s);assert.equal(s.elapsed,100);assert.equal(s.status,'finished');assert.equal(s.action,null);
  assert.equal(task(s,'bag').done,false);assert.equal(s.grade,'incomplete');
  const h=fresh(7);openTask(h,'water');pick(h,c=>c.handoff);h.elapsed=100-DT;h.action.time=h.action.duration-DT;
  frame(h);assert.equal(task(h,'water').done,false);assert.equal(h.status,'finished');assert.equal(h.grade,'incomplete');
});
test('ignoring all requests times out incomplete with both hazards retained',()=>{
  const s=fresh();untilElapsed(s,100);assert.equal(s.status,'finished');assert.equal(s.grade,'incomplete');
  assert.equal(s.elapsed,100);assert.equal(s.hazards.length,2);assert.equal(s.completed,0);
  const before=clone(s);advance(s,5);assert.deepEqual(s,before);assert.equal(interact(s),false);assert.equal(choose(s,0),false);
  assert.equal(pause(s),false);assert.equal(resume(s),false);assert.equal(start(s),false);move(s,1,1,.1);assert.deepEqual(s,before);
});
test('practice wrong choices reopen the same ordered dialog immediately with specific feedback',()=>{
  for(const seed of [1,7,37,101])for(const id of ['bag','belt','tray','water','blanket']){
    const s=fresh(seed,true);
    if(['water','blanket'].includes(id))serve(s,'bag');
    openTask(s,id);
    const initial=clone(s),dialog=s.dialog,order=choices(s).map(c=>c.id),wrongChoices=choices(s).filter(c=>!c.good);
    if(['bag','belt','tray'].includes(id))assert(wrongChoices.length>0,`${id} has a visible judgment error`);else assert(wrongChoices.some(c=>c.id==='serve'),'ordinary delivery during final checks is a contextual mistake');
    for(const wrong of [...wrongChoices,...wrongChoices]){
      pick(s,c=>c.id===wrong.id);
      assert.equal(s.action,null,'practice correction must not create a wait action');
      assert.equal(s.lesson,null,'practice correction must not require a lesson or acknowledgement');
      assert.equal(dialogId(s),id);assert.equal(s.dialog,dialog);assert.deepEqual(choices(s).map(c=>c.id),order);assert.deepEqual(choices(s),initial.dialog.choices);
      assert(s.dialog.recoveryFeedback.includes(wrong.feedback));assert.equal(s.feedback,s.dialog.recoveryFeedback);
      assert.equal(s.dialog.description,initial.dialog.description);assert.equal(s.dialog.quote,initial.dialog.quote);
      assert.deepEqual(s.tasks,initial.tasks,'wrong retries do not mutate task progress or mistake counters');
      assert.deepEqual(s.hazards,initial.hazards);assert.deepEqual(s.lessonSeen,initial.lessonSeen);
      for(const field of ['elapsed','completed','safety','comfort','safetyErrors','mistakes','servicePenalty','handoffTokens'])assert.equal(s[field],initial[field],field);
      const frozen=clone(s);advance(s,3,{autoLessons:false,input:{x:1,z:1}});assert.deepEqual(s,frozen,'reading retry feedback remains frozen');
    }
    const correct=pick(s,goodSelf);assert.equal(s.dialog,null);assert.equal(s.action.kind,correct.ack?'wait':'task');
    assert.equal(s.action.duration,correct.duration,'correct choices retain physical action duration');finishAction(s);
    assert.equal(task(s,id).done,true);assert.equal(s.safetyErrors,0);assert.equal(s.mistakes,0);
    assert.equal(s.safety,100);assert.equal(s.servicePenalty,0);
  }
});
test('practice retry survives pause, remains untimed and does not contaminate formal state',()=>{
  const s=fresh(7,true);openTask(s,'bag');pick(s,c=>!c.good);const dialog=clone(s.dialog);
  assert.equal(pause(s),true);const frozen=clone(s);advance(s,15,{autoLessons:false});assert.deepEqual(s,frozen);
  assert.equal(choose(s,0),false);assert.equal(resume(s),true);assert.deepEqual(s.dialog,dialog);
  assert.equal(closeDialog(s),true);advance(s,110);assert.equal(s.status,'playing');assert(s.elapsed>100);
  assert.equal(s.safetyErrors,0);assert.equal(s.mistakes,0);assert.equal(s.safety,100);assert.equal(s.servicePenalty,0);
  assert.equal(task(s,'bag').done,false);assert.equal(s.tasks.length,5);assert(!s.lessonSeen.includes('correction'));
  const formal=fresh(7);assert.equal(formal.dialog,null);assert.equal(formal.action,null);assert.equal(formal.elapsed,0);
  openTask(formal,'bag');pick(formal,c=>!c.good);assert.equal(formal.action.duration,2);
  assert.equal(formal.lesson.id,'correction');assert.equal(formal.safetyErrors,1);assert.equal(formal.safety,80);
});
test('fresh replay clears task completion, penalties, jobs, lessons, dialogs, clocks and position',()=>{
  const used=fresh(7);serve(used,'water','handoff');openTask(used,'bag');pick(used,c=>!c.good);
  const replay=createState({seed:7});assert.deepEqual({...replay,runId:null},{...createState({seed:7}),runId:null});
  assert.equal(replay.elapsed,0);assert.equal(replay.safetyErrors,0);assert.equal(replay.servicePenalty,0);
  assert.equal(replay.handoffTokens,1);assert.equal(replay.handoffJob,null);assert.deepEqual(replay.lessonSeen,[]);
  assert.equal(replay.player.z,1.5);assert(replay.tasks.every(t=>!t.done&&!t.assigned&&!t.acknowledged));
});
test('normal, one-error and two-error physical routes retain independent safety grading',()=>{
  for(const errors of [0,1,2]){
    const s=completeRoute({seed:7,errors});assert.equal(s.status,'finished');assert.equal(s.completed,5);
    assert.equal(s.grade,['clean','recovered','retry'][errors]);assert.equal(s.safetyErrors,errors);
    assert.equal(s.safety,100-errors*20);assert.equal(openHazards(s).length,0);assert(s.elapsed<100);
  }
});
for(const seed of [1,2,3,4,5,6,7,8])for(const errors of [0,1,2])test(`seed ${seed}: ${errors} safety errors, two-second hesitation, one handoff`,()=>{
  const s=completeRoute({seed,errors,hesitation:2,handoff:true,strategy:'safety-first-one-handoff-human-paced'});
  assert.equal(s.completed,5,`seed ${seed}, ${errors} errors at ${s.elapsed}s`);
  assert.equal(s.grade,['clean','recovered','retry'][errors]);assert.equal(openHazards(s).length,0);assert(s.elapsed<100);
});


test('100-second deadline cannot replace the explicit front report',()=>{
  // Isolated all-ready fixture distinguishes task readiness from actual reporting.
  const s=fresh();for(const t of s.tasks)t.done=true;s.completed=6;
  assert.equal(chapterReady(s),true);assert.equal(s.status,'playing');untilElapsed(s,100);
  assert.equal(s.status,'finished');assert.equal(s.endReason,'timeout');assert.equal(s.grade,'incomplete');
  const reported=fresh();for(const t of reported.tasks)t.done=true;reported.completed=6;
  assert.equal(interact(reported),true);assert.equal(reported.grade,'clean');assert.equal(reported.endReason,'complete');
});
test('all three action clocks finish exactly at 30, 60 and 120 Hz',()=>{
  for(const fps of [30,60,120])for(const mode of ['correct','wrong','handoff','wait']){
    const s=fresh(7);openTask(s,mode==='correct'||mode==='wrong'?'bag':'water');
    pick(s,mode==='correct'?goodSelf:mode==='wrong'?c=>!c.good:mode==='handoff'?c=>c.handoff:c=>c.ack);dismiss(s);
    const duration=s.action.duration,at=s.elapsed;
    for(let n=0;n<duration*fps-1;n++)frame(s,1/fps);
    assert(s.action,`${mode} still active before deadline at ${fps} Hz`);frame(s,1/fps);
    assert.equal(s.action,null,`${mode} ends exactly at deadline at ${fps} Hz`);approx(s.elapsed,at+duration);
  }
});
test('recording on-time service earns eight comfort and no safety compensation',()=>{
  const s=fresh(7);serve(s,'bag');const comfort=s.comfort,safety=s.safety;
  serve(s,'water');assert.equal(task(s,'water').late,false);assert.equal(s.comfort,comfort+8);assert.equal(s.safety,safety);
  assert.equal(task(s,'water').handoff,false);assert.equal(s.handoffTokens,1);
});
test('late service penalties cap subsequent comfort credits',()=>{
  const s=fresh(7);untilElapsed(s,45);assert(s.servicePenalty>=8);
  for(const t of s.tasks.filter(t=>t.kind==='safety').sort((a,b)=>a.z-b.z))if(!t.done)serve(s,t.id);
  for(const id of ['water','blanket'])serve(s,id);
  finishChapter(s);assert.equal(s.grade,'clean');assert.equal(s.safety,100);
  assert(s.comfort<=100-s.servicePenalty);assert(s.comfort<100);
});
test('all row targets are physically reachable from either side of the center aisle',()=>{
  const encountered=new Set();
  for(const seed of [1,7,37,101,1001,135791,246810,7919,9999])for(const side of [-1,1])for(const id of ['bag','belt','tray','water','blanket']){
    const s=fresh(seed);const goal=side*.4;
    while(Math.abs(s.player.x-goal)>EPS)frame(s,Math.min(DT,Math.abs(goal-s.player.x)/WORLD.speed),{x:side,z:0});
    assert(openTask(s,id));assert.equal(dialogId(s),id);assert(Math.abs(s.player.x-goal)<EPS);
    encountered.add(`${task(s,id).row}:${task(s,id).side}`);
  }
  assert.equal(encountered.size,12,'all six rows and both assigned sides were approached physically');
});
test('normal diagonal motion cannot tunnel through seats, bag, galley or hull',()=>{
  for(const side of [-1,1]){
    const s=fresh(7);walkZ(s,2);advance(s,.6,{input:{x:side,z:0}});const x=s.player.x;
    advance(s,1,{input:{x:0,z:1}});assert(s.player.z<=3-.48-WORLD.radius+EPS);
    advance(s,1,{input:{x:0,z:-1}});assert(s.player.z>=1.5+WORLD.radius-EPS);assert.equal(s.player.x,x);
    const bagRun=fresh(7),bag=task(bagRun,'bag');walkZ(bagRun,bag.z-.8);
    advance(bagRun,1,{input:{x:side,z:1}});assert(bagRun.player.z<bag.z-.36);
  }
});
test('independent circle/rectangle oracle validates 24000 seeded random frames',()=>{
  let seed=0x3ca81;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  const obstacles=[...WORLD.rows.flatMap(z=>[[-2.68,-.82,z-.48,z+.48],[.82,2.68,z-.48,z+.48]]),
    [-2.7,-.78,.35,1.5],[.78,2.7,.35,1.5],[-2.7,-.78,14.4,15.6],[.78,2.7,14.4,15.6]];
  for(let trial=0;trial<12;trial++){
    // Unoccupied collision-only fixture removes dynamic obstacles/deadlines.
    const s=fresh(trial,true);for(const t of s.tasks)t.done=true;
    walkZ(s,trial%2?2:14);
    for(let n=0;n<2000;n++){
      frame(s,.005+random()*.195,{x:random()*2-1,z:random()*2-1});
      assert(s.player.x>=WORLD.minX&&s.player.x<=WORLD.maxX&&s.player.z>=WORLD.minZ&&s.player.z<=WORLD.maxZ);
      for(const [left,right,front,back]of obstacles){
        const dx=Math.max(left-s.player.x,0,s.player.x-right),dz=Math.max(front-s.player.z,0,s.player.z-back);
        assert(dx*dx+dz*dz>=WORLD.radius**2-EPS,'independent radius-aware collision oracle');
      }
    }
  }
});
test('counts and targets are read-only and exclude completed or assigned tasks',()=>{
  const s=fresh(7),before=clone(s);const c=counts(s),ts=targets(s);assert.deepEqual(s,before);
  assert.deepEqual([c.safety,c.service,c.hazards,c.completed],[0,0,0,0]);
  assert.equal(ts.filter(t=>t.kind==='safety').length,3);assert.equal(ts.filter(t=>t.kind==='service').length,1);
  assert(ts.some(t=>t.id==='report'));serve(s,'water','handoff');assert(!targets(s).some(t=>t.id==='water'));
  assert.equal(counts(s).service,1);assert.equal(s.handoffJob,null);assert(task(s,'water').deferred);
  assert.equal(counts(s).handoffs,1);assert.equal(counts(s).completed,s.completed);
});


test('a hazard spawning under the player allows speed-bounded exit and prevents re-entry',()=>{
  for(const direction of [-1,1]){
    const s=fresh(7);walkZ(s,task(s,'water').z);const startZ=s.player.z;untilElapsed(s,32);
    const h=s.hazards.find(h=>h.id==='hazard-water');assert(h.collisionPending);
    approx(s.player.z,startZ,'spawning never teleports the player');assert.equal(canStand(s,0,startZ),true);
    advance(s,.4,{input:{x:0,z:direction}});assert.equal(h.collisionPending,false);
    assert.equal(canStand(s,0,startZ),false);const escaped=s.player.z;
    advance(s,1,{input:{x:0,z:-direction}});
    assert((s.player.z-startZ)*direction>=.57-EPS,'the now-solid hazard prevents crossing back');
    assert(Math.abs(s.player.z-startZ)<Math.abs(escaped-startZ));assert.equal(s.near,h.id);
    clearHazard(s);assert.equal(h.done,true);assert.equal(task(s,'water').done,false);walkZ(s,startZ);
  }
});
test('wrong-service correction cannot freeze the original passenger patience deadline',()=>{
  const s=fresh(7);openTask(s,'water');closeDialog(s);untilElapsed(s,30);
  assert.equal(interact(s),true);pick(s,c=>c.id==='serve');dismiss(s);advance(s,2);
  assert.equal(task(s,'water').late,true);assert(s.hazards.some(h=>h.id==='hazard-water'));
  assert.equal(s.safetyErrors,1);assert.equal(actionKind(s),'correction');assert.equal(s.action.duration,2);
  approx(s.action.time,2-DT,'the new aisle tip freezes correction credit on its opening frame');
  frame(s);assert.equal(s.action,null);assert.equal(task(s,'water').done,false);
});
for(const seed of [37,101,1001,7919,9876543])for(const errors of [0,1,2])test(`varied seed ${seed}: human-paced all-self route with ${errors} safety errors`,()=>{
  const s=completeRoute({seed,errors,hesitation:2,handoff:false,strategy:'safety-first-all-self-human-paced'});
  assert.equal(s.completed,5,`seed ${seed}, ${errors} errors at ${s.elapsed}s`);
  assert.equal(s.grade,['clean','recovered','retry'][errors]);assert.equal(openHazards(s).length,0);assert(s.elapsed<100);
});

// RESULTS
const logic=fs.readFileSync(path.join(root,'public/preflight.mjs'));
const result={generatedAt:new Date().toISOString(),suite:'Independent full 3D first chapter',
  command:'node tests/preflight-3d.test.mjs',logicSha256:crypto.createHash('sha256').update(logic).digest('hex'),
  summary:{total:tests.length,passed:tests.filter(t=>t.passed).length,failed:tests.filter(t=>!t.passed).length},
  notes:['All completion scenarios use actual frame movement, interactions and choices, without teleportation.',
    'Trace paths sample physical positions every 15 frames; every frame checks legal position and speed.',
    'Two-second hesitation is a modeled handling/navigation allowance, not a human playtest.',
    'Isolated gate and exact cutoff fixtures are explicitly labelled.',
    'This suite does not establish WebGL rendering or supported-browser interaction quality.'],tests,evidence,simulations};
fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
fs.writeFileSync(path.join(root,'artifacts/preflight-3d-test-results.json'),JSON.stringify(result,null,2)+'\n');
console.log(`\n${result.summary.passed}/${result.summary.total} full 3D preflight tests passed; ${result.summary.failed} failed.`);
if(result.summary.failed) process.exitCode=1;
