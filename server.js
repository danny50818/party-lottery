const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// ==========================================
// ★★★ 路由設定 (修正導向問題) ★★★
// ==========================================

// 輔助函式：傳送檔案，包含防呆檢查
function serveFile(res, filename) {
    const fileInPublic = path.join(__dirname, 'public', filename);
    const fileInRoot = path.join(__dirname, filename);
    
    if (fs.existsSync(fileInPublic)) {
        res.sendFile(fileInPublic);
    } else if (fs.existsSync(fileInRoot)) {
        res.sendFile(fileInRoot);
    } else {
        res.status(404).send(`Error: ${filename} not found.`);
    }
}

// 1. 手機端路由 - 根目錄 '/'
app.get('index.html', (req, res) => {
    serveFile(res, 'mobile.html');
});

// 2. 手機端路由 - 明確的 '/mobile.html' (給 QR Code 用)
app.get('/mobile.html', (req, res) => {
    serveFile(res, 'mobile.html');
});

// 3. 大螢幕端路由
app.get('/screen', (req, res) => {
    serveFile(res, 'index.html');
});

// 4. 靜態檔案 (確保 CSS/JS/Socket 能讀取)
const publicPath = path.join(__dirname, 'public');
if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath));
} else {
    app.use(express.static(__dirname));
}

// ==========================================

// --- 資料狀態 ---
let users = [];       // 所有已登入使用者
let excludedNames = []; // 被剔除的名單
let winners = [];     // 已中獎名單

// --- Socket.io 事件處理 ---
io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // 手機請求登入
    socket.on('mobile_login', (name) => {
        const cleanName = name ? name.toString().trim() : "";
        if (!cleanName) {
            socket.emit('login_error', '名字不能為空');
            return;
        }

        // 檢查重複
        const isDuplicate = users.some(u => u.name === cleanName);
        if (isDuplicate) {
            socket.emit('login_error', '此名字已被使用，請換一個');
            return;
        }

        const newUser = { id: socket.id, name: cleanName };
        users.push(newUser);

        socket.emit('login_success', { name: cleanName });
        io.emit('update_user_list', users.map(u => u.name));
        console.log(`[Login] ${cleanName}`);
    });

    // 大螢幕初始化
    socket.on('admin_init', () => {
        socket.emit('update_user_list', users.map(u => u.name));
        socket.emit('update_winners', winners);
    });

    // 開始滾動
    socket.on('admin_start_rolling', () => {
        io.emit('client_show_rolling'); 
    });

    // ★★★ 執行抽獎 (關鍵邏輯) ★★★
    socket.on('admin_perform_draw', () => {
        // 1. 篩選候選人：在使用者中，排除已中獎者、排除被剔除者
        const candidates = users.filter(u => 
            !winners.includes(u.name) && 
            !excludedNames.includes(u.name)
        );

        // Debug Log：確認池子是否變小
        console.log(`[Draw Info] 總人數: ${users.length}, 已中獎: ${winners.length}, 剔除: ${excludedNames.length}, 本次候選池: ${candidates.length}`);

        if (candidates.length === 0) {
            io.emit('admin_draw_error', '無有效參加者或名單已抽完');
            return;
        }

        const randomIndex = Math.floor(Math.random() * candidates.length);
        const winner = candidates[randomIndex];
        
        // 加入中獎名單 (下次就不會被 filter 選中)
        winners.push(winner.name);

        console.log(`[Winner] ${winner.name}`);
        io.emit('draw_result', { winnerName: winner.name });
    });

    // 重置活動
    socket.on('admin_reset', () => {
        users = [];
        winners = [];
        excludedNames = [];
        io.emit('event_reset');
        io.emit('update_user_list', []);
        console.log('[Reset] Event reset');
    });
    
    // 剔除管理
    socket.on('admin_toggle_exclude', (name) => {
        if (excludedNames.includes(name)) {
            excludedNames = excludedNames.filter(n => n !== name);
        } else {
            excludedNames.push(name);
        }
    });

    socket.on('disconnect', () => {
        // console.log(`Socket disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

