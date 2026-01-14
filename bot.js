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

const HEADER = `-- This file was protected using Prometheus Obfuscator [https://discord.gg/QarfX8ua2]\n\n`;

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
        if (cmd === '!obf') await handleObfuscate(message);
        else if (cmd === '!presets') await handlePresets(message);
        else if (cmd === '!raw') await handleRaw(message, args);       // 🆕 Lihat RAW response
        else if (cmd === '!scan') await handleScan(message, args);
        else if (cmd === '!debug') await handleDebug(message);
        else if (cmd === '!test') await handleTest(message);           // 🆕 Test semua endpoint
        else if (cmd === '!status') await handleStatus(message);
        else if (cmd === '!help') await handleHelp(message);
        else if (cmd === '!service') await handleService(message, args);
        else if (cmd === '!key') await handleKey(message, args);
    } catch (err) {
        console.error(err);
        message.reply(`❌ System Error: ${err.message}`);
    }
});

// ================================================================
// 🔬 RAW RESPONSE - Lihat response mentah
// ================================================================
async function handleRaw(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const endpoint = args[0] || '/services';
    const method = (args[1] || 'GET').toUpperCase();
    
    const statusMsg = await message.reply(`🔬 Fetching RAW: \`${endpoint}\`...`);

    const res = await jnkieRequestRaw(method, endpoint);
    
    // Tampilkan response mentah
    let output = `**Endpoint:** \`${endpoint}\`\n**Status:** ${res.statusCode}\n\n`;
    output += `**Raw Response:**\n\`\`\`json\n${res.rawData?.substring(0, 1800) || 'No data'}\n\`\`\``;

    await statusMsg.edit(output);
}

// ================================================================
// 🧪 TEST - Test semua endpoint penting
// ================================================================
async function handleTest(message) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const statusMsg = await message.reply(`🧪 Testing endpoints...`);

    const endpoints = [
        '/services',
        '/keys', 
        '/providers',
        '/integrations',
        `/services/${JNKIE_SERVICE_ID}`
    ];

    let results = [];

    for (const ep of endpoints) {
        const res = await jnkieRequestRaw('GET', ep);
        
        let preview = 'Empty';
        if (res.rawData) {
            try {
                const json = JSON.parse(res.rawData);
                // Cek berbagai format response
                const keys = Object.keys(json);
                preview = `Keys: [${keys.join(', ')}]`;
                
                // Coba lihat structure
                if (json.data) preview += ` | data: ${typeof json.data}`;
                if (json.services) preview += ` | services: ${json.services.length}`;
                if (json.keys) preview += ` | keys: ${json.keys.length}`;
                if (json.items) preview += ` | items: ${json.items.length}`;
                if (json.results) preview += ` | results: ${json.results.length}`;
                if (Array.isArray(json)) preview = `Array[${json.length}]`;
                
            } catch (e) {
                preview = res.rawData.substring(0, 100);
            }
        }

        results.push({
            ep,
            status: res.statusCode,
            preview
        });
    }

    const list = results.map(r => {
        const icon = r.status === 200 ? '✅' : '❌';
        return `${icon} \`${r.ep}\` (${r.status})\n   └─ ${r.preview}`;
    }).join('\n\n');

    await statusMsg.edit({
        embeds: [{
            title: '🧪 API Test Results',
            description: list,
            color: 0x3498db,
            footer: { text: 'Use !raw [endpoint] untuk lihat detail' }
        }]
    });
}

