const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { promisify } = require('util');

const execAsync = promisify(exec);

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
}).listen(PORT);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const PROMETHEUS_PATH = process.env.PROMETHEUS_PATH || '/app/prometheus';
const JNKIE_API_KEY = process.env.JNKIE_API_KEY;
const JNKIE_SERVICE_ID = '4532';

if (!TOKEN) {
    console.error('TOKEN NOT FOUND');
    process.exit(1);
}

const HEADER = `-- Protected with Prometheus [https://discord.gg/QarfX8ua2]\n\n`;
const PRESETS = {
    minify: { value: 'Minify', emoji: '🟢' },
    weak: { value: 'Weak', emoji: '🔵' },
    medium: { value: 'Medium', emoji: '🟡' }
};

client.on('ready', () => {
    console.log(`Bot ${client.user.tag} online`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.trim();
    const args = content.split(/\s+/).slice(1);
    const cmd = content.split(/\s+/)[0].toLowerCase();

    try {
        // Obfuscator
        if (cmd === '!obf') await handleObfuscate(message);
        if (cmd === '!luraph') await handleLuraph(message);
        
        // Explorer - BARU
        if (cmd === '!crackluraph') await handleCrackLuraph(message);  // 🆕 Crack parameter
        if (cmd === '!rawpost') await handleRawPost(message, args);    // 🆕 POST dengan body custom
        if (cmd === '!probeluraph') await handleProbeLuraph(message);  // 🆕 Probe semua luraph endpoint
        if (cmd === '!checkprovider') await handleCheckProvider(message); // 🆕 Check providers detail
        if (cmd === '!checkintegration') await handleCheckIntegration(message); // 🆕 Check integrations
        
        // Standard
        if (cmd === '!raw') await handleRaw(message, args);
        if (cmd === '!probe') await handleProbe(message, args);
        if (cmd === '!scan') await handleScan(message, args);
        if (cmd === '!debug') await handleDebug(message);
        if (cmd === '!help') await handleHelp(message);
        if (cmd === '!status') await handleStatus(message);
    } catch (err) {
        console.error(err);
        message.reply(`❌ Error: ${err.message}`);
    }
});

// ================================================================
// 🔓 CRACK LURAPH - Cari parameter yang benar untuk endpoint Luraph
// ================================================================
async function handleCrackLuraph(message) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const statusMsg = await message.reply(`🔓 **Cracking Luraph endpoints...**\nMencari parameter yang benar...`);

    // Endpoint yang return 400
    const endpoints = [
        '/services/luraph',
        '/services/obfuscate',
        '/integrations/luraph',
        '/providers/luraph'
    ];

    // Semua kemungkinan parameter GET
    const queryParams = [
        `serviceId=${JNKIE_SERVICE_ID}`,
        `service_id=${JNKIE_SERVICE_ID}`,
        `id=${JNKIE_SERVICE_ID}`,
        `service=${JNKIE_SERVICE_ID}`,
        `providerId=luraph`,
        `provider=luraph`,
        `type=luraph`,
        `integration=luraph`,
        `integrationId=luraph`,
        `name=luraph`,
        // Kombinasi
        `serviceId=${JNKIE_SERVICE_ID}&provider=luraph`,
        `serviceId=${JNKIE_SERVICE_ID}&type=luraph`,
        `id=${JNKIE_SERVICE_ID}&provider=luraph`,
        // Limit/page
        `limit=10`,
        `page=1`,
        `serviceId=${JNKIE_SERVICE_ID}&limit=10`,
    ];

    let results = [];
    let found = [];

    for (const ep of endpoints) {
        await statusMsg.edit(`🔓 Testing: \`${ep}\`...`);

        for (const param of queryParams) {
            const fullPath = `${ep}?${param}`;
            const res = await jnkieRequestRaw('GET', fullPath);
            
            if (res.statusCode === 200) {
                found.push({ path: fullPath, data: res.rawData?.substring(0, 150) });
            } else if (res.statusCode !== 400 && res.statusCode !== 404) {
                results.push({ path: fullPath, status: res.statusCode });
            }

            await new Promise(r => setTimeout(r, 100));
        }
    }

    // Juga coba akses provider/integration detail dulu
    await statusMsg.edit(`🔓 Checking providers & integrations details...`);
    
    // Lihat dulu isi /providers dan /integrations
    const providersRes = await jnkieRequestRaw('GET', '/providers');
    const integrationsRes = await jnkieRequestRaw('GET', '/integrations');

    let extraInfo = '';
    
    if (providersRes.statusCode === 200) {
        try {
            const data = JSON.parse(providersRes.rawData);
            const items = data.data || data.providers || data.items || data;
            if (Array.isArray(items)) {
                extraInfo += `\n**📦 Providers (${items.length}):**\n`;
                items.slice(0, 10).forEach(p => {
                    const id = p.id || p._id || p.providerId || 'N/A';
                    const name = p.name || p.title || p.type || 'Unnamed';
                    extraInfo += `• \`${id}\` - ${name}\n`;
                });
            }
        } catch (e) {
            extraInfo += `\n**Providers Raw:** ${providersRes.rawData?.substring(0, 200)}\n`;
        }
    }

    if (integrationsRes.statusCode === 200) {
        try {
            const data = JSON.parse(integrationsRes.rawData);
            const items = data.data || data.integrations || data.items || data;
            if (Array.isArray(items)) {
                extraInfo += `\n**🔗 Integrations (${items.length}):**\n`;
                items.slice(0, 10).forEach(i => {
                    const id = i.id || i._id || i.integrationId || 'N/A';
                    const name = i.name || i.title || i.type || 'Unnamed';
                    extraInfo += `• \`${id}\` - ${name}\n`;
                });
            }
        } catch (e) {
            extraInfo += `\n**Integrations Raw:** ${integrationsRes.rawData?.substring(0, 200)}\n`;
        }
    }

    // Build result
    let desc = '';

    if (found.length > 0) {
        desc += '**✅ BERHASIL DITEMUKAN:**\n';
        found.forEach(f => {
            desc += `• \`${f.path}\`\n`;
            desc += `  └─ ${f.data}\n`;
        });
    }

    if (results.length > 0) {
        desc += '\n**⚠️ Status Lain:**\n';
        results.forEach(r => {
            desc += `• \`${r.path}\` (${r.status})\n`;
        });
    }

    desc += extraInfo;

    if (found.length === 0 && desc === extraInfo) {
        desc = `❌ Tidak menemukan parameter yang benar.\n\n${extraInfo}\n\n**Langkah selanjutnya:**\n• \`!checkprovider\` - Lihat detail providers\n• \`!checkintegration\` - Lihat detail integrations`;
    }

    await statusMsg.edit({
        embeds: [{
            title: '🔓 Crack Luraph Results',
            description: desc.substring(0, 4000),
            color: found.length > 0 ? 0x2ecc71 : 0xf39c12,
            footer: { text: 'Gunakan !checkprovider atau !checkintegration untuk detail' }
        }]
    });
}

