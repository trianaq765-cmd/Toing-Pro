const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { promisify } = require('util');

const execAsync = promisify(exec);

// ========== SERVER UNTUK RENDER ==========
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!');
}).listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// ========== DISCORD CLIENT ==========
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ========== ENVIRONMENT VARIABLES ==========
const TOKEN = process.env.DISCORD_TOKEN;
const LUAOBF_API_KEY = process.env.LUAOBF_API_KEY;
const PROMETHEUS_PATH = process.env.PROMETHEUS_PATH || '/app/Prometheus-master';

if (!TOKEN) {
    console.error('❌ DISCORD_TOKEN tidak ditemukan!');
    process.exit(1);
}

// ========== PRESETS ==========

// Prometheus Presets
const PROMETHEUS_PRESETS = {
    minify: 'Minify',
    weak: 'Weak',
    medium: 'Medium',
    strong: 'Strong',
    vm: 'Vm'
};

// LuaObfuscator API Presets
const LUAOBF_PRESETS = {
    minify: {
        name: 'Minify',
        options: {
            MinifyAll: true
        }
    },
    light: {
        name: 'Light',
        options: {
            MinifyAll: true,
            EncryptStrings: true
        }
    },
    medium: {
        name: 'Medium',
        options: {
            MinifyAll: true,
            EncryptStrings: true,
            ControlFlowFlattenV1: true,
            MutateAllLiterals: true
        }
    },
    strong: {
        name: 'Strong',
        options: {
            MinifyAll: true,
            EncryptStrings: true,
            ControlFlowFlattenV2: true,
            MutateAllLiterals: true,
            EncryptFuncDeclaration: true,
            MixedBooleanArithmetic: true,
            TableIndirection: true
        }
    },
    max: {
        name: 'Maximum',
        options: {
            MinifyAll: true,
            EncryptStrings: true,
            ControlFlowFlattenV2: true,
            Virtualize: true,
            MutateAllLiterals: true,
            EncryptFuncDeclaration: true,
            WowPacker: true
        }
    }
};

// ========== DISCORD EVENTS ==========