// ================================================================
// 🕵️ SMART SCAN
// ================================================================
async function handleScan(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const filter = args[0] ? args[0].toLowerCase() : null;
    const statusMsg = await message.reply(`🕵️ **Scanning...**`);

    // Berdasarkan endpoint yang 400 (butuh parameter), kita scan sub-path
    const bases = [
        '/services',
        '/keys',
        '/providers',
        '/integrations',
        `/services/${JNKIE_SERVICE_ID}`
    ];

    const subPaths = [
        '', '/list', '/all', '/create', '/generate',
        '/scripts', '/script', '/loader', '/loaders',
        '/keys', '/key', '/licenses', '/license',
        '/users', '/user', '/whitelist', '/blacklist',
        '/hwid', '/hwids', '/stats', '/analytics',
        '/logs', '/settings', '/config', '/webhooks',
        '/variables', '/execute', '/validate', '/check',
        '/info', '/details', '/export', '/import'
    ];

    let targets = [];
    bases.forEach(base => {
        subPaths.forEach(sub => {
            targets.push(`${base}${sub}`);
        });
    });

    if (filter) {
        targets = targets.filter(t => t.includes(filter));
    }

    targets = [...new Set(targets)];

    const batchSize = 10;
    let found = [];
    
    for (let i = 0; i < targets.length; i += batchSize) {
        const batch = targets.slice(i, i + batchSize);
        const progress = Math.round((i / targets.length) * 100);
        
        await statusMsg.edit(`🕵️ Scanning... ${progress}%`);

        const promises = batch.map(path => 
            jnkieRequestRaw('GET', path).then(res => ({ path, status: res.statusCode }))
        );
        const results = await Promise.all(promises);

        results.forEach(res => {
            if (res.status !== 404 && res.status !== 0) {
                found.push(res);
            }
        });
        
        await new Promise(r => setTimeout(r, 300));
    }

    if (found.length === 0) {
        return statusMsg.edit(`❌ Tidak ada endpoint ditemukan.`);
    }

    found.sort((a, b) => a.status - b.status);

    const list = found.map(f => {
        let icon = '❓';
        if (f.status >= 200 && f.status < 300) icon = '✅';
        else if (f.status === 400) icon = '⚠️';
        else if (f.status === 401) icon = '🔒';
        else if (f.status === 403) icon = '🚫';
        else if (f.status === 405) icon = '✋';
        else if (f.status >= 500) icon = '🔥';
        
        return `${icon} \`${f.path}\` (${f.status})`;
    }).join('\n');

    await statusMsg.edit({
        embeds: [{
            color: 0x2ecc71,
            title: '🕵️ Scan Results',
            description: list.substring(0, 4000),
            footer: { text: `Found: ${found.length} | Use !raw [path] to explore` }
        }]
    });
}

// ================================================================
// DEBUG
// ================================================================
async function handleDebug(message) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');
    
    const statusMsg = await message.reply(`🔍 Debug...`);
    
    const endpoints = [
        '/services',
        '/keys',
        '/providers',
        '/integrations',
        `/services/${JNKIE_SERVICE_ID}`,
        `/services/${JNKIE_SERVICE_ID}/keys`,
        `/services/${JNKIE_SERVICE_ID}/scripts`,
        `/services/${JNKIE_SERVICE_ID}/users`,
        `/services/${JNKIE_SERVICE_ID}/licenses`
    ];

    let resultTxt = '';
    for (const ep of endpoints) {
        const res = await jnkieRequestRaw('GET', ep);
        const icon = res.statusCode === 200 ? '✅' : (res.statusCode === 404 ? '❌' : '⚠️');
        resultTxt += `${icon} \`${ep}\` (${res.statusCode})\n`;
    }

    await statusMsg.edit({
        embeds: [{
            title: '🔍 Debug',
            description: resultTxt,
            color: 0x3498db,
            footer: { text: 'Use !raw [endpoint] untuk detail | !test untuk struktur' }
        }]
    });
}

// ================================================================
// JNKIE API - RAW VERSION
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
            res.on('end', () => {
                resolve({ 
                    statusCode: res.statusCode,
                    rawData: data,
                    headers: res.headers
                });
            });
        });

        req.on('error', (e) => resolve({ statusCode: 0, rawData: e.message }));
        req.setTimeout(10000, () => { req.destroy(); resolve({ statusCode: 408, rawData: 'Timeout' }); });

        if (body) req.write(postData);
        req.end();
    });
}

// Helper untuk parse response dengan berbagai format
function parseApiResponse(rawData) {
    try {
        const json = JSON.parse(rawData);
        
        // Cek berbagai format umum
        if (json.data) return { success: true, items: json.data };
        if (json.services) return { success: true, items: json.services };
        if (json.keys) return { success: true, items: json.keys };
        if (json.items) return { success: true, items: json.items };
        if (json.results) return { success: true, items: json.results };
        if (Array.isArray(json)) return { success: true, items: json };
        
        // Jika object tunggal
        return { success: true, items: [json] };
    } catch (e) {
        return { success: false, items: [] };
    }
}

