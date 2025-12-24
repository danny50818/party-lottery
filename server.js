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
// ★★★ 關鍵修正：路由優先順序 ★★★
// ==========================================

// 1. 手機端路由 (必須放在靜態檔案設定之前！)
// 當使用者連線到根目錄 '/' 時，強制回傳 mobile.html
app.get('/', (req, res) => {
    const fileInPublic = path.join(__dirname, 'public', 'mobile.html');
    const fileInRoot = path.join(__dirname, 'mobile.html');
    
    if (fs.existsSync(fileInPublic)) {
        res.sendFile(fileInPublic);
    } else if (fs.existsSync(fileInRoot)) {
        res.sendFile(fileInRoot);
    } else {
        res.status(404).send("Error: mobile.html not found. Please check file structure.");
    }
});

// 2. 大螢幕端路由
app.get('/screen', (req, res) => {
    const fileInPublic = path.join(__dirname, 'public', 'index.html');
    const fileInRoot = path.join(__dirname, 'index.html');

    if (fs.existsSync(fileInPublic)) {
        res.sendFile(fileInPublic);
    } else if (fs.existsSync(fileInRoot)) {
        res.sendFile(fileInRoot);
    } else {
        res.status(404).send("Error: index.html not found.");
    }
});

// 3. 靜態檔案設定 (放在最後)
// 這樣 socket.io.js、css 或圖片才能正常讀取，但不會搶走首頁的控制權
const publicPath = path.join(__dirname, 'public');
if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath));
} else {
    app.use(express.static(__dirname));
}

// ==========================================

// --- 資料狀態 ---
let users = [];       
let excludedNames = []; 
let winners = [];     

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

    // 執行抽獎
    socket.on('admin_perform_draw', () => {
        const candidates = users.filter(u => 
            !winners.includes(u.name) && 
            !excludedNames.includes(u.name)
        );

        if (candidates.length === 0) {
            io.emit('admin_draw_error', '無有效參加者或名單已抽完');
            return;
        }

        const randomIndex = Math.floor(Math.random() * candidates.length);
        const winner = candidates[randomIndex];
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
    
    socket.on('admin_toggle_exclude', (name) => {
        if (excludedNames.includes(name)) {
            excludedNames = excludedNames.filter(n => n !== name);
        } else {
            excludedNames.push(name);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
