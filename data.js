// Dovetail AI — deterministic demo data. All amounts in entity functional currency.
export const ENTITIES=[
 {id:'GROUP',name:'Algo8 Group',cur:'CAD',group:true},
 {id:'CA',name:'Algo8 Canada',cur:'CAD'},
 {id:'IN',name:'Algo8 India',cur:'INR'},
 {id:'US',name:'Algo8 US',cur:'USD'}];
export const FX={CAD:1,USD:1.36,INR:0.0165}; // to CAD (Jul 2026 closing rates)
export const PERIODS=[{id:'2026-07',label:'Jul 2026'},{id:'2026-06',label:'Jun 2026'},{id:'2025-07',label:'Jul 2025'}];
export const COA=[
 ['1000','Cash — Operating','A'],['1010','Cash — Payroll','A'],['1020','Cash — USD Account','A'],
 ['1100','Accounts Receivable','A'],['1200','Prepaid Expenses','A'],['1500','Computer Equipment','A'],['1600','Accumulated Depreciation','A'],
 ['2000','Accounts Payable','L'],['2100','Sales Tax Payable','L'],['2200','Payroll Liabilities','L'],['2500','Term Loan','L'],
 ['3000','Share Capital','Q'],['3900','Retained Earnings','Q'],
 ['4000','Platform Subscriptions','R'],['4100','Professional Services','R'],
 ['5000','Cloud Hosting (COGS)','C'],['5100','Implementation Labour (COGS)','C'],
 ['6000','Salaries & Benefits','X'],['6100','Rent','X'],['6200','Software & Tools','X'],['6300','Professional Fees','X'],
 ['6400','Telephone','X'],['6500','Travel','X'],['6600','Insurance','X'],['6700','Office Supplies','X'],['6800','Marketing & Printing','X'],['6900','Depreciation','X'],['6950','Bank Charges','X']
].map(a=>({n:a[0],name:a[1],t:a[2]}));
export const acctName=n=>{const a=COA.find(x=>x.n===n);return a?a.name:n};
export const VENDORS={
 CA:[{id:'bell',name:'Bell Canada',acct:'6400'},{id:'aws',name:'AWS (Amazon Web Services)',acct:'5000'},{id:'deloitte',name:'Deloitte LLP',acct:'6300'},{id:'northgate',name:'Northgate Properties',acct:'6100'},{id:'maple',name:'Maple Systems Contracting',acct:'5100'},{id:'staples',name:'Staples Business',acct:'6700'},{id:'sunlife',name:'Sun Life Financial',acct:'6600'},{id:'atlassian',name:'Atlassian',acct:'6200'}],
 IN:[{id:'airtel',name:'Airtel Business',acct:'6400'},{id:'aws',name:'AWS India',acct:'5000'},{id:'dlf',name:'DLF Cyber City',acct:'6100'},{id:'infoserv',name:'InfoServ Contractors',acct:'5100'},{id:'icici',name:'ICICI Lombard',acct:'6600'},{id:'croma',name:'Croma Business',acct:'6700'}],
 US:[{id:'verizon',name:'Verizon Business',acct:'6400'},{id:'aws',name:'AWS Inc.',acct:'5000'},{id:'wework',name:'WeWork Denver',acct:'6100'},{id:'gusto',name:'Gusto',acct:'6200'},{id:'hartford',name:'The Hartford',acct:'6600'}]};
export const CUSTOMERS={
 CA:['Meridian Foods Group','TrueNorth Mining Ltd','Lakeside Pulp & Paper','Harbourline Logistics','Prairie AgCo'],
 IN:['CascadeChem India','Bharat Cement Works','Suryodaya Steel','Deccan Textiles'],
 US:['Rockline Petrochemical','Great Plains Energy','Cummins Ridge Foods','Ironwood Automotive']};
