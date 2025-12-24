const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // 允許跨域，方便測試
        methods: ["GET", "POST"]
    }
});

// --- 1. 靜態檔案設定 ---
// 假設您的 HTML 檔案都放在 public 資料夾下
app.use(express.static(path.join(__dirname, 'public')));

// 路由：手機端 (預設首頁)
app.get('/', (req, res) => {
    // 這裡通常回傳手機登入頁面
    res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
});

// 路由：大螢幕端
app.get('/screen', (req, res) => {
    // 這裡回傳大螢幕抽獎頁面
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// --- 2. 資料狀態 ---
let users = [];       // { id: socket.id, name: "王小明" }
let excludedNames = []; // 被剔除的名單
let winners = [];     // 已中獎名單

// --- 3. Socket.io 事件處理 ---
io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // --- A. 手機端事件 ---

    // 手機請求登入
    socket.on('mobile_login', (name) => {
        const cleanName = name.trim();
        
        // 驗證 1: 名字不能為空
        if (!cleanName) {
            socket.emit('login_error', '名字不能為空');
            return;
        }

        // 驗證 2: 名字是否重複
        const isDuplicate = users.some(u => u.name === cleanName);
        if (isDuplicate) {
            socket.emit('login_error', '此名字已被使用，請換一個');
            return;
        }

        // 登入成功
        const newUser = { id: socket.id, name: cleanName };
        users.push(newUser);

        // 回傳給該手機
        socket.emit('login_success', { name: cleanName });
        
        // 廣播給大螢幕：更新名單
        io.emit('update_user_list', users.map(u => u.name));
        
        console.log(`[Login] ${cleanName} (${socket.id})`);
    });

    // 手機斷線 (可選：是否要從名單移除？通常抽獎活動會保留名單以免斷線就失去資格)
    socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.id}`);
        // 如果需要斷線移除，可在這裡實作 users = users.filter(...)
        // 並 io.emit('update_user_list', ...)
    });


    // --- B. 大螢幕(Admin)事件 ---

    // 大螢幕初始化，獲取當前資料
    socket.on('admin_init', () => {
        socket.emit('update_user_list', users.map(u => u.name));
        socket.emit('update_winners', winners);
    });

    // 開始滾動 (同步所有手機顯示 "抽獎中...")
    socket.on('admin_start_rolling', () => {
        io.emit('client_show_rolling'); // 廣播給所有手機
    });

    // 執行抽獎 (後端計算結果，確保公平性)
    socket.on('admin_perform_draw', () => {
        // 1. 過濾有效名單 (已登入 - 已中獎 - 被剔除)
        const candidates = users.filter(u => 
            !winners.includes(u.name) && 
            !excludedNames.includes(u.name)
        );

        if (candidates.length === 0) {
            io.emit('admin_draw_error', '無有效參加者或名單已抽完');
            return;
        }

        // 2. 隨機抽出一位
        const randomIndex = Math.floor(Math.random() * candidates.length);
        const winner = candidates[randomIndex];
        winners.push(winner.name);

        console.log(`[Winner] ${winner.name}`);

        // 3. 廣播結果
        // 給大螢幕：顯示結果
        // 給所有手機：顯示結果 (手機端會判斷是否是自己中獎)
        io.emit('draw_result', { winnerName: winner.name });
    });

    // 重置活動
    socket.on('admin_reset', () => {
        users = [];
        winners = [];
        excludedNames = [];
        io.emit('event_reset'); // 通知所有人重置
        io.emit('update_user_list', []);
        console.log('[Reset] Event reset');
    });
    
    // 剔除/恢復名單
    socket.on('admin_toggle_exclude', (name) => {
        if (excludedNames.includes(name)) {
            excludedNames = excludedNames.filter(n => n !== name);
        } else {
            excludedNames.push(name);
        }
        // 通知大螢幕更新狀態 (可選)
    });
});

// --- 4. 啟動伺服器 ---
const PORT = process.env.PORT || 3000;

// 取得本機 IP 方便手機掃描
function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

server.listen(PORT, () => {
    const ip = getLocalIp();
    console.log('------------------------------------------------');
    console.log(`Server is running!`);
    console.log(`> 手機端(Mobile)請連線: http://${ip}:${PORT}`);
    console.log(`> 大螢幕(Screen)請連線: http://${ip}:${PORT}/screen`);
    console.log('------------------------------------------------');
});
