const tasks = [
  { id: 'bag', kind: 'safety', title: '行李位置待確認', icon: '!' },
  { id: 'belt', kind: 'safety', title: '準備狀態待確認', icon: '!' },
  { id: 'tray', kind: 'safety', title: '餐桌狀態待確認', icon: '!' },
  { id: 'water', kind: 'service', title: '想要一杯水', icon: '水', spawn: 0, patience: 32 },
  { id: 'blanket', kind: 'service', title: '客艙有點冷', icon: '暖', spawn: 5, patience: 39 },
];
const lessons = {
  serviceIntro:{title:'先記錄需求，再確認安全',copy:'現在是起飛前最後安全檢查。普通飲水或保暖需求先記錄，告知起飛後協助；同事也只能接下紀錄，不會立即送物。合理延後後不再扣耐心。這是本章訓練設定，不代表法規一律禁止遞毛毯；醫療與緊急需求另依程序處理。'},
  aisle: { title: '有人走到走道了', copy: '靠近旅客按一次空白鍵，組員會自動招呼並引導旅客回座，不需再移動到指定位置。回座後，原本的一般服務需求可記錄為起飛後協助。' },
  correction: { title: '可以補救，紀錄會保留', copy: '正式巡艙先顯示 2 秒修正回饋，再重新選擇。安全失誤 1 次保留修正評價；2 次本輪需重試，仍可練習。' },
  handoff: { title: '同事已接下需求紀錄', copy: '自行記錄需 3 秒，請同事記錄需 1 秒，可節省 2 秒繼續安全檢查。本章同事協助記錄每輪 1 次，這是遊戲資源設定。同事記錄後會留待起飛後協助，不會取物或送達；記錄的回饋與自行記錄相同。' }
};

export const PREFLIGHT_CHAPTER=Object.freeze({
 id:'preflight',order:2,title:'起飛前巡艙',phase:'final-cabin-check',phaseLabel:'最後安全檢查 · 3D',code:'PRE-FLIGHT',available:true,
 duration:100,handoffTokens:1,briefTitle:'起飛前最後安全檢查。',
 briefDescription:'完成安全檢查、保持走道淨空，再回前方回報。\n一般飲水與保暖需求可記錄為起飛後協助，不必現在送達。\n本章為情境訓練；醫療與緊急需求另依程序處理。',
 tasks:Object.freeze(tasks.map(task=>Object.freeze(task))),
 lessons:Object.freeze(Object.fromEntries(Object.entries(lessons).map(([id,lesson])=>[id,Object.freeze(lesson)]))),
 tutorial:Object.freeze(['serviceIntro','handoff','aisle','correction']),eventPhases:Object.freeze([])
});