client.on('ready', () => {
    console.log(`✅ Bot ${client.user.tag} sudah online!`);
    console.log(`📁 Prometheus: ${PROMETHEUS_PATH}`);
    console.log(`🔑 LuaObf API: ${LUAOBF_API_KEY ? 'Configured' : 'NOT SET!'}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.toLowerCase();

    if (message.content.startsWith('!obfuscate')) {
        await handleObfuscate(message);
    } else if (content === '!help') {
        await handleHelp(message);
    } else if (content === '!presets') {
        await handlePresets(message);
    } else if (content === '!test') {
        await handleTest(message);
    } else if (content === '!example') {
        await handleExample(message);
    }
});

// ========== MAIN OBFUSCATE HANDLER ==========

async function handleObfuscate(message) {
    // Check attachment
    if (message.attachments.size === 0) {
        return message.reply({
            embeds: [{
                color: 0xff0000,
                title: '❌ File Tidak Ditemukan',
                description: 'Kirim file `.lua` untuk di-obfuscate!',
                fields: [
                    {
                        name: '📌 Cara Pakai:',
                        value: '```\n!obfuscate [mode] [preset] + attach file.lua\n```'
                    },
                    {
                        name: '🔧 Modes:',
                        value: '`prometheus` / `prom` - Prometheus (lokal)\n`luaobf` / `lua` - LuaObfuscator API'
                    },
                    {
                        name: '💡 Contoh:',
                        value: '`!obfuscate prometheus strong`\n`!obfuscate luaobf max`'
                    }
                ]
            }]
        });
    }

    const attachment = message.attachments.first();

    // Validate file
    if (!attachment.name.endsWith('.lua') && !attachment.name.endsWith('.txt')) {
        return message.reply({
            embeds: [{
                color: 0xff0000,
                title: '❌ Format Salah',
                description: 'File harus `.lua` atau `.txt`!'
            }]
        });
    }

    if (attachment.size > 5 * 1024 * 1024) {
        return message.reply({
            embeds: [{
                color: 0xff0000,
                title: '❌ File Terlalu Besar',
                description: 'Maksimal 5MB!'
            }]
        });
    }

    // Parse arguments
    const args = message.content.split(' ').slice(1);
    let mode = 'prometheus';
    let presetName = 'minify';

    // Determine mode and preset
    if (args.length >= 1) {
        const firstArg = args[0].toLowerCase();
        if (['prometheus', 'prom', 'p'].includes(firstArg)) {
            mode = 'prometheus';
            presetName = args[1]?.toLowerCase() || 'minify';
        } else if (['luaobf', 'lua', 'l', 'api'].includes(firstArg)) {
            mode = 'luaobf';
            presetName = args[1]?.toLowerCase() || 'minify';
        } else {
            // Assume it's a preset name for prometheus (backward compatibility)
            mode = 'prometheus';
            presetName = firstArg;
        }
    }

    // Route to appropriate handler
    if (mode === 'luaobf') {
        await handleLuaObfuscatorAPI(message, attachment, presetName);
    } else {
        await handlePrometheus(message, attachment, presetName);
    }
}

// ========== PROMETHEUS HANDLER ==========

async function handlePrometheus(message, attachment, presetName) {
    const preset = PROMETHEUS_PRESETS[presetName] || 'Minify';
    const timestamp = Date.now();
    const inputPath = path.join(PROMETHEUS_PATH, `temp_${timestamp}_input.lua`);
    const outputPath = path.join(PROMETHEUS_PATH, `temp_${timestamp}_output.lua`);

    let statusMsg;

    try {
        // Download file
        const luaCode = await downloadFile(attachment.url);
        
        if (!luaCode || luaCode.length < 5) {
            return message.reply({
                embeds: [{
                    color: 0xff0000,
                    title: '❌ File Kosong',
                    description: 'File tidak boleh kosong!'
                }]
            });
        }

        // Save file
        fs.writeFileSync(inputPath, cleanLuaCode(luaCode), 'utf8');

        // Status message
        statusMsg = await message.reply({
            embeds: [{
                color: 0x3498db,
                title: '⏳ Prometheus Processing',
                description: `Obfuscating dengan preset: **${preset}**...`,
                fields: [
                    { name: 'File', value: attachment.name, inline: true },
                    { name: 'Size', value: `${(attachment.size / 1024).toFixed(2)} KB`, inline: true },
                    { name: 'Preset', value: preset, inline: true }
                ]
            }]
        });

        // Run Prometheus
        let success = false;
        let errorOutput = '';

        try {
            const command = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset ${preset} "${inputPath}" --out "${outputPath}" 2>&1`;
            const { stdout, stderr } = await execAsync(command, { timeout: 120000 });

            if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                success = true;
            } else {
                errorOutput = stdout || stderr || 'No output generated';
            }
        } catch (err) {
            errorOutput = err.stderr || err.message;
        }

        // Fallback without preset
        if (!success) {
            try {
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                
                const fallbackCommand = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua "${inputPath}" --out "${outputPath}" 2>&1`;
                await execAsync(fallbackCommand, { timeout: 120000 });

                if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                    success = true;
                }
            } catch (err) {
                errorOutput = err.message || errorOutput;
            }
        }

        // Send result
        if (success) {
            const originalSize = Buffer.byteLength(luaCode, 'utf8');
            const obfuscatedSize = fs.statSync(outputPath).size;

            const outputFile = new AttachmentBuilder(outputPath, {
                name: `prometheus_${attachment.name.replace('.txt', '.lua')}`
            });

            await statusMsg.edit({
                embeds: [{
                    color: 0x2ecc71,
                    title: '✅ Prometheus Berhasil!',
                    fields: [
                        { name: 'Original', value: `${(originalSize / 1024).toFixed(2)} KB`, inline: true },
                        { name: 'Obfuscated', value: `${(obfuscatedSize / 1024).toFixed(2)} KB`, inline: true },
                        { name: 'Preset', value: preset, inline: true }
                    ],
                    footer: { text: '🔧 Prometheus Obfuscator' },
                    timestamp: new Date()
                }],
                files: [outputFile]
            });
        } else {
            await statusMsg.edit({
                embeds: [{
                    color: 0xe74c3c,
                    title: '❌ Prometheus Gagal',
                    description: `\`\`\`${errorOutput.substring(0, 800)}\`\`\``,
                    fields: [
                        { name: '💡 Saran', value: '• Cek syntax script\n• Coba preset lain\n• Gunakan `!obfuscate luaobf` sebagai alternatif' }
                    ]
                }]
            });
        }

    } catch (err) {
        console.error('[Prometheus] Error:', err);
        const errorEmbed = {
            color: 0xe74c3c,
            title: '❌ Error',
            description: err.message
        };
        if (statusMsg) {
            await statusMsg.edit({ embeds: [errorEmbed] });
        } else {
            await message.reply({ embeds: [errorEmbed] });
        }
    } finally {
        cleanupFiles(inputPath, outputPath);
    }
}

