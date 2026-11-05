(function(){
  'use strict';
  const L=CatalogLogic,S=CatalogStorage,D=window.CatalogDemo||{products:[],response:null};
  let store;try{store=window.localStorage;}catch(e){store={getItem(){throw e;},setItem(){throw e;}};}
  const loaded=S.load(store);
  let state=loaded.state,mode=loaded.mode,corruptRaw=loaded.raw,notice=loaded.message?{text:loaded.message,error:mode==='corrupt'}:null;
  let query='',status='all',selected=new Set(),busy=false,editing=null,activeRoute=location.hash||'#/catalog';
  const main=document.getElementById('main'),dialog=document.getElementById('modal'),modalContent=document.getElementById('modal-content');
  const $=id=>document.getElementById(id);
  function el(tag,attrs={},children=[]) {
    const node=document.createElement(tag);
    for(const [key,value]of Object.entries(attrs)) {
      if(value===undefined||value===null||value===false)continue;
      if(key.startsWith('on'))node.addEventListener(key.slice(2).toLowerCase(),value);
      else if(key==='class')node.className=value;
      else if(key==='text')node.textContent=value;
      else if(key==='checked'||key==='disabled'||key==='readOnly')node[key]=value;
      else node.setAttribute(key,String(value));
    }
    for(const child of [].concat(children))if(child!==null&&child!==undefined)node.append(typeof child==='string'?document.createTextNode(child):child);
    return node;
  }
  const p=(text,cls='')=>el('p',{class:cls,text});
  const btn=(text,fn,cls='',id)=>el('button',{type:'button',class:'btn '+cls,id,disabled:busy,onClick:fn,text});
  function feedback(text,error=false){notice={text,error};renderNotice();}
  function renderNotice(){const n=$('notice');n.hidden=!notice;n.className=notice?.error?'error':'';n.textContent=notice?.text||'';}
  function closeDialog(){dialog.close();modalContent.replaceChildren();}
  function showDialog(title,body,actions){
    for(const action of actions)if(action.tagName==='BUTTON')action.disabled=false;
    if(dialog.open)closeDialog();modalContent.replaceChildren(el('h2',{id:'modal-title',text:title}),...body,el('div',{class:'dialog-actions'},actions));dialog.showModal();
    const first=modalContent.querySelector('button,textarea,a');if(first)first.focus();
  }
  function confirmAction(title,text,fn,{backup=false,yes='Продолжить'}={}){
    const actions=[];if(backup&&state.products.length)actions.push(btn('Скачать резерв',()=>downloadBackup(),'subtle'));
    actions.push(btn('Отмена',closeDialog),btn(yes,()=>{closeDialog();fn();},'primary'));
    showDialog(title,[p(text)],actions);
  }
  function withDiscard(fn){
    if(editing?.dirty)confirmAction('Остались несохранённые правки','Сохранённая версия карточки останется прежней. Отменить текущие правки?',()=>{editing=null;fn();},{yes:'Отменить правки'});
    else fn();
  }
  function navigate(route){withDiscard(()=>{editing=null;if(location.hash===route){activeRoute=route;render();}else location.hash=route;});}
  document.addEventListener('click',event=>{
    const a=event.target.closest('a[href^="#/"]');if(a){event.preventDefault();navigate(a.getAttribute('href'));}
  });
  window.addEventListener('hashchange',()=>{
    const target=location.hash||'#/catalog';
    if(editing?.dirty){history.replaceState(null,'',activeRoute);withDiscard(()=>{location.hash=target;});return;}
    editing=null;activeRoute=target;render();
  });
  function commit(next,message,{resolveCorrupt=false}={}){
    if(mode==='corrupt'&&!resolveCorrupt)throw new L.CatalogError('Сначала выберите, как восстановить повреждённое сохранение.');
    state=next;corruptRaw=null;
    const saved=S.save(store,state);mode=saved.ok?'persistent':'memory';
    notice={text:message+(saved.ok?'':(' '+saved.message)),error:!saved.ok};render();
  }
  function download(name,text,mime='text/plain'){
    const url=URL.createObjectURL(new Blob([text],{type:mime+';charset=utf-8'}));const a=el('a',{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function downloadBackup(){try{download('catalogdraft-backup.json',L.createBackup(state),'application/json');feedback('Резерв всех товаров, текстов и одобрений скачан.');}catch(e){feedback(e.message,true);}}
  function renderStorage(){
    $('storage-badge').textContent=mode==='persistent'?'● Сохраняется в браузере':mode==='memory'?'● Работа в памяти':'● Нужна проверка сохранения';
    const area=$('storage-alert');area.replaceChildren();
    if(mode==='corrupt')area.append(el('div',{class:'storage-warning'},[p('Сохранённые данные повреждены. Они не заменены демоданными. Скачайте исходное сохранение, затем восстановите резерв или явно загрузите новый каталог.'),el('div',{class:'actions'},[btn('Скачать исходное сохранение',()=>download('catalogdraft-damaged-storage.txt',corruptRaw||'')),btn('Восстановить резерв',()=>requestFile('backup'))])]));
    if(mode==='memory')area.append(el('div',{class:'storage-warning'},[p('Браузер не разрешает сохранение. Текущая работа доступна до закрытия страницы; скачайте резерв для переноса.'),btn('Скачать резерв',downloadBackup)]));
  }
  function renderNav(){
    const c=L.counts(state);$('navigation').replaceChildren(...[['01','Каталог','#/catalog',c.total],['02','Проверка',state.products.length?'#/product/'+encodeURIComponent(state.products[0].sku):'#/catalog',null],['03','Передача','#/export',c.approved]].map(([num,text,href,count])=>el('a',{href,class:'nav-item '+(activeRoute.startsWith('#/product')?num==='02'?'active':'':activeRoute==='#/export'?num==='03'?'active':'':num==='01'?'active':''),'aria-current':(activeRoute.startsWith('#/product')&&num==='02'||activeRoute==='#/export'&&num==='03'||!activeRoute.startsWith('#/product')&&activeRoute!=='#/export'&&num==='01')?'page':null},[el('span',{class:'nav-number',text:num}),el('span',{text}),count!==null?el('span',{class:'nav-count',text:String(count)}):null])));
  }
  function heading(title,intro,actions=[]){return el('div',{class:'page-heading'},[el('div',{},[p('РАБОЧАЯ МАСТЕРСКАЯ','eyebrow'),el('h1',{text:title}),p(intro,'intro')]),el('div',{class:'actions'},actions)]);}
  function metrics(){const c=L.counts(state);return el('section',{class:'metrics','aria-label':'Состояния каталога'},Object.keys(L.STATUS).map(key=>el('div',{class:'metric '+key},[el('span',{},[el('i',{class:'dot '+key,'aria-hidden':'true'}),L.STATUS[key]]),el('strong',{'data-count':key,text:String(c[key])})])));}
  function statusTag(product){const status=L.statusOf(product);return el('span',{class:'status '+status},[el('i',{class:'dot '+status,'aria-hidden':'true'}),L.STATUS[status]]);}
  function showDemo(){withDiscard(()=>{
    const apply=()=>{editing=null;query='';status='all';selected.clear();activeRoute='#/catalog';history.replaceState(null,'',activeRoute);commit(L.createCatalog(D.products,'demo-catalog-v1'),'Загружено 10 вымышленных товаров. Выберите до трёх для запроса.',{resolveCorrupt:true});};
    if(state.products.length||mode==='corrupt')confirmAction('Открыть учебный каталог?','Текущий каталог будет заменён. Сохраните резерв, если хотите вернуться к своей работе.',apply,{backup:true,yes:'Открыть демо'});else apply();
  });}
  function requestFile(type){withDiscard(()=>{editing=null;$('file-'+type).click();});}
  function promptDialog(){
    try{
      const text=L.buildPrompt(state,[...selected]);
      const area=el('textarea',{id:'prompt-text',readOnly:true,'aria-label':'Полный запрос к Qwen'},[text]);
      showDialog('Перенесите запрос в Qwen',[p('Приложение не отправляет исходники в нейросеть. Скопируйте или скачайте запрос, затем сохраните JSON-ответ и загрузите его в CatalogDraft.'),area,el('div',{class:'info-strip'},['Ответ должен содержать только JSON указанного формата. Корректная структура не заменяет ручную сверку фактов.'])],[el('a',{href:'https://chat.qwen.ai/',target:'_blank',rel:'noopener noreferrer',class:'btn subtle',text:'Открыть Qwen ↗'}),btn('Скачать запрос',()=>download('catalogdraft-prompt.txt',text)),btn('Скопировать',async()=>{try{await navigator.clipboard.writeText(text);feedback('Запрос скопирован.');}catch(e){area.focus();area.select();feedback('Выделен полный запрос. Скопируйте его сочетанием Ctrl+C.');}},'primary'),btn('Закрыть',closeDialog)]);
    }catch(e){feedback(e.message,true);}
  }
  function useDemoResponse(){withDiscard(()=>{
    try{if(!D.response)throw new L.CatalogError('Сохранённый пример пока недоступен.');applyResponse(JSON.stringify(D.response),true);}
    catch(e){feedback(e.message,true);}
  });}
  function applyResponse(text,isDemo=false,confirmed=false){
    try{
      const result=L.importResponse(state,text,confirmed);editing=null;
      commit(result.state,`${isDemo?'Загружен сохранённый учебный ответ Qwen. ':''}Черновиков обновлено: ${result.updated}. Без изменений: ${result.skipped}. Проверьте факты перед одобрением.`);
    }catch(e){
      if(e.code==='CONFIRM_REPLACE')confirmAction('Изменятся одобренные карточки',`Новые тексты заменят одобренные карточки: ${e.details.join(', ')}. После замены потребуется новая сверка.`,()=>applyResponse(text,isDemo,true),{yes:'Заменить черновиками'});
      else feedback(e.message,true);
    }
  }
  async function readFile(type,event){
    const file=event.target.files[0];event.target.value='';if(!file||busy)return;
    busy=true;render();
    try{
      if(file.size>(type==='csv'?L.MAX_BYTES:262144))throw new L.CatalogError(type==='csv'?'CSV должен быть не больше 100 КБ.':'JSON должен быть не больше 256 КБ.');
      const text=await file.text();
      if(type==='csv'){
        const sources=L.parseCsv(text);
        if(L.sameCatalog(state,sources)){feedback('Каталог уже загружен, изменения сохранены.');return;}
        const apply=()=>{query='';status='all';selected.clear();editing=null;activeRoute='#/catalog';history.replaceState(null,'',activeRoute);commit(L.createCatalog(sources,'catalog-'+(globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(16).slice(2))),'CSV загружен. Товары с неполными характеристиками отмечены отдельно.',{resolveCorrupt:true});};
        if(state.products.length||mode==='corrupt')confirmAction('Заменить исходный каталог?',`Будет загружено товаров: ${sources.length}. Прежние черновики и одобрения останутся только в скачанном резерве.`,apply,{backup:true,yes:'Заменить каталог'});else apply();
      } else if(type==='response')applyResponse(text);
      else{
        const restored=L.parseBackup(text);const c=L.counts(restored);
        confirmAction('Восстановить резерв?',`В файле ${c.total} товаров и ${c.approved} одобренных карточек. Текущая работа будет заменена.`,()=>{query='';status='all';selected.clear();editing=null;commit(restored,'Резерв восстановлен: исходники, тексты и одобрения на месте.',{resolveCorrupt:true});},{backup:true,yes:'Восстановить'});
      }
    }catch(e){feedback(e.message,true);}
    finally{busy=false;render();}
  }
  for(const type of ['csv','response','backup'])$('file-'+type).addEventListener('change',event=>readFile(type,event));
  function catalogPage(){
    main.append(heading('Каталог товаров','Подготовьте исходники, получите черновики и проверьте каждую карточку перед экспортом.',[btn('Загрузить CSV',()=>requestFile('csv'),'primary','upload-csv'),btn(state.products.length?'Учебный каталог':'Попробовать демо',showDemo,'','load-demo')]));
    if(!state.products.length){
      main.append(el('section',{class:'empty-start'},[el('div',{},[el('div',{class:'empty-symbol','aria-hidden':'true',text:'↗'}),el('h2',{text:'От характеристик — к понятной карточке'}),p('Начните со своей таблицы или пройдите весь сценарий на десяти учебных товарах.','intro'),el('div',{class:'actions'},[btn('Попробовать демо',showDemo,'primary','empty-demo'),btn('Восстановить резерв',()=>requestFile('backup'))]),p('CSV · до 20 товаров · исходники остаются у вас','source-tip')]),el('ol',{class:'steps'},[['01','Загрузите факты','Материал, цвет, размеры и комплектация.'],['02','Перенесите запрос в Qwen','Верните структурированный JSON с черновиками.'],['03','Сверьте и одобрите','Скачайте только проверенные вами тексты.']].map(([n,t,d])=>el('li',{},[el('span',{class:'step-no',text:n}),el('div',{},[el('strong',{text:t}),p(d)])])))]));
      main.append(el('div',{class:'info-strip'},['Исходный CSV: sku;name;material;color;width_cm;depth_cm;height_cm;pack_qty. Размеры — в сантиметрах. Все строки учебного демо вымышлены.']));return;
    }
    main.append(metrics());
    const search=el('input',{id:'search',type:'search',placeholder:'Артикул или название','aria-label':'Поиск по артикулу или названию',value:query,onInput:e=>{query=e.target.value;refreshList();}});
    const select=el('select',{id:'status-filter','aria-label':'Состояние карточки',onChange:e=>{status=e.target.value;refreshList();}},[['all','Все состояния'],...Object.entries(L.STATUS)].map(([value,label])=>el('option',{value,text:label})));select.value=status;
    main.append(el('section',{class:'card catalog-panel','aria-label':'Каталог товаров'},[el('div',{class:'toolbar'},[el('div',{class:'search-wrap'},[el('label',{for:'search',text:'Поиск'}),search]),el('div',{class:'filter-wrap'},[el('label',{for:'status-filter',text:'Состояние'}),select]),btn('Сбросить',()=>{query='';status='all';$('search').value='';$('status-filter').value='all';refreshList();},'subtle')]),el('div',{class:'selection-bar'},[el('span',{id:'shown-count'}),el('div',{class:'actions'},[el('span',{id:'selected-count'}),btn('Собрать запрос',promptDialog,'','build-prompt')])]),el('div',{id:'catalog-list'})]));
    const demoButton=btn('Загрузить пример ответа',useDemoResponse,'','load-demo-response');demoButton.disabled=busy||state.catalog_id!=='demo-catalog-v1'||!D.response;
    main.append(el('div',{class:'bottom-help'},[p(state.catalog_id==='demo-catalog-v1'?'Учебные товары · данные и тексты для демонстрации':'Характеристики доступны только для чтения. Исправьте исходный CSV и загрузите заново.'),el('div',{class:'actions'},[btn('Загрузить ответ Qwen',()=>requestFile('response'),'','upload-response'),demoButton,btn('К передаче →',()=>navigate('#/export'),'subtle')])]));
    refreshList();
  }
  function refreshList(){
    const area=$('catalog-list');if(!area)return;
    const visible=L.filterProducts(state,query,status);$('shown-count').textContent=`Показано ${visible.length} из ${state.products.length}`;$('selected-count').textContent=`Выбрано: ${selected.size} / 3`;$('build-prompt').disabled=!selected.size||busy;
    if(!visible.length){area.replaceChildren(el('div',{class:'empty'},[el('h2',{text:'Нет товаров по этим условиям'}),p('Каталог и одобрения сохранены. Измените поиск или сбросьте фильтр.'),btn('Сбросить фильтр',()=>{query='';status='all';$('search').value='';$('status-filter').value='all';refreshList();})]));return;}
    area.replaceChildren(el('table',{},[el('thead',{},[el('tr',{},['','Товар / исходные сведения','Состояние',''].map(t=>el('th',{scope:'col',text:t})))]),el('tbody',{},visible.map(product=>{
      const problems=L.sourceErrors(product);
      const checkbox=el('input',{type:'checkbox','aria-label':'Выбрать '+product.sku,checked:selected.has(product.sku),disabled:!!problems.length,onChange:event=>{
        if(event.target.checked&&selected.size>=3){event.target.checked=false;feedback('В одном запросе может быть до трёх товаров.',true);return;}
        if(event.target.checked)selected.add(product.sku);else selected.delete(product.sku);refreshList();
      }});
      return el('tr',{'data-sku':product.sku},[el('td',{class:'check-col'},[checkbox]),el('td',{},[el('span',{class:'product-name',text:product.name||'Название не заполнено'}),el('span',{class:'sku',text:product.sku}),p(problems.length?problems.join(' · '):`${product.material} · ${product.color} · ${product.width_cm} × ${product.depth_cm} × ${product.height_cm} см`,'source-mini')]),el('td',{},[statusTag(product)]),el('td',{},[btn('Проверить ↗',()=>navigate('#/product/'+encodeURIComponent(product.sku)),'compact')])]);
    }))]));
  }
  function readEditor(){return {title:$('draft-title').value,bullets:Array.from({length:4},(_,i)=>$('bullet-'+i).value).filter(s=>s.trim()),description:$('draft-description').value};}
  function productPage(sku){
    let product;try{product=L.productFor?L.productFor(state,sku):state.products.find(p=>p.sku===sku);if(!product)throw Error();}catch(e){main.append(heading('Товар не найден','Вернитесь в каталог и выберите существующий артикул.'),btn('К каталогу',()=>navigate('#/catalog'),'primary'));return;}
    if(!editing||editing.sku!==sku)editing={sku,dirty:false};
    main.append(el('a',{href:'#/catalog',class:'back-link',text:'← Вернуться к каталогу'}),heading('Проверка карточки','Сверьте черновик с исходными данными. Формальная проверка не подтверждает достоверность утверждений.'));
    const facts=el('section',{class:'card source-card'},[p('ИСХОДНЫЕ СВЕДЕНИЯ','eyebrow'),el('span',{class:'sku',text:product.sku}),el('span',{class:'product-name',text:product.name||'Без названия'}),statusTag(product),el('dl',{},[['Материал',product.material],['Цвет',product.color],['Ширина',product.width_cm+' см'],['Глубина',product.depth_cm+' см'],['Высота',product.height_cm+' см'],['В упаковке',product.pack_qty+' шт.']].map(([label,value])=>el('div',{},[el('dt',{text:label}),el('dd',{text:value})]))),p('Только для чтения. Для изменения фактов исправьте CSV и заново загрузите каталог.','readonly')]);
    const problems=L.sourceErrors(product);
    if(problems.length){facts.append(el('ul',{class:'error-list'},problems.map(t=>el('li',{text:t}))));main.append(el('div',{class:'product-layout'},[facts,el('section',{class:'card'},[el('h2',{text:'Сначала дополните исходники'}),p('Для этого товара нельзя подготовить запрос и одобрить текст, пока не заполнены перечисленные характеристики.','muted'),btn('Загрузить исправленный CSV',()=>requestFile('csv'),'primary')])]));return;}
    const draft=product.draft||{title:'',bullets:[],description:''};
    const changed=()=>{editing.dirty=true;$('fact-review').checked=false;$('fact-review').disabled=false;$('dirty-state').textContent='Есть несохранённые правки';};
    function field(label,id,value,max,rows){const input=el(rows?'textarea':'input',{id,maxlength:max,rows:rows||null,type:rows?null:'text',onInput:changed});input.value=value;return el('label',{class:'form-field',for:id},[el('span',{class:'field-title'},[label,el('span',{text:'до '+max+' символов'})]),input]);}
    const textForm=el('section',{class:'card editor'},[p('ЧЕРНОВИК ТЕКСТА','eyebrow'),field('Название','draft-title',draft.title,100),el('span',{class:'field-title',text:'Короткие пункты о товаре'}),p('От 1 до 4 пунктов, каждый 10–160 символов.','form-note'),...Array.from({length:4},(_,i)=>{const x=field('Пункт '+(i+1),'bullet-'+i,draft.bullets[i]||'',160,2);x.classList.add('bullet-field');return x;}),field('Описание','draft-description',draft.description,600,6),el('label',{class:'review-check'},[el('input',{type:'checkbox',id:'fact-review',checked:product.reviewed,disabled:product.approved}),el('span',{text:'Я сверил(а) материал, цвет, размеры и комплектацию. В тексте нет неподтверждённых свойств и обещаний.'})]),p('Эта отметка — ваша ручная проверка. Изменение текста потребует новой сверки.','form-note'),el('div',{class:'review-footer'},[el('span',{id:'dirty-state',class:'dirty-label',text:product.approved?'Карточка одобрена':product.draft?'Сохранённый черновик':'Текст ещё не добавлен'}),el('div',{class:'actions'},[btn('Отмена',()=>{editing=null;render();},'subtle','cancel-edit'),btn('Сохранить черновик',()=>{
      try{const result=L.saveDraft(state,sku,readEditor());editing=null;commit(result.state,result.changed?'Черновик сохранён. Одобрение снято; перед экспортом нужна новая сверка.':'Текст не изменился. Состояние карточки сохранено.');}catch(e){feedback(e.message,true);}
    },'','save-draft'),btn('Одобрить',()=>{
      try{const reviewed=$('fact-review').checked;const next=L.saveDraft(state,sku,readEditor()).state;const approved=L.approve(next,sku,reviewed);editing=null;commit(approved,'Карточка одобрена. Она попадёт в экспорт независимо от фильтра каталога.');}catch(e){feedback(e.message,true);}
    },'primary','approve-card')])])]);
    main.append(el('div',{class:'product-layout'},[facts,textForm]));
  }
  function exportPage(){
    const approved=state.products.filter(p=>p.approved);
    main.append(heading('Передача результата','В CSV попадут только одобренные карточки. Резерв сохранит весь каталог, тексты и состояния.'));
    const exportButton=btn('Экспорт одобренных ('+approved.length+')',()=>{try{download('catalogdraft-approved.csv',L.exportCsv(state),'text/csv');feedback('Скачан CSV всех одобренных карточек. Откройте файл и проверьте результат.');}catch(e){feedback(e.message,true);}},'primary','export-csv');exportButton.disabled=!approved.length||busy;
    const backupButton=btn('Скачать резерв JSON',downloadBackup,'','download-backup');backupButton.disabled=!state.products.length||busy;
    main.append(el('div',{class:'export-grid'},[el('section',{class:'card'},[p('ПАКЕТ ДЛЯ ПЕРЕДАЧИ','eyebrow'),el('h2',{text:'Проверено вами'}),el('strong',{class:'export-count',text:String(approved.length)}),p(approved.length?'Одобрения относятся ко всему каталогу. Поиск и фильтр на состав CSV не влияют.':'Откройте карточку, проверьте факты и нажмите «Одобрить».','small muted'),exportButton,el('ul',{class:'approved-list'},approved.map(p=>el('li',{},[el('span',{class:'sku',text:p.sku+' · '}),p.draft.title]))),p('UTF-8 · разделитель ; · собственный формат текстов. Это не загрузочный шаблон маркетплейса.','form-note')]),el('div',{},[el('section',{class:'card'},[el('h2',{text:'Резерв всей работы'}),p('Переносите исходники, черновики и одобрения между браузерами или возвращайтесь к сохранённой версии.','small muted'),el('div',{class:'actions'},[backupButton,btn('Восстановить резерв',()=>requestFile('backup'),'','restore-backup')]),el('div',{class:'info-strip'},['Восстановление заменяет текущую работу после проверки файла и вашего подтверждения.'])]),el('section',{class:'card',style:'margin-top:18px'},[el('h2',{text:'Как работать с Qwen'}),el('ol',{class:'howto'},['Выберите в каталоге до трёх товаров и соберите запрос.','Перенесите запрос в Qwen и сохраните чистый JSON-ответ.','Загрузите ответ, проверьте факты и одобрите тексты.'].map(text=>el('li',{text}))),btn('Загрузить JSON-ответ',()=>requestFile('response'),'','export-upload-response')])])]));
    main.append(el('div',{class:'info-strip'},['Данные хранятся только в этом браузере и по этому адресу. ИИ не публикует тексты автоматически. Сохранённые примеры и товары демо являются учебными.']));
  }
  function render(){
    renderNotice();renderStorage();renderNav();main.replaceChildren();main.setAttribute('aria-busy',String(busy));
    if(activeRoute==='#/export')exportPage();
    else if(activeRoute.startsWith('#/product/')){let sku;try{sku=decodeURIComponent(activeRoute.slice('#/product/'.length));}catch(e){sku='';}productPage(sku);}
    else catalogPage();
  }
  render();
})();
