import zlib from 'node:zlib';
export function buildGrf(resources){
 if(!resources.length||resources.length>1000)throw Error('invalid resource count');
 const data=[],entries=[],seen=new Set();let offset=0;
 for(const r of resources){
  const name=r.name.toString('latin1'),key=name.replace(/[A-Z]/g,c=>c.toLowerCase());
  if(r.name.length>250||!name.startsWith('data\\')||!name.endsWith('.bmp')||/[\0/:]/.test(name)||name.split('\\').some(p=>!p||p==='..'||p==='.')||seen.has(key))throw Error('unsafe or duplicate resource path');
  if(!Buffer.isBuffer(r.data)||!r.data.length||r.data.length>16*1024*1024)throw Error('invalid resource bytes');seen.add(key);
  const compressed=zlib.deflateSync(r.data),entry=Buffer.alloc(17);entry.writeUInt32LE(compressed.length,0);entry.writeUInt32LE(compressed.length,4);entry.writeUInt32LE(r.data.length,8);entry[12]=1;entry.writeUInt32LE(offset,13);entries.push(r.name,Buffer.from([0]),entry);data.push(compressed);offset+=compressed.length;
  if(offset>64*1024*1024)throw Error('archive limit');
 }
 const table=Buffer.concat(entries),packed=zlib.deflateSync(table),tableSize=Buffer.alloc(8);tableSize.writeUInt32LE(packed.length,0);tableSize.writeUInt32LE(table.length,4);
 const header=Buffer.alloc(46);header.write('Master of Magic\0');header.writeUInt32LE(offset,30);header.writeUInt32LE(resources.length+7,38);header.writeUInt32LE(512,42);
 return Buffer.concat([header,...data,tableSize,packed]);
}
