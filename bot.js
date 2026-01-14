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
        else if (cmd === '!raw') await handleRaw(message, args);
        else if (cmd === '!probe') await handleProbe(message, args);      // 🆕 Probe endpoint 400
        else if (cmd === '!bruteforce') await handleBruteforce(message, args); // 🆕 Cari parameter
        else if (cmd === '!post') await handlePost(message, args);        // 🆕 Test POST
        else if (cmd === '!scan') await handleScan(message, args);
        else if (cmd === '!debug') await handleDebug(message);
        else if (cmd === '!test') await handleTest(message);
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
// 🔬 PROBE - Test endpoint dengan berbagai parameter
// ================================================================
async function handleProbe(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const endpoint = args[0] || '/services/scripts';
    const statusMsg = await message.reply(`🔬 Probing \`${endpoint}\` dengan berbagai parameter...`);

    // Daftar parameter yang umum digunakan
    const paramVariations = [
        '', // tanpa parameter
        `?serviceId=${JNKIE_SERVICE_ID}`,
        `?service_id=${JNKIE_SERVICE_ID}`,
        `?service=${JNKIE_SERVICE_ID}`,
        `?id=${JNKIE_SERVICE_ID}`,
        `?sid=${JNKIE_SERVICE_ID}`,
        `?limit=10`,
        `?page=1`,
        `?serviceId=${JNKIE_SERVICE_ID}&limit=10`,
        `?id=${JNKIE_SERVICE_ID}&limit=10`,
    ];

    let results = [];

    for (const param of paramVariations) {
        const fullPath = `${endpoint}${param}`;
        const res = await jnkieRequestRaw('GET', fullPath);
        
        results.push({
            path: fullPath,
            status: res.statusCode,
            preview: res.rawData?.substring(0, 100) || 'Empty'
        });

        // Delay kecil
        await new Promise(r => setTimeout(r, 200));
    }

    // Juga coba POST
    const postRes = await jnkieRequestRaw('POST', endpoint, { serviceId: JNKIE_SERVICE_ID });
    results.push({
        path: `POST ${endpoint}`,
        status: postRes.statusCode,
        preview: postRes.rawData?.substring(0, 100) || 'Empty'
    });

    const list = results.map(r => {
        let icon = '❌';
        if (r.status >= 200 && r.status < 300) icon = '✅';
        else if (r.status === 400) icon = '⚠️';
        else if (r.status === 401) icon = '🔒';
        else if (r.status === 405) icon = '✋';
        
        return `${icon} \`${r.path}\` (${r.status})`;
    }).join('\n');

    // Cari yang berhasil (200)
    const success = results.filter(r => r.status >= 200 && r.status < 300);

    await statusMsg.edit({
        embeds: [{
            title: `🔬 Probe Results: ${endpoint}`,
            description: list,
            color: success.length > 0 ? 0x2ecc71 : 0xe74c3c,
            fields: success.length > 0 ? [{
                name: '✅ Working Parameters Found!',
                value: success.map(s => `\`${s.path}\``).join('\n')
            }] : [],
            footer: { text: 'Use !raw [full-path] untuk lihat response' }
        }]
    });
}

