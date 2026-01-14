// ================================================================
// 🕵️ SUPER SCANNER (FIXED)
// ================================================================
async function handleScan(message, args) {
    if (!JNKIE_API_KEY) return message.reply('❌ API Key belum di-set');

    const filter = args[0] ? args[0].toLowerCase() : null;
    const statusMsg = await message.reply(`🕵️ **Scanning...** ${filter ? `(Filter: ${filter})` : ''}`);

    // Daftar kata kunci dasar
    const keywords = [
        'script', 'loader', 'file', 'product', 'app', 'user', 'me', 
        'service', 'key', 'integration', 'provider', 'webhook', 
        'config', 'setting', 'variable', 'secret', 'log', 'analytic',
        'whitelist', 'blacklist', 'hwid', 'ip', 'session'
    ];

    let targets = [];

    keywords.forEach(w => {
        // 1. Root endpoints (Singular & Plural)
        targets.push(`/${w}`);
        targets.push(`/${w}s`);
        
        // 2. Nested endpoints (jika ada Service ID)
        if (JNKIE_SERVICE_ID) {
            targets.push(`/services/${JNKIE_SERVICE_ID}/${w}`);
            targets.push(`/services/${JNKIE_SERVICE_ID}/${w}s`);
            
            // Coba variasi 'service' (singular)
            targets.push(`/service/${JNKIE_SERVICE_ID}/${w}`);
            targets.push(`/service/${JNKIE_SERVICE_ID}/${w}s`);
        }
    });

    // 3. Tambahkan endpoint spesifik yang sering dipakai
    targets.push('/services');
    targets.push('/providers');
    targets.push('/integrations');
    
    if (JNKIE_SERVICE_ID) {
        targets.push(`/services/${JNKIE_SERVICE_ID}/upload`);
        targets.push(`/services/${JNKIE_SERVICE_ID}/download`);
        targets.push(`/services/${JNKIE_SERVICE_ID}/obfuscate`);
    }

    // Filter jika user minta spesifik
    if (filter) {
        targets = targets.filter(t => t.includes(filter));
    }

    // Hapus duplikat
    targets = [...new Set(targets)];

    let found = [];
    const batchSize = 10; // Batch kecil agar tidak timeout

    for (let i = 0; i < targets.length; i += batchSize) {
        const batch = targets.slice(i, i + batchSize);
        const progress = Math.round((i / targets.length) * 100);
        
        await statusMsg.edit(`🕵️ Scanning... ${progress}% (${found.length} found)\nChecking: \`${batch[0]}\`...`);

        const promises = batch.map(path => jnkieRequest('GET', path).then(res => ({ path, ...res })));
        const results = await Promise.all(promises);

        results.forEach(res => {
            // Kita cari status code SELAIN 404
            // 408 (Timeout) & 523 (Origin Unreachable) biasanya berarti endpoint SALAH atau Server Down
            // Kita hanya simpan yang "hidup" (2xx, 401, 403, 405)
            if (res.statusCode !== 404 && res.statusCode !== 408 && res.statusCode !== 523 && res.statusCode !== 0) {
                found.push({ path: res.path, status: res.statusCode });
            }
        });
        
        // Delay kecil
        await new Promise(r => setTimeout(r, 200));
    }

    if (found.length === 0) {
        await statusMsg.edit('❌ **Scan Selesai:** Tidak ada endpoint yang ditemukan.');
    } else {
        // Sort by status code (200 first)
        found.sort((a, b) => {
            if (a.status === 200) return -1;
            if (b.status === 200) return 1;
            return 0;
        });

        const list = found.map(f => {
            let icon = '❓';
            let note = '';
            
            if (f.status >= 200 && f.status < 300) { icon = '✅'; note = 'Active'; }
            else if (f.status === 401) { icon = '🔒'; note = 'Auth Required'; }
            else if (f.status === 403) { icon = '🚫'; note = 'Forbidden'; }
            else if (f.status === 405) { icon = '✋'; note = 'Method Not Allowed (Try POST)'; }
            else if (f.status === 500) { icon = '🔥'; note = 'Server Error'; }
            
            return `${icon} \`${f.path}\` (${f.status}) ${note ? `- ${note}` : ''}`;
        }).join('\n');

        await statusMsg.edit({
            content: null,
            embeds: [{
                color: 0x2ecc71,
                title: '🕵️ Scan Results',
                description: list.substring(0, 4000),
                footer: { text: `Total Scanned: ${targets.length} | Found: ${found.length}` },
                timestamp: new Date()
            }]
        });
    }
}
