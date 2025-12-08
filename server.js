const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // 允許跨域 (方便開發測試)
        methods: ["GET", "POST"]
    }
});

// --- 扁平化結構設定 ---
// 直接使用當前目錄 (__dirname) 作為靜態檔案來源
const rootPath = __dirname;
const indexPath = path.join(rootPath, 'index.html');

console.log("=== 伺服器啟動 ===");
console.log("工作目錄:", rootPath);

// 檢查 index.html 是否存在 (除錯用)
if (fs.existsSync(indexPath)) {
    console.log("✅ 成功找到 index.html");
} else {
    console.error("❌ 找不到 index.html！請確認檔案已上傳至 GitHub 根目錄。");
    // 列出目前檔案以供除錯
    try {
        console.log("目前檔案列表:", fs.readdirSync(rootPath));
    } catch (e) { console.log("無法讀取目錄"); }
}

// 設定靜態檔案服務 (讀取根目錄下的 js, css, html)
app.use(express.static(rootPath));

// 記憶體資料庫 (儲存房間狀態)
// 結構: { roomId: { players: [], gameState: {} } }
const rooms = {};

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // --- 加入房間 ---
    socket.on('join_room', (roomId) => {
        socket.join(roomId);
        
        // 初始化房間
        if (!rooms[roomId]) {
            rooms[roomId] = { players: [], gameState: { status: 'lobby' } };
        }

        // 發送目前的玩家名單給剛連線的人 (特別是 Host 重新整理時)
        socket.emit('init_data', rooms[roomId]);
        // 同步目前的遊戲狀態 (防止重新整理後狀態遺失)
        socket.emit('game_status_update', rooms[roomId].gameState);
    });

    // --- 玩家加入 (來自手機) ---
    socket.on('player_join', ({ roomId, user }) => {
        if (!rooms[roomId]) return; // 如果房間還沒建立(Host沒開)，這裡會擋掉，或可選擇自動建立

        // 避免重複加入
        const existingPlayer = rooms[roomId].players.find(p => p.id === user.id);
        if (!existingPlayer) {
            rooms[roomId].players.push(user);
        } else {
            // 如果已存在，更新資訊 (例如換頭像)
            Object.assign(existingPlayer, user);
        }

        // 廣播給房間內所有人 (包含大螢幕更新泡泡/列表)
        io.to(roomId).emit('player_list_update', rooms[roomId].players);
    });

    // --- 遊戲狀態更新 (來自大螢幕) ---
    socket.on('update_game_status', ({ roomId, status }) => {
        if (!rooms[roomId]) return;
        
        // 更新伺服器記憶的狀態
        rooms[roomId].gameState = status;
        
        // 廣播給房間內所有手機 (顯示抽獎中/中獎結果)
        io.to(roomId).emit('game_status_update', status);
    });

    // --- [關鍵新增] 重置遊戲 ---
    socket.on('reset_game', ({ roomId }) => {
        if (!rooms[roomId]) return;
        
        console.log(`Room ${roomId} has been reset.`);
        
        // 清空房間資料
        rooms[roomId] = { players: [], gameState: { status: 'lobby' } };
        
        // 廣播重置訊號：
        // 1. game_reset: 讓手機端登出
        io.to(roomId).emit('game_reset');
        
        // 2. init_data: 讓還在線上的裝置清空名單
        io.to(roomId).emit('init_data', rooms[roomId]);
    });

    socket.on('disconnect', () => {
        // console.log('Client disconnected:', socket.id);
    });
});

// --- SPA 路由處理 ---
// 讓所有網址 (例如 /?mode=host) 都回傳 index.html
app.get('*', (req, res) => {
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        // 萬一真的找不到檔案，回傳詳細錯誤頁面
        res.status(404).send(`
            <h1>Error: index.html not found!</h1>
            <p>Please check your deployment.</p>
            <p>Current directory: ${rootPath}</p>
        `);
    }
});

const PORT = process.env.PORT || 10000; // Render 預設使用 10000
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
