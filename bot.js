const{Client,GatewayIntentBits,AttachmentBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,SlashCommandBuilder,REST,Routes}=require('discord.js');
const{exec}=require('child_process');const fs=require('fs');const path=require('path');const http=require('http');const https=require('https');const{promisify}=require('util');const execAsync=promisify(exec);

// ========== HTTP SERVER ==========
const PORT=process.env.PORT||3000;
http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/plain'});res.end('OK');}).listen(PORT,()=>console.log(`[HTTP] Port ${PORT}`));

// ========== CLIENT ==========
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent]});

// ========== CONFIG ==========
const TOKEN=process.env.DISCORD_TOKEN;
const CLIENT_ID=process.env.CLIENT_ID;
const PROMETHEUS_PATH=process.env.PROMETHEUS_PATH||'/app/prometheus';
const JNKIE_API_KEY=process.env.JNKIE_API_KEY||'';
const LUAFREE_API_KEY=process.env.LUAFREE_API_KEY||'';
const SERVICE_ID=process.env.JNKIE_SERVICE_ID||'';
const PROVIDER_ID=process.env.JNKIE_PROVIDER_ID||'';
const DISCORD_LINK=process.env.DISCORD_LINK||'https://discord.gg/yourinvite';
const ADMIN_IDS=(process.env.ADMIN_IDS||'').split(',').filter(Boolean);
const AUTO_REGISTER=process.env.AUTO_REGISTER!=='false'; // Default true

if(!TOKEN){console.error('❌ DISCORD_TOKEN NOT FOUND');process.exit(1);}
if(!CLIENT_ID){console.error('❌ CLIENT_ID NOT FOUND');process.exit(1);}

// ========== HELPERS ==========
function safeInt(val,def=0){if(!val||val==='')return def;const p=parseInt(String(val).trim(),10);return isNaN(p)?def:p;}
function isAdmin(uid){return ADMIN_IDS.length===0||ADMIN_IDS.includes(String(uid));}
function checkConfig(){const e=[];if(!JNKIE_API_KEY)e.push('JNKIE_API_KEY');if(!SERVICE_ID)e.push('JNKIE_SERVICE_ID');if(!PROVIDER_ID)e.push('JNKIE_PROVIDER_ID');return{valid:e.length===0,missing:e};}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function log(tag,msg){console.log(`[${new Date().toISOString().substr(11,8)}][${tag}] ${msg}`);}

// ========== COLORS & HEADERS ==========
const COLORS={success:0x00ff00,error:0xff0000,warning:0xff9900,info:0x5865F2,primary:0x2ecc71};
const HEADER={
prometheus:`--[[\n  Protected by Prometheus\n  ${DISCORD_LINK}\n]]--\n\n`,
luafree:`--[[\n  Protected by LuaObfuscator\n  ${DISCORD_LINK}\n]]--\n\n`
};

// ========== PRESETS ==========
const LUAFREE_PRESETS={
'maximum':{name:'💀 Maximum',desc:'VM + All',cat:'vm',cfg:{MinifiyAll:false,Virtualize:true,EncryptStrings:true,MixedBooleanArithmetic:true,JunkifyAllIfStatements:true,ControlFlowFlattenV1:true,MutateAllLiterals:true,TableIndirection:true,BytecodeShuffle:true,JunkCode:true}},
'heavy':{name:'😈 Heavy',desc:'VM + Strong',cat:'vm',cfg:{MinifiyAll:false,Virtualize:true,EncryptStrings:true,ControlFlowFlattenV1:true,JunkifyAllIfStatements:true,MutateAllLiterals:true,JunkCode:true}},
'standard':{name:'🔒 Standard',desc:'VM + Basic',cat:'vm',cfg:{MinifiyAll:false,Virtualize:true,EncryptStrings:true,ControlFlowFlattenV1:true,JunkCode:true}},
'controlflow':{name:'🌀 ControlFlow',desc:'Heavy CF',cat:'trad',cfg:{MinifiyAll:false,EncryptStrings:true,ControlFlowFlattenV1:true,ControlFlowFlattenV2:true,MutateAllLiterals:true,JunkCode:true}},
'strings':{name:'🔐 Strings',desc:'String focus',cat:'trad',cfg:{MinifiyAll:false,EncryptStrings:true,MutateAllLiterals:true,TableIndirection:true}},
'balanced':{name:'⚖️ Balanced',desc:'Balanced',cat:'trad',cfg:{MinifiyAll:false,EncryptStrings:true,ControlFlowFlattenV1:true,MutateAllLiterals:true,JunkCode:true}},
'light':{name:'✨ Light',desc:'Light',cat:'trad',cfg:{MinifiyAll:false,EncryptStrings:true,MutateAllLiterals:true}},
'minify':{name:'📄 Minify',desc:'Minify only',cat:'min',cfg:{MinifiyAll:true}}
};

