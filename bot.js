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
    console.log(`Service ID: ${JNKIE_SERVICE_ID}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.trim();
    const args = content.split(/\s+/).slice(1);
    const cmd = content.split(/\s+/)[0].toLowerCase();

    try {
        if (cmd === '!obf') await handleObfuscate(message);
        else if (cmd === '!presets') await handlePresets(message);
        else if (cmd === '!scan') await handleScan(message, args);
        else if (cmd === '!debug') await handleDebug(message);
        else if (cmd === '!explore') await handleExplore(message, args);
        else if (cmd === '!info') await handleInfo(message, args);
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
// 🔍 EXPLORE ENDPOINT (!explore) - Lihat isi response
// ================================================================
async function handleExplore(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const endpoint = args[0] || '/services/4532';
    const method = (args[1] || 'GET').toUpperCase();
    
    const statusMsg = await message.reply(`🔍 Exploring \`${endpoint}\` with ${method}...`);

    const res = await jnkieRequest(method, endpoint);
    
    let output = '';
    if (res.success) {
        // Format JSON dengan indentasi
        const jsonStr = JSON.stringify(res.data, null, 2);
        output = `✅ **Status: ${res.statusCode}**\n\`\`\`json\n${jsonStr.substring(0, 1800)}\n\`\`\``;
        
        // Jika response terlalu panjang
        if (jsonStr.length > 1800) {
            output += `\n⚠️ Response terpotong (${jsonStr.length} chars)`;
        }
    } else {
        output = `❌ **Status: ${res.statusCode}**\nError: ${res.error}`;
    }

    await statusMsg.edit(output);
}

// ================================================================
// 📊 INFO - Lihat detail semua endpoint aktif
// ================================================================
async function handleInfo(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const target = args[0] || 'all';
    const statusMsg = await message.reply(`📊 Fetching info...`);

    let embed = {
        title: '📊 API Information',
        color: 0x3498db,
        fields: [],
        timestamp: new Date()
    };

    // Fetch semua endpoint aktif
    if (target === 'all' || target === 'services') {
        const res = await jnkieRequest('GET', '/services');
        if (res.success && Array.isArray(res.data)) {
            embed.fields.push({
                name: '📦 Services',
                value: res.data.slice(0, 10).map(s => `• \`${s.id}\` - ${s.name || 'Unnamed'}`).join('\n') || 'Empty',
                inline: false
            });
        }
    }

    if (target === 'all' || target === 'keys') {
        const res = await jnkieRequest('GET', '/keys');
        if (res.success && Array.isArray(res.data)) {
            embed.fields.push({
                name: '🔑 Keys',
                value: res.data.slice(0, 10).map(k => `• \`${k.key?.substring(0, 20) || k.id}...\``).join('\n') || 'Empty',
                inline: false
            });
        }
    }

    if (target === 'all' || target === 'providers') {
        const res = await jnkieRequest('GET', '/providers');
        if (res.success && Array.isArray(res.data)) {
            embed.fields.push({
                name: '🏢 Providers',
                value: res.data.slice(0, 10).map(p => `• \`${p.id}\` - ${p.name || 'Unnamed'}`).join('\n') || 'Empty',
                inline: false
            });
        }
    }

    if (target === 'all' || target === 'service') {
        const res = await jnkieRequest('GET', `/services/${JNKIE_SERVICE_ID}`);
        if (res.success) {
            const s = res.data;
            embed.fields.push({
                name: `📦 Service #${JNKIE_SERVICE_ID}`,
                value: `\`\`\`json\n${JSON.stringify(s, null, 2).substring(0, 900)}\n\`\`\``,
                inline: false
            });
        }
    }

    if (embed.fields.length === 0) {
        embed.description = '❌ No data found';
    }

    await statusMsg.edit({ content: null, embeds: [embed] });
}

