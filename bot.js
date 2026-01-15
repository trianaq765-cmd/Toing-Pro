const{Client,GatewayIntentBits,AttachmentBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,SlashCommandBuilder,REST,Routes}=require('discord.js');
const{exec}=require('child_process');const fs=require('fs');const path=require('path');const http=require('http');const https=require('https');const{promisify}=require('util');const execAsync=promisify(exec);

// ========== HTTP SERVER ==========
const PORT=process.env.PORT||3000;
http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/plain'});res.end('Bot Running!');}).listen(PORT,()=>console.log(`HTTP on port ${PORT}`));

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

if(!TOKEN){console.error('❌ DISCORD_TOKEN NOT FOUND');process.exit(1);}

// ========== HELPER FUNCTIONS ==========
function safeInt(val,defaultVal=0){
if(val===undefined||val===null||val==='')return defaultVal;
const parsed=parseInt(String(val).trim(),10);
return isNaN(parsed)?defaultVal:parsed;
}

function isAdmin(userId){
if(ADMIN_IDS.length===0)return true;
return ADMIN_IDS.includes(String(userId));
}

function checkConfig(){
const errors=[];
if(!JNKIE_API_KEY)errors.push('JNKIE_API_KEY');
if(!SERVICE_ID)errors.push('JNKIE_SERVICE_ID');
if(!PROVIDER_ID)errors.push('JNKIE_PROVIDER_ID');
return{valid:errors.length===0,missing:errors};
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

// ========== HEADERS ==========
const HEADER={
prometheus:`--[[\n  ╔═══════════════════════════════════════╗\n  ║  Protected by Prometheus Obfuscator  ║\n  ╚═══════════════════════════════════════╝\n]]--\n\n`,
luafree:`--[[\n  ╔═══════════════════════════════════════╗\n  ║    Protected by Lua Obfuscator       ║\n  ╚═══════════════════════════════════════╝\n]]--\n\n`
};

const COLORS={success:0x00ff00,error:0xff0000,warning:0xff9900,info:0x5865F2,primary:0x2ecc71,secondary:0x3498db,purple:0x9b59b6,orange:0xe67e22};

// ========== LUA FREE PRESETS ==========
// Preset dengan format output BERBEDA untuk variasi
const LUAFREE_PRESETS={
// === VIRTUALIZE PRESETS (VM Format - Maximum Protection) ===
'maximum':{
  name:'💀 Maximum Protection',
  desc:'VM + All Protections',
  category:'vm',
  config:{MinifiyAll:false,Virtualize:true,EncryptStrings:true,MixedBooleanArithmetic:true,JunkifyAllIfStatements:true,ControlFlowFlattenV1:true,MutateAllLiterals:true,TableIndirection:true,BytecodeShuffle:true,JunkCode:true}
},
'heavy':{
  name:'😈 Heavy Protection',
  desc:'VM + Strong Obfuscation',
  category:'vm',
  config:{MinifiyAll:false,Virtualize:true,EncryptStrings:true,ControlFlowFlattenV1:true,JunkifyAllIfStatements:true,MutateAllLiterals:true,JunkCode:true}
},
'standard_vm':{
  name:'🔒 Standard VM',
  desc:'VM + Basic Protection',
  category:'vm',
  config:{MinifiyAll:false,Virtualize:true,EncryptStrings:true,ControlFlowFlattenV1:true,JunkCode:true}
},

// === NON-VIRTUALIZE PRESETS (Traditional Format - Varied Output) ===
'controlflow':{
  name:'🌀 Control Flow',
  desc:'Heavy control flow obfuscation',
  category:'traditional',
  config:{MinifiyAll:false,EncryptStrings:true,ControlFlowFlattenV1:true,ControlFlowFlattenV2:true,MutateAllLiterals:true,JunkCode:true,MixedBooleanArithmetic:true}
},
'string_heavy':{
  name:'🔐 String Heavy',
  desc:'Focus on string encryption',
  category:'traditional',
  config:{MinifiyAll:false,EncryptStrings:true,MutateAllLiterals:true,TableIndirection:true,SwizzleLookups:true}
},
'junk_heavy':{
  name:'📦 Junk Heavy',
  desc:'Lots of junk code',
  category:'traditional',
  config:{MinifiyAll:false,EncryptStrings:true,JunkCode:true,JunkifyAllIfStatements:true,MixedBooleanArithmetic:true}
},
'balanced':{
  name:'⚖️ Balanced',
  desc:'Balanced protection',
  category:'traditional',
  config:{MinifiyAll:false,EncryptStrings:true,ControlFlowFlattenV1:true,MutateAllLiterals:true,JunkCode:true}
},
'light':{
  name:'✨ Light',
  desc:'Light obfuscation',
  category:'traditional',
  config:{MinifiyAll:false,EncryptStrings:true,MutateAllLiterals:true}
},
'minify':{
  name:'📄 Minify Only',
  desc:'Just minify',
  category:'minify',
  config:{MinifiyAll:true}
}
};

// ========== SLASH COMMANDS ==========
function buildCommands(){
const presetChoices=Object.entries(LUAFREE_PRESETS).map(([k,v])=>({name:`${v.name} - ${v.desc}`,value:k}));
return[
// PUBLIC COMMANDS
new SlashCommandBuilder().setName('menu').setDescription('📚 Main Menu'),
new SlashCommandBuilder().setName('help').setDescription('❓ Help'),
new SlashCommandBuilder().setName('status').setDescription('📊 Bot Status'),

// ADMIN ONLY - OBFUSCATION
new SlashCommandBuilder().setName('obf').setDescription('🔒 [ADMIN] Prometheus Obfuscator')
.addAttachmentOption(o=>o.setName('file').setDescription('File .lua').setRequired(true))
.addStringOption(o=>o.setName('preset').setDescription('Preset').addChoices(
{name:'Minify',value:'Minify'},{name:'Weak',value:'Weak'},{name:'Medium',value:'Medium'}
)),

new SlashCommandBuilder().setName('lua').setDescription('🔒 [ADMIN] Lua Free Custom')
.addAttachmentOption(o=>o.setName('file').setDescription('File .lua').setRequired(true))
.addBooleanOption(o=>o.setName('virtualize').setDescription('Virtualize (VM)'))
.addBooleanOption(o=>o.setName('encrypt').setDescription('EncryptStrings'))
.addBooleanOption(o=>o.setName('controlflow').setDescription('ControlFlowFlatten'))
.addBooleanOption(o=>o.setName('junkcode').setDescription('JunkCode'))
.addBooleanOption(o=>o.setName('mutate').setDescription('MutateAllLiterals'))
.addBooleanOption(o=>o.setName('mixed').setDescription('MixedBooleanArithmetic'))
.addBooleanOption(o=>o.setName('minify').setDescription('MinifyAll')),

new SlashCommandBuilder().setName('luapreset').setDescription('🔒 [ADMIN] Lua Free Preset')
.addAttachmentOption(o=>o.setName('file').setDescription('File .lua').setRequired(true))
.addStringOption(o=>o.setName('preset').setDescription('Preset').setRequired(true).addChoices(...presetChoices.slice(0,25))),

new SlashCommandBuilder().setName('testlua').setDescription('🧪 [ADMIN] Test LuaFree API'),
new SlashCommandBuilder().setName('presets').setDescription('📋 [ADMIN] Show all presets'),

// ADMIN ONLY - JNKIE
new SlashCommandBuilder().setName('panel').setDescription('🎛️ [ADMIN] Jnkie Panel'),
new SlashCommandBuilder().setName('keys').setDescription('🔑 [ADMIN] View all keys'),
new SlashCommandBuilder().setName('createkey').setDescription('🔑 [ADMIN] Quick create key'),
new SlashCommandBuilder().setName('config').setDescription('⚙️ [ADMIN] Show config')
].map(c=>c.toJSON());
}

// ========== REGISTER ==========
async function registerCommands(guildId=null){
if(!CLIENT_ID)return{success:false,error:'CLIENT_ID not set'};
try{
const rest=new REST({version:'10'}).setToken(TOKEN);
await rest.put(guildId?Routes.applicationGuildCommands(CLIENT_ID,guildId):Routes.applicationCommands(CLIENT_ID),{body:buildCommands()});
return{success:true,count:buildCommands().length};
}catch(e){return{success:false,error:e.message};}
}

// ========== READY ==========
client.once('ready',async()=>{
console.log('════════════════════════════════════════');
console.log(`✅ Bot ${client.user.tag} online!`);
console.log(`📊 Servers: ${client.guilds.cache.size}`);
console.log(`🔑 Jnkie: ${JNKIE_API_KEY?'✅':'❌'} | Service: ${SERVICE_ID||'❌'} | Provider: ${PROVIDER_ID||'❌'}`);
console.log(`🔒 LuaFree: ${LUAFREE_API_KEY?'✅':'❌'}`);
console.log(`👑 Admins: ${ADMIN_IDS.length?ADMIN_IDS.join(', '):'Everyone (set ADMIN_IDS!)'}`);
console.log('════════════════════════════════════════');
if(CLIENT_ID){const r=await registerCommands();console.log(r.success?`✅ ${r.count} commands registered`:`❌ ${r.error}`);}
client.user.setActivity('/menu | /help',{type:0});
});

// ========== MESSAGE COMMANDS ==========
client.on('messageCreate',async msg=>{
if(msg.author.bot)return;
const cmd=msg.content.trim().toLowerCase();
if(cmd==='!register'){if(!isAdmin(msg.author.id))return msg.reply('❌ Admin only!');const m=await msg.reply('⏳ Registering...');const r=await registerCommands(msg.guild.id);await m.edit(r.success?`✅ ${r.count} commands registered!`:`❌ ${r.error}`);}
if(cmd==='!global'){if(!isAdmin(msg.author.id))return msg.reply('❌ Admin only!');const m=await msg.reply('⏳...');const r=await registerCommands();await m.edit(r.success?`✅ ${r.count} commands registered globally!`:`❌ ${r.error}`);}
if(cmd==='!info'||cmd==='!config'){
const check=checkConfig();
await msg.reply(`**⚙️ Configuration**\n\`\`\`\nJNKIE_API_KEY: ${JNKIE_API_KEY?'✅':'❌'}\nSERVICE_ID: ${SERVICE_ID||'❌ NOT SET'}\nPROVIDER_ID: ${PROVIDER_ID||'❌ NOT SET'}\nLUAFREE_API_KEY: ${LUAFREE_API_KEY?'✅':'❌'}\nADMINS: ${ADMIN_IDS.join(',')||'Everyone'}\n\nStatus: ${check.valid?'✅ Ready':'❌ Missing: '+check.missing.join(', ')}\n\`\`\``);
}
});

// ========== INTERACTION HANDLER ==========
client.on('interactionCreate',async i=>{
try{
if(i.isChatInputCommand())await handleSlash(i);
else if(i.isButton())await handleButton(i);
else if(i.isModalSubmit())await handleModal(i);
}catch(e){
console.error('Error:',e);
const fn=i.replied||i.deferred?i.followUp.bind(i):i.reply.bind(i);
fn({content:`❌ Error: ${e.message}`,ephemeral:true}).catch(()=>{});
}
});

// ========== SLASH HANDLER ==========
async function handleSlash(i){
const cmd=i.commandName;

// ===== PUBLIC: MENU =====
if(cmd==='menu'){
const isAdm=isAdmin(i.user.id);
const embed=new EmbedBuilder().setTitle('📚 Menu').setColor(COLORS.info)
.setDescription(`${isAdm?'**🔒 Obfuscation** *(Admin)*\n`/obf` - Prometheus\n`/lua` - LuaFree Custom\n`/luapreset` - LuaFree Preset\n`/testlua` - Test API\n\n**🎛️ Jnkie Panel** *(Admin)*\n`/panel` - Management\n`/keys` - View keys\n`/createkey` - Quick create\n\n':''}**📖 Public**\n\`/help\` - Help\n\`/status\` - Bot status`)
.setFooter({text:isAdm?'👑 Admin Access':'👤 User Access'});
return i.reply({embeds:[embed],components:[new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('menu_status').setLabel('📊 Status').setStyle(ButtonStyle.Secondary)
)]});
}

// ===== PUBLIC: HELP =====
if(cmd==='help'){
return i.reply({embeds:[new EmbedBuilder().setTitle('❓ Help').setColor(COLORS.info)
.setDescription(`**Public Commands**
\`/menu\` - Main menu
\`/help\` - This help
\`/status\` - Bot status

**Admin Commands** *(Requires ADMIN_IDS)*
\`/obf\` - Prometheus obfuscator
\`/lua\` - LuaFree custom config
\`/luapreset\` - LuaFree with preset
\`/panel\` - Jnkie management panel
\`/keys\` - View all keys
\`/createkey\` - Quick create key
\`/config\` - View configuration

**Text Commands**
\`!register\` - Register commands
\`!info\` - Show config`)]});
}

// ===== PUBLIC: STATUS =====
if(cmd==='status'){
await i.deferReply();
let jnkieStatus='❌';
const check=checkConfig();
if(check.valid){const r=await jnkieReq('GET','/services');jnkieStatus=r.ok?'✅':'⚠️';}
return i.editReply({embeds:[new EmbedBuilder().setTitle('📊 Status').setColor(COLORS.primary)
.addFields({name:'Bot',value:'✅ Online',inline:true},{name:'Jnkie',value:jnkieStatus,inline:true},{name:'LuaFree',value:LUAFREE_API_KEY?'✅':'❌',inline:true})]});
}

// ========== ADMIN ONLY COMMANDS ==========

// ===== CONFIG =====
if(cmd==='config'){
if(!isAdmin(i.user.id))return i.reply({content:'❌ **Admin Only!**',ephemeral:true});
const check=checkConfig();
return i.reply({embeds:[new EmbedBuilder().setTitle('⚙️ Configuration').setColor(check.valid?COLORS.success:COLORS.error)
.addFields(
{name:'JNKIE_API_KEY',value:JNKIE_API_KEY?'✅ Set':'❌ NOT SET',inline:true},
{name:'SERVICE_ID',value:SERVICE_ID||'❌ NOT SET',inline:true},
{name:'PROVIDER_ID',value:PROVIDER_ID||'❌ NOT SET',inline:true},
{name:'LUAFREE_API_KEY',value:LUAFREE_API_KEY?'✅ Set':'❌ NOT SET',inline:true},
{name:'Status',value:check.valid?'✅ Ready':'❌ Missing: '+check.missing.join(', ')}
)],ephemeral:true});
}

// ===== TEST LUA =====
if(cmd==='testlua'){
if(!isAdmin(i.user.id))return i.reply({content:'❌ **Admin Only!**',ephemeral:true});
if(!LUAFREE_API_KEY)return i.reply({content:'⚠️ LUAFREE_API_KEY not set',ephemeral:true});
await i.deferReply();
const testScript='local test = "Hello"; print(test); return test;';
const config={MinifiyAll:false,Virtualize:true,EncryptStrings:true,JunkCode:true};
const result=await luaFreeObf(testScript,config);
if(result.success){
const ratio=((result.code.length/testScript.length)*100).toFixed(0);
return i.editReply({embeds:[new EmbedBuilder().setTitle('🧪 LuaFree Test').setColor(ratio>200?COLORS.success:COLORS.warning)
.addFields({name:'Status',value:ratio>200?'✅ OK':'⚠️ Low',inline:true},{name:'Original',value:`${testScript.length}B`,inline:true},{name:'Output',value:`${result.code.length}B (${ratio}%)`,inline:true})
.setDescription(`\`\`\`lua\n${result.code.substring(0,300)}...\n\`\`\``)]});
}
return i.editReply(`❌ Failed: ${result.error}\n\`\`\`${result.debug||''}\`\`\``);
}

// ===== PRESETS =====
if(cmd==='presets'){
if(!isAdmin(i.user.id))return i.reply({content:'❌ **Admin Only!**',ephemeral:true});
const vmPresets=Object.entries(LUAFREE_PRESETS).filter(([,v])=>v.category==='vm').map(([k,v])=>`**${v.name}**\n> ${v.desc}`).join('\n');
const tradPresets=Object.entries(LUAFREE_PRESETS).filter(([,v])=>v.category==='traditional').map(([k,v])=>`**${v.name}**\n> ${v.desc}`).join('\n');
return i.reply({embeds:[new EmbedBuilder().setTitle('📋 Presets').setColor(COLORS.info)
.addFields({name:'🖥️ VM-Based (Same Format)',value:vmPresets},{name:'📝 Traditional (Varied Format)',value:tradPresets},{name:'📄 Utility',value:'**📄 Minify Only**\n> Just minify'})]});
}

// ===== PROMETHEUS =====
if(cmd==='obf'){
if(!isAdmin(i.user.id))return i.reply({content:'❌ **Admin Only!**',ephemeral:true});
const file=i.options.getAttachment('file');
const preset=i.options.getString('preset')||'Minify';
if(!file.name.endsWith('.lua'))return i.reply({content:'❌ File harus .lua',ephemeral:true});
await i.deferReply();
const script=await downloadFile(file.url);
const originalSize=Buffer.byteLength(script,'utf8');
const result=await prometheusObf(script,preset);
if(result.success){
const code=HEADER.prometheus+result.code;
const newSize=Buffer.byteLength(code,'utf8');
return i.editReply({embeds:[new EmbedBuilder().setTitle('✅ Prometheus').setColor(COLORS.success)
.addFields({name:'Preset',value:preset,inline:true},{name:'Size',value:`${formatSize(originalSize)} → ${formatSize(newSize)}`,inline:true})],
files:[new AttachmentBuilder(Buffer.from(code,'utf8'),{name:`obf_${preset}_${Date.now()}.lua`})]});
}
return i.editReply(`❌ Failed: ${result.error}`);
}

// ===== LUA FREE CUSTOM =====
if(cmd==='lua'){
if(!isAdmin(i.user.id))return i.reply({content:'❌ **Admin Only!**',ephemeral:true});
if(!LUAFREE_API_KEY)return i.reply({content:'⚠️ LUAFREE_API_KEY not set',ephemeral:true});
const file=i.options.getAttachment('file');
if(!file.name.endsWith('.lua'))return i.reply({content:'❌ File harus .lua',ephemeral:true});

const config={MinifiyAll:false};
if(i.options.getBoolean('minify')){config.MinifiyAll=true;}
if(i.options.getBoolean('virtualize'))config.Virtualize=true;
if(i.options.getBoolean('encrypt'))config.EncryptStrings=true;
if(i.options.getBoolean('controlflow'))config.ControlFlowFlattenV1=true;
if(i.options.getBoolean('junkcode'))config.JunkCode=true;
if(i.options.getBoolean('mutate'))config.MutateAllLiterals=true;
if(i.options.getBoolean('mixed'))config.MixedBooleanArithmetic=true;

// Default jika kosong
const activePlugins=Object.keys(config).filter(k=>config[k]&&k!=='MinifiyAll');
if(activePlugins.length===0&&!config.MinifiyAll){
config.EncryptStrings=true;config.ControlFlowFlattenV1=true;config.MutateAllLiterals=true;
}

await i.deferReply();
const script=await downloadFile(file.url);
const originalSize=Buffer.byteLength(script,'utf8');
const result=await luaFreeObf(script,config);

if(result.success){
const code=HEADER.luafree+(config.Virtualize?result.code:formatLuaCode(result.code));
const newSize=Buffer.byteLength(code,'utf8');
const ratio=((newSize/originalSize)*100).toFixed(0);
const plugins=Object.keys(config).filter(k=>config[k]).join(', ');
return i.editReply({embeds:[new EmbedBuilder().setTitle(result.warning?'⚠️ LuaFree':'✅ LuaFree').setColor(result.warning?COLORS.warning:COLORS.success)
.addFields({name:'Plugins',value:plugins||'Default'},{name:'Size',value:`${formatSize(originalSize)} → ${formatSize(newSize)} (${ratio}%)`,inline:true})
.setDescription(result.warning?'⚠️ Output mungkin tidak optimal':'')],
files:[new AttachmentBuilder(Buffer.from(code,'utf8'),{name:`lua_${Date.now()}.lua`})]});
}
return i.editReply(`❌ Failed: ${result.error}\n\`\`\`${result.debug||''}\`\`\``);
}

// ===== LUA FREE PRESET =====
if(cmd==='luapreset'){
if(!isAdmin(i.user.id))return i.reply({content:'❌ **Admin Only!**',ephemeral:true});
if(!LUAFREE_API_KEY)return i.reply({content:'⚠️ LUAFREE_API_KEY not set',ephemeral:true});
const file=i.options.getAttachment('file');
const presetKey=i.options.getString('preset');
if(!file.name.endsWith('.lua'))return i.reply({content:'❌ File harus .lua',ephemeral:true});
const preset=LUAFREE_PRESETS[presetKey];
if(!preset)return i.reply({content:'❌ Preset not found',ephemeral:true});

await i.deferReply();
const script=await downloadFile(file.url);
const originalSize=Buffer.byteLength(script,'utf8');
const result=await luaFreeObf(script,preset.config);

if(result.success){
// Format code jika bukan VM-based
const isVM=preset.config.Virtualize;
const code=HEADER.luafree+(isVM?result.code:formatLuaCode(result.code));
const newSize=Buffer.byteLength(code,'utf8');
const ratio=((newSize/originalSize)*100).toFixed(0);

return i.editReply({embeds:[new EmbedBuilder().setTitle(result.warning?'⚠️ LuaFree':'✅ LuaFree').setColor(result.warning?COLORS.warning:COLORS.success)
.addFields({name:'Preset',value:preset.name,inline:true},{name:'Category',value:isVM?'🖥️ VM-Based':'📝 Traditional',inline:true},
{name:'Size',value:`${formatSize(originalSize)} → ${formatSize(newSize)} (${ratio}%)`,inline:true})
.setDescription(result.warning?'⚠️ Output mungkin tidak optimal':'')],
files:[new AttachmentBuilder(Buffer.from(code,'utf8'),{name:`lua_${presetKey}_${Date.now()}.lua`})]});
}
return i.editReply(`❌ Failed: ${result.error}\n\`\`\`${result.debug||''}\`\`\``);
}

// ===== PANEL =====
if(cmd==='panel'){
if(!isAdmin(i.user.id))return i.reply({content:'❌ **Admin Only!**',ephemeral:true});
const check=checkConfig();
if(!check.valid)return i.reply({content:`⚠️ **Missing Config:**\n${check.missing.join('\n')}\n\nSet di environment variables!`,ephemeral:true});
return i.reply({embeds:[buildPanelEmbed()],components:buildPanelButtons()});
}

// ===== KEYS =====
if(cmd==='keys'){
if(!isAdmin(i.user.id))return i.reply({content:'❌ **Admin Only!**',ephemeral:true});
const check=checkConfig();
if(!check.valid)return i.reply({content:`⚠️ Missing: ${check.missing.join(', ')}`,ephemeral:true});

await i.deferReply();
const serviceId=safeInt(SERVICE_ID);
const r=await jnkieReq('GET',`/keys?service_id=${serviceId}&limit=100`);
if(!r.ok)return i.editReply(`❌ Error:\n\`\`\`json\n${JSON.stringify(r.data||r.error,null,2).substring(0,1000)}\n\`\`\``);

const keys=r.data?.keys||[];
if(keys.length===0)return i.editReply({embeds:[new EmbedBuilder().setTitle('🔑 Keys').setColor(COLORS.warning).setDescription('Tidak ada key.')]});

const preview=keys.slice(0,5).map((k,idx)=>`**#${idx+1}** ID:\`${k.id}\`\n\`\`\`${k.key_value}\`\`\``).join('\n');
const fileContent=keys.map((k,idx)=>`#${idx+1}\nID: ${k.id}\nKey: ${k.key_value}\nHWID: ${k.hwids?.length||0}/${k.max_hwids||3}\nNote: ${k.note||'-'}\n${'─'.repeat(40)}`).join('\n\n');

return i.editReply({
embeds:[new EmbedBuilder().setTitle(`🔑 Keys (${keys.length})`).setColor(COLORS.primary).setDescription(preview+'\n\n📎 Download file untuk semua')],
files:[new AttachmentBuilder(Buffer.from(fileContent,'utf8'),{name:`keys_${Date.now()}.txt`})],
components:[buildKeyButtons()]
});
}

// ===== CREATE KEY =====
if(cmd==='createkey'){
if(!isAdmin(i.user.id))return i.reply({content:'❌ **Admin Only!**',ephemeral:true});
const check=checkConfig();
if(!check.valid)return i.reply({content:`⚠️ Missing: ${check.missing.join(', ')}`,ephemeral:true});

await i.deferReply();
const serviceId=safeInt(SERVICE_ID);
const providerId=safeInt(PROVIDER_ID);

console.log(`[CREATEKEY] service_id=${serviceId}, provider_id=${providerId}`);

if(!serviceId||!providerId){
return i.editReply(`❌ **Invalid Config**\n\`\`\`\nSERVICE_ID: "${SERVICE_ID}" → ${serviceId}\nPROVIDER_ID: "${PROVIDER_ID}" → ${providerId}\n\`\`\`\nPastikan nilainya angka!`);
}

// FIXED: Gunakan snake_case sesuai API
const r=await jnkieReq('POST','/keys',{
service_id:serviceId,
provider_id:providerId,
note:'Quick Create',
max_hwids:3
});

if(!r.ok)return i.editReply(`❌ Error:\n\`\`\`json\n${JSON.stringify(r.data||r.error,null,2).substring(0,1000)}\n\`\`\``);
const key=r.data?.key?.key_value||r.data?.key_value||'N/A';
return i.editReply({embeds:[new EmbedBuilder().setTitle('✅ Key Created').setColor(COLORS.success)
.setDescription(`**Salin key:**\n\`\`\`\n${key}\n\`\`\``)
.addFields({name:'ID',value:`\`${r.data?.key?.id||r.data?.id||'N/A'}\``,inline:true})]});
}
}

