const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- 扁平化結構設定 ---
const rootPath = __dirname;
const indexPath = path.join(rootPath, 'index.html');

console.log("=== 伺服器啟動 ===");
console.log("工作目錄:", rootPath);

// 檢查 index.html 是否存在
if (fs.existsSync(indexPath)) {
    console.log("✅ 成功找到 index.html");
} else {
    console.error("❌ 找不到 index.html！請確認檔案已上傳至 GitHub 根目錄。");
}

// 設定靜態檔案服務
app.use(express.static(rootPath));

// 記憶體資料庫
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

        // 發送目前的玩家名單給剛連線的人
        socket.emit('init_data', rooms[roomId]);
        // 同步目前的遊戲狀態 (防止重新整理後狀態遺失)
        socket.emit('game_status_update', rooms[roomId].gameState);
    });

    // --- 玩家加入 (來自手機) ---
    socket.on('player_join', ({ roomId, user }) => {
        if (!rooms[roomId]) return; 

        // 避免重複加入，或是更新現有玩家資料
        const existingPlayer = rooms[roomId].players.find(p => p.id === user.id);
        if (!existingPlayer) {
            rooms[roomId].players.push(user);
        } else {
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
        // 使用 io.to() 確保發送給包含自己的所有人(雖然大螢幕通常不需要自己收，但保持同步無妨)
        // 或是用 socket.to(roomId) 發送給「除了自己以外」的人
        io.to(roomId).emit('game_status_update', status);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// --- SPA 路由處理 ---
// 讓所有網址 (例如 /?mode=host) 都回傳 index.html
app.get('*', (req, res) => {
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send("Error: index.html not found.");
    }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
