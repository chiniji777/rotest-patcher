import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildEquipmentCatalog,equipmentShopPrice} from './equipment-catalog.mjs';
const root=process.argv[2];if(!root)throw Error('ROTest root required');
const repo=path.resolve(import.meta.dirname,'..'),out=path.join(repo,'artifacts/equipment-shop');fs.mkdirSync(out,{recursive:true});
const data=JSON.parse(execFileSync('ruby',['-rjson','-ryaml','-e','puts JSON.generate(YAML.safe_load(File.read(ARGV[0]))["Body"])',path.join(root,'finn-reference/standard-pre-re/item_db_equip.yml')],{encoding:'utf8',maxBuffer:8000000}));
const raw=execFileSync(path.join(root,'client-tools/lua-5.1.5/src/lua'),[path.join(repo,'tools/client-item-index.lua'),path.join(root,'cash-client/SystemEN/iteminfo.lua')],{encoding:'utf8'});
const clientIds=new Set(raw.trim().split(/\s+/).map(Number));if(clientIds.size<1000)throw Error('client catalog incomplete');
const result=buildEquipmentCatalog(data,clientIds),groups=result.groups,families=[['weapon','อาวุธ'],['armor','เกราะและของสวม'],['costume','คอสตูม'],['pet','อุปกรณ์สัตว์เลี้ยง']].filter(([key])=>groups.some(g=>g.family===key));
const total=groups.reduce((n,g)=>n+g.items.length,0);
const script=['morocc,163,100,4\tscript\tร้านอุปกรณ์#RT_Equip\t101,{','\tmes "[ร้านอุปกรณ์ทดสอบ]";',`\tmes "มี ${total} ชิ้น แยกประเภทและแบ่งหน้าละ 50 ชิ้น";`,'\tmes "ใช้ราคาเดิม ชิ้นที่ไม่มีราคาใช้ 100 Zeny";','\tmes "ข้อจำกัดอาชีพและเอฟเฟกต์เหมือนเดิม ไม่ใช่ชุด FINN ที่ยืนยันครบ";',`\t.@family=select("${families.map(f=>f[1]).join(':')}:ยกเลิก");`,`\tif (.@family>${families.length}) close;`,'\tswitch (.@family) {'];
for(const [i,[family]] of families.entries()){
 const selected=groups.map((g,index)=>({...g,index})).filter(g=>g.family===family);
 script.push(`\tcase ${i+1}:`,`\t\tsetarray .@groups[0],${selected.map(g=>g.index).join(',')};`,`\t\t.@choice=select("${selected.map(g=>g.label+' ('+g.items.length+')').join(':')}:ยกเลิก")-1;`,`\t\tif (.@choice>=${selected.length}) close;`,'\t\t.@group=.@groups[.@choice];','\t\tbreak;');
}
script.push('\t}','\tswitch (.@group) {');
for(const [index,g]of groups.entries()){
 script.push(`\tcase ${index}:`,`\t\tmes "${g.label}";`);
 if(g.pages.length===1)script.push('\t\t.@page=0;');
 else script.push(`\t\t.@page=select("${g.pages.map((p,i)=>'หน้า '+(i+1)+' (ID '+p[0].Id+'-'+p.at(-1).Id+')').join(':')}:ยกเลิก")-1;`,`\t\tif (.@page>=${g.pages.length}) close;`);
 script.push('\t\tclose2;',`\t\tcallshop "RT_EQ_${index}_"+.@page,1;`,'\t\tend;');
}
script.push('\t}','\tclose;','OnInit:','\tif (!checkcell("morocc",163,100,CELL_CHKPASS)) debugmes "ROTEST_EQUIPMENT BAD_CELL";',`\tdebugmes "ROTEST_EQUIPMENT items=${total} groups=${groups.length} pages=${groups.reduce((n,g)=>n+g.pages.length,0)}";`,'\tend;','}');
for(const [index,g]of groups.entries())for(const [page,items]of g.pages.entries())script.push(`-\tshop\tRT_EQ_${index}_${page}\t-1,${items.map(i=>i.Id+':'+equipmentShopPrice(i)).join(',')}`);
fs.writeFileSync(path.join(out,'equipment-shop.utf8.txt'),script.join('\n')+'\n');fs.writeFileSync(path.join(out,'equipment-shop.txt'),execFileSync('iconv',['-f','UTF-8','-t','CP874'],{input:script.join('\n')+'\n'}));
fs.writeFileSync(path.join(out,'equipment-catalog.json'),JSON.stringify({total,groups:groups.map(g=>({categoryId:g.key,label:g.label,family:g.family,pages:g.pages.map(p=>p.map(i=>({id:i.Id,name:i.Name,slots:i.Slots??0})))})),missingClient:result.missingClient.map(i=>({id:i.Id,name:i.Name})),excludedTypes:result.excluded.map(i=>({id:i.Id,type:i.Type}))},null,2));
console.log(JSON.stringify({total,groups:groups.length,pages:groups.reduce((n,g)=>n+g.pages.length,0),missingClient:result.missingClient.map(i=>({id:i.Id,name:i.Name})),excluded:result.excluded.length,output:out}));
