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
    // --- 加入房間 ---
    socket.on('join_room', (roomId) => {
        socket.join(roomId);
        if (!rooms[roomId]) {
            rooms[roomId] = { players: [], gameState: { status: 'lobby' } };
        }
        socket.emit('init_data', rooms[roomId]);
        socket.emit('game_status_update', rooms[roomId].gameState);
    });

    // --- 玩家加入 (來自手機) ---
    socket.on('player_join', ({ roomId, user }) => {
        if (!rooms[roomId]) return; 

        const existingPlayer = rooms[roomId].players.find(p => p.id === user.id);
        if (!existingPlayer) {
            rooms[roomId].players.push(user);
        } else {
            Object.assign(existingPlayer, user);
        }

        io.to(roomId).emit('player_list_update', rooms[roomId].players);
    });

    // --- 遊戲狀態更新 (來自大螢幕) ---
    socket.on('update_game_status', ({ roomId, status }) => {
        if (!rooms[roomId]) return;
        rooms[roomId].gameState = status;
        // 廣播給房間內所有手機
        io.to(roomId).emit('game_status_update', status);
    });

    // --- 重置遊戲 ---
    socket.on('reset_game', ({ roomId }) => {
        if (!rooms[roomId]) return;
        console.log(`Room ${roomId} has been reset.`);
        rooms[roomId] = { players: [], gameState: { status: 'lobby' } };
        io.to(roomId).emit('game_reset');
        io.to(roomId).emit('init_data', rooms[roomId]);
    });

    socket.on('disconnect', () => {
        // console.log('Client disconnected');
    });
});

// --- SPA 路由處理 ---
app.get('*', (req, res) => {
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send("Error: index.html not found.");
    }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});