const{Client,GatewayIntentBits,AttachmentBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,SlashCommandBuilder,REST,Routes,StringSelectMenuBuilder,PermissionFlagsBits}=require('discord.js');
const{exec}=require('child_process');const fs=require('fs');const path=require('path');const http=require('http');const https=require('https');const{promisify}=require('util');const execAsync=promisify(exec);

// ========== HTTP SERVER ==========
const PORT=process.env.PORT||3000;
http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/plain'});res.end('Bot is running!');}).listen(PORT,()=>console.log(`HTTP Server on port ${PORT}`));

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
// ADMIN: Comma separated user IDs (e.g., "123456789,987654321")
const ADMIN_IDS=(process.env.ADMIN_IDS||'').split(',').filter(Boolean);

if(!TOKEN){console.error('❌ DISCORD_TOKEN NOT FOUND');process.exit(1);}

// ========== HEADERS ==========
const HEADER={
prometheus:`-- Protected by Prometheus Obfuscator [${DISCORD_LINK}]\n\n`,
luafree:`-- Protected by Lua Obfuscator [${DISCORD_LINK}]\n\n`
};

// ========== COLORS ==========
const COLORS={
success:0x00ff00,
error:0xff0000,
warning:0xff9900,
info:0x5865F2,
primary:0x2ecc71,
secondary:0x3498db,
purple:0x9b59b6,
orange:0xe67e22
};

// ========== CHECK ADMIN ==========
function isAdmin(userId){
if(ADMIN_IDS.length===0)return true; // Jika tidak di-set, semua bisa akses
return ADMIN_IDS.includes(userId);
}

// ========== LUA FREE PRESETS ==========
const LUAFREE_PRESETS={
'dystropic':{
  name:'💀 Dystropic Malevolence',
  desc:'Maximum protection (Large output)',
  config:{MinifiyAll:false,Virtualize:true,EncryptStrings:true,MixedBooleanArithmetic:true,JunkifyAllIfStatements:true,ControlFlowFlattenV1:true,MutateAllLiterals:true,TableIndirection:true,BytecodeShuffle:true,JunkCode:true}
},
'chaotic_evil':{
  name:'😈 Chaotic Evil',
  desc:'Heavy obfuscation',
  config:{MinifiyAll:false,Virtualize:true,EncryptStrings:true,ControlFlowFlattenV1:true,JunkifyAllIfStatements:true,MutateAllLiterals:true,JunkCode:true,TableIndirection:true}
},
'chaotic_good':{
  name:'😇 Chaotic Good',
  desc:'Balanced protection',
  config:{MinifiyAll:false,Virtualize:true,EncryptStrings:true,ControlFlowFlattenV1:true,MutateAllLiterals:true,JunkCode:true}
},
'obfuscate_v1':{
  name:'🔒 OBFUSCATE V1',
  desc:'Standard protection',
  config:{MinifiyAll:false,EncryptStrings:true,ControlFlowFlattenV1:true,JunkCode:true,MutateAllLiterals:true}
},
'basic_good':{
  name:'✅ Basic Good',
  desc:'Light protection',
  config:{MinifiyAll:false,EncryptStrings:true,ControlFlowFlattenV1:true,MutateAllLiterals:true}
},
'basic_minimal':{
  name:'📝 Basic Minimal',
  desc:'Minimal protection',
  config:{MinifiyAll:false,EncryptStrings:true,JunkCode:true}
},
'minify':{
  name:'📦 Minify Only',
  desc:'Reduce size only',
  config:{MinifiyAll:true}
}
};

// ========== SLASH COMMANDS ==========
function buildCommands(){
return[
// OBFUSCATE COMMANDS
new SlashCommandBuilder().setName('obf').setDescription('🔒 Prometheus Obfuscator')
.addAttachmentOption(o=>o.setName('file').setDescription('File .lua').setRequired(true))
.addStringOption(o=>o.setName('preset').setDescription('Preset').addChoices(
{name:'Minify',value:'Minify'},{name:'Weak',value:'Weak'},{name:'Medium',value:'Medium'}
)),

new SlashCommandBuilder().setName('lua').setDescription('🔒 Lua Free Custom')
.addAttachmentOption(o=>o.setName('file').setDescription('File .lua').setRequired(true))
.addBooleanOption(o=>o.setName('minify').setDescription('MinifyAll'))
.addBooleanOption(o=>o.setName('virtualize').setDescription('Virtualize (VM)'))
.addBooleanOption(o=>o.setName('encrypt').setDescription('EncryptStrings'))
.addBooleanOption(o=>o.setName('controlflow').setDescription('ControlFlowFlatten'))
.addBooleanOption(o=>o.setName('junkcode').setDescription('JunkCode'))
.addBooleanOption(o=>o.setName('mutate').setDescription('MutateAllLiterals'))
.addBooleanOption(o=>o.setName('mixed').setDescription('MixedBooleanArithmetic'))
.addBooleanOption(o=>o.setName('table').setDescription('TableIndirection')),

new SlashCommandBuilder().setName('luapreset').setDescription('🔒 Lua Free Preset')
.addAttachmentOption(o=>o.setName('file').setDescription('File .lua').setRequired(true))
.addStringOption(o=>o.setName('preset').setDescription('Preset').setRequired(true).addChoices(
{name:'💀 Dystropic Malevolence',value:'dystropic'},
{name:'😈 Chaotic Evil',value:'chaotic_evil'},
{name:'😇 Chaotic Good',value:'chaotic_good'},
{name:'🔒 OBFUSCATE V1',value:'obfuscate_v1'},
{name:'✅ Basic Good',value:'basic_good'},
{name:'📝 Basic Minimal',value:'basic_minimal'},
{name:'📦 Minify Only',value:'minify'}
)),

// JNKIE ADMIN COMMANDS
new SlashCommandBuilder().setName('panel').setDescription('🎛️ Admin Panel (Jnkie Management)'),
new SlashCommandBuilder().setName('key').setDescription('🔑 Key Management').addSubcommand(s=>s.setName('menu').setDescription('Open key menu')),
new SlashCommandBuilder().setName('createkey').setDescription('🔑 Quick create key'),

// UTILITY
new SlashCommandBuilder().setName('menu').setDescription('📚 Main Menu'),
new SlashCommandBuilder().setName('status').setDescription('📊 Bot Status'),
new SlashCommandBuilder().setName('help').setDescription('❓ Help'),
new SlashCommandBuilder().setName('testlua').setDescription('🧪 Test LuaFree API'),
new SlashCommandBuilder().setName('presets').setDescription('📋 Show all presets')
].map(c=>c.toJSON());
}