// ========== SLASH COMMANDS ==========
function buildCommands(){
const choices=Object.entries(LUAFREE_PRESETS).slice(0,25).map(([k,v])=>({name:`${v.name} - ${v.desc}`,value:k}));
return[
new SlashCommandBuilder().setName('menu').setDescription('📚 Main Menu'),
new SlashCommandBuilder().setName('help').setDescription('❓ Help'),
new SlashCommandBuilder().setName('status').setDescription('📊 Status'),
new SlashCommandBuilder().setName('invite').setDescription('🔗 Get bot invite link'),

new SlashCommandBuilder().setName('obf').setDescription('🔒 Prometheus Obfuscator').addAttachmentOption(o=>o.setName('file').setDescription('.lua file').setRequired(true)).addStringOption(o=>o.setName('preset').setDescription('Preset').addChoices({name:'Minify',value:'Minify'},{name:'Weak',value:'Weak'},{name:'Medium',value:'Medium'})),
new SlashCommandBuilder().setName('lua').setDescription('🔒 LuaFree Custom').addAttachmentOption(o=>o.setName('file').setDescription('.lua file').setRequired(true)).addBooleanOption(o=>o.setName('virtualize').setDescription('VM')).addBooleanOption(o=>o.setName('encrypt').setDescription('Encrypt')).addBooleanOption(o=>o.setName('controlflow').setDescription('CF')).addBooleanOption(o=>o.setName('junk').setDescription('Junk')).addBooleanOption(o=>o.setName('mutate').setDescription('Mutate')).addBooleanOption(o=>o.setName('minify').setDescription('Minify')),
new SlashCommandBuilder().setName('luapreset').setDescription('🔒 LuaFree Preset').addAttachmentOption(o=>o.setName('file').setDescription('.lua file').setRequired(true)).addStringOption(o=>o.setName('preset').setDescription('Preset').setRequired(true).addChoices(...choices)),
new SlashCommandBuilder().setName('testlua').setDescription('🧪 Test LuaFree'),
new SlashCommandBuilder().setName('presets').setDescription('📋 Show presets'),

new SlashCommandBuilder().setName('panel').setDescription('🎛️ Jnkie Panel'),
new SlashCommandBuilder().setName('keys').setDescription('🔑 View keys'),
new SlashCommandBuilder().setName('createkey').setDescription('🔑 Create key'),
new SlashCommandBuilder().setName('config').setDescription('⚙️ Config')
].map(c=>c.toJSON());
}

// ========== COMMAND REGISTRATION ==========
async function clearAllCommands(){
log('REG','Clearing all commands...');
const rest=new REST({version:'10'}).setToken(TOKEN);
try{
// Clear global
await rest.put(Routes.applicationCommands(CLIENT_ID),{body:[]});
log('REG','Global commands cleared');

// Clear per-guild
for(const[guildId]of client.guilds.cache){
try{
await rest.put(Routes.applicationGuildCommands(CLIENT_ID,guildId),{body:[]});
log('REG',`Guild ${guildId} cleared`);
}catch(e){log('REG',`Guild ${guildId} skip: ${e.message}`);}
}
return{success:true};
}catch(e){return{success:false,error:e.message};}
}

async function registerGlobal(){
log('REG','Registering global commands...');
const rest=new REST({version:'10'}).setToken(TOKEN);
try{
const cmds=buildCommands();
await rest.put(Routes.applicationCommands(CLIENT_ID),{body:cmds});
log('REG',`${cmds.length} global commands registered`);
return{success:true,count:cmds.length};
}catch(e){
log('REG',`Global failed: ${e.message}`);
return{success:false,error:e.message};
}
}

async function registerGuild(guildId){
log('REG',`Registering to guild ${guildId}...`);
const rest=new REST({version:'10'}).setToken(TOKEN);
try{
const cmds=buildCommands();
await rest.put(Routes.applicationGuildCommands(CLIENT_ID,guildId),{body:cmds});
log('REG',`${cmds.length} commands registered to ${guildId}`);
return{success:true,count:cmds.length};
}catch(e){
log('REG',`Guild ${guildId} failed: ${e.message}`);
return{success:false,error:e.message};
}
}

async function autoRegister(){
log('REG','=== AUTO REGISTRATION START ===');

// Method 1: Try global first
log('REG','Trying global registration...');
const globalResult=await registerGlobal();

if(globalResult.success){
log('REG','✅ Global registration success!');
return;
}

log('REG','Global failed, trying per-guild...');

// Method 2: Per-guild fallback
let successCount=0;
for(const[guildId,guild]of client.guilds.cache){
log('REG',`Registering to: ${guild.name} (${guildId})`);
const result=await registerGuild(guildId);
if(result.success)successCount++;
await sleep(1000); // Rate limit protection
}

log('REG',`=== DONE: ${successCount}/${client.guilds.cache.size} guilds ===`);
}

// ========== READY ==========
client.once('ready',async()=>{
console.log('');
console.log('╔════════════════════════════════════════╗');
console.log(`║  Bot: ${client.user.tag.padEnd(31)}║`);
console.log(`║  Servers: ${String(client.guilds.cache.size).padEnd(28)}║`);
console.log(`║  Jnkie: ${(JNKIE_API_KEY?'✅':'❌').padEnd(30)}║`);
console.log(`║  LuaFree: ${(LUAFREE_API_KEY?'✅':'❌').padEnd(28)}║`);
console.log(`║  Service: ${(SERVICE_ID||'NOT SET').padEnd(28)}║`);
console.log(`║  Provider: ${(PROVIDER_ID||'NOT SET').padEnd(27)}║`);
console.log(`║  Admins: ${(ADMIN_IDS.length?ADMIN_IDS.length+' users':'Everyone').padEnd(29)}║`);
console.log('╚════════════════════════════════════════╝');
console.log('');

// Auto register
if(AUTO_REGISTER){
await sleep(2000); // Wait for cache
await autoRegister();
}

client.user.setActivity('/menu | /help',{type:0});
});