const TAXRATE={CA:.05,IN:.18,US:.07}, TAXNAME={CA:'GST 5%',IN:'GST 18%',US:'Sales tax 7%'};
const SCALE={CA:1,IN:42,US:.82};
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0};
export const fakeHash=s=>{let h1=hash('a'+s),h2=hash('b'+s),h3=hash('c'+s),h4=hash('d'+s);return (h1.toString(16)+h2.toString(16)+h3.toString(16)+h4.toString(16)).padEnd(32,'0').slice(0,32)};
const r2=n=>Math.round(n*100)/100;
const DEPTS=['Operations','Engineering','Sales','G&A'],PROJECTS=['Plant OS Rollout','Meridian Deploy','Core Platform','—'];
let _id=0;const nid=()=>'T'+String(++_id).padStart(4,'0');
function mkTx(o){const dr=o.lines.reduce((s,l)=>s+(l.dr||0),0),cr=o.lines.reduce((s,l)=>s+(l.cr||0),0);if(Math.abs(dr-cr)>.02)o.lines.push(dr>cr?{acct:'6950',cr:r2(dr-cr)}:{acct:'6950',dr:r2(cr-dr)});return {id:nid(),ai:false,conf:null,...o}}
// ---------- ledger generation ----------
function genPeriod(e,p,pinned){
 const rnd=mulberry32(hash(e+p)),tx=[],y=p.slice(0,4),m=p.slice(5),V=VENDORS[e],C=CUSTOMERS[e],sc=SCALE[e],tr=TAXRATE[e];
 const d=day=>`${y}-${m}-${String(day).padStart(2,'0')}`;
 const grow=p==='2025-07'?.86:(p==='2026-06'?.985:1);
 // Revenue invoices
 C.forEach((c,i)=>{
  const base=(16000+rnd()*26000)*sc*grow,svc=rnd()<.35,amt=r2(base),tax=r2(amt*tr);
  tx.push(mkTx({date:d(2+i*5),period:p,entity:e,src:'AR',desc:`Invoice — ${c}`,customer:c,invno:`INV-${p.replace('-','')}-${100+i}`,ai:true,agent:'AR/Collections Agent',conf:97+Math.floor(rnd()*3),proj:PROJECTS[i%3],dept:'Sales',
   lines:[{acct:'1100',dr:r2(amt+tax)},{acct:svc?'4100':'4000',cr:amt},{acct:'2100',cr:tax}],rationale:`Recurring ${svc?'services':'subscription'} billing for ${c} — matches contract schedule.`}));
  if(i<C.length-1){const rc=r2(base*.94);tx.push(mkTx({date:d(6+i*5),period:p,entity:e,src:'Bank',desc:`Customer receipt — ${c}`,customer:c,ai:true,agent:'Treasury Agent',conf:99,
   lines:[{acct:'1000',dr:rc},{acct:'1100',cr:rc}],rationale:`Bank deposit auto-matched to ${c} open invoices (reference on remittance).`}))}
 });
 // Vendor bills
 const bills=[['northgate','6100',8500,'Monthly office rent',1],['aws','5000',6200,'Cloud hosting usage',3],['atlassian','6200',940,'Software subscriptions',4],['sunlife','6600',1150,'Group insurance premium',7],['staples','6700',380,'Office supplies',9],['maple','5100',7400,'Implementation contractor hours',15],['deloitte','6300',2600,'Advisory retainer',18]];
 bills.forEach((b,i)=>{const v=V.find(x=>x.id===b[0])||V[i%V.length];const amt=r2(b[2]*sc*(0.92+rnd()*.16)*grow),tax=r2(amt*tr);
  tx.push(mkTx({date:d(b[4]),period:p,entity:e,src:'AP',desc:`${b[3]} — ${v.name}`,vendor:v.name,invno:`${v.name.slice(0,2).toUpperCase()}-${p.replace('-','')}-${20+i}`,ai:true,agent:'AP Agent',conf:95+Math.floor(rnd()*5),proj:b[1]==='5100'?PROJECTS[1]:'—',dept:b[1]==='5100'?'Engineering':'G&A',
   lines:[{acct:v.acct||b[1],dr:amt},{acct:'2100',dr:tax},{acct:'2000',cr:r2(amt+tax)}],tax:TAXNAME[e],rationale:`Matches ${8+Math.floor(rnd()*9)} prior bills from ${v.name}; same account & amount pattern.`}));
  if(i<5){const pay=r2((amt+tax));tx.push(mkTx({date:d(Math.min(b[4]+12,27)),period:p,entity:e,src:'Bank',desc:`Bill payment — ${v.name}`,vendor:v.name,ai:true,agent:'Treasury Agent',conf:99,lines:[{acct:'2000',dr:pay},{acct:'1000',cr:pay}],rationale:'Payment run approved by Controller; bank confirmation received.'}))}
 });
 // Telephone (pinned for CA; generated otherwise)
 if(pinned&&pinned[p]){pinned[p].forEach(t=>tx.push(mkTx(t)))}
 else{const v=V.find(x=>x.acct==='6400');const amt=r2(900*sc*grow),tax=r2(amt*tr);
  tx.push(mkTx({date:d(5),period:p,entity:e,src:'AP',desc:`Monthly telecom services — ${v.name}`,vendor:v.name,invno:`TEL-${p.replace('-','')}`,ai:true,agent:'AP Agent',conf:98,dept:'G&A',proj:'—',lines:[{acct:'6400',dr:amt},{acct:'2100',dr:tax},{acct:'2000',cr:r2(amt+tax)}],tax:TAXNAME[e],rationale:`Matches prior monthly telecom bills from ${v.name}.`}))}
 // Payroll
 const gross=r2(88000*sc*grow),wh=r2(gross*.24);
 tx.push(mkTx({date:d(28),period:p,entity:e,src:'Payroll',desc:'Monthly payroll',ai:true,agent:'Controller Agent',conf:99,dept:'G&A',lines:[{acct:'6000',dr:gross},{acct:'1010',cr:r2(gross-wh)},{acct:'2200',cr:wh}],rationale:'Payroll journal from payroll register; headcount unchanged.'}));
 // Depreciation + bank charges
 const dep=r2(2100*sc);
 tx.push(mkTx({date:d(28),period:p,entity:e,src:'JE',desc:'Monthly depreciation — computer equipment',ai:true,agent:'Controller Agent',conf:99,lines:[{acct:'6900',dr:dep},{acct:'1600',cr:dep}],rationale:'Straight-line schedule, 36 months, no additions this period.'}));
 const bf=r2(85*sc);
 tx.push(mkTx({date:d(27),period:p,entity:e,src:'Bank',desc:'Bank service charges',ai:true,agent:'Treasury Agent',conf:99,lines:[{acct:'6950',dr:bf},{acct:'1000',cr:bf}],rationale:'Recurring monthly bank fee, matched to bank feed.'}));
 return tx;
}
const PIN_CA={
 '2025-07':[{date:'2025-07-05',period:'2025-07',entity:'CA',src:'AP',desc:'Monthly telecom services — Bell Canada',vendor:'Bell Canada',invno:'1102',ai:true,agent:'AP Agent',conf:98,dept:'G&A',proj:'—',tax:'GST 5%',lines:[{acct:'6400',dr:1205},{acct:'2100',dr:60.25},{acct:'2000',cr:1265.25}],rationale:'Matches prior monthly telecom bills from Bell Canada.'}],
 '2026-06':[{date:'2026-06-05',period:'2026-06',entity:'CA',src:'AP',desc:'Monthly telecom services — Bell Canada',vendor:'Bell Canada',invno:'1231',ai:true,agent:'AP Agent',conf:98,dept:'G&A',proj:'—',tax:'GST 5%',lines:[{acct:'6400',dr:1238},{acct:'2100',dr:61.9},{acct:'2000',cr:1299.9}],rationale:'Matches prior monthly telecom bills; +2.7% rate increase effective Apr 2026.'}],
 '2026-07':[
  {date:'2026-07-05',period:'2026-07',entity:'CA',src:'AP',desc:'Monthly telecom services — Bell Canada',vendor:'Bell Canada',invno:'1263',ai:true,agent:'AP Agent',conf:98,dept:'G&A',proj:'—',tax:'GST 5%',lines:[{acct:'6400',dr:1242},{acct:'2100',dr:62.1},{acct:'2000',cr:1304.1}],rationale:'Matches 14 prior monthly bills from Bell Canada; rate increase effective Apr 2026.'},
  {date:'2026-07-03',period:'2026-07',entity:'CA',src:'AP',desc:'One-time charge — new phone system installation — Bell Canada',vendor:'Bell Canada',invno:'1245',docdate:'2026-06-12',ai:true,agent:'AP Agent',conf:96,dept:'G&A',proj:'—',tax:'GST 5%',lines:[{acct:'6400',dr:620},{acct:'2100',dr:31},{acct:'2000',cr:651}],rationale:'Invoice dated 12 Jun 2026, received 3 Jul — one-time installation charge, coded to Telephone per policy (below capitalization threshold).'}]};
