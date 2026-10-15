const tasks=[
 {id:'guide',kind:'service',title:'長輩在找座位',characterId:'elder',row:0,side:'right',variant:0,patience:40},
 {id:'bag',kind:'safety',title:'行李還沒放好',row:1,side:'left',variant:1},
 {id:'seat',kind:'safety',title:'兩位旅客都在找 4C',row:3,side:'right'},
 {id:'family',kind:'service',title:'家長需要騰出通道',characterId:'parent',row:4,side:'left',variant:0,patience:40}
];
export const BOARDING_CHAPTER=Object.freeze({
 id:'boarding',order:1,title:'登機',phase:'boarding',phaseLabel:'登機中 · 3D',code:'BOARDING',available:true,duration:90,handoffTokens:0,
 briefTitle:'歡迎登機，從這裡開始。',briefDescription:'先跟著引導，學會移動、互動與看線索。\n教學不倒數；接著有 90 秒協助旅客就座。\n紅色先處理安全，綠色是服務；本章沒有交接。',
 tasks:Object.freeze(tasks.map(t=>Object.freeze(t))),tutorial:Object.freeze(['boardingWelcome','boardingReady','correction']),
 lessons:Object.freeze({boardingWelcome:{title:'跟著做，學會第一趟登機',copy:'先走近旅客、查看登機證，再替旅客指路。每一步完成才會前進，教學期間不倒數、不扣分。'},boardingReady:{title:'現在，換你接手',copy:'先處理安全，再照顧服務需求。走道有人通過時，橫移到座位間讓路。全部入座、需求完成後，回前方回報。按下開始才計時。'},correction:Object.freeze({title:'看兩份線索，再試一次',copy:'修正後可以重選。一次安全失誤保留補救評價，兩次以上需重試；教學與練習不扣分。'})}),
 eventPhases:Object.freeze([])
});
