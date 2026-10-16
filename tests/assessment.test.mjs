import assert from 'node:assert/strict';
import * as game from '../public/preflight.mjs';
import {assessmentDecision,assessmentSummary,assessmentFeedback} from '../public/assessment.mjs';
import {summarizeResult} from '../public/results.mjs';
import {awardChapterCards,parseCodex} from '../public/learning.mjs';

const fresh=(seed,chapterId='preflight')=>{const s=game.createState({chapterId,assessment:true,contextual:true,handsOn:true,seed});game.start(s);return s;};
function open(s,t){s.player.x=0;s.player.z=t.z-.8;assert(game.interact(s));assert.equal(s.dialog.id,t.id);}
assert.throws(()=>game.createState({assessment:true,practice:true}),RangeError);
assert.throws(()=>assessmentDecision({id:'unknown'}),RangeError);

// All nine safety scenarios provide a single supported answer and factual clues.
for(const id of ['bag','belt','tray'])for(let variant=0;variant<3;variant++){
  const d=assessmentDecision({id,variant,title:id});assert.equal(d.choices.length,3);
  assert.equal(d.choices.filter(c=>c.good).length,1);assert(d.description);
}

const correctPositions=new Set();
for(const chapterId of ['boarding','preflight'])for(let seed=1;seed<=12;seed++)for(const wrong of [false,true]){
  const s=fresh(seed,chapterId);assert.equal(s.lesson,null);assert(s.tasks.every(t=>t.active));
  assert(!game.chapterReady(s));assert(!game.interact(s));
  for(const t of s.tasks){
    open(s,t);correctPositions.add(s.dialog.choices.findIndex(c=>c.good));
    const decision=structuredClone(s.dialog),events=structuredClone(s.events);
    assert(!game.choose(s,-1));assert(!game.choose(s,NaN));
    const index=s.dialog.choices.findIndex(c=>c.good!==wrong);
    assert(game.choose(s,index));assert(!game.choose(s,index));
    const j=s.judgments.at(-1);assert.equal(j.attempts,1);assert.equal(j.mode,'assessment');
    assert.equal(j.firstChoice.good,!wrong);assert.equal(j.firstChoice.label,decision.choices[index].label);
    assert.equal(s.feedback,'已記錄作答，結束後統一講評。');assert.equal(s.feedbackKind,'normal');
    assert.equal(s.dialog,null);assert.equal(s.action,null);assert.equal(s.lesson,null);assert(!s.recovery);
    assert.deepEqual(s.events,events,'no correctness sound or scene reaction');
    assert(!t.done&&!t.assigned&&!t.deferred,'recorded answer is not a completed action');
    assert(!game.targets(s).some(target=>target.id===t.id),'answered tasks cannot reopen');
    // Even a stale dialog cannot overwrite the first decision.
    s.dialog=decision;assert(!game.choose(s,index));s.dialog=null;assert.equal(j.attempts,1);
  }
  assert(game.chapterReady(s));s.player.x=0;s.player.z=1.5;assert(game.interact(s));
  assert.equal(s.status,'finished');assert.equal(s.grade,'assessment');
  const summary=assessmentSummary(s);assert(summary.submitted);assert.equal(summary.safety.incorrect,wrong?(chapterId==='boarding'?2:3):0);
  assert.equal(summarizeResult(s).record,null);assert.equal(summarizeResult(s).stars,summary.stars);
  const codex=parseCodex(null);assert.deepEqual(awardChapterCards(codex,s),codex);
  assert.equal(assessmentFeedback(s).length,chapterId==='boarding'?5:6);assert.equal(summary.stars,wrong?0:3);assert.equal(!!summary.record,!wrong);
  if(wrong){
    assert(summary.title.includes('安全判斷需要再練習'));
    const before=JSON.stringify(s);assessmentFeedback(s);
    assert.equal(JSON.stringify(s),before,'reviewing feedback preserves first decisions');
    assert(s.judgments.every(j=>!Object.hasOwn(j,'retryDecision')));
  }
}
assert.equal(correctPositions.size,3,'answer position varies');
{
  const s=fresh(99);for(const t of s.tasks){open(s,t);game.choose(s,s.dialog.choices.findIndex(c=>t.id==='bag'?!c.good:c.good));}
  s.player.z=1.5;game.interact(s);const summary=assessmentSummary(s);
  assert.equal(summary.service.correct,2);assert.equal(summary.safety.incorrect,1);
  assert(summary.title.includes('安全判斷需要再練習'),'service cannot offset safety');
}
{
  const s=fresh(1);open(s,s.tasks[0]);const position={...s.player};
  for(let i=0;i<400;i++)game.tick(s,.1,{x:1,z:1});
  assert(Math.abs(s.elapsed-40)<1e-8);assert.deepEqual(s.player,position);
  assert.equal(s.hazards.length,0);assert(s.tasks.every(t=>!t.late&&!t.warned));
  game.pause(s);const paused=JSON.stringify(s);game.tick(s,.1);assert.equal(JSON.stringify(s),paused);
  game.resume(s);s.elapsed=99.99;game.tick(s,.1);
  assert.equal(s.endReason,'timeout');assert.equal(s.dialog,null);assert(!game.choose(s,0));
  assert(!assessmentSummary(s).submitted);assert(assessmentFeedback(s).every(r=>r.status==='unobserved'));
}
console.log('PASS assessment: 9 safety variants, 48 complete runs across both chapters, locked first choices, neutral presentation, safety isolation, feedback/reward isolation, timed decisions and timeout');