// ========== PANEL ==========
function buildPanelEmbed(){
return new EmbedBuilder().setTitle('🎛️ Admin Panel').setColor(COLORS.info)
.setDescription(`**Service ID:** \`${SERVICE_ID}\`\n**Provider ID:** \`${PROVIDER_ID}\``)
.setFooter({text:'Jnkie Management Panel'});
}

function buildPanelButtons(){
return[
new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('panel_keys').setLabel('🔑 Keys').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('panel_services').setLabel('📦 Services').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('panel_providers').setLabel('🏢 Providers').setStyle(ButtonStyle.Primary)
),
new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('panel_status').setLabel('📊 Status').setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId('panel_refresh').setLabel('🔄').setStyle(ButtonStyle.Secondary)
)
];
}

function buildKeyButtons(){
return[
new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('key_create').setLabel('➕ Create').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('key_batch').setLabel('📦 Batch').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('key_refresh').setLabel('🔄').setStyle(ButtonStyle.Primary)
),
new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('key_delete').setLabel('🗑️ Delete').setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId('key_reset').setLabel('🔄 Reset HWID').setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId('key_export').setLabel('📥 Export').setStyle(ButtonStyle.Secondary)
)
];
}

function buildServiceButtons(){
return[new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('service_list').setLabel('📋 List').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('service_create').setLabel('➕').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('service_delete').setLabel('🗑️').setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId('panel_home').setLabel('⬅️').setStyle(ButtonStyle.Secondary)
)];
}

