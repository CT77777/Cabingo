"""Independent static DOM/CSS checks for the 3D preflight page.

This checks actual cascade rules and declared viewport arithmetic at the target
dimensions. It is deliberately not a screenshot, native layout, or WebGL test.
"""
from pathlib import Path
from lxml import html
from datetime import datetime, timezone
import re, json, hashlib, sys, ast, operator
ROOT = Path(__file__).resolve().parent.parent
HTML = (ROOT/'public/index.html').read_text()
CSS = (ROOT/'public/style.css').read_text()
root = html.fromstring(HTML)
results=[]
def check(name, condition, detail=None):
    results.append({'name':name,'passed':bool(condition),**({'detail':detail} if detail else {})})
    print(('PASS ' if condition else 'FAIL ')+name+((': '+str(detail)) if not condition and detail else ''))
def blocks(css, media=()):
    css=re.sub(r'/\*.*?\*/','',css,flags=re.S);out=[];pos=0
    while pos<len(css):
        start=css.find('{',pos)
        if start<0:break
        head=css[pos:start].strip();depth=1;end=start+1
        while end<len(css) and depth:
            depth+=(css[end]=='{')-(css[end]=='}');end+=1
        body=css[start+1:end-1];pos=end
        if head.startswith('@media'):out+=blocks(body,media+(head[6:].strip(),))
        elif head.startswith('@'):continue
        else:
            declarations={}
            for declaration in body.split(';'):
                if ':' in declaration:
                    key,value=declaration.split(':',1);declarations[key.strip()]=value.strip()
            for selector in head.split(','):out.append((selector.strip(),declarations,media))
    return out

def media_matches(media,width,height,coarse):
    for expression in media:
        okay=False
        for branch in expression.split(','):
            passed=True
            for clause in re.findall(r'\(([^)]+)\)',branch):
                name,value=[x.strip() for x in clause.split(':',1)]
                if name in ('max-width','min-width','max-height','min-height'):
                    actual=width if 'width' in name else height;limit=float(value.removesuffix('px'))
                    passed &= actual<=limit if name.startswith('max') else actual>=limit
                elif name=='pointer':passed &= (value=='coarse')==coarse
                elif name=='prefers-reduced-motion':passed=False
                else:passed=False
            okay |= passed
        if not okay:return False
    return True

def simple_matches(node,selector):
    if node is None:return False
    if ':root' in selector:
        if node.getparent() is not None:return False
        selector=selector.replace(':root','')
    for negative in re.findall(r':not\(([^)]+)\)',selector):
        if simple_matches(node,negative):return False
    selector=re.sub(r':not\([^)]+\)','',selector)
    if re.search(r':(?:hover|focus-visible|focus|before|after|active)',selector):return False
    siblings=[x for x in node.getparent()] if node.getparent() is not None else [node]
    if ':first-child' in selector and siblings[0] is not node:return False
    if ':last-child' in selector and siblings[-1] is not node:return False
    nth=re.search(r':nth-child\((\d+)\)',selector)
    if nth and siblings.index(node)+1!=int(nth.group(1)):return False
    selector=re.sub(r':(?:first-child|last-child|nth-child\(\d+\))','',selector)
    for name,_,value in re.findall(r'\[([\w-]+)(?:([=])([^\]]+))?\]',selector):
        if name not in node.attrib:return False
        if value and node.get(name)!=value.strip('"\''):return False
    selector=re.sub(r'\[[^\]]+\]','',selector)
    for ident in re.findall(r'#([\w-]+)',selector):
        if node.get('id')!=ident:return False
    for cls in re.findall(r'\.([\w-]+)',selector):
        if cls not in node.get('class','').split():return False
    tag=re.match(r'^([a-zA-Z][\w-]*)',selector)
    return not tag or node.tag==tag.group(1)

