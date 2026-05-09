const fs = require('fs');
const { execSync } = require('child_process');

async function generatePlaylist() {
    // ব্রান্ডিং রিমুভ করা হয়েছে, এখন একদম ক্লিন লিংক!
    const HF_BASE_URL = "https://srhady-sports-transcoder.hf.space/play.m3u8?id=";

    console.log("🚀 Paramount+ Auto Playlist Generator শুরু হচ্ছে...");

    try {
        // ১. Local WASM ইঞ্জিন রেডি করা
        if (!fs.existsSync('codec.wasm')) {
            throw new Error("codec.wasm file not found! Please upload it to the repository.");
        }
        const wasmBuffer = fs.readFileSync('codec.wasm');
        const wasmModule = await WebAssembly.instantiate(wasmBuffer, {});
        const n = wasmModule.instance.exports;
        console.log("[+] Local Wasm engine রেডি!");

        // ২. ডাইরেক্ট টার্মিনাল কমান্ড সিমুলেট করার জন্য Bash স্ক্রিপ্ট তৈরি
        console.log("[*] Step 2: Fetching data (Terminal Simulation Mode)...");
        const bashScript = `#!/bin/bash
curl -s 'https://data.miopks.workers.dev/?p=paramount_schedule' \\
  -H 'accept: application/json' \\
  -H 'accept-language: en-US' \\
  -H 'origin: https://streamcorner.vu' \\
  -H 'referer: https://streamcorner.vu/' \\
  -H 'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Unique/96.7.6401.61' \\
  -o paramount_enc.txt`;

        fs.writeFileSync('fetch_temp.sh', bashScript, 'utf8');

        // এবার স্ক্রিপ্টটা রান করছি
        execSync('bash fetch_temp.sh');

        // ৩. ফাইল থেকে ডাটা পড়া
        let encryptedData = fs.readFileSync('paramount_enc.txt', 'utf8').trim();
        if (encryptedData.startsWith('"') && encryptedData.endsWith('"')) {
            encryptedData = encryptedData.slice(1, -1);
        }

        if (encryptedData.length < 1000) {
            throw new Error(`ডাটা আসেনি! ফাইলের সাইজ মাত্র ${encryptedData.length} বাইটস।`);
        }
        console.log(`[+] ডাটা ডাউনলোড সাকসেস! (${(encryptedData.length/1024).toFixed(2)} KB)`);

        // ৪. ডিক্রিপশন ম্যাজিক
        console.log("[*] Step 3: Decrypting data...");
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        function allocateString(str) {
            const encoded = encoder.encode(str);
            const ptr = n.a(encoded.length);
            const memory = new Uint8Array(n.memory.buffer, ptr, encoded.length);
            memory.set(encoded);
            return { ptr, len: encoded.length };
        }

        function readString(ptr, len) {
            const memory = new Uint8Array(n.memory.buffer, ptr, len).slice();
            return decoder.decode(memory);
        }

        const input = allocateString(encryptedData);
        const resultStatus = n.d1(input.ptr, input.len);

        if (resultStatus !== 1) throw new Error("Wasm decryption failed!");

        const decryptedJson = readString(n.rp(), n.rl());
        if(n.f) n.f(input.ptr, input.len, input.len);

        // ৫. JSON ও M3U8 প্লেলিস্ট জেনারেট করা
        console.log("[*] Step 4: Filtering Live Matches & Creating Playlist...");
        const rawData = JSON.parse(decryptedJson);
        let finalEvents = [];
        let m3uContent = "#EXTM3U\n# Developed by Hady & join tg channel t.me/livesportsplay\n\n";

        Object.keys(rawData).forEach(key => {
            let section = rawData[key];
            
            // শুধু Live & Upcoming সেকশন ধরবে
            if (section.category && section.category.toLowerCase().includes("live & upcoming")) {
                section.events.forEach(event => {
                    
                    // আপকামিং ম্যাচের কি (key) না থাকলেও JSON এ যুক্ত করার জন্য stream_url ভ্যালু সেট করে নিচ্ছি
                    if (event.dai_stream_key) {
                        event.stream_url = `${HF_BASE_URL}${event.dai_stream_key}`;
                    } else {
                        event.stream_url = ""; 
                    }
                    
                    // সব ইভেন্ট (Live + Upcoming) JSON এর জন্য পুশ করা হলো
                    finalEvents.push(event);

                    // M3U প্লেলিস্টে শুধু সেগুলোই যাবে যেগুলোর dai_stream_key আছে (যেহেতু আপকামিং প্লে করা যাবে না)
                    if (event.dai_stream_key) {
                        const title = event.title || event.on_now_title || 'Paramount Live Event';
                        
                        // লোগো হিসেবে thumbnail ব্যবহার করা হলো
                        const logo = event.thumbnail || '';
                        
                        m3uContent += `#EXTINF:-1 tvg-logo="${logo}" group-title="Paramount Live", ${title}\n`;
                        m3uContent += `${event.stream_url}\n\n`;
                    }
                });
            }
        });

        // ৬. ফাইনাল সেভ ও আবর্জনা পরিষ্কার
        fs.writeFileSync('paramount_live.json', JSON.stringify(finalEvents, null, 2));
        fs.writeFileSync('playlist.m3u', m3uContent);
        
        if (fs.existsSync('paramount_enc.txt')) fs.unlinkSync('paramount_enc.txt');
        if (fs.existsSync('fetch_temp.sh')) fs.unlinkSync('fetch_temp.sh');

        console.log(`✅ Success! ${finalEvents.length} events (Live & Upcoming) saved to paramount_live.json.`);
        console.log(`✅ Live matches added to playlist.m3u.`);

    } catch (err) {
        console.error("\n❌ Error:", err.message);
        process.exit(1);
    }
}

generatePlaylist();
