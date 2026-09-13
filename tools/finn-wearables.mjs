export function validateWearable(recipe,source,context){
 if(!source||source.id!==recipe.id||source.name!==recipe.name)throw Error('source identity mismatch');
 if(context.serverIds.has(recipe.id))throw Error('server id collision '+recipe.id);
 const visual=context.client.get(recipe.template);
 if(!visual||visual.view!==source.view||visual.resourceHex!==source.resourceHex)throw Error('visual template mismatch '+recipe.id);
 if(!Number.isInteger(source.slots)||source.slots<0||source.slots>4||!Number.isInteger(recipe.weight)||recipe.weight<0||!Number.isInteger(recipe.level)||recipe.level<1)throw Error('invalid item fields');
 for(const m of recipe.script.matchAll(/\bb[A-Z][A-Za-z0-9_]*/g))if(!context.bonuses.has(m[0]))throw Error('undefined engine bonus '+m[0]);
 for(const m of recipe.script.matchAll(/"([A-Z][A-Z0-9_]+)"/g))if(!context.skills.has(m[1]))throw Error('undefined engine skill '+m[1]);
 return {...recipe,slots:source.slots,view:source.view};
}