// ================================================================
// 📦 CHECK PROVIDER - Lihat detail semua providers
// ================================================================
async function handleCheckProvider(message) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const statusMsg = await message.reply(`📦 Fetching providers...`);

    const res = await jnkieRequestRaw('GET', '/providers');
    
    if (res.statusCode !== 200) {
        return statusMsg.edit(`❌ Failed: ${res.statusCode}\n\`\`\`${res.rawData?.substring(0, 500)}\`\`\``);
    }

    let desc = '';
    let providerIds = [];

    try {
        const data = JSON.parse(res.rawData);
        const items = data.data || data.providers || data.items || data.results || (Array.isArray(data) ? data : []);
        
        if (Array.isArray(items) && items.length > 0) {
            desc += `**Found ${items.length} providers:**\n\n`;
            
            for (const p of items.slice(0, 15)) {
                const id = p.id || p._id || p.providerId || 'N/A';
                const name = p.name || p.title || p.type || 'Unnamed';
                const type = p.type || p.provider || p.category || '';
                
                providerIds.push(id);
                desc += `📦 **${name}**\n`;
                desc += `   ID: \`${id}\`\n`;
                desc += `   Type: ${type}\n`;
                if (p.description) desc += `   Desc: ${p.description.substring(0, 50)}\n`;
                desc += '\n';
            }

            // Coba akses detail provider pertama
            if (providerIds[0] && providerIds[0] !== 'N/A') {
                desc += `\n**🔍 Testing access patterns:**\n`;
                
                const testPaths = [
                    `/providers/${providerIds[0]}`,
                    `/providers?id=${providerIds[0]}`,
                    `/services/obfuscate?providerId=${providerIds[0]}`,
                    `/services/luraph?providerId=${providerIds[0]}`,
                ];

                for (const tp of testPaths) {
                    const testRes = await jnkieRequestRaw('GET', tp);
                    const icon = testRes.statusCode === 200 ? '✅' : (testRes.statusCode === 400 ? '⚠️' : '❌');
                    desc += `${icon} \`${tp}\` (${testRes.statusCode})\n`;
                    await new Promise(r => setTimeout(r, 100));
                }
            }

        } else {
            desc = `Empty or unexpected format:\n\`\`\`json\n${res.rawData?.substring(0, 1000)}\n\`\`\``;
        }
    } catch (e) {
        desc = `Parse error:\n\`\`\`json\n${res.rawData?.substring(0, 1500)}\n\`\`\``;
    }

    await statusMsg.edit({
        embeds: [{
            title: '📦 Providers',
            description: desc.substring(0, 4000),
            color: 0x3498db
        }]
    });
}

