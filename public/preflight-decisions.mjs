// Shared chapter 2 decisions; the assessment and practice execute the same actions.
export function preflightDecision(t,s={}) {
  s={tasks:[],hazards:[],handoffTokens:1,phase:'final-cabin-check',...s};
  const v = t.variant;
  const mk = (id, label, good, duration = 5, extra = {}) => ({ id, label, good, duration, tags: [`${duration}秒`], ...extra });
  const repaired = '確認完成，繼續巡艙。';
  let quote, description, choices;
  if (t.id === 'bag') {
    quote = ['我的包可以放哪裡？', '這個包還沒放好。', '我已經放好了。'][v];
    description = ['走道有行李，頭頂櫃還有空位。', '走道有行李；旅客上方已滿，另一側有可用空櫃。', '行李已收妥，走道保持淨空。'][v];
    choices = [mk('stow', '幫你放進可用空櫃', v !== 2, 5), mk('relocate', v===1?'擠進旅客上方已滿的櫃子':'先把行李留在走道', false, 6), mk('check', '查看已收好的行李', v === 2, 4)];
    choices.forEach(c => { c.feedback = c.good ? repaired : ['走道有行李，頭頂櫃有空位；現在需要協助收妥。', '旅客上方已滿，但另一側有空櫃；請使用畫面中的可用空櫃。', '行李已收妥、走道淨空；現在只需查看確認。'][v]; });
  } else if (t.id === 'belt') {
    quote = ['嗯？你剛剛說什麼？', '這個圖示是什麼意思？', '這樣可以了嗎？'][v];
    description = ['旅客盯著手機，安全帶尚未扣好。', '旅客指著圖示，安全帶尚未扣好。', '旅客已扣好安全帶，等你查看。'][v];
    if(s.characterMemory?.elder?.helped)quote=`又見面了，謝謝你登機時幫我。${quote}`;
    choices = [mk('attention', '先請旅客抬頭，再示範扣法', v === 0), mk('diagram', '先指圖示，讓旅客照著操作', v === 1, 6), mk('check', '查看扣好的安全帶', v === 2, 4)];
    choices.forEach(c => { c.feedback = c.good ? repaired : ['旅客正看手機、還沒扣好；需要先引起注意。', '旅客指著圖示、還沒扣好；需要說明圖示。', '安全帶已扣好；現在只需查看確認。'][v]; });
  } else if (t.id === 'tray') {
    quote = ['現在可以收桌子嗎？', '我還拿著咖啡呢。', '桌子收好了。'][v];
    description = ['餐桌展開，桌面已清空。', '餐桌展開，桌上有物品，旅客手拿咖啡。', '餐桌已收妥，旅客等你查看。'][v];
    choices = [mk('fold', '請把空餐桌收起', v === 0), mk('assist', '幫忙安置咖啡和物品', v === 1, 6), mk('check', '查看收妥的餐桌', v === 2, 4)];
    choices.forEach(c => { c.feedback = c.good ? repaired : ['餐桌展開但已清空；現在可以請旅客收起。', '桌上有物品，旅客拿著咖啡；需要協助安置物品。', '餐桌已收妥；現在只需查看確認。'][v]; });
  } else if (t.id === 'question') {
    const known = v !== 0;
    quote = '大概何時出發？'; description = `資訊板：${known ? '預估稍後，時間可能調整。' : '目前沒有確認的預估。'}`;
    choices = [mk('estimate', '預估稍後，可能調整', known, 4), mk('unknown', '還沒確定，有消息告訴您', !known, 4), mk('ask', '向同事確認最新消息', true, 9)];
    choices.forEach(c => { c.feedback = c.good ? '旅客收到與資訊板一致的回覆。' : known ? '資訊板已有預估、仍可能調整；這句回覆漏掉了已知資訊。' : '資訊板還沒有確認的預估；現在不能提供出發時間。'; });
  } else if(s.phase==='final-cabin-check'&&['water','blanket'].includes(t.id)) {
    const available=s.handoffTokens>0&&!s.handoffJob;
    quote=t.id==='water'?'可以給我一杯水嗎？':'可以給我一條毯子嗎？';
    description=`旅客提出${t.id==='water'?'飲水':'保暖'}需求。`;
    if(s.assessment&&s.chapterId==='preflight')return {id:t.id,title:t.title,quote,description,choices:[
      mk('wait','自行記錄需求，起飛後再協助',true,3,{ack:true,defer:true,feedback:'需求已記錄，起飛後再協助；這項需求已安排完成。'}),
      mk('serve',t.id==='water'?'自行取水，暫停安全檢查':'自行取毯，暫停安全檢查',false,3,{safetyError:true,feedback:'本情境應繼續安全檢查，自行記錄或安排同事送物。'}),
      ...(available?[mk('handoff',t.id==='water'?'請同事送水':'請同事送毯',true,1,{handoff:true,feedback:'同事已接下送物工作；你可以繼續巡艙，實際送達才算完成。'})]:[])
    ]};
    const feedback='需求已記錄，起飛後再協助；旅客留在座位，不再計算等候耐心。記錄需求不等於物品已送達。';
    choices=[
      mk('wait','記錄需求，起飛後再協助',true,3,{ack:true,defer:true,feedback}),
      mk('serve',t.id==='water'?'先送水，再繼續安全檢查':'先拿毯子，再繼續安全檢查',false,3,{safetyError:true,feedback:'本章正在起飛前最後安全檢查；普通需求先記錄延後，不應中斷安全確認。這是本章情境規則，醫療或緊急需求另依程序處理。'})
    ];
    if(available)choices.push(mk('handoff','請同事記錄，起飛後再協助',true,1,{handoff:true,defer:true,feedback:'同事已接下需求紀錄，起飛後再協助；現在不會取物或送達，安全檢查仍須完成。'}));
  } else if(['water','blanket'].includes(t.id)) {
    const urgent = s.tasks.find(x => x.id === 'bag' && !x.done && x.variant !== 2);
    const available = s.handoffTokens > 0 && !s.handoffJob;
    quote = t.id === 'water' ? '可以給我一杯水嗎？' : '可以給我一條毯子嗎？';
    description = `${urgent ? `附近的行李仍擋在走道。` : '走道行李已清除。'}${t.acknowledged ? '旅客已接受過一次等候安排。' : '旅客正在座位等候。'}`;
    choices = [
      mk('serve', t.id === 'water' ? '我來送水' : '我來拿毯子', !urgent, 8, { safetyError: !!urgent, feedback: urgent ? '走道仍被行李占用，現在應先處理行李；可回應等候或交接。' : '旅客需求已完成。' }),
      mk('handoff', t.id === 'water' ? '請同事送水' : '請同事拿毯子', available, 3, { handoff: true, tags: ['3秒', '你可以繼續巡艙'], feedback: available ? '已交接，待同事送達。回饋較少，名額用完不會恢復。' : '交接名額已用完，請親自協助或安排等候。' }),
      mk('wait', s.hazards.some(h=>!h.done)||urgent?'我先清理走道，再來協助您':s.tasks.some(t=>t.kind==='safety'&&!t.done)?'我先完成安全檢查，再回來':'我會回來送上，請稍等', !t.acknowledged, 3, { ack: true, tags: ['3秒', '旅客留在座位等候'], feedback: !t.acknowledged ? '旅客願意再等一下，需求還沒完成。' : '已延長過等候，重複說明不會完成需求。' })
    ];
    choices=choices.filter(c=>!c.handoff||available).filter(c=>!c.ack||!t.acknowledged);
    if(urgent&&t.acknowledged)choices.push(mk('leave','先清理走道行李，馬上回來',true,0,{leave:true,tags:[]}));
  }
  if(!choices)throw new RangeError(`沒有巡艙題目：${t.id}`);
  return {handoffHint:null,id:t.id,title:t.title,quote,description,choices};
}