function buildProviderButtons(){
return[new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('provider_list').setLabel('📋 List').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('provider_create').setLabel('➕').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('provider_delete').setLabel('🗑️').setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId('panel_home').setLabel('⬅️').setStyle(ButtonStyle.Secondary)
)];
}

// ========== BUTTON ==========
async function handleButton(i){
const id=i.customId;

// ADMIN CHECK for all panel buttons
if(id.startsWith('panel_')||id.startsWith('key_')||id.startsWith('service_')||id.startsWith('provider_')){
if(!isAdmin(i.user.id))return i.reply({content:'❌ Admin Only!',ephemeral:true});
}

if(id==='menu_status'){
await i.deferUpdate();
let jnkieOk='❌';const check=checkConfig();
if(check.valid){const r=await jnkieReq('GET','/services');jnkieOk=r.ok?'✅':'⚠️';}
return i.editReply({embeds:[new EmbedBuilder().setTitle('📊 Status').setColor(COLORS.primary)
.addFields({name:'Bot',value:'✅',inline:true},{name:'Jnkie',value:jnkieOk,inline:true},{name:'LuaFree',value:LUAFREE_API_KEY?'✅':'❌',inline:true})],components:[]});
}

// Panel
if(id==='panel_home')return i.update({embeds:[buildPanelEmbed()],components:buildPanelButtons()});
if(id==='panel_keys')return i.update({embeds:[new EmbedBuilder().setTitle('🔑 Keys').setColor(COLORS.primary).setDescription('Kelola license keys')],components:buildKeyButtons()});
if(id==='panel_services')return i.update({embeds:[new EmbedBuilder().setTitle('📦 Services').setColor(COLORS.secondary)],components:buildServiceButtons()});
if(id==='panel_providers')return i.update({embeds:[new EmbedBuilder().setTitle('🏢 Providers').setColor(COLORS.orange)],components:buildProviderButtons()});
if(id==='panel_status'){await i.deferUpdate();const r=await jnkieReq('GET','/services');return i.editReply({embeds:[new EmbedBuilder().setTitle('📊 API').setColor(r.ok?COLORS.success:COLORS.error).addFields({name:'Status',value:r.ok?'✅':'❌'})],components:buildPanelButtons()});}
if(id==='panel_refresh'){await i.deferUpdate();return i.editReply({embeds:[buildPanelEmbed()],components:buildPanelButtons()});}

// Keys
if(id==='key_refresh'||id==='key_list'){
await i.deferUpdate();
const r=await jnkieReq('GET',`/keys?service_id=${safeInt(SERVICE_ID)}&limit=100`);
if(!r.ok)return i.editReply({embeds:[new EmbedBuilder().setTitle('❌').setColor(COLORS.error).setDescription(JSON.stringify(r.error||r.data).substring(0,500))],components:buildKeyButtons()});
const keys=r.data?.keys||[];
const preview=keys.slice(0,5).map((k,idx)=>`**#${idx+1}** \`${k.id}\`\n\`\`\`${k.key_value}\`\`\``).join('\n');
const file=keys.map((k,idx)=>`#${idx+1} | ID:${k.id}\n${k.key_value}\nHWID:${k.hwids?.length||0}/${k.max_hwids||3}`).join('\n\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle(`🔑 Keys (${keys.length})`).setColor(COLORS.primary).setDescription(preview||'No keys')],files:keys.length?[new AttachmentBuilder(Buffer.from(file,'utf8'),{name:`keys.txt`})]:undefined,components:buildKeyButtons()});
}

if(id==='key_create'){
return i.showModal(new ModalBuilder().setCustomId('m_key_create').setTitle('Create Key').addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('note').setLabel('Note').setStyle(TextInputStyle.Short).setRequired(false)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('max_hwids').setLabel('Max HWIDs').setStyle(TextInputStyle.Short).setValue('3').setRequired(false))
));
}

