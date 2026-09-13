export function appendCardDropEffects(base,items){
 const cards=items.filter(i=>i.Type==='Card');
 if(!cards.length)throw Error('no cards in source database');
 const seen=new Set([...base.matchAll(/^  - Id: (\d+)/gm)].map(m=>Number(m[1])));
 const entries=cards.map(i=>{
  if(!Number.isSafeInteger(i.Id)||i.Id<=0||seen.has(i.Id))throw Error('invalid or duplicate card ID');
  seen.add(i.Id);
  return `  - Id: ${i.Id}\n    Flags:\n      DropEffect: PURPLE_PILLAR\n`;
 });
 return base+(base.endsWith('\n')?'':'\n')+entries.join('');
}
