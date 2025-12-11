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

if (fs.existsSync(indexPath)) {
    console.log("✅ index.html found");
} else {
    console.error("❌ index.html NOT found");
}

app.use(express.static(rootPath));

// 記憶體資料庫
const rooms = {};

io.on('connection', (socket) => {
    // console.log('Client connected:', socket.id);

    // --- 加入房間 (Host/Lobby) ---
    socket.on('join_room', (roomId) => {
        socket.join(roomId);
        // 如果房間不存在，建立新房間
        if (!rooms[roomId]) {
            rooms[roomId] = { players: [], gameState: { status: 'lobby' } };
            console.log(`Room ${roomId} created by Host.`);
        }
        // 發送當前狀態
        socket.emit('init_data', rooms[roomId]);
        socket.emit('game_status_update', rooms[roomId].gameState);
    });

    // --- 玩家加入 (Player) ---
    socket.on('player_join', ({ roomId, user }) => {
        // [修正] 自動補建房間機制
        if (!rooms[roomId]) {
            console.log(`Room ${roomId} missing, auto-creating for player.`);
            rooms[roomId] = { players: [], gameState: { status: 'lobby' } };
        }

        const existingPlayer = rooms[roomId].players.find(p => p.id === user.id);
        if (!existingPlayer) {
            rooms[roomId].players.push(user);
        } else {
            Object.assign(existingPlayer, user);
        }

        // 廣播給房間內所有人 (Host 會收到並更新畫面)
        io.to(roomId).emit('player_list_update', rooms[roomId].players);
    });

    // --- 遊戲狀態更新 ---
    socket.on('update_game_status', ({ roomId, status }) => {
        if (!rooms[roomId]) return;
        rooms[roomId].gameState = status;
        io.to(roomId).emit('game_status_update', status);
    });

    // --- 重置遊戲 ---
    socket.on('reset_game', ({ roomId }) => {
        if (!rooms[roomId]) return;
        console.log(`Room ${roomId} reset.`);
        rooms[roomId] = { players: [], gameState: { status: 'lobby' } };
        io.to(roomId).emit('game_reset');
        io.to(roomId).emit('init_data', rooms[roomId]);
    });

    socket.on('disconnect', () => {
        // console.log('Client disconnected');
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
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
