const fs = require('fs');
const { execSync } = require('child_process');

async function generatePlaylist() {
    const HF_BASE_URL = "https://srhady-sports-transcoder.hf.space/play.m3u8?id=";
    const SUFFIX = "_Developed_by_Hady_join_tg_livesportsplay";

    try {
        console.log("🚀 Scraping started...");
        
        // 1. WASM Engine Setup
        if (!fs.existsSync('codec.wasm')) {
            execSync(`curl -s "https://streamcorner.vu/assets/QrCgJwO-.wasm" -o codec.wasm`);
        }
        const wasmBuffer = fs.readFileSync('codec.wasm');
        const wasmModule = await WebAssembly.instantiate(wasmBuffer, {});
        const n = wasmModule.instance.exports;

        // 2. Fetch Encrypted Data
        const curlCmd = `curl -s 'https://data.miopks.workers.dev/?p=paramount_schedule' -H 'origin: https://streamcorner.vu' -H 'referer: https://streamcorner.vu/' -H 'user-agent: Mozilla/5.0'`;
        let encryptedData = execSync(curlCmd).toString().trim();
        if (encryptedData.startsWith('"')) encryptedData = encryptedData.slice(1, -1);

        // 3. Wasm Decryption
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const alloc = (str) => {
            const buf = encoder.encode(str);
            const ptr = n.a(buf.length);
            new Uint8Array(n.memory.buffer, ptr, buf.length).set(buf);
            return { ptr, len: buf.length };
        };
        const input = alloc(encryptedData);
        if (n.d1(input.ptr, input.len) !== 1) throw new Error("Decryption failed");
        const decryptedJson = decoder.decode(new Uint8Array(n.memory.buffer, n.rp(), n.rl()).slice());

        // 4. Filtering "Live & Upcoming" & Transforming
        const rawData = JSON.parse(decryptedJson);
        let finalEvents = [];
        let m3uContent = "#EXTM3U\n# Developed by Hady & join tg channel t.me/livesportsplay\n\n";

        Object.keys(rawData).forEach(key => {
            let section = rawData[key];
            // শুধু Live & Upcoming সেকশন ধরবে
            if (section.category && section.category.toLowerCase().includes("live & upcoming")) {
                section.events.forEach(event => {
                    if (event.dai_stream_key) {
                        // ডাইনামিক স্ট্রিম ইউআরএল তৈরি
                        const streamUrl = `${HF_BASE_URL}${event.dai_stream_key}${SUFFIX}`;
                        event.stream_url = streamUrl; // JSON এ নতুন ফিল্ড যোগ
                        finalEvents.push(event);

                        // M3U ফরম্যাটিং (Logo + Title + Link)
                        m3uContent += `#EXTINF:-1 tvg-logo="${event.logo || event.thumbnail}" group-title="Paramount Live", ${event.title}\n`;
                        m3uContent += `${streamUrl}\n\n`;
                    }
                });
            }
        });

        // 5. Saving Files
        fs.writeFileSync('paramount_live.json', JSON.stringify(finalEvents, null, 2));
        fs.writeFileSync('playlist.m3u', m3uContent);

        console.log(`✅ Success! ${finalEvents.length} matches added to playlist.`);

    } catch (err) {
        console.error("❌ Error:", err.message);
        process.exit(1);
    }
}

generatePlaylist();