// Openings: [acct, amount] dr positive; RE plugs.
function opening(e,p,base){
 const sc=SCALE[e],f=p==='2025-07'?.84:1;
 const L=[['1000',182000*sc*f],['1010',24000*sc*f],['1020',31000*sc*f],['1100',96000*sc*f],['1200',8400*sc],['1500',76000*sc],['1600',-30000*sc*f],['2000',-52000*sc*f],['2100',-9800*sc*f],['2200',-21000*sc*f],['2500',-120000*sc],['3000',-100000*sc]];
 const plug=-L.reduce((s,x)=>s+x[1],0);L.push(['3900',plug]);
 return mkTx({date:p+'-01',period:p,entity:e,src:'Opening',desc:'Opening balances',opening:true,lines:L.map(x=>x[1]>=0?{acct:x[0],dr:r2(x[1])}:{acct:x[0],cr:r2(-x[1])})});
}
export function buildLedger(){
 _id=0;const all=[];
 for(const e of ['CA','IN','US'])for(const p of ['2025-07','2026-06','2026-07']){
  all.push(opening(e,p));
  all.push(...genPeriod(e,p,e==='CA'?PIN_CA:null));
 }
 // chain Jul-2026 opening = Jun opening + Jun activity, per entity
 for(const e of ['CA','IN','US']){
  const junAll=all.filter(t=>t.entity===e&&t.period==='2026-06'),julOp=all.find(t=>t.entity===e&&t.period==='2026-07'&&t.opening);
  const bal={};junAll.forEach(t=>t.lines.forEach(l=>{bal[l.acct]=(bal[l.acct]||0)+(l.dr||0)-(l.cr||0)}));
  // roll P&L into RE
  let re=0;for(const a of Object.keys(bal)){const t=COA.find(c=>c.n===a).t;if(t==='R'||t==='X'||t==='C'){re+=bal[a];delete bal[a]}}
  bal['3900']=(bal['3900']||0)+re;
  julOp.lines=Object.keys(bal).sort().map(a=>bal[a]>=0?{acct:a,dr:r2(bal[a])}:{acct:a,cr:r2(-bal[a])});
 }
 return all;
}
// ---------- aggregation ----------
export function conv(amt,fromCur,book){ if(book==='reporting')return amt*FX[fromCur]; return amt }
export function txnsFor(ledger,ent,period,opts={}){
 return ledger.filter(t=>(ent==='GROUP'?true:t.entity===ent)&&t.period===period&&(opts.opening?true:!t.opening));
}
export function glTotal(ledger,acct,ent,period){
 let s=0;for(const t of ledger){if(t.period!==period)continue;if(ent!=='GROUP'&&t.entity!==ent)continue;
  for(const l of t.lines)if(l.acct===acct)s+=((l.dr||0)-(l.cr||0))*(ent==='GROUP'?FX[ENTITIES.find(e=>e.id===t.entity).cur]:1)}
 return r2(s);
}
export function glTxns(ledger,acct,ent,period){
 return ledger.filter(t=>t.period===period&&(ent==='GROUP'||t.entity===ent)&&!t.opening&&t.lines.some(l=>l.acct===acct));
}
export function trialBalance(ledger,ent,period){
 const bal={};
 for(const t of ledger){if(t.period!==period)continue;if(ent!=='GROUP'&&t.entity!==ent)continue;
  const fx=ent==='GROUP'?FX[ENTITIES.find(e=>e.id===t.entity).cur]:1;
  for(const l of t.lines)bal[l.acct]=(bal[l.acct]||0)+((l.dr||0)-(l.cr||0))*fx}
 return COA.map(a=>({...a,bal:r2(bal[a.n]||0)})).filter(a=>Math.abs(a.bal)>=.01||['1000','1100','2000','4000'].includes(a.n));
}
export function plRows(ledger,ent,period){
 return COA.filter(a=>'RCX'.includes(a.t)).map(a=>({...a,amt:r2((a.t==='R'?-1:1)*glTotal(ledger,a.n,ent,period))})).filter(a=>Math.abs(a.amt)>=.01);
}
export function cashByEntity(ledger,period){
 return ['CA','IN','US'].map(e=>{const cur=ENTITIES.find(x=>x.id===e).cur;
  const amt=r2(['1000','1010','1020'].reduce((s,a)=>s+glTotal(ledger,a,e,period),0));
  return {entity:e,name:ENTITIES.find(x=>x.id===e).name,cur,amt,cad:r2(amt*FX[cur])}});
}
export const fmt=(n,cur)=>{const neg=n<0,a=Math.abs(n);const s=a.toLocaleString('en-CA',{minimumFractionDigits:0,maximumFractionDigits:0});return (neg?'(':'')+s+(neg?')':'')+(cur?' '+cur:'')};
export const fmt2=(n,cur)=>{const neg=n<0,a=Math.abs(n);const s=a.toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2});return (neg?'(':'')+s+(neg?')':'')+(cur?' '+cur:'')};
// ---------- AP queue ----------
export const AP_QUEUE=[
 {id:'B01',vendor:'Bell Canada',invno:'1263',date:'2026-07-05',amt:1304.10,cur:'CAD',acct:'6400',dept:'G&A',conf:98,status:'auto',reason:'Matches 14 prior bills from this vendor'},
 {id:'B02',vendor:'Northgate Properties',invno:'NP-2607',date:'2026-07-01',amt:8925.00,cur:'CAD',acct:'6100',dept:'G&A',conf:99,status:'auto',reason:'Fixed monthly lease per contract'},
 {id:'B03',vendor:'AWS (Amazon Web Services)',invno:'AWS-88231',date:'2026-07-03',amt:6531.42,cur:'CAD',acct:'5000',dept:'Engineering',conf:97,status:'auto',reason:'Usage invoice; within 8% of trailing average'},
 {id:'B04',vendor:'Atlassian',invno:'AT-99120',date:'2026-07-04',amt:987.00,cur:'CAD',acct:'6200',dept:'Engineering',conf:98,status:'auto',reason:'Recurring subscription, same amount as June'},
 {id:'B05',vendor:'Sun Life Financial',invno:'SL-4471',date:'2026-07-07',amt:1207.50,cur:'CAD',acct:'6600',dept:'G&A',conf:97,status:'auto',reason:'Monthly premium per policy schedule'},
 {id:'B06',vendor:'Staples Business',invno:'ST-30988',date:'2026-07-09',amt:399.00,cur:'CAD',acct:'6700',dept:'G&A',conf:96,status:'auto',reason:'Small-value supplies, usual vendor pattern'},
 {id:'B07',vendor:'Bell Canada',invno:'1245',date:'2026-06-12',amt:651.00,cur:'CAD',acct:'6400',dept:'G&A',conf:96,status:'auto',reason:'One-time installation; below capitalization threshold',note:'Approved via WhatsApp by A. Sharma, 3 Jul',paid:true},
 {id:'B08',vendor:'Deloitte LLP',invno:'DL-77452',date:'2026-07-18',amt:2730.00,cur:'CAD',acct:'6300',dept:'G&A',conf:95,status:'auto',reason:'Advisory retainer per engagement letter'},
 {id:'B09',vendor:'Maple Systems Contracting',invno:'MS-1188',date:'2026-07-15',amt:7770.00,cur:'CAD',acct:'5100',dept:'Engineering',conf:88,status:'review',reason:'Hours 22% above June — project allocation needs a check',proj:'Meridian Deploy',po:'PO-2214',match:'3-way: PO ✓ · Receipt ✓ · Price +22%'},
 {id:'B10',vendor:'Harbour Print Co.',invno:'HP-5521',date:'2026-07-16',amt:1420.00,cur:'CAD',acct:'6800',dept:'Sales',conf:84,status:'review',reason:'New vendor — no history; account inferred from line items'},
 {id:'B11',vendor:'AWS (Amazon Web Services)',invno:'AWS-88790',date:'2026-07-21',amt:2210.90,cur:'CAD',acct:'5000',dept:'Engineering',conf:82,status:'review',reason:'Second AWS invoice this month — possible new sub-account'},
 {id:'B12',vendor:'Delta Freight Services',invno:'DF-0042',date:'2026-07-22',amt:3980.00,cur:'CAD',acct:null,dept:null,conf:64,status:'escalated',reason:'No PO found and line items don’t match any prior pattern. Is this project freight (5100) or office move (6700)?'}];