// Safety errors include unsafe service/priority choices, while ordinary service omissions remain separately graded.
for(const chapterId of ['boarding','preflight'])for(const wrongIds of [[],['priority'],['bag'],[chapterId==='boarding'?'guide':'water'],chapterId==='boarding'?['guide','family']:['water','blanket']]){
 const s=fresh(2,chapterId);
 for(const t of s.tasks){open(s,t);let index=s.dialog.choices.findIndex(c=>c.good);if(wrongIds.includes(t.id)){const ordinary=s.dialog.choices.findIndex(c=>!c.good&&!c.safetyError);index=ordinary>=0?ordinary:s.dialog.choices.findIndex(c=>!c.good);}game.choose(s,index);}
 s.player.z=1.5;game.interact(s);const result=assessmentSummary(s);
 const unsafe=wrongIds.includes('bag')||wrongIds.includes('priority');
 assert.equal(result.stars,unsafe?0:wrongIds.length===0?3:wrongIds.length===1?2:1);
}
// The static assessment layout retains collisions and must be traversable without completing actions.
for(const chapterId of ['boarding','preflight'])for(let seed=1;seed<=12;seed++){
 const s=fresh(seed,chapterId);
 // A centreline route is deliberately clear while luggage remains solid at the aisle edge.
 for(const t of [...s.tasks].sort((a,b)=>a.z-b.z)){
  let frames=0;while(s.player.z<t.z-.8&&frames++<1000)game.move(s,0,1,.05);
  assert(frames<1000,`${chapterId} seed ${seed} can reach ${t.id}`);
  assert(Math.hypot(s.player.x,s.player.z-t.z)<=1.1);assert(game.interact(s));assert.equal(s.dialog.id,t.id);
  game.choose(s,s.dialog.choices.findIndex(c=>!c.good));
 }
 let frames=0;while(s.player.z>1.5&&frames++<1000)game.move(s,0,-1,.05);assert(frames<1000);assert(game.interact(s));
 assert.equal(s.endReason,'complete');assert(s.tasks.every(t=>!t.done));
 const bag=s.tasks.find(t=>t.id==='bag');if(bag.variant!==2){s.player.z=bag.z-.8;assert(!game.canStand(s,bag.side==='right'?.55:-.55,bag.z));}
}
for(const chapterId of ['boarding','preflight']){
 const s=game.createState({chapterId,practice:true,contextual:true});game.start(s);if(s.lesson)game.dismissLesson(s);
 if(s.boarding){s.boarding.formal=true;s.boarding.tutorialStep=4;}
 for(let i=0;i<1500;i++)game.tick(s,.1);assert.equal(s.status,'playing');assert.equal(s.safetyErrors,0);
 assert(s.tasks.every(t=>!t.late));assert.equal(s.hazards.length,0);assert.equal(s.servicePenalty,0);
}
console.log('PASS both chapter scoring tiers, priority safety flags, 24 physical walking routes, untimed practice without waiting penalties');