// ================================================================
// 🔗 CHECK INTEGRATION - Lihat detail semua integrations
// ================================================================
async function handleCheckIntegration(message) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const statusMsg = await message.reply(`🔗 Fetching integrations...`);

    const res = await jnkieRequestRaw('GET', '/integrations');
    
    if (res.statusCode !== 200) {
        return statusMsg.edit(`❌ Failed: ${res.statusCode}\n\`\`\`${res.rawData?.substring(0, 500)}\`\`\``);
    }

    let desc = '';
    let integrationIds = [];

    try {
        const data = JSON.parse(res.rawData);
        const items = data.data || data.integrations || data.items || data.results || (Array.isArray(data) ? data : []);
        
        if (Array.isArray(items) && items.length > 0) {
            desc += `**Found ${items.length} integrations:**\n\n`;
            
            for (const i of items.slice(0, 15)) {
                const id = i.id || i._id || i.integrationId || 'N/A';
                const name = i.name || i.title || i.type || 'Unnamed';
                const type = i.type || i.integration || i.provider || '';
                
                integrationIds.push(id);
                desc += `🔗 **${name}**\n`;
                desc += `   ID: \`${id}\`\n`;
                desc += `   Type: ${type}\n`;
                
                // Tampilkan semua field untuk analisis
                Object.keys(i).forEach(k => {
                    if (!['id', '_id', 'name', 'title', 'type'].includes(k)) {
                        const val = typeof i[k] === 'object' ? JSON.stringify(i[k]).substring(0, 50) : String(i[k]).substring(0, 50);
                        desc += `   ${k}: ${val}\n`;
                    }
                });
                desc += '\n';
            }

            // Test akses dengan integration ID
            if (integrationIds[0] && integrationIds[0] !== 'N/A') {
                desc += `\n**🔍 Testing access patterns:**\n`;
                
                const testPaths = [
                    `/integrations/${integrationIds[0]}`,
                    `/integrations?id=${integrationIds[0]}`,
                    `/services/obfuscate?integrationId=${integrationIds[0]}`,
                    `/services/luraph?integrationId=${integrationIds[0]}`,
                ];

                for (const tp of testPaths) {
                    const testRes = await jnkieRequestRaw('GET', tp);
                    const icon = testRes.statusCode === 200 ? '✅' : (testRes.statusCode === 400 ? '⚠️' : '❌');
                    desc += `${icon} \`${tp}\` (${testRes.statusCode})\n`;
                    await new Promise(r => setTimeout(r, 100));
                }
            }

        } else {
            desc = `Empty or unexpected format:\n\`\`\`json\n${res.rawData?.substring(0, 1000)}\n\`\`\``;
        }
    } catch (e) {
        desc = `Parse error:\n\`\`\`json\n${res.rawData?.substring(0, 1500)}\n\`\`\``;
    }

    await statusMsg.edit({
        embeds: [{
            title: '🔗 Integrations',
            description: desc.substring(0, 4000),
            color: 0x9b59b6
        }]
    });
}