// ---------- controls ----------
export const CONTROLS=[
 {id:'C-01',process:'Procurement',risk:'Fictitious or duplicate vendor payments',objective:'All disbursements are for valid, approved obligations',assertion:'E/O',freq:'Continuous',owner:'AP Agent + Controller',status:'pass',tested:'28 Jul 2026',evidence:'412 bills screened; 3 duplicates blocked',auto:true},
 {id:'C-02',process:'Procurement',risk:'Purchases without authorization',objective:'POs approved per delegation of authority',assertion:'R&O',freq:'Per transaction',owner:'Controller',status:'pass',tested:'28 Jul 2026',evidence:'100% of POs > $5k carry approval record',auto:true},
 {id:'C-03',process:'Procurement',risk:'Goods invoiced but not received',objective:'3-way match on PO-backed bills',assertion:'E/O',freq:'Per transaction',owner:'AP Agent',status:'exception',tested:'26 Jul 2026',evidence:'1 open: MS-1188 price variance +22%',auto:true},
 {id:'C-04',process:'Payroll',risk:'Ghost employees / wrong rates',objective:'Payroll ties to HR master and approved rates',assertion:'E/O',freq:'Monthly',owner:'Controller Agent',status:'pass',tested:'28 Jul 2026',evidence:'Headcount 3-way tie: HR, payroll register, GL',auto:true},
 {id:'C-05',process:'Payroll',risk:'Unauthorized changes to bank details',objective:'Bank detail changes dual-approved',assertion:'R&O',freq:'Per change',owner:'CFO',status:'pass',tested:'12 Jul 2026',evidence:'2 changes this month, both dual-approved',auto:true},
 {id:'C-06',process:'Cash Management',risk:'Misappropriation of cash',objective:'All cash accounts reconciled continuously',assertion:'C',freq:'Continuous',owner:'Treasury Agent',status:'pass',tested:'28 Jul 2026',evidence:'3/3 accounts reconciled; 93% auto-match',auto:true},
 {id:'C-07',process:'Cash Management',risk:'Payments to unverified accounts',objective:'Payee bank accounts verified before first payment',assertion:'E/O',freq:'Per payee',owner:'Treasury Agent',status:'pass',tested:'22 Jul 2026',evidence:'1 new payee verified via micro-deposit',auto:true},
 {id:'C-08',process:'Revenue',risk:'Revenue recorded in wrong period',objective:'Revenue recognized per contract schedule',assertion:'C',freq:'Monthly',owner:'Controller',status:'pass',tested:'28 Jul 2026',evidence:'All Jul invoices tie to contract billing dates',auto:true},
 {id:'C-09',process:'Revenue',risk:'Unrecorded credit notes',objective:'Credit notes approved and complete',assertion:'C',freq:'Per transaction',owner:'Controller',status:'pass',tested:'25 Jul 2026',evidence:'0 credit notes issued in July',auto:true},
 {id:'C-10',process:'Financial Reporting',risk:'Journal entries misstated or unauthorized',objective:'All manual JEs reviewed by a second person',assertion:'V&A',freq:'Per entry',owner:'Controller',status:'pass',tested:'28 Jul 2026',evidence:'4 manual JEs, all dual-reviewed',auto:true},
 {id:'C-11',process:'Financial Reporting',risk:'Intercompany balances don’t eliminate',objective:'IC balances confirmed and eliminated monthly',assertion:'V&A',freq:'Monthly',owner:'Controller Agent',status:'pass',tested:'28 Jul 2026',evidence:'CA↔IN, CA↔US matched to 0.00 difference',auto:true},
 {id:'C-12',process:'Financial Reporting',risk:'Management review not performed',objective:'CFO reviews monthly reporting package',assertion:'P&D',freq:'Monthly',owner:'CFO',status:'pending',tested:'—',evidence:'Awaiting attestation for July',auto:false},
 {id:'C-13',process:'Tax',risk:'Sales tax under/over-collected',objective:'Tax codes applied per jurisdiction rules',assertion:'V&A',freq:'Continuous',owner:'Compliance Agent',status:'pass',tested:'28 Jul 2026',evidence:'100% of July invoices tax-coded; 0 overrides',auto:true},
 {id:'C-14',process:'IT / Access',risk:'Excessive access rights',objective:'Segregation of duties enforced in roles',assertion:'R&O',freq:'Quarterly',owner:'Internal Audit',status:'pass',tested:'15 Jul 2026',evidence:'SoD matrix: 0 conflicts across 14 users',auto:true},
 {id:'C-15',process:'IT / Access',risk:'Agent acts beyond mandate',objective:'Agent autonomy thresholds enforced & logged',assertion:'P&D',freq:'Continuous',owner:'Internal Audit',status:'pass',tested:'28 Jul 2026',evidence:'0 actions above threshold without human approval',auto:true}];
