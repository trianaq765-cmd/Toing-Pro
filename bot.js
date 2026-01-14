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
const JNKIE_SERVICE_ID = process.env.JNKIE_SERVICE_ID; // Default service ID

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
    console.log(`jnkie API: ${JNKIE_API_KEY ? 'Configured' : 'NOT SET'}`);
    console.log(`Default Service ID: ${JNKIE_SERVICE_ID || 'NOT SET'}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.trim();
    const args = content.split(/\s+/).slice(1);
    const cmd = content.toLowerCase();

    try {
        if (cmd.startsWith('!obf')) await handleObfuscate(message);
        else if (cmd === '!presets') await handlePresets(message);
        else if (cmd.startsWith('!service')) await handleService(message, args);
        else if (cmd.startsWith('!provider')) await handleProvider(message, args);
        else if (cmd.startsWith('!integration')) await handleIntegration(message, args);
        else if (cmd.startsWith('!key')) await handleKey(message, args);
        else if (cmd === '!help') await handleHelp(message);
        else if (cmd === '!status') await handleStatus(message);
    } catch (err) {
        console.error(err);
    }
});

async function handleObfuscate(message) {
    if (message.attachments.size === 0) {
        return message.reply({
            embeds: [{
                color: 0x3498db,
                title: '📌 Obfuscator',
                description: '`!obf [preset]` + attach file',
                fields: [{ name: 'Presets', value: '🟢 `minify` | 🔵 `weak` | 🟡 `medium`' }]
            }]
        });
    }

    const attachment = message.attachments.first();
    if (!attachment.name.endsWith('.lua') && !attachment.name.endsWith('.txt')) {
        return message.reply('❌ File harus `.lua` atau `.txt`');
    }

    const args = message.content.split(/\s+/).slice(1);
    const presetKey = args[0]?.toLowerCase() || 'minify';
    const preset = PRESETS[presetKey] || PRESETS.minify;

    const timestamp = Date.now();
    const inputPath = path.join(PROMETHEUS_PATH, `in_${timestamp}.lua`);
    const outputPath = path.join(PROMETHEUS_PATH, `out_${timestamp}.lua`);

    let statusMsg;

    try {
        const luaCode = await downloadFile(attachment.url);
        fs.writeFileSync(inputPath, cleanLuaCode(luaCode), 'utf8');

        statusMsg = await message.reply({
            embeds: [{ color: 0xf39c12, title: `${preset.emoji} Processing...` }]
        });

        const command = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset ${preset.value} "${inputPath}" --out "${outputPath}" 2>&1`;
        await execAsync(command, { timeout: 120000 });

        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
            const finalCode = HEADER + fs.readFileSync(outputPath, 'utf8');
            const file = new AttachmentBuilder(Buffer.from(finalCode, 'utf8'), {
                name: `obfuscated_${attachment.name.replace('.txt', '.lua')}`
            });

            await statusMsg.edit({
                embeds: [{ color: 0x2ecc71, title: `${preset.emoji} Berhasil`, timestamp: new Date() }],
                files: [file]
            });
        } else {
            await statusMsg.edit({ embeds: [{ color: 0xe74c3c, title: '❌ Gagal' }] });
        }
    } catch (err) {
        if (statusMsg) {
            await statusMsg.edit({ 
                embeds: [{ color: 0xe74c3c, title: '❌ Error', description: `\`${err.message}\`` }] 
            }).catch(() => {});
        }
    } finally {
        cleanupFiles(inputPath, outputPath);
    }
}