// ================================================================
// 🕵️ SMART SCAN - Berdasarkan endpoint yang sudah diketahui aktif
// ================================================================
async function handleScan(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const filter = args[0] ? args[0].toLowerCase() : null;
    const statusMsg = await message.reply(`🕵️ **Smart Scanning...**\n🔍 Filter: ${filter || 'Full'}`);

    // Endpoint yang sudah TERBUKTI aktif sebagai base
    const activeRoots = [
        '/services',
        '/providers', 
        '/integrations',
        '/keys',
        `/services/${JNKIE_SERVICE_ID}`
    ];

    // Sub-path yang umum di API
    const subPaths = [
        '', // root endpoint itu sendiri
        '/list',
        '/all',
        '/create',
        '/new',
        '/delete',
        '/update',
        '/edit',
        '/get',
        '/fetch',
        '/keys',
        '/key',
        '/licenses',
        '/license',
        '/users',
        '/user',
        '/hwid',
        '/hwids',
        '/whitelist',
        '/blacklist',
        '/stats',
        '/analytics',
        '/logs',
        '/log',
        '/settings',
        '/config',
        '/webhooks',
        '/webhook',
        '/variables',
        '/variable',
        '/scripts',
        '/script',
        '/loader',
        '/execute',
        '/validate',
        '/verify',
        '/check',
        '/reset',
        '/revoke',
        '/generate',
        '/export',
        '/import',
        '/ban',
        '/unban',
        '/expire',
        '/extend',
        '/transfer',
        '/info',
        '/details',
        '/meta',
        '/metadata'
    ];

    let targets = [];

    // Generate dari root yang aktif
    activeRoots.forEach(root => {
        subPaths.forEach(sub => {
            targets.push(`${root}${sub}`);
        });
    });

    // Filter jika ada
    if (filter) {
        targets = targets.filter(t => t.toLowerCase().includes(filter));
    }

    targets = [...new Set(targets)];

    const batchSize = 10;
    let found = [];
    
    for (let i = 0; i < targets.length; i += batchSize) {
        const batch = targets.slice(i, i + batchSize);
        const progress = Math.round((i / targets.length) * 100);
        
        await statusMsg.edit(`🕵️ **Scanning...**\n📊 Progress: ${progress}% | Found: ${found.length}`);

        const promises = batch.map(path => jnkieRequest('GET', path).then(res => ({ path, ...res })));
        const results = await Promise.all(promises);

        results.forEach(res => {
            if (res.statusCode !== 404 && res.statusCode !== 0) {
                found.push({
                    path: res.path,
                    status: res.statusCode,
                    hasData: res.success && res.data
                });
            }
        });
        
        await new Promise(r => setTimeout(r, 300));
    }

    if (found.length === 0) {
        await statusMsg.edit(`❌ **Scan Selesai**\nTidak ada endpoint ditemukan.`);
        return;
    }

    // Sort: 200 first
    found.sort((a, b) => {
        if (a.status >= 200 && a.status < 300) return -1;
        if (b.status >= 200 && b.status < 300) return 1;
        return a.status - b.status;
    });

    const list = found.map(f => {
        let icon = '❓';
        let note = '';
        
        if (f.status >= 200 && f.status < 300) { icon = '✅'; note = f.hasData ? 'Has Data' : 'OK'; }
        else if (f.status === 400) { icon = '⚠️'; note = 'Bad Request'; }
        else if (f.status === 401) { icon = '🔒'; note = 'Auth Required'; }
        else if (f.status === 403) { icon = '🚫'; note = 'Forbidden'; }
        else if (f.status === 405) { icon = '✋'; note = 'Wrong Method'; }
        else if (f.status === 408) { icon = '⏱️'; note = 'Timeout'; }
        else if (f.status === 429) { icon = '🐌'; note = 'Rate Limited'; }
        else if (f.status >= 500) { icon = '🔥'; note = 'Server Error'; }
        
        return `${icon} \`${f.path}\` (${f.status}) ${note}`;
    }).join('\n');

    await statusMsg.edit({
        content: null,
        embeds: [{
            color: 0x2ecc71,
            title: '🕵️ Smart Scan Results',
            description: list.substring(0, 4000),
            footer: { text: `Scanned: ${targets.length} | Found: ${found.length}` },
            timestamp: new Date()
        }]
    });
}

