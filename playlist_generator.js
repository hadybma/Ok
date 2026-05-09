const fs = require('fs');
const { execSync } = require('child_process');

async function generatePlaylist() {
    const HF_BASE_URL = "https://srhady-sports-transcoder.hf.space/play.m3u8?id=";
    const BRAND_SUFFIX = "_Developed_by_Hady_join_tg_livesportsplay";

    try {
        console.log("🚀 Starting Paramount Auto Playlist Generator...");
        
        // 1. Reading local WASM Engine (No more downloading/blocking issues!)
        if (!fs.existsSync('codec.wasm')) {
            throw new Error("codec.wasm file not found! Please upload it to the repository root.");
        }
        
        const wasmBuffer = fs.readFileSync('codec.wasm');
        const wasmModule = await WebAssembly.instantiate(wasmBuffer, {});
        const n = wasmModule.instance.exports;
        console.log("[+] Local Wasm engine loaded successfully!");

        // 2. Fetch Data from Source
        console.log("[*] Fetching live schedule...");
        const curlCmd = `curl -s 'https://data.miopks.workers.dev/?p=paramount_schedule' \
            -H 'origin: https://streamcorner.vu' \
            -H 'referer: https://streamcorner.vu/' \
            -H 'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'`;
        
        let encryptedData = execSync(curlCmd).toString().trim();
        if (encryptedData.startsWith('"')) encryptedData = encryptedData.slice(1, -1);
        if (encryptedData.length < 1000) throw new Error("Received empty or invalid data!");

        // 3. Decrypting Data
        console.log("[*] Decrypting payload...");
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const alloc = (str) => {
            const buf = encoder.encode(str);
            const ptr = n.a(buf.length);
            new Uint8Array(n.memory.buffer, ptr, buf.length).set(buf);
            return { ptr, len: buf.length };
        };

        const input = alloc(encryptedData);
        if (n.d1(input.ptr, input.len) !== 1) throw new Error("Wasm decryption failed!");
        const decryptedJson = decoder.decode(new Uint8Array(n.memory.buffer, n.rp(), n.rl()).slice());

        // 4. Transforming to JSON & M3U
        console.log("[*] Filtering Live & Upcoming matches...");
        const rawData = JSON.parse(decryptedJson);
        let finalEvents = [];
        let m3uContent = "#EXTM3U\n# Developed by Hady & join tg channel t.me/livesportsplay\n\n";

        Object.keys(rawData).forEach(key => {
            let section = rawData[key];
            if (section.category && section.category.toLowerCase().includes("live & upcoming")) {
                section.events.forEach(event => {
                    if (event.dai_stream_key) {
                        const streamUrl = `${HF_BASE_URL}${event.dai_stream_key}${BRAND_SUFFIX}`;
                        event.stream_url = streamUrl;
                        finalEvents.push(event);

                        const title = event.title || event.on_now_title || 'Paramount Live Event';
                        const logo = event.logo || event.thumbnail || '';
                        
                        m3uContent += `#EXTINF:-1 tvg-logo="${logo}" group-title="Paramount Live", ${title}\n`;
                        m3uContent += `${streamUrl}\n\n`;
                    }
                });
            }
        });

        // 5. Saving output files
        fs.writeFileSync('paramount_live.json', JSON.stringify(finalEvents, null, 2));
        fs.writeFileSync('playlist.m3u', m3uContent);

        console.log(`✅ Success! Saved ${finalEvents.length} live matches to playlist.m3u and paramount_live.json.`);

    } catch (err) {
        console.error("❌ Fatal Error:", err.message);
        process.exit(1);
    }
}

generatePlaylist();
