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
    console.log(`✅ Server running on port ${PORT}`);
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

// ========== PROMETHEUS PRESETS ==========
const PROMETHEUS_PRESETS = {
    minify: 'Minify',
    weak: 'Weak',
    medium: 'Medium',
    strong: 'Strong',
    vm: 'Vm'
};

// ========== LUAOBFUSCATOR API PRESETS (SESUAI WEB) ==========
const LUAOBF_PRESETS = {
    // 💀 Dystropic Malevolence (Terkuat)
    dystropic: {
        name: 'Dystropic Malevolence',
        emoji: '💀',
        options: {
            MinifyAll: true,
            Virtualize: true,
            EncryptStrings: true,
            EncryptFuncDeclaration: true,
            ControlFlowFlattenV2: true,
            MutateAllLiterals: true,
            MixedBooleanArithmetic: true,
            WowPacker: true
        }
    },
    
    // 😈 Chaotic Evil
    evil: {
        name: 'Chaotic Evil',
        emoji: '😈',
        options: {
            MinifyAll: true,
            EncryptStrings: true,
            ControlFlowFlattenV2: true,
            JunkifyAllIfStatements: true,
            MutateAllLiterals: true,
            SwizzleLookups: true,
            TableIndirection: true
        }
    },
    
    // 😇 Chaotic Good
    good: {
        name: 'Chaotic Good',
        emoji: '😇',
        options: {
            MinifyAll: true,
            EncryptStrings: true,
            ControlFlowFlattenV1: true,
            MutateAllLiterals: true,
            OptimizeDeadLocals: true
        }
    },
    
    // ⚡ OBFUSCATE V1
    v1: {
        name: 'OBFUSCATE V1',
        emoji: '⚡',
        options: {
            MinifyAll: true,
            EncryptStrings: true,
            ControlFlowFlattenV1: true,
            TableIndirection: true,
            MutateAllLiterals: true
        }
    },
    
    // 📜 OBFUSCATE (old)
    old: {
        name: 'OBFUSCATE (old)',
        emoji: '📜',
        options: {
            MinifyAll: true,
            EncryptStrings: true,
            ConstMaker: true
        }
    },
    
    // ✅ Basic Good
    basic: {
        name: 'Basic Good',
        emoji: '✅',
        options: {
            MinifyAll: true,
            EncryptStrings: true,
            MutateAllLiterals: true
        }
    },
    
    // 🟢 Basic Minimal
    minimal: {
        name: 'Basic Minimal',
        emoji: '🟢',
        options: {
            MinifyAll: true,
            Minifier: true
        }
    },
    
    // ✨ Beautify
    beautify: {
        name: 'Beautify',
        emoji: '✨',
        options: {
            Minifier2: true
        }
    }
};

// ========== DISCORD EVENTS ==========

