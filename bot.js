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

client.on('ready', () => {
    console.log(`Bot ${client.user.tag} sudah online!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content.startsWith('!obfuscate')) {
        
        if (message.attachments.size === 0) {
            return message.reply('❌ Kirim file `.lua` untuk di-obfuscate!');
        }

        const attachment = message.attachments.first();
        
        if (!attachment.name.endsWith('.lua')) {
            return message.reply('❌ File harus berformat `.lua`!');
        }

        try {
            const statusMsg = await message.reply('⏳ Sedang memproses obfuscation...');

            const response = await fetch(attachment.url);
            const luaCode = await response.text();
            
            // Simpan file di folder Prometheus
            const inputPath = '/app/Prometheus-master/temp_input.lua';
            const outputPath = '/app/Prometheus-master/temp_output.lua';
            
            fs.writeFileSync(inputPath, luaCode);

            // Jalankan dari dalam folder Prometheus
            const command = `cd /app/Prometheus-master && lua5.1 cli.lua --preset Medium temp_input.lua --out temp_output.lua`;
            
            exec(command, async (error, stdout, stderr) => {
                console.log('stdout:', stdout);
                console.log('stderr:', stderr);
                
                if (error) {
                    console.error('Error:', error);
                    await statusMsg.edit(`❌ Gagal obfuscate:\n\`\`\`${stderr || error.message}\`\`\``);
                    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                    return;
                }

                // Check output file
                if (!fs.existsSync(outputPath)) {
                    await statusMsg.edit('❌ File output tidak terbuat.');
                    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                    return;
                }

                const obfuscatedFile = new AttachmentBuilder(outputPath, { 
                    name: `obfuscated_${attachment.name}` 
                });
                
                await statusMsg.edit({ 
                    content: '✅ Berhasil di-obfuscate!', 
                    files: [obfuscatedFile] 
                });

                // Cleanup
                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            });

        } catch (err) {
            console.error('Catch error:', err);
            await message.reply('❌ Terjadi error: ' + err.message);
        }
    }

    // Test command untuk debug
    if (message.content === '!testcli') {
        exec('cd /app/Prometheus-master && lua5.1 cli.lua --help', (error, stdout, stderr) => {
            message.reply(`\`\`\`${stdout || stderr || error?.message || 'No output'}\`\`\``);
        });
    }

    if (message.content === '!test') {
        exec('ls -la /app/Prometheus-master/', (error, stdout, stderr) => {
            message.reply(`\`\`\`${stdout || stderr || error}\`\`\``);
        });
    }

    if (message.content === '!help') {
        message.reply(`
**📖 Prometheus Bot Commands**
\`!obfuscate\` + attach file.lua → Obfuscate script Lua
\`!test\` → Cek folder Prometheus
\`!testcli\` → Test Prometheus CLI
\`!help\` → Tampilkan bantuan
        `);
    }
});

client.login(TOKEN);
