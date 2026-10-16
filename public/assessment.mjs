import {preflightDecision} from './preflight-decisions.mjs?v=ch2-actions-2';
// Fictional scenario decisions, pending instructor review. These are not SOPs.
export const ASSESSMENT_VERSION=2;
export const assessmentVersion=chapterId=>chapterId==='preflight'?3:ASSESSMENT_VERSION;
export const ASSESSMENT_SCOPE='每題只能作答一次，結束後統一講評。不執行處置或模擬服務等待；全部作答後回前方提交答案。這是待專業審閱的情境判斷測驗，不代表公司正式考核。';
export const assessmentScope=state=>`${state.duration} 秒 · ${state.tasks.length} 題。${state.chapterId==='preflight'?'每題只能作答一次。答對後執行處置；答錯顯示紅叉與旅客回覆，正確做法留到結算講評。完成作答及處置後回前方提交；行李未收妥時可繞行。':ASSESSMENT_SCOPE}`;

export function assessmentDecision(task,chapterId='preflight',state={}) {
  if(chapterId==='preflight'&&task.id!=='priority')return preflightDecision(task,state);
  const v=task.variant;
  const choice=(id,label,good,feedback)=>({id,label,good,feedback,tags:[]});
  let description,choices;
  if(task.id==='priority') {
    const boarding=chapterId==='boarding';
    description=boarding?'登機時，旅客正準備跨過走道上的行李，另一位旅客在旁詢問座位方向。你現在應先做什麼？':'最後安全檢查時，旅客正準備跨過走道上的行李，另一位旅客提出一般飲水需求，沒有醫療或緊急情況。你現在應先做什麼？';
    const explanation='這題有旅客即將跨越阻礙的即時風險，應先制止跨越並安排排除阻礙，再繼續其他協助。沒有此限制的獨立任務，不要求固定順序。';
    return {id:task.id,title:'優先處理判斷',quote:'請根據這個獨立情境選擇下一步。',description,choices:[
      choice('secure','先請旅客停止跨越，安排排除走道阻礙',true,explanation),
      {...choice('other',boarding?'先完整解說座位方向，之後再處理阻礙':'先離開取水，之後再處理走道阻礙',false,explanation),safetyError:true},
      {...choice('cross','先讓旅客小心跨過行李，再安排收妥',false,explanation),safetyError:true}
    ]};
  } else if(task.id==='guide') {
    description='登機證上的座位為 3C；座位圖顯示 C 在旅客面向的機艙右側。旅客需要你協助找座位。';
    const explanation='先核對登機證，再依本機座位圖指引第 3 排 C 座；字母方向依機型而異。';
    return {id:task.id,title:'座位指引判斷',quote:'第一次搭飛機，3C 是往哪裡走呢？',description,choices:[choice('guide','核對票卡與座位圖後，指引第 3 排 C 座',true,explanation),choice('row','只確認第 3 排，請旅客自行選座',false,explanation),choice('side','依慣用側別直接指引第 3 排 B 座',false,explanation)]};
  } else if(task.id==='seat') {
    description='兩位旅客都認為自己坐 4C。請比較兩張登機證與本次航班資訊，找出需要進一步核對的差異。';
    const labels=['乙的座位為 5C，先核對排數並協助找位','乙的座位為 4B，先核對側別並協助找位','乙的登機證日期不同，請前門重新核對'];
    const explanations=['乙的登機證是 5C，差異在排數。','乙的登機證是 4B，差異在側別。','乙的登機證是隔日航班，需回前門核對，不能只憑座位號安排入座。'];
    return {id:task.id,title:'登機資訊核對判斷',quote:'我們都以為這裡是自己的位置。',description,choices:labels.map((label,i)=>choice(['row','side','date'][i],label,i===v,explanations[v]))};
  } else if(task.id==='family') {
    description='家長抱著孩子，手提袋占住走道，座位旁有可用空間；目前沒有其他即時事件。你會如何安排協助？';
    const explanation='先協助安置手提袋，再協助家長入座；只處理人或物其中一項，仍未妥善解決通道與入座需求。';
    return {id:task.id,title:'協助家長判斷',quote:'我抱著孩子，這些東西有點拿不住。',description,choices:[choice('assist','先協助安置手提袋，再協助家長入座',true,explanation),{...choice('sit','先請家長入座，手提袋留待稍後處理',false,explanation),safetyError:true},choice('bag','先安置手提袋，請家長繼續站著等候',false,explanation)]};
  } else if(task.id==='bag') {
    description=['走道有行李，旅客上方的頭頂櫃有空位。','走道有行李，旅客上方的頭頂櫃已滿；另一側有可用空櫃。','行李已收妥，走道淨空，旅客等你確認。'][v];
    const labels=[
      ['協助放入可用空櫃，再確認走道淨空','先請旅客看管走道上的行李，稍後再收','只確認頭頂櫃有空位，繼續下一項'],
      ['協助移至另一側可用空櫃，再確認走道','先留在旅客腳邊的走道，稍後再找位置','請旅客自行找位置，先結束這項確認'],
      ['查看收妥狀態及走道，再完成確認','聽取旅客已收妥的回覆，直接完成確認','只查看頭頂櫃，略過走道狀態']
    ][v];
    const explanation='確認行李實際收妥與走道淨空；需要收納時，使用可用空櫃，不能只靠口頭承諾或留待稍後。';
    choices=labels.map((label,i)=>choice(['stow','defer','partial'][i],label,i===0,explanation));
  } else if(task.id==='belt') {
    description=['旅客正在看手機，沒有注意你的提醒，安全帶尚未扣好。','旅客已注意到你，指著圖示表示不懂扣法，安全帶尚未扣好。','旅客表示安全帶已扣好，等你查看確認。'][v];
    const labels=[
      ['先取得旅客注意，說明扣法後查看結果','維持原音量再提醒一次，隨即前往下一排','請鄰座轉達提醒，將這項列為已確認'],
      ['依圖示說明扣法，讓旅客操作後查看結果','請旅客自行閱讀圖示，隨即完成確認','再次提醒要扣安全帶，不確認是否理解'],
      ['查看安全帶扣妥狀態，再完成確認','依旅客口頭回覆完成確認','只確認旅客有坐好，稍後再看安全帶']
    ][v];
    const explanation=['先取得旅客注意，再說明並確認結果；單次提醒或轉告不等於已確認扣妥。','旅客需要理解扣法，應說明並確認操作結果；只有提醒或交給旅客自行閱讀仍不足。','旅客的回覆是線索，仍需查看實際扣妥狀態。'][v];
    choices=labels.map((label,i)=>choice(['confirm','remind','delegate'][i],label,i===0,explanation));
  } else if(task.id==='tray') {
    description=['餐桌仍展開，桌面已清空，旅客詢問是否可以收起。','餐桌仍展開，桌上有物品，旅客手拿咖啡。','餐桌看似已收妥，旅客等你查看確認。'][v];
    const labels=[
      ['請旅客收起餐桌，並查看收妥結果','桌面已清空，先完成這項確認','告知稍後收起，先前往下一排'],
      ['先協助安置咖啡及物品，再收妥並確認','請旅客先收餐桌，物品之後再安置','請旅客拿著所有物品，直接完成確認'],
      ['查看餐桌收妥狀態，再完成確認','依旅客表示已收好，直接完成確認','只確認桌面沒有物品，不再查看收妥狀態']
    ][v];
    const explanation=['空桌可以收起，仍要查看收妥結果；桌面清空不等於餐桌已收妥。','先安置咖啡與物品，再收起並確認餐桌，避免將物品處置與收妥確認省略。','查看實際收妥狀態；口頭回覆或桌面沒有物品都不能取代確認。'][v];
    choices=labels.map((label,i)=>choice(['confirm','partial','later'][i],label,i===0,explanation));
  } else if(['water','blanket'].includes(task.id)) {
    const need=task.id==='water'?'飲水':'保暖';
    description=`起飛前最後安全檢查中，旅客提出一般${need}需求，沒有醫療或緊急情況。本情境設定：普通需求留待起飛後協助。`;
    const explanation='本情境應記錄並告知起飛後協助，安全確認仍需完成；交接紀錄不代表物品已送達。這是本章設定，不是通用航空 SOP。';
    choices=[choice('record','記錄需求並告知起飛後協助',true,explanation),{...choice('serve','先離開檢查工作取物，之後再回來',false,explanation),safetyError:true},choice('promise','告知起飛後協助，不留下需求紀錄',false,explanation)];
  }
  if(!choices)throw new RangeError(`沒有考核題目：${task.id}`);
  const titles={bag:'行李收妥判斷',belt:'安全帶確認判斷',tray:'餐桌收妥判斷',water:'飲水需求安排',blanket:'保暖需求安排'};
  const quotes={bag:['我的包可以放哪裡？','這個包還沒放好。','我已經放好了。'][v],belt:['嗯？你剛剛說什麼？','這個圖示是什麼意思？','這樣可以了嗎？'][v],tray:['現在可以收桌子嗎？','我還拿著咖啡呢。','桌子收好了。'][v],water:'可以給我一杯水嗎？',blanket:'可以給我一條毯子嗎？'};
  return {id:task.id,title:titles[task.id],quote:quotes[task.id],description,choices};
}

