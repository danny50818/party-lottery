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

// --- 伺服器啟動診斷 ---
const rootPath = __dirname;
const publicPath = path.join(rootPath, 'public');

console.log("=== 系統啟動 ===");
console.log("根目錄:", rootPath);

// 自動尋找 index.html (優先找根目錄，其次找 public)
let staticPath = null;
let indexFile = null;

if (fs.existsSync(path.join(rootPath, 'index.html'))) {
    console.log("✅ 在根目錄找到 index.html");
    staticPath = rootPath;
    indexFile = path.join(rootPath, 'index.html');
} else if (fs.existsSync(path.join(publicPath, 'index.html'))) {
    console.log("✅ 在 public 資料夾找到 index.html");
    staticPath = publicPath;
    indexFile = path.join(publicPath, 'index.html');
} else {
    console.error("❌ 找不到 index.html！");
}

// 設定靜態檔案 (如果有的話)
if (staticPath) {
    app.use(express.static(staticPath));
}

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
        io.to(roomId).emit('game_status_update', status);
    });
    
    socket.on('reset_game', ({ roomId }) => {
        if (!rooms[roomId]) return;
        console.log(`Room ${roomId} has been reset.`);
        rooms[roomId] = { players: [], gameState: { status: 'lobby' } };
        io.to(roomId).emit('game_reset');
        io.to(roomId).emit('init_data', rooms[roomId]);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// --- 萬用路由 (包含除錯頁面) ---
app.get('*', (req, res) => {
    if (indexFile && fs.existsSync(indexFile)) {
        // 正常情況：回傳網頁
        res.sendFile(indexFile);
    } else {
        // 異常情況：顯示診斷報告 (取代空白畫面)
        const filesInRoot = fs.readdirSync(rootPath).join('<br>');
        const filesInPublic = fs.existsSync(publicPath) ? fs.readdirSync(publicPath).join('<br>') : 'No public folder';
        
        res.status(404).send(`
            <div style="font-family: sans-serif; padding: 20px; line-height: 1.5;">
                <h1 style="color: red;">⚠️ 網站啟動失敗 (File Not Found)</h1>
                <p>伺服器已啟動，但找不到 <strong>index.html</strong> 檔案。</p>
                <hr>
                <h3>伺服器檔案列表 (Debug Info):</h3>
                <p><strong>Root (/):</strong><br> ${filesInRoot}</p>
                <p><strong>Public (/public):</strong><br> ${filesInPublic}</p>
                <hr>
                <p><strong>請檢查：</strong></p>
                <ul>
                    <li>檔案是否已 Push 到 GitHub？</li>
                    <li>檔名是否大小寫正確？ (必須是 <code>index.html</code>，不能是 <code>Index.html</code>)</li>
                </ul>
            </div>
        `);
    }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});