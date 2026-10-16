import assert from 'node:assert/strict';
import * as game from '../public/preflight.mjs';
import {trainingFeedback,summarizeResult} from '../public/results.mjs';
import {coworkerPresentation} from '../public/presentation.mjs';

function fresh(practice=false){
 const s=game.createState({seed:7,contextual:true,practice});game.start(s);
 while(s.lesson)game.dismissLesson(s);
 s.lessonSeen=['serviceIntro','aisle','handoff','correction'];return s;
}
function open(s,id){const t=s.tasks.find(t=>t.id===id);t.active=true;s.player.x=0;s.player.z=t.z-.85;assert(game.interact(s));assert.equal(s.dialog.id,id);return t;}
function finish(s){let limit=0;while(s.action&&limit++<100)game.tick(s,.05);assert(!s.action);}
// Check actual completion boundaries in the browser's contextual mode and the
// timed engine mode, with the same timing in assessment and practice.
for(const contextual of [false,true])for(const practice of [false,true])for(const id of ['water','blanket'])for(const method of ['wait','handoff']){
 const s=fresh(practice);s.contextual=contextual;s.handsOn=contextual;
 const t=open(s,id),duration=method==='wait'?3:1;
 const choice=s.dialog.choices.findIndex(c=>c.id===method);game.choose(s,choice);
 const startedAt=s.elapsed;
 for(let i=0;i<duration*20-1;i++)game.tick(s,.05);
 assert(!t.done,`${id}/${method} must remain pending before ${duration} seconds`);
 assert(s.action);const progress=s.action.time;
 game.pause(s);game.tick(s,.1);assert.equal(s.action.time,progress);assert(!t.done);
 game.resume(s);game.tick(s,.05);
 assert(t.done&&t.deferred,`${id}/${method} completes at ${duration} seconds`);
 assert.equal(s.action,null);assert(Math.abs(s.elapsed-startedAt-duration)<1e-8);
 assert.equal(s.comfort,88);assert.equal(s.handoffTokens,method==='handoff'?0:1);
 assert.equal(s.handoffJob,null);
}
for(const id of ['water','blanket'])for(const method of ['wait','handoff'])for(const practice of [false,true]){
 const s=fresh(practice),t=open(s,id),patience=t.patience;
 const choice=s.dialog.choices.findIndex(c=>c.id===method);assert(choice>=0);assert(game.choose(s,choice));assert(!s.feedback.includes('等候送達'),'recording progress never promises immediate delivery');
 assert(!t.done,'not recorded before action finishes');game.pause(s);const elapsed=s.elapsed;game.tick(s,.1);assert.equal(s.elapsed,elapsed);assert(!t.done);game.resume(s);finish(s);
 assert(t.done&&t.deferred&&t.acknowledged,'task complete means request recorded, not delivered');
 assert.equal(t.patience,patience);assert.equal(s.handoffJob,null);assert.equal(t.assigned,false);
 assert.equal(s.comfort,88,'self and delegated recording receive equal credit');
 assert.equal(s.safetyErrors,0);const credits=s.completed;
 // Isolate this request while advancing beyond its original patience deadline.
 s.tasks.filter(other=>other!==t).forEach(other=>{other.patience=999;});
 for(let i=0;i<650;i++)game.tick(s,.1);
 assert(!t.late);assert(!t.warned);assert(!s.hazards.some(h=>h.taskId===id));assert.equal(s.servicePenalty,0);assert.equal(s.completed,credits);
 const feedback=trainingFeedback(s).find(row=>row.id==='service');assert.equal(feedback.status,'improve','one of two recorded requests is incomplete service coverage');assert(feedback.evidence.includes('仍有 1 項需求未記錄'));assert(feedback.evidence.includes('起飛後協助'));assert(!feedback.evidence.includes('已送達'));
 if(method==='handoff'){const coworker=coworkerPresentation(s);assert.equal(coworker.phase,'recorded');assert(!coworker.carrying&&!coworker.walking);assert.equal(s.handoffTokens,0);}
}
for(const bagSafe of [false,true])for(const id of ['water','blanket']){
 const s=fresh(),bag=s.tasks.find(t=>t.id==='bag');bag.variant=bagSafe?2:0;
 s.tasks.filter(t=>t.kind==='safety').forEach(t=>{t.done=bagSafe;});
 open(s,id);const serve=s.dialog.choices.find(c=>c.id==='serve');assert(!serve.good&&serve.safetyError,'final-check phase applies even if aisle baggage is already safe');
 game.choose(s,s.dialog.choices.indexOf(serve));assert.equal(s.safetyErrors,1);finish(s);for(let i=0;i<10;i++)game.tick(s,.1);assert.equal(s.safetyErrors,1,'one deliberate error is counted once');
}
for(const order of [['bag','belt','tray'],['bag','tray','belt'],['belt','bag','tray'],['belt','tray','bag'],['tray','bag','belt'],['tray','belt','bag']]){
 const s=fresh();for(const id of order){open(s,id);game.choose(s,s.dialog.choices.findIndex(c=>c.good));finish(s);}
 assert(game.chapterReady(s),'safety tasks have no arbitrary fixed order');assert.equal(s.safetyErrors,0);
 assert(s.tasks.filter(t=>t.kind==='service').every(t=>!t.done),'ordinary service is not a prerequisite for cabin secure');
 s.player.x=0;s.player.z=1.5;assert(game.interact(s));assert.equal(s.endReason,'complete');assert(summarizeResult(s).record);
 const row=trainingFeedback(s).find(row=>row.id==='completion');assert.equal(row.status,'good');assert(row.evidence.includes('客艙安全已回報'));
}
{
 const s=fresh();s.tasks.filter(t=>t.kind==='safety').forEach(t=>{t.done=true;});
 s.hazards.push({id:'obstruction',taskId:'water',x:0,z:7,done:false});assert(!game.chapterReady(s));
 s.player.z=1.5;assert(!game.interact(s));s.hazards[0].done=true;assert(game.chapterReady(s));
 s.tasks.find(t=>t.id==='belt').done=false;assert(!game.chapterReady(s),'unverified safe-looking items still block report');
}
{
 const s=fresh(),t=s.tasks.find(t=>t.id==='water');s.handoffJob={taskId:'water',remaining:.01};
 game.tick(s,.05);assert(t.deferred&&t.done);assert.equal(s.handoffJob,null,'a stale delivery job cannot bypass final-check policy');
}
for(const method of ['wait','handoff']){
 const s=fresh(),t=open(s,'water');game.choose(s,s.dialog.choices.findIndex(c=>c.id===method));
 s.elapsed=s.duration-.01;s.action.time=s.action.duration-.01;game.tick(s,.05);assert.equal(s.endReason,'timeout');assert(!t.done&&!t.deferred,'deadline wins over same-frame recording credit');
 assert.equal(s.handoffTokens,1,'an unfinished recording does not consume a handoff token');
}
console.log('PASS final-check policy: self/delegated recording, no delivery or waiting penalty, six safety orders, safety-only report, pause and deadline');