// ================================================================
// OBFUSCATOR
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
        fs.writeFileSync(inputPath, cleanLuaCode(luaCode), 'utf8');
        
        const msg = await message.reply(`🔄 Processing ${preset.emoji}...`);
        
        const command = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset ${preset.value} "${inputPath}" --out "${outputPath}" 2>&1`;
        await execAsync(command, { timeout: 120000 });

        if (fs.existsSync(outputPath)) {
            const finalCode = HEADER + fs.readFileSync(outputPath, 'utf8');
            const file = new AttachmentBuilder(Buffer.from(finalCode), { name: `protected_${attachment.name}` });
            await msg.edit({ content: '✅ Success', files: [file] });
        } else {
            await msg.edit('❌ Failed');
        }
    } catch (err) {
        message.reply(`❌ Error: ${err.message}`);
    } finally {
        cleanupFiles(inputPath, outputPath);
    }
}

// ================================================================
// SERVICE & KEY HANDLERS - Updated dengan parsing fleksibel
// ================================================================
async function handleService(message, args) {
    if (args[0] === 'list') {
        const res = await jnkieRequestRaw('GET', '/services');
        const parsed = parseApiResponse(res.rawData);
        
        if (!parsed.success || parsed.items.length === 0) {
            // Tampilkan raw jika parsing gagal
            return message.reply(`**Services Response (${res.statusCode}):**\n\`\`\`json\n${res.rawData?.substring(0, 1500) || 'Empty'}\n\`\`\``);
        }
        
        const list = parsed.items.map(s => `• \`${s.id || s._id || 'N/A'}\` - ${s.name || s.title || 'Unnamed'}`).join('\n');
        return message.reply({ embeds: [{ title: '📦 Services', description: list, color: 0x3498db }] });
    }
    
    if (args[0] === 'info' || args[0] === 'raw') {
        const id = args[1] || JNKIE_SERVICE_ID;
        const res = await jnkieRequestRaw('GET', `/services/${id}`);
        return message.reply(`**Service ${id} (${res.statusCode}):**\n\`\`\`json\n${res.rawData?.substring(0, 1800) || 'Empty'}\n\`\`\``);
    }
    
    message.reply('Usage: `!service list` | `!service info [id]`');
}

async function handleKey(message, args) {
    if (args[0] === 'list') {
        const res = await jnkieRequestRaw('GET', '/keys');
        const parsed = parseApiResponse(res.rawData);
        
        if (!parsed.success || parsed.items.length === 0) {
            return message.reply(`**Keys Response (${res.statusCode}):**\n\`\`\`json\n${res.rawData?.substring(0, 1500) || 'Empty'}\n\`\`\``);
        }
        
        const list = parsed.items.slice(0, 15).map(k => `• \`${(k.key || k.id || k._id || 'unknown').substring(0, 40)}\``).join('\n');
        return message.reply({ embeds: [{ title: '🔑 Keys', description: list, color: 0x2ecc71 }] });
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
                    name: '🔬 Explorer', 
                    value: '`!raw [endpoint]` - Lihat raw response\n`!raw /services`\n`!raw /services/4532`\n`!test` - Test semua endpoint',
                    inline: false 
                },
                { 
                    name: '🕵️ Scanner', 
                    value: '`!scan` - Smart scan\n`!scan keys` - Scan filter\n`!debug` - Quick debug',
                    inline: false 
                },
                { 
                    name: '🔧 Obfuscator', 
                    value: '`!obf [preset]` + file\nPresets: minify, weak, medium',
                    inline: false 
                },
                { 
                    name: '📦 Management', 
                    value: '`!service list` / `!service info`\n`!key list`',
                    inline: false 
                }
            ],
            footer: { text: `Service ID: ${JNKIE_SERVICE_ID}` }
        }]
    });
}

async function handlePresets(message) {
    message.reply('Presets: 🟢 `minify` | 🔵 `weak` | 🟡 `medium`');
}

function handleStatus(message) {
    message.reply(`✅ Bot Online\n📦 Service: \`${JNKIE_SERVICE_ID}\``);
}

// ================================================================
// HELPERS
// ================================================================
function downloadFile(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            const data = [];
            res.on('data', c => data.push(c));
            res.on('end', () => resolve(Buffer.concat(data).toString()));
        }).on('error', reject);
    });
}

function cleanLuaCode(code) {
    return code.replace(/^\uFEFF/, '').trim();
}

function cleanupFiles(...files) {
    files.forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {} });
}

client.login(TOKEN);