// ================================================================
// 🔬 PROBE LURAPH - Probe semua endpoint luraph dengan POST body
// ================================================================
async function handleProbeLuraph(message) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const statusMsg = await message.reply(`🔬 **Probing Luraph endpoints dengan POST...**`);

    const endpoints = [
        '/services/luraph',
        '/services/obfuscate', 
        '/integrations/luraph',
        '/providers/luraph',
        '/luraph',
        '/obfuscate'
    ];

    const testScript = 'print("hello")';

    // Berbagai format POST body
    const bodies = [
        { script: testScript },
        { code: testScript },
        { content: testScript },
        { input: testScript },
        { source: testScript },
        { lua: testScript },
        { script: testScript, serviceId: JNKIE_SERVICE_ID },
        { script: testScript, service_id: JNKIE_SERVICE_ID },
        { script: testScript, provider: 'luraph' },
        { script: testScript, type: 'luraph' },
        { data: { script: testScript } },
        { data: { script: testScript, serviceId: JNKIE_SERVICE_ID } },
    ];

    let results = [];

    for (const ep of endpoints) {
        await statusMsg.edit(`🔬 Testing POST: \`${ep}\`...`);

        for (const body of bodies) {
            const res = await jnkieRequestRaw('POST', ep, body);
            
            // Cari yang bukan 404
            if (res.statusCode !== 404) {
                results.push({
                    endpoint: ep,
                    body: JSON.stringify(body).substring(0, 50),
                    status: res.statusCode,
                    response: res.rawData?.substring(0, 100)
                });

                // Jika 200, langsung break
                if (res.statusCode === 200) break;
            }

            await new Promise(r => setTimeout(r, 100));
        }
    }

    // Sort by status (200 first)
    results.sort((a, b) => {
        if (a.status === 200) return -1;
        if (b.status === 200) return 1;
        return a.status - b.status;
    });

    const desc = results.map(r => {
        let icon = '❌';
        if (r.status === 200) icon = '✅';
        else if (r.status === 400) icon = '⚠️';
        else if (r.status === 401) icon = '🔒';
        else if (r.status === 405) icon = '✋';

        return `${icon} **POST** \`${r.endpoint}\`\n   Body: \`${r.body}...\`\n   Status: ${r.status}\n   Response: ${r.response || 'N/A'}`;
    }).join('\n\n');

    const success = results.filter(r => r.status === 200);

    await statusMsg.edit({
        embeds: [{
            title: '🔬 Probe Luraph POST Results',
            description: desc.substring(0, 4000) || 'No results',
            color: success.length > 0 ? 0x2ecc71 : 0xe74c3c,
            footer: success.length > 0 
                ? { text: `✅ Found ${success.length} working endpoint(s)!` }
                : { text: 'No working POST found. Check !checkprovider and !checkintegration' }
        }]
    });
}

// ================================================================
// 📤 RAW POST - POST dengan custom body
// ================================================================
async function handleRawPost(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const endpoint = args[0] || '/services/luraph';
    
    // Parse body dari args: !rawpost /endpoint {"key":"value"}
    let body = { serviceId: JNKIE_SERVICE_ID };
    
    const jsonArg = args.slice(1).join(' ');
    if (jsonArg) {
        try {
            body = JSON.parse(jsonArg);
        } catch (e) {
            // Parse key=value format
            args.slice(1).forEach(arg => {
                const [k, v] = arg.split('=');
                if (k && v) body[k] = v;
            });
        }
    }

    const statusMsg = await message.reply(`📤 POST \`${endpoint}\`\nBody: \`${JSON.stringify(body)}\``);

    const res = await jnkieRequestRaw('POST', endpoint, body);
    
    await statusMsg.edit(`📤 **POST** \`${endpoint}\`\n**Status:** ${res.statusCode}\n**Body:** \`${JSON.stringify(body)}\`\n\`\`\`json\n${res.rawData?.substring(0, 1500) || 'Empty'}\n\`\`\``);
}

