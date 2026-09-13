import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const [source,tag,sequenceText,keyFile]=process.argv.slice(2);
if(!source||!/^v\d+\.\d+\.\d+$/.test(tag||'')||!/^\d+$/.test(sequenceText||'')||!keyFile)throw Error('Usage: node tools/release.mjs <ro-test-rathena folder> <vX.Y.Z> <sequence> <private-key-path>');
const sequence=Number(sequenceText);if(!Number.isSafeInteger(sequence)||sequence<1)throw Error('Invalid sequence');
const repository=path.resolve(import.meta.dirname,'..');
const privateKey=fs.readFileSync(keyFile);
const expectedKey=fs.readFileSync(path.join(repository,'src/ROTest.Patcher.Windows/release-public.pem'),'utf8').trim();
if(crypto.createPublicKey(privateKey).export({type:'spki',format:'pem'}).toString().trim()!==expectedKey)throw Error('Signing key does not match the embedded public verifier');
const assets=[
 ['data/clientinfo.xml','thai-client/data/clientinfo.xml'],
 ['data/sclientinfo.xml','thai-client/data/sclientinfo.xml'],
 ['data/luafiles514/lua files/skillinfoz/skillinfo_f.lub','client-2021-overlay/data/luafiles514/lua files/skillinfoz/skillinfo_f.lub'],
 ['opensetupl.exe','client-tools/opensetup/opensetupl.exe'],
 ...['license.txt','license-lua.txt','license-tabicons.txt','readme.txt','privacy.txt'].map(name=>['graphics-setup-docs/'+name,'client-tools/opensetup/doc/'+name])
];
const out=path.join(repository,'artifacts/release',tag);fs.mkdirSync(out,{recursive:true});
const files=assets.map(([destination,relative])=>{
 const data=fs.readFileSync(path.join(source,relative));if(data.length>16777216)throw Error('Payload exceeds file limit');
 const sha256=crypto.createHash('sha256').update(data).digest('hex');
 const filename=sha256.slice(0,16)+'-'+path.basename(destination).replace(/[^a-zA-Z0-9._-]/g,'_');
 const target=path.join(out,filename);if(fs.existsSync(target)&&!fs.readFileSync(target).equals(data))throw Error('Immutable release asset differs');
 fs.writeFileSync(target,data);
 return {path:destination,url:`https://github.com/chiniji777/rotest-patcher/releases/download/${tag}/${filename}`,size:data.length,sha256};
});
const manifest=Buffer.from(JSON.stringify({product:'ROTest-20211103',sequence,version:'2026.09.13.'+sequence,files}));
const signature=crypto.sign('sha256',manifest,{key:privateKey,padding:crypto.constants.RSA_PKCS1_PSS_PADDING,saltLength:32});
const envelope=Buffer.from(JSON.stringify({manifest:manifest.toString('base64'),signature:signature.toString('base64')}));
if(!crypto.verify('sha256',manifest,{key:expectedKey,padding:crypto.constants.RSA_PKCS1_PSS_PADDING,saltLength:32},signature))throw Error('Signature self-verification failed');
const channel=path.join(out,'channel.json');if(fs.existsSync(channel)&&!fs.readFileSync(channel).equals(envelope))throw Error('Release already prepared; choose a new tag rather than replacing its signed manifest');
fs.writeFileSync(channel,envelope);
console.log(JSON.stringify({tag,sequence,files:files.length,payloadBytes:files.reduce((n,f)=>n+f.size,0),output:out,signatureVerified:true}));
