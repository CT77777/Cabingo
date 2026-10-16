export function summarizeResult(s) {
  const complete=s.endReason==='complete'&&s.grade!=='incomplete';
  const stars=s.practice?null:!complete||s.safetyErrors>=2?0:s.safetyErrors===1?1:s.mistakes===0&&s.comfort>=95?3:2;
  const title=s.practice?'練習完成。':stars===3?'從容出發，零失誤。':s.safetyErrors===1&&complete?'補救完成，紀錄保留。':stars===2?'巡艙完成，繼續精進。':complete?'工作完成，判斷需重試。':'還有工作，下輪再試。';
  const advice=s.safetyErrors?'下次先確認安全線索，再選擇處理。':!complete?'完成全部需求與走道處理後，記得回前方回報。':s.mistakes?'回應服務前先看現場資訊，減少重選。':s.tasks?.some(t=>t.late)?'先安排等候或交接，避免旅客等太久。':'試著保持零失誤，並縮短巡艙路線。';
  return {stars,title,advice,record:s.practice||!complete||stars===0?null:{version:1,stars,safetyErrors:s.safetyErrors,comfort:s.comfort,elapsed:s.elapsed}};
}
export function parseBest(raw) {
  try{const r=JSON.parse(raw);if(!r||r.version!==1||!Number.isInteger(r.stars)||r.stars<1||r.stars>3||!Number.isInteger(r.safetyErrors)||r.safetyErrors<0||!Number.isFinite(r.comfort)||r.comfort<0||r.comfort>100||!Number.isFinite(r.elapsed)||r.elapsed<0||r.elapsed>100)return null;
    if((r.safetyErrors>=2&&r.stars>0)||(r.safetyErrors===1&&r.stars>1))return null;
    return {version:1,stars:r.stars,safetyErrors:r.safetyErrors,comfort:r.comfort,elapsed:r.elapsed};
  }catch{return null;}
}
export function selectBest(previous,candidate) {
  if(!candidate)return previous;if(!previous)return candidate;
  const a=[candidate.stars,-candidate.safetyErrors,candidate.comfort,-candidate.elapsed],b=[previous.stars,-previous.safetyErrors,previous.comfort,-previous.elapsed];
  for(let i=0;i<a.length;i++){if(a[i]>b[i])return candidate;if(a[i]<b[i])return previous;}return previous;
}