// ---------- agents ----------
export const AGENTS=[
 {name:'AP Agent',today:'Coded 43 bills · 39 auto-posted · 4 sent for review',icon:'AP'},
 {name:'AR/Collections Agent',today:'Matched 11 receipts · drafted 3 reminders (awaiting approval)',icon:'AR'},
 {name:'Treasury Agent',today:'Reconciled 96 bank lines · 4 exceptions flagged',icon:'TR'},
 {name:'Controller Agent',today:'Posted payroll & depreciation · close checklist 62% done',icon:'CO'},
 {name:'Audit Agent',today:'Collected 28 evidence items · linked to 13 controls',icon:'AU'},
 {name:'Compliance Agent',today:'Tax-coded 57 documents · 0 exceptions',icon:'CM'},
 {name:'Reporting/Analysis Agent',today:'Refreshed 6 reports · flagged 2 material variances',icon:'RE'}];
export const BANKS=[
 {acct:'1000',name:'Cash — Operating',bank:'RBC ····4417',feed:'Synced (bank feed)',lines:64,matched:60},
 {acct:'1010',name:'Cash — Payroll',bank:'RBC ····8802',feed:'Synced (bank feed)',lines:18,matched:17},
 {acct:'1020',name:'Cash — USD Account',bank:'BMO ····2210',feed:'Manual upload',lines:14,matched:12}];
export const REC_EXCEPTIONS=[
 {id:'R1',date:'2026-07-14',desc:'E-transfer in — "MERIDIAN JULY"',amt:1240.00,ask:'Looks like a Meridian Foods payment, but no open invoice matches the amount. Partial payment of INV-202607-100?',conf:76},
 {id:'R2',date:'2026-07-19',desc:'Wire out — FX fee',amt:-42.50,ask:'Propose coding to 6950 Bank Charges (matches 6 prior FX fees).',conf:92},
 {id:'R3',date:'2026-07-22',desc:'Deposit — unidentified',amt:3980.00,ask:'No matching invoice or customer reference. Escalated to Controller.',conf:41},
 {id:'R4',date:'2026-07-25',desc:'Pre-authorized debit — SUNLIFE',amt:-1207.50,ask:'Matches bill SL-4471 (approved, unpaid). Mark as paid?',conf:97}];
