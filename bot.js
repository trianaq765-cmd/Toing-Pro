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

// Headers
const HEADER={
prometheus:`-- This file was protected using Prometheus Obfuscator [${DISCORD_LINK}]\n\n`,
luafree:`-- This file was protected using Lua Obfuscator [${DISCORD_LINK}]\n\n`
};

// Plugins & Presets
const LUAFREE_PRESETS={
'dystropic':{name:'Dystropic Malevolence',plugins:['MinifiyAll','EncryptStrings','ControlFlowFlattenAllBlocks','MixedBooleanArithmetic','JunkifyAllIfStatements','TableIndirection','BytecodeShuffle','MutateAllLiterals','JunkCode']},
'chaotic_evil':{name:'Chaotic Evil',plugins:['MinifiyAll','EncryptStrings','ControlFlowFlattenAllBlocks','JunkifyAllIfStatements','MutateAllLiterals','JunkCode','SwizzleLookups']},
'chaotic_good':{name:'Chaotic Good',plugins:['MinifiyAll','EncryptStrings','ControlFlowFlattenAllBlocks','MutateAllLiterals','SwizzleLookups']},
'obfuscate_v1':{name:'OBFUSCATE V1',plugins:['MinifiyAll','EncryptStrings','ControlFlowFlattenAllBlocks','JunkCode']},
'basic_good':{name:'Basic Good',plugins:['MinifiyAll','EncryptStrings','ControlFlowFlattenAllBlocks']},
'basic_minimal':{name:'Basic Minimal',plugins:['MinifiyAll','EncryptStrings']}
};

// ========== SLASH COMMANDS DEFINITION ==========
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
.addSubcommand(s=>s.setName('create').setDescription('Create key').addStringOption(o=>o.setName('note').setDescription('Note')))
.addSubcommand(s=>s.setName('batch').setDescription('Batch create').addIntegerOption(o=>o.setName('count').setDescription('Count').setRequired(true)))
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

// ========== REGISTER COMMANDS FUNCTION ==========
async function registerCommands(guildId=null){
if(!CLIENT_ID){
console.log('⚠️ CLIENT_ID not set - cannot register slash commands');
return{success:false,error:'CLIENT_ID not set'};
}

try{
const rest=new REST({version:'10'}).setToken(TOKEN);
const commands=buildCommands();

if(guildId){
// Register per guild (instant)
console.log(`📝 Registering ${commands.length} commands to guild ${guildId}...`);
await rest.put(Routes.applicationGuildCommands(CLIENT_ID,guildId),{body:commands});
console.log(`✅ Commands registered to guild ${guildId}`);
return{success:true,type:'guild',guildId,count:commands.length};
}else{
// Register global (takes up to 1 hour)
console.log(`📝 Registering ${commands.length} global commands...`);
await rest.put(Routes.applicationCommands(CLIENT_ID),{body:commands});
console.log('✅ Global commands registered (may take up to 1 hour to appear)');
return{success:true,type:'global',count:commands.length};
}
}catch(e){
console.error('❌ Failed to register commands:',e.message);
return{success:false,error:e.message};
}
}

// ========== CLEAR COMMANDS FUNCTION ==========
async function clearCommands(guildId=null){
if(!CLIENT_ID)return{success:false,error:'CLIENT_ID not set'};

try{
const rest=new REST({version:'10'}).setToken(TOKEN);

if(guildId){
await rest.put(Routes.applicationGuildCommands(CLIENT_ID,guildId),{body:[]});
console.log(`🗑️ Cleared commands from guild ${guildId}`);
}else{
await rest.put(Routes.applicationCommands(CLIENT_ID),{body:[]});
console.log('🗑️ Cleared global commands');
}
return{success:true};
}catch(e){
console.error('❌ Failed to clear:',e.message);
return{success:false,error:e.message};
}
}