// ================================================================
// 🔮 LURAPH - Obfuscate dengan Luraph
// ================================================================
async function handleLuraph(message) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');
    
    if (message.attachments.size === 0) {
        return message.reply({
            embeds: [{
                title: '🔮 Luraph Obfuscator',
                description: 'Attach file .lua untuk di-obfuscate',
                color: 0x9b59b6,
                fields: [
                    { name: 'Usage', value: '`!luraph` + attach file' },
                    { name: 'Cari Endpoint', value: '`!crackluraph` - Cari parameter\n`!probeluraph` - Test POST\n`!checkprovider` - Lihat providers' }
                ]
            }]
        });
    }

    const attachment = message.attachments.first();
    const statusMsg = await message.reply(`🔮 **Processing Luraph...**\n📄 ${attachment.name}`);

    try {
        const scriptContent = await downloadFile(attachment.url);
        
        // Endpoints untuk dicoba
        const attempts = [
            { path: '/services/luraph', body: { script: scriptContent, serviceId: JNKIE_SERVICE_ID } },
            { path: '/services/obfuscate', body: { script: scriptContent, provider: 'luraph', serviceId: JNKIE_SERVICE_ID } },
            { path: '/integrations/luraph', body: { script: scriptContent } },
            { path: '/providers/luraph', body: { script: scriptContent } },
            { path: '/luraph', body: { script: scriptContent } },
            { path: '/obfuscate', body: { script: scriptContent, type: 'luraph' } },
        ];

        let success = null;

        for (const attempt of attempts) {
            await statusMsg.edit(`🔮 Trying: \`${attempt.path}\`...`);
            
            const res = await jnkieRequestRaw('POST', attempt.path, attempt.body);
            
            if (res.statusCode === 200) {
                success = { path: attempt.path, response: res.rawData };
                break;
            }
            
            await new Promise(r => setTimeout(r, 200));
        }

        if (success) {
            let result = success.response;
            
            try {
                const json = JSON.parse(success.response);
                result = json.script || json.result || json.output || json.data || json.code || json.obfuscated || success.response;
                
                // Jika result masih object
                if (typeof result === 'object') {
                    result = result.script || result.code || result.output || JSON.stringify(result);
                }
            } catch (e) {}

            const file = new AttachmentBuilder(Buffer.from(result), { 
                name: `luraph_${attachment.name}` 
            });

            await statusMsg.edit({ 
                content: `✅ **Luraph Success!**\nEndpoint: \`${success.path}\``, 
                files: [file] 
            });
        } else {
            await statusMsg.edit(`❌ **Luraph gagal.**\n\nJalankan:\n• \`!crackluraph\` - Cari parameter\n• \`!checkprovider\` - Lihat providers\n• \`!checkintegration\` - Lihat integrations`);
        }

    } catch (err) {
        await statusMsg.edit(`❌ Error: ${err.message}`);
    }
}

// ================================================================
// STANDARD HANDLERS
// ================================================================
async function handleRaw(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');
    const endpoint = args[0] || '/services';
    const res = await jnkieRequestRaw('GET', endpoint);
    message.reply(`**GET** \`${endpoint}\` (${res.statusCode}):\n\`\`\`json\n${res.rawData?.substring(0, 1800) || 'Empty'}\n\`\`\``);
}

async function handleProbe(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');
    const endpoint = args[0] || '/services/luraph';
    const statusMsg = await message.reply(`🔬 Probing \`${endpoint}\`...`);

    const params = ['', `?serviceId=${JNKIE_SERVICE_ID}`, `?id=${JNKIE_SERVICE_ID}`, `?provider=luraph`];
    let results = [];

    for (const p of params) {
        const res = await jnkieRequestRaw('GET', `${endpoint}${p}`);
        results.push(`${res.statusCode === 200 ? '✅' : '❌'} GET \`${endpoint}${p}\` (${res.statusCode})`);
    }

    // POST test
    const postRes = await jnkieRequestRaw('POST', endpoint, { script: 'print("test")', serviceId: JNKIE_SERVICE_ID });
    results.push(`${postRes.statusCode === 200 ? '✅' : '❌'} POST \`${endpoint}\` (${postRes.statusCode})`);

    await statusMsg.edit({ embeds: [{ title: `🔬 Probe: ${endpoint}`, description: results.join('\n'), color: 0x3498db }] });
}

async function handleScan(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');
    const statusMsg = await message.reply(`🕵️ Scanning...`);

    const endpoints = [
        '/services', '/keys', '/providers', '/integrations',
        `/services/${JNKIE_SERVICE_ID}`,
        '/services/luraph', '/services/obfuscate',
        '/integrations/luraph', '/providers/luraph',
        '/luraph', '/obfuscate', '/scripts'
    ];

    let results = [];
    for (const ep of endpoints) {
        const res = await jnkieRequestRaw('GET', ep);
        const icon = res.statusCode === 200 ? '✅' : (res.statusCode === 400 ? '⚠️' : '❌');
        results.push(`${icon} \`${ep}\` (${res.statusCode})`);
    }

    await statusMsg.edit({ embeds: [{ title: '🕵️ Scan', description: results.join('\n'), color: 0x3498db }] });
}

