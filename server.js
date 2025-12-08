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
// 直接使用當前目錄 (__dirname) 作為靜態檔案來源
const rootPath = __dirname;

console.log("=== 伺服器啟動 (扁平模式) ===");
console.log("工作目錄:", rootPath);

// 檢查 index.html 是否存在
const indexPath = path.join(rootPath, 'index.html');
if (fs.existsSync(indexPath)) {
    console.log("✅ 成功找到 index.html");
} else {
    console.error("❌ 嚴重錯誤：找不到 index.html！請確認檔案已上傳至 GitHub 根目錄。");
    // 列出目前檔案以供除錯
    try {
        console.log("目前檔案列表:", fs.readdirSync(rootPath));
    } catch (e) { console.log("無法讀取目錄"); }
}

// 設定靜態檔案服務 (讀取根目錄下的 js, css, html)
app.use(express.static(rootPath));

// 記憶體資料庫
const rooms = {};

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join_room', (roomId) => {
        socket.join(roomId);
        if (!rooms[roomId]) rooms[roomId] = { players: [], gameState: { status: 'lobby' } };
        socket.emit('init_data', rooms[roomId]);
    });

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

    socket.on('update_game_status', ({ roomId, status }) => {
        if (!rooms[roomId]) return;
        rooms[roomId].gameState = status;
        socket.to(roomId).emit('game_status_update', status);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// 所有路由都回傳 index.html (SPA 模式)
app.get('*', (req, res) => {
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send("Error: index.html not found. Check Server Logs.");
    }
});

const PORT = process.env.PORT || 10000; // Render 預設使用 10000
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