// A live assessment keeps demand deadlines running while the player decides.
for(const practice of [false,true]){
 const s=fresh(practice);open(s,'tray');const elapsed=s.elapsed,position={...s.player},dialog=s.dialog;
 for(let i=0;i<60;i++)game.tick(s,.1,{x:1,z:1});
 assert(Math.abs(s.elapsed-elapsed-(practice?0:6))<1e-8);
 assert.deepEqual(s.player,position);assert.equal(s.dialog,dialog);assert(!s.action);
 assert.equal(s.tasks.find(t=>t.id==='blanket').active,!practice);
 game.pause(s);const paused=JSON.stringify(s);game.tick(s,.1);assert.equal(JSON.stringify(s),paused);
}
{
 const s=fresh(),t=open(s,'water');t.patience=.2;
 for(let i=0;i<3;i++)game.tick(s,.1);
 assert(t.late&&s.hazards.some(h=>h.taskId==='water'),'demand deadline applies during a decision');
 const n=s.hazards.length;game.tick(s,.1);assert.equal(s.hazards.length,n,'no duplicate waiting penalty');
 game.choose(s,s.dialog.choices.findIndex(c=>c.id==='wait'));finish(s);
 assert(t.deferred);assert(!game.chapterReady(s),'recording after a new obstruction does not remove the obstruction');
}
{
 const s=fresh(),t=open(s,'water'),index=s.dialog.choices.findIndex(c=>c.good);
 s.elapsed=s.duration-.01;game.tick(s,.05);
 assert.equal(s.endReason,'timeout');assert.equal(s.dialog,null);assert.equal(game.choose(s,index),false);
 assert(!t.done&&!t.deferred);assert.equal(s.judgments.length,0,'expired choice earns no credit');
}
for(const count of [0,1,2]){
 const s=fresh(),service=s.tasks.filter(t=>t.kind==='service');
 service.forEach((t,i)=>{t.done=t.deferred=i<count;});
 const row=trainingFeedback(s).find(r=>r.id==='service');
 assert.equal(row.status,count===2?'good':'improve');assert(row.evidence.includes(`${count}/2`));
 if(count<2)assert(row.evidence.includes(`仍有 ${2-count} 項需求未記錄`));
 s.tasks.filter(t=>t.kind==='safety').forEach(t=>{t.done=true;});
 assert(game.chapterReady(s),'service feedback never changes the safety-only report gate');
}
console.log('PASS assessment: live decision clock and demands, frozen practice/pause, expired choices rejected, service 0/2, 1/2 and 2/2');