// ================================================================
// 💪 BRUTEFORCE - Scan semua endpoint 400 dengan parameter
// ================================================================
async function handleBruteforce(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const statusMsg = await message.reply(`💪 Bruteforcing endpoints yang 400...`);

    // Endpoint yang return 400 (dari scan sebelumnya)
    const endpoints400 = [
        '/services/list',
        '/services/all',
        '/services/create',
        '/services/generate',
        '/services/scripts',
        '/services/script',
        '/services/loader',
        '/services/loaders',
        '/services/keys',
        '/services/key',
        '/services/licenses',
        '/services/license',
        '/services/users',
        '/services/user',
        '/services/whitelist',
        '/services/blacklist',
        '/services/hwid',
        '/services/hwids',
        '/services/stats',
        '/services/analytics',
        '/services/logs',
        '/services/settings',
        '/services/config',
        '/services/webhooks',
        '/services/variables',
        '/services/execute',
        '/services/validate'
    ];

    // Parameter yang akan dicoba
    const params = [
        `?serviceId=${JNKIE_SERVICE_ID}`,
        `?service_id=${JNKIE_SERVICE_ID}`,
        `?id=${JNKIE_SERVICE_ID}`,
        `?service=${JNKIE_SERVICE_ID}`
    ];

    let working = [];
    let progress = 0;
    const total = endpoints400.length * params.length;

    for (const ep of endpoints400) {
        for (const param of params) {
            progress++;
            if (progress % 10 === 0) {
                await statusMsg.edit(`💪 Bruteforcing... ${Math.round((progress/total)*100)}%`);
            }

            const fullPath = `${ep}${param}`;
            const res = await jnkieRequestRaw('GET', fullPath);
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
                working.push({
                    path: fullPath,
                    status: res.statusCode
                });
            }

            await new Promise(r => setTimeout(r, 150));
        }
    }

    if (working.length === 0) {
        // Coba juga dengan POST method
        await statusMsg.edit(`💪 Trying POST method...`);
        
        for (const ep of endpoints400.slice(0, 10)) { // Hanya 10 pertama untuk POST
            const res = await jnkieRequestRaw('POST', ep, { 
                serviceId: JNKIE_SERVICE_ID,
                service_id: JNKIE_SERVICE_ID,
                id: JNKIE_SERVICE_ID
            });
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
                working.push({
                    path: `POST ${ep}`,
                    status: res.statusCode
                });
            }
            await new Promise(r => setTimeout(r, 200));
        }
    }

    if (working.length === 0) {
        await statusMsg.edit(`❌ **Tidak ada parameter yang berhasil.**\n\nKemungkinan:\n• Perlu auth level lebih tinggi\n• Format parameter berbeda\n• Endpoint butuh data spesifik`);
    } else {
        const list = working.map(w => `✅ \`${w.path}\``).join('\n');
        await statusMsg.edit({
            embeds: [{
                title: '💪 Bruteforce Results',
                description: list,
                color: 0x2ecc71,
                footer: { text: `Found ${working.length} working endpoints!` }
            }]
        });
    }
}

// ================================================================
// 📤 POST - Test POST request dengan body
// ================================================================
async function handlePost(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const endpoint = args[0] || '/services/scripts';
    
    // Parse body dari args (format: !post /endpoint key=value key2=value2)
    let body = { serviceId: JNKIE_SERVICE_ID };
    args.slice(1).forEach(arg => {
        const [key, value] = arg.split('=');
        if (key && value) body[key] = value;
    });

    const statusMsg = await message.reply(`📤 POST \`${endpoint}\`\nBody: \`${JSON.stringify(body)}\``);

    const res = await jnkieRequestRaw('POST', endpoint, body);
    
    await statusMsg.edit(`📤 **POST ${endpoint}**\n**Status:** ${res.statusCode}\n\`\`\`json\n${res.rawData?.substring(0, 1500) || 'Empty'}\n\`\`\``);
}

// ================================================================
// 🔬 RAW - Lihat raw response
// ================================================================
async function handleRaw(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const endpoint = args[0] || '/services';
    const method = (args[1] || 'GET').toUpperCase();
    
    const res = await jnkieRequestRaw(method, endpoint);
    
    let output = `**${method}** \`${endpoint}\`\n**Status:** ${res.statusCode}\n\`\`\`json\n${res.rawData?.substring(0, 1800) || 'Empty'}\n\`\`\``;

    message.reply(output);
}

// ================================================================
// 🧪 TEST - Quick test
// ================================================================
async function handleTest(message) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const statusMsg = await message.reply(`🧪 Testing...`);

    const endpoints = [
        '/services',
        '/keys',
        '/providers',
        `/services/${JNKIE_SERVICE_ID}`,
        `/services/${JNKIE_SERVICE_ID}/keys`,
        `/services/${JNKIE_SERVICE_ID}/scripts`,
        `/keys?serviceId=${JNKIE_SERVICE_ID}`,
        `/services/keys?serviceId=${JNKIE_SERVICE_ID}`,
        `/services/keys?id=${JNKIE_SERVICE_ID}`
    ];

    let results = [];
    for (const ep of endpoints) {
        const res = await jnkieRequestRaw('GET', ep);
        const icon = res.statusCode === 200 ? '✅' : (res.statusCode === 400 ? '⚠️' : '❌');
        results.push(`${icon} \`${ep}\` (${res.statusCode})`);
    }

    await statusMsg.edit({
        embeds: [{
            title: '🧪 Test Results',
            description: results.join('\n'),
            color: 0x3498db
        }]
    });
}

