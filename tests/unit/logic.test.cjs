const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const L=require('../../logic.js');
const root=path.resolve(__dirname,'../..');
const csv=fs.readFileSync(path.join(root,'demo/products.csv'),'utf8');
const response=fs.readFileSync(path.join(root,'demo/qwen-response.json'),'utf8');
const sources=()=>L.parseCsv(csv);
const demo=()=>L.createCatalog(sources(),'demo-catalog-v1');
const withDrafts=()=>L.importResponse(demo(),response).state;
const approved=()=>L.approve(withDrafts(),'ORG-001',true);
const counts=state=>{const c=L.counts(state);assert.equal(c.total,c.needs_data+c.ready+c.draft+c.approved);return c;};
test('C1–C7: complete review chain, repeat import, invalidation, filtered view and export',()=>{
  let state=demo();assert.deepEqual(counts(state),{total:10,needs_data:0,ready:10,draft:0,approved:0});
  state=L.importResponse(state,response).state;assert.equal(counts(state).draft,3);
  state=L.approve(state,'ORG-001',true);assert.equal(counts(state).approved,1);
  const repeated=L.importResponse(state,response);assert.equal(repeated.updated,0);assert.equal(repeated.skipped,3);assert.deepEqual(repeated.state,state);
  const draft={...state.products[0].draft,title:'Органайзер «Линия», серый, 20 × 10 × 8 см'};
  state=L.saveDraft(state,'ORG-001',draft).state;assert.equal(counts(state).approved,0);assert.equal(state.products[0].reviewed,false);assert.throws(()=>L.exportCsv(state));
  assert.throws(()=>L.approve(state,'ORG-001',false));state=L.approve(state,'ORG-001',true);
  assert.equal(L.filterProducts(state,'','ready').length,7);assert.equal(counts(state).approved,1);
  const out=L.exportCsv(state);const rows=L.csvRows(out);assert.equal(rows.length,2);assert.equal(rows[1][0],'ORG-001');assert.equal(rows[1][1],draft.title);assert.equal(rows[1][6],draft.description);
  const restored=L.parseBackup(L.createBackup(state));assert.deepEqual(restored,state);assert.equal(L.exportCsv(restored),out);
});
test('CSV supports BOM, CRLF, quoted separators, doubled quotes and embedded newlines',()=>{
  const text='\uFEFF'+L.SOURCE_FIELDS.join(';')+'\r\nA1;"Название; с ""кавычками""\nи строкой";Металл;Серый;20,5;10;8;1\r\n';
  const p=L.parseCsv(text)[0];assert.equal(p.name,'Название; с "кавычками"\nи строкой');assert.equal(p.width_cm,'20.5');assert.equal(L.sourceErrors(p).length,0);
});
test('structural CSV errors reject the whole input',()=>{
  const lines=csv.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  for(const text of [lines[0]+'\n'+lines[1]+'\n'+lines[1],csv.replace('sku;name','sku;other'),lines[0]+'\n"unterminated',lines[0]+'\n;name;mat;color;1;1;1;1',csv.repeat(1000)])assert.throws(()=>L.parseCsv(text));
});
test('missing and invalid source facts are imported as needs_data and cannot be used in prompts',()=>{
  const src=sources();src[2].material='';src[3].pack_qty='-1';src[4].width_cm='0';
  const state=L.createCatalog(src,'facts');assert.equal(counts(state).needs_data,3);assert.equal(counts(state).ready,7);
  assert.throws(()=>L.buildPrompt(state,['ORG-003']));
});
test('normalization and equality ignore row order but preserve genuine source changes',()=>{
  const src=sources();assert.equal(L.sameCatalog(demo(),src.slice().reverse()),true);
  src[0].width_cm='20.0';assert.equal(L.sameCatalog(demo(),L.validateSources(src)),true);
  src[0].color='Белый';assert.equal(L.sameCatalog(demo(),src),false);
});
test('special SKU is a normal value, duplicates are rejected',()=>{
  const src=sources().slice(0,1);src[0].sku='__proto__';const state=L.createCatalog(src,'special');assert.equal(state.products.length,1);
  assert.throws(()=>L.createCatalog([src[0],src[0]],'special'));
  const raw=JSON.parse(response);raw.catalog_id='special';raw.cards=[{...raw.cards[0],sku:'__proto__'}];assert.equal(L.importResponse(state,JSON.stringify(raw)).updated,1);
});
test('AI response rejects stale catalog, unknown/duplicate SKU and wrong schemas atomically',()=>{
  const state=approved(),before=JSON.stringify(state);
  const variants=[];const a=JSON.parse(response);a.catalog_id='old-catalog';variants.push(a);
  const b=JSON.parse(response);b.cards[0].sku='UNKNOWN';variants.push(b);
  const c=JSON.parse(response);c.cards.push(c.cards[0]);variants.push(c);
  const d=JSON.parse(response);d.cards[1].approved=true;variants.push(d);
  const e=JSON.parse(response);e.cards[1].bullets='not-array';variants.push(e);
  const f=JSON.parse(response);f.cards[2].title='short';variants.push(f);
  for(const raw of variants){assert.throws(()=>L.importResponse(state,JSON.stringify(raw)));assert.equal(JSON.stringify(state),before);}
  assert.throws(()=>L.importResponse(state,'```json\n'+response+'\n```'));
  assert.throws(()=>L.importResponse(state,'Here is your JSON '+response));
});
test('changed AI copy requires confirmation before overwriting approval; source facts never change',()=>{
  const state=approved(),raw=JSON.parse(response),facts=state.products.map(p=>L.SOURCE_FIELDS.map(k=>p[k]));
  raw.cards[0].title='Новое название органайзера «Линия»';
  assert.throws(()=>L.importResponse(state,JSON.stringify(raw)),error=>error.code==='CONFIRM_REPLACE');assert.equal(state.products[0].approved,true);
  const next=L.importResponse(state,JSON.stringify(raw),true).state;assert.equal(next.products[0].approved,false);assert.equal(next.products[0].reviewed,false);
  assert.deepEqual(next.products.map(p=>L.SOURCE_FIELDS.map(k=>p[k])),facts);
});
test('editing the same draft preserves approval; changed or incomplete draft invalidates it',()=>{
  const state=approved();const same=L.saveDraft(state,'ORG-001',state.products[0].draft);assert.equal(same.changed,false);assert.equal(same.state.products[0].approved,true);
  const next=L.saveDraft(state,'ORG-001',{title:'',bullets:[],description:''}).state;assert.equal(L.statusOf(next.products[0]),'draft');assert.throws(()=>L.approve(next,'ORG-001',true));assert.doesNotThrow(()=>L.parseBackup(L.createBackup(next)));
});
test('backup rejects forged approvals, duplicates, excess fields and wrong format',()=>{
  const state=approved(),back=JSON.parse(L.createBackup(state));
  back.products[1].approved=true;assert.throws(()=>L.parseBackup(JSON.stringify(back)));
  const dup=JSON.parse(L.createBackup(state));dup.products.push(dup.products[0]);assert.throws(()=>L.parseBackup(JSON.stringify(dup)));
  const extra=JSON.parse(L.createBackup(state));extra.secret='no';assert.throws(()=>L.parseBackup(JSON.stringify(extra)));
  assert.throws(()=>L.parseBackup(response));
  assert.deepEqual(L.parseBackup('\uFEFF'+L.createBackup(state)),state);
});
test('CSV export escapes user text and neutralizes spreadsheet formulas without modifying drafts',()=>{
  let state=withDrafts();const draft={title:'=Формула; "проверка"',bullets:['+Пункт об органайзере'],description:'@Описание с переносом\nи кавычками "пример" длиной больше сорока символов.'};
  state=L.saveDraft(state,'ORG-001',draft).state;state=L.approve(state,'ORG-001',true);const before=JSON.stringify(state);
  const rows=L.csvRows(L.exportCsv(state));assert.equal(rows[1][1],"'"+draft.title);assert.equal(rows[1][2],"'"+draft.bullets[0]);assert.equal(rows[1][6],"'"+draft.description);assert.equal(JSON.stringify(state),before);
});
test('prompt contains exact facts, no stored drafts or approval fields',()=>{
  const state=approved(),prompt=L.buildPrompt(state,['ORG-001','ORG-002']);assert.ok(prompt.includes(state.catalog_id));assert.ok(prompt.includes('"width_cm": "20"'));assert.ok(!prompt.includes('"approved"'));assert.throws(()=>L.buildPrompt(state,[]));assert.throws(()=>L.buildPrompt(state,['ORG-001','ORG-001']));
});
test('storage distinguishes no saved data, corrupt data and storage denial',()=>{
  const context={CatalogLogic:L};vm.runInNewContext(fs.readFileSync(path.join(root,'storage.js'),'utf8'),context);const S=context.CatalogStorage;
  assert.equal(S.load({getItem:()=>null}).mode,'persistent');
  const corrupt=S.load({getItem:()=>'{broken'});assert.equal(corrupt.mode,'corrupt');assert.equal(corrupt.raw,'{broken');assert.equal(corrupt.state.products.length,0);
  assert.equal(S.load({getItem(){throw Error('blocked');}}).mode,'memory');assert.equal(S.save({setItem(){throw Error('quota');}},demo()).ok,false);
});
