const contents={'Elunium':985,'Oridecon':984,'Poison Bottle':678,'Glistening Coat':7139,'Fire Bottle':7135,'Acid Bottle':7136,'Blue Potion':505,'Condensed White Potion':547,'Resist Fire':12118,'Resist Water':12119,'Resist Earth':12120,'Resist Wind':12121,'Elemental Fire':12114,'Elemental Water':12115,'Elemental Earth':12116,'Elemental Wind':12117,'Aloevera':606};
export function prepareItems(candidates,serverIds,clientIds){
 const ready=[],pending=[],seen=new Set();
 for(const item of candidates){
  if(!Number.isSafeInteger(item.id)||item.id<1||seen.has(item.id))throw Error('invalid or duplicate item id');seen.add(item.id);
  const match=item.name.match(/^(\d+) (.+) Box$/);let definition;
  if(match&&contents[match[2]]){
   const amount=Number(match[1]),content=contents[match[2]],text=item.description.join(' ').replaceAll('Eluniuims','Elunium');
   if(![10,50,100,150,300,500,1000].includes(amount)||!text.includes(amount+' '+match[2])){pending.push({id:item.id,name:item.name,reason:'contradictory or unsupported box contents'});continue;}
   if(!serverIds.has(content))throw Error('missing server content '+content);
   definition={id:item.id,name:item.name,kind:'box',content,amount,icon:603};
  }else if(item.id===32000&&item.name==='[PVP] HP Potion'&&item.description.some(s=>s.includes('325'))){definition={id:item.id,name:item.name,kind:'pvp-heal',hp:325,sp:0,icon:504};}
  else if(item.id===32001&&item.name==='[PVP] SP Potion'&&item.description.some(s=>s.includes('60'))){definition={id:item.id,name:item.name,kind:'pvp-heal',hp:0,sp:60,icon:505};}
  else {pending.push({id:item.id,name:item.name,reason:'server-specific effect or unsupported definition'});continue;}
  if(serverIds.has(item.id))throw Error('server item collision '+item.id);
  if(!clientIds.has(definition.icon))throw Error('missing client icon '+definition.icon);
  ready.push(definition);
 }
 return {ready,pending};
}