// ================================================================
// DEBUG - Quick check
// ================================================================
async function handleDebug(message) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');
    
    const statusMsg = await message.reply(`🔍 Quick Debug...`);
    
    const endpoints = [
        '/services',
        '/providers',
        '/integrations', 
        '/keys',
        '/me',
        '/user',
        `/services/${JNKIE_SERVICE_ID}`,
        `/users/${JNKIE_SERVICE_ID}`,
        `/services/${JNKIE_SERVICE_ID}/scripts`,
        `/services/${JNKIE_SERVICE_ID}/config`,
        `/services/${JNKIE_SERVICE_ID}/keys`,
        `/services/${JNKIE_SERVICE_ID}/licenses`,
        `/services/${JNKIE_SERVICE_ID}/users`,
        `/services/${JNKIE_SERVICE_ID}/whitelist`,
        `/services/${JNKIE_SERVICE_ID}/stats`
    ];

    let resultTxt = '';
    for (const ep of endpoints) {
        const res = await jnkieRequest('GET', ep);
        const icon = res.success ? '✅' : (res.statusCode === 404 ? '❌' : '⚠️');
        resultTxt += `${icon} \`${ep}\` (${res.statusCode})\n`;
    }

    await statusMsg.edit({
        embeds: [{
            title: `🔍 Debug - Service #${JNKIE_SERVICE_ID}`,
            description: resultTxt,
            color: 0x3498db,
            footer: { text: 'Use !explore [endpoint] untuk lihat isi' }
        }]
    });
}

// ================================================================
// JNKIE API HELPER
// ================================================================
function jnkieRequest(method, endpoint, body = null) {
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
                try {
                    const json = JSON.parse(data);
                    resolve({ 
                        success: res.statusCode >= 200 && res.statusCode < 300, 
                        data: json.data || json, 
                        error: json.message || json.error,
                        statusCode: res.statusCode
                    });
                } catch (e) {
                    resolve({ success: false, error: 'Invalid JSON', rawData: data, statusCode: res.statusCode });
                }
            });
        });

        req.on('error', (e) => resolve({ success: false, error: e.message, statusCode: 0 }));
        req.setTimeout(10000, () => { req.destroy(); resolve({ success: false, error: 'Timeout', statusCode: 408 }); });

        if (body) req.write(postData);
        req.end();
    });
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
// STANDARD HANDLERS
// ================================================================
async function handleService(message, args) {
    if (args[0] === 'list') {
        const res = await jnkieRequest('GET', '/services');
        const list = (Array.isArray(res.data) ? res.data : [])
            .map(s => `• \`${s.id}\` - ${s.name || 'Unnamed'}`)
            .join('\n') || 'No services';
        return message.reply({ embeds: [{ title: '📦 Services', description: list, color: 0x3498db }] });
    }
    
    if (args[0] === 'info') {
        const id = args[1] || JNKIE_SERVICE_ID;
        const res = await jnkieRequest('GET', `/services/${id}`);
        if (res.success) {
            return message.reply(`\`\`\`json\n${JSON.stringify(res.data, null, 2).substring(0, 1900)}\n\`\`\``);
        }
        return message.reply(`❌ Service not found: ${res.statusCode}`);
    }
    
    message.reply('Usage: `!service list` | `!service info [id]`');
}

async function handleKey(message, args) {
    if (args[0] === 'list') {
        const res = await jnkieRequest('GET', '/keys');
        const list = (Array.isArray(res.data) ? res.data : [])
            .slice(0, 15)
            .map(k => `• \`${(k.key || k.id || 'unknown').substring(0, 30)}...\``)
            .join('\n') || 'No keys';
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
                    name: '🔍 Explorer', 
                    value: '`!explore [endpoint]` - Lihat isi endpoint\n`!explore /services/4532`\n`!info` - Lihat semua info',
                    inline: false 
                },
                { 
                    name: '🕵️ Scanner', 
                    value: '`!scan` - Smart scan\n`!scan keys` - Scan filter\n`!debug` - Quick debug',
                    inline: false 
                },
                { 
                    name: '🔧 Obfuscator', 
                    value: '`!obf [preset]` + file',
                    inline: false 
                },
                { 
                    name: '📦 Management', 
                    value: '`!service list`\n`!service info [id]`\n`!key list`',
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
    message.reply(`✅ Bot Online\n📦 Service: \`${JNKIE_SERVICE_ID}\`\n🔑 API: ${JNKIE_API_KEY ? 'Set' : 'Not Set'}`);
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