def matches(node,selector):
    tokens=re.sub(r'([>+~])',r' \1 ',selector).split()
    def walk(current,i):
        if not simple_matches(current,tokens[i]):return False
        if i==0:return True
        relation=tokens[i-1]
        if relation=='>':return walk(current.getparent(),i-2)
        if relation=='+':return walk(current.getprevious(),i-2)
        if relation=='~':
            sibling=current.getprevious()
            while sibling is not None:
                if walk(sibling,i-2):return True
                sibling=sibling.getprevious()
            return False
        ancestor=current.getparent()
        while ancestor is not None:
            if walk(ancestor,i-1):return True
            ancestor=ancestor.getparent()
        return False
    return walk(node,len(tokens)-1)

def specificity(selector):
    selector=selector.replace(':not(','(')
    return (len(re.findall(r'#[\w-]+',selector)),len(re.findall(r'\.[\w-]+|\[[^\]]+\]|:[\w-]+',selector)),len(re.findall(r'(?:^|[ >+~])([a-zA-Z][\w-]*)',selector)))

rules=blocks(CSS)
def computed(node,width,height,coarse):
    result={};rank={}
    for order,(selector,declarations,media) in enumerate(rules):
        if not media_matches(media,width,height,coarse) or not matches(node,selector):continue
        for key,value in declarations.items():
            r=('!important' in value,specificity(selector),order)
            if key not in rank or r>=rank[key]:rank[key]=r;result[key]=value.replace('!important','').strip()
    return result

def by_id(ident): return root.get_element_by_id(ident)
def font_size(node, viewport):
    if node is None:return 16
    style=computed(node,*viewport)
    value=style.get('font-size')
    if not value and 'font' in style:
        m=re.search(r'(\d+(?:\.\d+)?)px(?:[/\s]|$)',style['font'])
        if m:value=m[1]+'px'
    if not value or value=='inherit':return font_size(node.getparent(),viewport)
    if value.endswith('px'):return float(value[:-2])
    if value.endswith('rem'):return float(value[:-3])*16
    if value.endswith('em'):return float(value[:-2])*font_size(node.getparent(),viewport)
    if value.endswith('%'):return float(value[:-1])/100*font_size(node.getparent(),viewport)
    raise AssertionError('Unhandled font-size: '+value)
def shown(node, viewport):
    return all('hidden' not in n.attrib and computed(n,*viewport).get('display')!='none' for n in [node,*node.iterancestors()])
def node_name(node):return node.get('id') or node.get('class') or node.tag
def contrast_ratio(a,b):
    def channels(color):
        assert re.fullmatch(r'#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?',color),'Expected explicit feedback color: '+color
        return [int(color[i:i+2],16)/255 for i in (1,3,5)]
    def luminance(rgb):
        linear=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb]
        return sum(c*w for c,w in zip(linear,(.2126,.7152,.0722)))
    alpha=int(b[7:9],16)/255 if len(b)==9 else 1
    ratios=[]
    # A translucent drawer can sit above any scene pixel: test the two extremes.
    for underlying in [0,1]:
        bg=[c*alpha+underlying*(1-alpha) for c in channels(b)]
        bright,dark=sorted((luminance(channels(a)),luminance(bg)),reverse=True)
        ratios.append((bright+.05)/(dark+.05))
    return min(ratios)


def variables(node,viewport):
    inherited={}
    for ancestor in [*reversed(list(node.iterancestors())),node]:
        inherited.update({k:v for k,v in computed(ancestor,*viewport).items() if k.startswith('--')})
    return inherited

