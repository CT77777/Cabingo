import assert from 'node:assert/strict';
import * as game from '../public/preflight.mjs';
import {assessmentSummary,assessmentFeedback,assessmentVersion} from '../public/assessment.mjs';
import {prepareAssessmentSave,parseAssessmentBest} from '../public/assessment-records.mjs';

const fresh=(assessment=false,seed=7)=>{const s=game.createState({chapterId:'preflight',assessment,practice:!assessment,contextual:true,handsOn:true,seed});game.start(s);assert.equal(s.lesson,null);return s;};
const advance=(s,seconds)=>{for(let i=0;i<seconds*10;i++)game.tick(s,.1);};
function open(s,id){const t=s.tasks.find(t=>t.id===id);s.player.x=0;s.player.z=t.z-.8;assert(game.interact(s));assert.equal(s.dialog.id,id);return t;}
function resolve(s,method){const choice=s.dialog.choices.findIndex(typeof method==='string'?c=>c.id===method:method);assert(choice>=0);assert(game.choose(s,choice));}
function finishAction(s){let n=0;while(s.action&&n++<100)game.tick(s,.1);assert(!s.action);}

// Both modes have the same spawn timing and service choices, with no waiting hazards.
for(const assessment of [false,true]){
 const s=fresh(assessment);assert(s.tasks.find(t=>t.id==='water').active);assert(!s.tasks.find(t=>t.id==='blanket').active);
 advance(s,4.9);assert(!s.tasks.find(t=>t.id==='blanket').active);advance(s,.1);assert(s.tasks.find(t=>t.id==='blanket').active);
 open(s,'water');resolve(s,'handoff');if(assessment){assert(!s.tasks.find(t=>t.id==='water').done);assert(s.correctFeedback);assert(s.action);assert(!s.dialog&&!s.answerFeedback);assert(!game.dismissAnswerFeedback(s));}
 advance(s,.9);assert(!s.tasks.find(t=>t.id==='water').done);advance(s,.1);assert(s.tasks.find(t=>t.id==='water').done);assert.equal(s.handoffTokens,0);
 open(s,'blanket');assert(!s.dialog.choices.some(c=>c.handoff));resolve(s,'wait');finishAction(s);
 advance(s,45);assert(!s.hazards.length);assert(s.tasks.every(t=>!t.late&&!t.warned));
}
// Practice requires all five tasks; early reporting cannot skip ordinary requests.
{
 const s=fresh();for(const id of ['bag','belt','tray']){open(s,id);resolve(s,c=>c.good);finishAction(s);}
 assert(!game.chapterReady(s));s.player.z=1.5;assert(!game.interact(s));assert(s.feedback.includes('2 項任務'));
 for(const id of ['water','blanket']){open(s,id);resolve(s,'wait');finishAction(s);}
 assert(game.chapterReady(s));s.player.z=1.5;assert(game.interact(s));assert.equal(s.endReason,'complete');
}
// Wrong exam answers are immutable and do not complete or correct the scene.
for(const id of ['bag','belt','tray','water','blanket','priority']){
 const s=fresh(true);advance(s,5);const t=open(s,id),decision=structuredClone(s.dialog);resolve(s,c=>!c.good);
 const first=structuredClone(s.judgments[0]);assert(s.answerFeedback.reply);assert(!s.answerFeedback.correctAction);assert(!s.action&&!t.done);
 assert(!game.choose(s,0));assert(!game.closeDialog(s));assert.deepEqual(s.judgments[0],first);
 const elapsed=s.elapsed;advance(s,2);assert(Math.abs(s.elapsed-elapsed-2)<1e-7);
 game.pause(s);const paused=JSON.stringify(s);advance(s,1);assert.equal(JSON.stringify(s),paused);assert(!game.dismissAnswerFeedback(s));game.resume(s);
 assert(game.dismissAnswerFeedback(s));advance(s,3);assert(!t.done&&!s.action);assert(!game.targets(s).some(item=>item.id===id));
 const row=assessmentFeedback(s).find(row=>row.id===id);assert.equal(row.status,'improve');assert.equal(row.firstChoice,first.firstChoice.label);assert(row.correctAction&&row.reason);
 assert.deepEqual(s.judgments[0],first);s.dialog=decision;assert(!game.choose(s,decision.choices.findIndex(c=>c.good)));
}
// Correct answers start the real action in the choice call, without a confirmation stage.
{
 const s=fresh(true);advance(s,5);for(const t of s.tasks){open(s,t.id);resolve(s,c=>c.good);assert(!s.dialog&&!s.answerFeedback);assert(s.correctFeedback);assert(!game.dismissAnswerFeedback(s));if(t.id!=='priority'){assert(!game.chapterReady(s));assert(s.action&&!t.done);}finishAction(s);}
 assert(game.chapterReady(s));s.player.z=1.5;game.interact(s);const summary=assessmentSummary(s);assert.equal(summary.stars,3);assert.equal(summary.record.questionVersion,3);
 const legacy={chapterId:'preflight',questionVersion:2,total:6,stars:3,incorrect:0,safetyErrors:0,elapsed:20};
 const previous=prepareAssessmentSave(null,legacy),next=prepareAssessmentSave(previous.raw,summary.record);assert(next.updated);assert.deepEqual(parseAssessmentBest(next.raw).records['preflight:2'],legacy);
 assert.equal(assessmentVersion('boarding'),2);assert.equal(assessmentVersion('preflight'),3);
}
// Review of an unanswered request must respect a handoff already spent elsewhere.
{
 const s=fresh(true);open(s,'water');resolve(s,'handoff');finishAction(s);
 s.elapsed=99.99;advance(s,.1);const row=assessmentFeedback(s).find(row=>row.id==='blanket');
 assert.equal(row.status,'unobserved');assert(!row.correctAction.includes('同事'));
}
// The noninteractive success notice and action both freeze on pause and resume once.
{
 const s=fresh(true);open(s,'water');resolve(s,'wait');const actionId=s.action.id;
 advance(s,.4);assert(s.action.time>0);assert(s.correctFeedback);game.pause(s);
 const paused=JSON.stringify(s);advance(s,2);assert.equal(JSON.stringify(s),paused);game.resume(s);
 advance(s,.8);assert(!s.correctFeedback);assert.equal(s.action.id,actionId);finishAction(s);assert.equal(s.completed,1);
}
// Service decisions retain facts for review but never disclose the handling policy upfront.
for(const assessment of [false,true])for(const id of ['water','blanket']){
 const s=fresh(assessment);advance(s,5);open(s,id);assert.equal(s.dialog.description,`旅客提出${id==='water'?'飲水':'保暖'}需求。`);
}
// Deadline wins over wrong-answer feedback and over a same-frame action completion.
for(const duringAction of [false,true]){
 const s=fresh(true);open(s,'water');resolve(s,duringAction?'wait':'serve');if(duringAction)s.action.time=s.action.duration-.01;
 s.elapsed=99.99;advance(s,.1);assert.equal(s.endReason,'timeout');assert(!s.answerFeedback&&!s.action&&!s.correctFeedback);assert(!s.tasks.find(t=>t.id==='water').done);assert(!game.dismissAnswerFeedback(s));assert.equal(assessmentSummary(s).stars,0);
}
// Traverse all stations with real movement, spending five seconds on each answer feedback.
for(let seed=1;seed<=12;seed++){
 const s=fresh(true,seed);for(const t of [...s.tasks].sort((a,b)=>a.z-b.z)){
  let frames=0;while(s.player.z<t.z-.8&&frames++<1000)game.tick(s,.05,{x:0,z:1});assert(frames<1000);
  while(!t.active)game.tick(s,.1);assert(game.interact(s));assert.equal(s.dialog.id,t.id);resolve(s,c=>c.good);advance(s,5);finishAction(s);
 }
 let frames=0;while(s.player.z>1.5&&frames++<1000)game.tick(s,.05,{x:0,z:-1});assert(frames<1000);assert(s.elapsed<100);assert(game.interact(s));assert.equal(assessmentSummary(s).stars,3);
}
console.log('PASS chapter 2: shared spawning/actions, one-use handoff, full practice completion, locked wrong answers, deferred review, feedback/pause/deadline boundaries, version isolation and 12 timed walking routes');