// ========== BOT READY ==========
client.once('ready',async()=>{
console.log('═══════════════════════════════════════');
console.log(`🤖 Bot: ${client.user.tag}`);
console.log(`📋 CLIENT_ID: ${CLIENT_ID||'NOT SET!'}`);
console.log(`🔑 JNKIE_API: ${JNKIE_API_KEY?'SET':'NOT SET'}`);
console.log(`🔮 LUAFREE_API: ${LUAFREE_API_KEY?'SET':'NOT SET'}`);
console.log(`📦 SERVICE_ID: ${SERVICE_ID}`);
console.log('═══════════════════════════════════════');

if(!CLIENT_ID){
console.log('\n⚠️ WARNING: CLIENT_ID not set!');
console.log('Slash commands will NOT work.');
console.log('Use !register to register commands per guild.');
console.log('Or set CLIENT_ID in environment variables.\n');
}else{
// Auto register on startup
const result=await registerCommands();
if(!result.success){
console.log('Try using !register in a guild to register per-guild commands');
}
}
});

// ========== MESSAGE COMMANDS (For registration & fallback) ==========
client.on('messageCreate',async msg=>{
if(msg.author.bot)return;
const content=msg.content.trim().toLowerCase();
const args=msg.content.trim().split(/\s+/).slice(1);

// !register - Register slash commands to this guild
if(content==='!register'){
const statusMsg=await msg.reply('📝 Registering slash commands...');
const result=await registerCommands(msg.guild.id);
if(result.success){
await statusMsg.edit(`✅ **${result.count} commands registered!**\n\nSlash commands should appear immediately.\nType \`/\` to see them.`);
}else{
await statusMsg.edit(`❌ Failed: ${result.error}\n\nMake sure CLIENT_ID is set correctly.`);
}
return;
}

// !reset - Clear and re-register commands
if(content==='!reset'){
const statusMsg=await msg.reply('🔄 Resetting commands...');
await clearCommands(msg.guild.id);
await new Promise(r=>setTimeout(r,1000));
const result=await registerCommands(msg.guild.id);
if(result.success){
await statusMsg.edit(`✅ **Commands reset!**\n${result.count} commands registered.`);
}else{
await statusMsg.edit(`❌ Failed: ${result.error}`);
}
return;
}

// !clearglobal - Clear global commands
if(content==='!clearglobal'){
const result=await clearCommands();
await msg.reply(result.success?'✅ Global commands cleared':'❌ '+result.error);
return;
}

// !info - Show bot info
if(content==='!info'){
const embed=new EmbedBuilder()
.setTitle('Bot Information')
.setColor(0x5865F2)
.addFields(
{name:'Bot',value:client.user.tag,inline:true},
{name:'CLIENT_ID',value:CLIENT_ID||'❌ NOT SET',inline:true},
{name:'Guilds',value:String(client.guilds.cache.size),inline:true},
{name:'JNKIE API',value:JNKIE_API_KEY?'✅':'❌',inline:true},
{name:'LuaFree API',value:LUAFREE_API_KEY?'✅':'❌',inline:true},
{name:'Service ID',value:SERVICE_ID,inline:true}
)
.setDescription('**Commands:**\n`!register` - Register slash commands\n`!reset` - Reset commands\n`!info` - This info');
await msg.reply({embeds:[embed]});
return;
}

// !help
if(content==='!help'){
await msg.reply({embeds:[new EmbedBuilder()
.setTitle('Help')
.setColor(0x5865F2)
.setDescription(`**Setup Commands:**\n\`!register\` - Register slash commands to this server\n\`!reset\` - Reset and re-register commands\n\`!info\` - Show bot info\n\n**After registering, use slash commands:**\n\`/obf\` - Prometheus\n\`/lua\` - Lua Free\n\`/key\` - Key management\n\`/service\` - Services\n\`/help\` - Full help`)
]});
return;
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

// PROMETHEUS
if(cmd==='obf'){
const file=i.options.getAttachment('file');
const preset=i.options.getString('preset')||'Minify';
if(!file.name.endsWith('.lua'))return i.reply({content:'File harus .lua',ephemeral:true});

await i.deferReply();
const script=await downloadFile(file.url);
const result=await prometheusObf(script,preset);

if(result.success){
const code=HEADER.prometheus+result.code;
const embed=new EmbedBuilder().setTitle('Prometheus Obfuscator').setColor(0x00ff00)
.addFields({name:'Preset',value:preset,inline:true},{name:'Size',value:formatSize(code.length),inline:true})
.setFooter({text:DISCORD_LINK});
return i.editReply({embeds:[embed],files:[new AttachmentBuilder(Buffer.from(code),{name:`Prometheus_${preset}_${Date.now()}.lua`})]});
}
return i.editReply(`Failed: ${result.error}`);
}

// LUA FREE CUSTOM
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
const script=await downloadFile(file.url);
const result=await luaFreeObf(script,plugins);

if(result.success){
const code=HEADER.luafree+result.code;
const embed=new EmbedBuilder().setTitle('Lua Obfuscator').setColor(0x00ff00)
.addFields({name:'Plugins',value:Object.keys(plugins).join(', ')},{name:'Size',value:formatSize(code.length),inline:true})
.setFooter({text:DISCORD_LINK});
return i.editReply({embeds:[embed],files:[new AttachmentBuilder(Buffer.from(code),{name:`LuaFree_${Date.now()}.lua`})]});
}
return i.editReply(`Failed: ${result.error}`);
}

// LUA FREE PRESET
if(cmd==='luapreset'){
if(!LUAFREE_API_KEY)return i.reply({content:'LUAFREE_API_KEY not set',ephemeral:true});
const file=i.options.getAttachment('file');
const presetKey=i.options.getString('preset');
if(!file.name.endsWith('.lua'))return i.reply({content:'File harus .lua',ephemeral:true});

const preset=LUAFREE_PRESETS[presetKey];
const plugins={};
preset.plugins.forEach(p=>plugins[p]=true);

await i.deferReply();
const script=await downloadFile(file.url);
const result=await luaFreeObf(script,plugins);

if(result.success){
const code=HEADER.luafree+result.code;
const embed=new EmbedBuilder().setTitle('Lua Obfuscator').setColor(0x00ff00)
.addFields({name:'Preset',value:preset.name},{name:'Plugins',value:preset.plugins.join(', ')},{name:'Size',value:formatSize(code.length),inline:true})
.setFooter({text:DISCORD_LINK});
return i.editReply({embeds:[embed],files:[new AttachmentBuilder(Buffer.from(code),{name:`LuaFree_${presetKey}_${Date.now()}.lua`})]});
}
return i.editReply(`Failed: ${result.error}`);
}

// KEY
if(cmd==='key'){
if(!JNKIE_API_KEY)return i.reply({content:'JNKIE_API_KEY not set',ephemeral:true});
const sub=i.options.getSubcommand();

if(sub==='list'){
await i.deferReply();
const r=await jnkieReq('GET',`/keys?serviceId=${SERVICE_ID}&limit=20`);
let items=r.data?.keys||r.data||[];if(!Array.isArray(items))items=[];
const list=items.slice(0,15).map((k,idx)=>`${idx+1}. \`${String(k.key_value||k.id).substring(0,25)}...\` ID:\`${k.id}\``).join('\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle('Keys').setColor(0x2ecc71).setDescription(list||'No keys').setFooter({text:`Total: ${items.length}`})]});
}

if(sub==='create'){
const note=i.options.getString('note')||'Bot';
await i.deferReply();
const r=await jnkieReq('POST','/keys',{serviceId:parseInt(SERVICE_ID),note,maxHwids:3});
const key=r.data?.key?.key_value||r.data?.key_value;
return i.editReply(r.ok?{embeds:[new EmbedBuilder().setTitle('Key Created').setColor(0x2ecc71).setDescription(`\`\`\`${key||JSON.stringify(r.data)}\`\`\``)]}:`Error: ${r.raw?.substring(0,500)}`);
}

if(sub==='batch'){
const count=i.options.getInteger('count')||5;
await i.deferReply();
const r=await jnkieReq('POST','/keys/batch',{serviceId:parseInt(SERVICE_ID),count,note:'Batch',maxHwids:3});
if(!r.ok)return i.editReply(`Error: ${r.raw?.substring(0,500)}`);
let keys=r.data?.keys||r.data||[];
return i.editReply({embeds:[new EmbedBuilder().setTitle(`${keys.length} Keys Created`).setColor(0x2ecc71).setDescription(keys.slice(0,15).map((k,idx)=>`${idx+1}. \`${k.key_value||k}\``).join('\n'))]});
}

if(sub==='delete'){
await i.deferReply();
const r=await jnkieReq('DELETE',`/keys/${i.options.getString('id')}`);
return i.editReply(r.ok?'Deleted':'Error: '+r.raw?.substring(0,300));
}

if(sub==='reset'){
await i.deferReply();
const r=await jnkieReq('POST',`/keys/${i.options.getString('id')}/reset-hwid`);
return i.editReply(r.ok?'HWID Reset':'Error: '+r.raw?.substring(0,300));
}
return;
}

// SERVICE
if(cmd==='service'){
if(!JNKIE_API_KEY)return i.reply({content:'JNKIE_API_KEY not set',ephemeral:true});
const sub=i.options.getSubcommand();

if(sub==='list'){
await i.deferReply();
const r=await jnkieReq('GET','/services');
let items=r.data?.services||r.data||[];if(!Array.isArray(items))items=[items].filter(Boolean);
return i.editReply({embeds:[new EmbedBuilder().setTitle('Services').setColor(0x3498db).setDescription(items.map(s=>`\`${s.id}\` **${s.name||'?'}**`).join('\n')||'No services')]});
}

if(sub==='create'){
await i.deferReply();
const r=await jnkieReq('POST','/services',{name:i.options.getString('name'),description:'Bot',is_premium:false,keyless_mode:false});
return i.editReply(r.ok?`Created: \`${r.data?.service?.id||r.data?.id}\``:'Error: '+r.raw?.substring(0,400));
}

if(sub==='delete'){
await i.deferReply();
const r=await jnkieReq('DELETE',`/services/${i.options.getString('id')}`);
return i.editReply(r.ok?'Deleted':'Error: '+r.raw?.substring(0,300));
}
return;
}

// PROVIDER
if(cmd==='provider'){
if(!JNKIE_API_KEY)return i.reply({content:'JNKIE_API_KEY not set',ephemeral:true});
const sub=i.options.getSubcommand();

if(sub==='list'){
await i.deferReply();
const r=await jnkieReq('GET','/providers');
let items=r.data?.providers||r.data||[];if(!Array.isArray(items))items=[items].filter(Boolean);
return i.editReply({embeds:[new EmbedBuilder().setTitle('Providers').setColor(0xe67e22).setDescription(items.map(p=>`\`${p.id}\` **${p.name||'?'}**`).join('\n')||'No providers')]});
}

if(sub==='create'){
await i.deferReply();
const r=await jnkieReq('POST','/providers',{name:i.options.getString('name'),key_valid_minutes:60,is_active:true});
return i.editReply(r.ok?`Created: \`${r.data?.provider?.id||r.data?.id}\``:'Error: '+r.raw?.substring(0,300));
}

if(sub==='delete'){
await i.deferReply();
const r=await jnkieReq('DELETE',`/providers/${i.options.getString('id')}`);
return i.editReply(r.ok?'Deleted':'Error: '+r.raw?.substring(0,300));
}
return;
}

// INTEGRATION
if(cmd==='integration'){
if(!JNKIE_API_KEY)return i.reply({content:'JNKIE_API_KEY not set',ephemeral:true});
const sub=i.options.getSubcommand();

if(sub==='list'){
await i.deferReply();
const r=await jnkieReq('GET','/integrations');
let items=r.data?.integrations||r.data||[];if(!Array.isArray(items))items=[items].filter(Boolean);
return i.editReply({embeds:[new EmbedBuilder().setTitle('Integrations').setColor(0x9b59b6).setDescription(items.map(x=>`\`${x.id}\` **${x.name||'?'}** (${x.type||'?'})`).join('\n')||'No integrations')]});
}

if(sub==='types'){
await i.deferReply();
const r=await jnkieReq('GET','/integrations/types');
return i.editReply(`\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1900)}\n\`\`\``);
}
return;
}

// MENU
if(cmd==='menu'){
const embed=new EmbedBuilder().setTitle('Menu').setColor(0x5865F2)
.setDescription(`**Obfuscate:**\n\`/obf\` - Prometheus\n\`/lua\` - Lua Free Custom\n\`/luapreset\` - Lua Free Preset\n\n**Management:**\n\`/key\` - Keys\n\`/service\` - Services\n\`/provider\` - Providers`);
const row=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('key_list').setLabel('Keys').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('key_create').setLabel('Create Key').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('status').setLabel('Status').setStyle(ButtonStyle.Secondary)
);
return i.reply({embeds:[embed],components:[row]});
}

// STATUS
if(cmd==='status'){
await i.deferReply();
const s=await jnkieReq('GET','/services');
const p=await jnkieReq('GET','/providers');
const embed=new EmbedBuilder().setTitle('Status').setColor(0x2ecc71).addFields(
{name:'Bot',value:'Online',inline:true},
{name:'jnkie',value:JNKIE_API_KEY?'OK':'Not Set',inline:true},
{name:'LuaFree',value:LUAFREE_API_KEY?'OK':'Not Set',inline:true},
{name:'Services',value:String((s.data?.services||s.data||[]).length||0),inline:true},
{name:'Providers',value:String((p.data?.providers||p.data||[]).length||0),inline:true},
{name:'Service ID',value:SERVICE_ID,inline:true}
);
return i.editReply({embeds:[embed]});
}

// HELP
if(cmd==='help'){
return i.reply({embeds:[new EmbedBuilder().setTitle('Help').setColor(0x5865F2)
.addFields(
{name:'Obfuscate',value:'`/obf` - Prometheus\n`/lua` - Lua Free Custom\n`/luapreset` - Lua Free Preset'},
{name:'Keys',value:'`/key list` `/key create` `/key batch`\n`/key delete` `/key reset`'},
{name:'Management',value:'`/service` `/provider` `/integration`'}
).setFooter({text:DISCORD_LINK})]});
}
}

// Button Handler
async function handleButton(i){
if(i.customId==='key_list'){
await i.deferUpdate();
const r=await jnkieReq('GET',`/keys?serviceId=${SERVICE_ID}&limit=15`);
let items=r.data?.keys||r.data||[];if(!Array.isArray(items))items=[];
const list=items.slice(0,10).map((k,idx)=>`${idx+1}. \`${String(k.key_value||k.id).substring(0,22)}...\``).join('\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle('Keys').setColor(0x2ecc71).setDescription(list||'No keys')],components:[]});
}
if(i.customId==='key_create'){
return i.showModal(new ModalBuilder().setCustomId('modal_key').setTitle('Create Key').addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('note').setLabel('Note').setStyle(TextInputStyle.Short).setRequired(false))
));
}
if(i.customId==='status'){
await i.deferUpdate();
const s=await jnkieReq('GET','/services');
return i.editReply({embeds:[new EmbedBuilder().setTitle('Status').setColor(0x2ecc71)
.addFields({name:'Services',value:String((s.data?.services||[]).length||0)},{name:'API',value:JNKIE_API_KEY?'OK':'Not Set'})],components:[]});
}
await i.deferUpdate();
}

// Modal Handler
async function handleModal(i){
if(i.customId==='modal_key'){
const note=i.fields.getTextInputValue('note')||'Bot';
await i.deferReply();
const r=await jnkieReq('POST','/keys',{serviceId:parseInt(SERVICE_ID),note,maxHwids:3});
return i.editReply(r.ok?`Key: \`\`\`${r.data?.key?.key_value||JSON.stringify(r.data)}\`\`\``:'Error');
}
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
function formatSize(b){return b<1024?b+' B':b<1048576?(b/1024).toFixed(1)+' KB':(b/1048576).toFixed(1)+' MB';}

client.login(TOKEN);
