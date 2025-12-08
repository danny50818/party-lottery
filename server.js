const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 託管靜態檔案 (public 資料夾)
app.use(express.static(path.join(__dirname, 'public')));

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
    });

    // --- 玩家加入 (來自手機) ---
    socket.on('player_join', ({ roomId, user }) => {
        if (!rooms[roomId]) return;

        // 避免重複加入
        const existingPlayer = rooms[roomId].players.find(p => p.id === user.id);
        if (!existingPlayer) {
            rooms[roomId].players.push(user);
        } else {
            // 如果已存在，更新資訊 (例如換頭像)
            Object.assign(existingPlayer, user);
        }

        // 廣播給房間內所有人 (包含大螢幕)
        io.to(roomId).emit('player_list_update', rooms[roomId].players);
    });

    // --- 遊戲狀態更新 (來自大螢幕) ---
    socket.on('update_game_status', ({ roomId, status }) => {
        if (!rooms[roomId]) return;
        rooms[roomId].gameState = status;
        // 廣播給房間內所有手機
        socket.to(roomId).emit('game_status_update', status);
    });

    socket.on('disconnect', () => {
        // 這裡暫不移除玩家，避免網路瞬斷導致名單消失
        console.log('Client disconnected:', socket.id);
    });
});

// 處理所有路由導向 index.html (SPA 模式)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});