// Describe observable behavior, without turning game scores into qualifications.
// Use task records rather than the bounded sound/animation event queue.
export function trainingFeedback(s) {
  const tasks=s.tasks||[],judgments=s.judgments||[];
  const judged=kind=>judgments.filter(j=>tasks.some(t=>t.id===j.taskId&&t.kind===kind));
  const taskFor=j=>tasks.find(t=>t.id===j.taskId);
  const mode=j=>j.mode==='tutorial'?'教學中，':j.mode==='practice'?'練習中，':'';
  const row=(id,title,status,evidence,impact,advice)=>({id,title,status,evidence,impact,advice});
  const correction=j=>{
    const first=j.firstChoice;
    const start=first?.good===false?'第一次就選錯，累計選錯':first?.good===true?'第一次選對，後來曾選錯':'曾選錯';
    const outcome=taskFor(j).deferred&&j.good?'，之後修正並記錄為起飛後協助':taskFor(j).done&&j.good?'，之後修正並完成':'，這項工作還沒完成';
    return `${mode(j)}「${j.title}」${start} ${j.incorrect} 次${outcome}。`;
  };
  const safety=judged('safety'),wrongSafety=judgments.find(j=>taskFor(j)&&(j.safetyIncorrect>0||taskFor(j).kind==='safety'&&j.incorrect>0));
  const safetyAdvice={bag:'先確認行李是否擋道、哪個櫃子可用，再選擇放置方式。',belt:'先看安全帶是否扣好，以及旅客正看哪裡，再選擇提醒方式。',tray:'先確認餐桌是否收妥、桌上有沒有物品，再決定怎麼協助。',seat:'比較兩張登機證的排數、側別與日期，再作判斷。',water:s.phase==='final-cabin-check'?'最後安全檢查期間，記錄一般需求為起飛後協助，繼續安全確認。':'走道被行李擋住時，先安排等候或交接，再清理行李。',blanket:s.phase==='final-cabin-check'?'本章將普通保暖需求記錄延後；這是訓練設定，醫療與緊急需求另依程序處理。':'走道被行李擋住時，先安排等候或交接，再清理行李。'};
  const congestion=s.boarding?.congestionEvents||0;
  let safetyRow;
  if(wrongSafety||congestion){
    const evidence=[wrongSafety?correction(wrongSafety):'',congestion?`走道曾持續擁擠 ${congestion} 次。`:''].filter(Boolean).join('');
    const impact=wrongSafety?'選錯後需要重新處理；補救完成，仍會保留這次選錯的紀錄。':'走道持續擁擠，會影響旅客通行。';
    safetyRow=row('safety','安全判斷','improve',evidence,impact,congestion?'除了看線索，也要側身讓路，避免旅客一直卡在走道。':safetyAdvice[wrongSafety.taskId]||'先看清楚現場線索，再選擇處理方式。');
  }else if(safety.length){
    const completed=safety.filter(j=>taskFor(j).done);
    safetyRow=row('safety','安全判斷',completed.length===safety.length?'good':'improve',`已回應 ${safety.length} 項安全情境，沒有選錯；其中 ${completed.length} 項已處理完成。`,'選對處理方式後，還要確認動作完成，才算處理完畢。',completed.length===safety.length?'繼續先觀察線索，再做判斷。':'把已選好的處理做完，再前往下一個需求。');
  }else safetyRow=row('safety','安全判斷','unobserved','這次還沒有安全情境的選擇紀錄。','沒有足夠紀錄判斷這項能力。','下次靠近安全標記，查看線索並選擇處理方式。');

  const service=tasks.filter(t=>t.kind==='service'),wrongService=judged('service').find(j=>j.incorrect>0);
  const late=service.find(t=>t.late),pending=service.find(t=>t.assigned&&!t.done);
  const handed=service.find(t=>t.done&&t.handoff),waited=service.find(t=>t.done&&t.acknowledged),served=service.find(t=>t.done);
  let serviceRow;
  if(late)serviceRow=row('service','服務安排','improve',`「${late.title}」曾等候超時，${late.deferred?'後來已記錄為起飛後協助':late.done?'後來已完成服務':'需求仍未完成'}。`,s.phase==='final-cabin-check'?'需求後來可以安排延後，但曾未及時回應。':'後來補上服務，仍需要留意先前的等候。','忙不過來時先安排等候；本章允許交接時，也可請同事協助。');
  else if(wrongService)serviceRow=row('service','服務安排','improve',correction(wrongService),'回應方式需要修正，旅客的需求才能妥善處理。','先看旅客需求與現場限制，再決定怎麼協助。');
  else if(s.phase==='final-cabin-check'&&service.length){
    const recorded=service.filter(t=>t.done&&t.deferred).length,remaining=service.length-recorded;
    serviceRow=row('service','服務安排',remaining?'improve':'good',`已記錄 ${recorded}/${service.length} 項一般需求為起飛後協助。${remaining?`仍有 ${remaining} 項需求未記錄。`:''}`,remaining?'未記錄的需求尚未獲得妥善安排；完成安全回報不代表所有需求均已處理。':'合理延後後停止耐心計時；記錄與交接均不代表物品已送達。',remaining?'在不影響安全工作的前提下，記錄剩餘需求並告知起飛後協助。':'先完成最後安全確認；起飛後依實際程序追蹤已記錄的需求。');
  }
  else if(pending)serviceRow=row('service','服務安排','improve',`已安排同事協助「${pending.title}」，結束時仍未送達。`,'安排交接不等於需求已完成。','留意同事進度，確認送達後再回報。');
  else if(handed)serviceRow=row('service','服務安排','good',`你安排同事協助「${handed.title}」，同事已送達。`,'有分工，也有實際完成服務。','繼續確認交接結果，再完成最後回報。');
  else if(waited)serviceRow=row('service','服務安排','good',`你先安排「${waited.title}」等候，後來已完成服務。`,'安排等候之後，也有把需求處理完。','維持追蹤，別把安排等候當成已完成服務。');
  else if(served)serviceRow=row('service','服務安排','good',`你已完成「${served.title}」的服務。`,'這項需求已有處理結果。','繼續留意其他需求與旅客的等候時間。');
  else if(judged('service').length)serviceRow=row('service','服務安排','improve','你已選擇服務回應，但還沒有完成的服務紀錄。','開始處理和完成服務是兩件事。','確認服務實際完成，再處理下一項。');
  else serviceRow=row('service','服務安排','unobserved','這次還沒有服務回應的紀錄。','沒有足夠紀錄判斷這項能力。','下次靠近服務標記，了解旅客需要什麼。');

  const done=tasks.filter(t=>t.done).length,hazards=(s.hazards||[]).filter(h=>!h.done).length;
  const standing=(s.boarding?.actors||[]).filter(a=>!['seated','exited'].includes(a.status)).length;
  const finalCheck=s.phase==='final-cabin-check',required=finalCheck?tasks.filter(t=>t.kind==='safety'):tasks;
  const ready=required.length>0&&required.every(t=>t.done)&&!hazards&&!standing;
  const reported=ready&&s.endReason==='complete';
  const evidence=finalCheck?`安全確認 ${required.filter(t=>t.done).length}/${required.length} 項，需求記錄 ${service.filter(t=>t.deferred).length}/${service.length} 項，未清走道事件 ${hazards} 件；${reported?'客艙安全已回報':'尚未完成安全回報'}。`:tasks.length?`工作完成 ${done}/${tasks.length} 項${s.boarding?`，還有 ${standing} 位旅客未到位`:''}，未清走道事件 ${hazards} 件；${reported?'已回前方回報':'尚未完成回報'}。`:'這次沒有可核對的任務紀錄。';
  const completionRow=row('completion','收尾回報',!tasks.length?'unobserved':reported?'good':'improve',evidence,reported?(finalCheck?'安全條件已確認並完成回報；普通需求可留待起飛後協助。':'需求處理完，也完成最後回報。'):ready?(finalCheck?'安全條件已確認，還差最後回報。':'工作都做完了，還差最後回報。'):finalCheck?'完成安全確認、清空走道後，回報客艙安全。':'完成所有需求、清空走道後，還要回前方回報。',reported?'下次繼續保留收尾檢查與回報的時間。':ready?'全部完成後，記得回前方按互動鍵回報。':finalCheck?'先確認安全與走道狀態，再回報；普通需求可記錄為起飛後協助。':'先完成剩餘需求，確認走道與旅客狀態，再回前方回報。');
  return [safetyRow,serviceRow,completionRow];
}