client.on('ready', () => {
    console.log(`✅ Bot ${client.user.tag} sudah online!`);
    console.log(`📁 Prometheus: ${PROMETHEUS_PATH}`);
    console.log(`🔑 LuaObf API: ${LUAOBF_API_KEY ? 'Configured (' + LUAOBF_API_KEY.substring(0, 10) + '...)' : 'NOT SET!'}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.toLowerCase().trim();

    try {
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
    } catch (err) {
        console.error('[Command Error]', err);
        await message.reply({
            embeds: [{
                color: 0xe74c3c,
                title: '❌ Error',
                description: `\`${err.message}\``
            }]
        }).catch(() => {});
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
                        name: '📌 Cara Pakai',
                        value: '```\n!obfuscate [mode] [preset] + attach file\n```'
                    },
                    {
                        name: '🔧 Modes',
                        value: '`prom` - Prometheus (lokal)\n`lua` - LuaObfuscator API'
                    },
                    {
                        name: '💡 Contoh',
                        value: '`!obfuscate prom strong`\n`!obfuscate lua evil`\n`!obfuscate lua dystropic`'
                    }
                ]
            }]
        });
    }

    const attachment = message.attachments.first();

    // Validate file extension
    const validExtensions = ['.lua', '.txt'];
    const hasValidExt = validExtensions.some(ext => attachment.name.toLowerCase().endsWith(ext));
    
    if (!hasValidExt) {
        return message.reply({
            embeds: [{
                color: 0xff0000,
                title: '❌ Format Salah',
                description: 'File harus `.lua` atau `.txt`!'
            }]
        });
    }

    // Validate file size
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
    const args = message.content.split(/\s+/).slice(1);
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
            presetName = args[1]?.toLowerCase() || 'minimal';
        } else {
            // Assume it's a preset name for prometheus (backward compatibility)
            mode = 'prometheus';
            presetName = firstArg;
        }
    }

    console.log(`[Obfuscate] Mode: ${mode}, Preset: ${presetName}, File: ${attachment.name}`);

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
        // Download file first
        console.log('[Prometheus] Downloading file...');
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

        const cleanedCode = cleanLuaCode(luaCode);
        
        // Save file
        fs.writeFileSync(inputPath, cleanedCode, 'utf8');
        console.log(`[Prometheus] File saved: ${inputPath} (${cleanedCode.length} bytes)`);

        // Status message
        statusMsg = await message.reply({
            embeds: [{
                color: 0x3498db,
                title: '🔧 Prometheus Processing',
                description: `Obfuscating dengan preset: **${preset}**...`,
                fields: [
                    { name: 'File', value: attachment.name, inline: true },
                    { name: 'Size', value: `${(cleanedCode.length / 1024).toFixed(2)} KB`, inline: true },
                    { name: 'Preset', value: preset, inline: true }
                ]
            }]
        });

        // Run Prometheus
        let success = false;
        let usedPreset = preset;
        let errorOutput = '';

        // Try with selected preset
        try {
            const command = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset ${preset} "${inputPath}" --out "${outputPath}" 2>&1`;
            console.log(`[Prometheus] Running: ${command}`);
            
            const { stdout, stderr } = await execAsync(command, { timeout: 120000 });
            console.log(`[Prometheus] stdout: ${stdout}`);
            if (stderr) console.log(`[Prometheus] stderr: ${stderr}`);

            if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                success = true;
            } else {
                errorOutput = stdout || stderr || 'No output generated';
            }
        } catch (err) {
            console.log(`[Prometheus] Error with preset ${preset}:`, err.message);
            errorOutput = err.stderr || err.stdout || err.message;
        }

        // Fallback without preset
        if (!success) {
            try {
                console.log('[Prometheus] Trying fallback without preset...');
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                
                const fallbackCommand = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua "${inputPath}" --out "${outputPath}" 2>&1`;
                const { stdout, stderr } = await execAsync(fallbackCommand, { timeout: 120000 });

                if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                    success = true;
                    usedPreset = 'Default';
                } else {
                    errorOutput = stdout || stderr || errorOutput;
                }
            } catch (err) {
                errorOutput = err.stderr || err.stdout || err.message || errorOutput;
            }
        }

        // Send result
        if (success) {
            const originalSize = Buffer.byteLength(cleanedCode, 'utf8');
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
                        { name: 'Preset', value: usedPreset, inline: true }
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
                        { 
                            name: '💡 Saran', 
                            value: '• Cek syntax script\n• Coba preset lain\n• Gunakan `!obfuscate lua` sebagai alternatif' 
                        }
                    ]
                }]
            });
        }

    } catch (err) {
        console.error('[Prometheus] Error:', err);
        const errorEmbed = {
            color: 0xe74c3c,
            title: '❌ Error',
            description: `\`${err.message}\``
        };
        
        if (statusMsg) {
            await statusMsg.edit({ embeds: [errorEmbed] }).catch(() => {});
        } else {
            await message.reply({ embeds: [errorEmbed] }).catch(() => {});
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
                description: 'LuaObfuscator API key belum di-set.',
                fields: [
                    { name: '💡 Alternatif', value: 'Gunakan `!obfuscate prom` sebagai alternatif.' }
                ]
            }]
        });
    }

    const preset = LUAOBF_PRESETS[presetName] || LUAOBF_PRESETS.minimal;
    let statusMsg;

    try {
        // Download file first
        console.log('[LuaObf] Downloading file...');
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

        const cleanedCode = cleanLuaCode(luaCode);
        console.log(`[LuaObf] Code length: ${cleanedCode.length} bytes`);

        // Status message
        statusMsg = await message.reply({
            embeds: [{
                color: 0x9b59b6,
                title: `${preset.emoji} LuaObfuscator API`,
                description: `Preset: **${preset.name}**\nMenghubungi API...`,
                fields: [
                    { name: 'File', value: attachment.name, inline: true },
                    { name: 'Size', value: `${(cleanedCode.length / 1024).toFixed(2)} KB`, inline: true }
                ]
            }]
        });

        let obfuscatedCode = null;
        let lastError = '';

        // ===== METHOD 1: Two-step (Upload + Obfuscate) =====
        console.log('[LuaObf] Trying two-step method...');
        
        await statusMsg.edit({
            embeds: [{
                color: 0x9b59b6,
                title: `${preset.emoji} Step 1/2: Uploading...`,
                description: 'Mengirim script ke server...'
            }]
        });

        const uploadResult = await luaobfUploadScript(cleanedCode);
        
        if (uploadResult.success && uploadResult.sessionId) {
            console.log('[LuaObf] Upload success, session:', uploadResult.sessionId.substring(0, 30) + '...');
            
            // Small delay before obfuscate
            await sleep(500);
            
            await statusMsg.edit({
                embeds: [{
                    color: 0x9b59b6,
                    title: `${preset.emoji} Step 2/2: Obfuscating...`,
                    description: `Preset: **${preset.name}**\nSession aktif, memproses...`
                }]
            });

            const obfResult = await luaobfObfuscate(uploadResult.sessionId, preset.options);
            
            if (obfResult.success && obfResult.code) {
                obfuscatedCode = obfResult.code;
                console.log('[LuaObf] Obfuscation success, code length:', obfuscatedCode.length);
            } else {
                lastError = obfResult.error || 'Obfuscation failed';
                console.log('[LuaObf] Obfuscation failed:', lastError);
            }
        } else {
            lastError = uploadResult.error || 'Upload failed';
            console.log('[LuaObf] Upload failed:', lastError);
        }

        // ===== METHOD 2: One-shot (if two-step fails) =====
        if (!obfuscatedCode) {
            console.log('[LuaObf] Two-step failed, trying one-shot method...');
            
            await statusMsg.edit({
                embeds: [{
                    color: 0xf39c12,
                    title: '⏳ Mencoba metode alternatif...',
                    description: 'Menggunakan single-request method...'
                }]
            });

            const oneShotResult = await luaobfOneShot(cleanedCode, preset.options);
            
            if (oneShotResult.success && oneShotResult.code) {
                obfuscatedCode = oneShotResult.code;
                console.log('[LuaObf] One-shot success, code length:', obfuscatedCode.length);
            } else {
                lastError = oneShotResult.error || lastError;
                console.log('[LuaObf] One-shot also failed:', lastError);
            }
        }

        // ===== SEND RESULT =====
        if (obfuscatedCode && obfuscatedCode.length > 10) {
            const originalSize = Buffer.byteLength(cleanedCode, 'utf8');
            const obfuscatedSize = Buffer.byteLength(obfuscatedCode, 'utf8');

            const buffer = Buffer.from(obfuscatedCode, 'utf8');
            const outputFile = new AttachmentBuilder(buffer, {
                name: `luaobf_${presetName}_${attachment.name.replace('.txt', '.lua')}`
            });

            await statusMsg.edit({
                embeds: [{
                    color: 0x9b59b6,
                    title: `${preset.emoji} LuaObfuscator Berhasil!`,
                    description: `Preset: **${preset.name}**`,
                    fields: [
                        { name: 'Original', value: `${(originalSize / 1024).toFixed(2)} KB`, inline: true },
                        { name: 'Obfuscated', value: `${(obfuscatedSize / 1024).toFixed(2)} KB`, inline: true },
                        { name: 'Ratio', value: `${((obfuscatedSize / originalSize) * 100).toFixed(0)}%`, inline: true }
                    ],
                    footer: { text: '🌐 LuaObfuscator API' },
                    timestamp: new Date()
                }],
                files: [outputFile]
            });
        } else {
            // All methods failed
            await statusMsg.edit({
                embeds: [{
                    color: 0xe74c3c,
                    title: '❌ LuaObfuscator API Gagal',
                    description: `Error: \`${lastError}\``,
                    fields: [
                        { 
                            name: '💡 Solusi', 
                            value: '• Coba preset lain (misal: `minimal` atau `basic`)\n• Gunakan `!obfuscate prom` sebagai alternatif\n• Cek API key valid di dashboard LuaObfuscator' 
                        }
                    ]
                }]
            });
        }

    } catch (err) {
        console.error('[LuaObf] Handler error:', err);
        
        const errorEmbed = {
            color: 0xe74c3c,
            title: '❌ Error',
            description: `\`${err.message}\``,
            fields: [
                { name: '💡 Alternatif', value: 'Gunakan `!obfuscate prom`' }
            ]
        };

        if (statusMsg) {
            await statusMsg.edit({ embeds: [errorEmbed] }).catch(() => {});
        } else {
            await message.reply({ embeds: [errorEmbed] }).catch(() => {});
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
                'Content-Length': Buffer.byteLength(postData, 'utf8')
            }
        };

        console.log('[LuaObf Upload] Sending request to /v1/obfuscator/newscript');

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('[LuaObf Upload] Status:', res.statusCode);
                console.log('[LuaObf Upload] Response:', data.substring(0, 200));

                try {
                    const json = JSON.parse(data);
                    
                    if (json.sessionId) {
                        resolve({ success: true, sessionId: json.sessionId });
                    } else if (json.message) {
                        resolve({ success: false, error: json.message });
                    } else {
                        resolve({ success: false, error: 'No sessionId in response' });
                    }
                } catch (e) {
                    console.log('[LuaObf Upload] Parse error:', e.message);
                    resolve({ success: false, error: `Invalid response: ${data.substring(0, 50)}` });
                }
            });
        });

        req.on('error', (e) => {
            console.log('[LuaObf Upload] Request error:', e.message);
            resolve({ success: false, error: e.message });
        });

        req.setTimeout(30000, () => {
            req.destroy();
            resolve({ success: false, error: 'Upload timeout (30s)' });
        });

        req.write(postData, 'utf8');
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
                'Content-Length': Buffer.byteLength(postData, 'utf8')
            }
        };

        console.log('[LuaObf Obfuscate] Sending request with sessionId:', sessionId.substring(0, 30) + '...');
        console.log('[LuaObf Obfuscate] Options:', JSON.stringify(options));

        const req = https.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('[LuaObf Obfuscate] Status:', res.statusCode);
                console.log('[LuaObf Obfuscate] Response length:', data.length);

                try {
                    const json = JSON.parse(data);
                    
                    if (json.code) {
                        resolve({ success: true, code: json.code });
                    } else if (json.message) {
                        resolve({ success: false, error: json.message });
                    } else {
                        resolve({ success: false, error: 'No code in response' });
                    }
                } catch (e) {
                    console.log('[LuaObf Obfuscate] Parse error, checking if raw code...');
                    // Maybe response is raw code
                    if (data.length > 50 && (data.includes('local') || data.includes('function') || data.includes('return'))) {
                        resolve({ success: true, code: data });
                    } else {
                        resolve({ success: false, error: `Parse error: ${data.substring(0, 100)}` });
                    }
                }
            });
        });

        req.on('error', (e) => {
            console.log('[LuaObf Obfuscate] Request error:', e.message);
            resolve({ success: false, error: e.message });
        });

        req.setTimeout(120000, () => {
            req.destroy();
            resolve({ success: false, error: 'Obfuscation timeout (120s)' });
        });

        req.write(postData, 'utf8');
        req.end();
    });
}

