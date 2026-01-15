const{Client,GatewayIntentBits,AttachmentBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,SlashCommandBuilder,REST,Routes}=require('discord.js');
const{exec}=require('child_process');const fs=require('fs');const path=require('path');const http=require('http');const https=require('https');const{promisify}=require('util');const execAsync=promisify(exec);

const PORT=process.env.PORT||3000;
http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/plain'});res.end('OK');}).listen(PORT);

const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]});

const TOKEN=process.env.DISCORD_TOKEN;
const CLIENT_ID=process.env.CLIENT_ID;
const PROMETHEUS_PATH=process.env.PROMETHEUS_PATH||'/app/prometheus';
const JNKIE_API_KEY=process.env.JNKIE_API_KEY;
const LUAFREE_API_KEY=process.env.LUAFREE_API_KEY||'';
const SERVICE_ID=process.env.JNKIE_SERVICE_ID||'4532';
const DISCORD_LINK=process.env.DISCORD_LINK||'https://discord.gg/yourinvite';

if(!TOKEN){console.error('TOKEN NOT FOUND');process.exit(1);}

// ========== SIMPLE HEADERS ==========
const HEADER={
prometheus:`-- This file was protected using Prometheus Obfuscator [${DISCORD_LINK}]\n\n`,
luafree:`-- This file was protected using Lua Obfuscator [${DISCORD_LINK}]\n\n`
};

// ========== LUA FREE PLUGINS ==========
const LUAFREE_PLUGINS=[
{id:'MinifiyAll',name:'MinifyAll',desc:'Single line, no comments'},
{id:'Minifier2',name:'Minifier V2',desc:'Better minification'},
{id:'EncryptStrings',name:'Encrypt Strings',desc:'Encrypt all strings'},
{id:'ConstantArray',name:'Constant Array',desc:'Hide constants'},
{id:'BytecodeShuffle',name:'Bytecode Shuffle',desc:'Shuffle bytecode'},
{id:'MutateAllLiterals',name:'Mutate Literals',desc:'Mutate numbers'},
{id:'MixedBooleanArithmetic',name:'Mixed Boolean',desc:'Boolean arithmetic'},
{id:'JunkifyAllIfStatements',name:'Junkify If',desc:'Opaque conditions'},
{id:'JunkifyBlockToIf',name:'Block to If',desc:'do/end to if'},
{id:'RevertAllIfStatements',name:'Revert If',desc:'Invert if statements'},
{id:'ControlFlowFlattenAllBlocks',name:'Control Flow',desc:'State-based flow'},
{id:'EncryptFuncDeclaration',name:'Encrypt Func',desc:'Encrypt functions'},
{id:'SwizzleLookups',name:'Swizzle',desc:'foo.bar to foo["bar"]'},
{id:'TableIndirection',name:'Table Indirection',desc:'Vars to table'},
{id:'MakeGlobalsLookups',name:'Globals Lookup',desc:'_G["foo"]'},
{id:'BasicIntegrity',name:'Integrity',desc:'Integrity checks'},
{id:'ProxifyLocals',name:'Proxify',desc:'Proxy local vars'},
{id:'JunkCode',name:'Junk Code',desc:'Add dead code'},
{id:'WatermarkCheck',name:'Watermark',desc:'Watermark check'}
];

// ========== LUA FREE PRESETS (No VM, No AntiTamper, Added ControlFlow) ==========
const LUAFREE_PRESETS={
'dystropic':{
name:'Dystropic Malevolence',
desc:'Maximum protection',
plugins:['MinifiyAll','EncryptStrings','ControlFlowFlattenAllBlocks','MixedBooleanArithmetic','JunkifyAllIfStatements','TableIndirection','BytecodeShuffle','MutateAllLiterals','JunkCode']
},
'chaotic_evil':{
name:'Chaotic Evil',
desc:'Heavy obfuscation',
plugins:['MinifiyAll','EncryptStrings','ControlFlowFlattenAllBlocks','JunkifyAllIfStatements','MutateAllLiterals','JunkCode','SwizzleLookups']
},
'chaotic_good':{
name:'Chaotic Good',
desc:'Balanced protection',
plugins:['MinifiyAll','EncryptStrings','ControlFlowFlattenAllBlocks','MutateAllLiterals','SwizzleLookups']
},
'obfuscate_v1':{
name:'OBFUSCATE V1',
desc:'Standard V1',
plugins:['MinifiyAll','EncryptStrings','ControlFlowFlattenAllBlocks','JunkCode']
},
'obfuscate_old':{
name:'OBFUSCATE (old)',
desc:'Legacy mode',
plugins:['MinifiyAll','EncryptStrings','ControlFlowFlattenAllBlocks','MutateAllLiterals']
},
'basic_good':{
name:'Basic Good',
desc:'Good balance',
plugins:['MinifiyAll','EncryptStrings','ControlFlowFlattenAllBlocks']
},
'basic_minimal':{
name:'Basic Minimal',
desc:'Light protection',
plugins:['MinifiyAll','EncryptStrings']
},
'beautify':{
name:'Beautify',
desc:'Format only',
plugins:['MinifiyAll']
}
};

