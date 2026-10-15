// Graphic evidence uses field values from the rule data, never correctness flags.
export function createBoardingEvidence(doc,items,{interactive=false,examined=[],onInspect=()=>{}}={}){
 const el=(tag,cls,text)=>{const n=doc.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
 return items.map(item=>{
  const inspectable=interactive&&['pass','map'].includes(item.kind),root=el(inspectable?'button':'div',`visual-clue clue-${item.kind}`);
  if(inspectable){root.type='button';root.dataset.inspect=item.kind;root.dataset.revealed=String(examined.includes(item.kind));root.setAttribute('aria-label',`查看${item.label}`);root.setAttribute('aria-expanded',String(examined.includes(item.kind)));root.addEventListener('click',e=>onInspect(item.kind,e));}
  else root.setAttribute('role','group');
  if(item.kind==='pass'){
   const main=el('span','pass-main'),brand=el('span','pass-brand','✦ CABINGO'),flight=el('span','pass-flight',`${item.flight} · BOARDING PASS`),owner=el('span','pass-owner',item.owner),date=el('span','pass-date',`${item.day} OCT 2026`),barcode=el('span','pass-barcode');
   barcode.setAttribute('aria-hidden','true');main.append(brand,flight,owner,date,barcode);
   const stub=el('span','pass-stub');stub.append(el('span','pass-seat-label','SEAT'),el('strong','pass-seat',item.seat));root.append(main,stub);
   root.setAttribute('aria-label',`${inspectable?'查看，':''}${item.label}，${item.flight}，2026 年 10 月 ${item.day} 日，座位 ${item.seat}`);
  }else if(item.kind==='map'){
   root.append(el('span','map-heading','座位圖'));
   const rows=el('span','seat-map');for(let row=6;row>=1;row--){const line=el('span','seat-map-row');line.append(el('span','map-row-number',row));for(const letter of ['D','C','│','B','A'])line.append(el('span',letter==='│'?'map-aisle':'map-seat',letter));rows.append(line);}root.append(rows,el('span','map-nose','▼ 機頭'));
   root.setAttribute('aria-label',`${inspectable?'查看，':''}座位圖。機頭在下方，畫面左方為 D、C，走道右方為 B、A。排號由機頭的 1 排到機尾的 6 排。`);
  }else if(item.kind==='bins'){
   root.append(el('span','map-heading','現場'));
   const view=el('span','bin-diagram');const full=el('span','diagram-bin occupied'),empty=el('span','diagram-bin vacant');for(let i=0;i<(item.full?3:0);i++)full.append(el('i','luggage-shape'));empty.append(el('i','empty-outline'));view.append(item.side==='right'?full:empty,el('span','diagram-aisle','│'),item.side==='right'?empty:full);root.append(view,el('span','floor-luggage',item.stowed?'':'▣'),el('span','map-nose','▼ 機頭'));
   root.setAttribute('aria-label',`旅客上方的櫃內${item.full?'已有三件行李':'仍有空間'}，對側櫃內沒有行李，${item.stowed?'走道已淨空':'走道中央有一件行李'}。`);
  }else{
   const view=el('span','family-diagram'),person=el('span','person-shape'),baby=el('span','baby-shape');person.append(baby);const bag=el('span','luggage-shape'),aisle=el('span','diagram-aisle','│'),seat=el('span','seat-shape');view.append(...(item.side==='right'?[seat,aisle,bag,person]:[person,bag,aisle,seat]));root.append(el('span','map-heading','現場'),view);
   root.setAttribute('aria-label','家長抱著孩子，手提袋在腳邊走道，座位旁有空間。');
  }
  if(inspectable&&!examined.includes(item.kind))root.setAttribute('aria-label',`查看${item.label}`);
  return root;
 });
}
