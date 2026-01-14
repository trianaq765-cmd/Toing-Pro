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

// IDs yang ditemukan
const KNOWN_IDS = {
    integrations: ['2256', '2254'],
    providers: ['2265', '2263']
};

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
        
        // Deep Explorer - untuk cari Luraph
        if (cmd === '!deep') await handleDeepExplore(message);           // 🆕 Deep explore
        if (cmd === '!detailprovider') await handleDetailProvider(message, args); // 🆕 Detail provider
        if (cmd === '!detailintegration') await handleDetailIntegration(message, args); // 🆕 Detail integration
        if (cmd === '!testobf') await handleTestObfuscate(message);      // 🆕 Test semua format obfuscate
        if (cmd === '!services') await handleServicesDetail(message);     // 🆕 Detail /services/4532
        
        // Standard
        if (cmd === '!raw') await handleRaw(message, args);
        if (cmd === '!post') await handlePost(message, args);
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
// 🔍 DEEP EXPLORE - Explore semua untuk cari Luraph
// ================================================================
async function handleDeepExplore(message) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const statusMsg = await message.reply(`🔍 **Deep Exploring API...**\nMencari endpoint Luraph/Obfuscate...`);

    let report = '';

    // 1. Lihat detail service kita
    await statusMsg.edit(`🔍 Step 1/5: Checking service ${JNKIE_SERVICE_ID}...`);
    const serviceRes = await jnkieRequestRaw('GET', `/services/${JNKIE_SERVICE_ID}`);
    
    if (serviceRes.statusCode === 200) {
        report += `**📦 Service ${JNKIE_SERVICE_ID}:**\n\`\`\`json\n${serviceRes.rawData?.substring(0, 500)}\n\`\`\`\n\n`;
    }

    // 2. Lihat detail provider
    await statusMsg.edit(`🔍 Step 2/5: Checking providers...`);
    for (const pid of KNOWN_IDS.providers) {
        const res = await jnkieRequestRaw('GET', `/providers/${pid}`);
        if (res.statusCode === 200) {
            report += `**📦 Provider ${pid}:**\n\`\`\`json\n${res.rawData?.substring(0, 400)}\n\`\`\`\n`;
        }
        await new Promise(r => setTimeout(r, 500)); // Delay untuk hindari 429
    }

    // 3. Lihat detail integration
    await statusMsg.edit(`🔍 Step 3/5: Checking integrations...`);
    for (const iid of KNOWN_IDS.integrations) {
        const res = await jnkieRequestRaw('GET', `/integrations/${iid}`);
        if (res.statusCode === 200) {
            report += `**🔗 Integration ${iid}:**\n\`\`\`json\n${res.rawData?.substring(0, 400)}\n\`\`\`\n`;
        }
        await new Promise(r => setTimeout(r, 500));
    }

    // 4. Cari endpoint obfuscate spesifik service
    await statusMsg.edit(`🔍 Step 4/5: Finding obfuscate endpoints...`);
    const obfEndpoints = [
        `/services/${JNKIE_SERVICE_ID}/obfuscate`,
        `/services/${JNKIE_SERVICE_ID}/luraph`,
        `/services/${JNKIE_SERVICE_ID}/protect`,
        `/services/${JNKIE_SERVICE_ID}/script`,
        `/services/${JNKIE_SERVICE_ID}/scripts`,
        `/services/${JNKIE_SERVICE_ID}/loader`,
        `/obfuscate?serviceId=${JNKIE_SERVICE_ID}`,
        `/luraph?serviceId=${JNKIE_SERVICE_ID}`,
    ];

    report += `\n**🔧 Obfuscate Endpoints:**\n`;
    for (const ep of obfEndpoints) {
        const getRes = await jnkieRequestRaw('GET', ep);
        const postRes = await jnkieRequestRaw('POST', ep, { script: 'print("test")' });
        
        const getIcon = getRes.statusCode === 200 ? '✅' : (getRes.statusCode === 400 ? '⚠️' : '❌');
        const postIcon = postRes.statusCode === 200 ? '✅' : (postRes.statusCode === 400 ? '⚠️' : '❌');
        
        report += `${getIcon} GET / ${postIcon} POST \`${ep}\` (${getRes.statusCode}/${postRes.statusCode})\n`;
        
        await new Promise(r => setTimeout(r, 300));
    }

    // 5. Cek keys untuk tahu struktur
    await statusMsg.edit(`🔍 Step 5/5: Checking keys structure...`);
    const keysRes = await jnkieRequestRaw('GET', '/keys');
    if (keysRes.statusCode === 200) {
        report += `\n**🔑 Keys:**\n\`\`\`json\n${keysRes.rawData?.substring(0, 400)}\n\`\`\`\n`;
    }

    // Kirim report
    // Split jika terlalu panjang
    if (report.length > 4000) {
        const file = new AttachmentBuilder(Buffer.from(report), { name: 'deep_explore_report.txt' });
        await statusMsg.edit({ content: '🔍 **Deep Explore Complete!**\nReport terlalu panjang, lihat file:', files: [file] });
    } else {
        await statusMsg.edit({
            embeds: [{
                title: '🔍 Deep Explore Report',
                description: report.substring(0, 4000),
                color: 0x3498db,
                footer: { text: 'Use !detailprovider [id] atau !detailintegration [id] untuk detail' }
            }]
        });
    }
}

