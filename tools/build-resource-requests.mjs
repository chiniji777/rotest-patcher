import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
const root=process.argv[2],repo=path.resolve(import.meta.dirname,'..');
const items=JSON.parse(fs.readFileSync(path.join(repo,'server/finn-wearables-recipes.json'))).items;
const index=new Map(execFileSync(path.join(root,'client-tools/lua-5.1.5/src/lua'),[path.join(repo,'tools/client-resource-index.lua'),path.join(repo,'artifacts/finn-wearables/iteminfo.lua')],{encoding:'utf8'}).trim().split('\n').map(l=>{const [id,view,resourceHex]=l.split('\t');return [+id,resourceHex];}));
const requests=items.flatMap(i=>['item','collection'].map(kind=>({id:i.id,kind,pathHex:Buffer.concat([Buffer.from('data\\texture\\À¯ÀúÀÎÅÍÆäÀÌ½º\\'+kind+'\\','latin1'),Buffer.from(index.get(i.id),'hex'),Buffer.from('.bmp')]).toString('hex')})));
fs.writeFileSync(path.join(repo,'artifacts/finn-wearables/resource-requests.json'),JSON.stringify(requests));console.log('Prepared '+requests.length+' exact resource checks');
