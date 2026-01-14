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
        // Obfuscator Commands
        if (cmd === '!obf') await handleObfuscate(message);
        if (cmd === '!luraph') await handleLuraph(message);           // 🆕 Luraph via jnkie
        if (cmd === '!jnkieobf') await handleJnkieObfuscate(message); // 🆕 jnkie obfuscate
        
        // Explorer Commands  
        if (cmd === '!findluraph') await handleFindLuraph(message);   // 🆕 Cari endpoint luraph
        if (cmd === '!findscript') await handleFindScript(message);   // 🆕 Cari endpoint script
        if (cmd === '!probe') await handleProbe(message, args);
        if (cmd === '!raw') await handleRaw(message, args);
        if (cmd === '!post') await handlePost(message, args);
        if (cmd === '!scan') await handleScan(message, args);
        if (cmd === '!debug') await handleDebug(message);
        
        // Other
        if (cmd === '!presets') await handlePresets(message);
        if (cmd === '!status') await handleStatus(message);
        if (cmd === '!help') await handleHelp(message);
        if (cmd === '!service') await handleService(message, args);
        if (cmd === '!key') await handleKey(message, args);
    } catch (err) {
        console.error(err);
        message.reply(`❌ Error: ${err.message}`);
    }
});

// ================================================================
// 🔍 FIND LURAPH - Cari semua endpoint terkait Luraph/Obfuscate
// ================================================================
async function handleFindLuraph(message) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const statusMsg = await message.reply(`🔍 **Mencari endpoint Luraph/Obfuscate...**`);

    // Semua kemungkinan endpoint untuk obfuscate
    const endpoints = [
        // Root level
        '/luraph',
        '/obfuscate',
        '/obfuscator',
        '/protect',
        '/compile',
        '/encrypt',
        
        // Dengan prefix
        '/v1/luraph',
        '/v1/obfuscate',
        '/api/luraph',
        '/api/obfuscate',
        
        // Services level
        '/services/luraph',
        '/services/obfuscate',
        '/services/obfuscator',
        '/services/protect',
        
        // Dengan Service ID
        `/services/${JNKIE_SERVICE_ID}/luraph`,
        `/services/${JNKIE_SERVICE_ID}/obfuscate`,
        `/services/${JNKIE_SERVICE_ID}/protect`,
        `/services/${JNKIE_SERVICE_ID}/script`,
        `/services/${JNKIE_SERVICE_ID}/scripts`,
        `/services/${JNKIE_SERVICE_ID}/compile`,
        
        // Integrations (mungkin luraph sebagai integration)
        '/integrations/luraph',
        '/integrations/obfuscate',
        
        // Providers
        '/providers/luraph',
        '/providers/obfuscate',
        
        // Scripts related
        '/scripts/obfuscate',
        '/scripts/luraph',
        '/script/obfuscate',
        '/script/luraph',
        
        // Loader related
        '/loader/obfuscate',
        '/loaders/obfuscate',
        
        // Execute related
        '/execute',
        '/execute/luraph',
        '/run/luraph'
    ];

    let results = { found: [], maybe: [], notfound: [] };

    for (let i = 0; i < endpoints.length; i++) {
        const ep = endpoints[i];
        if (i % 5 === 0) {
            await statusMsg.edit(`🔍 Scanning... ${Math.round((i/endpoints.length)*100)}%`);
        }

        // Test GET
        const getRes = await jnkieRequestRaw('GET', ep);
        
        // Test POST juga (obfuscate biasanya POST)
        const postRes = await jnkieRequestRaw('POST', ep, { script: 'print("test")' });

        if (getRes.statusCode === 200 || postRes.statusCode === 200) {
            results.found.push({ 
                ep, 
                get: getRes.statusCode, 
                post: postRes.statusCode,
                data: getRes.rawData?.substring(0, 100) || postRes.rawData?.substring(0, 100)
            });
        } else if (getRes.statusCode === 400 || postRes.statusCode === 400 || 
                   getRes.statusCode === 401 || postRes.statusCode === 401) {
            results.maybe.push({ ep, get: getRes.statusCode, post: postRes.statusCode });
        }

        await new Promise(r => setTimeout(r, 150));
    }

    // Build result message
    let desc = '';
    
    if (results.found.length > 0) {
        desc += '**✅ DITEMUKAN (200):**\n';
        desc += results.found.map(r => `• \`${r.ep}\` (GET:${r.get} POST:${r.post})`).join('\n');
        desc += '\n\n';
    }
    
    if (results.maybe.length > 0) {
        desc += '**⚠️ MUNGKIN AKTIF (400/401):**\n';
        desc += results.maybe.map(r => `• \`${r.ep}\` (GET:${r.get} POST:${r.post})`).join('\n');
    }

    if (results.found.length === 0 && results.maybe.length === 0) {
        desc = '❌ Tidak ditemukan endpoint Luraph/Obfuscate standar.\n\nCoba:\n`!raw /integrations` untuk lihat integrasi\n`!raw /providers` untuk lihat provider';
    }

    await statusMsg.edit({
        embeds: [{
            title: '🔍 Luraph/Obfuscate Endpoints',
            description: desc,
            color: results.found.length > 0 ? 0x2ecc71 : 0xf39c12,
            footer: { text: 'Use !probe [endpoint] untuk explore lebih lanjut' }
        }]
    });
}