// ================================================================
// 📦 DETAIL PROVIDER
// ================================================================
async function handleDetailProvider(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const providerId = args[0] || KNOWN_IDS.providers[0];
    const statusMsg = await message.reply(`📦 Fetching provider ${providerId}...`);

    const res = await jnkieRequestRaw('GET', `/providers/${providerId}`);
    
    if (res.statusCode === 200) {
        // Parse dan tampilkan semua field
        try {
            const data = JSON.parse(res.rawData);
            const provider = data.data || data;
            
            let desc = `**Provider ID:** \`${providerId}\`\n\n`;
            desc += '**All Fields:**\n```json\n';
            desc += JSON.stringify(provider, null, 2).substring(0, 1500);
            desc += '\n```\n';

            // Test sub-endpoints
            desc += '\n**Testing sub-endpoints:**\n';
            const subEndpoints = [
                `/providers/${providerId}/obfuscate`,
                `/providers/${providerId}/luraph`,
                `/providers/${providerId}/script`,
                `/providers/${providerId}/execute`,
            ];

            for (const ep of subEndpoints) {
                const subRes = await jnkieRequestRaw('GET', ep);
                const postRes = await jnkieRequestRaw('POST', ep, { script: 'print("test")' });
                desc += `• GET:${subRes.statusCode} POST:${postRes.statusCode} \`${ep}\`\n`;
                await new Promise(r => setTimeout(r, 300));
            }

            await statusMsg.edit({
                embeds: [{
                    title: `📦 Provider: ${providerId}`,
                    description: desc,
                    color: 0x2ecc71
                }]
            });

        } catch (e) {
            await statusMsg.edit(`📦 **Provider ${providerId}:**\n\`\`\`json\n${res.rawData}\n\`\`\``);
        }
    } else {
        await statusMsg.edit(`❌ Failed (${res.statusCode}): ${res.rawData?.substring(0, 500)}`);
    }
}

// ================================================================
// 🔗 DETAIL INTEGRATION
// ================================================================
async function handleDetailIntegration(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const integrationId = args[0] || KNOWN_IDS.integrations[0];
    const statusMsg = await message.reply(`🔗 Fetching integration ${integrationId}...`);

    const res = await jnkieRequestRaw('GET', `/integrations/${integrationId}`);
    
    if (res.statusCode === 200) {
        try {
            const data = JSON.parse(res.rawData);
            const integration = data.data || data;
            
            let desc = `**Integration ID:** \`${integrationId}\`\n\n`;
            desc += '**All Fields:**\n```json\n';
            desc += JSON.stringify(integration, null, 2).substring(0, 1500);
            desc += '\n```\n';

            // Test sub-endpoints
            desc += '\n**Testing sub-endpoints:**\n';
            const subEndpoints = [
                `/integrations/${integrationId}/obfuscate`,
                `/integrations/${integrationId}/luraph`,
                `/integrations/${integrationId}/execute`,
            ];

            for (const ep of subEndpoints) {
                const subRes = await jnkieRequestRaw('GET', ep);
                const postRes = await jnkieRequestRaw('POST', ep, { script: 'print("test")' });
                desc += `• GET:${subRes.statusCode} POST:${postRes.statusCode} \`${ep}\`\n`;
                await new Promise(r => setTimeout(r, 300));
            }

            await statusMsg.edit({
                embeds: [{
                    title: `🔗 Integration: ${integrationId}`,
                    description: desc,
                    color: 0x9b59b6
                }]
            });

        } catch (e) {
            await statusMsg.edit(`🔗 **Integration ${integrationId}:**\n\`\`\`json\n${res.rawData}\n\`\`\``);
        }
    } else {
        await statusMsg.edit(`❌ Failed (${res.statusCode}): ${res.rawData?.substring(0, 500)}`);
    }
}