// ========== LUAOBFUSCATOR API HANDLER ==========

async function handleLuaObfuscatorAPI(message, attachment, presetName) {
    // Check API key
    if (!LUAOBF_API_KEY) {
        return message.reply({
            embeds: [{
                color: 0xe74c3c,
                title: '❌ API Key Tidak Tersedia',
                description: 'LuaObfuscator API key belum di-set.\nGunakan `!obfuscate prometheus` sebagai alternatif.'
            }]
        });
    }

    const preset = LUAOBF_PRESETS[presetName] || LUAOBF_PRESETS.minify;
    let statusMsg;

    try {
        // Download file
        const luaCode = await downloadFile(attachment.url);
        
        if (!luaCode || luaCode.length < 5) {
            return message.reply({
                embeds: [{
                    color: 0xff0000,
                    title: '❌ File Kosong',
                    description: 'File tidak boleh kosong!'
                }]
            });
        }

        // Status message
        statusMsg = await message.reply({
            embeds: [{
                color: 0x9b59b6,
                title: '⏳ LuaObfuscator API Processing',
                description: `Obfuscating dengan preset: **${preset.name}**...`,
                fields: [
                    { name: 'File', value: attachment.name, inline: true },
                    { name: 'Size', value: `${(attachment.size / 1024).toFixed(2)} KB`, inline: true },
                    { name: 'Preset', value: preset.name, inline: true }
                ]
            }]
        });

        // Step 1: Upload script
        await statusMsg.edit({
            embeds: [{
                color: 0x9b59b6,
                title: '⏳ Step 1/2: Uploading...',
                description: 'Mengirim script ke LuaObfuscator API...'
            }]
        });

        const uploadResult = await luaobfUploadScript(cleanLuaCode(luaCode));
        
        if (!uploadResult.success) {
            throw new Error(`Upload failed: ${uploadResult.error}`);
        }

        const sessionId = uploadResult.sessionId;
        console.log(`[LuaObf] Session ID: ${sessionId}`);

        // Step 2: Obfuscate
        await statusMsg.edit({
            embeds: [{
                color: 0x9b59b6,
                title: '⏳ Step 2/2: Obfuscating...',
                description: `Session: \`${sessionId.substring(0, 20)}...\``
            }]
        });

        const obfuscateResult = await luaobfObfuscate(sessionId, preset.options);

        if (!obfuscateResult.success) {
            throw new Error(`Obfuscation failed: ${obfuscateResult.error}`);
        }

        // Success - send result
        const obfuscatedCode = obfuscateResult.code;
        const originalSize = Buffer.byteLength(luaCode, 'utf8');
        const obfuscatedSize = Buffer.byteLength(obfuscatedCode, 'utf8');

        const buffer = Buffer.from(obfuscatedCode, 'utf8');
        const outputFile = new AttachmentBuilder(buffer, {
            name: `luaobf_${attachment.name.replace('.txt', '.lua')}`
        });

        await statusMsg.edit({
            embeds: [{
                color: 0x9b59b6,
                title: '✅ LuaObfuscator Berhasil!',
                fields: [
                    { name: 'Original', value: `${(originalSize / 1024).toFixed(2)} KB`, inline: true },
                    { name: 'Obfuscated', value: `${(obfuscatedSize / 1024).toFixed(2)} KB`, inline: true },
                    { name: 'Preset', value: preset.name, inline: true }
                ],
                footer: { text: '🌐 LuaObfuscator API' },
                timestamp: new Date()
            }],
            files: [outputFile]
        });

    } catch (err) {
        console.error('[LuaObf] Error:', err);
        
        const errorEmbed = {
            color: 0xe74c3c,
            title: '❌ LuaObfuscator API Error',
            description: `\`${err.message}\``,
            fields: [
                { name: '💡 Alternatif', value: 'Gunakan `!obfuscate prometheus` sebagai alternatif' }
            ]
        };

        if (statusMsg) {
            await statusMsg.edit({ embeds: [errorEmbed] });
        } else {
            await message.reply({ embeds: [errorEmbed] });
        }
    }
}