// ========== GUILD JOIN - Auto register ==========
client.on('guildCreate',async guild=>{
log('GUILD',`Joined: ${guild.name} (${guild.id})`);
await sleep(1000);
const result=await registerGuild(guild.id);
log('GUILD',result.success?`✅ Commands registered to ${guild.name}`:`❌ Failed: ${result.error}`);
});

// ========== MESSAGE COMMANDS ==========
client.on('messageCreate',async msg=>{
if(msg.author.bot)return;
const content=msg.content.trim().toLowerCase();

// Admin commands
if(!isAdmin(msg.author.id)){
if(content.startsWith('!'))return msg.reply('❌ Admin only').catch(()=>{});
return;
}

if(content==='!register'){
const m=await msg.reply('⏳ Registering to this server...');
const r=await registerGuild(msg.guild.id);
await m.edit(r.success?`✅ ${r.count} commands registered!`:`❌ ${r.error}`);
}

if(content==='!global'){
const m=await msg.reply('⏳ Registering globally (may take up to 1 hour to propagate)...');
const r=await registerGlobal();
await m.edit(r.success?`✅ ${r.count} commands registered globally!\n⚠️ Global commands take up to 1 hour to appear.`:`❌ ${r.error}`);
}

if(content==='!reset'){
const m=await msg.reply('⏳ Clearing all commands...');
const r=await clearAllCommands();
if(r.success){
await m.edit('✅ All commands cleared! Re-registering...');
await sleep(2000);
const reg=await registerGuild(msg.guild.id);
await m.edit(reg.success?`✅ Reset complete! ${reg.count} commands registered.`:`✅ Cleared but register failed: ${reg.error}`);
}else{
await m.edit(`❌ ${r.error}`);
}
}

if(content==='!info'||content==='!config'){
const check=checkConfig();
await msg.reply(`\`\`\`
╔═══════════════════════════════════╗
║         BOT CONFIGURATION         ║
╠═══════════════════════════════════╣
║ Client ID: ${CLIENT_ID.substring(0,18)}...
║ Jnkie API: ${JNKIE_API_KEY?'✅ Set':'❌ NOT SET'}
║ Service ID: ${SERVICE_ID||'❌ NOT SET'}
║ Provider ID: ${PROVIDER_ID||'❌ NOT SET'}
║ LuaFree API: ${LUAFREE_API_KEY?'✅ Set':'❌ NOT SET'}
║ Admins: ${ADMIN_IDS.join(',')||'Everyone'}
║ Status: ${check.valid?'✅ Ready':'❌ Missing: '+check.missing.join(',')}
╚═══════════════════════════════════╝
\`\`\``);
}

if(content==='!invite'){
const url=`https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot%20applications.commands`;
await msg.reply(`**🔗 Invite Bot:**\n${url}\n\n⚠️ Make sure to include \`applications.commands\` scope!`);
}

if(content==='!help'){
await msg.reply(`**Admin Commands:**
\`!register\` - Register commands to this server
\`!global\` - Register commands globally
\`!reset\` - Clear all & re-register
\`!info\` - Show config
\`!invite\` - Get invite link
\`!help\` - This message`);
}
});

// ========== INTERACTION HANDLER ==========
client.on('interactionCreate',async i=>{
try{
if(i.isChatInputCommand())await handleSlash(i);
else if(i.isButton())await handleButton(i);
else if(i.isModalSubmit())await handleModal(i);
}catch(e){
log('ERR',e.message);
const fn=i.replied||i.deferred?i.followUp.bind(i):i.reply.bind(i);
fn({content:`❌ ${e.message}`,ephemeral:true}).catch(()=>{});
}
});