// ========== SLASH COMMANDS ==========
const commands=[
new SlashCommandBuilder()
.setName('obf')
.setDescription('Prometheus Obfuscator')
.addAttachmentOption(o=>o.setName('file').setDescription('File .lua').setRequired(true))
.addStringOption(o=>o.setName('preset').setDescription('Preset').addChoices(
{name:'Minify - Fast & small',value:'Minify'},
{name:'Weak - Light protection',value:'Weak'},
{name:'Medium - Balanced',value:'Medium'}
)),

new SlashCommandBuilder()
.setName('lua')
.setDescription('Lua Free - Custom plugins')
.addAttachmentOption(o=>o.setName('file').setDescription('File .lua').setRequired(true))
.addBooleanOption(o=>o.setName('minify').setDescription('MinifyAll'))
.addBooleanOption(o=>o.setName('encrypt_strings').setDescription('Encrypt Strings'))
.addBooleanOption(o=>o.setName('control_flow').setDescription('Control Flow'))
.addBooleanOption(o=>o.setName('constant_array').setDescription('Constant Array'))
.addBooleanOption(o=>o.setName('bytecode_shuffle').setDescription('Bytecode Shuffle'))
.addBooleanOption(o=>o.setName('mutate_literals').setDescription('Mutate Literals'))
.addBooleanOption(o=>o.setName('mixed_boolean').setDescription('Mixed Boolean'))
.addBooleanOption(o=>o.setName('junkify_if').setDescription('Junkify If'))
.addBooleanOption(o=>o.setName('encrypt_func').setDescription('Encrypt Func'))
.addBooleanOption(o=>o.setName('swizzle').setDescription('Swizzle Lookups'))
.addBooleanOption(o=>o.setName('table_indirection').setDescription('Table Indirection'))
.addBooleanOption(o=>o.setName('globals_lookup').setDescription('Globals Lookup'))
.addBooleanOption(o=>o.setName('integrity').setDescription('Basic Integrity'))
.addBooleanOption(o=>o.setName('junk_code').setDescription('Junk Code')),

new SlashCommandBuilder()
.setName('luapreset')
.setDescription('Lua Free - Preset template')
.addAttachmentOption(o=>o.setName('file').setDescription('File .lua').setRequired(true))
.addStringOption(o=>o.setName('preset').setDescription('Preset').setRequired(true).addChoices(
{name:'Dystropic Malevolence - Maximum',value:'dystropic'},
{name:'Chaotic Evil - Heavy',value:'chaotic_evil'},
{name:'Chaotic Good - Balanced',value:'chaotic_good'},
{name:'OBFUSCATE V1 - Standard',value:'obfuscate_v1'},
{name:'OBFUSCATE (old) - Legacy',value:'obfuscate_old'},
{name:'Basic Good - Good balance',value:'basic_good'},
{name:'Basic Minimal - Light',value:'basic_minimal'},
{name:'Beautify - Format only',value:'beautify'}
)),

new SlashCommandBuilder()
.setName('key')
.setDescription('Key Management')
.addSubcommand(s=>s.setName('list').setDescription('List keys').addStringOption(o=>o.setName('service_id').setDescription('Service ID')))
.addSubcommand(s=>s.setName('create').setDescription('Create key').addStringOption(o=>o.setName('service_id').setDescription('Service ID')).addStringOption(o=>o.setName('note').setDescription('Note')))
.addSubcommand(s=>s.setName('batch').setDescription('Batch create').addIntegerOption(o=>o.setName('count').setDescription('Count').setRequired(true)).addStringOption(o=>o.setName('service_id').setDescription('Service ID')))
.addSubcommand(s=>s.setName('delete').setDescription('Delete key').addStringOption(o=>o.setName('key_id').setDescription('Key ID').setRequired(true)))
.addSubcommand(s=>s.setName('reset').setDescription('Reset HWID').addStringOption(o=>o.setName('key_id').setDescription('Key ID').setRequired(true)))
.addSubcommand(s=>s.setName('get').setDescription('Get detail').addStringOption(o=>o.setName('key_id').setDescription('Key ID').setRequired(true))),

new SlashCommandBuilder()
.setName('service')
.setDescription('Service Management')
.addSubcommand(s=>s.setName('list').setDescription('List'))
.addSubcommand(s=>s.setName('create').setDescription('Create').addStringOption(o=>o.setName('name').setDescription('Name').setRequired(true)).addStringOption(o=>o.setName('description').setDescription('Description')))
.addSubcommand(s=>s.setName('delete').setDescription('Delete').addStringOption(o=>o.setName('service_id').setDescription('ID').setRequired(true)))
.addSubcommand(s=>s.setName('get').setDescription('Get').addStringOption(o=>o.setName('service_id').setDescription('ID').setRequired(true))),

new SlashCommandBuilder()
.setName('provider')
.setDescription('Provider Management')
.addSubcommand(s=>s.setName('list').setDescription('List'))
.addSubcommand(s=>s.setName('create').setDescription('Create').addStringOption(o=>o.setName('name').setDescription('Name').setRequired(true)).addIntegerOption(o=>o.setName('minutes').setDescription('Minutes')))
.addSubcommand(s=>s.setName('delete').setDescription('Delete').addStringOption(o=>o.setName('id').setDescription('ID').setRequired(true)))
.addSubcommand(s=>s.setName('get').setDescription('Get').addStringOption(o=>o.setName('id').setDescription('ID').setRequired(true))),

new SlashCommandBuilder()
.setName('integration')
.setDescription('Integration Management')
.addSubcommand(s=>s.setName('list').setDescription('List'))
.addSubcommand(s=>s.setName('types').setDescription('Types'))
.addSubcommand(s=>s.setName('get').setDescription('Get').addStringOption(o=>o.setName('id').setDescription('ID').setRequired(true)))
.addSubcommand(s=>s.setName('delete').setDescription('Delete').addStringOption(o=>o.setName('id').setDescription('ID').setRequired(true))),

new SlashCommandBuilder().setName('menu').setDescription('Interactive menu'),
new SlashCommandBuilder().setName('status').setDescription('Bot status'),
new SlashCommandBuilder().setName('plugins').setDescription('List plugins'),
new SlashCommandBuilder().setName('presets').setDescription('List presets'),
new SlashCommandBuilder().setName('help').setDescription('Help')
].map(c=>c.toJSON());

