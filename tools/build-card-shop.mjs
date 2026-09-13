import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {classifyCard} from './card-catalog.mjs';import {equipmentShopPrice} from './equipment-catalog.mjs';
const root=process.argv[2];if(!root)throw Error('ROTest root required');const repo=path.resolve(import.meta.dirname,'..'),out=path.join(repo,'artifacts/card-shop');fs.mkdirSync(out,{recursive:true});
function yaml(file){return JSON.parse(execFileSync('ruby',['-rjson','-ryaml','-e','puts JSON.generate(YAML.safe_load(File.read(ARGV[0]))["Body"])',file],{encoding:'utf8',maxBuffer:16000000}));}
const items=yaml(path.join(root,'finn-reference/standard-pre-re/item_db_etc.yml')).filter(i=>i.Type==='Card'),mobs=yaml(path.join(root,'finn-reference/standard-pre-re/mob_db.yml'));
const client=new Set(execFileSync(path.join(root,'client-tools/lua-5.1.5/src/lua'),[path.join(repo,'tools/client-item-index.lua'),path.join(repo,'artifacts/finn-wearables/iteminfo.lua')],{encoding:'utf8'}).trim().split(/\s+/).map(Number));
const missing=items.filter(i=>!client.has(i.Id)),ready=items.filter(i=>client.has(i.Id)),types=[['normal','มอนสเตอร์ทั่วไป'],['mini','มินิบอส'],['mvp','MVP'],['special','พิเศษ / ไม่มีแหล่งดรอปชัดเจน']];
const groups=types.map(([key,label])=>{const rows=ready.filter(i=>classifyCard(i,mobs)===key).sort((a,b)=>a.Id-b.Id);return {key,label,items:rows,pages:Array.from({length:Math.ceil(rows.length/50)},(_,n)=>rows.slice(n*50,n*50+50))};}).filter(g=>g.items.length);
const npc=['morocc,169,100,4\tscript\tร้านการ์ด#RT_CardsAll\t101,{','\tmes "[ร้านการ์ดทดสอบ]";',`\tmes "มี ${ready.length} ใบ รวมมอนสเตอร์ทั่วไป มินิบอส และ MVP";`,'\tmes "จัดประเภทจากมอนสเตอร์ต้นทางในฐาน ROTest";','\tmes "ใช้เอฟเฟกต์เดิม ไม่รับรองว่าตรงการ์ดที่ FINN ปรับแต่ง";',`\t.@group=select("${groups.map(g=>g.label+' ('+g.items.length+')').join(':')}:ยกเลิก")-1;`,`\tif (.@group>=${groups.length}) close;`,'\tswitch (.@group) {'];
for(const [i,g]of groups.entries()){
 npc.push(`\tcase ${i}:`);
 if(g.pages.length===1)npc.push('\t\t.@page=0;');else npc.push(`\t\t.@page=select("${g.pages.map((p,n)=>'หน้า '+(n+1)+' (ID '+p[0].Id+'-'+p.at(-1).Id+')').join(':')}:ยกเลิก")-1;`,`\t\tif (.@page>=${g.pages.length}) close;`);
 npc.push('\t\tclose2;',`\t\tcallshop "RT_CA_${i}_"+.@page,1;`,'\t\tend;');
}
npc.push('\t}','\tclose;','OnInit:','\tif (!checkcell("morocc",169,100,CELL_CHKPASS)) debugmes "ROTEST_CARDS BAD_CELL";',`\tdebugmes "ROTEST_CARDS count=${ready.length}";`,'\tend;','}');
for(const [i,g]of groups.entries())for(const [n,rows]of g.pages.entries())npc.push(`-\tshop\tRT_CA_${i}_${n}\t-1,${rows.map(r=>r.Id+':'+equipmentShopPrice(r)).join(',')}`);
fs.writeFileSync(path.join(out,'card-shop.utf8.txt'),npc.join('\n')+'\n');fs.writeFileSync(path.join(out,'card-shop.txt'),execFileSync('iconv',['-f','UTF-8','-t','CP874'],{input:npc.join('\n')+'\n'}));fs.writeFileSync(path.join(out,'card-catalog.json'),JSON.stringify({groups:groups.map(g=>({categoryId:g.key,label:g.label,items:g.items.map(i=>({id:i.Id,name:i.Name}))})),missingClient:missing.map(i=>({id:i.Id,name:i.Name}))},null,2));
console.log(JSON.stringify({ready:ready.length,groups:groups.map(g=>({type:g.key,count:g.items.length,pages:g.pages.length})),missingClient:missing.map(i=>({id:i.Id,name:i.Name})),output:out}));