// ========== REGISTER COMMANDS ==========
async function registerCommands(guildId=null){
if(!CLIENT_ID)return{success:false,error:'CLIENT_ID not set'};
try{
const rest=new REST({version:'10'}).setToken(TOKEN);
const route=guildId?Routes.applicationGuildCommands(CLIENT_ID,guildId):Routes.applicationCommands(CLIENT_ID);
await rest.put(route,{body:buildCommands()});
return{success:true,count:buildCommands().length};
}catch(e){return{success:false,error:e.message};}
}

// ========== READY ==========
client.once('ready',async()=>{
console.log('==========================================');
console.log(`✅ Bot ${client.user.tag} online!`);
console.log(`📊 Servers: ${client.guilds.cache.size}`);
console.log(`🔑 Jnkie API: ${JNKIE_API_KEY?'✅':'❌'}`);
console.log(`🔒 LuaFree API: ${LUAFREE_API_KEY?'✅':'❌'}`);
console.log(`👑 Admins: ${ADMIN_IDS.length||'Everyone'}`);
console.log('==========================================');
if(CLIENT_ID){
const r=await registerCommands();
console.log(r.success?`✅ ${r.count} commands registered globally`:`❌ ${r.error}`);
}
client.user.setActivity('/menu | /help',{type:0});
});

// ========== MESSAGE COMMANDS ==========
client.on('messageCreate',async msg=>{
if(msg.author.bot)return;
const cmd=msg.content.trim().toLowerCase();

if(cmd==='!register'){
if(!isAdmin(msg.author.id))return msg.reply('❌ Admin only!');
const m=await msg.reply('⏳ Registering...');
const r=await registerCommands(msg.guild.id);
await m.edit(r.success?`✅ ${r.count} commands registered!`:`❌ ${r.error}`);
}

if(cmd==='!global'){
if(!isAdmin(msg.author.id))return msg.reply('❌ Admin only!');
const m=await msg.reply('⏳ Registering globally...');
const r=await registerCommands();
await m.edit(r.success?`✅ ${r.count} commands registered globally!`:`❌ ${r.error}`);
}

if(cmd==='!info'){
await msg.reply(`**Bot Info**\n\`\`\`\nService ID: ${SERVICE_ID||'Not set'}\nProvider ID: ${PROVIDER_ID||'Not set'}\nAdmins: ${ADMIN_IDS.join(', ')||'Everyone'}\n\`\`\``);
}
});

// ========== INTERACTION HANDLER ==========
client.on('interactionCreate',async i=>{
try{
if(i.isChatInputCommand())await handleSlash(i);
else if(i.isButton())await handleButton(i);
else if(i.isModalSubmit())await handleModal(i);
else if(i.isStringSelectMenu())await handleSelect(i);
}catch(e){
console.error('Interaction Error:',e);
const fn=i.replied||i.deferred?i.followUp.bind(i):i.reply.bind(i);
fn({content:`❌ Error: ${e.message}`,ephemeral:true}).catch(()=>{});
}
});

// ========== SLASH HANDLER ==========
async function handleSlash(i){
const cmd=i.commandName;

// ===== TEST LUA =====
if(cmd==='testlua'){
if(!LUAFREE_API_KEY)return i.reply({content:'⚠️ LUAFREE_API_KEY not set',ephemeral:true});
await i.deferReply();
const testScript='local test = "Hello World"; print(test); return test;';
const config={MinifiyAll:false,Virtualize:true,EncryptStrings:true,JunkCode:true,ControlFlowFlattenV1:true};
const result=await luaFreeObf(testScript,config);
if(result.success){
const ratio=((result.code.length/testScript.length)*100).toFixed(0);
const status=ratio>200?'✅ EXCELLENT':ratio>100?'⚠️ OK':'❌ FAILED';
return i.editReply({embeds:[new EmbedBuilder().setTitle('🧪 LuaFree API Test').setColor(ratio>200?COLORS.success:COLORS.warning)
.addFields({name:'Status',value:status,inline:true},{name:'Original',value:`${testScript.length} B`,inline:true},{name:'Output',value:`${result.code.length} B`,inline:true},{name:'Ratio',value:`${ratio}%`,inline:true})
.setDescription(`\`\`\`lua\n${result.code.substring(0,300)}...\n\`\`\``)]});
}
return i.editReply(`❌ **Test Failed**\n${result.error}\n\`\`\`${result.debug||'N/A'}\`\`\``);
}

// ===== PRESETS =====
if(cmd==='presets'){
const list=Object.entries(LUAFREE_PRESETS).map(([k,v])=>`**${v.name}**\n└ ${v.desc}\n└ Plugins: \`${Object.keys(v.config).filter(x=>x!=='MinifiyAll'&&v.config[x]).join(', ')}\``).join('\n\n');
return i.reply({embeds:[new EmbedBuilder().setTitle('📋 Available Presets').setColor(COLORS.info).setDescription(list)]});
}

// ===== PROMETHEUS =====
if(cmd==='obf'){
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
const ratio=((newSize/originalSize)*100).toFixed(0);
return i.editReply({embeds:[new EmbedBuilder().setTitle('✅ Prometheus Obfuscator').setColor(COLORS.success)
.addFields({name:'Preset',value:preset,inline:true},{name:'Original',value:formatSize(originalSize),inline:true},{name:'Output',value:`${formatSize(newSize)} (${ratio}%)`,inline:true})
.setFooter({text:DISCORD_LINK})],files:[new AttachmentBuilder(Buffer.from(code,'utf8'),{name:`Prometheus_${preset}_${Date.now()}.lua`})]});
}
return i.editReply(`❌ **Failed:** ${result.error}`);
}

