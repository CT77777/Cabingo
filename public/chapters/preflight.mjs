const tasks = [
  { id: 'bag', kind: 'safety', title: '行李位置待確認', icon: '!' },
  { id: 'belt', kind: 'safety', title: '準備狀態待確認', icon: '!' },
  { id: 'tray', kind: 'safety', title: '餐桌狀態待確認', icon: '!' },
  { id: 'water', kind: 'service', title: '想要一杯水', icon: '水', spawn: 0, patience: 32 },
  { id: 'blanket', kind: 'service', title: '客艙有點冷', icon: '暖', spawn: 5, patience: 39 },
];
const lessons = {
  serviceIntro:{title:'先安排，再開始巡艙',copy:'試著讓旅客留在座位等候，再做一項安全檢查；也能請同事送水，自己繼續巡艙。這裡只是示範，不消耗本輪時間或交接名額。'},
  aisle: { title: '有人走到走道了', copy: '先靠近旅客按空白鍵，再走到走道上的發光點，讓出回座路線。需要取消時，可在暫停畫面取消引導。回座後，原本的送水或毯子需求仍要完成。' },
  correction: { title: '可以補救，紀錄會保留', copy: '正式巡艙先顯示 2 秒修正回饋，再重新選擇。安全失誤 1 次保留修正評價；2 次本輪需重試，仍可練習。' },
  handoff: { title: '這次交接用掉了', copy: '服務交接每輪只有 1 次。交接後同事需要 12 秒才送達，回饋較少；名額不會恢復，其他需求要自己安排。' }
};

export const PREFLIGHT_CHAPTER=Object.freeze({
 id:'preflight',order:2,title:'起飛前巡艙',phase:'preflight',phaseLabel:'起飛前 · 3D',code:'PRE-FLIGHT',available:true,
 duration:100,handoffTokens:1,briefTitle:'先看現場，再出手。',
 briefDescription:'3 項安全檢查、2 個服務需求。\n靠近發光圈按空白鍵，全部完成後回前方回報。\n選定處理方式後，組員會直接執行動作。',
 tasks:Object.freeze(tasks.map(task=>Object.freeze(task))),
 lessons:Object.freeze(Object.fromEntries(Object.entries(lessons).map(([id,lesson])=>[id,Object.freeze(lesson)]))),
 tutorial:Object.freeze(['serviceIntro','handoff','aisle','correction']),eventPhases:Object.freeze([])
});