// ========== SLASH HANDLER ==========
async function handleSlash(i){
const cmd=i.commandName;

// === PUBLIC ===
if(cmd==='menu'){
const adm=isAdmin(i.user.id);
return i.reply({embeds:[new EmbedBuilder().setTitle('📚 Menu').setColor(COLORS.info)
.setDescription(adm?`**🔒 Obfuscation** *(Admin)*
\`/obf\` Prometheus
\`/lua\` LuaFree Custom
\`/luapreset\` LuaFree Preset
\`/testlua\` Test API
\`/presets\` Show presets

**🎛️ Jnkie** *(Admin)*
\`/panel\` Management
\`/keys\` View keys
\`/createkey\` Quick create
\`/config\` Configuration

**📖 Public**
\`/help\` Help
\`/status\` Status
\`/invite\` Invite link`:`**📖 Public Commands**
\`/help\` - Help
\`/status\` - Status
\`/invite\` - Invite link

*Admin commands require ADMIN_IDS*`).setFooter({text:adm?'👑 Admin':'👤 User'})]});
}

if(cmd==='help'){
return i.reply({embeds:[new EmbedBuilder().setTitle('❓ Help').setColor(COLORS.info)
.setDescription(`**Public:** /menu, /help, /status, /invite
**Admin:** /obf, /lua, /luapreset, /panel, /keys, /createkey
**Text:** !register, !global, !reset, !info, !invite`)]});
}

if(cmd==='status'){
await i.deferReply();
let jStatus='❌';
if(checkConfig().valid){const r=await jnkieReq('GET','/services');jStatus=r.ok?'✅':'⚠️';}
return i.editReply({embeds:[new EmbedBuilder().setTitle('📊 Status').setColor(COLORS.primary)
.addFields({name:'Bot',value:'✅',inline:true},{name:'Jnkie',value:jStatus,inline:true},{name:'LuaFree',value:LUAFREE_API_KEY?'✅':'❌',inline:true})]});
}

if(cmd==='invite'){
const url=`https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot%20applications.commands`;
return i.reply({embeds:[new EmbedBuilder().setTitle('🔗 Invite Bot').setColor(COLORS.info)
.setDescription(`[Click here to invite](${url})\n\n⚠️ **Important:** Make sure both \`bot\` and \`applications.commands\` scopes are included!`)]});
}

// === ADMIN CHECK ===
const adminCmds=['obf','lua','luapreset','testlua','presets','panel','keys','createkey','config'];
if(adminCmds.includes(cmd)&&!isAdmin(i.user.id)){
return i.reply({content:'❌ **Admin Only!**\n\nContact server admin or set `ADMIN_IDS` environment variable.',ephemeral:true});
}

// === CONFIG ===
if(cmd==='config'){
const c=checkConfig();
return i.reply({embeds:[new EmbedBuilder().setTitle('⚙️ Config').setColor(c.valid?COLORS.success:COLORS.error)
.addFields({name:'Jnkie API',value:JNKIE_API_KEY?'✅':'❌',inline:true},{name:'Service',value:SERVICE_ID||'❌',inline:true},{name:'Provider',value:PROVIDER_ID||'❌',inline:true},{name:'LuaFree',value:LUAFREE_API_KEY?'✅':'❌',inline:true},{name:'Status',value:c.valid?'✅ Ready':'❌ '+c.missing.join(', ')})],ephemeral:true});
}

// === PRESETS ===
if(cmd==='presets'){
const vm=Object.entries(LUAFREE_PRESETS).filter(([,v])=>v.cat==='vm').map(([,v])=>`${v.name}: ${v.desc}`).join('\n');
const tr=Object.entries(LUAFREE_PRESETS).filter(([,v])=>v.cat==='trad').map(([,v])=>`${v.name}: ${v.desc}`).join('\n');
return i.reply({embeds:[new EmbedBuilder().setTitle('📋 Presets').setColor(COLORS.info)
.addFields({name:'🖥️ VM-Based',value:vm},{name:'📝 Traditional',value:tr},{name:'📄 Utility',value:'Minify: Size reduction'})]});
}

// === TEST LUA ===
if(cmd==='testlua'){
if(!LUAFREE_API_KEY)return i.reply({content:'⚠️ LUAFREE_API_KEY not set',ephemeral:true});
await i.deferReply();
const test='local x="test";print(x);return x';
const r=await luaFreeObf(test,{MinifiyAll:false,Virtualize:true,EncryptStrings:true,JunkCode:true});
if(r.success){
const ratio=((r.code.length/test.length)*100).toFixed(0);
return i.editReply({embeds:[new EmbedBuilder().setTitle('🧪 Test').setColor(ratio>200?COLORS.success:COLORS.warning)
.addFields({name:'Status',value:ratio>200?'✅':'⚠️',inline:true},{name:'Ratio',value:`${ratio}%`,inline:true})
.setDescription(`\`\`\`lua\n${r.code.substring(0,300)}...\n\`\`\``)]});
}
return i.editReply(`❌ ${r.error}\n\`\`\`${r.debug||''}\`\`\``);
}

// === PROMETHEUS ===
if(cmd==='obf'){
const file=i.options.getAttachment('file');
const preset=i.options.getString('preset')||'Minify';
if(!file.name.endsWith('.lua'))return i.reply({content:'❌ .lua only',ephemeral:true});
await i.deferReply();
const script=await downloadFile(file.url);
const r=await prometheusObf(script,preset);
if(r.success){
const code=HEADER.prometheus+r.code;
return i.editReply({embeds:[new EmbedBuilder().setTitle('✅ Prometheus').setColor(COLORS.success).addFields({name:'Preset',value:preset,inline:true},{name:'Size',value:`${formatSize(script.length)}→${formatSize(code.length)}`,inline:true})],files:[new AttachmentBuilder(Buffer.from(code,'utf8'),{name:`obf_${Date.now()}.lua`})]});
}
return i.editReply(`❌ ${r.error}`);
}

// === LUA CUSTOM ===
if(cmd==='lua'){
if(!LUAFREE_API_KEY)return i.reply({content:'⚠️ LUAFREE_API_KEY not set',ephemeral:true});
const file=i.options.getAttachment('file');
if(!file.name.endsWith('.lua'))return i.reply({content:'❌ .lua only',ephemeral:true});

const cfg={MinifiyAll:false};
if(i.options.getBoolean('minify'))cfg.MinifiyAll=true;
if(i.options.getBoolean('virtualize'))cfg.Virtualize=true;
if(i.options.getBoolean('encrypt'))cfg.EncryptStrings=true;
if(i.options.getBoolean('controlflow'))cfg.ControlFlowFlattenV1=true;
if(i.options.getBoolean('junk'))cfg.JunkCode=true;
if(i.options.getBoolean('mutate'))cfg.MutateAllLiterals=true;

if(Object.keys(cfg).filter(k=>cfg[k]&&k!=='MinifiyAll').length===0&&!cfg.MinifiyAll){
cfg.EncryptStrings=true;cfg.ControlFlowFlattenV1=true;cfg.MutateAllLiterals=true;
}

await i.deferReply();
const script=await downloadFile(file.url);
const r=await luaFreeObf(script,cfg);
if(r.success){
const code=HEADER.luafree+(cfg.Virtualize?r.code:formatCode(r.code));
const ratio=((code.length/script.length)*100).toFixed(0);
return i.editReply({embeds:[new EmbedBuilder().setTitle(r.warning?'⚠️ LuaFree':'✅ LuaFree').setColor(r.warning?COLORS.warning:COLORS.success).addFields({name:'Plugins',value:Object.keys(cfg).filter(k=>cfg[k]).join(', ')},{name:'Size',value:`${formatSize(script.length)}→${formatSize(code.length)} (${ratio}%)`,inline:true})],files:[new AttachmentBuilder(Buffer.from(code,'utf8'),{name:`lua_${Date.now()}.lua`})]});
}
return i.editReply(`❌ ${r.error}\n\`\`\`${r.debug||''}\`\`\``);
}

// === LUA PRESET ===
if(cmd==='luapreset'){
if(!LUAFREE_API_KEY)return i.reply({content:'⚠️ LUAFREE_API_KEY not set',ephemeral:true});
const file=i.options.getAttachment('file');
const key=i.options.getString('preset');
if(!file.name.endsWith('.lua'))return i.reply({content:'❌ .lua only',ephemeral:true});
const preset=LUAFREE_PRESETS[key];
if(!preset)return i.reply({content:'❌ Invalid preset',ephemeral:true});

await i.deferReply();
const script=await downloadFile(file.url);
const r=await luaFreeObf(script,preset.cfg);
if(r.success){
const isVM=preset.cfg.Virtualize;
const code=HEADER.luafree+(isVM?r.code:formatCode(r.code));
const ratio=((code.length/script.length)*100).toFixed(0);
return i.editReply({embeds:[new EmbedBuilder().setTitle(r.warning?'⚠️ LuaFree':'✅ LuaFree').setColor(r.warning?COLORS.warning:COLORS.success).addFields({name:'Preset',value:preset.name,inline:true},{name:'Type',value:isVM?'🖥️ VM':'📝 Traditional',inline:true},{name:'Size',value:`${formatSize(script.length)}→${formatSize(code.length)} (${ratio}%)`,inline:true})],files:[new AttachmentBuilder(Buffer.from(code,'utf8'),{name:`lua_${key}_${Date.now()}.lua`})]});
}
return i.editReply(`❌ ${r.error}\n\`\`\`${r.debug||''}\`\`\``);
}

// === PANEL ===
if(cmd==='panel'){
const c=checkConfig();
if(!c.valid)return i.reply({content:`⚠️ Missing: ${c.missing.join(', ')}`,ephemeral:true});
return i.reply({embeds:[new EmbedBuilder().setTitle('🎛️ Panel').setColor(COLORS.info).setDescription(`**Service:** \`${SERVICE_ID}\`\n**Provider:** \`${PROVIDER_ID}\``)],components:panelBtns()});
}

// === KEYS ===
if(cmd==='keys'){
const c=checkConfig();if(!c.valid)return i.reply({content:`⚠️ Missing: ${c.missing.join(', ')}`,ephemeral:true});
await i.deferReply();
const r=await jnkieReq('GET',`/keys?service_id=${safeInt(SERVICE_ID)}&limit=100`);
if(!r.ok)return i.editReply(`❌\n\`\`\`json\n${JSON.stringify(r.data||r.error,null,2).substring(0,1500)}\n\`\`\``);
const keys=r.data?.keys||[];
if(!keys.length)return i.editReply({embeds:[new EmbedBuilder().setTitle('🔑 Keys').setColor(COLORS.warning).setDescription('No keys')]});
const preview=keys.slice(0,5).map((k,i)=>`**#${i+1}** ID:\`${k.id}\`\n\`\`\`${k.key_value}\`\`\``).join('\n');
const file=keys.map((k,i)=>`#${i+1} | ID:${k.id}\n${k.key_value}\nHWID:${k.hwids?.length||0}/${k.max_hwids||3}`).join('\n\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle(`🔑 Keys (${keys.length})`).setColor(COLORS.primary).setDescription(preview+'\n\n📎 Download for all')],files:[new AttachmentBuilder(Buffer.from(file,'utf8'),{name:'keys.txt'})],components:keyBtns()});
}

// === CREATE KEY ===
if(cmd==='createkey'){
const c=checkConfig();if(!c.valid)return i.reply({content:`⚠️ Missing: ${c.missing.join(', ')}`,ephemeral:true});
await i.deferReply();
const sid=safeInt(SERVICE_ID),pid=safeInt(PROVIDER_ID);
log('KEY',`Creating: service_id=${sid}, provider_id=${pid}`);
const r=await jnkieReq('POST','/keys',{service_id:sid,provider_id:pid,note:'Quick',max_hwids:3});
if(!r.ok)return i.editReply(`❌\n\`\`\`json\n${JSON.stringify(r.data||r.error,null,2).substring(0,1500)}\n\`\`\``);
const key=r.data?.key?.key_value||r.data?.key_value||'N/A';
return i.editReply({embeds:[new EmbedBuilder().setTitle('✅ Created').setColor(COLORS.success).setDescription(`\`\`\`\n${key}\n\`\`\``)]});
}
}

// ========== BUTTONS ==========
function panelBtns(){return[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('p_keys').setLabel('🔑 Keys').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('p_services').setLabel('📦 Services').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('p_providers').setLabel('🏢 Providers').setStyle(ButtonStyle.Primary)),new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('p_status').setLabel('📊').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId('p_refresh').setLabel('🔄').setStyle(ButtonStyle.Secondary))];}
function keyBtns(){return[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('k_create').setLabel('➕').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId('k_batch').setLabel('📦 Batch').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId('k_refresh').setLabel('🔄').setStyle(ButtonStyle.Primary)),new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('k_delete').setLabel('🗑️').setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId('k_reset').setLabel('Reset HWID').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId('k_export').setLabel('📥').setStyle(ButtonStyle.Secondary))];}
function serviceBtns(){return[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('s_list').setLabel('📋').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('s_create').setLabel('➕').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId('s_delete').setLabel('🗑️').setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId('p_home').setLabel('⬅️').setStyle(ButtonStyle.Secondary))];}
function providerBtns(){return[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('pr_list').setLabel('📋').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('pr_create').setLabel('➕').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId('pr_delete').setLabel('🗑️').setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId('p_home').setLabel('⬅️').setStyle(ButtonStyle.Secondary))];}