if(id==='key_batch'){
return i.showModal(new ModalBuilder().setCustomId('m_key_batch').setTitle('Batch Create').addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('count').setLabel('Count (1-50)').setStyle(TextInputStyle.Short).setValue('5').setRequired(true)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('note').setLabel('Note').setStyle(TextInputStyle.Short).setRequired(false)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('max_hwids').setLabel('Max HWIDs').setStyle(TextInputStyle.Short).setValue('3').setRequired(false))
));
}

if(id==='key_delete'){return i.showModal(new ModalBuilder().setCustomId('m_key_delete').setTitle('Delete').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('id').setLabel('Key ID').setStyle(TextInputStyle.Short).setRequired(true))));}
if(id==='key_reset'){return i.showModal(new ModalBuilder().setCustomId('m_key_reset').setTitle('Reset HWID').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('id').setLabel('Key ID').setStyle(TextInputStyle.Short).setRequired(true))));}

if(id==='key_export'){
await i.deferUpdate();
const r=await jnkieReq('GET',`/keys?service_id=${safeInt(SERVICE_ID)}&limit=500`);
const keys=r.data?.keys||[];
const only=keys.map(k=>k.key_value).join('\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle(`📥 Export ${keys.length}`).setColor(COLORS.success)],files:[new AttachmentBuilder(Buffer.from(only,'utf8'),{name:`export.txt`})],components:buildKeyButtons()});
}

// Services
if(id==='service_list'){await i.deferUpdate();const r=await jnkieReq('GET','/services');const list=(r.data?.services||[]).map(s=>`\`${s.id}\` **${s.name}**`).join('\n');return i.editReply({embeds:[new EmbedBuilder().setTitle('📦 Services').setColor(COLORS.secondary).setDescription(list||'None')],components:buildServiceButtons()});}
if(id==='service_create'){return i.showModal(new ModalBuilder().setCustomId('m_service_create').setTitle('Create Service').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setRequired(true))));}
if(id==='service_delete'){return i.showModal(new ModalBuilder().setCustomId('m_service_delete').setTitle('Delete').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('id').setLabel('Service ID').setStyle(TextInputStyle.Short).setRequired(true))));}

