const normalize=s=>(s??'').replace(/card$/i,'').replace(/[^a-z0-9]/ig,'').toLowerCase();
const tier=m=>m.Modes?.Mvp===true?'mvp':m.Class==='Boss'?'mini':'normal';
export function classifyCard(card,monsters){
 const sources=monsters.filter(m=>[...(m.Drops??[]),...(m.MvpDrops??[])].some(d=>d.Item===card.AegisName&&d.Rate>0));
 if(!sources.length)return 'special';
 const names=new Set([normalize(card.Name),normalize(card.AegisName)]);
 const exact=sources.filter(m=>names.has(normalize(m.Name))||names.has(normalize(m.AegisName)));
 const tiers=new Set((exact.length?exact:sources).map(tier));return tiers.size===1?[...tiers][0]:'special';
}