export const AR_ROWS=[
 {cust:'Meridian Foods Group',inv:'INV-202607-100',date:'2026-07-02',due:'2026-08-01',amt:32760,status:'Partially paid',age:'Current'},
 {cust:'TrueNorth Mining Ltd',inv:'INV-202607-101',date:'2026-07-07',due:'2026-08-06',amt:28430,status:'Open',age:'Current'},
 {cust:'Lakeside Pulp & Paper',inv:'INV-202606-102',date:'2026-06-12',due:'2026-07-12',amt:19980,status:'Overdue',age:'1–30'},
 {cust:'Harbourline Logistics',inv:'INV-202607-103',date:'2026-07-17',due:'2026-08-16',amt:24150,status:'Open',age:'Current'},
 {cust:'Prairie AgCo',inv:'INV-202605-098',date:'2026-05-20',due:'2026-06-19',amt:8890,status:'Overdue',age:'31–60'},
 {cust:'Meridian Foods Group',inv:'INV-202606-097',date:'2026-06-02',due:'2026-07-02',amt:31210,status:'Paid',age:'—'}];
export const COLLECTION_DRAFTS=[
 {cust:'Lakeside Pulp & Paper',inv:'INV-202606-102',days:16,tone:'Friendly reminder',preview:'Hi Dana — just a gentle nudge that invoice INV-202606-102 for $19,980 was due on 12 Jul. Could you let us know when we can expect payment? Happy to resend the invoice.'},
 {cust:'Prairie AgCo',inv:'INV-202605-098',days:39,tone:'Second notice',preview:'Hello Marc — invoice INV-202605-098 for $8,890 is now 39 days past due. We’d appreciate payment this week, or a quick call if something’s holding it up.'}];
export const PERSONAS=['Controller','CFO','CEO','Internal Auditor','External Auditor','Junior Accountant'];
export const TRACE=[
 {step:'Contract',label:'MSA + Order Form — Meridian Foods Group',detail:'Signed 14 Jan 2026 · $32,760/mo platform subscription · DocuSign envelope 4F2A',date:'2026-01-14'},
 {step:'Invoice',label:'INV-202607-100 · 32,760 CAD + GST',detail:'Generated by AR Agent from contract schedule · 2 Jul 2026',date:'2026-07-02'},
 {step:'Approval',label:'Approved by S. Patel (Controller)',detail:'Reviewed against contract · approved 2 Jul 2026, 09:41',date:'2026-07-02'},
 {step:'Journal entry',label:'DR 1100 34,398 / CR 4000 32,760 / CR 2100 1,638',detail:'Posted automatically on approval · audit entry #A-1042',date:'2026-07-02'},
 {step:'Payment',label:'Partial receipt 1,240 CAD · 14 Jul 2026',detail:'Bank feed line auto-matched (76% — confirmed by human) · balance open',date:'2026-07-14'},
 {step:'Confirmation',label:'Third-party confirmation — sent',detail:'Balance confirmation emailed to Meridian AP 20 Jul · awaiting response',date:'2026-07-20'}];
// ==================== AI-NATIVE MODE DATA ====================
// Agent activity feed. rel = minutes before "now" at page load; the liveness
// ticker reveals items with rel<0 one per tick as "just now".
export const AI_FEED=[
 {agent:'AP Agent',icon:'AP',verb:'Auto-posted',obj:'Bell Canada #1263 · 1,304.10 CAD',detail:'98% · policy P-1 · matches 14 prior bills',rel:184,hash:true},
 {agent:'Treasury Agent',icon:'TR',verb:'Reconciled',obj:'RBC operating feed · 12 lines',detail:'all matched on reference + amount',rel:162,hash:true},
 {agent:'AP Agent',icon:'AP',verb:'Blocked duplicate',obj:'Bell Canada #1245 (re-entry attempt)',detail:'policy P-6 · original posted 12 Jun',rel:141,hash:true},
 {agent:'Controller Agent',icon:'CO',verb:'Posted',obj:'Monthly depreciation · 2,100 CAD',detail:'straight-line schedule, no additions',rel:120,hash:true},
 {agent:'AR/Collections Agent',icon:'AR',verb:'Drafted',obj:'reminder — Lakeside Pulp & Paper',detail:'16 days late · awaiting your wording approval',rel:96,hash:false},
 {agent:'Compliance Agent',icon:'CM',verb:'Tax-coded',obj:'9 documents',detail:'GST 5% · 0 overrides',rel:74,hash:true},
 {agent:'Treasury Agent',icon:'TR',verb:'Flagged',obj:'e-transfer 1,240 — "MERIDIAN JULY"',detail:'76% match to INV-202607-100 · routed to you',rel:58,hash:true},
 {agent:'AP Agent',icon:'AP',verb:'Escalated',obj:'Delta Freight DF-0042 · 3,980 CAD',detail:'no PO, no prior pattern · policy P-4 · has a question',rel:41,hash:true},
 {agent:'Audit Agent',icon:'AU',verb:'Linked evidence',obj:'6 items → controls C-01, C-06, C-13',detail:'auto-collected from today’s postings',rel:29,hash:true},
 {agent:'Controller Agent',icon:'CO',verb:'Advanced close',obj:'Subledger stream 58% → 62%',detail:'AP queue cleared except 3 review items',rel:12,hash:true},
 {agent:'Treasury Agent',icon:'TR',verb:'Re-ran',obj:'13-week cash forecast',detail:'trough unchanged · covenant headroom 1.9×',rel:-1,hash:true},
 {agent:'Compliance Agent',icon:'CM',verb:'Verified',obj:'sales-tax coding on 4 new bills',detail:'0 exceptions',rel:-2,hash:true},
 {agent:'AR/Collections Agent',icon:'AR',verb:'Matched',obj:'TrueNorth receipt 26,724 CAD',detail:'reference on remittance · 99%',rel:-3,hash:true},
 {agent:'Audit Agent',icon:'AU',verb:'Ran hash-chain check',obj:'1,412 entries',detail:'chain intact ✓',rel:-4,hash:true},
 {agent:'AP Agent',icon:'AP',verb:'Coded',obj:'Staples Business ST-31002 · 214.60 CAD',detail:'96% · queued to auto-post',rel:-5,hash:true},
 {agent:'Controller Agent',icon:'CO',verb:'Drafted',obj:'July accrual journals (3)',detail:'ready for your review tonight',rel:-6,hash:false}];
