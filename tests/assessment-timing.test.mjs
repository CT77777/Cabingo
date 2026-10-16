import assert from 'node:assert/strict';
import * as game from '../public/preflight.mjs';
import {assessmentSummary} from '../public/assessment.mjs';
import {coworkerPresentation} from '../public/presentation.mjs';
import {countdownPresentation} from '../public/interaction.mjs';

const fresh=(options={})=>{const s=game.createState({chapterId:'preflight',assessment:true,contextual:true,seed:7,...options});game.start(s);return s;};
const advance=(s,seconds)=>{for(let i=0;i<Math.round(seconds*20);i++)game.tick(s,.05);};
function open(s,id){const t=s.tasks.find(t=>t.id===id);while(!t.active)game.tick(s,.05);s.player.x=0;s.player.z=t.z-.8;assert(game.interact(s));assert.equal(s.dialog.id,id);return t;}
function choose(s,predicate){assert(game.choose(s,s.dialog.choices.findIndex(predicate)));}
function settle(s){let n=0;while(s.action&&n++<1000)game.tick(s,.05);assert(!s.action);}
function submit(s){s.player.x=0;s.player.z=1.5;assert(game.interact(s));assert.equal(s.endReason,'complete');}

// Timers are deterministic per seed without altering the established task layout.
const values=new Set();
for(let seed=1;seed<=1000;seed++){
 const s=fresh({seed}),again=fresh({seed}),practice=game.createState({seed,practice:true});
 assert.equal(s.tasks.length,5);assert(!s.tasks.some(t=>t.id==='priority'));
 assert.deepEqual(s.tasks.map(t=>[t.row,t.side,t.variant]),practice.tasks.map(t=>[t.row,t.side,t.variant]));
 assert.deepEqual(s.tasks.map(t=>t.deadlineAt),again.tasks.map(t=>t.deadlineAt));
 for(const t of s.tasks){assert(Number.isInteger(t.patience)&&t.patience>=35&&t.patience<=65);assert.equal(t.deadlineAt,t.spawn+t.patience);values.add(t.patience);}
}
assert.equal(values.size,31);

// Self-recording always consumes three real seconds, including the hands-on engine.
for(const contextual of [false,true])for(const handsOn of [false,true]){
 const s=fresh({contextual,handsOn}),t=open(s,'water');choose(s,c=>c.id==='wait');
 assert.equal(s.action.duration,3);assert(!s.action.interaction);advance(s,2.95);assert(!t.done);advance(s,.05);
 assert(t.done&&t.deferred);assert(!t.late);assert(Math.abs(s.elapsed-3)<1e-8);
}

// Delegation runs concurrently; penalties never jump animation or task deadlines.
{
 const s=fresh(),water=open(s,'water');choose(s,c=>c.id==='handoff');advance(s,1);
 assert(water.assigned&&!water.done&&!water.deferred);assert.equal(s.handoffTokens,0);assert.equal(s.handoffJob.remaining,12);
 assert.equal(coworkerPresentation(s).phase,'preparing');advance(s,4);assert.equal(coworkerPresentation(s).phase,'walking');
 const belt=open(s,'belt'),before={elapsed:s.elapsed,remaining:s.handoffJob.remaining,deadline:belt.deadlineAt};choose(s,c=>!c.good);
 assert.equal(s.penaltySeconds,5);assert.equal(s.elapsed,before.elapsed);assert.equal(s.handoffJob.remaining,before.remaining);assert.equal(belt.deadlineAt,before.deadline);
 assert(!belt.done&&!water.done);assert(!game.choose(s,0));assert.equal(s.penaltySeconds,5);
 game.pause(s);const frozen=JSON.stringify(s);advance(s,2);assert.equal(JSON.stringify(s),frozen);game.resume(s);game.dismissAnswerFeedback(s);
 advance(s,6);assert.equal(coworkerPresentation(s).phase,'serving');assert(!water.done);
 // All other correct tasks complete; a pending colleague must still block submission.
 for(const t of s.tasks.filter(t=>t!==water)){t.assessmentAnswered=true;if(t!==belt){t.done=true;s.judgments.push({taskId:t.id,firstChoice:{good:true}});}}
 assert(!game.chapterReady(s));s.player.z=1.5;assert(!game.interact(s));assert(s.feedback.includes('送物'));
 advance(s,2);assert(water.done&&water.handoff&&!water.deferred);assert(!s.handoffJob);assert(game.chapterReady(s));
 assert.equal(coworkerPresentation(s).phase,'complete');advance(s,2.1);assert.equal(coworkerPresentation(s).phase,'returning');
}