async function handleDebug(message) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');
    const statusMsg = await message.reply(`🔍 Debug...`);

    const tests = ['/services', '/providers', '/integrations', '/keys', `/services/${JNKIE_SERVICE_ID}`];
    let results = [];

    for (const t of tests) {
        const res = await jnkieRequestRaw('GET', t);
        results.push(`${res.statusCode === 200 ? '✅' : '❌'} \`${t}\` (${res.statusCode})`);
    }

    await statusMsg.edit({ embeds: [{ title: '🔍 Debug', description: results.join('\n'), color: 0x3498db }] });
}

async function handleHelp(message) {
    message.reply({
        embeds: [{
            title: '📖 Commands',
            color: 0x9b59b6,
            fields: [
                { 
                    name: '🔮 Obfuscator', 
                    value: '`!obf` + file → Prometheus\n`!luraph` + file → Luraph via jnkie',
                    inline: false 
                },
                { 
                    name: '🔓 Crack Luraph', 
                    value: '`!crackluraph` → Cari parameter\n`!probeluraph` → Test POST\n`!checkprovider` → Lihat providers\n`!checkintegration` → Lihat integrations',
                    inline: false 
                },
                { 
                    name: '🛠️ Explorer', 
                    value: '`!raw [endpoint]` → GET\n`!rawpost [endpoint] [body]` → POST\n`!probe [endpoint]` → Test params\n`!scan` → Scan all',
                    inline: false 
                }
            ],
            footer: { text: `Service ID: ${JNKIE_SERVICE_ID}` }
        }]
    });
}

function handleStatus(message) {
    message.reply(`✅ Online | Service: \`${JNKIE_SERVICE_ID}\``);
}

// ================================================================
// PROMETHEUS
// ================================================================
async function handleObfuscate(message) {
    if (message.attachments.size === 0) return message.reply('❌ Attach file');
    const attachment = message.attachments.first();
    const presetKey = message.content.split(/\s+/)[1] || 'minify';
    const preset = PRESETS[presetKey.toLowerCase()] || PRESETS.minify;
    
    const timestamp = Date.now();
    const inputPath = path.join(PROMETHEUS_PATH, `in_${timestamp}.lua`);
    const outputPath = path.join(PROMETHEUS_PATH, `out_${timestamp}.lua`);

    try {
        const luaCode = await downloadFile(attachment.url);
        fs.writeFileSync(inputPath, luaCode.replace(/^\uFEFF/, '').trim(), 'utf8');
        
        const msg = await message.reply(`🔄 Prometheus ${preset.emoji}...`);
        await execAsync(`cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset ${preset.value} "${inputPath}" --out "${outputPath}" 2>&1`, { timeout: 120000 });

        if (fs.existsSync(outputPath)) {
            const result = HEADER + fs.readFileSync(outputPath, 'utf8');
            const file = new AttachmentBuilder(Buffer.from(result), { name: `prometheus_${attachment.name}` });
            await msg.edit({ content: '✅ Prometheus Success', files: [file] });
        } else {
            await msg.edit('❌ Failed');
        }
    } catch (err) {
        message.reply(`❌ Error: ${err.message}`);
    } finally {
        [inputPath, outputPath].forEach(f => { try { fs.unlinkSync(f); } catch(e) {} });
    }
}

// ================================================================
// API & HELPERS
// ================================================================
function jnkieRequestRaw(method, endpoint, body = null) {
    return new Promise((resolve) => {
        const postData = body ? JSON.stringify(body) : '';
        
        const options = {
            hostname: 'api.jnkie.com',
            port: 443,
            path: `/api/v2${endpoint}`,
            method: method,
            headers: {
                'Authorization': `Bearer ${JNKIE_API_KEY}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        if (body) options.headers['Content-Length'] = Buffer.byteLength(postData);

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, rawData: data }));
        });

        req.on('error', (e) => resolve({ statusCode: 0, rawData: e.message }));
        req.setTimeout(15000, () => { req.destroy(); resolve({ statusCode: 408, rawData: 'Timeout' }); });

        if (body) req.write(postData);
        req.end();
    });
}

function downloadFile(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            const data = [];
            res.on('data', c => data.push(c));
            res.on('end', () => resolve(Buffer.concat(data).toString()));
        }).on('error', reject);
    });
}

client.login(TOKEN);
