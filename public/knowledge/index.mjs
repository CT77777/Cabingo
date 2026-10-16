// Educational drafts. Sources support the stated general principle, not the game's timing/scoring.
const traveler={label:'民航局｜旅客須知（行程核對與行李安全）',url:'https://www.caa.gov.tw/article.aspx?a=271'};
const safety={label:'民航局｜登機後需注意的安全事項',url:'https://www.caa.gov.tw/Article.aspx?a=402'};
const tips={label:'FAA｜Passenger Safety Tips（旅客安全原則）',url:'https://www.faa.gov/travelers/fly_safe/safety_tips'};
const tables={label:'FAA｜AC 121-24E，起降前餐桌、餐飲與行李收妥',url:'https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_121-24E.pdf'};
const cards=[
 {id:'boarding-guide',category:'服務溝通',title:'先核對，再指引座位',body:'先對照旅客的登機資訊與椅背排號，再給簡短、明確的方向。遊戲提示：本作中 3C 代表第 3 排、機艙右側；字母與座位配置依航空公司與機型而異。',sources:[traveler],sourceNote:'來源支持行程資訊核對；座位方向與協助方式是本作的簡化設計。',chapters:['boarding']},
 {id:'stow-baggage',category:'客艙安全',title:'行李收妥，走道留空',body:'隨身物品要妥善收妥，避免滑動、掉落或擋住通道。遊戲提示：先確認可見櫃子的空間，有空位才放入，不擠進已滿的櫃子；已收好的行李先查看，不必重做。',sources:[traveler],sourceNote:'來源支持行李收妥與通道淨空；各航空公司規定可能不同。',chapters:['boarding','preflight']},
 {id:'boarding-pass',category:'機艙資訊',title:'同座位號，也要核對日期',body:'核對行程時，日期、班次與旅客資料都需要一致。遊戲提示：兩人都指向 4C 時，比較兩張證件的日期、排數與側別，不能只看座位號就決定。',sources:[traveler],sourceNote:'來源支持行程資訊核對；本作不是登機查驗程序教學。',chapters:['boarding']},
 {id:'family-aisle',category:'服務溝通',title:'協助入座，也顧到腳邊物品',body:'物品不應阻礙通道；協助旅客時也要留意腳邊是否仍有行李。遊戲提示：先協助收妥家長的手提袋，再讓家長入座，比只請人坐下更完整。',sources:[traveler],sourceNote:'來源支持行李與通道安全；任務中的協助順序是本作設計；卡面另提供兒童乘機的一般安全資訊，不教導固定裝置的操作程序。',chapters:['boarding']},
 {id:'seat-belt',category:'客艙安全',title:'先讓旅客理解，再確認安全帶',body:'安全帶能在亂流與關鍵飛行階段提供保護；就座時應依機上指示繫妥。遊戲提示：先觀察旅客是否有注意、是否理解圖示，以及是否已扣好，再選擇說明或查看。',sources:[safety,tips],sourceNote:'來源支持繫妥安全帶與閱讀安全提示；對話選項是簡化的溝通練習。',chapters:['preflight']},
 {id:'tray-table',category:'客艙安全',title:'收餐桌前，先安置物品',body:'起降前的安全準備包含收妥餐桌及餐飲物品。遊戲提示：空桌可以收起；桌上仍有物品或旅客手持咖啡時，先協助安置，再完成收妥確認。',sources:[tables],sourceNote:'來源支持餐桌與餐飲物品收妥；實際作業依航空公司訓練。',chapters:['preflight']},
 {id:'water-service',category:'服務溝通',title:'回應需求，同時留意安全',body:'協助旅客時仍要注意通道是否淨空，並遵從組員的安全指示。本章是起飛前最後安全檢查，普通飲水需求先記錄為起飛後協助；自己或同事記錄後都停止耐心計時，不代表已送達。醫療或緊急需求另依程序處理。',sources:[traveler,tips],sourceNote:'來源支持通道安全與遵從組員指示；交接次數、等候秒數及服務順序是遊戲設定，不是航空作業規定。',chapters:['preflight']},
 {id:'blanket-service',category:'服務溝通',title:'說明等候後，記得回來協助',body:'安全與旅客需求需要一起留意，安全提醒應優先遵從。本章將普通保暖需求記錄為起飛後協助，合理延後不扣耐心，後續仍需追蹤。這是本章訓練設定，不代表法規一律禁止遞毛毯；醫療或緊急需求另依程序處理。',sources:[tips],sourceNote:'來源僅支持旅客安全與組員指示原則；普通需求延後及交接資源是本作訓練設計，不是通用 SOP。',chapters:['preflight']}
];
const airport={label:'IATA｜官方機場三字碼查詢',url:'https://www.iata.org/codes/index'};
const barcode={label:'IATA｜Bar Coded Boarding Pass Implementation Guide',url:'https://www.iata.org/contentassets/1dccc9ed041b4f3bbdcf8ee8682e75c4/2021_03_02-bcbp-implementation-guide-version-7-.pdf'};
const turbulence={label:'FAA｜Turbulence: Staying Safe',url:'https://www.faa.gov/travelers/fly_safe/turbulence'};
const cabinAir={label:'CDC Yellow Book 2026｜Air Travel（機艙氣壓與濕度）',url:'https://www.cdc.gov/yellow-book/hcp/travel-air-sea/air-travel.html'};
const baggage={label:'FAA｜Carry-On Baggage Tips',url:'https://www.faa.gov/travelers/prepare_fly/baggage'};
const facts={
 'boarding-guide':{unlockLabel:'指引長輩入座',collectibleTitle:'機場的三字密語',kicker:'AIRPORT CODES',fact:'登機資訊上的三個英文字母，可能是 IATA 機場代碼。它讓世界各地的機場能以簡短代碼被辨識；下次旅行，可以試著找找目的地的三字碼。',factSources:[airport]},
 'stow-baggage':{unlockLabel:'完成行李檢查',collectibleTitle:'行李也有安全座位',kicker:'STOW IT SAFELY',fact:'行李不只要放得下，還要放得穩。FAA 提醒，背帶應收好以免絆倒，頭頂櫃裡也不宜堆疊物品；滑落的行李可能傷到旅客。',factSources:[baggage]},
 'boarding-pass':{unlockLabel:'處理座位糾紛',collectibleTitle:'一張登機證的秘密',kicker:'MORE THAN A SEAT',fact:'登機證的條碼不只記座位。IATA 的標準資料欄位還包含出發地、目的地、航班與飛行日期等資訊；相同座位號，不代表同一趟旅程。',factSources:[barcode]},
 'family-aisle':{unlockLabel:'協助家長入座',collectibleTitle:'小旅客，大保護',kicker:'LITTLE TRAVELERS',fact:'安全帶與合適的兒童固定裝置，都是降低亂流傷害的重要防護。FAA 提醒，幼兒使用經核准的兒童座椅或裝置更安全；適用方式仍須事前向航空公司確認。',factSources:[turbulence]},
 'seat-belt':{unlockLabel:'完成安全帶檢查',collectibleTitle:'晴空，也會顛簸',kicker:'CLEAR SKY, STAY READY',fact:'窗外沒有烏雲，也可能遇到亂流。亂流往往看不見、也可能突然發生，因此就座時繫妥安全帶，並聽從組員指示，能減少意外受傷的風險。',factSources:[turbulence]},
 'tray-table':{unlockLabel:'完成餐桌檢查',collectibleTitle:'起降前的小整理',kicker:'READY FOR TAKEOFF',fact:'起降前的安全提醒，不只關於安全帶。FAA 的旅客簡報指引也包含收妥餐桌、餐飲物品和隨身行李；一個小動作，也是安全準備的一部分。',factSources:[tables]},
 'water-service':{unlockLabel:'妥善記錄飲水需求',collectibleTitle:'雲上的乾燥小世界',kicker:'CABIN MICROCLIMATE',fact:'機艙空氣通常比地面環境乾燥。CDC 指出，典型機艙相對濕度約為 10～20%，可能讓眼睛與上呼吸道黏膜感到乾；這是機艙環境的一個特點。',factSources:[cabinAir]},
 'blanket-service':{unlockLabel:'妥善記錄保暖需求',collectibleTitle:'高空裡的一座小山',kicker:'A CABIN ABOVE THE CLOUDS',fact:'飛機雖然有加壓，機艙卻不一定維持海平面的氣壓。CDC 指出，典型機艙氣壓約相當於海拔 6,000～8,000 英尺，較新的機型也可能維持更低的等效高度。',factSources:[cabinAir]}
};
export const KNOWLEDGE=Object.freeze(cards.map((c,index)=>Object.freeze({...c,...facts[c.id],serial:String(index+1).padStart(3,'0'),art:`./assets/cards/${c.id}.svg`,factSources:Object.freeze(facts[c.id].factSources.map(s=>Object.freeze({...s}))),reviewed:false,chapters:Object.freeze(c.chapters),sources:Object.freeze(c.sources.map(s=>Object.freeze({...s})))})));
const links={boarding:{guide:'boarding-guide',bag:'stow-baggage',seat:'boarding-pass',family:'family-aisle'},preflight:{bag:'stow-baggage',belt:'seat-belt',tray:'tray-table',water:'water-service',blanket:'blanket-service'}};
export function cardsForTask(chapterId,taskId){const id=links[chapterId]?.[taskId];return KNOWLEDGE.filter(c=>c.id===id);}
