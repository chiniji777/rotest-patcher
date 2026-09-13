const weapons={'1hSword':'ดาบมือเดียว','2hSword':'ดาบสองมือ',Dagger:'มีด',Katar:'กาตาร์','1hAxe':'ขวานมือเดียว','2hAxe':'ขวานสองมือ','1hSpear':'หอกมือเดียว','2hSpear':'หอกสองมือ',Staff:'คทามือเดียว','2hStaff':'คทาสองมือ',Mace:'กระบอง',Book:'หนังสือ',Bow:'ธนู',Knuckle:'สนับมือ',Musical:'เครื่องดนตรี',Whip:'แส้',Revolver:'ปืนพก',Rifle:'ไรเฟิล',Shotgun:'ลูกซอง',Gatling:'ปืนกล',Grenade:'เครื่องยิงระเบิด',Huuma:'ดาวกระจาย'};
const armor={Left_Hand:['shield','โล่'],Head_Top:['head_top','หมวกบน'],Head_Mid:['head_mid','หมวกกลาง'],Head_Low:['head_low','หมวกล่าง'],Armor:['armor','เกราะ'],Shoes:['shoes','รองเท้า'],Garment:['garment','ผ้าคลุม'],Both_Accessory:['accessory','เครื่องประดับ']};
export function equipmentShopPrice(item){return (item.Buy??((item.Sell??0)*2))===0?100:-1;}
export function buildEquipmentCatalog(items,clientIds){
 const grouped=new Map(),seen=new Set(),missingClient=[],excluded=[];
 for(const item of [...items].sort((a,b)=>a.Id-b.Id)){
  if(!Number.isSafeInteger(item.Id)||item.Id<1)throw Error('invalid item id');if(seen.has(item.Id))throw Error('duplicate item id '+item.Id);seen.add(item.Id);
  if(!['Weapon','Armor','Petarmor'].includes(item.Type)){excluded.push(item);continue;}
  let key,label,family;
  if(item.Type==='Weapon'){if(!weapons[item.SubType])throw Error('unsupported weapon '+item.Id);key='weapon_'+item.SubType;label=weapons[item.SubType];family='weapon';}
  else if(item.Type==='Petarmor'){key='pet';label='อุปกรณ์สัตว์เลี้ยง';family='pet';}
  else {
   const locations=Object.keys(item.Locations??{}).filter(k=>item.Locations[k]===true);
   if(locations.length&&locations.every(k=>k.startsWith('Costume_'))){key='costume';label='คอสตูม';family='costume';}
   else if(locations.length>1&&locations.every(k=>['Head_Top','Head_Mid','Head_Low'].includes(k))){key='head_multi';label='หมวกใช้หลายช่อง';family='armor';}
   else if(locations.length===1&&armor[locations[0]]){[key,label]=armor[locations[0]];family='armor';}
   else throw Error('unsupported armor locations '+item.Id);
  }
  if(!clientIds.has(item.Id)){missingClient.push(item);continue;}
  if(!grouped.has(key))grouped.set(key,{key,label,family,items:[]});grouped.get(key).items.push(item);
 }
 const groups=[...grouped.values()].map(g=>({...g,pages:Array.from({length:Math.ceil(g.items.length/50)},(_,i)=>g.items.slice(i*50,i*50+50))}));
 return {groups,missingClient,excluded};
}