// ========== LUAOBFUSCATOR API FUNCTIONS ==========

function luaobfUploadScript(scriptContent) {
    return new Promise((resolve) => {
        const postData = scriptContent;

        const options = {
            hostname: 'api.luaobfuscator.com',
            port: 443,
            path: '/v1/obfuscator/newscript',
            method: 'POST',
            headers: {
                'apikey': LUAOBF_API_KEY,
                'Content-Type': 'text/plain',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.sessionId) {
                        resolve({ success: true, sessionId: json.sessionId });
                    } else {
                        resolve({ success: false, error: json.message || 'No sessionId returned' });
                    }
                } catch (e) {
                    resolve({ success: false, error: `Parse error: ${data.substring(0, 100)}` });
                }
            });
        });

        req.on('error', (e) => {
            resolve({ success: false, error: e.message });
        });

        req.setTimeout(30000, () => {
            req.destroy();
            resolve({ success: false, error: 'Request timeout' });
        });

        req.write(postData);
        req.end();
    });
}

function luaobfObfuscate(sessionId, options) {
    return new Promise((resolve) => {
        const postData = JSON.stringify(options);

        const reqOptions = {
            hostname: 'api.luaobfuscator.com',
            port: 443,
            path: '/v1/obfuscator/obfuscate',
            method: 'POST',
            headers: {
                'apikey': LUAOBF_API_KEY,
                'sessionId': sessionId,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.code) {
                        resolve({ success: true, code: json.code });
                    } else {
                        resolve({ success: false, error: json.message || 'No code returned' });
                    }
                } catch (e) {
                    resolve({ success: false, error: `Parse error: ${data.substring(0, 100)}` });
                }
            });
        });

        req.on('error', (e) => {
            resolve({ success: false, error: e.message });
        });

        req.setTimeout(120000, () => {
            req.destroy();
            resolve({ success: false, error: 'Request timeout (120s)' });
        });

        req.write(postData);
        req.end();
    });
}

// ========== HELPER FUNCTIONS ==========

function downloadFile(url) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const protocol = urlObj.protocol === 'https:' ? https : http;

        protocol.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                downloadFile(res.headers.location).then(resolve).catch(reject);
                return;
            }

            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }

            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            res.on('error', reject);
        }).on('error', reject);
    });
}

function cleanLuaCode(code) {
    if (!code) return '';
    code = code.replace(/^\uFEFF/, '');
    code = code.replace(/\r\n/g, '\n');
    code = code.replace(/\r/g, '\n');
    code = code.replace(/\x00/g, '');
    code = code.trim();
    while (code.length > 0 && code.charCodeAt(0) < 32) {
        code = code.substring(1);
    }
    return code;
}