// Unified human decision queue. srcKind/srcId write to the same done-lists Classic uses.
export const AI_DECISIONS=[
 {id:'D1',srcKind:'ap',srcId:'B12',conf:64,title:'Delta Freight DF-0042 · 3,980 CAD',agent:'AP Agent',
  ask:'No PO and the line items don’t match any prior pattern. Is this project freight or an office-move cost?',
  policy:'P-4 — Any bill with no PO and no prior vendor pattern comes to a human.',
  options:[{key:'5100',label:'5100 · Project freight — Meridian Deploy'},{key:'6700',label:'6700 · Office move'}],
  evidence:['Bill of lading references "Meridian site, Hamilton" — matches the Meridian Deploy project address','Delivery window matches contractor mobilisation (bill MS-1188)','No office-move ticket found in the period'],
  recommend:'I’d code this to 5100 Implementation Labour — project freight for Meridian Deploy. The lading reference matches the project site. 64% confident, so it’s your call.',
  impact:'Approving adds CAD 3,980 to Meridian Deploy project cost and clears the last AP escalation blocking the subledger close stream.',
  learn:{rule:'R-017',text:'Delta Freight Services + project reference on lading → 5100 Implementation Labour, project Meridian Deploy.'}},
 {id:'D2',srcKind:'ap',srcId:'B09',conf:88,title:'Maple Systems MS-1188 · 7,770 CAD',agent:'AP Agent',
  ask:'Contractor hours are 22% above June. 3-way match: PO ✓ · receipt ✓ · price +22%.',
  policy:'P-3 — PO-backed bills with a price variance above 10% need a human (control C-03).',
  options:null,
  evidence:['PO-2214 rate unchanged — the variance is hours, not rate','Site log: 41 extra contractor hours w/c 14 Jul on Meridian Deploy','Project manager note: rollout running ahead of schedule'],
  recommend:'The hours are real and tie to the site log — timing, not leakage. I’d approve and expect August to come in under plan.',
  impact:'Approving clears control exception C-03 and unblocks the subledger close stream.'},
 {id:'D3',srcKind:'rec',srcId:'R1',conf:76,title:'Unmatched receipt · 1,240 CAD — "MERIDIAN JULY"',agent:'Treasury Agent',
  ask:'Looks like a Meridian Foods payment, but no open invoice matches the amount. Partial payment of INV-202607-100?',
  policy:'P-5 — Cash applications below 90% match confidence need a human.',
  options:null,
  evidence:['Sender account matches Meridian Foods’ registered bank details','INV-202607-100 (32,760 CAD) is open; 1,240 matches no line','Meridian AP contact emailed 13 Jul about a "first instalment"'],
  recommend:'Apply as a partial payment against INV-202607-100 and let collections follow up on the balance.',
  impact:'Applying clears the oldest reconciliation exception; AR aging updates and the bank-rec stream moves to 95%.'}];
// The learned-rule follow-up bill that arrives after the DF-0042 decision.
export const AI_FOLLOWUP={id:'D4',srcKind:'ap',srcId:'B13',conf:96,title:'Delta Freight DF-0057 · 2,140 CAD',agent:'AP Agent',
 ask:null,auto:true,rule:'R-017',
 note:'Coded 5100 · Meridian Deploy — applied rule R-017, learned from your decision on 28 Jul.'};
// Continuous-close workstreams.
export const CLOSE_TASKS=[
 {key:'sub',label:'Subledgers',agent:'AP',pct:78,blocker:'MS-1188 price variance awaiting decision',blockId:'D2'},
 {key:'rec',label:'Bank rec',agent:'TR',pct:93,blocker:'Unidentified 3,980 deposit escalated',blockId:null},
 {key:'pay',label:'Payroll',agent:'CO',pct:100,blocker:null,blockId:null},
 {key:'acc',label:'Accruals',agent:'CO',pct:40,blocker:null,blockId:null,note:'drafting tonight'},
 {key:'ic',label:'Intercompany',agent:'CO',pct:100,blocker:null,blockId:null,note:'CA↔IN, CA↔US matched to 0.00'},
 {key:'rev',label:'Review & attest',agent:'AU',pct:35,blocker:'CFO attestation C-12 pending',blockId:null}];