// ================================================================
// 🔍 FIND SCRIPT - Cari endpoint untuk manage script
// ================================================================
async function handleFindScript(message) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const statusMsg = await message.reply(`🔍 **Mencari endpoint Script...**`);

    const endpoints = [
        // Root
        '/scripts',
        '/script',
        '/files',
        '/file',
        '/uploads',
        '/upload',
        '/assets',
        '/asset',
        
        // Dengan Service ID
        `/services/${JNKIE_SERVICE_ID}/scripts`,
        `/services/${JNKIE_SERVICE_ID}/script`,
        `/services/${JNKIE_SERVICE_ID}/files`,
        `/services/${JNKIE_SERVICE_ID}/file`,
        `/services/${JNKIE_SERVICE_ID}/assets`,
        `/services/${JNKIE_SERVICE_ID}/upload`,
        `/services/${JNKIE_SERVICE_ID}/loader`,
        `/services/${JNKIE_SERVICE_ID}/loaders`,
        
        // Query params
        `/scripts?serviceId=${JNKIE_SERVICE_ID}`,
        `/scripts?service_id=${JNKIE_SERVICE_ID}`,
        `/scripts?id=${JNKIE_SERVICE_ID}`,
        `/files?serviceId=${JNKIE_SERVICE_ID}`,
        
        // Services subpath dengan query
        `/services/scripts?serviceId=${JNKIE_SERVICE_ID}`,
        `/services/scripts?id=${JNKIE_SERVICE_ID}`,
        `/services/files?serviceId=${JNKIE_SERVICE_ID}`,
    ];

    let results = { found: [], maybe: [] };

    for (let i = 0; i < endpoints.length; i++) {
        const ep = endpoints[i];
        if (i % 5 === 0) {
            await statusMsg.edit(`🔍 Scanning... ${Math.round((i/endpoints.length)*100)}%`);
        }

        const getRes = await jnkieRequestRaw('GET', ep);
        const postRes = await jnkieRequestRaw('POST', ep, { name: 'test' });

        if (getRes.statusCode === 200 || postRes.statusCode === 200) {
            results.found.push({ ep, get: getRes.statusCode, post: postRes.statusCode, data: getRes.rawData?.substring(0, 150) });
        } else if (getRes.statusCode === 400 || postRes.statusCode === 400) {
            results.maybe.push({ ep, get: getRes.statusCode, post: postRes.statusCode });
        }

        await new Promise(r => setTimeout(r, 150));
    }

    let desc = '';
    
    if (results.found.length > 0) {
        desc += '**✅ DITEMUKAN:**\n';
        results.found.forEach(r => {
            desc += `• \`${r.ep}\` (GET:${r.get} POST:${r.post})\n`;
            if (r.data) desc += `  └─ Preview: ${r.data.substring(0, 80)}...\n`;
        });
    }
    
    if (results.maybe.length > 0) {
        desc += '\n**⚠️ BUTUH PARAMETER:**\n';
        desc += results.maybe.map(r => `• \`${r.ep}\` (GET:${r.get} POST:${r.post})`).join('\n');
    }

    if (desc === '') desc = '❌ Tidak ditemukan endpoint script standar.';

    await statusMsg.edit({
        embeds: [{
            title: '🔍 Script Endpoints',
            description: desc,
            color: results.found.length > 0 ? 0x2ecc71 : 0xf39c12
        }]
    });
}