// ===== LUA FREE CUSTOM =====
if(cmd==='lua'){
if(!LUAFREE_API_KEY)return i.reply({content:'⚠️ LUAFREE_API_KEY not set',ephemeral:true});
const file=i.options.getAttachment('file');
if(!file.name.endsWith('.lua'))return i.reply({content:'❌ File harus .lua',ephemeral:true});
const config={MinifiyAll:false};
if(i.options.getBoolean('minify'))config.MinifiyAll=true;
if(i.options.getBoolean('virtualize'))config.Virtualize=true;
if(i.options.getBoolean('encrypt'))config.EncryptStrings=true;
if(i.options.getBoolean('controlflow'))config.ControlFlowFlattenV1=true;
if(i.options.getBoolean('junkcode'))config.JunkCode=true;
if(i.options.getBoolean('mutate'))config.MutateAllLiterals=true;
if(i.options.getBoolean('mixed'))config.MixedBooleanArithmetic=true;
if(i.options.getBoolean('table'))config.TableIndirection=true;
if(Object.keys(config).length===1){config.EncryptStrings=true;config.JunkCode=true;config.ControlFlowFlattenV1=true;config.MutateAllLiterals=true;}

await i.deferReply();
const script=await downloadFile(file.url);
const originalSize=Buffer.byteLength(script,'utf8');
const result=await luaFreeObf(script,config);
if(result.success){
const code=HEADER.luafree+result.code;
const newSize=Buffer.byteLength(code,'utf8');
const ratio=((newSize/originalSize)*100).toFixed(0);
const hasWarning=result.warning;
const color=hasWarning==='OUTPUT_SMALLER'?COLORS.error:ratio<150?COLORS.warning:COLORS.success;
const title=hasWarning==='OUTPUT_SMALLER'?'🚨 CRITICAL: Output Mengecil!':ratio<150?'⚠️ Low Ratio':'✅ Lua Obfuscator';
const embed=new EmbedBuilder().setTitle(title).setColor(color)
.addFields({name:'Plugins',value:Object.keys(config).filter(k=>k!=='MinifiyAll'&&config[k]).join(', ')||'Default'},{name:'Original',value:formatSize(originalSize),inline:true},{name:'Output',value:`${formatSize(newSize)} (${ratio}%)`,inline:true}).setFooter({text:DISCORD_LINK});
if(hasWarning==='OUTPUT_SMALLER')embed.setDescription('🚨 Output mengecil! API mungkin mengabaikan config.\nCoba preset berbeda atau test dengan `/testlua`');
return i.editReply({embeds:[embed],files:[new AttachmentBuilder(Buffer.from(code,'utf8'),{name:`LuaFree_${Date.now()}.lua`})]});
}
return i.editReply(`❌ **Failed:** ${result.error}\n\`\`\`${result.debug||'N/A'}\`\`\``);
}

// ===== LUA FREE PRESET =====
if(cmd==='luapreset'){
if(!LUAFREE_API_KEY)return i.reply({content:'⚠️ LUAFREE_API_KEY not set',ephemeral:true});
const file=i.options.getAttachment('file');
const presetKey=i.options.getString('preset');
if(!file.name.endsWith('.lua'))return i.reply({content:'❌ File harus .lua',ephemeral:true});
const preset=LUAFREE_PRESETS[presetKey];
if(!preset)return i.reply({content:'❌ Preset not found',ephemeral:true});

await i.deferReply();
const script=await downloadFile(file.url);
const originalSize=Buffer.byteLength(script,'utf8');
console.log(`[LUAPRESET] ${presetKey} | ${originalSize} bytes | Config:`,JSON.stringify(preset.config));
const result=await luaFreeObf(script,preset.config);

if(result.success){
const code=HEADER.luafree+result.code;
const newSize=Buffer.byteLength(code,'utf8');
const ratio=((newSize/originalSize)*100).toFixed(0);
const hasWarning=result.warning;
const expectedLarge=!preset.config.MinifiyAll;
let color=COLORS.success,title='✅ Lua Obfuscator',desc='';

if(hasWarning==='OUTPUT_SMALLER'){color=COLORS.error;title='🚨 CRITICAL: Output Mengecil!';desc='🚨 Output mengecil! Config tidak diterapkan.\n**Solusi:** Tunggu 10 detik, lalu coba lagi.';}
else if(hasWarning==='LOW_RATIO'){color=COLORS.warning;title='⚠️ Low Ratio';desc='⚠️ Ratio lebih rendah dari expected.';}
else if(ratio<100&&expectedLarge){color=COLORS.error;title='🚨 ERROR';desc=`Output mengecil (${ratio}%)`;}

const embed=new EmbedBuilder().setTitle(title).setColor(color)
.addFields({name:'Preset',value:preset.name,inline:true},{name:'Description',value:preset.desc,inline:true},{name:'Plugins',value:Object.keys(preset.config).filter(k=>k!=='MinifiyAll'&&preset.config[k]).join(', ')},
{name:'Original',value:formatSize(originalSize),inline:true},{name:'Output',value:formatSize(newSize),inline:true},{name:'Ratio',value:`${ratio}%`,inline:true}).setFooter({text:DISCORD_LINK});
if(desc)embed.setDescription(desc);
return i.editReply({embeds:[embed],files:[new AttachmentBuilder(Buffer.from(code,'utf8'),{name:`LuaFree_${presetKey}_${Date.now()}.lua`})]});
}
return i.editReply(`❌ **Failed:** ${result.error}\n\`\`\`${result.debug||'N/A'}\`\`\``);
}