// A wrong answer can end the round immediately, without advancing real time.
{
 const s=fresh(),t=open(s,'belt');s.elapsed=96;choose(s,c=>!c.good);
 assert.equal(s.status,'finished');assert.equal(s.endReason,'timeout');assert.equal(s.elapsed,96);assert.equal(s.penaltySeconds,5);assert(!s.action&&!s.answerFeedback&&!t.done);
 assert(!game.choose(s,0));assert.equal(assessmentSummary(s).stars,0);
}
assert.equal(countdownPresentation({status:'playing',duration:100,elapsed:65,penaltySeconds:5}).seconds,30);
assert.equal(countdownPresentation({status:'playing',duration:100,elapsed:85,penaltySeconds:5}).level,'critical');

// Deadlines run during reading, recording and delegated delivery, with one deduction.
for(const method of ['reading','wait','handoff']){
 const s=fresh(),t=open(s,'water');t.deadlineAt=2;
 if(method!=='reading')choose(s,c=>c.id===method);
 advance(s,2);assert(t.late&&!t.done);assert.equal(s.events.filter(e=>e.type==='task-late'&&e.taskId===t.id).length,1);
 advance(s,12);assert(t.late);assert.equal(s.events.filter(e=>e.type==='task-late'&&e.taskId===t.id).length,1);assert.equal(s.hazards.length,0);
 if(method!=='reading')assert(t.done);
}
// Completion exactly at the task deadline succeeds; a later completion stays late.
for(const deadline of [2.975,3,3.025]){
 const s=fresh(),t=open(s,'water');t.deadlineAt=deadline;choose(s,c=>c.id==='wait');advance(s,3);
 assert(t.done);assert.equal(t.late,deadline<3);
}
// Global timeout wins over an action or delivery finishing in the same frame.
for(const delivery of [false,true]){
 const s=fresh(),t=open(s,'water');choose(s,c=>c.id===(delivery?'handoff':'wait'));
 if(delivery){advance(s,1);s.handoffJob.remaining=.05;}else s.action.time=2.95;
 s.elapsed=99.95;game.tick(s,.05);assert.equal(s.endReason,'timeout');assert(!t.done);assert.equal(assessmentSummary(s).stars,0);
}

for(const lateCount of [0,1,2,3,5]){
 const s=fresh();for(const t of s.tasks){open(s,t.id);choose(s,c=>c.good&&(t.kind!=='service'||c.id==='wait'));settle(s);}
 s.tasks.forEach((t,i)=>{t.late=i<lateCount;});submit(s);const summary=assessmentSummary(s);
 assert.equal(summary.answerScore,100);assert.equal(summary.latePenalty,lateCount*10);assert.equal(summary.score,100-lateCount*10);
 assert.equal(summary.stars,lateCount===0?3:lateCount<=2?2:1);assert.equal(summary.record.score,summary.score);assert.equal(summary.record.late,lateCount);
 const before=JSON.stringify(s);assessmentSummary(s);assert.equal(JSON.stringify(s),before);
}

// Real, collision-aware routes establish a feasible no-penalty strategy across
// 1,000 layouts: walk aft, delegate the first demand, record the other, return.
let slowest=0,leastSlack=Infinity;
for(let seed=1;seed<=1000;seed++){
 const s=fresh({seed});
 for(const t of [...s.tasks].sort((a,b)=>a.z-b.z)){
  let n=0;while(s.player.z<t.z-.8&&n++<1000)game.tick(s,.05,{x:0,z:1});assert(n<1000);
  while(!t.active)game.tick(s,.05);assert(game.interact(s));assert.equal(s.dialog.id,t.id);
  choose(s,c=>c.good&&(t.kind!=='service'||c.id===(s.handoffTokens>0?'handoff':'wait')));settle(s);
 }
 let n=0;while(s.player.z>1.5&&n++<1000)game.tick(s,.05,{x:0,z:-1});assert(n<1000);
 while(s.handoffJob)game.tick(s,.05);submit(s);
 assert(s.tasks.every(t=>t.done&&!t.late),`seed ${seed} has a no-penalty route`);assert.equal(assessmentSummary(s).score,100);
 slowest=Math.max(slowest,s.elapsed);leastSlack=Math.min(leastSlack,...s.tasks.map(t=>t.deadlineAt-t.completedAt));
}
console.log(`PASS assessment timing: 1,000 feasible layouts; slowest ${slowest.toFixed(2)}s; minimum deadline slack ${leastSlack.toFixed(2)}s; three-second recording, concurrent delivery, penalties, pause, races and scoring`);
