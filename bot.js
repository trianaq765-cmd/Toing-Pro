const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Dummy server untuk Render
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!');
}).listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
    console.error('❌ ERROR: DISCORD_TOKEN tidak ditemukan!');
    process.exit(1);
}

const PRESETS = {
    minify: 'Minify',
    weak: 'Weak',
    medium: 'Medium',
    strong: 'Strong',
    vm: 'Vm'
};

const PROMETHEUS_PATH = process.env.PROMETHEUS_PATH || '/app/Prometheus-master';

client.on('ready', () => {
    console.log(`✅ Bot ${client.user.tag} sudah online!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content.startsWith('!obfuscate')) {
        await handleObfuscate(message);
    }

    if (message.content === '!example') {
        await handleExample(message);
    }

    if (message.content === '!test') {
        await handleTest(message);
    }

    if (message.content === '!help') {
        await handleHelp(message);
    }

    if (message.content === '!presets') {
        await handlePresets(message);
    }
});

// ========== FIXED DOWNLOAD FUNCTION ==========

function downloadFile(url) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const protocol = urlObj.protocol === 'https:' ? https : http;
        
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'Accept': '*/*',
                'Accept-Encoding': 'identity',
                'Connection': 'keep-alive'
            }
        };

        const req = protocol.request(options, (res) => {
            // Handle redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                downloadFile(res.headers.location).then(resolve).catch(reject);
                return;
            }

            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }

            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                resolve(buffer.toString('utf8'));
            });
            res.on('error', reject);
        });

        req.on('error', reject);
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('Download timeout'));
        });
        req.end();
    });
}

// ========== ALTERNATIVE: Using node-fetch style ==========

async function downloadFileSimple(url) {
    // Method 1: Native fetch tanpa headers
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.text();
    } catch (err) {
        console.log('[Download] Fetch failed, trying https module...');
        // Fallback ke https module
        return await downloadFile(url);
    }
}

// ========== MAIN OBFUSCATE HANDLER ==========

async function handleObfuscate(message) {
    if (message.attachments.size === 0) {
        return message.reply({
            embeds: [{
                color: 0xff0000,
                title: '❌ File Tidak Ditemukan',
                description: 'Kirim file `.lua` untuk di-obfuscate!',
                fields: [
                    { name: 'Cara Pakai:', value: '`!obfuscate [preset]` + attach file.lua' },
                    { name: 'Presets:', value: '`minify`, `weak`, `medium`, `strong`, `vm`' }
                ]
            }]
        });
    }

    const attachment = message.attachments.first();

    // Validasi extension (support .lua dan .txt)
    const validExtensions = ['.lua', '.txt'];
    const fileExt = path.extname(attachment.name).toLowerCase();
    
    if (!validExtensions.some(ext => attachment.name.toLowerCase().endsWith(ext))) {
        return message.reply({
            embeds: [{
                color: 0xff0000,
                title: '❌ Format File Salah',
                description: 'File harus berformat `.lua` atau `.txt`!'
            }]
        });
    }

    if (attachment.size > 5 * 1024 * 1024) {
        return message.reply({
            embeds: [{
                color: 0xff0000,
                title: '❌ File Terlalu Besar',
                description: 'Maksimal ukuran file: 5MB'
            }]
        });
    }

    const args = message.content.split(' ');
    const presetName = args[1]?.toLowerCase() || 'minify';
    const preset = PRESETS[presetName] || 'Minify';

    const timestamp = Date.now();
    const inputPath = path.join(PROMETHEUS_PATH, `temp_${timestamp}_input.lua`);
    const outputPath = path.join(PROMETHEUS_PATH, `temp_${timestamp}_output.lua`);

    let statusMsg;
    let luaCode;

    try {
        // ============================================
        // STEP 1: DOWNLOAD FILE
        // ============================================
        
        console.log(`[Download] Starting download from: ${attachment.url}`);
        console.log(`[Download] Proxy URL: ${attachment.proxyURL}`);
        
        // Coba beberapa URL
        const urlsToTry = [
            attachment.url,
            attachment.proxyURL,
        ].filter(Boolean);

        let downloadSuccess = false;
        let lastError = null;

        for (const url of urlsToTry) {
            try {
                console.log(`[Download] Trying: ${url.substring(0, 80)}...`);
                luaCode = await downloadFileSimple(url);
                
                if (luaCode && luaCode.length > 0) {
                    downloadSuccess = true;
                    console.log(`[Download] Success! Size: ${luaCode.length} chars`);
                    break;
                }
            } catch (err) {
                console.log(`[Download] Failed: ${err.message}`);
                lastError = err;
            }
        }

        if (!downloadSuccess || !luaCode) {
            return message.reply({
                embeds: [{
                    color: 0xff0000,
                    title: '❌ Download Failed',
                    description: `Tidak bisa download file.`,
                    fields: [
                        {
                            name: 'Error:',
                            value: `\`${lastError?.message || 'Unknown error'}\``
                        },
                        {
                            name: '💡 Solusi:',
                            value: '• Rename file menjadi `.lua` (bukan `.txt.lua`)\n• Pastikan file tidak corrupt\n• Coba upload ulang\n• Pastikan ukuran < 5MB'
                        }
                    ]
                }]
            });
        }

        // Clean code
        luaCode = cleanLuaCode(luaCode);

        if (!luaCode || luaCode.length < 5) {
            return message.reply({
                embeds: [{
                    color: 0xff0000,
                    title: '❌ File Kosong',
                    description: 'File Lua kosong atau terlalu pendek!'
                }]
            });
        }

        // Save file
        fs.writeFileSync(inputPath, luaCode, 'utf8');
        console.log(`[Save] File saved: ${inputPath} (${luaCode.length} chars)`);

        // ============================================
        // STEP 2: SEND STATUS
        // ============================================
        
        statusMsg = await message.reply({
            embeds: [{
                color: 0xffff00,
                title: '⏳ Processing',
                description: `Obfuscating with preset: **${preset}**...`,
                fields: [
                    { name: 'File', value: attachment.name, inline: true },
                    { name: 'Size', value: `${(luaCode.length / 1024).toFixed(2)} KB`, inline: true },
                    { name: 'Preset', value: preset, inline: true }
                ]
            }]
        });

        // ============================================
        // STEP 3: RUN PROMETHEUS
        // ============================================
        
        let success = false;
        let usedPreset = preset;
        let errorOutput = '';

        try {
            const command = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset ${preset} "${inputPath}" --out "${outputPath}" 2>&1`;
            console.log(`[Prometheus] Running: ${command}`);
            
            const { stdout, stderr } = await execAsync(command, { timeout: 120000 });

            console.log(`[Prometheus] stdout: ${stdout}`);
            if (stderr) console.log(`[Prometheus] stderr: ${stderr}`);

            if (fs.existsSync(outputPath)) {
                const outputSize = fs.statSync(outputPath).size;
                console.log(`[Prometheus] Output size: ${outputSize}`);
                
                if (outputSize > 0) {
                    success = true;
                } else {
                    errorOutput = 'Output file is empty';
                }
            } else {
                errorOutput = stdout || stderr || 'No output file generated';
            }
        } catch (err) {
            console.log(`[Prometheus] Error:`, err.message);
            errorOutput = err.stderr || err.stdout || err.message;
        }

        // Fallback tanpa preset
        if (!success) {
            try {
                console.log('[Prometheus] Trying fallback...');
                
                // Hapus output lama jika ada
                if (fs.existsSync(outputPath)) {
                    fs.unlinkSync(outputPath);
                }
                
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

        // ============================================
        // STEP 4: SEND RESULT
        // ============================================

        if (success) {
            const originalSize = Buffer.byteLength(luaCode, 'utf8');
            const obfuscatedSize = fs.statSync(outputPath).size;

            const obfuscatedFile = new AttachmentBuilder(outputPath, {
                name: `obfuscated_${attachment.name.replace('.txt.lua', '.lua').replace('.txt', '.lua')}`
            });

            await statusMsg.edit({
                embeds: [{
                    color: 0x00ff00,
                    title: '✅ Obfuscation Berhasil!',
                    fields: [
                        { name: 'Original Size', value: `${(originalSize / 1024).toFixed(2)} KB`, inline: true },
                        { name: 'Obfuscated Size', value: `${(obfuscatedSize / 1024).toFixed(2)} KB`, inline: true },
                        { name: 'Preset Used', value: usedPreset, inline: true }
                    ],
                    footer: { text: 'Prometheus Obfuscator' },
                    timestamp: new Date()
                }],
                files: [obfuscatedFile]
            });
        } else {
            let suggestion = getSuggestionFromError(errorOutput);

            await statusMsg.edit({
                embeds: [{
                    color: 0xff0000,
                    title: '❌ Obfuscation Failed',
                    fields: [
                        { name: 'Error:', value: `\`\`\`${errorOutput.substring(0, 800)}\`\`\`` },
                        { name: '💡 Saran:', value: suggestion }
                    ]
                }]
            });
        }

    } catch (err) {
        console.error('[Obfuscate] Error:', err);

        const errorEmbed = {
            color: 0xff0000,
            title: '❌ Error',
            description: `\`${err.message}\``,
            fields: [{
                name: '💡 Tips:',
                value: '• Pastikan file adalah Lua script valid\n• Coba dengan file yang lebih kecil\n• Gunakan `!test` untuk cek bot'
            }]
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

// ========== HELPER FUNCTIONS ==========

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
    while (code.length > 0 && (code.charCodeAt(0) === 63 || code.charCodeAt(0) < 32)) {
        code = code.substring(1);
    }
    
    return code;
}

function getSuggestionFromError(error) {
    if (!error) return '• Coba lagi atau gunakan preset berbeda';
    
    const errorLower = error.toLowerCase();
    
    if (errorLower.includes('unexpected') || errorLower.includes('syntax')) {
        return '• Script memiliki syntax error\n• Test di Roblox Studio dulu';
    }
    if (errorLower.includes('memory') || errorLower.includes('large')) {
        return '• File terlalu kompleks\n• Pecah jadi beberapa file';
    }
    if (errorLower.includes('timeout')) {
        return '• Proses timeout\n• Coba preset `minify`';
    }
    if (errorLower.includes('end') || errorLower.includes('eof')) {
        return '• Ada `end` yang kurang\n• Cek if/for/while/function';
    }
    
    return '• Pastikan script valid\n• Coba preset berbeda';
}

function cleanupFiles(...files) {
    for (const file of files) {
        try {
            if (file && fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        } catch (err) {
            console.error(`[Cleanup] Error:`, err.message);
        }
    }
}

// ========== OTHER HANDLERS ==========

async function handleExample(message) {
    const examples = `-- Contoh Script Roblox
print("Hello World")

local function test()
    return "OK"
end

for i = 1, 10 do
    print(i)
end

local Players = game:GetService("Players")
print(Players.LocalPlayer)`;

    const buffer = Buffer.from(examples, 'utf8');
    const file = new AttachmentBuilder(buffer, { name: 'example.lua' });

    await message.reply({
        embeds: [{
            color: 0x00ff00,
            title: '📝 Contoh Script',
            description: 'Download file contoh!'
        }],
        files: [file]
    });
}

async function handleTest(message) {
    const testCode = `print("Hello")
local x = 10
if x > 5 then print("OK") end`;

    const timestamp = Date.now();
    const testPath = path.join(PROMETHEUS_PATH, `test_${timestamp}.lua`);
    const testOutput = path.join(PROMETHEUS_PATH, `test_${timestamp}_out.lua`);

    const statusMsg = await message.reply({
        embeds: [{ color: 0xffff00, title: '⏳ Testing...', description: 'Mohon tunggu' }]
    });

    try {
        fs.writeFileSync(testPath, testCode);
        const { stdout } = await execAsync(
            `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset Minify "${testPath}" --out "${testOutput}" 2>&1`,
            { timeout: 30000 }
        );

        const success = fs.existsSync(testOutput) && fs.statSync(testOutput).size > 0;
        const output = success ? fs.readFileSync(testOutput, 'utf8').substring(0, 300) : stdout;

        await statusMsg.edit({
            embeds: [{
                color: success ? 0x00ff00 : 0xff0000,
                title: success ? '✅ Test Passed' : '❌ Test Failed',
                fields: [
                    { name: 'Input', value: `\`\`\`lua\n${testCode}\n\`\`\`` },
                    { name: 'Output', value: `\`\`\`lua\n${output}\n\`\`\`` }
                ]
            }]
        });
    } catch (err) {
        await statusMsg.edit({
            embeds: [{ color: 0xff0000, title: '❌ Error', description: `\`${err.message}\`` }]
        });
    } finally {
        cleanupFiles(testPath, testOutput);
    }
}

async function handleHelp(message) {
    await message.reply({
        embeds: [{
            color: 0x0099ff,
            title: '📖 Prometheus Bot',
            fields: [
                { name: 'Commands', value: '`!obfuscate` `!presets` `!example` `!test` `!help`' },
                { name: 'Presets', value: '`minify` `weak` `medium` `strong` `vm`' },
                { name: 'Format', value: '`.lua` atau `.txt` (max 5MB)' }
            ]
        }]
    });
}

async function handlePresets(message) {
    await message.reply({
        embeds: [{
            color: 0x9b59b6,
            title: '🎨 Presets',
            description: '`minify` - Perkecil\n`weak` - Ringan\n`medium` - Sedang\n`strong` - Kuat\n`vm` - Terkuat'
        }]
    });
}

// ========== ERROR HANDLING ==========

client.on('error', console.error);
process.on('unhandledRejection', console.error);

client.login(TOKEN);