// ================================================================
// 🧪 TEST OBFUSCATE - Test semua kemungkinan format
// ================================================================
async function handleTestObfuscate(message) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const statusMsg = await message.reply(`🧪 **Testing all obfuscate formats...**`);

    const testScript = 'print("hello world")';

    // Semua kemungkinan endpoint dan body
    const tests = [
        // Dengan serviceId
        { ep: '/services/obfuscate', body: { serviceId: JNKIE_SERVICE_ID, script: testScript } },
        { ep: '/services/obfuscate', body: { service_id: JNKIE_SERVICE_ID, script: testScript } },
        { ep: '/services/obfuscate', body: { serviceId: JNKIE_SERVICE_ID, code: testScript } },
        { ep: '/services/obfuscate', body: { serviceId: JNKIE_SERVICE_ID, content: testScript } },
        
        // Dengan provider
        { ep: '/services/obfuscate', body: { serviceId: JNKIE_SERVICE_ID, script: testScript, provider: 'luraph' } },
        { ep: '/services/obfuscate', body: { serviceId: JNKIE_SERVICE_ID, script: testScript, type: 'luraph' } },
        { ep: '/services/obfuscate', body: { serviceId: JNKIE_SERVICE_ID, script: testScript, providerId: KNOWN_IDS.providers[0] } },
        
        // Luraph endpoint
        { ep: '/services/luraph', body: { serviceId: JNKIE_SERVICE_ID, script: testScript } },
        { ep: '/services/luraph', body: { service_id: JNKIE_SERVICE_ID, script: testScript } },
        
        // Provider endpoint
        { ep: `/providers/${KNOWN_IDS.providers[0]}/obfuscate`, body: { script: testScript } },
        { ep: `/providers/${KNOWN_IDS.providers[0]}/execute`, body: { script: testScript } },
        
        // Integration endpoint  
        { ep: `/integrations/${KNOWN_IDS.integrations[0]}/obfuscate`, body: { script: testScript } },
        
        // Service spesifik
        { ep: `/services/${JNKIE_SERVICE_ID}/obfuscate`, body: { script: testScript } },
        { ep: `/services/${JNKIE_SERVICE_ID}/luraph`, body: { script: testScript } },
        { ep: `/services/${JNKIE_SERVICE_ID}/protect`, body: { script: testScript } },
        { ep: `/services/${JNKIE_SERVICE_ID}/script`, body: { script: testScript } },
        
        // Root endpoints
        { ep: '/obfuscate', body: { serviceId: JNKIE_SERVICE_ID, script: testScript } },
        { ep: '/luraph', body: { serviceId: JNKIE_SERVICE_ID, script: testScript } },
        { ep: '/protect', body: { serviceId: JNKIE_SERVICE_ID, script: testScript } },

        // Nested data
        { ep: '/services/obfuscate', body: { serviceId: JNKIE_SERVICE_ID, data: { script: testScript } } },
        { ep: '/services/luraph', body: { data: { script: testScript, serviceId: JNKIE_SERVICE_ID } } },
    ];

    let results = [];
    let success = [];

    for (let i = 0; i < tests.length; i++) {
        const t = tests[i];
        if (i % 5 === 0) {
            await statusMsg.edit(`🧪 Testing... ${Math.round((i/tests.length)*100)}% (${success.length} found)`);
        }

        const res = await jnkieRequestRaw('POST', t.ep, t.body);
        
        if (res.statusCode === 200) {
            success.push({
                endpoint: t.ep,
                body: t.body,
                response: res.rawData?.substring(0, 200)
            });
        } else if (res.statusCode !== 404 && res.statusCode !== 405) {
            results.push({
                endpoint: t.ep,
                bodyKeys: Object.keys(t.body).join(', '),
                status: res.statusCode,
                error: res.rawData?.substring(0, 100)
            });
        }

        await new Promise(r => setTimeout(r, 250));
    }

    // Build report
    let desc = '';

    if (success.length > 0) {
        desc += '**✅ WORKING ENDPOINTS:**\n';
        success.forEach(s => {
            desc += `\n📌 \`POST ${s.endpoint}\`\n`;
            desc += `Body: \`${JSON.stringify(s.body).substring(0, 100)}...\`\n`;
            desc += `Response: ${s.response}\n`;
        });
    } else {
        desc += '**❌ No working endpoint found**\n\n';
        desc += '**⚠️ Status 400 (butuh parameter lain):**\n';
        const status400 = results.filter(r => r.status === 400).slice(0, 10);
        status400.forEach(r => {
            desc += `• \`${r.endpoint}\` - ${r.error?.substring(0, 50)}\n`;
        });

        desc += '\n**Other errors:**\n';
        const others = results.filter(r => r.status !== 400).slice(0, 5);
        others.forEach(r => {
            desc += `• \`${r.endpoint}\` (${r.status})\n`;
        });
    }

    await statusMsg.edit({
        embeds: [{
            title: '🧪 Obfuscate Test Results',
            description: desc.substring(0, 4000),
            color: success.length > 0 ? 0x2ecc71 : 0xe74c3c,
            footer: { text: `Tested: ${tests.length} | Success: ${success.length}` }
        }]
    });
}

