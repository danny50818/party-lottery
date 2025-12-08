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

if (fs.existsSync(indexPath)) {
    console.log("✅ 成功找到 index.html");
} else {
    console.error("❌ 找不到 index.html！請確認檔案已上傳至 GitHub 根目錄。");
}

app.use(express.static(rootPath));

// 記憶體資料庫
const rooms = {};

io.on('connection', (socket) => {
    // 記錄連線 IP (供除錯用)
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    console.log(`Client connected: ${socket.id} from ${clientIp}`);

    // --- 加入房間 ---
    socket.on('join_room', (roomId) => {
        socket.join(roomId);
        if (!rooms[roomId]) {
            rooms[roomId] = { players: [], gameState: { status: 'lobby' } };
        }
        socket.emit('init_data', rooms[roomId]);
        socket.emit('game_status_update', rooms[roomId].gameState);
    });

    // --- 玩家加入 ---
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

    // --- 遊戲狀態更新 ---
    socket.on('update_game_status', ({ roomId, status }) => {
        if (!rooms[roomId]) return;
        rooms[roomId].gameState = status;
        io.to(roomId).emit('game_status_update', status);
    });

    // --- [關鍵新增] 重置活動 ---
    socket.on('reset_game', ({ roomId }) => {
        if (!rooms[roomId]) return;
        
        console.log(`Room ${roomId} has been RESET by host.`);
        
        // 1. 清空伺服器端的玩家名單與狀態
        rooms[roomId] = { players: [], gameState: { status: 'lobby' } };
        
        // 2. 廣播重置訊號 (game_reset) -> 手機端收到後會自動登出
        io.to(roomId).emit('game_reset');
        
        // 3. 更新大螢幕顯示 (空名單)
        io.to(roomId).emit('init_data', rooms[roomId]);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

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