function luaobfOneShot(scriptContent, options) {
    return new Promise((resolve) => {
        const postData = JSON.stringify({
            script: scriptContent,
            ...options
        });

        const reqOptions = {
            hostname: 'api.luaobfuscator.com',
            port: 443,
            path: '/v1/obfuscator/obfuscate',
            method: 'POST',
            headers: {
                'apikey': LUAOBF_API_KEY,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData, 'utf8')
            }
        };

        console.log('[LuaObf OneShot] Trying single-request method...');

        const req = https.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('[LuaObf OneShot] Status:', res.statusCode);

                try {
                    const json = JSON.parse(data);
                    if (json.code) {
                        resolve({ success: true, code: json.code });
                    } else {
                        resolve({ success: false, error: json.message || 'No code returned' });
                    }
                } catch (e) {
                    resolve({ success: false, error: 'Invalid response' });
                }
            });
        });

        req.on('error', (e) => resolve({ success: false, error: e.message }));
        req.setTimeout(120000, () => {
            req.destroy();
            resolve({ success: false, error: 'Timeout' });
        });

        req.write(postData, 'utf8');
        req.end();
    });
}

// ========== HELPER FUNCTIONS ==========

function downloadFile(url) {
    return new Promise((resolve, reject) => {
        console.log('[Download] Starting:', url.substring(0, 80) + '...');
        
        const makeRequest = (targetUrl, redirectCount = 0) => {
            if (redirectCount > 5) {
                reject(new Error('Too many redirects'));
                return;
            }

            const urlObj = new URL(targetUrl);
            const protocol = urlObj.protocol === 'https:' ? https : http;

            const req = protocol.get(targetUrl, (res) => {
                // Handle redirects
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    console.log('[Download] Redirect to:', res.headers.location.substring(0, 50));
                    makeRequest(res.headers.location, redirectCount + 1);
                    return;
                }

                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }

                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => {
                    const data = Buffer.concat(chunks).toString('utf8');
                    console.log('[Download] Success, size:', data.length);
                    resolve(data);
                });
                res.on('error', reject);
            });

            req.on('error', reject);
            req.setTimeout(30000, () => {
                req.destroy();
                reject(new Error('Download timeout'));
            });
        };

        makeRequest(url);
    });
}