// ========== REGISTER COMMANDS ==========
client.once('ready',async()=>{
console.log(`Bot ${client.user.tag} online`);
try{
const rest=new REST({version:'10'}).setToken(TOKEN);
if(CLIENT_ID){
await rest.put(Routes.applicationCommands(CLIENT_ID),{body:commands});
console.log('Commands registered');
}
}catch(e){console.error(e);}
});

// ========== INTERACTION HANDLER ==========
client.on('interactionCreate',async i=>{
try{
if(i.isChatInputCommand())await handleCommand(i);
else if(i.isButton())await handleButton(i);
else if(i.isModalSubmit())await handleModal(i);
}catch(e){
console.error(e);
const fn=i.replied||i.deferred?i.followUp.bind(i):i.reply.bind(i);
fn({content:`Error: ${e.message}`,ephemeral:true}).catch(()=>{});
}
});

// ========== COMMAND HANDLER ==========
async function handleCommand(i){
const cmd=i.commandName;

// ===== PROMETHEUS =====
if(cmd==='obf'){
const file=i.options.getAttachment('file');
const preset=i.options.getString('preset')||'Minify';
if(!file.name.endsWith('.lua'))return i.reply({content:'File harus .lua',ephemeral:true});

await i.deferReply();
const script=await downloadFile(file.url);
const result=await prometheusObf(script,preset);

if(result.success){
const code=HEADER.prometheus+result.code;
const embed=new EmbedBuilder()
.setTitle('Prometheus Obfuscator')
.setColor(0x00ff00)
.addFields(
{name:'Preset',value:preset,inline:true},
{name:'Size',value:formatSize(code.length),inline:true}
)
.setFooter({text:DISCORD_LINK});
return i.editReply({embeds:[embed],files:[new AttachmentBuilder(Buffer.from(code),{name:`Prometheus_${preset}_${Date.now()}.lua`})]});
}
return i.editReply(`Failed: ${result.error}`);
}

// ===== LUA FREE CUSTOM =====
if(cmd==='lua'){
if(!LUAFREE_API_KEY)return i.reply({content:'LUAFREE_API_KEY not set',ephemeral:true});
const file=i.options.getAttachment('file');
if(!file.name.endsWith('.lua'))return i.reply({content:'File harus .lua',ephemeral:true});

const plugins={};
if(i.options.getBoolean('minify'))plugins.MinifiyAll=true;
if(i.options.getBoolean('encrypt_strings'))plugins.EncryptStrings=true;
if(i.options.getBoolean('control_flow'))plugins.ControlFlowFlattenAllBlocks=true;
if(i.options.getBoolean('constant_array'))plugins.ConstantArray=true;
if(i.options.getBoolean('bytecode_shuffle'))plugins.BytecodeShuffle=true;
if(i.options.getBoolean('mutate_literals'))plugins.MutateAllLiterals=true;
if(i.options.getBoolean('mixed_boolean'))plugins.MixedBooleanArithmetic=true;
if(i.options.getBoolean('junkify_if'))plugins.JunkifyAllIfStatements=true;
if(i.options.getBoolean('encrypt_func'))plugins.EncryptFuncDeclaration=true;
if(i.options.getBoolean('swizzle'))plugins.SwizzleLookups=true;
if(i.options.getBoolean('table_indirection'))plugins.TableIndirection=true;
if(i.options.getBoolean('globals_lookup'))plugins.MakeGlobalsLookups=true;
if(i.options.getBoolean('integrity'))plugins.BasicIntegrity=true;
if(i.options.getBoolean('junk_code'))plugins.JunkCode=true;

if(Object.keys(plugins).length===0){
plugins.MinifiyAll=true;
plugins.EncryptStrings=true;
plugins.ControlFlowFlattenAllBlocks=true;
}

await i.deferReply();
const script=await downloadFile(file.url);
const result=await luaFreeObf(script,plugins);

if(result.success){
const pluginList=Object.keys(plugins);
const code=HEADER.luafree+result.code;
const embed=new EmbedBuilder()
.setTitle('Lua Obfuscator')
.setColor(0x00ff00)
.addFields(
{name:'Plugins',value:pluginList.join(', ')},
{name:'Size',value:formatSize(code.length),inline:true}
)
.setFooter({text:DISCORD_LINK});
return i.editReply({embeds:[embed],files:[new AttachmentBuilder(Buffer.from(code),{name:`LuaFree_Custom_${Date.now()}.lua`})]});
}
return i.editReply(`Failed: ${result.error}`);
}

// ===== LUA FREE PRESET =====
if(cmd==='luapreset'){
if(!LUAFREE_API_KEY)return i.reply({content:'LUAFREE_API_KEY not set',ephemeral:true});
const file=i.options.getAttachment('file');
const presetKey=i.options.getString('preset');
if(!file.name.endsWith('.lua'))return i.reply({content:'File harus .lua',ephemeral:true});

const preset=LUAFREE_PRESETS[presetKey];
if(!preset)return i.reply({content:'Preset not found',ephemeral:true});

const plugins={};
preset.plugins.forEach(p=>plugins[p]=true);

await i.deferReply();
const script=await downloadFile(file.url);
const result=await luaFreeObf(script,plugins);

if(result.success){
const code=HEADER.luafree+result.code;
const embed=new EmbedBuilder()
.setTitle('Lua Obfuscator')
.setColor(0x00ff00)
.addFields(
{name:'Preset',value:preset.name,inline:true},
{name:'Description',value:preset.desc,inline:true},
{name:'Plugins',value:preset.plugins.join(', ')},
{name:'Size',value:formatSize(code.length),inline:true}
)
.setFooter({text:DISCORD_LINK});
return i.editReply({embeds:[embed],files:[new AttachmentBuilder(Buffer.from(code),{name:`LuaFree_${presetKey}_${Date.now()}.lua`})]});
}
return i.editReply(`Failed: ${result.error}`);
}

// ===== KEY =====
if(cmd==='key'){
if(!JNKIE_API_KEY)return i.reply({content:'JNKIE_API_KEY not set',ephemeral:true});
const sub=i.options.getSubcommand();

if(sub==='list'){
const sid=i.options.getString('service_id')||SERVICE_ID;
await i.deferReply();
const r=await jnkieReq('GET',`/keys?serviceId=${sid}&limit=25`);
if(!r.ok)return i.editReply(`Error: ${r.raw?.substring(0,500)}`);
let items=r.data?.keys||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[];
const list=items.slice(0,15).map((k,idx)=>`${idx+1}. \`${String(k.key_value||k.id).substring(0,25)}...\` ID:\`${k.id}\``).join('\n');
const embed=new EmbedBuilder().setTitle(`Keys - Service ${sid}`).setColor(0x2ecc71).setDescription(list||'No keys').setFooter({text:`Total: ${items.length}`});
return i.editReply({embeds:[embed]});
}

if(sub==='create'){
const sid=i.options.getString('service_id')||SERVICE_ID;
const note=i.options.getString('note')||'Bot';
await i.deferReply();
const r=await jnkieReq('POST','/keys',{serviceId:parseInt(sid),note,maxHwids:3});
const key=r.data?.key?.key_value||r.data?.key_value;
const embed=new EmbedBuilder().setTitle('Key Created').setColor(0x2ecc71).setDescription(`\`\`\`${key||JSON.stringify(r.data)}\`\`\``);
return i.editReply(r.ok?{embeds:[embed]}:`Error: ${r.raw?.substring(0,500)}`);
}

if(sub==='batch'){
const sid=i.options.getString('service_id')||SERVICE_ID;
const count=i.options.getInteger('count')||5;
await i.deferReply();
const r=await jnkieReq('POST','/keys/batch',{serviceId:parseInt(sid),count,note:'Batch',maxHwids:3});
if(!r.ok)return i.editReply(`Error: ${r.raw?.substring(0,500)}`);
let keys=r.data?.keys||r.data||[];
const list=keys.slice(0,20).map((k,idx)=>`${idx+1}. \`${k.key_value||k}\``).join('\n');
const embed=new EmbedBuilder().setTitle(`${keys.length} Keys Created`).setColor(0x2ecc71).setDescription(list);
return i.editReply({embeds:[embed]});
}

if(sub==='delete'){
const keyId=i.options.getString('key_id');
await i.deferReply();
const r=await jnkieReq('DELETE',`/keys/${keyId}`);
return i.editReply(r.ok?'Key Deleted':`Error: ${r.raw?.substring(0,300)}`);
}

if(sub==='reset'){
const keyId=i.options.getString('key_id');
await i.deferReply();
const r=await jnkieReq('POST',`/keys/${keyId}/reset-hwid`);
return i.editReply(r.ok?'HWID Reset':`Error: ${r.raw?.substring(0,300)}`);
}

if(sub==='get'){
const keyId=i.options.getString('key_id');
await i.deferReply();
const r=await jnkieReq('GET',`/keys/${keyId}`);
return i.editReply(`\`\`\`json\n${JSON.stringify(r.data?.key||r.data,null,2).substring(0,1900)}\n\`\`\``);
}
return;
}

// ===== SERVICE =====
if(cmd==='service'){
if(!JNKIE_API_KEY)return i.reply({content:'JNKIE_API_KEY not set',ephemeral:true});
const sub=i.options.getSubcommand();

if(sub==='list'){
await i.deferReply();
const r=await jnkieReq('GET','/services');
let items=r.data?.services||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[items].filter(Boolean);
const list=items.map(s=>`\`${s.id}\` **${s.name||'?'}** - ${(s.description||'').substring(0,40)}`).join('\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle('Services').setColor(0x3498db).setDescription(list||'No services')]});
}

if(sub==='create'){
const name=i.options.getString('name');
const desc=i.options.getString('description')||'Bot';
await i.deferReply();
const r=await jnkieReq('POST','/services',{name,description:desc,is_premium:false,keyless_mode:false});
return i.editReply(r.ok?`Created: \`${r.data?.service?.id||r.data?.id}\``:`Error: ${r.raw?.substring(0,400)}`);
}

if(sub==='delete'){
await i.deferReply();
const r=await jnkieReq('DELETE',`/services/${i.options.getString('service_id')}`);
return i.editReply(r.ok?'Deleted':`Error: ${r.raw?.substring(0,300)}`);
}

if(sub==='get'){
await i.deferReply();
const r=await jnkieReq('GET',`/services/${i.options.getString('service_id')}`);
return i.editReply(`\`\`\`json\n${JSON.stringify(r.data?.service||r.data,null,2).substring(0,1900)}\n\`\`\``);
}
return;
}

// ===== PROVIDER =====
if(cmd==='provider'){
if(!JNKIE_API_KEY)return i.reply({content:'JNKIE_API_KEY not set',ephemeral:true});
const sub=i.options.getSubcommand();

if(sub==='list'){
await i.deferReply();
const r=await jnkieReq('GET','/providers');
let items=r.data?.providers||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[items].filter(Boolean);
const list=items.map(p=>`\`${p.id}\` **${p.name||'?'}** (${p.key_valid_minutes||0}min)`).join('\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle('Providers').setColor(0xe67e22).setDescription(list||'No providers')]});
}

if(sub==='create'){
const name=i.options.getString('name');
const mins=i.options.getInteger('minutes')||60;
await i.deferReply();
const r=await jnkieReq('POST','/providers',{name,key_valid_minutes:mins,is_active:true});
return i.editReply(r.ok?`Created: \`${r.data?.provider?.id||r.data?.id}\``:`Error: ${r.raw?.substring(0,300)}`);
}

if(sub==='delete'){
await i.deferReply();
const r=await jnkieReq('DELETE',`/providers/${i.options.getString('id')}`);
return i.editReply(r.ok?'Deleted':`Error: ${r.raw?.substring(0,300)}`);
}

if(sub==='get'){
await i.deferReply();
const r=await jnkieReq('GET',`/providers/${i.options.getString('id')}`);
return i.editReply(`\`\`\`json\n${JSON.stringify(r.data?.provider||r.data,null,2).substring(0,1900)}\n\`\`\``);
}
return;
}

// ===== INTEGRATION =====
if(cmd==='integration'){
if(!JNKIE_API_KEY)return i.reply({content:'JNKIE_API_KEY not set',ephemeral:true});
const sub=i.options.getSubcommand();

if(sub==='list'){
await i.deferReply();
const r=await jnkieReq('GET','/integrations');
let items=r.data?.integrations||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[items].filter(Boolean);
const list=items.map(x=>`\`${x.id}\` **${x.name||'?'}** (${x.type||'?'})`).join('\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle('Integrations').setColor(0x9b59b6).setDescription(list||'No integrations')]});
}

if(sub==='types'){
await i.deferReply();
const r=await jnkieReq('GET','/integrations/types');
return i.editReply(`\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1900)}\n\`\`\``);
}

if(sub==='get'){
await i.deferReply();
const r=await jnkieReq('GET',`/integrations/${i.options.getString('id')}`);
return i.editReply(`\`\`\`json\n${JSON.stringify(r.data?.integration||r.data,null,2).substring(0,1900)}\n\`\`\``);
}

if(sub==='delete'){
await i.deferReply();
const r=await jnkieReq('DELETE',`/integrations/${i.options.getString('id')}`);
return i.editReply(r.ok?'Deleted':`Error: ${r.raw?.substring(0,300)}`);
}
return;
}

// ===== MENU =====
if(cmd==='menu')return i.reply(await buildMenu());

// ===== STATUS =====
if(cmd==='status'){
await i.deferReply();
return i.editReply(await buildStatus());
}

// ===== PLUGINS =====
if(cmd==='plugins'){
const list=LUAFREE_PLUGINS.map(p=>`\`${p.id}\` - ${p.desc}`).join('\n');
return i.reply({embeds:[new EmbedBuilder().setTitle('Lua Free Plugins').setColor(0x2ecc71).setDescription(list)]});
}

// ===== PRESETS =====
if(cmd==='presets'){
const luaList=Object.entries(LUAFREE_PRESETS).map(([k,v])=>`\`${k}\` - ${v.name}`).join('\n');
const embed=new EmbedBuilder().setTitle('All Presets').setColor(0x9b59b6)
.addFields(
{name:'Prometheus',value:'`Minify` `Weak` `Medium`',inline:false},
{name:'Lua Free',value:luaList,inline:false}
);
return i.reply({embeds:[embed]});
}

// ===== HELP =====
if(cmd==='help'){
const embed=new EmbedBuilder().setTitle('Help').setColor(0x5865F2)
.setDescription(`Discord: ${DISCORD_LINK}`)
.addFields(
{name:'Obfuscate',value:'`/obf` - Prometheus\n`/lua` - Lua Free Custom\n`/luapreset` - Lua Free Preset'},
{name:'Keys',value:'`/key list` `/key create` `/key batch`\n`/key delete` `/key reset` `/key get`'},
{name:'Management',value:'`/service` `/provider` `/integration`'},
{name:'Info',value:'`/plugins` `/presets` `/status` `/menu`'}
)
.setFooter({text:`Service: ${SERVICE_ID}`});
return i.reply({embeds:[embed]});
}
}

// ========== BUTTON HANDLER ==========
async function handleButton(i){
const id=i.customId;
if(id==='menu_main')return i.update(await buildMenu());
if(id==='menu_status'){await i.deferUpdate();return i.editReply(await buildStatus());}
if(id==='key_list'){await i.deferUpdate();return i.editReply(await buildKeyList());}
if(id==='key_create')return showModal(i,'key_create');
if(id==='key_batch')return showModal(i,'key_batch');
await i.deferUpdate();
}

// ========== MODAL HANDLER ==========
async function handleModal(i){
const id=i.customId;
if(id==='key_create'){
const sid=i.fields.getTextInputValue('service_id')||SERVICE_ID;
const note=i.fields.getTextInputValue('note')||'Bot';
await i.deferReply();
const r=await jnkieReq('POST','/keys',{serviceId:parseInt(sid),note,maxHwids:3});
return i.editReply(r.ok?`Key: \`\`\`${r.data?.key?.key_value||JSON.stringify(r.data)}\`\`\``:`Error: ${r.raw?.substring(0,500)}`);
}
if(id==='key_batch'){
const sid=i.fields.getTextInputValue('service_id')||SERVICE_ID;
const count=parseInt(i.fields.getTextInputValue('count'))||5;
await i.deferReply();
const r=await jnkieReq('POST','/keys/batch',{serviceId:parseInt(sid),count,note:'Batch',maxHwids:3});
return i.editReply(r.ok?`${(r.data?.keys||r.data||[]).length} keys created`:`Error: ${r.raw?.substring(0,500)}`);
}
}

function showModal(i,type){
const modals={
key_create:new ModalBuilder().setCustomId('key_create').setTitle('Create Key').addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('service_id').setLabel('Service ID').setStyle(TextInputStyle.Short).setValue(SERVICE_ID)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('note').setLabel('Note').setStyle(TextInputStyle.Short).setRequired(false))
),
key_batch:new ModalBuilder().setCustomId('key_batch').setTitle('Batch Create').addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('service_id').setLabel('Service ID').setStyle(TextInputStyle.Short).setValue(SERVICE_ID)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('count').setLabel('Count').setStyle(TextInputStyle.Short).setValue('5'))
)
};
i.showModal(modals[type]);
}

