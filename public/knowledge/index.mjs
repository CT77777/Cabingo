// Educational drafts. Sources support the stated general principle, not the game's timing/scoring.
const traveler={label:'民航局｜旅客須知（行程核對與行李安全）',url:'https://www.caa.gov.tw/article.aspx?a=271'};
const safety={label:'民航局｜登機後需注意的安全事項',url:'https://www.caa.gov.tw/Article.aspx?a=402'};
const tips={label:'FAA｜Passenger Safety Tips（旅客安全原則）',url:'https://www.faa.gov/travelers/fly_safe/safety_tips'};
const tables={label:'FAA｜AC 121-24E，起降前餐桌、餐飲與行李收妥',url:'https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_121-24E.pdf'};
const cards=[
 {id:'boarding-guide',category:'服務溝通',title:'先核對，再指引座位',body:'先對照旅客的登機資訊與椅背排號，再給簡短、明確的方向。遊戲提示：本作中 3C 代表第 3 排、機艙右側；字母與座位配置依航空公司與機型而異。',sources:[traveler],sourceNote:'來源支持行程資訊核對；座位方向與協助方式是本作的簡化設計。',chapters:['boarding']},
 {id:'stow-baggage',category:'客艙安全',title:'行李收妥，走道留空',body:'隨身物品要妥善收妥，避免滑動、掉落或擋住通道。遊戲提示：附近櫃子已滿時應協調其他可用位置；已收好的行李先查看，不必重做。',sources:[traveler],sourceNote:'來源支持行李收妥與通道淨空；各航空公司規定可能不同。',chapters:['boarding','preflight']},
 {id:'boarding-pass',category:'機艙資訊',title:'同座位號，也要核對日期',body:'核對行程時，日期、班次與旅客資料都需要一致。遊戲提示：兩人都指向 4C 時，比較兩張證件的日期、排數與側別，不能只看座位號就決定。',sources:[traveler],sourceNote:'來源支持行程資訊核對；本作不是登機查驗程序教學。',chapters:['boarding']},
 {id:'family-aisle',category:'服務溝通',title:'協助入座，也顧到腳邊物品',body:'物品不應阻礙通道；協助旅客時也要留意腳邊是否仍有行李。遊戲提示：先協助收妥家長的手提袋，再讓家長入座，比只請人坐下更完整。',sources:[traveler],sourceNote:'來源支持行李與通道安全；協助順序是本作情境設計，不涉及嬰幼兒固定程序。',chapters:['boarding']},
 {id:'seat-belt',category:'客艙安全',title:'先讓旅客理解，再確認安全帶',body:'安全帶能在亂流與關鍵飛行階段提供保護；就座時應依機上指示繫妥。遊戲提示：先觀察旅客是否有注意、是否理解圖示，以及是否已扣好，再選擇說明或查看。',sources:[safety,tips],sourceNote:'來源支持繫妥安全帶與閱讀安全提示；對話選項是簡化的溝通練習。',chapters:['preflight']},
 {id:'tray-table',category:'客艙安全',title:'收餐桌前，先安置物品',body:'起降前的安全準備包含收妥餐桌及餐飲物品。遊戲提示：空桌可以收起；桌上仍有物品或旅客手持咖啡時，先協助安置，再完成收妥確認。',sources:[tables],sourceNote:'來源支持餐桌與餐飲物品收妥；實際作業依航空公司訓練。',chapters:['preflight']},
 {id:'water-service',category:'服務溝通',title:'回應需求，同時留意安全',body:'協助旅客時仍要注意通道是否淨空，並遵從組員的安全指示。遊戲提示：行李擋道時先排除障礙，或向旅客說明等候、協調同事；這些選項需要看當下可用資源。',sources:[traveler,tips],sourceNote:'來源支持通道安全與遵從組員指示；交接次數、等候秒數及服務順序是遊戲設定，不是航空作業規定。',chapters:['preflight']},
 {id:'blanket-service',category:'服務溝通',title:'說明等候後，記得回來協助',body:'安全與旅客需求需要一起留意，安全提醒應優先遵從。遊戲提示：請旅客稍等並不等於送達毯子，交接也要等同事完成；安排後仍需追蹤需求。',sources:[tips],sourceNote:'來源僅支持旅客安全與組員指示原則；追蹤需求、耐心與交接秒數是本作服務練習設計。',chapters:['preflight']}
];
export const KNOWLEDGE=Object.freeze(cards.map(c=>Object.freeze({...c,reviewed:false,chapters:Object.freeze(c.chapters),sources:Object.freeze(c.sources.map(s=>Object.freeze({...s})))})));
const links={boarding:{guide:'boarding-guide',bag:'stow-baggage',seat:'boarding-pass',family:'family-aisle'},preflight:{bag:'stow-baggage',belt:'seat-belt',tray:'tray-table',water:'water-service',blanket:'blanket-service'}};
export function cardsForTask(chapterId,taskId){const id=links[chapterId]?.[taskId];return KNOWLEDGE.filter(c=>c.id===id);}