function cleanupFiles(...files) {
    for (const file of files) {
        try {
            if (file && fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        } catch (err) {
            console.error('[Cleanup]', err.message);
        }
    }
}

// ========== OTHER COMMAND HANDLERS ==========

async function handleHelp(message) {
    await message.reply({
        embeds: [{
            color: 0x3498db,
            title: '📖 Dual Obfuscator Bot',
            description: 'Bot dengan 2 mode obfuscation!',
            fields: [
                {
                    name: '🔧 Modes',
                    value: '`prometheus` / `prom` - Prometheus (lokal)\n`luaobf` / `lua` - LuaObfuscator API'
                },
                {
                    name: '📌 Commands',
                    value: '`!obfuscate [mode] [preset]` + file\n`!presets` - Lihat semua preset\n`!test` - Test bot\n`!example` - Contoh script'
                },
                {
                    name: '💡 Contoh',
                    value: '```\n!obfuscate prometheus strong\n!obfuscate prom minify\n!obfuscate luaobf max\n!obfuscate lua medium\n```'
                }
            ],
            footer: { text: 'Max: 5MB | Format: .lua / .txt' }
        }]
    });
}

async function handlePresets(message) {
    await message.reply({
        embeds: [{
            color: 0x3498db,
            title: '🎨 Presets',
            fields: [
                {
                    name: '🔧 Prometheus Presets',
                    value: '`minify` - Minify only\n`weak` - Ringan\n`medium` - Sedang\n`strong` - Kuat\n`vm` - Virtual Machine'
                },
                {
                    name: '🌐 LuaObfuscator Presets',
                    value: '`minify` - Minify only\n`light` - Encrypt strings\n`medium` - + Control flow\n`strong` - + Multiple layers\n`max` - + Virtualize (terkuat)'
                }
            ]
        }]
    });
}

async function handleTest(message) {
    const statusMsg = await message.reply({
        embeds: [{ color: 0xffff00, title: '⏳ Testing...', description: 'Mengecek kedua obfuscator...' }]
    });

    let promStatus = '❓ Not tested';
    let luaobfStatus = '❓ Not tested';

    // Test Prometheus
    try {
        const testPath = path.join(PROMETHEUS_PATH, 'test_check.lua');
        const testOut = path.join(PROMETHEUS_PATH, 'test_check_out.lua');
        fs.writeFileSync(testPath, 'print("test")');
        
        await execAsync(`cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset Minify "${testPath}" --out "${testOut}" 2>&1`, { timeout: 15000 });
        
        if (fs.existsSync(testOut) && fs.statSync(testOut).size > 0) {
            promStatus = '✅ Working';
        } else {
            promStatus = '⚠️ No output';
        }
        cleanupFiles(testPath, testOut);
    } catch (err) {
        promStatus = `❌ Error: ${err.message.substring(0, 50)}`;
    }

    // Test LuaObfuscator API
    if (LUAOBF_API_KEY) {
        try {
            const result = await luaobfUploadScript('print("test")');
            if (result.success) {
                luaobfStatus = '✅ API Connected';
            } else {
                luaobfStatus = `⚠️ ${result.error.substring(0, 50)}`;
            }
        } catch (err) {
            luaobfStatus = `❌ ${err.message.substring(0, 50)}`;
        }
    } else {
        luaobfStatus = '⚠️ API Key not set';
    }

    await statusMsg.edit({
        embeds: [{
            color: 0x3498db,
            title: '🧪 Test Results',
            fields: [
                { name: '🔧 Prometheus', value: promStatus, inline: true },
                { name: '🌐 LuaObfuscator API', value: luaobfStatus, inline: true }
            ],
            timestamp: new Date()
        }]
    });
}

async function handleExample(message) {
    const example = `-- Contoh Script Roblox
local Players = game:GetService("Players")
local player = Players.LocalPlayer

local function greet(name)
    print("Hello, " .. name)
end

greet(player.Name)

for i = 1, 10 do
    print("Count: " .. i)
end`;

    const buffer = Buffer.from(example, 'utf8');
    const file = new AttachmentBuilder(buffer, { name: 'example.lua' });

    await message.reply({
        embeds: [{
            color: 0x2ecc71,
            title: '📝 Contoh Script',
            description: 'Download dan coba obfuscate!'
        }],
        files: [file]
    });
}

// ========== ERROR HANDLING ==========
client.on('error', console.error);
process.on('unhandledRejection', console.error);

// ========== LOGIN ==========
client.login(TOKEN);
