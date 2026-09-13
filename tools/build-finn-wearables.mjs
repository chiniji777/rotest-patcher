import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
import {validateWearable} from './finn-wearables.mjs';
import {appendCardDropEffects} from './card-drop-effects.mjs';
const root=process.argv[2];if(!root)throw Error('ROTest root required');
const repo=path.resolve(import.meta.dirname,'..'),out=path.join(repo,'artifacts/finn-wearables');fs.mkdirSync(out,{recursive:true});
const recipes=JSON.parse(fs.readFileSync(path.join(repo,'server/finn-wearables-recipes.json'))),raw=fs.readFileSync(path.join(root,'finn-reference/itemInfo_true.lub'));
if(crypto.createHash('sha256').update(raw).digest('hex')!==recipes.sourceSha256)throw Error('FINN reference changed; review required');
const report=JSON.parse(fs.readFileSync(path.join(root,'finn-reference/report/FINN-item-inventory.json')));
if(report.sha256!==recipes.sourceSha256)throw Error('catalog source hash mismatch');
const text=raw.toString('latin1'),entries=[...text.matchAll(/^\s*\[(\d+)\]\s*=\s*\{/gm)],metadata=new Map();
for(let k=0;k<entries.length;k++){
 const id=+entries[k][1];if(!recipes.items.some(i=>i.id===id))continue;
 const block=text.slice(entries[k].index,entries[k+1]?.index??text.length),resource=block.match(/\bidentifiedResourceName\s*=\s*"([^"\r\n]*)"/),view=Number(block.match(/\bClassNum\s*=\s*(\d+)/)?.[1]);
 if(!resource||!Number.isInteger(view))throw Error('source visual metadata unavailable '+id);
 metadata.set(id,{...report.items.find(i=>i.id===id),resourceHex:Buffer.from(resource[1],'latin1').toString('hex'),view});
}
const client=new Map(execFileSync(path.join(root,'client-tools/lua-5.1.5/src/lua'),[path.join(repo,'tools/client-resource-index.lua'),path.join(repo,'artifacts/test-shops/iteminfo.lua')],{encoding:'utf8'}).trim().split('\n').map(line=>{const [id,view,resourceHex]=line.split('\t');return [+id,{view:+view,resourceHex}];}));
const serverIds=new Set();for(const f of fs.readdirSync(path.join(root,'finn-reference/standard-pre-re')).filter(f=>/^item_db_.*\.yml$/.test(f)))for(const m of fs.readFileSync(path.join(root,'finn-reference/standard-pre-re',f),'utf8').matchAll(/^  - Id: (\d+)/gm))serverIds.add(+m[1]);
const baseDb=fs.readFileSync(path.join(repo,'artifacts/test-shops/item_db.yml'),'utf8');for(const m of baseDb.matchAll(/^  - Id: (\d+)/gm))serverIds.add(+m[1]);
const constants=fs.readFileSync(path.join(root,'finn-reference/script_constants.hpp'),'utf8'),bonuses=new Set([...constants.matchAll(/export_constant2\(\s*"(b[A-Za-z0-9_]+)"/g)].map(m=>m[1]));
const skills=new Set([...fs.readFileSync(path.join(root,'finn-reference/skill_db.yml'),'utf8').matchAll(/^    Name: (\S+)/gm)].map(m=>m[1]));
if(bonuses.size<100||skills.size<100)throw Error('engine symbol index incomplete');
const seen=new Set(),items=recipes.items.map(r=>{if(seen.has(r.id))throw Error('duplicate recipe');seen.add(r.id);return validateWearable(r,metadata.get(r.id),{serverIds,client,bonuses,skills});});
const database=[baseDb],clientPatch=[];
for(const i of items){
 database.push(`  - Id: ${i.id}`,`    AegisName: RT_FINN_${i.id}`,`    Name: ${JSON.stringify(i.name)}`,'    Type: Armor','    Buy: 1000','    Sell: 0',`    Weight: ${i.weight}`,`    Defense: ${i.defense}`,`    Slots: ${i.slots}`,'    Jobs:',...i.jobs.map(j=>`      ${j}: true`),'    Locations:',`      ${i.location}: true`,`    EquipLevelMin: ${i.level}`,`    Refineable: ${i.refine}`,`    View: ${i.view}`,'    Script: |',`      ${i.script}`);
 const source=metadata.get(i.id),desc=['^FF8800FINN ทดสอบ - จำลองตามคำอธิบาย^000000',...source.description,'^FF8800ยังไม่ยืนยันดาเมจตรง FINN จริง^000000','ใช้กติกาตีบวกและคลาสต่อยอดของ ROTest'];
 const name='[FINN Test] '+i.name;
 clientPatch.push(`tbl[${i.id}]={identifiedDisplayName=${JSON.stringify(name)},unidentifiedDisplayName=${JSON.stringify(name)},identifiedResourceName=tbl[${i.template}].identifiedResourceName,unidentifiedResourceName=tbl[${i.template}].identifiedResourceName,identifiedDescriptionName={${desc.map(d=>JSON.stringify(d)).join(',')}},unidentifiedDescriptionName={"FINN Test equipment"},slotCount=${i.slots},ClassNum=${i.view},costume=false}`);
}
const groups=[['หมวก',items.filter(i=>i.location.startsWith('Head_'))],['รองเท้า',items.filter(i=>i.location==='Shoes')],['เครื่องประดับ',items.filter(i=>i.location==='Both_Accessory')]];
const npc=['morocc,166,100,4\tscript\tร้าน FINN ทดสอบ#RT_FINN\t99,{','\tmes "[อุปกรณ์ FINN ฉบับทดสอบ]";',`\tmes "มี ${items.length} ชิ้น จำลองจากค่าที่ระบุชัดในไฟล์เกม";`,'\tmes "ยังไม่รับรองว่าดาเมจตรงเซิร์ฟเวอร์ FINN จริง";','\tmes "ชิ้นละ 1,000 Zeny ไม่ใช้เงินจริง";','\tmes "ของที่โอกาสออกสกิลหรือสูตรไม่ครบ ยังไม่เปิดขาย";','\t.@choice=select("หมวก:รองเท้า:เครื่องประดับ:ยกเลิก");','\tif (.@choice==4) close;','\tclose2;','\tcallshop "RT_FINN_"+(.@choice-1),1;','\tend;','OnInit:','\tif (!checkcell("morocc",166,100,CELL_CHKPASS)) debugmes "ROTEST_FINN BAD_CELL";',`\tdebugmes "ROTEST_FINN items=${items.length}";`,'\tend;','}',...groups.map(([label,rows],index)=>`-\tshop\tRT_FINN_${index}\t-1,${rows.map(i=>i.id+':1000').join(',')}`)];
const cardSource=JSON.parse(execFileSync('ruby',['-rjson','-ryaml','-e','puts JSON.generate(YAML.safe_load(File.read(ARGV[0]))["Body"])',path.join(root,'finn-reference/standard-pre-re/item_db_etc.yml')],{encoding:'utf8',maxBuffer:16000000}));
fs.writeFileSync(path.join(out,'item_db.yml'),appendCardDropEffects(database.join('\n')+'\n',cardSource));fs.writeFileSync(path.join(out,'finn-wearables.utf8.txt'),npc.join('\n')+'\n');fs.writeFileSync(path.join(out,'finn-wearables.txt'),execFileSync('iconv',['-f','UTF-8','-t','CP874'],{input:npc.join('\n')+'\n'}));
fs.writeFileSync(path.join(out,'iteminfo.lua'),Buffer.concat([fs.readFileSync(path.join(repo,'artifacts/test-shops/iteminfo.lua')),execFileSync('iconv',['-f','UTF-8','-t','CP874'],{input:'\n'+clientPatch.join('\n')+'\n'})]));
fs.writeFileSync(path.join(out,'ready.json'),JSON.stringify({items,held:recipes.held,sourceSha256:recipes.sourceSha256},null,2));console.log(JSON.stringify({items:items.length,held:recipes.held.length,output:out}));