export function assessmentSummary(state) {
  const tasks=state.tasks||[],judgments=state.judgments||[];
  const category=kind=>{
    const expected=tasks.filter(t=>t.kind===kind),answers=judgments.filter(j=>expected.some(t=>t.id===j.taskId));
    return {total:expected.length,answered:answers.length,correct:answers.filter(j=>j.firstChoice?.good).length,incorrect:answers.filter(j=>j.firstChoice?.good===false).length};
  };
  const safety=category('safety'),service=category('service'),priority=category('priority');
  const submitted=state.endReason==='complete'&&tasks.length>0&&tasks.every(t=>judgments.some(j=>j.taskId===t.id&&j.firstChoice));
  const incorrect=judgments.filter(j=>j.firstChoice?.good===false).length;
  const safetyErrors=judgments.filter(j=>j.firstChoice?.good===false&&(tasks.find(t=>t.id===j.taskId)?.kind==='safety'||j.safetyIncorrect>0)).length;
  const stars=!submitted||safetyErrors?0:incorrect===0?3:incorrect===1?2:1;
  const title=!submitted?'模擬結束，作答尚未完整提交。':safetyErrors?'安全判斷需要再練習。':incorrect?'安全相關題答對，其他判斷再練習。':'本次情境首次作答全對。';
  const record=state.assessment&&submitted&&stars>0?{chapterId:state.chapterId,questionVersion:assessmentVersion(state.chapterId),total:tasks.length,stars,incorrect,safetyErrors,elapsed:state.elapsed}:null;
  return {safety,service,priority,submitted,incorrect,safetyErrors,stars,title,record};
}

export function assessmentFeedback(state) {
  return (state.tasks||[]).map(t=>{
    const decision=assessmentDecision(t,state.chapterId,state),correct=decision.choices.filter(c=>c.good);
    const judgment=state.judgments.find(j=>j.taskId===t.id),first=judgment?.firstChoice;
    return {id:t.id,title:decision.title,status:!first?'unobserved':first.good?'good':'improve',
      context:judgment?.context||decision.description,
      firstChoice:first?.label||'尚未作答',
      correctAction:judgment?.correctAction||correct.map(c=>c.label).join('；或'),
      reason:judgment?.reason||correct[0].feedback};
  });
}