async function handleService(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const action = args[0]?.toLowerCase();

    if (!action || action === 'list') {
        const result = await jnkieRequest('GET', '/services');
        if (result.success) {
            const services = Array.isArray(result.data) ? result.data : [];
            if (services.length === 0) {
                return message.reply({ embeds: [{ color: 0x3498db, title: '📦 Services', description: 'Tidak ada service. Buat dengan `!service create [name]`' }] });
            }
            const list = services.map((s, i) => `${i+1}. **${s.name}**\n   ID: \`${s.id}\`\n   Slug: \`${s.slug || 'N/A'}\``).join('\n\n');
            return message.reply({ embeds: [{ color: 0x3498db, title: '📦 Services', description: list }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    if (action === 'create') {
        const name = args[1];
        const description = args.slice(2).join(' ') || 'No description';
        if (!name) return message.reply('❌ Usage: `!service create [name] [description]`');

        const result = await jnkieRequest('POST', '/services', {
            name: name,
            description: description,
            is_premium: false,
            slug: name.toLowerCase().replace(/\s+/g, '-'),
            keyless_mode: false
        });

        if (result.success) {
            const id = result.data?.id || 'N/A';
            return message.reply({ 
                embeds: [{ 
                    color: 0x2ecc71, 
                    title: '✅ Service Created', 
                    description: `Name: **${name}**\nID: \`${id}\`\n\n💡 Set environment variable:\n\`JNKIE_SERVICE_ID=${id}\``
                }] 
            });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    if (action === 'get') {
        const id = args[1];
        if (!id) return message.reply('❌ Usage: `!service get [id]`');

        const result = await jnkieRequest('GET', `/services/${id}`);
        if (result.success && result.data) {
            const s = result.data;
            return message.reply({ 
                embeds: [{ 
                    color: 0x3498db, 
                    title: '📦 Service Details', 
                    fields: [
                        { name: 'Name', value: s.name || 'N/A', inline: true },
                        { name: 'ID', value: `\`${s.id}\`` || 'N/A', inline: true },
                        { name: 'Slug', value: s.slug || 'N/A', inline: true },
                        { name: 'Description', value: s.description || 'N/A' },
                        { name: 'Premium', value: s.is_premium ? 'Yes' : 'No', inline: true },
                        { name: 'Keyless', value: s.keyless_mode ? 'Yes' : 'No', inline: true }
                    ]
                }]
            });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    if (action === 'delete') {
        const id = args[1];
        if (!id) return message.reply('❌ Usage: `!service delete [id]`');

        const result = await jnkieRequest('DELETE', `/services/${id}`);
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Service Deleted' }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    return message.reply('❌ Usage: `!service [list|create|get|delete]`');
}

async function handleProvider(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const action = args[0]?.toLowerCase();

    if (!action || action === 'list') {
        const result = await jnkieRequest('GET', '/providers');
        if (result.success) {
            const providers = Array.isArray(result.data) ? result.data : [];
            if (providers.length === 0) {
                return message.reply({ embeds: [{ color: 0x9b59b6, title: '🔌 Providers', description: 'Tidak ada provider' }] });
            }
            const list = providers.map((p, i) => `${i+1}. **${p.name}**\n   ID: \`${p.id}\``).join('\n\n');
            return message.reply({ embeds: [{ color: 0x9b59b6, title: '🔌 Providers', description: list }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    if (action === 'create') {
        const name = args[1];
        if (!name) return message.reply('❌ Usage: `!provider create [name]`');

        const result = await jnkieRequest('POST', '/providers', { name: name });
        if (result.success) {
            const id = result.data?.id || 'N/A';
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Provider Created', description: `ID: \`${id}\`` }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    if (action === 'get') {
        const id = args[1];
        if (!id) return message.reply('❌ Usage: `!provider get [id]`');

        const result = await jnkieRequest('GET', `/providers/${id}`);
        if (result.success && result.data) {
            const p = result.data;
            return message.reply({ 
                embeds: [{ 
                    color: 0x9b59b6, 
                    title: '🔌 Provider', 
                    fields: [
                        { name: 'Name', value: p.name || 'N/A', inline: true },
                        { name: 'ID', value: `\`${p.id}\`` || 'N/A', inline: true }
                    ]
                }]
            });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    if (action === 'delete') {
        const id = args[1];
        if (!id) return message.reply('❌ Usage: `!provider delete [id]`');

        const result = await jnkieRequest('DELETE', `/providers/${id}`);
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Deleted' }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    return message.reply('❌ Usage: `!provider [list|create|get|delete]`');
}

async function handleIntegration(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const action = args[0]?.toLowerCase();

    if (!action || action === 'list') {
        const result = await jnkieRequest('GET', '/integrations');
        if (result.success) {
            const items = Array.isArray(result.data) ? result.data : [];
            if (items.length === 0) {
                return message.reply({ embeds: [{ color: 0xe67e22, title: '🔗 Integrations', description: 'Tidak ada integration' }] });
            }
            const list = items.map((i, idx) => `${idx+1}. **${i.type || i.name}**\n   ID: \`${i.id}\``).join('\n\n');
            return message.reply({ embeds: [{ color: 0xe67e22, title: '🔗 Integrations', description: list }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    if (action === 'types') {
        const result = await jnkieRequest('GET', '/integrations/types');
        if (result.success) {
            const types = Array.isArray(result.data) ? result.data : [];
            const list = types.map(t => `• \`${t.type || t.name || t}\``).join('\n') || 'Tidak ada';
            return message.reply({ embeds: [{ color: 0xe67e22, title: '🔗 Types', description: list }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    if (action === 'create') {
        const type = args[1];
        if (!type) return message.reply('❌ Usage: `!integration create [type]`');

        const result = await jnkieRequest('POST', '/integrations', { type: type });
        if (result.success) {
            const id = result.data?.id || 'N/A';
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Integration Created', description: `ID: \`${id}\`` }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    if (action === 'get') {
        const id = args[1];
        if (!id) return message.reply('❌ Usage: `!integration get [id]`');

        const result = await jnkieRequest('GET', `/integrations/${id}`);
        if (result.success && result.data) {
            const i = result.data;
            return message.reply({ 
                embeds: [{ 
                    color: 0xe67e22, 
                    title: '🔗 Integration', 
                    fields: [
                        { name: 'Type', value: i.type || 'N/A', inline: true },
                        { name: 'ID', value: `\`${i.id}\`` || 'N/A', inline: true }
                    ]
                }]
            });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    if (action === 'delete') {
        const id = args[1];
        if (!id) return message.reply('❌ Usage: `!integration delete [id]`');

        const result = await jnkieRequest('DELETE', `/integrations/${id}`);
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Deleted' }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    return message.reply('❌ Usage: `!integration [list|types|create|get|delete]`');
}

async function handleKey(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const action = args[0]?.toLowerCase();

    // !key list [serviceId]
    if (!action || action === 'list') {
        const serviceId = args[1] || JNKIE_SERVICE_ID;
        
        if (!serviceId) {
            return message.reply({
                embeds: [{
                    color: 0xe74c3c,
                    title: '❌ Service ID Required',
                    description: '**Usage:** `!key list [serviceId]`\n\n**Atau set default:**\nTambah env `JNKIE_SERVICE_ID`\n\n**Lihat services:** `!service list`'
                }]
            });
        }

        const result = await jnkieRequest('GET', `/keys?service_id=${serviceId}&limit=15`);
        if (result.success) {
            const keys = Array.isArray(result.data) ? result.data : [];
            if (keys.length === 0) {
                return message.reply({ 
                    embeds: [{ 
                        color: 0x2ecc71, 
                        title: '🔑 Keys', 
                        description: `Service: \`${serviceId}\`\n\nTidak ada key. Buat dengan:\n\`!key create ${serviceId} [duration]\`` 
                    }] 
                });
            }
            const list = keys.map((k, i) => {
                const keyStr = k.key || k.id || 'N/A';
                return `${i+1}. \`${keyStr.substring(0, 25)}...\`\n   Status: ${k.status || 'active'} | Expires: ${k.expires_at || 'N/A'}`;
            }).join('\n\n');
            return message.reply({ 
                embeds: [{ 
                    color: 0x2ecc71, 
                    title: '🔑 Keys', 
                    description: `**Service:** \`${serviceId}\`\n\n${list}`,
                    footer: { text: `Total: ${keys.length} keys` }
                }] 
            });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    // !key create [serviceId] [duration] [note]
    if (action === 'create') {
        let serviceId, duration, note;
        
        // Check if first arg is serviceId or duration
        if (args[1] && (args[1].endsWith('d') || args[1].endsWith('h') || args[1].endsWith('m'))) {
            // !key create 7d note
            serviceId = JNKIE_SERVICE_ID;
            duration = args[1];
            note = args.slice(2).join(' ') || `By ${message.author.username}`;
        } else {
            // !key create [serviceId] [duration] [note]
            serviceId = args[1] || JNKIE_SERVICE_ID;
            duration = args[2] || '7d';
            note = args.slice(3).join(' ') || `By ${message.author.username}`;
        }

        if (!serviceId) {
            return message.reply({
                embeds: [{
                    color: 0xe74c3c,
                    title: '❌ Service ID Required',
                    description: '**Usage:** `!key create [serviceId] [duration] [note]`\n\n**Contoh:**\n`!key create abc123 7d My key`\n`!key create abc123 30d`\n\n**Lihat services:** `!service list`'
                }]
            });
        }

        const result = await jnkieRequest('POST', '/keys', {
            service_id: serviceId,
            duration: duration,
            note: note,
            max_hwids: 1
        });

        if (result.success && result.data) {
            const key = result.data.key || result.data.id || 'N/A';
            await message.reply({ 
                embeds: [{ 
                    color: 0x2ecc71, 
                    title: '✅ Key Created', 
                    fields: [
                        { name: '🔑 Key', value: `\`${key}\`` },
                        { name: 'Service', value: `\`${serviceId}\``, inline: true },
                        { name: 'Duration', value: duration, inline: true },
                        { name: 'Note', value: note }
                    ]
                }]
            });
            try { await message.author.send(`🔑 Your Key: \`${key}\``); } catch (e) {}
            return;
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    // !key batch [serviceId] [count] [duration]
    if (action === 'batch') {
        let serviceId, count, duration;

        // Check args
        if (args[1] && !isNaN(parseInt(args[1]))) {
            // !key batch 5 7d (tanpa serviceId)
            serviceId = JNKIE_SERVICE_ID;
            count = parseInt(args[1]) || 5;
            duration = args[2] || '7d';
        } else {
            // !key batch [serviceId] [count] [duration]
            serviceId = args[1] || JNKIE_SERVICE_ID;
            count = parseInt(args[2]) || 5;
            duration = args[3] || '7d';
        }

        if (!serviceId) {
            return message.reply({
                embeds: [{
                    color: 0xe74c3c,
                    title: '❌ Service ID Required',
                    description: '**Usage:** `!key batch [serviceId] [count] [duration]`\n\n**Contoh:**\n`!key batch abc123 10 7d`'
                }]
            });
        }

        const result = await jnkieRequest('POST', '/keys/batch', {
            service_id: serviceId,
            count: count,
            duration: duration,
            max_hwids: 1
        });

        if (result.success) {
            const keys = result.data?.keys || result.data || [];
            const keyList = Array.isArray(keys) 
                ? keys.slice(0, 10).map(k => `\`${(k.key || k).substring(0, 30)}...\``).join('\n')
                : 'Keys created';
            return message.reply({ 
                embeds: [{ 
                    color: 0x2ecc71, 
                    title: `✅ ${count} Keys Created`, 
                    description: `Service: \`${serviceId}\`\nDuration: ${duration}\n\n${keyList}${keys.length > 10 ? `\n... dan ${keys.length - 10} lagi` : ''}`
                }] 
            });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    // !key get [keyId]
    if (action === 'get') {
        const keyId = args[1];
        if (!keyId) return message.reply('❌ Usage: `!key get [keyId]`');

        const result = await jnkieRequest('GET', `/keys/${keyId}`);
        if (result.success && result.data) {
            const k = result.data;
            return message.reply({ 
                embeds: [{ 
                    color: 0x2ecc71, 
                    title: '🔑 Key Details', 
                    fields: [
                        { name: 'Key', value: `\`${k.key || k.id}\`` },
                        { name: 'Status', value: k.status || 'N/A', inline: true },
                        { name: 'Service', value: `\`${k.service_id || 'N/A'}\``, inline: true },
                        { name: 'Expires', value: k.expires_at || 'N/A', inline: true },
                        { name: 'HWIDs', value: `${k.hwids?.length || 0}/${k.max_hwids || 1}`, inline: true },
                        { name: 'Note', value: k.note || 'N/A' }
                    ]
                }]
            });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    // !key verify [key]
    if (action === 'verify') {
        const key = args[1];
        if (!key) return message.reply('❌ Usage: `!key verify [key]`');

        const result = await jnkieRequest('GET', `/keys?key=${encodeURIComponent(key)}`);
        if (result.success && result.data) {
            const keys = Array.isArray(result.data) ? result.data : [result.data];
            if (keys.length > 0 && keys[0].key) {
                const k = keys[0];
                const valid = k.status === 'active';
                return message.reply({ 
                    embeds: [{ 
                        color: valid ? 0x2ecc71 : 0xe74c3c, 
                        title: valid ? '✅ Key Valid' : '❌ Key Invalid',
                        fields: [
                            { name: 'Status', value: k.status || 'N/A', inline: true },
                            { name: 'Expires', value: k.expires_at || 'N/A', inline: true },
                            { name: 'Service', value: `\`${k.service_id || 'N/A'}\``, inline: true }
                        ]
                    }]
                });
            }
        }
        return message.reply({ embeds: [{ color: 0xe74c3c, title: '❌ Key Not Found' }] });
    }

    // !key reset [keyId]
    if (action === 'reset') {
        const keyId = args[1];
        if (!keyId) return message.reply('❌ Usage: `!key reset [keyId]`');

        const result = await jnkieRequest('POST', `/keys/${keyId}/reset-hwid`);
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ HWID Reset' }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    // !key delete [keyId]
    if (action === 'delete') {
        const keyId = args[1];
        if (!keyId) return message.reply('❌ Usage: `!key delete [keyId]`');

        const result = await jnkieRequest('DELETE', `/keys/${keyId}`);
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: '✅ Key Deleted' }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    // !key bulk-delete [key1,key2,...]
    if (action === 'bulk-delete') {
        const keysStr = args[1];
        if (!keysStr) return message.reply('❌ Usage: `!key bulk-delete [k1,k2,...]`');

        const keys = keysStr.split(',').map(k => k.trim());
        const result = await jnkieRequest('POST', '/keys/bulk-delete', { keys: keys });
        if (result.success) {
            return message.reply({ embeds: [{ color: 0x2ecc71, title: `✅ ${keys.length} Keys Deleted` }] });
        }
        return message.reply(`❌ Error: ${result.error}`);
    }

    return message.reply({
        embeds: [{
            color: 0x2ecc71,
            title: '🔑 Key Commands',
            fields: [
                { name: 'List', value: '`!key list [serviceId]`' },
                { name: 'Create', value: '`!key create [serviceId] [duration] [note]`' },
                { name: 'Batch', value: '`!key batch [serviceId] [count] [duration]`' },
                { name: 'Get', value: '`!key get [keyId]`' },
                { name: 'Verify', value: '`!key verify [key]`' },
                { name: 'Reset', value: '`!key reset [keyId]`' },
                { name: 'Delete', value: '`!key delete [keyId]`' },
                { name: 'Bulk Delete', value: '`!key bulk-delete [k1,k2]`' }
            ]
        }]
    });
}

async function handleStatus(message) {
    const fields = [
        { name: 'API Key', value: JNKIE_API_KEY ? '✅ Set' : '❌ Not Set', inline: true },
        { name: 'Default Service', value: JNKIE_SERVICE_ID ? `\`${JNKIE_SERVICE_ID}\`` : '❌ Not Set', inline: true }
    ];

    // Test API connection
    if (JNKIE_API_KEY) {
        const result = await jnkieRequest('GET', '/services');
        fields.push({ name: 'API Status', value: result.success ? '✅ Connected' : '❌ Error', inline: true });
        
        if (result.success) {
            const services = Array.isArray(result.data) ? result.data : [];
            fields.push({ name: 'Total Services', value: `${services.length}`, inline: true });
        }
    }

    await message.reply({
        embeds: [{
            color: 0x3498db,
            title: '📊 Status',
            fields: fields,
            timestamp: new Date()
        }]
    });
}

async function handleHelp(message) {
    await message.reply({
        embeds: [{
            color: 0x3498db,
            title: '📖 Commands',
            fields: [
                { name: '🔧 Obfuscator', value: '`!obf [preset]` + file\n`!presets`' },
                { name: '📦 Services', value: '`!service list`\n`!service create [name] [desc]`\n`!service get [id]`\n`!service delete [id]`' },
                { name: '🔌 Providers', value: '`!provider [list|create|get|delete]`' },
                { name: '🔗 Integrations', value: '`!integration [list|types|create|get|delete]`' },
                { name: '🔑 Keys', value: '`!key list [serviceId]`\n`!key create [serviceId] [duration]`\n`!key batch [serviceId] [count] [duration]`\n`!key get/verify/reset/delete [id]`' },
                { name: '📊 Status', value: '`!status` - Cek koneksi API' }
            ],
            footer: { text: 'Gunakan !service list untuk melihat Service ID' }
        }]
    });
}

async function handlePresets(message) {
    await message.reply({
        embeds: [{
            color: 0x9b59b6,
            title: '🎨 Presets',
            fields: [
                { name: '🟢 minify', value: 'Perkecil ukuran' },
                { name: '🔵 weak', value: 'Variable rename' },
                { name: '🟡 medium', value: 'Encryption + Control flow' }
            ]
        }]
    });
}

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
                        error: json.message || json.error 
                    });
                } catch (e) {
                    resolve({ success: false, error: 'Invalid response' });
                }
            });
        });

        req.on('error', (e) => resolve({ success: false, error: e.message }));
        req.setTimeout(30000, () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });

        if (body) req.write(postData);
        req.end();
    });
}

function downloadFile(url) {
    return new Promise((resolve, reject) => {
        const makeRequest = (targetUrl, redirects = 0) => {
            if (redirects > 5) return reject(new Error('Too many redirects'));
            const protocol = targetUrl.startsWith('https') ? https : http;
            protocol.get(targetUrl, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return makeRequest(res.headers.location, redirects + 1);
                }
                if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
                res.on('error', reject);
            }).on('error', reject);
        };
        makeRequest(url);
    });
}

function cleanLuaCode(code) {
    if (!code) return '';
    return code.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\x00/g, '').trim();
}

function cleanupFiles(...files) {
    files.forEach(f => { try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {} });
}

client.on('error', () => {});
process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});

client.login(TOKEN);