def length(value,node,viewport,axis='height',safe_area=None):
    """Evaluate only declared CSS arithmetic; this is not a layout engine."""
    width,height,_=viewport;safe_area=safe_area or {};custom=variables(node,viewport)
    def expand(source):
        for _ in range(20):
            previous=source
            source=re.sub(r'var\((--[\w-]+)\)',lambda m:'('+custom[m[1]]+')',source)
            source=re.sub(r'env\((safe-area-inset-[\w-]+)(?:,\s*([^()]+))?\)',lambda m:str(safe_area.get(m[1],0)),source)
            if source==previous:return source
        raise AssertionError('Recursive CSS custom property: '+value)
    expression=expand(value).replace('calc(','(')
    factors={'px':1,'vw':width/100,'vh':height/100,'dvh':height/100,'svh':height/100,'rem':16,'%':(width if axis=='width' else height)/100}
    expression=re.sub(r'(\d+(?:\.\d+)?|\.\d+)(dvh|svh|vw|vh|rem|px|%)',lambda m:str(float(m[1])*factors[m[2]]),expression)
    operations={ast.Add:operator.add,ast.Sub:operator.sub,ast.Mult:operator.mul,ast.Div:operator.truediv}
    def evaluate(node):
        if isinstance(node,ast.Expression):return evaluate(node.body)
        if isinstance(node,ast.Constant) and isinstance(node.value,(int,float)):return node.value
        if isinstance(node,ast.BinOp) and type(node.op) in operations:return operations[type(node.op)](evaluate(node.left),evaluate(node.right))
        if isinstance(node,ast.UnaryOp) and isinstance(node.op,(ast.UAdd,ast.USub)):return evaluate(node.operand)*(1 if isinstance(node.op,ast.UAdd) else -1)
        if isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id in ['min','max','clamp']:
            args=[evaluate(arg) for arg in node.args]
            if node.func.id=='min':return min(args)
            if node.func.id=='max':return max(args)
            return max(args[0],min(args[1],args[2]))
        raise AssertionError('Unsupported CSS arithmetic: '+value)
    return evaluate(ast.parse(expression,mode='eval'))