// ================================================================
// 📦 SERVICES DETAIL - Lihat detail service kita
// ================================================================
async function handleServicesDetail(message) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const statusMsg = await message.reply(`📦 Fetching service ${JNKIE_SERVICE_ID} details...`);

    // Get service detail
    const res = await jnkieRequestRaw('GET', `/services/${JNKIE_SERVICE_ID}`);
    
    let desc = '';

    if (res.statusCode === 200) {
        desc += `**Service ${JNKIE_SERVICE_ID}:**\n\`\`\`json\n${res.rawData?.substring(0, 1200)}\n\`\`\`\n`;

        // Parse untuk dapat field-field
        try {
            const data = JSON.parse(res.rawData);
            const service = data.data || data;

            // List semua available endpoints dari service
            desc += '\n**Testing service sub-endpoints:**\n';
            
            const subPaths = [
                'keys', 'scripts', 'loader', 'loaders', 'obfuscate', 'luraph',
                'whitelist', 'blacklist', 'users', 'licenses', 'stats', 
                'config', 'settings', 'webhooks', 'variables', 'logs'
            ];

            for (const sub of subPaths) {
                const subRes = await jnkieRequestRaw('GET', `/services/${JNKIE_SERVICE_ID}/${sub}`);
                const icon = subRes.statusCode === 200 ? '✅' : (subRes.statusCode === 400 ? '⚠️' : '❌');
                desc += `${icon} \`/${sub}\` (${subRes.statusCode})\n`;
                await new Promise(r => setTimeout(r, 200));
            }

        } catch (e) {
            desc += `\nParse error: ${e.message}`;
        }
    } else {
        desc = `❌ Failed (${res.statusCode}): ${res.rawData?.substring(0, 500)}`;
    }

    await statusMsg.edit({
        embeds: [{
            title: `📦 Service: ${JNKIE_SERVICE_ID}`,
            description: desc.substring(0, 4000),
            color: 0x3498db
        }]
    });
}