// ========== BUILD UI ==========
async function buildMenu(){
const embed=new EmbedBuilder().setTitle('Control Panel').setColor(0x5865F2)
.setDescription(`${DISCORD_LINK}\n\n**Commands:**\n\`/obf\` - Prometheus\n\`/lua\` - Lua Free Custom\n\`/luapreset\` - Lua Free Preset\n\`/key\` - Key Management`);
const row=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('key_list').setLabel('Keys').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('key_create').setLabel('Create').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('key_batch').setLabel('Batch').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('menu_status').setLabel('Status').setStyle(ButtonStyle.Secondary)
);
return{embeds:[embed],components:[row]};
}

async function buildStatus(){
const s=await jnkieReq('GET','/services');
const p=await jnkieReq('GET','/providers');
const x=await jnkieReq('GET','/integrations');
const embed=new EmbedBuilder().setTitle('Status').setColor(0x2ecc71).addFields(
{name:'Bot',value:'Online',inline:true},
{name:'jnkie',value:JNKIE_API_KEY?`OK (${s.status})`:'Not Set',inline:true},
{name:'LuaFree',value:LUAFREE_API_KEY?'OK':'Not Set',inline:true},
{name:'Services',value:String((s.data?.services||s.data||[]).length||0),inline:true},
{name:'Providers',value:String((p.data?.providers||p.data||[]).length||0),inline:true},
{name:'Integrations',value:String((x.data?.integrations||x.data||[]).length||0),inline:true}
).setFooter({text:`Service: ${SERVICE_ID}`});
return{embeds:[embed],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('menu_main').setLabel('Back').setStyle(ButtonStyle.Secondary))]};
}