// ================================================================
// 🕵️ SCAN
// ================================================================
async function handleScan(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const filter = args[0] ? args[0].toLowerCase() : null;
    const statusMsg = await message.reply(`🕵️ Scanning...`);

    const bases = ['/services', '/keys', '/providers', '/integrations', `/services/${JNKIE_SERVICE_ID}`];
    const subPaths = ['', '/list', '/all', '/create', '/scripts', '/keys', '/licenses', '/users', '/whitelist', '/stats', '/logs', '/settings', '/config', '/webhooks', '/variables', '/execute', '/validate', '/generate', '/info'];

    let targets = [];
    bases.forEach(base => {
        subPaths.forEach(sub => {
            targets.push(`${base}${sub}`);
        });
    });

    if (filter) targets = targets.filter(t => t.includes(filter));
    targets = [...new Set(targets)];

    let found = [];
    for (let i = 0; i < targets.length; i += 10) {
        const batch = targets.slice(i, i + 10);
        await statusMsg.edit(`🕵️ Scanning... ${Math.round((i / targets.length) * 100)}%`);

        const promises = batch.map(path => jnkieRequestRaw('GET', path).then(res => ({ path, status: res.statusCode })));
        const results = await Promise.all(promises);

        results.forEach(res => {
            if (res.status !== 404) found.push(res);
        });
        
        await new Promise(r => setTimeout(r, 300));
    }

    found.sort((a, b) => a.status - b.status);

    const list = found.map(f => {
        let icon = f.status === 200 ? '✅' : (f.status === 400 ? '⚠️' : '❌');
        return `${icon} \`${f.path}\` (${f.status})`;
    }).join('\n');

    await statusMsg.edit({
        embeds: [{
            color: 0x2ecc71,
            title: '🕵️ Scan Results',
            description: list.substring(0, 4000) || 'No results',
            footer: { text: `Use !probe [endpoint] untuk cari parameter yang benar` }
        }]
    });
}

// ================================================================
// DEBUG
// ================================================================
async function handleDebug(message) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');
    
    const statusMsg = await message.reply(`🔍 Debug...`);
    
    // Test dengan berbagai format
    const tests = [
        { path: '/services', method: 'GET' },
        { path: '/keys', method: 'GET' },
        { path: `/services/${JNKIE_SERVICE_ID}`, method: 'GET' },
        { path: `/services/keys?serviceId=${JNKIE_SERVICE_ID}`, method: 'GET' },
        { path: `/services/keys?service_id=${JNKIE_SERVICE_ID}`, method: 'GET' },
        { path: `/services/scripts?serviceId=${JNKIE_SERVICE_ID}`, method: 'GET' },
        { path: `/keys?serviceId=${JNKIE_SERVICE_ID}`, method: 'GET' },
    ];

    let results = [];
    for (const t of tests) {
        const res = await jnkieRequestRaw(t.method, t.path);
        const icon = res.statusCode === 200 ? '✅' : (res.statusCode === 400 ? '⚠️' : '❌');
        results.push(`${icon} \`${t.path}\` (${res.statusCode})`);
    }

    await statusMsg.edit({
        embeds: [{
            title: '🔍 Debug',
            description: results.join('\n'),
            color: 0x3498db,
            footer: { text: '!probe [endpoint] untuk test parameter' }
        }]
    });
}

// ================================================================
// JNKIE API - RAW
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
// HANDLERS
// ================================================================
async function handleService(message, args) {
    if (!args[0] || args[0] === 'list') {
        const res = await jnkieRequestRaw('GET', '/services');
        return message.reply(`**Services (${res.statusCode}):**\n\`\`\`json\n${res.rawData?.substring(0, 1800) || 'Empty'}\n\`\`\``);
    }
    if (args[0] === 'info') {
        const id = args[1] || JNKIE_SERVICE_ID;
        const res = await jnkieRequestRaw('GET', `/services/${id}`);
        return message.reply(`**Service ${id} (${res.statusCode}):**\n\`\`\`json\n${res.rawData?.substring(0, 1800) || 'Empty'}\n\`\`\``);
    }
    message.reply('Usage: `!service list` | `!service info [id]`');
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
            title: '📖 Commands',
            color: 0x9b59b6,
            fields: [
                { 
                    name: '🔬 Endpoint Explorer', 
                    value: '`!raw [endpoint]` - Lihat raw response\n`!probe [endpoint]` - Test dengan berbagai parameter\n`!bruteforce` - Scan semua endpoint 400\n`!post [endpoint] key=value` - Test POST',
                    inline: false 
                },
                { 
                    name: '🕵️ Scanner', 
                    value: '`!scan` - Scan endpoints\n`!test` - Quick test\n`!debug` - Debug mode',
                    inline: false 
                },
                { 
                    name: '🔧 Obfuscator', 
                    value: '`!obf [preset]` + file',
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
    message.reply(`✅ Online | Service: \`${JNKIE_SERVICE_ID}\``);
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

function cleanLuaCode(code) {
    return code.replace(/^\uFEFF/, '').trim();
}

function cleanupFiles(...files) {
    files.forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {} });
}

client.login(TOKEN);function cleanupFiles(...files) {
    files.forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {} });
}

client.login(TOKEN);