async function handleButton(i){
const id=i.customId;
if(!isAdmin(i.user.id))return i.reply({content:'❌ Admin only',ephemeral:true});

// Panel nav
if(id==='p_home')return i.update({embeds:[new EmbedBuilder().setTitle('🎛️ Panel').setColor(COLORS.info).setDescription(`Service: \`${SERVICE_ID}\`\nProvider: \`${PROVIDER_ID}\``)],components:panelBtns()});
if(id==='p_keys')return i.update({embeds:[new EmbedBuilder().setTitle('🔑 Keys').setColor(COLORS.primary)],components:keyBtns()});
if(id==='p_services')return i.update({embeds:[new EmbedBuilder().setTitle('📦 Services').setColor(COLORS.info)],components:serviceBtns()});
if(id==='p_providers')return i.update({embeds:[new EmbedBuilder().setTitle('🏢 Providers').setColor(COLORS.info)],components:providerBtns()});
if(id==='p_status'){await i.deferUpdate();const r=await jnkieReq('GET','/services');return i.editReply({embeds:[new EmbedBuilder().setTitle('📊').setColor(r.ok?COLORS.success:COLORS.error).addFields({name:'API',value:r.ok?'✅':'❌'})],components:panelBtns()});}
if(id==='p_refresh'){await i.deferUpdate();return i.editReply({embeds:[new EmbedBuilder().setTitle('🎛️ Panel').setColor(COLORS.info).setDescription(`Service: \`${SERVICE_ID}\`\nProvider: \`${PROVIDER_ID}\``)],components:panelBtns()});}

// Keys
if(id==='k_refresh'){
await i.deferUpdate();
const r=await jnkieReq('GET',`/keys?service_id=${safeInt(SERVICE_ID)}&limit=100`);
const keys=r.data?.keys||[];
const preview=keys.slice(0,5).map((k,idx)=>`**#${idx+1}** \`${k.id}\`\n\`\`\`${k.key_value}\`\`\``).join('\n');
const file=keys.map((k,idx)=>`#${idx+1} | ID:${k.id}\n${k.key_value}`).join('\n\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle(`🔑 Keys (${keys.length})`).setColor(COLORS.primary).setDescription(preview||'None')],files:keys.length?[new AttachmentBuilder(Buffer.from(file,'utf8'),{name:'keys.txt'})]:undefined,components:keyBtns()});
}
if(id==='k_create'){return i.showModal(new ModalBuilder().setCustomId('m_k_create').setTitle('Create Key').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('note').setLabel('Note').setStyle(TextInputStyle.Short).setRequired(false)),new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('hwid').setLabel('Max HWID').setStyle(TextInputStyle.Short).setValue('3').setRequired(false))));}
if(id==='k_batch'){return i.showModal(new ModalBuilder().setCustomId('m_k_batch').setTitle('Batch').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('count').setLabel('Count').setStyle(TextInputStyle.Short).setValue('5').setRequired(true)),new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('hwid').setLabel('Max HWID').setStyle(TextInputStyle.Short).setValue('3').setRequired(false))));}
if(id==='k_delete'){return i.showModal(new ModalBuilder().setCustomId('m_k_delete').setTitle('Delete').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('id').setLabel('Key ID').setStyle(TextInputStyle.Short).setRequired(true))));}
if(id==='k_reset'){return i.showModal(new ModalBuilder().setCustomId('m_k_reset').setTitle('Reset HWID').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('id').setLabel('Key ID').setStyle(TextInputStyle.Short).setRequired(true))));}
if(id==='k_export'){
await i.deferUpdate();
const r=await jnkieReq('GET',`/keys?service_id=${safeInt(SERVICE_ID)}&limit=500`);
const keys=r.data?.keys||[];
const list=keys.map(k=>k.key_value).join('\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle(`📥 ${keys.length}`).setColor(COLORS.success)],files:[new AttachmentBuilder(Buffer.from(list,'utf8'),{name:'export.txt'})],components:keyBtns()});
}

// Services
if(id==='s_list'){await i.deferUpdate();const r=await jnkieReq('GET','/services');const list=(r.data?.services||[]).map(s=>`\`${s.id}\` ${s.name}`).join('\n');return i.editReply({embeds:[new EmbedBuilder().setTitle('📦').setColor(COLORS.info).setDescription(list||'None')],components:serviceBtns()});}
if(id==='s_create'){return i.showModal(new ModalBuilder().setCustomId('m_s_create').setTitle('Create').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setRequired(true))));}
if(id==='s_delete'){return i.showModal(new ModalBuilder().setCustomId('m_s_delete').setTitle('Delete').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('id').setLabel('ID').setStyle(TextInputStyle.Short).setRequired(true))));}

