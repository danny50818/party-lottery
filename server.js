const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// --- 1. 靜態檔案設定 ---
// 確保 public 資料夾路徑正確
app.use(express.static(path.join(__dirname, 'public')));

// 路由：手機端 (預設首頁)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
});

// 路由：大螢幕端
app.get('/screen', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- 2. 資料狀態 ---
// 注意：在 Render 免費版這類無狀態環境重啟後，變數會重置，適合短期活動
let users = [];       // { id: socket.id, name: "王小明" }
let excludedNames = []; // 被剔除的名單
let winners = [];     // 已中獎名單

// --- 3. Socket.io 事件處理 ---
io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // --- A. 手機端事件 ---

    // 手機請求登入
    socket.on('mobile_login', (name) => {
        const cleanName = name ? name.toString().trim() : "";
        
        if (!cleanName) {
            socket.emit('login_error', '名字不能為空');
            return;
        }

        // 檢查名字是否重複 
        // (這裡做嚴格檢查，若某人斷線但Server沒重啟，名字會被佔用，
        //  若需允許斷線重連，可改為 update socket id 的邏輯)
        const isDuplicate = users.some(u => u.name === cleanName);
        if (isDuplicate) {
            socket.emit('login_error', '此名字已被使用，請換一個');
            return;
        }

        const newUser = { id: socket.id, name: cleanName };
        users.push(newUser);

        // 回傳成功給該手機
        socket.emit('login_success', { name: cleanName });
        
        // 廣播給大螢幕：更新名單 (只傳名字陣列)
        io.emit('update_user_list', users.map(u => u.name));
        
        console.log(`[Login] ${cleanName} (${socket.id})`);
    });

    socket.on('disconnect', () => {
        // 這裡選擇不移除名單，避免使用者手機螢幕關閉或重新整理網頁後失去抽獎資格
        // 如果需要移除，可以在這裡實作：
        // users = users.filter(u => u.id !== socket.id);
        // io.emit('update_user_list', users.map(u => u.name));
        console.log(`Socket disconnected: ${socket.id}`);
    });

    // --- B. 大螢幕(Admin)事件 ---

    // 大螢幕初始化
    socket.on('admin_init', () => {
        socket.emit('update_user_list', users.map(u => u.name));
        socket.emit('update_winners', winners);
    });

    // 開始滾動 (同步所有手機顯示動畫)
    socket.on('admin_start_rolling', () => {
        io.emit('client_show_rolling'); 
    });

    // 執行抽獎 (伺服器端計算結果)
    socket.on('admin_perform_draw', () => {
        // 過濾有效名單：已登入 - 已中獎 - 被剔除
        const candidates = users.filter(u => 
            !winners.includes(u.name) && 
            !excludedNames.includes(u.name)
        );

        if (candidates.length === 0) {
            io.emit('admin_draw_error', '無有效參加者或名單已抽完');
            return;
        }

        // 隨機抽選
        const randomIndex = Math.floor(Math.random() * candidates.length);
        const winner = candidates[randomIndex];
        winners.push(winner.name);

        console.log(`[Winner] ${winner.name}`);

        // 廣播結果給所有人 (大螢幕顯示彈窗，手機顯示結果)
        io.emit('draw_result', { winnerName: winner.name });
    });

    // 重置活動
    socket.on('admin_reset', () => {
        users = [];
        winners = [];
        excludedNames = [];
        io.emit('event_reset'); // 通知所有客戶端重新整理頁面
        io.emit('update_user_list', []);
        console.log('[Reset] Event reset');
    });
    
    // 剔除/恢復名單 (預留功能，可供管理介面使用)
    socket.on('admin_toggle_exclude', (name) => {
        if (excludedNames.includes(name)) {
            excludedNames = excludedNames.filter(n => n !== name);
        } else {
            excludedNames.push(name);
        }
    });
});

// Render 會自動注入 PORT 環境變數，本地開發預設 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