def main():
    ids=root.xpath('//*[@id]/@id')
    check('No duplicate DOM IDs',len(ids)==len(set(ids)))
    body=root.xpath('//body')[0];shell=root.xpath('//div[@class="shell"]')[0]
    stage=by_id('stage');canvas=by_id('sceneCanvas');dock=by_id('controlDock');guidance=by_id('guidance')
    workspace=root.xpath('//div[@class="workspace"]')[0];aside=root.xpath('//aside')[0]
    main_node=root.xpath('//main')[0];header=root.xpath('//header')[0];footer=root.xpath('//footer')[0]
    strip=root.xpath('//section[@class="flight-strip"]')[0];panel=stage.getparent();hud=by_id('missionHud')
    start_card=root.xpath('//div[@class="start-card"]')[0];rules_node=root.xpath('//div[@class="rules"]')[0]
    description=by_id('decisionDescription');decision=by_id('decisionCard')
    reading_ids=['decisionCard','resultCard']
    away=by_id('awayOverlay')
    check('Focus pause is a modal outside the inert game surface',away.get('role')=='dialog' and away.get('aria-modal')=='true' and by_id('gameSurface') not in away.iterancestors())
    check('Focus pause covers the whole viewport above every HUD',computed(away,1512,801,False).get('position')=='fixed' and computed(away,1512,801,False).get('inset')=='0' and int(computed(away,1512,801,False).get('z-index','0'))>20)
    check('Collection layers above result and hidden overlays stay hidden',int(computed(by_id('codexOverlay'),1512,801,False)['z-index'])>int(computed(by_id('resultOverlay'),1512,801,False)['z-index']) and any(selector=='[hidden]' and declarations.get('display')=='none!important' for selector,declarations,media in rules))
    body.set('data-panel','idle')
    check('Phone checklist follows actual mission bottom',computed(aside,390,844,True).get('top')=='calc(var(--mission-bottom) + 10px)')
    body.set('data-aisle-alert','true')
    check('Phone alert cannot restore an obsolete fixed checklist offset',computed(aside,390,844,True).get('top')=='calc(var(--mission-bottom) + 10px)')
    body.attrib.pop('data-aisle-alert',None)
    check('Sound controls share one accessible group',by_id('muteButton').getparent() is by_id('volumeSlider').getparent() and by_id('volumeControl').get('role')=='group')
    check('Canvas has keyboard focus and explicit screen-relative instructions',canvas.get('tabindex')=='0' and '螢幕' in canvas.get('aria-label',''))
    check('Mission information shares one top surface outside the scene',list(hud)==[strip,by_id('aisleAlert'),by_id('timeWarning'),by_id('boardingCoach'),guidance] and hud.getparent() is main_node and list(panel)==[stage,dock])
    check('Result owns a modal outside the inert cabin; decisions retain their drawer',decision.getparent() is aside and by_id('resultCard').getparent() is by_id('resultOverlay') and by_id('gameSurface') not in by_id('resultOverlay').iterancestors() and by_id('resultCard').get('aria-modal')=='true')
    check('Next chapter CTA precedes rewards and expandable details',list(by_id('resultCard')).index(by_id('nextChapterButton').getparent())<list(by_id('resultCard')).index(by_id('cardRewards'))<list(by_id('resultCard')).index(by_id('resultMore')))
    check('Reading surfaces never reparent or replace the canvas',all(stage not in by_id(i).iterancestors() for i in reading_ids))
    check('Start overlay remains over the cabin before play',by_id('briefCard').getparent() is stage and 'hidden' not in by_id('briefCard').attrib)
    check('Formal and practice remain explicit start choices',all(by_id(i).tag=='button' and 'disabled' in by_id(i).attrib for i in ['startButton','practiceButton']))
    check('Fallback has alert semantics, WebGL guidance and a retry control',by_id('webglError').get('role')=='alert' and 'WebGL 2' in by_id('webglError').text_content() and by_id('webglError').xpath('./button[@id="reloadButton"]'))
    check('Aisle warning separates the one-time announcement from changing directions',by_id('aisleAlertTitle').get('role')=='alert' and by_id('aisleAlertDirection').get('aria-live') is None and by_id('aisleAlert').get('hidden') is not None)
    check('Game feedback remains a polite live region',by_id('feedback').get('role')=='status' and by_id('feedback').get('aria-live')=='polite')
    check('Practice recovery feedback precedes the unchanged choice area',description.getparent() is decision and list(decision).index(description)<list(decision).index(by_id('choices')))
    check('Blocking lessons live outside the inert game surface',by_id('lessonCard').getparent() is by_id('lessonOverlay') and by_id('gameSurface') not in by_id('lessonOverlay').iterancestors() and by_id('lessonCard').get('aria-modal')=='true')
    check('Dialog removes repeated location, handoff paragraph and reading footer',not root.xpath('//*[@id="decisionTag" or @id="handoffHint"]') and not by_id('decisionCard').xpath('.//small[@class="reading"]'))
    rules_copy=by_id('pauseCard').text_content()
    check('Rules distinguish two-second formal correction from immediate practice retry','修正回饋 2 秒' in rules_copy and '練習可直接重選' in rules_copy and '7 秒' not in rules_copy)
    check('Approved learning disclaimer remains in briefing and rules',all('簡化的學習內容，實際程序以各航空公司訓練為準' in n.text_content() for n in [start_card,rules_node]))
    check('Viewport enables safe-area-aware edge HUD',root.xpath('//meta[@name="viewport"]')[0].get('content','').find('viewport-fit=cover')>=0 and all('safe-area-inset-'+side in CSS for side in ['top','right','bottom','left']))
    check('Full-height shell declares both vh fallback and dynamic dvh height',bool(re.search(r'\.shell\s*\{[^}]*height:\s*100vh;[^}]*height:\s*100dvh;',CSS)))
    check('CSS hidden state cannot be undone by card display rules',any(selector=='[hidden]' and declarations.get('display')=='none!important' for selector,declarations,media in rules))
    for compact_width in [701,850,1194,1512]:
        body.set('data-panel','idle')
        compact=computed(dock,compact_width,959,False)
        check(f'{compact_width}px fine pointer uses compact action without movement legend',compact.get('width')=='min(240px, var(--play-hud-width))' and computed(root.xpath('//div[@class="key-help"]')[0],compact_width,959,False).get('display')=='none' and computed(root.xpath('//div[@class="touch-pad"]')[0],compact_width,959,False).get('display')=='none')
    check('Tablet touch keeps full direction controls',computed(root.xpath('//div[@class="touch-pad"]')[0],1194,959,True).get('display')=='grid' and computed(dock,1194,959,True).get('width')=='var(--play-hud-width)')
    # Generated-label fixtures model only DOM structure, not gameplay or layout.
    by_id('choices').append(html.fragment_fromstring('<button class="choice"><b>1</b><span class="choice-copy"><span>請同事送水</span><span class="choice-tags"><span>同事需12秒</span></span></span></button>'))
    by_id('taskList').append(html.fragment_fromstring('<div class="task-row safety"><b>安全檢查</b><small>1B 座位</small><span>待辦</span></div>'))
    by_id('targetLabels').append(html.fragment_fromstring('<div class="target-label safety">1B 行李</div>'))
    description.set('data-kind','warning')
    for ident in ['decisionTitle','decisionQuote','decisionDescription','lessonTitle','lessonCopy','actionLabel','resultTitle','resultCopy','resultDetails']:by_id(ident).text='測試顯示文字'
    viewports=[(1512,801,False),(390,844,True),(320,568,True),(780,360,True),(756,400,False),(1024,600,False),(390,320,True)]
    # Responsive decision choices: three columns only when the viewport is wide.
    for test_width in [390,700,899,900,1512]:
        body.set('data-panel','decision')
        choice_style=computed(by_id('choices'),test_width,844,False)
        check(f'{test_width}px decision choices use responsive columns',choice_style.get('grid-template-columns')==('repeat(3, minmax(0, 1fr))' if test_width>=900 else 'minmax(0, 1fr)'),choice_style.get('grid-template-columns'))
    body.set('data-panel','decision');body.set('data-decision-kind','safety')
    for test_width,test_height in [(932,430),(1024,521),(1024,600),(1512,801)]:
        drawer=computed(aside,test_width,test_height,True)
        check(f'{test_width}x{test_height} safety wide panel keeps its intended width',drawer.get('width')=='min(960px, calc(100% - var(--safe-left) - var(--safe-right)))')
        check(f'{test_width}x{test_height} wide choices keep consistent room below the HUD',drawer.get('max-height')=='calc(100dvh - var(--safe-top) - var(--safe-bottom) - 104px)')
    body.attrib.pop('data-decision-kind',None)
    geometry=[]
    for vp in viewports:
        width,height,coarse=vp;prefix=f'{width}x{height}'+(' coarse' if coarse else ' fine')
        body.set('data-panel','idle')
        css=lambda node:computed(node,*vp)
        size=lambda value,node,axis='height',safe=None:length(value,node,vp,axis,safe)
        sh=css(shell);st=css(stage);cv=css(canvas);dc=css(dock);gd=css(guidance);as_=css(aside);hd=css(header);fl=css(strip);mh=css(hud)
        check(prefix+' page cannot acquire a document scrollbar',all(css(n).get('overflow')=='hidden' and css(n).get('height')=='100%' for n in [root,body]) and sh.get('overflow')=='hidden')
        check(prefix+' shell fills the dynamic viewport without a minimum-size floor',sh.get('position')=='fixed' and sh.get('inset')=='0' and size(sh['height'],shell)==height and size(sh['width'],shell,'width')==width and sh.get('min-width')=='0' and sh.get('min-height')=='0')
        check(prefix+' every scene wrapper fills the viewport, independent of HUD',all(css(n).get('position')=='absolute' and css(n).get('inset')=='0' and css(n).get('width')=='100%' and css(n).get('height')=='100%' and css(n).get('min-height')=='0' for n in [main_node,workspace,panel,stage]))
        check(prefix+' canvas fills the unchanged full-size scene',cv.get('display')=='block' and cv.get('width')=='100%' and cv.get('height')=='100%' and cv.get('position','static')=='static')
        check(prefix+' focused canvas ring stays inside its clipping edge',cv.get('outline-offset')=='-4px' and st.get('overflow')=='hidden')
        check(prefix+' transparent wrapper space passes input to the cabin',all(css(n).get('pointer-events')=='none' for n in [main_node,workspace,panel]) and st.get('pointer-events')=='auto')
        check(prefix+' header and mission surface overlay the full cabin',hd.get('position')=='absolute' and mh.get('position')=='absolute' and int(hd.get('z-index','0'))>int(mh.get('z-index','0'))>0)
        check(prefix+' guidance flows below status in the top mission surface',dc.get('position')=='absolute' and gd.get('position')=='static' and gd.get('bottom')=='auto' and fl.get('position')=='static' and mh.get('display')=='flex')
        check(prefix+' footer consumes no viewport or page space',css(footer).get('display')=='none')
        for safe_name,safe in [('plain',{}),('notched',{'safe-area-inset-top':47,'safe-area-inset-right':18,'safe-area-inset-bottom':34,'safe-area-inset-left':18})]:
            val=lambda value,node,axis='height':size(value,node,axis,safe)
            left=val(dc['left'],dock,'width');bottom=val(dc['bottom'],dock);dock_height=val(dc['height'],dock);hud_width=val(dc['width'],dock,'width')
            guide_height=val(mh['max-height'],hud)
            header_top=val(hd['top'],header);header_bottom=header_top+val(hd['height'],header)
            strip_top=val(mh['top'],hud);strip_bottom=strip_top+val(fl['min-height'],strip)
            alert=by_id('aisleAlert');alert_css=css(alert)
            check(prefix+' '+safe_name+' warnings share top flow without overlapping status',alert_css.get('position')=='static' and css(by_id('timeWarning')).get('position')=='static' and alert_css.get('width')=='100%' and alert_css.get('pointer-events')=='none')
            gap=val('var(--gap)',dock)
            check(prefix+' '+safe_name+' HUD honors safe-area margins and stays in viewport',left>=safe.get('safe-area-inset-left',0) and bottom>=safe.get('safe-area-inset-bottom',0) and 0<hud_width<=width-left-safe.get('safe-area-inset-right',0) and header_top>=safe.get('safe-area-inset-top',0) and header_bottom<=height-bottom)
            check(prefix+' '+safe_name+' mission starts below header with bounded room above controls',strip_top>=header_bottom and 0<guide_height<=height-strip_top-bottom-dock_height+1,{'headerBottom':header_bottom,'missionTop':strip_top,'missionMaxHeight':guide_height})
            if width<=700 and height>520:
                mission_top=val(mh['top'],hud)
                checklist_bottom=val(as_['bottom'],aside)
                check(prefix+' '+safe_name+' tall mission reserves readable checklist room',height-(mission_top+guide_height+10)-checklist_bottom>=56)
            if width>700:
                aside_left=width-val(as_['right'],aside,'width')-val(as_['width'],aside,'width')
                available=height-val(as_['top'],aside)-val(as_['bottom'],aside)
                check(prefix+' '+safe_name+' side drawer stays to the right of controls and feedback',left+hud_width+gap<=aside_left+.001 and available>0 and val(as_['top'],aside)>=header_bottom,{'asideLeft':aside_left,'hudRight':left+hud_width,'drawerHeight':available})
            geometry.append({'viewport':list(vp),'safeArea':safe_name,'canvas':[0,0,width,height],'hudWidth':hud_width,'dockHeight':dock_height,'guidanceMaxHeight':guide_height})
        check(prefix+' mission and drawer own local scrolling',all(css(n).get('overflow')=='auto' and css(n).get('overscroll-behavior')=='contain' for n in [hud,aside]))
        check(prefix+' start prompt is centered with local scroll when short',css(by_id('briefCard')).get('inset')=='0' and css(by_id('briefCard')).get('align-items')=='center' and css(by_id('briefCard')).get('justify-content')=='center' and css(by_id('briefCard')).get('overflow')=='auto' and css(start_card).get('overflow')=='auto' and css(start_card).get('max-height')=='100%')
        check(prefix+' rules are independently bounded and scrollable',css(rules_node).get('overflow')=='auto' and 0<size(css(rules_node)['max-height'],rules_node)<=height*.5)
        touch=root.xpath('//div[@class="touch-pad"]')[0]
        if coarse or width<=700:
            check(prefix+' visible touch controls retain accessible pointer targets',css(touch).get('display')=='grid' and by_id('joystick').get('aria-label') and css(by_id('joystick')).get('touch-action')=='none' and size(css(by_id('joystick'))['width'],by_id('joystick'))>=88 and not touch.xpath('.//button'))
        check(prefix+' manual pause shares the centered modal outside the game',by_id('pauseCard').getparent() is away and by_id('focusPauseCard').getparent() is away and css(by_id('pauseCard')).get('width')=='min(100%,360px)' and css(away).get('align-items')=='center' and css(away).get('backdrop-filter')=='blur(8px)')
        body.set('data-panel','lesson')
        check(prefix+' lesson is centered above the game',css(by_id('lessonOverlay')).get('position')=='fixed' and css(by_id('lessonOverlay')).get('inset')=='0' and css(by_id('lessonOverlay')).get('place-items')=='center')
        check(prefix+' lesson card owns bounded scrolling',css(by_id('lessonCard')).get('max-height')=='100%' and css(by_id('lessonCard')).get('overflow')=='auto')
        check(prefix+' lesson hides background controls and checklist',css(dock).get('display')=='none' and css(aside).get('display')=='none')
        key_style=css(by_id('interactKey'))
        check(prefix+' Space keycap cannot shrink or wrap',key_style.get('flex')=='0 0 auto' and key_style.get('white-space')=='nowrap')
        for mode,ident in [('decision','decisionCard')]:
            body.set('data-panel',mode);as_=css(aside);card=by_id(ident)
            check(prefix+' '+mode+' retains viewport canvas and normal drawer content',css(stage).get('inset')=='0' and css(canvas).get('height')=='100%' and css(card).get('position','static') in ['static','relative'] and css(card).get('pointer-events')=='auto' and css(card).get('flex-shrink')=='0')
            check(prefix+' '+mode+' drawer scrolls without a duplicate checklist',as_.get('overflow')=='auto' and as_.get('pointer-events')=='auto' and css(by_id('taskDetails')).get('display')=='none')
            if width<=700:
                check(prefix+' '+mode+' phone reading replaces movement controls with a bottom drawer',as_.get('top')=='auto' and as_.get('width')=='auto' and as_.get('pointer-events')=='auto' and css(dock).get('display')=='none' and css(guidance).get('display')=='none')
                for safe_name,safe in [('plain',{}),('notched',{'safe-area-inset-top':47,'safe-area-inset-right':18,'safe-area-inset-bottom':34,'safe-area-inset-left':18})]:
                    max_height=size(as_['max-height'],aside,safe=safe);bottom=size(as_['bottom'],aside,safe=safe);top=height-bottom-max_height;safe_top=size('var(--safe-top)',aside,safe=safe)
                    check(prefix+' '+mode+' '+safe_name+' drawer remains bounded below visible cabin',0<max_height<=height*.58 and top>=safe_top+120-.001 and bottom>=safe.get('safe-area-inset-bottom',0),{'maxHeight':max_height,'top':top,'bottom':bottom})
            elif width>=900 and mode=='decision':
                check(prefix+' wide decision uses a centered bottom surface',as_.get('top')=='auto' and as_.get('left')=='50%' and as_.get('transform')=='translateX(-50%)' and css(dock).get('display')=='none' and css(guidance).get('display')=='none')
            else:
                check(prefix+' '+mode+' desktop keeps its right-side decision drawer',as_.get('position')=='absolute' and as_.get('top')!='auto' and size(as_['width'],aside,'width')<width*.5 and css(dock).get('display')!='none')
        body.set('data-panel','result')
        result_css=css(by_id('resultOverlay'));card_css=css(by_id('resultCard'))
        check(prefix+' result is centered across the full viewport',result_css.get('position')=='fixed' and result_css.get('inset')=='0' and result_css.get('place-items')=='center' and int(result_css['z-index'])>20)
        check(prefix+' result scrolls locally on short screens',card_css.get('max-height')=='100%' and card_css.get('overflow')=='auto' and card_css.get('overscroll-behavior')=='contain' and card_css.get('width')=='min(100%,560px)')
        check(prefix+' result removes duplicate gameplay HUD',all(css(n).get('display')=='none' for n in [hud,aside,dock,guidance,strip]) and css(stage).get('height')=='100%')
        body.set('data-panel','decision')
        warning=css(description);decision_style=css(decision)
        check(prefix+' practice recovery explanation remains readable normal-flow text',warning.get('position','static')=='static' and warning.get('display')!='none' and font_size(description,vp)>=12 and warning.get('overflow','visible') not in ['hidden','clip'] and int(warning.get('font-weight','400'))>=600)
        ratio=contrast_ratio(warning['color'],decision_style['background'])
        check(prefix+' practice warning text retains 4.5:1 contrast over any scene pixel',ratio>=4.5,round(ratio,2))
        primary_labels=root.xpath('//*[@class="target-label safety"] | //*[@class="choice-copy"]/span[1]')
        check(prefix+' target labels and primary choices remain at least 12px',all(font_size(n,vp)>=12 for n in primary_labels),{node_name(n):font_size(n,vp) for n in primary_labels})
        for mode in ['brief','error']:
            body.set('data-panel',mode)
            check(prefix+' '+mode+' hides gameplay HUD without reducing scene size',all(css(n).get('display')=='none' for n in [aside,dock,guidance,strip]) and css(stage).get('height')=='100%' and css(header).get('display')!='none')
    check('Target labels retain directional arrows',any(selector=='.target-label:after' and declarations.get('content') in ["'▼'",'"▼"'] for selector,declarations,media in rules))
    check('Target labels cannot intercept scene or controls',any(selector=='#targetLabels' and declarations.get('pointer-events')=='none' for selector,declarations,media in rules))
    check('Reduced-motion CSS disables transitions and animations',any('prefers-reduced-motion:reduce' in re.sub(r'\s+','',''.join(media)) and declarations.get('animation')=='none!important' and declarations.get('transition')=='none!important' for selector,declarations,media in rules))
    summary={'total':len(results),'passed':sum(r['passed'] for r in results),'failed':sum(not r['passed'] for r in results)}
    out={'generatedAt':datetime.now(timezone.utc).isoformat(),'suite':'3D viewport-fill static DOM/CSS cascade and declared geometry','command':'python3 tests/preflight-3d-layout.test.py','htmlSha256':hashlib.sha256(HTML.encode()).hexdigest(),'cssSha256':hashlib.sha256(CSS.encode()).hexdigest(),'viewports':viewports,'summary':summary,'notes':['No browser was launched. These checks evaluate document structure, CSS cascade and declared viewport arithmetic, not rendered geometry or screenshots.','Canvas dimensions follow the declared 100% wrapper chain; intrinsic text fit, browser zoom, runtime safe-area values and native WebGL remain separate browser checks.','756x400 models a desktop 200%-zoom CSS budget; it is not an actual browser zoom test.','Notched geometry uses modeled top/right/bottom/left insets of 47/18/34/18 CSS pixels.'],'geometry':geometry,'results':results}
    (ROOT/'artifacts').mkdir(parents=True,exist_ok=True)
    (ROOT/'artifacts/preflight-3d-layout-results.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
    print(f"\n{summary['passed']}/{summary['total']} static viewport/layout checks passed.")
    return bool(summary['failed'])
if __name__=='__main__':sys.exit(main())