// Plain-English policy constitution the agents obey.
export const POLICIES=[
 {id:'P-1',group:'Autonomy',text:'Post bills automatically above 95% confidence — always logged, never silent.',ctl:'C-01',fired:'39 auto-posts this month',editable:true},
 {id:'P-2',group:'Autonomy',text:'Below 80% confidence, stop and ask a human a specific question.',ctl:'C-15',fired:'1 escalation (Delta Freight DF-0042)'},
 {id:'P-3',group:'Approvals',text:'PO-backed bills with a price variance above 10% need a human.',ctl:'C-03',fired:'1 held (MS-1188, +22%)'},
 {id:'P-4',group:'Approvals',text:'Any bill with no PO and no prior vendor pattern comes to a human.',ctl:'C-02',fired:'Delta Freight escalated under this rule, 22 Jul 14:03'},
 {id:'P-5',group:'Approvals',text:'Payments above CAD 10,000, new vendor bank details, and anything sent to a customer always need a human.',ctl:'C-05',fired:'2 bank-detail changes dual-approved'},
 {id:'P-6',group:'Controls',text:'Never post the same invoice number twice for a vendor.',ctl:'C-01',fired:'3 duplicates blocked, incl. Bell #1245'},
 {id:'P-7',group:'Controls',text:'Every cash account reconciles continuously; unexplained items over CAD 1,000 escalate same-day.',ctl:'C-06',fired:'2 items escalated this month'},
 {id:'P-8',group:'Controls',text:'Agents never act outside this document. Changes to it are themselves logged immutably.',ctl:'C-15',fired:'0 out-of-mandate actions ever'}];
// Firm memory: learned rules ledger.
export const RULES=[
 {id:'R-016',text:'Second AWS invoice in a month → check for new sub-account before posting.',src:'Learned from your question, 21 Jul 2026',applied:1},
 {id:'R-014',text:'Harbour Print Co. → 6800 Marketing & Printing, dept Sales.',src:'Learned from S. Patel’s edit, 14 Jul 2026',applied:3},
 {id:'R-012',text:'Gusto invoices are software fees, not payroll cost.',src:'Learned from your correction, 30 Jun 2026',applied:2},
 {id:'R-009',text:'Bell one-time installs below the cap threshold stay in 6400 Telephone.',src:'Learned from the #1245 review, 12 Jun 2026',applied:2},
 {id:'R-007',text:'Meridian remittances may arrive as instalments — match partials to the oldest open invoice.',src:'Learned from Treasury exception, May 2026',applied:4},
 {id:'R-004',text:'Contractor bills tagged to a project site code → that project’s 5100, not overhead.',src:'Learned from month-end reclass, Apr 2026',applied:11},
 {id:'R-002',text:'DLF Cyber City rent is fixed — any variance means a service charge line, split it out.',src:'Learned from A. Sharma’s edit, Mar 2026',applied:5}];
export const MEMORY_STATS={rules:47,accuracy:96.2,accuracyStart:81,exceptionsNow:9,exceptionsStart:31,months:14,
 trend:[['Feb',81],['Mar',85],['Apr',88.5],['May',91],['Jun',94],['Jul',96.2]],
 exTrend:[['Feb',31],['Mar',26],['Apr',21],['May',16],['Jun',12],['Jul',9]],
 reflections:[
  {icon:'AP',name:'AP Agent',text:'I no longer need review for recurring Sun Life premiums — 6 straight approvals.'},
  {icon:'TR',name:'Treasury Agent',text:'Meridian pays in instalments; I now check partials against their oldest invoice first.'},
  {icon:'CO',name:'Controller Agent',text:'I mis-grouped the June accrual reversals once; I now post them as a single batch with one reference.'}]};
// Anonymized network benchmarks.
export const BENCHMARKS=[
 {label:'Close speed',you:3.1,youLabel:'3.1 days',median:5.4,medianLabel:'5.4 days',lo:2.2,hi:9,better:'low',driver:'Your close is faster because 91% of reconciliations auto-match.'},
 {label:'DSO (days sales outstanding)',you:34,youLabel:'34 days',median:41,medianLabel:'41 days',lo:24,hi:62,better:'low',driver:'Reminders go out the day an invoice turns overdue — network median is day 9.'},
 {label:'Duplicates caught pre-payment',you:3,youLabel:'3 this month',median:1,medianLabel:'1',lo:0,hi:5,better:'high',driver:'2 of 3 were caught by a pattern first seen at other Dovetail companies.'}];
// WhatsApp approval replay for bill B07 (Bell #1245).
export const WHATSAPP_THREAD=[
 {who:'dv',text:'Bill from Bell Canada · #1245 · 651.00 CAD\nOne-time phone-system install · coded 6400 Telephone · 96%\nApprove?',time:'3 Jul, 08:09',buttons:['✓ Approve','Hold']},
 {who:'user',text:'✓ Approve',time:'3 Jul, 08:12'},
 {who:'dv',text:'Approved — payment scheduled for today’s run.',time:'3 Jul, 08:12'},
 {who:'dv',text:'Bank confirmation received — bill marked Paid ✓',time:'3 Jul, 16:40'},
 {who:'receipt',text:'Receipt #A-1067 written to trust ledger',time:'3 Jul, 16:40'}];
// Sandbox simulation: delay Maple Systems payment two weeks.
export const SIM_MAPLE={
 title:'Simulation — delay Maple Systems payment (7,770 CAD) by two weeks',
 steps:['Reading vendor terms — MS-1188, net 30, 2% early-pay discount','Rebuilding the 13-week cash curve in a sandbox','Checking loan covenant — current ratio ≥ 1.25×','Weighing discount loss vs cash benefit'],
 curve:[{label:'Wk 1',now:512,sim:512},{label:'Wk 2',now:498,sim:506},{label:'Wk 3',now:495,sim:495},{label:'Wk 4',now:507,sim:507}],
 findings:[['Cash trough (wk 2)','improves by 7.8k CAD'],['Covenant — current ratio','2.4× either way — no risk'],['Early-pay discount lost','−155 CAD'],['Vendor relationship','terms allow net 30 — no breach']],
 verdict:'Recommend paying on time: the discount is worth more than the cash benefit, and the covenant has ample headroom either way. This ran in a sandbox — the ledger was not touched.'};