// ================================================================
// 🔮 LURAPH via jnkie API (jika endpoint ditemukan)
// ================================================================
async function handleLuraph(message) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');
    
    // Cek apakah ada file attachment
    const hasFile = message.attachments.size > 0;
    
    if (!hasFile) {
        return message.reply({
            embeds: [{
                title: '🔮 Luraph Obfuscator',
                description: 'Upload file Lua untuk di-obfuscate dengan Luraph via jnkie API.',
                color: 0x9b59b6,
                fields: [
                    { name: 'Usage', value: '`!luraph` + attach file .lua' },
                    { name: 'Status', value: 'Mencari endpoint...' }
                ]
            }]
        });
    }

    const attachment = message.attachments.first();
    const statusMsg = await message.reply(`🔮 **Luraph Obfuscating...**\n📄 File: ${attachment.name}`);

    try {
        // Download script
        const scriptContent = await downloadFile(attachment.url);
        
        // Coba berbagai endpoint obfuscate
        const possibleEndpoints = [
            { path: '/luraph', method: 'POST', body: { script: scriptContent } },
            { path: '/obfuscate', method: 'POST', body: { script: scriptContent, provider: 'luraph' } },
            { path: '/services/luraph', method: 'POST', body: { script: scriptContent } },
            { path: '/services/obfuscate', method: 'POST', body: { script: scriptContent, type: 'luraph' } },
            { path: `/services/${JNKIE_SERVICE_ID}/obfuscate`, method: 'POST', body: { script: scriptContent } },
            { path: '/integrations/luraph', method: 'POST', body: { script: scriptContent } },
            { path: '/providers/luraph', method: 'POST', body: { script: scriptContent } },
            { path: '/execute', method: 'POST', body: { script: scriptContent, action: 'obfuscate' } },
        ];

        let success = null;

        for (const ep of possibleEndpoints) {
            await statusMsg.edit(`🔮 Trying: \`${ep.path}\`...`);
            
            const res = await jnkieRequestRaw(ep.method, ep.path, ep.body);
            
            if (res.statusCode === 200) {
                success = { endpoint: ep.path, response: res.rawData };
                break;
            }
            
            await new Promise(r => setTimeout(r, 200));
        }

        if (success) {
            // Parse response untuk dapat hasil obfuscate
            let result = success.response;
            try {
                const json = JSON.parse(success.response);
                result = json.script || json.result || json.output || json.data || json.code || success.response;
            } catch (e) {}

            // Kirim sebagai file
            const file = new AttachmentBuilder(Buffer.from(result), { 
                name: `luraph_${attachment.name}` 
            });

            await statusMsg.edit({ 
                content: `✅ **Luraph Success!**\nEndpoint: \`${success.endpoint}\``, 
                files: [file] 
            });
        } else {
            await statusMsg.edit(`❌ **Tidak dapat menemukan endpoint Luraph yang aktif.**\n\nJalankan \`!findluraph\` untuk scan endpoint.`);
        }

    } catch (err) {
        await statusMsg.edit(`❌ Error: ${err.message}`);
    }
}

// ================================================================
// 🛡️ JNKIE OBFUSCATE (generic)
// ================================================================
async function handleJnkieObfuscate(message) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');
    if (message.attachments.size === 0) return message.reply('❌ Attach file .lua');

    const attachment = message.attachments.first();
    const statusMsg = await message.reply(`🛡️ **jnkie Obfuscating...**\n📄 File: ${attachment.name}`);

    try {
        const scriptContent = await downloadFile(attachment.url);
        
        // Test semua endpoint obfuscate
        const endpoints = [
            { path: '/obfuscate', body: { script: scriptContent } },
            { path: '/services/obfuscate', body: { script: scriptContent, serviceId: JNKIE_SERVICE_ID } },
            { path: `/services/${JNKIE_SERVICE_ID}/obfuscate`, body: { script: scriptContent } },
            { path: '/protect', body: { script: scriptContent } },
            { path: '/compile', body: { script: scriptContent } },
        ];

        let success = null;

        for (const ep of endpoints) {
            await statusMsg.edit(`🛡️ Trying: \`${ep.path}\`...`);
            const res = await jnkieRequestRaw('POST', ep.path, ep.body);
            
            if (res.statusCode === 200) {
                success = { endpoint: ep.path, response: res.rawData };
                break;
            }
            await new Promise(r => setTimeout(r, 200));
        }

        if (success) {
            let result = success.response;
            try {
                const json = JSON.parse(success.response);
                result = json.script || json.result || json.output || json.data || success.response;
            } catch (e) {}

            const file = new AttachmentBuilder(Buffer.from(result), { 
                name: `jnkie_${attachment.name}` 
            });

            await statusMsg.edit({ 
                content: `✅ **jnkie Obfuscate Success!**\nEndpoint: \`${success.endpoint}\``, 
                files: [file] 
            });
        } else {
            await statusMsg.edit(`❌ Tidak ditemukan endpoint obfuscate aktif.\n\nGunakan:\n• \`!obf\` untuk Prometheus\n• \`!findluraph\` untuk scan endpoint`);
        }

    } catch (err) {
        await statusMsg.edit(`❌ Error: ${err.message}`);
    }
}