// ================================================================
// 🔮 LURAPH
// ================================================================
async function handleLuraph(message) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');
    
    if (message.attachments.size === 0) {
        return message.reply({
            embeds: [{
                title: '🔮 Luraph Obfuscator',
                description: 'Attach file .lua untuk obfuscate',
                color: 0x9b59b6,
                fields: [
                    { name: 'Usage', value: '`!luraph` + attach file' },
                    { name: 'Find Endpoint', value: '`!deep` - Deep explore\n`!testobf` - Test all formats\n`!services` - Service detail' }
                ]
            }]
        });
    }

    const attachment = message.attachments.first();
    const statusMsg = await message.reply(`🔮 **Luraph Processing...**\n📄 ${attachment.name}`);

    try {
        const scriptContent = await downloadFile(attachment.url);
        
        // Semua kemungkinan endpoint
        const attempts = [
            { ep: '/services/obfuscate', body: { serviceId: JNKIE_SERVICE_ID, script: scriptContent, provider: 'luraph' } },
            { ep: '/services/luraph', body: { serviceId: JNKIE_SERVICE_ID, script: scriptContent } },
            { ep: `/services/${JNKIE_SERVICE_ID}/obfuscate`, body: { script: scriptContent } },
            { ep: `/services/${JNKIE_SERVICE_ID}/luraph`, body: { script: scriptContent } },
            { ep: `/providers/${KNOWN_IDS.providers[0]}/obfuscate`, body: { script: scriptContent } },
            { ep: '/obfuscate', body: { serviceId: JNKIE_SERVICE_ID, script: scriptContent } },
            { ep: '/luraph', body: { serviceId: JNKIE_SERVICE_ID, script: scriptContent } },
        ];

        let success = null;

        for (const a of attempts) {
            await statusMsg.edit(`🔮 Trying: \`${a.ep}\`...`);
            const res = await jnkieRequestRaw('POST', a.ep, a.body);
            
            if (res.statusCode === 200) {
                success = { endpoint: a.ep, response: res.rawData };
                break;
            }
            await new Promise(r => setTimeout(r, 300));
        }

        if (success) {
            let result = success.response;
            try {
                const json = JSON.parse(success.response);
                result = json.script || json.result || json.output || json.data || json.code || json.obfuscated || success.response;
                if (typeof result === 'object') result = result.script || result.code || JSON.stringify(result);
            } catch (e) {}

            const file = new AttachmentBuilder(Buffer.from(result), { name: `luraph_${attachment.name}` });
            await statusMsg.edit({ content: `✅ **Luraph Success!**\nEndpoint: \`${success.endpoint}\``, files: [file] });
        } else {
            await statusMsg.edit(`❌ **Luraph tidak tersedia.**\n\nGunakan:\n• \`!obf\` untuk Prometheus\n• \`!testobf\` untuk test semua endpoint\n• \`!deep\` untuk explore API`);
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

async function handlePost(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');
    const endpoint = args[0] || '/services/obfuscate';
    
    let body = { serviceId: JNKIE_SERVICE_ID };
    const jsonStr = args.slice(1).join(' ');
    if (jsonStr) {
        try { body = JSON.parse(jsonStr); } catch (e) {
            args.slice(1).forEach(a => { const [k,v] = a.split('='); if(k&&v) body[k]=v; });
        }
    }

    const res = await jnkieRequestRaw('POST', endpoint, body);
    message.reply(`**POST** \`${endpoint}\` (${res.statusCode}):\nBody: \`${JSON.stringify(body).substring(0, 100)}\`\n\`\`\`json\n${res.rawData?.substring(0, 1500) || 'Empty'}\n\`\`\``);
}

async function handleScan(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');
    const statusMsg = await message.reply(`🕵️ Scanning...`);

    const endpoints = [
        '/services', '/keys', '/providers', '/integrations',
        `/services/${JNKIE_SERVICE_ID}`,
        '/services/obfuscate', '/services/luraph',
        '/obfuscate', '/luraph', '/scripts', '/protect'
    ];

    let results = [];
    for (const ep of endpoints) {
        const res = await jnkieRequestRaw('GET', ep);
        const icon = res.statusCode === 200 ? '✅' : (res.statusCode === 400 ? '⚠️' : '❌');
        results.push(`${icon} \`${ep}\` (${res.statusCode})`);
        await new Promise(r => setTimeout(r, 200));
    }

    await statusMsg.edit({ embeds: [{ title: '🕵️ Scan', description: results.join('\n'), color: 0x3498db }] });
}

async function handleDebug(message) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');
    
    const res1 = await jnkieRequestRaw('GET', '/services');
    const res2 = await jnkieRequestRaw('GET', `/services/${JNKIE_SERVICE_ID}`);
    const res3 = await jnkieRequestRaw('GET', '/providers');
    const res4 = await jnkieRequestRaw('GET', '/integrations');

    message.reply({
        embeds: [{
            title: '🔍 Quick Debug',
            description: [
                `✅ /services (${res1.statusCode})`,
                `✅ /services/${JNKIE_SERVICE_ID} (${res2.statusCode})`,
                `✅ /providers (${res3.statusCode})`,
                `✅ /integrations (${res4.statusCode})`
            ].join('\n'),
            color: 0x3498db,
            footer: { text: '!deep untuk deep explore | !testobf untuk test obfuscate' }
        }]
    });
}

async function handleHelp(message) {
    message.reply({
        embeds: [{
            title: '📖 Commands',
            color: 0x9b59b6,
            fields: [
                { name: '🔮 Obfuscator', value: '`!obf` + file → Prometheus\n`!luraph` + file → Luraph via jnkie', inline: false },
                { name: '🔍 Deep Explorer', value: '`!deep` → Full API explore\n`!services` → Service detail\n`!testobf` → Test all obfuscate formats\n`!detailprovider [id]` → Provider detail\n`!detailintegration [id]` → Integration detail', inline: false },
                { name: '🛠️ Standard', value: '`!raw [ep]` → GET\n`!post [ep] [body]` → POST\n`!scan` → Quick scan\n`!debug` → Debug', inline: false }
            ],
            footer: { text: `Service: ${JNKIE_SERVICE_ID} | Providers: ${KNOWN_IDS.providers.join(', ')} | Integrations: ${KNOWN_IDS.integrations.join(', ')}` }
        }]
    });
}

function handleStatus(message) {
    message.reply(`✅ Online\n📦 Service: \`${JNKIE_SERVICE_ID}\`\n📦 Providers: ${KNOWN_IDS.providers.join(', ')}\n🔗 Integrations: ${KNOWN_IDS.integrations.join(', ')}`);
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