// ===== ADMIN PANEL =====
if(cmd==='panel'){
if(!isAdmin(i.user.id))return i.reply({content:'❌ **Admin Only!**\nAnda tidak memiliki akses ke panel ini.',ephemeral:true});
if(!JNKIE_API_KEY)return i.reply({content:'⚠️ JNKIE_API_KEY not configured',ephemeral:true});
return i.reply({embeds:[buildPanelEmbed()],components:buildPanelButtons(),ephemeral:false});
}

// ===== KEY MENU =====
if(cmd==='key'){
if(!isAdmin(i.user.id))return i.reply({content:'❌ **Admin Only!**',ephemeral:true});
if(!JNKIE_API_KEY)return i.reply({content:'⚠️ JNKIE_API_KEY not configured',ephemeral:true});
return i.reply({embeds:[buildKeyEmbed()],components:buildKeyButtons(),ephemeral:false});
}

// ===== QUICK CREATE KEY =====
if(cmd==='createkey'){
if(!isAdmin(i.user.id))return i.reply({content:'❌ **Admin Only!**',ephemeral:true});
if(!JNKIE_API_KEY)return i.reply({content:'⚠️ JNKIE_API_KEY not configured',ephemeral:true});
if(!SERVICE_ID||!PROVIDER_ID)return i.reply({content:'⚠️ SERVICE_ID or PROVIDER_ID not set',ephemeral:true});
await i.deferReply();
const r=await jnkieReq('POST','/keys',{serviceId:parseInt(SERVICE_ID),providerId:parseInt(PROVIDER_ID),note:'Quick Create',maxHwids:3});
if(!r.ok)return i.editReply(`❌ Error: ${r.error||r.raw?.substring(0,300)}`);
const key=r.data?.key?.key_value||'N/A';
return i.editReply({embeds:[new EmbedBuilder().setTitle('🔑 Key Created!').setColor(COLORS.success).setDescription(`\`\`\`${key}\`\`\``).addFields({name:'Service',value:SERVICE_ID,inline:true},{name:'Provider',value:PROVIDER_ID,inline:true})]});
}

// ===== MAIN MENU =====
if(cmd==='menu'){
const embed=new EmbedBuilder().setTitle('📚 Main Menu').setColor(COLORS.info)
.setDescription('**🔒 Obfuscation**\n`/obf` - Prometheus Obfuscator\n`/lua` - LuaFree Custom\n`/luapreset` - LuaFree Preset\n`/presets` - Show presets\n`/testlua` - Test API\n\n**🎛️ Admin Panel** (Admin Only)\n`/panel` - Full management\n`/key menu` - Key management\n`/createkey` - Quick create')
.setFooter({text:DISCORD_LINK});
const row=new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('menu_obf').setLabel('🔒 Obfuscate').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('menu_panel').setLabel('🎛️ Panel').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('menu_status').setLabel('📊 Status').setStyle(ButtonStyle.Secondary)
);
return i.reply({embeds:[embed],components:[row]});
}

// ===== STATUS =====
if(cmd==='status'){
await i.deferReply();
let jnkieStatus='❌ Not Connected';
if(JNKIE_API_KEY){
const r=await jnkieReq('GET','/services');
jnkieStatus=r.ok?`✅ Connected (${r.data?.services?.length||0} services)`:'⚠️ Error';
}
return i.editReply({embeds:[new EmbedBuilder().setTitle('📊 Bot Status').setColor(COLORS.primary)
.addFields({name:'🤖 Bot',value:'✅ Online',inline:true},{name:'🔑 Jnkie API',value:jnkieStatus,inline:true},{name:'🔒 LuaFree API',value:LUAFREE_API_KEY?'✅ Ready':'❌ Not Set',inline:true},
{name:'📋 Service ID',value:SERVICE_ID||'Not set',inline:true},{name:'📋 Provider ID',value:PROVIDER_ID||'Not set',inline:true},{name:'👑 Admins',value:`${ADMIN_IDS.length||'Everyone'}`,inline:true})]});
}

// ===== HELP =====
if(cmd==='help'){
return i.reply({embeds:[new EmbedBuilder().setTitle('❓ Help').setColor(COLORS.info)
.addFields({name:'🔒 Obfuscation',value:'`/obf [file]` - Prometheus\n`/lua [file]` - LuaFree Custom\n`/luapreset [file] [preset]` - LuaFree Preset\n`/presets` - Show all presets\n`/testlua` - Test LuaFree API'},
{name:'🎛️ Admin Panel',value:'`/panel` - Full management panel\n`/key menu` - Key management\n`/createkey` - Quick create key'},
{name:'📖 Text Commands',value:'`!register` - Register commands\n`!global` - Register globally\n`!info` - Show config'})]});
}
}

