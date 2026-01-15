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
const PROVIDER_ID=process.env.JNKIE_PROVIDER_ID||'2265'; // Default provider
const DISCORD_LINK=process.env.DISCORD_LINK||'https://discord.gg/yourinvite';

if(!TOKEN){console.error('TOKEN NOT FOUND');process.exit(1);}

// Headers
const HEADER={
prometheus:`-- This file was protected using Prometheus Obfuscator [${DISCORD_LINK}]\n\n`,
luafree:`-- This file was protected using Lua Obfuscator [${DISCORD_LINK}]\n\n`
};

// Presets
const LUAFREE_PRESETS={
'dystropic':{name:'Dystropic Malevolence',plugins:['MinifiyAll','EncryptStrings','ControlFlowFlattenAllBlocks','MixedBooleanArithmetic','JunkifyAllIfStatements','TableIndirection','BytecodeShuffle','MutateAllLiterals','JunkCode']},
'chaotic_evil':{name:'Chaotic Evil',plugins:['MinifiyAll','EncryptStrings','ControlFlowFlattenAllBlocks','JunkifyAllIfStatements','MutateAllLiterals','JunkCode','SwizzleLookups']},
'chaotic_good':{name:'Chaotic Good',plugins:['MinifiyAll','EncryptStrings','ControlFlowFlattenAllBlocks','MutateAllLiterals','SwizzleLookups']},
'obfuscate_v1':{name:'OBFUSCATE V1',plugins:['MinifiyAll','EncryptStrings','ControlFlowFlattenAllBlocks','JunkCode']},
'basic_good':{name:'Basic Good',plugins:['MinifiyAll','EncryptStrings','ControlFlowFlattenAllBlocks']},
'basic_minimal':{name:'Basic Minimal',plugins:['MinifiyAll','EncryptStrings']}
};

// ========== SLASH COMMANDS ==========
function buildCommands(){
return[
new SlashCommandBuilder().setName('obf').setDescription('Prometheus Obfuscator')
.addAttachmentOption(o=>o.setName('file').setDescription('File .lua').setRequired(true))
.addStringOption(o=>o.setName('preset').setDescription('Preset').addChoices(
{name:'Minify',value:'Minify'},{name:'Weak',value:'Weak'},{name:'Medium',value:'Medium'}
)),

new SlashCommandBuilder().setName('lua').setDescription('Lua Free Custom')
.addAttachmentOption(o=>o.setName('file').setDescription('File .lua').setRequired(true))
.addBooleanOption(o=>o.setName('minify').setDescription('MinifyAll'))
.addBooleanOption(o=>o.setName('encrypt').setDescription('Encrypt Strings'))
.addBooleanOption(o=>o.setName('controlflow').setDescription('Control Flow'))
.addBooleanOption(o=>o.setName('junkcode').setDescription('Junk Code'))
.addBooleanOption(o=>o.setName('mutate').setDescription('Mutate Literals'))
.addBooleanOption(o=>o.setName('swizzle').setDescription('Swizzle Lookups')),

new SlashCommandBuilder().setName('luapreset').setDescription('Lua Free Preset')
.addAttachmentOption(o=>o.setName('file').setDescription('File .lua').setRequired(true))
.addStringOption(o=>o.setName('preset').setDescription('Preset').setRequired(true).addChoices(
{name:'Dystropic Malevolence',value:'dystropic'},
{name:'Chaotic Evil',value:'chaotic_evil'},
{name:'Chaotic Good',value:'chaotic_good'},
{name:'OBFUSCATE V1',value:'obfuscate_v1'},
{name:'Basic Good',value:'basic_good'},
{name:'Basic Minimal',value:'basic_minimal'}
)),

new SlashCommandBuilder().setName('key').setDescription('Key Management')
.addSubcommand(s=>s.setName('list').setDescription('List keys'))
.addSubcommand(s=>s.setName('create').setDescription('Create key')
  .addStringOption(o=>o.setName('note').setDescription('Note'))
  .addStringOption(o=>o.setName('provider_id').setDescription('Provider ID')))
.addSubcommand(s=>s.setName('batch').setDescription('Batch create')
  .addIntegerOption(o=>o.setName('count').setDescription('Count').setRequired(true))
  .addStringOption(o=>o.setName('provider_id').setDescription('Provider ID')))
.addSubcommand(s=>s.setName('delete').setDescription('Delete').addStringOption(o=>o.setName('id').setDescription('Key ID').setRequired(true)))
.addSubcommand(s=>s.setName('reset').setDescription('Reset HWID').addStringOption(o=>o.setName('id').setDescription('Key ID').setRequired(true))),

new SlashCommandBuilder().setName('service').setDescription('Service Management')
.addSubcommand(s=>s.setName('list').setDescription('List'))
.addSubcommand(s=>s.setName('create').setDescription('Create').addStringOption(o=>o.setName('name').setDescription('Name').setRequired(true)))
.addSubcommand(s=>s.setName('delete').setDescription('Delete').addStringOption(o=>o.setName('id').setDescription('ID').setRequired(true))),

new SlashCommandBuilder().setName('provider').setDescription('Provider Management')
.addSubcommand(s=>s.setName('list').setDescription('List'))
.addSubcommand(s=>s.setName('create').setDescription('Create').addStringOption(o=>o.setName('name').setDescription('Name').setRequired(true)))
.addSubcommand(s=>s.setName('delete').setDescription('Delete').addStringOption(o=>o.setName('id').setDescription('ID').setRequired(true))),

new SlashCommandBuilder().setName('integration').setDescription('Integration Management')
.addSubcommand(s=>s.setName('list').setDescription('List'))
.addSubcommand(s=>s.setName('types').setDescription('Types')),

new SlashCommandBuilder().setName('menu').setDescription('Menu'),
new SlashCommandBuilder().setName('status').setDescription('Status'),
new SlashCommandBuilder().setName('help').setDescription('Help')
].map(c=>c.toJSON());
}