function cleanLuaCode(code) {
    if (!code) return '';
    
    // Remove BOM
    code = code.replace(/^\uFEFF/, '');
    code = code.replace(/^\xEF\xBB\xBF/, '');
    
    // Normalize line endings
    code = code.replace(/\r\n/g, '\n');
    code = code.replace(/\r/g, '\n');
    
    // Remove null bytes
    code = code.replace(/\x00/g, '');
    
    // Trim
    code = code.trim();
    
    // Remove weird starting characters
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
                console.log('[Cleanup] Deleted:', file);
            }
        } catch (err) {
            console.error('[Cleanup] Error:', err.message);
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ========== COMMAND HANDLERS ==========

async function handleHelp(message) {
    await message.reply({
        embeds: [{
            color: 0x3498db,
            title: '📖 Dual Obfuscator Bot',
            description: 'Bot dengan **2 mode** obfuscation untuk script Lua/Roblox!',
            fields: [
                {
                    name: '🔧 Modes',
                    value: '`prom` - Prometheus (lokal)\n`lua` - LuaObfuscator API'
                },
                {
                    name: '📌 Commands',
                    value: '`!obfuscate [mode] [preset]` + file\n`!presets` - Lihat semua preset\n`!test` - Test kedua obfuscator\n`!example` - Download contoh script\n`!help` - Bantuan ini'
                },
                {
                    name: '💡 Contoh Prometheus',
                    value: '```\n!obfuscate prom minify\n!obfuscate prom strong\n!obfuscate prom vm\n```'
                },
                {
                    name: '💡 Contoh LuaObfuscator',
                    value: '```\n!obfuscate lua minimal\n!obfuscate lua evil\n!obfuscate lua dystropic\n```'
                }
            ],
            footer: { text: 'Gunakan !presets untuk melihat semua preset' }
        }]
    });
}

async function handlePresets(message) {
    await message.reply({
        embeds: [{
            color: 0x9b59b6,
            title: '🎨 Daftar Presets',
            fields: [
                {
                    name: '🌐 LuaObfuscator API',
                    value: 
                        '💀 `dystropic` - Dystropic Malevolence (Max)\n' +
                        '😈 `evil` - Chaotic Evil\n' +
                        '😇 `good` - Chaotic Good\n' +
                        '⚡ `v1` - OBFUSCATE V1\n' +
                        '📜 `old` - OBFUSCATE (old)\n' +
                        '✅ `basic` - Basic Good\n' +
                        '🟢 `minimal` - Basic Minimal\n' +
                        '✨ `beautify` - Beautify'
                },
                {
                    name: '🔧 Prometheus (Lokal)',
                    value: 
                        '`minify` - Minify Only\n' +
                        '`weak` - Weak protection\n' +
                        '`medium` - Medium protection\n' +
                        '`strong` - Strong protection\n' +
                        '`vm` - Virtual Machine'
                },
                {
                    name: '💡 Rekomendasi',
                    value: 
                        '**Ringan:** `!obfuscate lua minimal`\n' +
                        '**Sedang:** `!obfuscate lua v1`\n' +
                        '**Kuat:** `!obfuscate lua evil`\n' +
                        '**Maximum:** `!obfuscate lua dystropic`'
                }
            ],
            footer: { text: 'Format: !obfuscate [lua/prom] [preset]' }
        }]
    });
}

async function handleTest(message) {
    const statusMsg = await message.reply({
        embeds: [{
            color: 0xffff00,
            title: '⏳ Testing...',
            description: 'Mengecek kedua obfuscator...'
        }]
    });

    let promStatus = '❓ Not tested';
    let luaobfStatus = '❓ Not tested';

    // Test Prometheus
    console.log('[Test] Testing Prometheus...');
    try {
        const testPath = path.join(PROMETHEUS_PATH, 'test_check.lua');
        const testOut = path.join(PROMETHEUS_PATH, 'test_check_out.lua');
        
        fs.writeFileSync(testPath, 'print("test")', 'utf8');
        
        await execAsync(
            `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset Minify "${testPath}" --out "${testOut}" 2>&1`,
            { timeout: 15000 }
        );
        
        if (fs.existsSync(testOut) && fs.statSync(testOut).size > 0) {
            promStatus = '✅ Working';
        } else {
            promStatus = '⚠️ No output generated';
        }
        
        cleanupFiles(testPath, testOut);
    } catch (err) {
        promStatus = `❌ ${err.message.substring(0, 40)}`;
        console.log('[Test] Prometheus error:', err.message);
    }

    // Test LuaObfuscator API
    console.log('[Test] Testing LuaObfuscator API...');
    if (LUAOBF_API_KEY) {
        try {
            const result = await luaobfUploadScript('print("test")');
            if (result.success && result.sessionId) {
                luaobfStatus = '✅ API Connected';
            } else {
                luaobfStatus = `⚠️ ${(result.error || 'Unknown error').substring(0, 40)}`;
            }
        } catch (err) {
            luaobfStatus = `❌ ${err.message.substring(0, 40)}`;
        }
    } else {
        luaobfStatus = '⚠️ API Key not configured';
    }

    await statusMsg.edit({
        embeds: [{
            color: 0x3498db,
            title: '🧪 Test Results',
            fields: [
                { name: '🔧 Prometheus (Lokal)', value: promStatus, inline: true },
                { name: '🌐 LuaObfuscator API', value: luaobfStatus, inline: true }
            ],
            footer: { text: 'Tested at' },
            timestamp: new Date()
        }]
    });
}

async function handleExample(message) {
    const example = `-- ==============================
-- Contoh Script Roblox
-- ==============================

local Players = game:GetService("Players")
local player = Players.LocalPlayer

-- Function sederhana
local function greet(name)
    print("Hello, " .. name .. "!")
    return true
end

-- Panggil function
greet(player.Name)

-- Loop
for i = 1, 10 do
    print("Count: " .. i)
end

-- Table
local data = {
    name = "Test",
    value = 123,
    active = true
}

print(data.name)
print("Script loaded!")`;

    const buffer = Buffer.from(example, 'utf8');
    const file = new AttachmentBuilder(buffer, { name: 'example.lua' });

    await message.reply({
        embeds: [{
            color: 0x2ecc71,
            title: '📝 Contoh Script',
            description: 'Download file ini dan coba obfuscate!',
            fields: [
                {
                    name: '💡 Cara Pakai',
                    value: 
                        '1. Download file dibawah\n' +
                        '2. Upload dengan salah satu command:\n' +
                        '```\n' +
                        '!obfuscate prom strong\n' +
                        '!obfuscate lua evil\n' +
                        '!obfuscate lua dystropic\n' +
                        '```'
                }
            ]
        }],
        files: [file]
    });
}

// ========== ERROR HANDLING ==========

client.on('error', (error) => {
    console.error('[Discord Error]', error);
});

process.on('unhandledRejection', (error) => {
    console.error('[Unhandled Rejection]', error);
});

process.on('uncaughtException', (error) => {
    console.error('[Uncaught Exception]', error);
});

// ========== LOGIN ==========

console.log('🚀 Starting bot...');
client.login(TOKEN).then(() => {
    console.log('✅ Login successful!');
}).catch((err) => {
    console.error('❌ Login failed:', err.message);
    process.exit(1);
});