// ========== PANEL EMBEDS ==========
function buildPanelEmbed(tab='home'){
const embed=new EmbedBuilder().setColor(COLORS.info).setFooter({text:`Service: ${SERVICE_ID||'?'} | Provider: ${PROVIDER_ID||'?'}`});
if(tab==='home'){embed.setTitle('🎛️ Admin Panel').setDescription('Kelola Keys, Services, Providers, dan Integrations.\n\nPilih menu di bawah:');}
else if(tab==='keys'){embed.setTitle('🔑 Key Management').setDescription('Buat, lihat, dan kelola license keys.');}
else if(tab==='services'){embed.setTitle('📦 Service Management').setDescription('Kelola services/produk.');}
else if(tab==='providers'){embed.setTitle('🏢 Provider Management').setDescription('Kelola providers/resellers.');}
else if(tab==='integrations'){embed.setTitle('🔗 Integrations').setDescription('Kelola integrasi.');}
return embed;
}

function buildPanelButtons(tab='home'){
const rows=[];
if(tab==='home'){
rows.push(new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('panel_keys').setLabel('🔑 Keys').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('panel_services').setLabel('📦 Services').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('panel_providers').setLabel('🏢 Providers').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('panel_integrations').setLabel('🔗 Integrations').setStyle(ButtonStyle.Primary)
));
rows.push(new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('panel_status').setLabel('📊 API Status').setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId('panel_refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
));
}
return rows;
}

function buildKeyEmbed(){
return new EmbedBuilder().setTitle('🔑 Key Management').setColor(COLORS.primary)
.setDescription('Kelola license keys untuk service anda.')
.addFields({name:'Service ID',value:SERVICE_ID||'Not set',inline:true},{name:'Provider ID',value:PROVIDER_ID||'Not set',inline:true});
}

function buildKeyButtons(){
return[
new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('key_list').setLabel('📋 List Keys').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('key_create').setLabel('➕ Create Key').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('key_batch').setLabel('📦 Batch Create').setStyle(ButtonStyle.Success)
),
new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('key_delete').setLabel('🗑️ Delete Key').setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId('key_reset').setLabel('🔄 Reset HWID').setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId('panel_home').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary)
)
];
}

function buildServiceButtons(){
return[
new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('service_list').setLabel('📋 List Services').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('service_create').setLabel('➕ Create Service').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('service_delete').setLabel('🗑️ Delete Service').setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId('panel_home').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary)
)
];
}

function buildProviderButtons(){
return[
new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('provider_list').setLabel('📋 List Providers').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('provider_create').setLabel('➕ Create Provider').setStyle(ButtonStyle.Success),
new ButtonBuilder().setCustomId('provider_delete').setLabel('🗑️ Delete Provider').setStyle(ButtonStyle.Danger),
new ButtonBuilder().setCustomId('panel_home').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary)
)
];
}

function buildIntegrationButtons(){
return[
new ActionRowBuilder().addComponents(
new ButtonBuilder().setCustomId('integration_list').setLabel('📋 List Integrations').setStyle(ButtonStyle.Primary),
new ButtonBuilder().setCustomId('integration_types').setLabel('📖 Integration Types').setStyle(ButtonStyle.Secondary),
new ButtonBuilder().setCustomId('panel_home').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary)
)
];
}

// ========== BUTTON HANDLER ==========
async function handleButton(i){
const id=i.customId;

// ADMIN CHECK
if(id.startsWith('panel_')||id.startsWith('key_')||id.startsWith('service_')||id.startsWith('provider_')||id.startsWith('integration_')){
if(!isAdmin(i.user.id)){
return i.reply({content:'❌ **Admin Only!**',ephemeral:true});
}
}

// MENU BUTTONS
if(id==='menu_obf'){
return i.reply({embeds:[new EmbedBuilder().setTitle('🔒 Obfuscation').setColor(COLORS.info)
.setDescription('**Prometheus:**\n`/obf [file]` - Local obfuscation\n\n**LuaFree API:**\n`/lua [file]` - Custom config\n`/luapreset [file] [preset]` - Use preset\n`/testlua` - Test API')],ephemeral:true});
}

if(id==='menu_panel'){
if(!isAdmin(i.user.id))return i.reply({content:'❌ **Admin Only!**',ephemeral:true});
return i.update({embeds:[buildPanelEmbed()],components:buildPanelButtons()});
}

if(id==='menu_status'){
await i.deferUpdate();
let jnkieStatus='❌';
if(JNKIE_API_KEY){const r=await jnkieReq('GET','/services');jnkieStatus=r.ok?'✅':'⚠️';}
return i.editReply({embeds:[new EmbedBuilder().setTitle('📊 Status').setColor(COLORS.primary)
.addFields({name:'Bot',value:'✅',inline:true},{name:'Jnkie',value:jnkieStatus,inline:true},{name:'LuaFree',value:LUAFREE_API_KEY?'✅':'❌',inline:true})],components:[]});
}

// PANEL NAVIGATION
if(id==='panel_home'){return i.update({embeds:[buildPanelEmbed()],components:buildPanelButtons()});}
if(id==='panel_keys'){return i.update({embeds:[buildKeyEmbed()],components:buildKeyButtons()});}
if(id==='panel_services'){return i.update({embeds:[buildPanelEmbed('services')],components:buildServiceButtons()});}
if(id==='panel_providers'){return i.update({embeds:[buildPanelEmbed('providers')],components:buildProviderButtons()});}
if(id==='panel_integrations'){return i.update({embeds:[buildPanelEmbed('integrations')],components:buildIntegrationButtons()});}

if(id==='panel_status'){
await i.deferUpdate();
const r=await jnkieReq('GET','/services');
const embed=new EmbedBuilder().setTitle('📊 API Status').setColor(r.ok?COLORS.success:COLORS.error)
.addFields({name:'Status',value:r.ok?'✅ Connected':'❌ Error',inline:true},{name:'Services',value:`${r.data?.services?.length||0}`,inline:true});
return i.editReply({embeds:[embed],components:buildPanelButtons()});
}

if(id==='panel_refresh'){
await i.deferUpdate();
return i.editReply({embeds:[buildPanelEmbed()],components:buildPanelButtons()});
}

// KEY ACTIONS
if(id==='key_list'){
await i.deferUpdate();
const r=await jnkieReq('GET',`/keys?serviceId=${SERVICE_ID}&limit=25`);
if(!r.ok)return i.editReply({embeds:[new EmbedBuilder().setTitle('❌ Error').setColor(COLORS.error).setDescription(r.error||'Failed to fetch')],components:buildKeyButtons()});
const keys=r.data?.keys||[];
const list=keys.slice(0,15).map((k,idx)=>`\`${idx+1}\` **${String(k.key_value||'').substring(0,20)}...** | ID: \`${k.id}\` | HWID: ${k.hwids?.length||0}/${k.max_hwids||3}`).join('\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle(`🔑 Keys (${keys.length})`).setColor(COLORS.primary).setDescription(list||'No keys found')],components:buildKeyButtons()});
}

if(id==='key_create'){
return i.showModal(new ModalBuilder().setCustomId('modal_key_create').setTitle('Create Key').addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('note').setLabel('Note (Optional)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Customer name, etc.')),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('max_hwids').setLabel('Max HWIDs').setStyle(TextInputStyle.Short).setRequired(false).setValue('3').setPlaceholder('1-10')),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('provider_id').setLabel('Provider ID').setStyle(TextInputStyle.Short).setRequired(false).setValue(PROVIDER_ID).setPlaceholder('Leave empty for default'))
));
}