// ========== REGISTER COMMANDS ==========
async function registerCommands(guildId=null){
if(!CLIENT_ID){console.log('CLIENT_ID not set');return{success:false,error:'CLIENT_ID not set'};}
try{
const rest=new REST({version:'10'}).setToken(TOKEN);
const commands=buildCommands();
if(guildId){
await rest.put(Routes.applicationGuildCommands(CLIENT_ID,guildId),{body:commands});
return{success:true,count:commands.length};
}else{
await rest.put(Routes.applicationCommands(CLIENT_ID),{body:commands});
return{success:true,count:commands.length};
}
}catch(e){return{success:false,error:e.message};}
}

// ========== BOT READY ==========
client.once('ready',async()=>{
console.log(`Bot ${client.user.tag} online`);
console.log(`CLIENT_ID: ${CLIENT_ID||'NOT SET'}`);
console.log(`SERVICE_ID: ${SERVICE_ID}`);
console.log(`PROVIDER_ID: ${PROVIDER_ID}`);
if(CLIENT_ID)await registerCommands();
});

// ========== MESSAGE COMMANDS ==========
client.on('messageCreate',async msg=>{
if(msg.author.bot)return;
const cmd=msg.content.trim().toLowerCase();

if(cmd==='!register'){
const m=await msg.reply('Registering...');
const r=await registerCommands(msg.guild.id);
await m.edit(r.success?`✅ ${r.count} commands registered! Type / to use.`:`❌ ${r.error}`);
}

if(cmd==='!reset'){
const m=await msg.reply('Resetting...');
try{
const rest=new REST({version:'10'}).setToken(TOKEN);
await rest.put(Routes.applicationGuildCommands(CLIENT_ID,msg.guild.id),{body:[]});
await new Promise(r=>setTimeout(r,1000));
const result=await registerCommands(msg.guild.id);
await m.edit(result.success?`✅ Reset! ${result.count} commands registered.`:`❌ ${result.error}`);
}catch(e){await m.edit(`❌ ${e.message}`);}
}

if(cmd==='!info'){
await msg.reply({embeds:[new EmbedBuilder().setTitle('Info').setColor(0x5865F2).addFields(
{name:'Bot',value:client.user.tag,inline:true},
{name:'CLIENT_ID',value:CLIENT_ID||'NOT SET',inline:true},
{name:'SERVICE_ID',value:SERVICE_ID,inline:true},
{name:'PROVIDER_ID',value:PROVIDER_ID,inline:true},
{name:'JNKIE',value:JNKIE_API_KEY?'✅':'❌',inline:true},
{name:'LUAFREE',value:LUAFREE_API_KEY?'✅':'❌',inline:true}
)]});
}
});