// Providers
if(id==='provider_list'){await i.deferUpdate();const r=await jnkieReq('GET','/providers');const list=(r.data?.providers||[]).map(p=>`\`${p.id}\` **${p.name}**`).join('\n');return i.editReply({embeds:[new EmbedBuilder().setTitle('🏢 Providers').setColor(COLORS.orange).setDescription(list||'None')],components:buildProviderButtons()});}
if(id==='provider_create'){return i.showModal(new ModalBuilder().setCustomId('m_provider_create').setTitle('Create Provider').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setRequired(true)),new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('minutes').setLabel('Key Valid (minutes)').setStyle(TextInputStyle.Short).setValue('1440').setRequired(false))));}
if(id==='provider_delete'){return i.showModal(new ModalBuilder().setCustomId('m_provider_delete').setTitle('Delete').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('id').setLabel('Provider ID').setStyle(TextInputStyle.Short).setRequired(true))));}

await i.deferUpdate();
}

// ========== MODAL ==========
async function handleModal(i){
const id=i.customId;
const serviceId=safeInt(SERVICE_ID);
const providerId=safeInt(PROVIDER_ID);

console.log(`[MODAL] ${id} | serviceId=${serviceId}, providerId=${providerId}`);

// KEY CREATE - FIXED dengan snake_case
if(id==='m_key_create'){
await i.deferReply();
if(!serviceId||!providerId)return i.editReply(`❌ Invalid config`);

const note=i.fields.getTextInputValue('note')||'Bot Created';
const maxHwids=safeInt(i.fields.getTextInputValue('max_hwids'),3);

const r=await jnkieReq('POST','/keys',{
service_id:serviceId,
provider_id:providerId,
note:note,
max_hwids:maxHwids
});

if(!r.ok)return i.editReply(`❌ Error:\n\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1500)}\n\`\`\``);
const key=r.data?.key?.key_value||r.data?.key_value||'N/A';
return i.editReply({embeds:[new EmbedBuilder().setTitle('✅ Created').setColor(COLORS.success).setDescription(`\`\`\`\n${key}\n\`\`\``)]});
}

// KEY BATCH - FIXED dengan snake_case
if(id==='m_key_batch'){
await i.deferReply();
if(!serviceId||!providerId)return i.editReply(`❌ Invalid config`);

const count=Math.min(50,Math.max(1,safeInt(i.fields.getTextInputValue('count'),5)));
const note=i.fields.getTextInputValue('note')||'Batch';
const maxHwids=safeInt(i.fields.getTextInputValue('max_hwids'),3);

const r=await jnkieReq('POST','/keys/batch',{
service_id:serviceId,
provider_id:providerId,
count:count,
note:note,
max_hwids:maxHwids
});

if(!r.ok)return i.editReply(`❌ Error:\n\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1500)}\n\`\`\``);
const keys=r.data?.keys||[];
const list=keys.map(k=>k.key_value||k).join('\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle(`✅ ${keys.length} Keys`).setColor(COLORS.success)],files:[new AttachmentBuilder(Buffer.from(list,'utf8'),{name:`batch.txt`})]});
}

// KEY DELETE
if(id==='m_key_delete'){
await i.deferReply();
const keyId=i.fields.getTextInputValue('id').trim();
const r=await jnkieReq('DELETE',`/keys/${keyId}`);
return i.editReply(r.ok?`✅ Deleted \`${keyId}\``:`❌ ${JSON.stringify(r.data||r.error)}`);
}

// KEY RESET
if(id==='m_key_reset'){
await i.deferReply();
const keyId=i.fields.getTextInputValue('id').trim();
const r=await jnkieReq('POST',`/keys/${keyId}/reset-hwid`);
return i.editReply(r.ok?`✅ Reset \`${keyId}\``:`❌ ${JSON.stringify(r.data||r.error)}`);
}

// SERVICE CREATE
if(id==='m_service_create'){
await i.deferReply();
const name=i.fields.getTextInputValue('name');
const r=await jnkieReq('POST','/services',{name,description:'Bot',is_premium:false,keyless_mode:false});
if(!r.ok)return i.editReply(`❌ ${JSON.stringify(r.data||r.error)}`);
return i.editReply(`✅ Created ID: \`${r.data?.service?.id||r.data?.id}\``);
}

// SERVICE DELETE
if(id==='m_service_delete'){
await i.deferReply();
const sid=i.fields.getTextInputValue('id').trim();
const r=await jnkieReq('DELETE',`/services/${sid}`);
return i.editReply(r.ok?`✅ Deleted \`${sid}\``:`❌ ${JSON.stringify(r.data||r.error)}`);
}

// PROVIDER CREATE
if(id==='m_provider_create'){
await i.deferReply();
const name=i.fields.getTextInputValue('name');
const minutes=safeInt(i.fields.getTextInputValue('minutes'),1440);
const r=await jnkieReq('POST','/providers',{name,key_valid_minutes:minutes,is_active:true});
if(!r.ok)return i.editReply(`❌ ${JSON.stringify(r.data||r.error)}`);
return i.editReply(`✅ Created ID: \`${r.data?.provider?.id||r.data?.id}\``);
}

// PROVIDER DELETE
if(id==='m_provider_delete'){
await i.deferReply();
const pid=i.fields.getTextInputValue('id').trim();
const r=await jnkieReq('DELETE',`/providers/${pid}`);
return i.editReply(r.ok?`✅ Deleted \`${pid}\``:`❌ ${JSON.stringify(r.data||r.error)}`);
}
}

// ========== PROMETHEUS ==========
async function prometheusObf(script,preset){
const ts=Date.now(),inp=path.join(PROMETHEUS_PATH,`i${ts}.lua`),out=path.join(PROMETHEUS_PATH,`o${ts}.lua`);
try{
fs.writeFileSync(inp,script.replace(/^\uFEFF/,'').trim(),'utf8');
await execAsync(`cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset ${preset} "${inp}" --out "${out}" 2>&1`,{timeout:120000});
if(fs.existsSync(out))return{success:true,code:fs.readFileSync(out,'utf8')};
return{success:false,error:'No output'};
}catch(e){return{success:false,error:e.message};}
finally{[inp,out].forEach(f=>{try{fs.unlinkSync(f);}catch(e){}});}
}

// ========== LUA FREE ==========
async function luaFreeObf(script,config,maxRetries=3){
const clean=script.replace(/^\uFEFF/,'').trim();
const origLen=clean.length;
console.log('[LUA] Start |',origLen,'bytes | Config:',JSON.stringify(config));

for(let attempt=1;attempt<=maxRetries;attempt++){
console.log(`[LUA] Attempt ${attempt}/${maxRetries}`);
if(attempt>1)await sleep(2000);

try{
// Step 1
const s1=await httpPost('api.luaobfuscator.com','/v1/obfuscator/newscript',clean,{'Content-Type':'text/plain','apikey':LUAFREE_API_KEY},60000);
if(!s1?.sessionId){console.error('[LUA] S1 fail:',s1);if(attempt<maxRetries)continue;return{success:false,error:s1?.message||'No session',debug:JSON.stringify(s1).substring(0,400)};}
console.log('[LUA] Session:',s1.sessionId);

await sleep(500);

// Step 2
const s2=await httpPost('api.luaobfuscator.com','/v1/obfuscator/obfuscate',JSON.stringify(config),{'Content-Type':'application/json','apikey':LUAFREE_API_KEY,'sessionId':s1.sessionId},180000);
if(!s2?.code){console.error('[LUA] S2 fail:',s2);if((s2?.message||'').includes('Session'))continue;if(attempt<maxRetries)continue;return{success:false,error:s2?.message||'No code',debug:JSON.stringify(s2).substring(0,400)};}

const outLen=s2.code.length;
const ratio=(outLen/origLen)*100;
console.log('[LUA] OK |',outLen,'bytes |',ratio.toFixed(0)+'%');

if(!config.MinifiyAll&&outLen<origLen){if(attempt<maxRetries)continue;return{success:true,code:s2.code,warning:'SMALL'};}
if(!config.MinifiyAll&&ratio<150&&config.Virtualize){if(attempt<maxRetries&&ratio<100)continue;return{success:true,code:s2.code,warning:'LOW'};}
return{success:true,code:s2.code};
}catch(e){console.error('[LUA] Err:',e.message);if(attempt<maxRetries)continue;return{success:false,error:e.message};}
}
return{success:false,error:'All retries failed'};
}

// ========== HTTP ==========
function httpPost(host,path,body,headers,timeout=30000){
return new Promise(resolve=>{
const data=typeof body==='string'?body:JSON.stringify(body);
const req=https.request({hostname:host,port:443,path,method:'POST',headers:{...headers,'Content-Length':Buffer.byteLength(data)}},res=>{
let d='';res.on('data',c=>d+=c);res.on('end',()=>{try{resolve(JSON.parse(d));}catch(e){resolve({error:'Parse',raw:d.substring(0,300)});}});
});
req.on('error',e=>resolve({error:e.message}));
req.setTimeout(timeout,()=>{req.destroy();resolve({error:'Timeout'});});
req.write(data);req.end();
});
}

function jnkieReq(method,endpoint,body=null){
return new Promise(resolve=>{
const data=body?JSON.stringify(body):'';
console.log(`[JNKIE] ${method} ${endpoint}`,body?JSON.stringify(body):'');
const req=https.request({hostname:'api.jnkie.com',port:443,path:`/api/v2${endpoint}`,method,
headers:{'Authorization':`Bearer ${JNKIE_API_KEY}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}},res=>{
let d='';res.on('data',c=>d+=c);res.on('end',()=>{
console.log(`[JNKIE] Response ${res.statusCode}:`,d.substring(0,200));
try{resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,data:JSON.parse(d)});}
catch(e){resolve({ok:false,error:'Parse',raw:d});}
});
});
req.on('error',e=>resolve({ok:false,error:e.message}));
req.setTimeout(15000,()=>{req.destroy();resolve({ok:false,error:'Timeout'});});
if(body)req.write(data);req.end();
});
}

// ========== HELPERS ==========
function downloadFile(url){return new Promise((r,j)=>{https.get(url,res=>{const d=[];res.on('data',c=>d.push(c));res.on('end',()=>r(Buffer.concat(d).toString('utf8')));}).on('error',j);});}
function formatSize(b){return b<1024?b+'B':b<1048576?(b/1024).toFixed(1)+'KB':(b/1048576).toFixed(1)+'MB';}

// Format Lua code untuk output yang lebih rapi
function formatLuaCode(code){
let formatted=code;
// Add newlines for readability
formatted=formatted.replace(/;(\S)/g,';\n$1');
formatted=formatted.replace(/\s*end\s+/g,'\nend\n');
formatted=formatted.replace(/\s*else\s*/g,'\nelse\n');
formatted=formatted.replace(/\s*then\s*/g,' then\n');
formatted=formatted.replace(/\s*do\s*\n/g,' do\n');
formatted=formatted.replace(/\n{3,}/g,'\n\n');
return formatted.trim();
}

client.login(TOKEN);
