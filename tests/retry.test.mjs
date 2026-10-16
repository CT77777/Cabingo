import assert from 'node:assert/strict';
import {createState,start,dismissLesson,interact,choose} from '../public/preflight.mjs';
import {retryCandidates,createRetry,retryPrompt,answerRetry,retryComparison} from '../public/retry.mjs';
import {awardChapterCards,parseCodex} from '../public/learning.mjs';

function missedTask(chapterId,taskId,variant=0){
  const state=createState({chapterId,seed:1701,contextual:true,practice:true,characterMemory:{elder:{helped:true}}});
  start(state);if(state.lesson)dismissLesson(state);
  const task=state.tasks.find(t=>t.id===taskId);task.variant=variant;
  for(const t of state.tasks)t.active=t===task;
  if(state.boarding){
    state.boarding.formal=true;
    for(const actor of state.boarding.actors){actor.status=actor.taskId===taskId?'waiting':'seated';if(actor.taskId===taskId)actor.z=task.z;}
  }
  state.player.z=task.z-.8;
  assert(interact(state));assert.equal(state.dialog.id,taskId);
  const original=structuredClone(state.dialog);
  assert(choose(state,state.dialog.choices.findIndex(c=>!c.good)));
  return {state,original};
}

let scenarios=0;
for(const [chapterId,ids] of [['boarding',['guide','bag','seat','family']],['preflight',['bag','belt','tray','water','blanket']]]){
  for(const taskId of ids)for(const variant of [0,1,2]){
    const {state,original}=missedTask(chapterId,taskId,variant);
    const before=JSON.stringify(state),candidates=retryCandidates(state);
    assert.equal(candidates.length,1);
    const candidate=candidates[0];assert.equal(candidate.previousIncorrect,1);
    assert.equal(candidate.decision.description,original.description);
    assert.deepEqual(candidate.decision.choices.map(c=>c.label),original.choices.map(c=>c.label));
    const session=createRetry(candidate),wrong=session.decision.choices.findIndex(c=>!c.good),good=session.decision.choices.findIndex(c=>c.good);
    assert(retryPrompt(session).endsWith('？'),'every retry has an explicit question');
    assert(retryPrompt(session).includes('你會如何'));
    if(taskId==='belt'){
      assert(original.quote.startsWith('又見面了，謝謝你登機時幫我。'),'the full chapter keeps its character greeting');
      assert(!session.decision.quote.includes('又見面了'),'standalone practice omits the chapter greeting');
      assert.equal(session.decision.quote,original.practiceQuote);
      if(variant===0)assert.equal(retryPrompt(session),'旅客正在看手機，安全帶尚未扣好，你會如何提醒？');
      if(variant===2)assert(retryPrompt(session).includes('已扣好'),'a fastened belt must not be described as unfastened');
    }
    assert.equal(retryComparison(session),null);
    for(const invalid of [-1,99,NaN,'1',null])assert(!answerRetry(session,invalid));
    assert.equal(session.attempts,0);
    assert(answerRetry(session,wrong));assert.equal(session.incorrect,1);assert(!session.complete);
    assert(answerRetry(session,good));assert(session.complete);assert.equal(session.attempts,2);
    assert(retryComparison(session).after.includes('1 次後答對'));
    assert(!answerRetry(session,good),'completed decisions cannot be answered twice');
    const again=createRetry(candidate);assert.equal(again.incorrect,0);answerRetry(again,good);
    assert.equal(retryComparison(again).after,'這次第一次就答對');
    assert.equal(JSON.stringify(state),before,'practice never mutates the original run');
    assert.deepEqual(awardChapterCards(parseCodex(null),state).unlockedIds,[]);
    scenarios++;
  }
}

const {state}=missedTask('preflight','water');
const old=structuredClone(state.judgments[0].retryDecision);
state.tasks.find(t=>t.id==='bag').done=true;state.handoffTokens=0;
state.judgments[0].context='走道行李已清除。';
assert.deepEqual(retryCandidates(state)[0].decision,old,'later context changes cannot replace the missed question');
const session=createRetry(retryCandidates(state)[0]);session.decision.choices[0].label='changed';
assert.deepEqual(state.judgments[0].retryDecision,old,'session choices are detached from the run');
assert.deepEqual(retryCandidates({judgments:[]}),[]);
assert.deepEqual(retryCandidates({judgments:[{incorrect:0},{incorrect:1}]}),[],'skip clean or legacy records without a captured question');
console.log(`PASS ${scenarios} chapter/task/variant retry paths, source isolation, context preservation, invalid inputs and no rewards`);