if(id==='key_batch'){
return i.showModal(new ModalBuilder().setCustomId('modal_key_batch').setTitle('Batch Create Keys').addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('count').setLabel('Number of Keys').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('1-50').setValue('5')),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('note').setLabel('Note (Optional)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Batch note')),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('max_hwids').setLabel('Max HWIDs').setStyle(TextInputStyle.Short).setRequired(false).setValue('3')),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('provider_id').setLabel('Provider ID').setStyle(TextInputStyle.Short).setRequired(false).setValue(PROVIDER_ID))
));
}

if(id==='key_delete'){
return i.showModal(new ModalBuilder().setCustomId('modal_key_delete').setTitle('Delete Key').addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key_id').setLabel('Key ID').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Enter key ID to delete'))
));
}

if(id==='key_reset'){
return i.showModal(new ModalBuilder().setCustomId('modal_key_reset').setTitle('Reset HWID').addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key_id').setLabel('Key ID').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Enter key ID to reset HWID'))
));
}

// SERVICE ACTIONS
if(id==='service_list'){
await i.deferUpdate();
const r=await jnkieReq('GET','/services');
if(!r.ok)return i.editReply({embeds:[new EmbedBuilder().setTitle('❌ Error').setColor(COLORS.error).setDescription(r.error)],components:buildServiceButtons()});
const services=r.data?.services||[];
const list=services.map(s=>`\`${s.id}\` **${s.name}** ${s.is_premium?'⭐':''}\n└ ${s.description||'No description'}`).join('\n\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle(`📦 Services (${services.length})`).setColor(COLORS.secondary).setDescription(list||'No services')],components:buildServiceButtons()});
}

if(id==='service_create'){
return i.showModal(new ModalBuilder().setCustomId('modal_service_create').setTitle('Create Service').addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Service Name').setStyle(TextInputStyle.Short).setRequired(true)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(false))
));
}

if(id==='service_delete'){
return i.showModal(new ModalBuilder().setCustomId('modal_service_delete').setTitle('Delete Service').addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('service_id').setLabel('Service ID').setStyle(TextInputStyle.Short).setRequired(true))
));
}

// PROVIDER ACTIONS
if(id==='provider_list'){
await i.deferUpdate();
const r=await jnkieReq('GET','/providers');
if(!r.ok)return i.editReply({embeds:[new EmbedBuilder().setTitle('❌ Error').setColor(COLORS.error).setDescription(r.error)],components:buildProviderButtons()});
const providers=r.data?.providers||[];
const list=providers.map(p=>`\`${p.id}\` **${p.name}** ${p.is_active?'✅':'❌'}\n└ Key valid: ${p.key_valid_minutes||60} min`).join('\n\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle(`🏢 Providers (${providers.length})`).setColor(COLORS.orange).setDescription(list||'No providers')],components:buildProviderButtons()});
}

if(id==='provider_create'){
return i.showModal(new ModalBuilder().setCustomId('modal_provider_create').setTitle('Create Provider').addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Provider Name').setStyle(TextInputStyle.Short).setRequired(true)),
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key_valid_minutes').setLabel('Key Valid Minutes').setStyle(TextInputStyle.Short).setRequired(false).setValue('1440').setPlaceholder('Default: 1440 (24 hours)'))
));
}

if(id==='provider_delete'){
return i.showModal(new ModalBuilder().setCustomId('modal_provider_delete').setTitle('Delete Provider').addComponents(
new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('provider_id').setLabel('Provider ID').setStyle(TextInputStyle.Short).setRequired(true))
));
}

// INTEGRATION ACTIONS
if(id==='integration_list'){
await i.deferUpdate();
const r=await jnkieReq('GET','/integrations');
if(!r.ok)return i.editReply({embeds:[new EmbedBuilder().setTitle('❌ Error').setColor(COLORS.error).setDescription(r.error)],components:buildIntegrationButtons()});
const integrations=r.data?.integrations||[];
const list=integrations.map(x=>`\`${x.id}\` **${x.name}** (${x.type})`).join('\n');
return i.editReply({embeds:[new EmbedBuilder().setTitle(`🔗 Integrations (${integrations.length})`).setColor(COLORS.purple).setDescription(list||'No integrations')],components:buildIntegrationButtons()});
}