// ================================================================
// 🔬 PROBE - Test endpoint dengan parameter
// ================================================================
async function handleProbe(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const endpoint = args[0] || '/services/scripts';
    const statusMsg = await message.reply(`🔬 Probing \`${endpoint}\`...`);

    const params = [
        '',
        `?serviceId=${JNKIE_SERVICE_ID}`,
        `?service_id=${JNKIE_SERVICE_ID}`,
        `?id=${JNKIE_SERVICE_ID}`,
        `?service=${JNKIE_SERVICE_ID}`,
    ];

    let results = [];

    // Test GET dengan params
    for (const p of params) {
        const res = await jnkieRequestRaw('GET', `${endpoint}${p}`);
        results.push({ method: 'GET', path: `${endpoint}${p}`, status: res.statusCode });
        await new Promise(r => setTimeout(r, 100));
    }

    // Test POST
    const postBodies = [
        { serviceId: JNKIE_SERVICE_ID },
        { service_id: JNKIE_SERVICE_ID },
        { id: JNKIE_SERVICE_ID },
        { script: 'print("test")' },
        { script: 'print("test")', serviceId: JNKIE_SERVICE_ID },
    ];

    for (const body of postBodies) {
        const res = await jnkieRequestRaw('POST', endpoint, body);
        results.push({ method: 'POST', path: endpoint, body: JSON.stringify(body).substring(0, 30), status: res.statusCode });
        await new Promise(r => setTimeout(r, 100));
    }

    const list = results.map(r => {
        const icon = r.status === 200 ? '✅' : (r.status === 400 ? '⚠️' : '❌');
        return `${icon} ${r.method} \`${r.path}\` ${r.body || ''} (${r.status})`;
    }).join('\n');

    const success = results.filter(r => r.status === 200);

    await statusMsg.edit({
        embeds: [{
            title: `🔬 Probe: ${endpoint}`,
            description: list,
            color: success.length > 0 ? 0x2ecc71 : 0xe74c3c,
            footer: success.length > 0 ? { text: `✅ Found ${success.length} working!` } : { text: 'No working params found' }
        }]
    });
}

// ================================================================
// RAW, SCAN, DEBUG, dll
// ================================================================
async function handleRaw(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');
    const endpoint = args[0] || '/services';
    const res = await jnkieRequestRaw('GET', endpoint);
    message.reply(`**GET** \`${endpoint}\` (${res.statusCode}):\n\`\`\`json\n${res.rawData?.substring(0, 1800) || 'Empty'}\n\`\`\``);
}

async function handlePost(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');
    const endpoint = args[0] || '/services';
    let body = { serviceId: JNKIE_SERVICE_ID };
    args.slice(1).forEach(arg => {
        const [k, v] = arg.split('=');
        if (k && v) body[k] = v;
    });
    const res = await jnkieRequestRaw('POST', endpoint, body);
    message.reply(`**POST** \`${endpoint}\` (${res.statusCode}):\nBody: \`${JSON.stringify(body)}\`\n\`\`\`json\n${res.rawData?.substring(0, 1500) || 'Empty'}\n\`\`\``);
}

