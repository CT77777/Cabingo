// Legacy service-phase engine coverage; final-cabin-check.test.mjs covers the current preflight policy.
import assert from 'node:assert/strict';
import {summarizeResult,parseBest,selectBest,trainingFeedback} from '../public/results.mjs';
import {createState,start,interact,choose,tick,dismissLesson,ackRecovery} from '../public/preflight.mjs';
const base={practice:false,endReason:'complete',grade:'clean',safetyErrors:0,mistakes:0,comfort:95,elapsed:60,tasks:[],hazards:[]};
for(const [patch,stars] of [[{},3],[{comfort:94},2],[{mistakes:1},2],[{safetyErrors:1},1],[{safetyErrors:2},0],[{endReason:'timeout'},0],[{practice:true},null]])assert.equal(summarizeResult({...base,...patch}).stars,stars);
assert.equal(summarizeResult({...base,practice:true}).record,null);
for(const raw of ['bad','null','{}','{"version":2}',JSON.stringify({version:1,stars:3,safetyErrors:0,comfort:101,elapsed:60}),JSON.stringify({version:1,stars:3,safetyErrors:0,comfort:95,elapsed:-1})])assert.equal(parseBest(raw),null);
const r=summarizeResult(base).record;assert.deepEqual(parseBest(JSON.stringify(r)),r);assert.equal(selectBest(r,{...r}),r);assert.equal(selectBest(r,{...r,elapsed:61}),r);assert.equal(selectBest(r,{...r,elapsed:59}).elapsed,59);
assert(summarizeResult({...base,safetyErrors:1}).advice.includes('安全'));
console.log('PASS rating boundaries, advice priority, practice isolation and best-record validation');

for(const patch of [{endReason:'timeout',grade:'incomplete'},{safetyErrors:2}])assert.equal(summarizeResult({...base,...patch}).record,null);
assert.equal(parseBest(JSON.stringify({...r,stars:0})),null,'discard legacy failed best record');

function trainingRun(options={}) {
  const state=createState({seed:1,contextual:true,practice:true,...options});state.phase='service-training';start(state);
  if(state.lesson)dismissLesson(state);
  return state;
}
function openTask(state,id) {
  const task=state.tasks.find(t=>t.id===id);state.player.x=0;state.player.z=task.z-.8;
  assert(interact(state));assert.equal(state.dialog?.id,id);
}
function advance(state,seconds=4) {for(let i=0;i<seconds*10;i++){if(state.lesson)dismissLesson(state);tick(state,.1);}}
const getFeedback=(s,id)=>trainingFeedback(s).find(row=>row.id===id);

const untouched=trainingRun(),snapshot=JSON.stringify(untouched);
assert.equal(getFeedback(untouched,'safety').status,'unobserved');
assert.equal(getFeedback(untouched,'service').status,'unobserved');
assert.equal(getFeedback(untouched,'completion').status,'improve');
assert.equal(JSON.stringify(untouched),snapshot,'feedback never mutates game state');
const correct=trainingRun();openTask(correct,'belt');choose(correct,correct.dialog.choices.findIndex(c=>c.good));
assert.equal(getFeedback(correct,'safety').status,'improve','choosing correctly is not completing the action');
advance(correct);assert.equal(getFeedback(correct,'safety').status,'good');
assert.match(getFeedback(correct,'safety').evidence,/沒有選錯/);

for(const practice of [false,true]) {
  const repaired=trainingRun({practice});openTask(repaired,'belt');choose(repaired,repaired.dialog.choices.findIndex(c=>!c.good));
  assert.equal(repaired.judgments[0].firstChoice.good,false);advance(repaired);ackRecovery(repaired);
  choose(repaired,repaired.dialog.choices.findIndex(c=>c.good));advance(repaired);
  const feedback=getFeedback(repaired,'safety');assert.equal(feedback.status,'improve');
  assert.match(feedback.evidence,/第一次就選錯.*修正並完成/);
  assert.equal(feedback.evidence.includes('練習中'),practice);
  assert.equal(repaired.safetyErrors,practice?0:1,'feedback does not change practice or formal penalties');
}
const handed=trainingRun();openTask(handed,'water');choose(handed,handed.dialog.choices.findIndex(c=>c.handoff));advance(handed);
assert.equal(getFeedback(handed,'service').status,'improve');assert.match(getFeedback(handed,'service').evidence,/仍未送達/);
advance(handed,13);assert.equal(getFeedback(handed,'service').status,'good');assert.match(getFeedback(handed,'service').evidence,/同事已送達/);
assert(!getFeedback(handed,'service').evidence.includes('回報'),'delivery alone does not prove a report');

const late=trainingRun({practice:false});advance(late,34);
assert.equal(getFeedback(late,'service').status,'improve');assert.match(getFeedback(late,'service').evidence,/等候超時/);
const blockedService=trainingRun();blockedService.tasks.find(t=>t.id==='bag').variant=0;
openTask(blockedService,'water');choose(blockedService,blockedService.dialog.choices.findIndex(c=>c.ack));advance(blockedService);
openTask(blockedService,'water');choose(blockedService,blockedService.dialog.choices.findIndex(c=>c.id==='serve'));
assert.equal(getFeedback(blockedService,'safety').status,'improve','unsafe service choices belong in safety feedback');
assert.match(getFeedback(blockedService,'safety').evidence,/第一次選對，後來曾選錯/);
assert.match(getFeedback(blockedService,'safety').advice,/先安排等候或交接/);
const board=createState({chapterId:'boarding',contextual:true});start(board);board.player.z=2.2;
interact(board);choose(board,board.dialog.choices.findIndex(c=>!c.good));ackRecovery(board);
choose(board,board.dialog.choices.findIndex(c=>c.good));advance(board);
assert.match(getFeedback(board,'service').evidence,/教學中/);assert.equal(board.safetyErrors,0);

const wrap=trainingRun();for(const task of wrap.tasks)task.done=true;
assert.match(getFeedback(wrap,'completion').impact,/還差最後回報/);
wrap.hazards.push({done:false});assert.equal(getFeedback(wrap,'completion').status,'improve');
wrap.hazards[0].done=true;wrap.player.x=0;wrap.player.z=1.5;assert(interact(wrap));
assert.equal(getFeedback(wrap,'completion').status,'good');assert.match(getFeedback(wrap,'completion').evidence,/已回前方回報/);
board.boarding.congestionEvents=1;assert.equal(getFeedback(board,'safety').status,'improve');
assert.match(getFeedback(board,'safety').evidence,/持續擁擠/);
for(const task of board.tasks)task.done=true;
assert.match(getFeedback(board,'completion').evidence,/旅客未到位/);
assert.equal(getFeedback(board,'completion').status,'improve');
assert(trainingFeedback({}).every(row=>row.status==='unobserved'));
const finalSnapshot=JSON.stringify(wrap);trainingFeedback(wrap);assert.equal(JSON.stringify(wrap),finalSnapshot);
console.log('PASS evidence-based feedback: correction, free teaching/practice, pending/delivered handoff, delays, congestion, incomplete actions and final report');
