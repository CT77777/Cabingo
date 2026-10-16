// One-decision practice, independent of the chapter engine and its rewards.
// Sessions live only while the current result screen is available.
export function retryCandidates(state) {
  return (state.judgments||[]).filter(j=>j.incorrect>0&&j.retryDecision?.choices?.some(c=>c.good)).map(j=>({
    taskId:j.taskId,title:j.title,previousIncorrect:j.incorrect,mode:j.mode,
    boarding:state.chapterId==='boarding',
    decision:structuredClone(j.retryDecision)
  }));
}

export function createRetry(candidate) {
  return {...structuredClone(candidate),attempts:0,incorrect:0,complete:false,feedback:''};
}

export function answerRetry(session,index) {
  if(session.complete||!Number.isInteger(index))return false;
  const choice=session.decision.choices[index];
  if(!choice)return false;
  session.attempts++;
  session.feedback=choice.feedback;
  if(choice.good)session.complete=true;
  else session.incorrect++;
  return true;
}

export function retryComparison(session) {
  if(!session.complete)return null;
  const before=`上次選錯 ${session.previousIncorrect} 次`;
  const after=session.incorrect?`這次選錯 ${session.incorrect} 次後答對`:'這次第一次就答對';
  return {before,after,note:'這是同一道題的重練結果；換個情境再練，才能進一步確認是否熟悉。'};
}