// ========== SLASH COMMAND HANDLER ==========
client.on('interactionCreate',async i=>{
try{
if(i.isChatInputCommand())await handleSlash(i);
else if(i.isButton())await handleButton(i);
else if(i.isModalSubmit())await handleModal(i);
}catch(e){
console.error(e);
const fn=i.replied||i.deferred?i.followUp.bind(i):i.reply.bind(i);
fn({content:`Error: ${e.message}`,ephemeral:true}).catch(()=>{});
}
});

async function handleSlash(i){
const cmd=i.commandName;

// ===== PROMETHEUS =====
if(cmd==='obf'){
const file=i.options.getAttachment('file');
const preset=i.options.getString('preset')||'Minify';
if(!file.name.endsWith('.lua'))return i.reply({content:'File harus .lua',ephemeral:true});

await i.deferReply();
try{
const script=await downloadFile(file.url);
const result=await prometheusObf(script,preset);

if(result.success){
const code=HEADER.prometheus+result.code;
const embed=new EmbedBuilder().setTitle('Prometheus Obfuscator').setColor(0x00ff00)
.addFields({name:'Preset',value:preset,inline:true},{name:'Size',value:formatSize(code.length),inline:true})
.setFooter({text:DISCORD_LINK});
return i.editReply({embeds:[embed],files:[new AttachmentBuilder(Buffer.from(code,'utf8'),{name:`Prometheus_${preset}_${Date.now()}.lua`})]});
}
return i.editReply(`Failed: ${result.error}`);
}catch(e){return i.editReply(`Error: ${e.message}`);}
}

// ===== LUA FREE CUSTOM =====
if(cmd==='lua'){
if(!LUAFREE_API_KEY)return i.reply({content:'LUAFREE_API_KEY not set',ephemeral:true});
const file=i.options.getAttachment('file');
if(!file.name.endsWith('.lua'))return i.reply({content:'File harus .lua',ephemeral:true});

const plugins={};
if(i.options.getBoolean('minify'))plugins.MinifiyAll=true;
if(i.options.getBoolean('encrypt'))plugins.EncryptStrings=true;
if(i.options.getBoolean('controlflow'))plugins.ControlFlowFlattenAllBlocks=true;
if(i.options.getBoolean('junkcode'))plugins.JunkCode=true;
if(i.options.getBoolean('mutate'))plugins.MutateAllLiterals=true;
if(i.options.getBoolean('swizzle'))plugins.SwizzleLookups=true;

if(Object.keys(plugins).length===0){plugins.MinifiyAll=true;plugins.EncryptStrings=true;}

await i.deferReply();
try{
const script=await downloadFile(file.url);
const result=await luaFreeObf(script,plugins);

if(result.success){
const code=HEADER.luafree+result.code;
const embed=new EmbedBuilder().setTitle('Lua Obfuscator').setColor(0x00ff00)
.addFields({name:'Plugins',value:Object.keys(plugins).join(', ')},{name:'Size',value:formatSize(code.length),inline:true})
.setFooter({text:DISCORD_LINK});
return i.editReply({embeds:[embed],files:[new AttachmentBuilder(Buffer.from(code,'utf8'),{name:`LuaFree_${Date.now()}.lua`})]});
}
return i.editReply(`Failed: ${result.error}`);
}catch(e){return i.editReply(`Error: ${e.message}`);}
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
try{
const script=await downloadFile(file.url);
const result=await luaFreeObf(script,plugins);

if(result.success){
const code=HEADER.luafree+result.code;
const embed=new EmbedBuilder().setTitle('Lua Obfuscator').setColor(0x00ff00)
.addFields({name:'Preset',value:preset.name},{name:'Plugins',value:preset.plugins.join(', ')},{name:'Size',value:formatSize(code.length),inline:true})
.setFooter({text:DISCORD_LINK});
return i.editReply({embeds:[embed],files:[new AttachmentBuilder(Buffer.from(code,'utf8'),{name:`LuaFree_${presetKey}_${Date.now()}.lua`})]});
}
return i.editReply(`Failed: ${result.error}`);
}catch(e){return i.editReply(`Error: ${e.message}`);}
}

// ===== KEY =====
if(cmd==='key'){
if(!JNKIE_API_KEY)return i.reply({content:'JNKIE_API_KEY not set',ephemeral:true});
const sub=i.options.getSubcommand();

if(sub==='list'){
await i.deferReply();
const r=await jnkieReq('GET',`/keys?serviceId=${SERVICE_ID}&limit=20`);
if(!r.ok)return i.editReply(`Error: ${r.error||r.raw?.substring(0,500)}`);
let items=r.data?.keys||[];if(!Array.isArray(items))items=[];
const list=items.slice(0,15).map((k,idx)=>`${idx+1}. \`${String(k.key_value||k.id).substring(0,25)}...\` ID:\`${k.id}\``).join('\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle('Keys').setColor(0x2ecc71).setDescription(list||'No keys').setFooter({text:`Total: ${items.length} | Provider: ${PROVIDER_ID}`})]});
}

if(sub==='create'){
const note=i.options.getString('note')||'Bot';
const providerId=parseInt(i.options.getString('provider_id')||PROVIDER_ID);
await i.deferReply();
// ✅ FIX: Added provider_id
const r=await jnkieReq('POST','/keys',{
serviceId:parseInt(SERVICE_ID),
providerId:providerId,
note:note,
maxHwids:3
});
if(!r.ok)return i.editReply(`Error: ${r.error||r.raw?.substring(0,500)}`);
const key=r.data?.key?.key_value||r.data?.key_value||JSON.stringify(r.data);
return i.editReply({embeds:[new EmbedBuilder().setTitle('Key Created').setColor(0x2ecc71).setDescription(`\`\`\`${key}\`\`\``).setFooter({text:`Provider: ${providerId}`})]});
}

if(sub==='batch'){
const count=i.options.getInteger('count')||5;
const providerId=parseInt(i.options.getString('provider_id')||PROVIDER_ID);
await i.deferReply();
// ✅ FIX: Added provider_id
const r=await jnkieReq('POST','/keys/batch',{
serviceId:parseInt(SERVICE_ID),
providerId:providerId,
count:count,
note:'Batch',
maxHwids:3
});
if(!r.ok)return i.editReply(`Error: ${r.error||r.raw?.substring(0,500)}`);
let keys=r.data?.keys||[];
const list=keys.slice(0,15).map((k,idx)=>`${idx+1}. \`${k.key_value||k}\``).join('\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle(`${keys.length} Keys Created`).setColor(0x2ecc71).setDescription(list||'Created').setFooter({text:`Provider: ${providerId}`})]});
}

if(sub==='delete'){
await i.deferReply();
const r=await jnkieReq('DELETE',`/keys/${i.options.getString('id')}`);
return i.editReply(r.ok?'✅ Deleted':`Error: ${r.error||r.raw?.substring(0,300)}`);
}

if(sub==='reset'){
await i.deferReply();
const r=await jnkieReq('POST',`/keys/${i.options.getString('id')}/reset-hwid`);
return i.editReply(r.ok?'✅ HWID Reset':`Error: ${r.error||r.raw?.substring(0,300)}`);
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
let items=r.data?.services||[];if(!Array.isArray(items))items=[items].filter(Boolean);
return i.editReply({embeds:[new EmbedBuilder().setTitle('Services').setColor(0x3498db).setDescription(items.map(s=>`\`${s.id}\` **${s.name||'?'}**`).join('\n')||'No services')]});
}

if(sub==='create'){
await i.deferReply();
const r=await jnkieReq('POST','/services',{name:i.options.getString('name'),description:'Bot',is_premium:false,keyless_mode:false});
return i.editReply(r.ok?`✅ Created: \`${r.data?.service?.id||r.data?.id}\``:`Error: ${r.error||r.raw?.substring(0,400)}`);
}

if(sub==='delete'){
await i.deferReply();
const r=await jnkieReq('DELETE',`/services/${i.options.getString('id')}`);
return i.editReply(r.ok?'✅ Deleted':`Error: ${r.error||r.raw?.substring(0,300)}`);
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
let items=r.data?.providers||[];if(!Array.isArray(items))items=[items].filter(Boolean);
return i.editReply({embeds:[new EmbedBuilder().setTitle('Providers').setColor(0xe67e22).setDescription(items.map(p=>`\`${p.id}\` **${p.name||'?'}** (${p.key_valid_minutes||0}min)`).join('\n')||'No providers').setFooter({text:`Default: ${PROVIDER_ID}`})]});
}

if(sub==='create'){
await i.deferReply();
const r=await jnkieReq('POST','/providers',{name:i.options.getString('name'),key_valid_minutes:60,is_active:true});
return i.editReply(r.ok?`✅ Created: \`${r.data?.provider?.id||r.data?.id}\``:`Error: ${r.error||r.raw?.substring(0,300)}`);
}

if(sub==='delete'){
await i.deferReply();
const r=await jnkieReq('DELETE',`/providers/${i.options.getString('id')}`);
return i.editReply(r.ok?'✅ Deleted':`Error: ${r.error||r.raw?.substring(0,300)}`);
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
let items=r.data?.integrations||[];if(!Array.isArray(items))items=[items].filter(Boolean);
return i.editReply({embeds:[new EmbedBuilder().setTitle('Integrations').setColor(0x9b59b6).setDescription(items.map(x=>`\`${x.id}\` **${x.name||'?'}** (${x.type||'?'})`).join('\n')||'No integrations')]});
}

if(sub==='types'){
await i.deferReply();
const r=await jnkieReq('GET','/integrations/types');
return i.editReply(`\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1900)}\n\`\`\``);
}
return;
}

// ===== MENU =====
if(cmd==='menu'){
const embed=new EmbedBuilder().setTitle('Menu').setColor(0x5865F2)
.setDescription(`**Obfuscate:**\n\`/obf\` Prometheus\n\`/lua\` Lua Free Custom\n\`/luapreset\` Lua Free Preset\n\n**Management:**\n\`/key\` Keys\n\`/service\` Services\n\`/provider\` Providers`)
.setFooter({text:`Service: ${SERVICE_ID} | Provider: ${PROVIDER_ID}`});
const row=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('key_list').setLabel('Keys').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('key_create').setLabel('Create Key').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('provider_list').setLabel('Providers').setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId('status').setLabel('Status').setStyle(ButtonStyle.Secondary)
);
return i.reply({embeds:[embed],components:[row]});
}

// ===== STATUS =====
if(cmd==='status'){
await i.deferReply();
const s=await jnkieReq('GET','/services');
const p=await jnkieReq('GET','/providers');
const embed=new EmbedBuilder().setTitle('Status').setColor(0x2ecc71).addFields(
{name:'Bot',value:'Online ✅',inline:true},
{name:'jnkie',value:JNKIE_API_KEY?'✅':'❌',inline:true},
{name:'LuaFree',value:LUAFREE_API_KEY?'✅':'❌',inline:true},
{name:'Service ID',value:SERVICE_ID,inline:true},
{name:'Provider ID',value:PROVIDER_ID,inline:true},
{name:'Services',value:String((s.data?.services||[]).length),inline:true},
{name:'Providers',value:String((p.data?.providers||[]).length),inline:true}
);
return i.editReply({embeds:[embed]});
}

// ===== HELP =====
if(cmd==='help'){
return i.reply({embeds:[new EmbedBuilder().setTitle('Help').setColor(0x5865F2)
.addFields(
{name:'Obfuscate',value:'`/obf` Prometheus\n`/lua` Lua Free Custom\n`/luapreset` Lua Free Preset'},
{name:'Keys',value:'`/key list`\n`/key create [note] [provider_id]`\n`/key batch count: [provider_id]`\n`/key delete` `/key reset`'},
{name:'Management',value:'`/service` `/provider` `/integration`'}
).setFooter({text:`Default Provider: ${PROVIDER_ID}`})]});
}
}

// ========== BUTTON HANDLER ==========
async function handleButton(i){
if(i.customId==='key_list'){
await i.deferUpdate();
const r=await jnkieReq('GET',`/keys?serviceId=${SERVICE_ID}&limit=15`);
let items=r.data?.keys||[];if(!Array.isArray(items))items=[];
const list=items.slice(0,10).map((k,idx)=>`${idx+1}. \`${String(k.key_value||k.id).substring(0,22)}...\``).join('\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle('Keys').setColor(0x2ecc71).setDescription(list||'No keys').setFooter({text:`Provider: ${PROVIDER_ID}`})],components:[]});
}

if(i.customId==='key_create'){
return i.showModal(new ModalBuilder().setCustomId('modal_key').setTitle('Create Key').addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('note').setLabel('Note').setStyle(TextInputStyle.Short).setRequired(false)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('provider_id').setLabel('Provider ID').setStyle(TextInputStyle.Short).setValue(PROVIDER_ID).setRequired(true))
));
}

if(i.customId==='provider_list'){
await i.deferUpdate();
const r=await jnkieReq('GET','/providers');
let items=r.data?.providers||[];if(!Array.isArray(items))items=[];
const list=items.map(p=>`\`${p.id}\` **${p.name||'?'}** (${p.key_valid_minutes||0}min)`).join('\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle('Providers').setColor(0xe67e22).setDescription(list||'No providers').setFooter({text:`Default: ${PROVIDER_ID}`})],components:[]});
}

if(i.customId==='status'){
await i.deferUpdate();
const s=await jnkieReq('GET','/services');
return i.editReply({embeds:[new EmbedBuilder().setTitle('Status').setColor(0x2ecc71)
.addFields(
{name:'Services',value:String((s.data?.services||[]).length),inline:true},
{name:'Service ID',value:SERVICE_ID,inline:true},
{name:'Provider ID',value:PROVIDER_ID,inline:true}
)],components:[]});
}
await i.deferUpdate();
}

// ========== MODAL HANDLER ==========
async function handleModal(i){
if(i.customId==='modal_key'){
const note=i.fields.getTextInputValue('note')||'Bot';
const providerId=parseInt(i.fields.getTextInputValue('provider_id')||PROVIDER_ID);
await i.deferReply();
const r=await jnkieReq('POST','/keys',{
serviceId:parseInt(SERVICE_ID),
providerId:providerId,
note:note,
maxHwids:3
});
if(!r.ok)return i.editReply(`Error: ${r.error||r.raw?.substring(0,500)}`);
const key=r.data?.key?.key_value||r.data?.key_value||JSON.stringify(r.data);
return i.editReply({embeds:[new EmbedBuilder().setTitle('Key Created').setColor(0x2ecc71).setDescription(`\`\`\`${key}\`\`\``).setFooter({text:`Provider: ${providerId}`})]});
}
}

// ========== PROMETHEUS OBFUSCATE ==========
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

// ========== LUA FREE OBFUSCATE (FIXED) ==========
async function luaFreeObf(script,plugins){
// ✅ FIX: Proper encoding and content type
const cleanScript=script.replace(/^\uFEFF/,'').trim();

// Step 1: Create session with raw text
console.log('LuaFree Step 1: Creating session...');
const step1=await new Promise(resolve=>{
const req=https.request({
hostname:'api.luaobfuscator.com',
port:443,
path:'/v1/obfuscator/newscript',
method:'POST',
headers:{
'Content-Type':'text/plain',
'apikey':LUAFREE_API_KEY
}
},res=>{
let data='';
res.on('data',chunk=>data+=chunk);
res.on('end',()=>{
console.log('LuaFree Step 1 Response:',data.substring(0,200));
try{resolve(JSON.parse(data));}
catch(e){resolve({error:'Parse error',raw:data});}
});
});
req.on('error',e=>{console.error('Step1 error:',e);resolve({error:e.message});});
req.setTimeout(60000,()=>{req.destroy();resolve({error:'Timeout'});});
req.write(cleanScript);
req.end();
});

if(!step1.sessionId){
return{success:false,error:step1.message||step1.error||'No sessionId: '+JSON.stringify(step1)};
}

console.log('LuaFree Step 2: Obfuscating with session:',step1.sessionId.substring(0,20)+'...');

// Step 2: Obfuscate with sessionId in header
const body=JSON.stringify(plugins);
const step2=await new Promise(resolve=>{
const req=https.request({
hostname:'api.luaobfuscator.com',
port:443,
path:'/v1/obfuscator/obfuscate',
method:'POST',
headers:{
'Content-Type':'application/json',
'apikey':LUAFREE_API_KEY,
'sessionId':step1.sessionId
}
},res=>{
let data='';
res.on('data',chunk=>data+=chunk);
res.on('end',()=>{
console.log('LuaFree Step 2 Response status:',res.statusCode);
try{resolve(JSON.parse(data));}
catch(e){resolve({error:'Parse error',raw:data});}
});
});
req.on('error',e=>{console.error('Step2 error:',e);resolve({error:e.message});});
req.setTimeout(120000,()=>{req.destroy();resolve({error:'Timeout'});});
req.write(body);
req.end();
});

if(!step2.code){
return{success:false,error:step2.message||step2.error||'No code: '+JSON.stringify(step2)};
}

return{success:true,code:step2.code};
}

// ========== JNKIE API ==========
function jnkieReq(method,endpoint,body=null){
return new Promise(resolve=>{
const data=body?JSON.stringify(body):'';
const req=https.request({
hostname:'api.jnkie.com',
port:443,
path:`/api/v2${endpoint}`,
method,
headers:{
'Authorization':`Bearer ${JNKIE_API_KEY}`,
'Content-Type':'application/json',
'Accept':'application/json',
...(body?{'Content-Length':Buffer.byteLength(data)}:{})
}
},res=>{
let d='';
res.on('data',c=>d+=c);
res.on('end',()=>{
try{
const j=JSON.parse(d);
resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,data:j,raw:d});
}catch(e){
resolve({ok:false,status:res.statusCode,error:'Parse error',raw:d});
}
});
});
req.on('error',e=>resolve({ok:false,error:e.message}));
req.setTimeout(15000,()=>{req.destroy();resolve({ok:false,error:'Timeout'});});
if(body)req.write(data);
req.end();
});
}

// ========== HELPERS ==========
function downloadFile(url){
return new Promise((resolve,reject)=>{
https.get(url,res=>{
const chunks=[];
res.on('data',c=>chunks.push(c));
res.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
res.on('error',reject);
}).on('error',reject);
});
}

function formatSize(b){
if(b<1024)return b+' B';
if(b<1048576)return(b/1024).toFixed(1)+' KB';
return(b/1048576).toFixed(1)+' MB';
}

client.login(TOKEN);
