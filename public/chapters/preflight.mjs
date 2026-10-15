const tasks = [
  { id: 'bag', kind: 'safety', title: '行李位置待確認', icon: '!' },
  { id: 'belt', kind: 'safety', title: '準備狀態待確認', icon: '!' },
  { id: 'tray', kind: 'safety', title: '餐桌狀態待確認', icon: '!' },
  { id: 'water', kind: 'service', title: '想要一杯水', icon: '水', spawn: 0, patience: 32 },
  { id: 'blanket', kind: 'service', title: '客艙有點冷', icon: '暖', spawn: 5, patience: 39 },
  { id: 'question', kind: 'service', title: '想知道何時出發', icon: '問', spawn: 10, patience: 46 }
];
const lessons = {
  aisle: { title: '有人走到走道了', copy: '需求等太久會出現紅色走道事件。靠近按 E 協助返回座位，再完成原本的服務。' },
  correction: { title: '可以補救，紀錄會保留', copy: '正式巡艙先顯示 2 秒修正回饋，再重新選擇。安全失誤 1 次保留修正評價；2 次本輪需重試，仍可練習。' },
  handoff: { title: '這次交接用掉了', copy: '服務交接每輪只有 1 次。交接後同事需要 12 秒才送達，回饋較少；名額不會恢復，其他需求要自己安排。' }
};

export const PREFLIGHT_CHAPTER=Object.freeze({
 id:'preflight',order:2,title:'起飛前巡艙',phase:'preflight',phaseLabel:'起飛前 · 3D',code:'PRE-FLIGHT',available:true,
 duration:100,handoffTokens:1,briefTitle:'先看現場，再出手。',
 briefDescription:'3 項安全檢查、3 個服務需求。\n靠近發光圈按 E，全部完成後回前方回報。\n選定處理方式後，組員會直接執行動作。',
 tasks:Object.freeze(tasks.map(task=>Object.freeze(task))),
 lessons:Object.freeze(Object.fromEntries(Object.entries(lessons).map(([id,lesson])=>[id,Object.freeze(lesson)]))),
 tutorial:Object.freeze(['handoff','aisle','correction']),eventPhases:Object.freeze([])
});