if(id==='integration_types'){
await i.deferUpdate();
const r=await jnkieReq('GET','/integrations/types');
return i.editReply({embeds:[new EmbedBuilder().setTitle('📖 Integration Types').setColor(COLORS.purple).setDescription(`\`\`\`json\n${JSON.stringify(r.data,null,2).substring(0,1800)}\n\`\`\``)],components:buildIntegrationButtons()});
}

await i.deferUpdate();
}

// ========== MODAL HANDLER ==========
async function handleModal(i){
const id=i.customId;

// KEY CREATE
if(id==='modal_key_create'){
await i.deferReply();
const note=i.fields.getTextInputValue('note')||'Created via Bot';
const maxHwids=parseInt(i.fields.getTextInputValue('max_hwids'))||3;
const providerId=parseInt(i.fields.getTextInputValue('provider_id'))||parseInt(PROVIDER_ID);
const r=await jnkieReq('POST','/keys',{serviceId:parseInt(SERVICE_ID),providerId,note,maxHwids});
if(!r.ok)return i.editReply(`❌ Error: ${r.error||r.raw?.substring(0,300)}`);
const key=r.data?.key?.key_value||'N/A';
return i.editReply({embeds:[new EmbedBuilder().setTitle('✅ Key Created').setColor(COLORS.success).setDescription(`\`\`\`${key}\`\`\``).addFields({name:'Note',value:note,inline:true},{name:'Max HWID',value:`${maxHwids}`,inline:true},{name:'Provider',value:`${providerId}`,inline:true})]});
}

// KEY BATCH
if(id==='modal_key_batch'){
await i.deferReply();
const count=Math.min(50,Math.max(1,parseInt(i.fields.getTextInputValue('count'))||5));
const note=i.fields.getTextInputValue('note')||'Batch Created';
const maxHwids=parseInt(i.fields.getTextInputValue('max_hwids'))||3;
const providerId=parseInt(i.fields.getTextInputValue('provider_id'))||parseInt(PROVIDER_ID);
const r=await jnkieReq('POST','/keys/batch',{serviceId:parseInt(SERVICE_ID),providerId,count,note,maxHwids});
if(!r.ok)return i.editReply(`❌ Error: ${r.error}`);
const keys=r.data?.keys||[];
const list=keys.slice(0,20).map((k,idx)=>`${idx+1}. \`${k.key_value||k}\``).join('\n');
const file=keys.length>5?new AttachmentBuilder(Buffer.from(keys.map(k=>k.key_value||k).join('\n'),'utf8'),{name:`keys_${Date.now()}.txt`}):null;
return i.editReply({embeds:[new EmbedBuilder().setTitle(`✅ ${keys.length} Keys Created`).setColor(COLORS.success).setDescription(list.substring(0,2000))],files:file?[file]:[]});
}

// KEY DELETE
if(id==='modal_key_delete'){
await i.deferReply();
const keyId=i.fields.getTextInputValue('key_id');
const r=await jnkieReq('DELETE',`/keys/${keyId}`);
return i.editReply(r.ok?`✅ Key \`${keyId}\` deleted!`:`❌ Error: ${r.error}`);
}

// KEY RESET
if(id==='modal_key_reset'){
await i.deferReply();
const keyId=i.fields.getTextInputValue('key_id');
const r=await jnkieReq('POST',`/keys/${keyId}/reset-hwid`);
return i.editReply(r.ok?`✅ HWID for key \`${keyId}\` has been reset!`:`❌ Error: ${r.error}`);
}

// SERVICE CREATE
if(id==='modal_service_create'){
await i.deferReply();
const name=i.fields.getTextInputValue('name');
const description=i.fields.getTextInputValue('description')||'Created via Bot';
const r=await jnkieReq('POST','/services',{name,description,is_premium:false,keyless_mode:false});
if(!r.ok)return i.editReply(`❌ Error: ${r.error}`);
return i.editReply({embeds:[new EmbedBuilder().setTitle('✅ Service Created').setColor(COLORS.success).addFields({name:'ID',value:`\`${r.data?.service?.id}\``,inline:true},{name:'Name',value:name,inline:true})]});
}

// SERVICE DELETE
if(id==='modal_service_delete'){
await i.deferReply();
const serviceId=i.fields.getTextInputValue('service_id');
const r=await jnkieReq('DELETE',`/services/${serviceId}`);
return i.editReply(r.ok?`✅ Service \`${serviceId}\` deleted!`:`❌ Error: ${r.error}`);
}

// PROVIDER CREATE
if(id==='modal_provider_create'){
await i.deferReply();
const name=i.fields.getTextInputValue('name');
const keyValidMinutes=parseInt(i.fields.getTextInputValue('key_valid_minutes'))||1440;
const r=await jnkieReq('POST','/providers',{name,key_valid_minutes:keyValidMinutes,is_active:true});
if(!r.ok)return i.editReply(`❌ Error: ${r.error}`);
return i.editReply({embeds:[new EmbedBuilder().setTitle('✅ Provider Created').setColor(COLORS.success).addFields({name:'ID',value:`\`${r.data?.provider?.id}\``,inline:true},{name:'Name',value:name,inline:true},{name:'Key Valid',value:`${keyValidMinutes} min`,inline:true})]});
}

// PROVIDER DELETE
if(id==='modal_provider_delete'){
await i.deferReply();
const providerId=i.fields.getTextInputValue('provider_id');
const r=await jnkieReq('DELETE',`/providers/${providerId}`);
return i.editReply(r.ok?`✅ Provider \`${providerId}\` deleted!`:`❌ Error: ${r.error}`);
}
}