// Providers
if(id==='pr_list'){await i.deferUpdate();const r=await jnkieReq('GET','/providers');const list=(r.data?.providers||[]).map(p=>`\`${p.id}\` ${p.name}`).join('\n');return i.editReply({embeds:[new EmbedBuilder().setTitle('🏢').setColor(COLORS.info).setDescription(list||'None')],components:providerBtns()});}
if(id==='pr_create'){return i.showModal(new ModalBuilder().setCustomId('m_pr_create').setTitle('Create').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setRequired(true)),new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('min').setLabel('Minutes').setStyle(TextInputStyle.Short).setValue('1440').setRequired(false))));}
if(id==='pr_delete'){return i.showModal(new ModalBuilder().setCustomId('m_pr_delete').setTitle('Delete').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('id').setLabel('ID').setStyle(TextInputStyle.Short).setRequired(true))));}

await i.deferUpdate();
}

// ========== MODALS ==========
async function handleModal(i){
const id=i.customId;
const sid=safeInt(SERVICE_ID),pid=safeInt(PROVIDER_ID);

if(id==='m_k_create'){
await i.deferReply();
const note=i.fields.getTextInputValue('note')||'Bot';
const hwid=safeInt(i.fields.getTextInputValue('hwid'),3);
log('KEY',`Create: service_id=${sid}, provider_id=${pid}`);
const r=await jnkieReq('POST','/keys',{service_id:sid,provider_id:pid,note,max_hwids:hwid});
if(!r.ok)return i.editReply(`❌\n\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1500)}\n\`\`\``);
return i.editReply({embeds:[new EmbedBuilder().setTitle('✅').setColor(COLORS.success).setDescription(`\`\`\`\n${r.data?.key?.key_value||r.data?.key_value}\n\`\`\``)]});
}

if(id==='m_k_batch'){
await i.deferReply();
const count=Math.min(50,safeInt(i.fields.getTextInputValue('count'),5));
const hwid=safeInt(i.fields.getTextInputValue('hwid'),3);
const r=await jnkieReq('POST','/keys/batch',{service_id:sid,provider_id:pid,count,note:'Batch',max_hwids:hwid});
if(!r.ok)return i.editReply(`❌\n\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1500)}\n\`\`\``);
const keys=r.data?.keys||[];
const list=keys.map(k=>k.key_value||k).join('\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle(`✅ ${keys.length}`).setColor(COLORS.success)],files:[new AttachmentBuilder(Buffer.from(list,'utf8'),{name:'batch.txt'})]});
}

if(id==='m_k_delete'){await i.deferReply();const r=await jnkieReq('DELETE',`/keys/${i.fields.getTextInputValue('id').trim()}`);return i.editReply(r.ok?'✅ Deleted':`❌ ${JSON.stringify(r.data||r.error)}`);}
if(id==='m_k_reset'){await i.deferReply();const r=await jnkieReq('POST',`/keys/${i.fields.getTextInputValue('id').trim()}/reset-hwid`);return i.editReply(r.ok?'✅ Reset':`❌ ${JSON.stringify(r.data||r.error)}`);}

if(id==='m_s_create'){await i.deferReply();const r=await jnkieReq('POST','/services',{name:i.fields.getTextInputValue('name'),description:'Bot',is_premium:false,keyless_mode:false});return i.editReply(r.ok?`✅ ID: \`${r.data?.service?.id||r.data?.id}\``:`❌ ${JSON.stringify(r.data||r.error)}`);}
if(id==='m_s_delete'){await i.deferReply();const r=await jnkieReq('DELETE',`/services/${i.fields.getTextInputValue('id').trim()}`);return i.editReply(r.ok?'✅':`❌ ${JSON.stringify(r.data||r.error)}`);}

if(id==='m_pr_create'){await i.deferReply();const r=await jnkieReq('POST','/providers',{name:i.fields.getTextInputValue('name'),key_valid_minutes:safeInt(i.fields.getTextInputValue('min'),1440),is_active:true});return i.editReply(r.ok?`✅ ID: \`${r.data?.provider?.id||r.data?.id}\``:`❌ ${JSON.stringify(r.data||r.error)}`);}
if(id==='m_pr_delete'){await i.deferReply();const r=await jnkieReq('DELETE',`/providers/${i.fields.getTextInputValue('id').trim()}`);return i.editReply(r.ok?'✅':`❌ ${JSON.stringify(r.data||r.error)}`);}
}

// ========== PROMETHEUS ==========
async function prometheusObf(script,preset){
const ts=Date.now(),inp=path.join(PROMETHEUS_PATH,`i${ts}.lua`),out=path.join(PROMETHEUS_PATH,`o${ts}.lua`);
try{fs.writeFileSync(inp,script.replace(/^\uFEFF/,'').trim(),'utf8');await execAsync(`cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset ${preset} "${inp}" --out "${out}"`,{timeout:120000});return fs.existsSync(out)?{success:true,code:fs.readFileSync(out,'utf8')}:{success:false,error:'No output'};}catch(e){return{success:false,error:e.message};}finally{[inp,out].forEach(f=>{try{fs.unlinkSync(f);}catch(e){}});}
}

// ========== LUA FREE ==========
async function luaFreeObf(script,cfg,retry=3){
const clean=script.replace(/^\uFEFF/,'').trim();
log('LUA',`Start: ${clean.length}B`);
for(let i=1;i<=retry;i++){
if(i>1)await sleep(2000);
try{
const s1=await httpPost('api.luaobfuscator.com','/v1/obfuscator/newscript',clean,{'Content-Type':'text/plain','apikey':LUAFREE_API_KEY},60000);
if(!s1?.sessionId){log('LUA',`S1 fail: ${JSON.stringify(s1).substring(0,100)}`);continue;}
await sleep(500);
const s2=await httpPost('api.luaobfuscator.com','/v1/obfuscator/obfuscate',JSON.stringify(cfg),{'Content-Type':'application/json','apikey':LUAFREE_API_KEY,'sessionId':s1.sessionId},180000);
if(!s2?.code){if((s2?.message||'').includes('Session'))continue;log('LUA',`S2 fail: ${JSON.stringify(s2).substring(0,100)}`);continue;}
const ratio=(s2.code.length/clean.length)*100;
log('LUA',`OK: ${s2.code.length}B (${ratio.toFixed(0)}%)`);
if(!cfg.MinifiyAll&&s2.code.length<clean.length&&i<retry)continue;
return{success:true,code:s2.code,warning:(!cfg.MinifiyAll&&ratio<150)?'LOW':null};
}catch(e){log('LUA',`Err: ${e.message}`);}}
return{success:false,error:'Failed after retries'};
}

// ========== HTTP ==========
function httpPost(host,path,body,headers,timeout=30000){
return new Promise(resolve=>{
const data=typeof body==='string'?body:JSON.stringify(body);
const req=https.request({hostname:host,port:443,path,method:'POST',headers:{...headers,'Content-Length':Buffer.byteLength(data)}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{try{resolve(JSON.parse(d));}catch(e){resolve({error:'Parse',raw:d.substring(0,200)});}});});
req.on('error',e=>resolve({error:e.message}));req.setTimeout(timeout,()=>{req.destroy();resolve({error:'Timeout'});});req.write(data);req.end();
});
}

