const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
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

    if (!attachment.name.endsWith('.lua')) {
        return message.reply({
            embeds: [{
                color: 0xff0000,
                title: '❌ Format File Salah',
                description: 'File harus berformat `.lua`!'
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
        // STEP 1: DOWNLOAD FILE DULU SEBELUM REPLY!
        // ============================================
        // Ini mencegah error 404 jika user hapus pesan
        
        const downloadUrl = attachment.proxyURL || attachment.url;
        
        const response = await fetch(downloadUrl, {
            headers: {
                'User-Agent': 'DiscordBot'
            }
        });

        if (!response.ok) {
            return message.reply({
                embeds: [{
                    color: 0xff0000,
                    title: '❌ Download Failed',
                    description: `Tidak bisa download file (Status: ${response.status})`,
                    fields: [
                        {
                            name: '💡 Kemungkinan Penyebab:',
                            value: '• Jangan hapus pesan sebelum proses selesai!\n• File mungkin sudah expired\n• Coba kirim ulang file'
                        }
                    ]
                }]
            });
        }

        luaCode = await response.text();
        luaCode = cleanLuaCode(luaCode);

        // Validasi basic - file tidak kosong
        if (!luaCode || luaCode.length < 5) {
            return message.reply({
                embeds: [{
                    color: 0xff0000,
                    title: '❌ File Kosong',
                    description: 'File Lua tidak boleh kosong atau terlalu pendek!'
                }]
            });
        }

        // Save file SEGERA setelah download
        fs.writeFileSync(inputPath, luaCode, 'utf8');

        // ============================================
        // STEP 2: BARU KIRIM STATUS MESSAGE
        // ============================================
        
        statusMsg = await message.reply({
            embeds: [{
                color: 0xffff00,
                title: '⏳ Processing',
                description: `Obfuscating with preset: **${preset}**...`,
                fields: [
                    { name: 'File', value: attachment.name, inline: true },
                    { name: 'Size', value: `${(attachment.size / 1024).toFixed(2)} KB`, inline: true },
                    { name: 'Preset', value: preset, inline: true }
                ],
                footer: { text: '⚠️ Jangan hapus pesan sampai proses selesai!' }
            }]
        });

        // ============================================
        // STEP 3: RUN PROMETHEUS
        // ============================================
        
        let success = false;
        let usedPreset = preset;
        let errorOutput = '';

        // Try dengan preset yang dipilih
        try {
            const command = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset ${preset} "${inputPath}" --out "${outputPath}" 2>&1`;
            const { stdout, stderr } = await execAsync(command, { timeout: 120000 });

            console.log(`[Prometheus] stdout: ${stdout}`);
            if (stderr) console.log(`[Prometheus] stderr: ${stderr}`);

            if (fs.existsSync(outputPath)) {
                const outputSize = fs.statSync(outputPath).size;
                if (outputSize > 0) {
                    success = true;
                } else {
                    errorOutput = 'Output file is empty';
                }
            } else {
                errorOutput = stdout || stderr || 'No output file generated';
            }
        } catch (err) {
            console.log(`[Prometheus] Error with preset ${preset}:`, err.message);
            errorOutput = err.stderr || err.message;
        }

        // Fallback ke default jika gagal
        if (!success) {
            try {
                console.log('[Prometheus] Trying fallback without preset...');
                const fallbackCommand = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua "${inputPath}" --out "${outputPath}" 2>&1`;
                const { stdout, stderr } = await execAsync(fallbackCommand, { timeout: 120000 });

                if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                    success = true;
                    usedPreset = 'Default (Fallback)';
                } else {
                    errorOutput = stdout || stderr || errorOutput;
                }
            } catch (err) {
                errorOutput = err.stderr || err.message || errorOutput;
            }
        }

        // ============================================
        // STEP 4: SEND RESULT
        // ============================================

        if (success) {
            const originalSize = fs.statSync(inputPath).size;
            const obfuscatedSize = fs.statSync(outputPath).size;

            const obfuscatedFile = new AttachmentBuilder(outputPath, {
                name: `obfuscated_${attachment.name}`
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
                    footer: { text: 'Prometheus Obfuscator | Support Roblox Luau 2025' },
                    timestamp: new Date()
                }],
                files: [obfuscatedFile]
            });
        } else {
            // Parse error untuk pesan yang lebih jelas
            let errorMessage = errorOutput.substring(0, 800);
            let suggestion = getSuggestionFromError(errorOutput);

            await statusMsg.edit({
                embeds: [{
                    color: 0xff0000,
                    title: '❌ Obfuscation Failed',
                    description: 'Prometheus tidak dapat memproses file ini.',
                    fields: [
                        { name: 'Error:', value: `\`\`\`${errorMessage}\`\`\`` },
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
            description: err.message,
            fields: [
                {
                    name: '💡 Tips:',
                    value: '• Jangan hapus pesan sebelum proses selesai\n• Pastikan file valid\n• Coba lagi dengan `!obfuscate`'
                }
            ]
        };

        if (statusMsg) {
            await statusMsg.edit({ embeds: [errorEmbed] }).catch(() => {});
        } else {
            await message.reply({ embeds: [errorEmbed] }).catch(() => {});
        }
    } finally {
        // Cleanup
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
    const errorLower = error.toLowerCase();
    
    if (errorLower.includes('unexpected symbol') || errorLower.includes('syntax error')) {
        return '• Script memiliki syntax error\n• Cek script di Roblox Studio dulu';
    }
    if (errorLower.includes('memory') || errorLower.includes('too large')) {
        return '• File terlalu besar/kompleks\n• Coba pecah jadi beberapa file';
    }
    if (errorLower.includes('timeout')) {
        return '• Proses terlalu lama\n• Coba dengan preset yang lebih ringan (minify)';
    }
    if (errorLower.includes('end') || errorLower.includes('eof')) {
        return '• Kemungkinan ada `end` yang kurang\n• Cek semua if/for/while/function';
    }
    
    return '• Pastikan script valid\n• Test di Roblox Studio\n• Coba preset berbeda';
}

function cleanupFiles(...files) {
    for (const file of files) {
        try {
            if (file && fs.existsSync(file)) {
                fs.unlinkSync(file);
                console.log(`[Cleanup] Deleted: ${file}`);
            }
        } catch (err) {
            console.error(`[Cleanup] Failed to delete ${file}:`, err.message);
        }
    }
}

// ========== OTHER COMMAND HANDLERS ==========

async function handleExample(message) {
    const examples = `-- =============================================
-- CONTOH SCRIPT ROBLOX YANG BISA DI-OBFUSCATE
-- =============================================

-- Contoh 1: Basic
print("Hello World")

-- Contoh 2: Variables
local name = "Player"
local health = 100
print(name .. " has " .. health .. " HP")

-- Contoh 3: Function
local function greet(playerName)
    return "Hello, " .. playerName
end
print(greet("World"))

-- Contoh 4: Roblox Services
local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer

-- Contoh 5: Events
Players.PlayerAdded:Connect(function(player)
    print(player.Name .. " joined!")
end)

-- Contoh 6: Loop
for i = 1, 10 do
    print("Number: " .. i)
end

-- Contoh 7: Table
local data = {
    name = "Test",
    value = 123
}
print(data.name)`;

    const buffer = Buffer.from(examples, 'utf8');
    const file = new AttachmentBuilder(buffer, { name: 'contoh_roblox.lua' });

    await message.reply({
        embeds: [{
            color: 0x00ff00,
            title: '📝 Contoh Script Roblox',
            description: 'Download file untuk melihat contoh lengkap!',
            fields: [
                { name: '✅ Support', value: 'Roblox Luau 2025 syntax didukung!' },
                { name: '⚠️ Penting', value: 'Jangan hapus pesan sebelum proses selesai!' }
            ]
        }],
        files: [file]
    });
}

async function handleTest(message) {
    const testCode = `print("Hello World")
local x = 10
if x > 5 then
    print("Success!")
end`;

    const timestamp = Date.now();
    const testPath = path.join(PROMETHEUS_PATH, `test_${timestamp}.lua`);
    const testOutput = path.join(PROMETHEUS_PATH, `test_${timestamp}_out.lua`);

    const statusMsg = await message.reply({
        embeds: [{
            color: 0xffff00,
            title: '⏳ Testing Prometheus...',
            description: 'Mohon tunggu...'
        }]
    });

    try {
        fs.writeFileSync(testPath, testCode);

        const command = `cd "${PROMETHEUS_PATH}" && lua5.1 cli.lua --preset Minify "${testPath}" --out "${testOutput}" 2>&1`;
        const { stdout, stderr } = await execAsync(command, { timeout: 30000 });

        let status, outputContent, color;

        if (fs.existsSync(testOutput) && fs.statSync(testOutput).size > 0) {
            status = '✅ Success';
            outputContent = fs.readFileSync(testOutput, 'utf8').substring(0, 400);
            color = 0x00ff00;
        } else {
            status = '❌ Failed';
            outputContent = stdout || stderr || 'No output';
            color = 0xff0000;
        }

        await statusMsg.edit({
            embeds: [{
                color: color,
                title: '🧪 Prometheus Test',
                fields: [
                    { name: 'Status', value: status },
                    { name: 'Input', value: `\`\`\`lua\n${testCode}\n\`\`\`` },
                    { name: 'Output', value: `\`\`\`lua\n${outputContent}\n\`\`\`` }
                ]
            }]
        });

    } catch (err) {
        await statusMsg.edit({
            embeds: [{
                color: 0xff0000,
                title: '❌ Test Failed',
                description: `\`\`\`${err.message}\`\`\``
            }]
        });
    } finally {
        cleanupFiles(testPath, testOutput);
    }
}

async function handleHelp(message) {
    await message.reply({
        embeds: [{
            color: 0x0099ff,
            title: '📖 Prometheus Obfuscator Bot',
            description: '**✅ Support Roblox Luau 2025!**',
            fields: [
                {
                    name: '📌 Commands',
                    value: '`!obfuscate [preset]` - Obfuscate file\n`!presets` - Info presets\n`!example` - Contoh script\n`!test` - Test bot\n`!help` - Bantuan'
                },
                {
                    name: '🎨 Presets',
                    value: '`minify` `weak` `medium` `strong` `vm`'
                },
                {
                    name: '⚠️ PENTING',
                    value: '**Jangan hapus pesan sebelum proses selesai!**\nIni akan menyebabkan error 404.'
                }
            ],
            footer: { text: 'Max: 5MB | Format: .lua' }
        }]
    });
}

async function handlePresets(message) {
    await message.reply({
        embeds: [{
            color: 0x9b59b6,
            title: '🎨 Prometheus Presets',
            fields: [
                { name: '📦 Minify', value: 'Perkecil ukuran, hapus whitespace' },
                { name: '🔓 Weak', value: 'Obfuscation dasar' },
                { name: '🔒 Medium', value: 'String encryption + control flow' },
                { name: '🔐 Strong', value: 'Multiple layers, anti-debug' },
                { name: '🛡️ VM', value: 'Virtual Machine, paling kuat' }
            ]
        }]
    });
}

// ========== ERROR HANDLING ==========

client.on('error', console.error);
process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);

client.login(TOKEN);
