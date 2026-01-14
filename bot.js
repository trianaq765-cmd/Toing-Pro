const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

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

const PRESETS = {
    minify: 'Minify',
    weak: 'Weak', 
    medium: 'Medium',
    strong: 'Strong',
    vm: 'Vm'
};

client.on('ready', () => {
    console.log(`Bot ${client.user.tag} sudah online!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Command: !obfuscate [preset]
    if (message.content.startsWith('!obfuscate')) {
        
        if (message.attachments.size === 0) {
            return message.reply({
                embeds: [{
                    color: 0xff0000,
                    title: '❌ File Tidak Ditemukan',
                    description: 'Kirim file `.lua` untuk di-obfuscate!',
                    fields: [
                        {
                            name: 'Cara Pakai:',
                            value: '`!obfuscate [preset]` + attach file.lua'
                        },
                        {
                            name: 'Presets:',
                            value: '`minify`, `weak`, `medium`, `strong`, `vm`\nDefault: `minify`'
                        }
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

        try {
            const statusMsg = await message.reply({
                embeds: [{
                    color: 0xffff00,
                    title: '⏳ Processing',
                    description: `Downloading file...`,
                    fields: [
                        { name: 'File', value: attachment.name, inline: true },
                        { name: 'Size', value: `${(attachment.size / 1024).toFixed(2)} KB`, inline: true },
                        { name: 'Preset', value: preset, inline: true }
                    ]
                }]
            });

            const response = await fetch(attachment.url);
            let luaCode = await response.text();
            
            // Clean encoding
            luaCode = luaCode.replace(/^\uFEFF/, '');
            luaCode = luaCode.replace(/\r\n/g, '\n');
            luaCode = luaCode.trim();
            
            if (luaCode.startsWith('?') || luaCode.charCodeAt(0) === 63) {
                luaCode = luaCode.substring(1);
            }
            
            const timestamp = Date.now();
            const inputPath = `/app/Prometheus-master/temp_${timestamp}_input.lua`;
            const outputPath = `/app/Prometheus-master/temp_${timestamp}_output.lua`;
            const validatePath = `/app/Prometheus-master/temp_${timestamp}_validate.lua`;
            
            fs.writeFileSync(inputPath, luaCode, 'utf8');
            
            await statusMsg.edit({
                embeds: [{
                    color: 0xffff00,
                    title: '⏳ Processing',
                    description: `Validating Lua syntax...`
                }]
            });
            
            // FIXED: Validasi dengan cara yang benar
            const validateScript = `
local f = assert(loadfile("${inputPath}"))
print("OK")
`;
            fs.writeFileSync(validatePath, validateScript);
            
            exec(`lua5.1 ${validatePath}`, async (syntaxError, syntaxStdout, syntaxStderr) => {
                // Cleanup validate script
                if (fs.existsSync(validatePath)) fs.unlinkSync(validatePath);
                
                if (syntaxError || syntaxStderr) {
                    await statusMsg.edit({
                        embeds: [{
                            color: 0xff0000,
                            title: '❌ Syntax Error',
                            description: 'File Lua memiliki error syntax!',
                            fields: [
                                {
                                    name: 'Error:',
                                    value: `\`\`\`${syntaxStderr || syntaxError.message}\`\`\``.substring(0, 1024)
                                },
                                {
                                    name: 'Tips:',
                                    value: '• Pastikan semua `if`, `for`, `while`, `function` memiliki `end`\n• Cek tanda kutip tidak ada yang kurang\n• Gunakan `!example` untuk lihat contoh yang benar'
                                }
                            ]
                        }]
                    });
                    
                    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                    return;
                }
                
                await statusMsg.edit({
                    embeds: [{
                        color: 0xffff00,
                        title: '⏳ Processing',
                        description: `Obfuscating with preset: ${preset}...`
                    }]
                });
                
                const command = `cd /app/Prometheus-master && lua5.1 cli.lua --preset ${preset} temp_${timestamp}_input.lua --out temp_${timestamp}_output.lua 2>&1`;
                
                exec(command, async (error, stdout, stderr) => {
                    console.log(`[Prometheus] stdout: ${stdout}`);
                    console.log(`[Prometheus] stderr: ${stderr}`);
                    
                    if (error || !fs.existsSync(outputPath)) {
                        const fallbackCommand = `cd /app/Prometheus-master && lua5.1 cli.lua temp_${timestamp}_input.lua --out temp_${timestamp}_output.lua 2>&1`;
                        
                        exec(fallbackCommand, async (error2, stdout2, stderr2) => {
                            if (error2 || !fs.existsSync(outputPath)) {
                                await statusMsg.edit({
                                    embeds: [{
                                        color: 0xff0000,
                                        title: '❌ Obfuscation Failed',
                                        description: 'Tidak dapat meng-obfuscate file!',
                                        fields: [
                                            {
                                                name: 'Error:',
                                                value: `\`\`\`${stderr2 || stderr || error2?.message || error?.message}\`\`\``.substring(0, 1024)
                                            }
                                        ]
                                    }]
                                });
                                
                                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                                return;
                            }
                            
                            await sendResult('Default');
                        });
                        return;
                    }
                    
                    await sendResult(preset);
                });
                
                async function sendResult(usedPreset) {
                    try {
                        const stats = fs.statSync(outputPath);
                        const originalSize = fs.statSync(inputPath).size;
                        
                        const obfuscatedFile = new AttachmentBuilder(outputPath, { 
                            name: `obfuscated_${attachment.name}` 
                        });
                        
                        await statusMsg.edit({ 
                            embeds: [{
                                color: 0x00ff00,
                                title: '✅ Obfuscation Berhasil!',
                                fields: [
                                    { name: 'Original Size', value: `${(originalSize / 1024).toFixed(2)} KB`, inline: true },
                                    { name: 'Obfuscated Size', value: `${(stats.size / 1024).toFixed(2)} KB`, inline: true },
                                    { name: 'Preset Used', value: usedPreset, inline: true }
                                ],
                                footer: {
                                    text: 'Prometheus Obfuscator'
                                },
                                timestamp: new Date()
                            }],
                            files: [obfuscatedFile] 
                        });
                        
                    } catch (err) {
                        console.error('[SendResult] Error:', err);
                        await statusMsg.edit('❌ Error saat mengirim file hasil');
                    } finally {
                        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                    }
                }
            });

        } catch (err) {
            console.error('[Main] Error:', err);
            await message.reply({
                embeds: [{
                    color: 0xff0000,
                    title: '❌ Error',
                    description: err.message
                }]
            });
        }
    }

    // Command: !example
    if (message.content === '!example') {
        const examples = `-- ✅ CONTOH 1: Print Sederhana
print("Hello World")

-- ✅ CONTOH 2: Variables
local name = "Player"
local health = 100
print(name .. " has " .. health .. " HP")

-- ✅ CONTOH 3: If Statement (HARUS ADA END!)
local x = 10
if x > 5 then
    print("X lebih besar dari 5")
end

-- ✅ CONTOH 4: Function (HARUS ADA END!)
function greet(name)
    return "Hello, " .. name
end
print(greet("World"))

-- ✅ CONTOH 5: Loop (HARUS ADA END!)
for i = 1, 5 do
    print("Loop ke-" .. i)
end

-- ✅ CONTOH 6: Table
local player = {
    name = "John",
    level = 50,
    health = 100
}
print(player.name)

-- ❌ CONTOH SALAH 1: Kurang END
if x > 5 then
    print("Test")
-- KURANG END DISINI!

-- ❌ CONTOH SALAH 2: Kutip tidak seimbang
local text = "Hello World

-- ❌ CONTOH SALAH 3: Karakter aneh di awal
?print("Hello")`;

        const buffer = Buffer.from(examples, 'utf8');
        const file = new AttachmentBuilder(buffer, { name: 'contoh_lua.lua' });

        await message.reply({
            embeds: [{
                color: 0x00ff00,
                title: '📝 Contoh Syntax Lua yang Benar',
                description: 'Download file dibawah untuk melihat contoh lengkap!',
                fields: [
                    {
                        name: '✅ Yang Benar:',
                        value: '• Setiap `if`, `for`, `while`, `function` harus diakhiri `end`\n• Tanda kutip harus seimbang `"..."` atau `\'...\'`\n• Tidak ada karakter aneh di awal file'
                    },
                    {
                        name: '💡 Tips:',
                        value: '• Test script kamu di Roblox Studio dulu\n• Atau gunakan online Lua compiler: https://www.lua.org/cgi-bin/demo'
                    }
                ]
            }],
            files: [file]
        });
    }

    // Command: !test
    if (message.content === '!test') {
        const testCode = `print("Hello World")
local x = 10
if x > 5 then
    print("X is greater than 5")
end`;
        
        const testPath = '/app/Prometheus-master/test_sample.lua';
        const testOutput = '/app/Prometheus-master/test_sample_out.lua';
        
        fs.writeFileSync(testPath, testCode);
        
        exec(`cd /app/Prometheus-master && lua5.1 cli.lua --preset Minify test_sample.lua --out test_sample_out.lua`, async (error, stdout, stderr) => {
            let status = '❌ Failed';
            let outputContent = 'No output generated';
            
            if (fs.existsSync(testOutput)) {
                status = '✅ Success';
                outputContent = fs.readFileSync(testOutput, 'utf8').substring(0, 500);
                fs.unlinkSync(testOutput);
            }
            
            if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
            
            await message.reply({
                embeds: [{
                    color: status === '✅ Success' ? 0x00ff00 : 0xff0000,
                    title: 'Prometheus Test',
                    fields: [
                        { name: 'Status', value: status },
                        { name: 'Input', value: `\`\`\`lua\n${testCode}\n\`\`\`` },
                        { name: 'Output', value: `\`\`\`lua\n${outputContent}\n\`\`\`` }
                    ]
                }]
            });
        });
    }

    // Command: !help
    if (message.content === '!help') {
        await message.reply({
            embeds: [{
                color: 0x0099ff,
                title: '📖 Prometheus Obfuscator Bot',
                description: 'Bot untuk obfuscate script Lua menggunakan Prometheus',
                fields: [
                    {
                        name: '📌 Commands',
                        value: `\`!obfuscate [preset]\` - Obfuscate file Lua
\`!example\` - Download contoh syntax yang benar
\`!test\` - Test Prometheus installation
\`!help\` - Tampilkan bantuan`
                    },
                    {
                        name: '🎨 Presets',
                        value: `\`minify\` - Minify code (paling ringan)
\`weak\` - Obfuscation lemah
\`medium\` - Obfuscation sedang
\`strong\` - Obfuscation kuat
\`vm\` - Virtual Machine (paling kuat)`
                    },
                    {
                        name: '💡 Contoh',
                        value: `\`!obfuscate\` + attach file.lua
\`!obfuscate strong\` + attach file.lua`
                    }
                ],
                footer: {
                    text: 'Max file size: 5MB | Format: .lua'
                }
            }]
        });
    }
});

client.on('error', console.error);
process.on('unhandledRejection', console.error);

client.login(TOKEN);