async function buildKeyList(){
const r=await jnkieReq('GET',`/keys?serviceId=${SERVICE_ID}&limit=20`);
let items=r.data?.keys||r.data?.data||r.data||[];
if(!Array.isArray(items))items=[];
const list=items.slice(0,10).map((k,i)=>`${i+1}. \`${String(k.key_value||k.id).substring(0,22)}...\` ID:\`${k.id}\``).join('\n');
const embed=new EmbedBuilder().setTitle(`Keys (${SERVICE_ID})`).setColor(0x2ecc71).setDescription(list||'No keys').setFooter({text:`Total: ${items.length}`});
return{embeds:[embed],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('menu_main').setLabel('Back').setStyle(ButtonStyle.Secondary))]};
}

// ========== OBFUSCATE FUNCTIONS ==========
async function prometheusObf(script,preset){
const ts=Date.now();
const inp=path.join(PROMETHEUS_PATH,`in_${ts}.lua`);
const out=path.join(PROMETHEUS_PATH,`out_${ts}.lua`);
try{
fs.writeFileSync(inp,script.replace(/^\uFEFF/,'').trim(),'utf8');
await execAsync(`cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset ${preset} "${inp}" --out "${out}" 2>&1`,{timeout:120000});
if(fs.existsSync(out))return{success:true,code:fs.readFileSync(out,'utf8')};
return{success:false,error:'Output not generated'};
}catch(e){return{success:false,error:e.message};}
finally{[inp,out].forEach(f=>{try{fs.unlinkSync(f);}catch(e){}});}
}