// ========== SELECT MENU HANDLER ==========
async function handleSelect(i){
await i.deferUpdate();
}

// ========== PROMETHEUS ==========
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

// ========== LUA FREE (FIXED WITH RETRY) ==========
async function luaFreeObf(script,config,retries=2){
const cleanScript=script.replace(/^\uFEFF/,'').trim();
const originalLength=cleanScript.length;
console.log('[LUAFREE] Start | Original:',originalLength,'| Config:',JSON.stringify(config));

const isLargeScript=originalLength>50000;
const sessionTimeout=isLargeScript?90000:60000;
const obfTimeout=isLargeScript?240000:180000;

for(let attempt=1;attempt<=retries;attempt++){
console.log(`[LUAFREE] Attempt ${attempt}/${retries}`);

if(attempt>1){console.log('[LUAFREE] Cooldown 3s...');await new Promise(r=>setTimeout(r,3000));}

// Step 1
const step1=await new Promise(resolve=>{
const req=https.request({hostname:'api.luaobfuscator.com',port:443,path:'/v1/obfuscator/newscript',method:'POST',
headers:{'Content-Type':'text/plain','apikey':LUAFREE_API_KEY,'User-Agent':'DiscordBot/1.0'}},res=>{
let data='';res.on('data',c=>data+=c);res.on('end',()=>{console.log('[LUAFREE] Step1:',res.statusCode);try{resolve(JSON.parse(data));}catch(e){resolve({error:'Parse error',raw:data.substring(0,300)});}});
});
req.on('error',e=>resolve({error:e.message}));req.setTimeout(sessionTimeout,()=>{req.destroy();resolve({error:'Timeout'});});req.write(cleanScript);req.end();
});

if(!step1.sessionId){console.error('[LUAFREE] Step1 FAIL:',step1);if(attempt<retries)continue;return{success:false,error:step1.message||step1.error||'No sessionId',debug:JSON.stringify(step1).substring(0,400)};}
console.log('[LUAFREE] SessionId:',step1.sessionId);

await new Promise(r=>setTimeout(r,isLargeScript?2000:1500));

// Step 2
const body=JSON.stringify(config);
const step2=await new Promise(resolve=>{
const req=https.request({hostname:'api.luaobfuscator.com',port:443,path:'/v1/obfuscator/obfuscate',method:'POST',
headers:{'Content-Type':'application/json','apikey':LUAFREE_API_KEY,'sessionId':step1.sessionId,'User-Agent':'DiscordBot/1.0','Content-Length':Buffer.byteLength(body)}},res=>{
let data='';res.on('data',c=>data+=c);res.on('end',()=>{console.log('[LUAFREE] Step2:',res.statusCode,'Len:',data.length);try{resolve(JSON.parse(data));}catch(e){resolve({error:'Parse error',raw:data.substring(0,300)});}});
});
req.on('error',e=>resolve({error:e.message}));req.setTimeout(obfTimeout,()=>{req.destroy();resolve({error:'Timeout'});});req.write(body);req.end();
});

if(!step2.code){console.error('[LUAFREE] Step2 FAIL:',step2);if(attempt<retries&&(step2.message||'').includes('Session'))continue;return{success:false,error:step2.message||step2.error||'No code',debug:JSON.stringify(step2).substring(0,400)};}

const outputLength=step2.code.length;
const ratio=(outputLength/originalLength)*100;
console.log('[LUAFREE] Success! Ratio:',ratio.toFixed(0)+'%');

if(!config.MinifiyAll&&outputLength<originalLength){console.warn('[LUAFREE] ⚠️ OUTPUT SMALLER!');if(attempt<retries)continue;return{success:true,code:step2.code,warning:'OUTPUT_SMALLER'};}
if(!config.MinifiyAll&&ratio<150&&(config.Virtualize||config.JunkCode)){console.warn('[LUAFREE] ⚠️ LOW RATIO');return{success:true,code:step2.code,warning:'LOW_RATIO'};}
return{success:true,code:step2.code};
}
return{success:false,error:'All retries failed'};
}

// ========== JNKIE API ==========
function jnkieReq(method,endpoint,body=null){
return new Promise(resolve=>{
const data=body?JSON.stringify(body):'';
const req=https.request({hostname:'api.jnkie.com',port:443,path:`/api/v2${endpoint}`,method,
headers:{'Authorization':`Bearer ${JNKIE_API_KEY}`,'Content-Type':'application/json',...(body?{'Content-Length':Buffer.byteLength(data)}:{})}},res=>{
let d='';res.on('data',c=>d+=c);res.on('end',()=>{
try{resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,data:JSON.parse(d),raw:d});}
catch(e){resolve({ok:false,error:'Parse error',raw:d});}
});
});
req.on('error',e=>resolve({ok:false,error:e.message}));
req.setTimeout(15000,()=>{req.destroy();resolve({ok:false,error:'Timeout'});});
if(body)req.write(data);req.end();
});
}

// ========== HELPERS ==========
function downloadFile(url){return new Promise((r,j)=>{https.get(url,res=>{const d=[];res.on('data',c=>d.push(c));res.on('end',()=>r(Buffer.concat(d).toString('utf8')));}).on('error',j);});}
function formatSize(b){return b<1024?b+' B':b<1048576?(b/1024).toFixed(1)+' KB':(b/1048576).toFixed(1)+' MB';}

// ========== LOGIN ==========
client.login(TOKEN);