async function handleScan(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');
    const filter = args[0]?.toLowerCase();
    const statusMsg = await message.reply(`🕵️ Scanning...`);

    const bases = ['/services', '/keys', '/providers', '/integrations', '/scripts', '/obfuscate', '/luraph', `/services/${JNKIE_SERVICE_ID}`];
    const subs = ['', '/list', '/all', '/create', '/scripts', '/keys', '/obfuscate', '/luraph', '/protect', '/execute'];

    let targets = [];
    bases.forEach(b => subs.forEach(s => targets.push(`${b}${s}`)));
    if (filter) targets = targets.filter(t => t.includes(filter));
    targets = [...new Set(targets)];

    let found = [];
    for (let i = 0; i < targets.length; i += 10) {
        const batch = targets.slice(i, i + 10);
        await statusMsg.edit(`🕵️ ${Math.round((i/targets.length)*100)}%`);
        const results = await Promise.all(batch.map(p => jnkieRequestRaw('GET', p).then(r => ({ path: p, status: r.statusCode }))));
        results.forEach(r => { if (r.status !== 404) found.push(r); });
        await new Promise(r => setTimeout(r, 250));
    }

    found.sort((a, b) => a.status - b.status);
    const list = found.map(f => `${f.status === 200 ? '✅' : '⚠️'} \`${f.path}\` (${f.status})`).join('\n');

    await statusMsg.edit({
        embeds: [{
            title: '🕵️ Scan Results',
            description: list || 'No results',
            color: 0x3498db
        }]
    });
}

async function handleDebug(message) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');
    const statusMsg = await message.reply(`🔍 Debug...`);
    
    const tests = [
        '/services', '/keys', '/providers', '/integrations',
        '/luraph', '/obfuscate', '/scripts',
        `/services/${JNKIE_SERVICE_ID}`,
    ];

    let results = [];
    for (const t of tests) {
        const res = await jnkieRequestRaw('GET', t);
        results.push(`${res.statusCode === 200 ? '✅' : '❌'} \`${t}\` (${res.statusCode})`);
    }

    await statusMsg.edit({
        embeds: [{
            title: '🔍 Debug',
            description: results.join('\n'),
            color: 0x3498db,
            footer: { text: '!findluraph untuk cari Luraph | !findscript untuk cari Script' }
        }]
    });
}

// ================================================================
// PROMETHEUS OBFUSCATE (Local)
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
// HANDLERS
// ================================================================
async function handleService(message, args) {
    if (!args[0] || args[0] === 'list') {
        const res = await jnkieRequestRaw('GET', '/services');
        return message.reply(`**Services (${res.statusCode}):**\n\`\`\`json\n${res.rawData?.substring(0, 1800) || 'Empty'}\n\`\`\``);
    }
    message.reply('Usage: `!service list`');
}

async function handleKey(message, args) {
    if (!args[0] || args[0] === 'list') {
        const res = await jnkieRequestRaw('GET', '/keys');
        return message.reply(`**Keys (${res.statusCode}):**\n\`\`\`json\n${res.rawData?.substring(0, 1800) || 'Empty'}\n\`\`\``);
    }
    message.reply('Usage: `!key list`');
}

async function handleHelp(message) {
    message.reply({
        embeds: [{
            title: '📖 Bot Commands',
            color: 0x9b59b6,
            fields: [
                { 
                    name: '🔮 Obfuscator', 
                    value: '`!obf [preset]` + file → Prometheus\n`!luraph` + file → Luraph via jnkie\n`!jnkieobf` + file → jnkie obfuscate',
                    inline: false 
                },
                { 
                    name: '🔍 Endpoint Finder', 
                    value: '`!findluraph` → Cari endpoint Luraph\n`!findscript` → Cari endpoint Script\n`!probe [endpoint]` → Test parameter',
                    inline: false 
                },
                { 
                    name: '🛠️ Explorer', 
                    value: '`!raw [endpoint]` → GET request\n`!post [endpoint]` → POST request\n`!scan` → Scan semua\n`!debug` → Quick debug',
                    inline: false 
                },
                { 
                    name: '📦 Management', 
                    value: '`!service list` | `!key list`',
                    inline: false 
                }
            ],
            footer: { text: `Service ID: ${JNKIE_SERVICE_ID}` }
        }]
    });
}

async function handlePresets(message) {
    message.reply('Prometheus Presets: 🟢 `minify` | 🔵 `weak` | 🟡 `medium`');
}

function handleStatus(message) {
    message.reply(`✅ Online\n📦 Service: \`${JNKIE_SERVICE_ID}\`\n🔑 API: ${JNKIE_API_KEY ? 'Set' : 'Not Set'}`);
}

// ================================================================
// JNKIE API
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