async function luaFreeObf(script,plugins){
const step1=await httpReq('POST','api.luaobfuscator.com','/v1/obfuscator/newscript',script,{'Content-Type':'text/plain','apikey':LUAFREE_API_KEY});
if(!step1.sessionId)return{success:false,error:step1.message||JSON.stringify(step1)};
const step2=await httpReq('POST','api.luaobfuscator.com','/v1/obfuscator/obfuscate',JSON.stringify(plugins),{'Content-Type':'application/json','apikey':LUAFREE_API_KEY,'sessionId':step1.sessionId});
if(!step2.code)return{success:false,error:step2.message||JSON.stringify(step2)};
return{success:true,code:step2.code};
}

// ========== API HELPERS ==========
function jnkieReq(method,endpoint,body=null){
const data=body?JSON.stringify(body):'';
return httpReq(method,'api.jnkie.com',`/api/v2${endpoint}`,data,{'Authorization':`Bearer ${JNKIE_API_KEY}`,'Content-Type':'application/json'}).then(r=>({ok:r._status>=200&&r._status<300,status:r._status,data:r,raw:JSON.stringify(r)}));
}

function httpReq(method,host,path,body='',headers={}){
return new Promise(r=>{
const opts={hostname:host,port:443,path,method,headers:{...headers}};
if(body)opts.headers['Content-Length']=Buffer.byteLength(body,'utf8');
const req=https.request(opts,res=>{
let d='';res.on('data',c=>d+=c);res.on('end',()=>{try{const j=JSON.parse(d);j._status=res.statusCode;r(j);}catch(e){r({error:d,_status:res.statusCode});}});
});
req.on('error',e=>r({error:e.message,_status:0}));
req.setTimeout(120000,()=>{req.destroy();r({error:'Timeout',_status:408});});
if(body)req.write(body,'utf8');req.end();
});
}

function downloadFile(url){return new Promise((r,j)=>{https.get(url,res=>{const d=[];res.on('data',c=>d.push(c));res.on('end',()=>r(Buffer.concat(d).toString('utf8')));}).on('error',j);});}

function formatSize(bytes){
if(bytes<1024)return bytes+' B';
if(bytes<1024*1024)return(bytes/1024).toFixed(2)+' KB';
return(bytes/(1024*1024)).toFixed(2)+' MB';
}

client.login(TOKEN);
