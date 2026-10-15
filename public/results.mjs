export function summarizeResult(s) {
  const complete=s.endReason==='complete'&&s.grade!=='incomplete';
  const stars=s.practice?null:!complete||s.safetyErrors>=2?0:s.safetyErrors===1?1:s.mistakes===0&&s.comfort>=95?3:2;
  const title=s.practice?'練習完成。':stars===3?'從容出發，零失誤。':s.safetyErrors===1&&complete?'補救完成，紀錄保留。':stars===2?'巡艙完成，繼續精進。':complete?'工作完成，判斷需重試。':'還有工作，下輪再試。';
  const advice=s.safetyErrors?'下次先確認安全線索，再選擇處理。':!complete?'完成全部需求與走道處理後，記得回前方回報。':s.mistakes?'回應服務前先看現場資訊，減少重選。':s.tasks?.some(t=>t.late)?'先安排等候或交接，避免旅客等太久。':'試著保持零失誤，並縮短巡艙路線。';
  return {stars,title,advice,record:s.practice?null:{version:1,stars,safetyErrors:s.safetyErrors,comfort:s.comfort,elapsed:s.elapsed}};
}
export function parseBest(raw) {
  try{const r=JSON.parse(raw);if(!r||r.version!==1||!Number.isInteger(r.stars)||r.stars<0||r.stars>3||!Number.isInteger(r.safetyErrors)||r.safetyErrors<0||!Number.isFinite(r.comfort)||r.comfort<0||r.comfort>100||!Number.isFinite(r.elapsed)||r.elapsed<0||r.elapsed>100)return null;
    if((r.safetyErrors>=2&&r.stars>0)||(r.safetyErrors===1&&r.stars>1))return null;
    return {version:1,stars:r.stars,safetyErrors:r.safetyErrors,comfort:r.comfort,elapsed:r.elapsed};
  }catch{return null;}
}
export function selectBest(previous,candidate) {
  if(!candidate)return previous;if(!previous)return candidate;
  const a=[candidate.stars,-candidate.safetyErrors,candidate.comfort,-candidate.elapsed],b=[previous.stars,-previous.safetyErrors,previous.comfort,-previous.elapsed];
  for(let i=0;i<a.length;i++){if(a[i]>b[i])return candidate;if(a[i]<b[i])return previous;}return previous;
}
