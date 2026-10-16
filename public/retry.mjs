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

export function retryPrompt(session) {
  const {id,variant}=session.decision.task;
  const prompts={
    guide:'旅客不知道登機證上的座位在哪裡，你會如何協助？',
    seat:'兩位旅客都以為自己坐 4C，你會如何核對？',
    family:'家長抱著孩子，手提袋擋住走道，你會如何協助？',
    bag:[
      '走道有行李，頭頂櫃還有空位，你會如何處理？',
      '旅客上方的頭頂櫃已滿，走道仍有行李，你會如何處理？',
      '行李已收妥、走道淨空，你會如何確認？'
    ][variant],
    belt:[
      '旅客正在看手機，安全帶尚未扣好，你會如何提醒？',
      '旅客指著圖示，安全帶尚未扣好，你會如何協助？',
      '旅客已扣好安全帶，你會如何確認？'
    ][variant],
    tray:[
      '餐桌展開、桌面已清空，你會如何處理？',
      '餐桌上有物品，旅客拿著咖啡，你會如何協助？',
      '餐桌已收妥，你會如何確認？'
    ][variant],
    water:'旅客想要一杯水，根據現場狀況，你會如何回應？',
    blanket:'旅客想要一條毯子，根據現場狀況，你會如何回應？'
  };
  return prompts[id]||'根據眼前的線索，你會如何協助旅客？';
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