function jnkieReq(method,endpoint,body=null){
return new Promise(resolve=>{
const data=body?JSON.stringify(body):'';
log('JNKIE',`${method} ${endpoint} ${data.substring(0,100)}`);
const req=https.request({hostname:'api.jnkie.com',port:443,path:`/api/v2${endpoint}`,method,headers:{'Authorization':`Bearer ${JNKIE_API_KEY}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{log('JNKIE',`${res.statusCode}: ${d.substring(0,100)}`);try{resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,data:JSON.parse(d)});}catch(e){resolve({ok:false,error:'Parse',raw:d});}});});
req.on('error',e=>resolve({ok:false,error:e.message}));req.setTimeout(15000,()=>{req.destroy();resolve({ok:false,error:'Timeout'});});if(body)req.write(data);req.end();
});
}

// ========== UTILS ==========
function downloadFile(url){return new Promise((r,j)=>{https.get(url,res=>{const d=[];res.on('data',c=>d.push(c));res.on('end',()=>r(Buffer.concat(d).toString('utf8')));}).on('error',j);});}
function formatSize(b){return b<1024?b+'B':b<1048576?(b/1024).toFixed(1)+'KB':(b/1048576).toFixed(1)+'MB';}
function formatCode(c){return c.replace(/;(\S)/g,';\n$1').replace(/\bend\b/g,'\nend\n').replace(/\n{3,}/g,'\n\n').trim();}

client.login(TOKEN);
