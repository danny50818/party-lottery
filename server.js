const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs'); // 引入檔案系統模組

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- 關鍵修正：智慧路徑偵測 ---
const rootPath = __dirname;
const publicPath = path.join(__dirname, 'public');

console.log("正在檢查檔案路徑...");
console.log("根目錄:", rootPath);

// 檢查 public 資料夾是否存在
if (fs.existsSync(path.join(publicPath, 'index.html'))) {
    console.log("✅ 成功找到 public/index.html，使用 public 資料夾");
    app.use(express.static(publicPath));
    
    app.get('*', (req, res) => {
        res.sendFile(path.join(publicPath, 'index.html'));
    });
} else {
    console.warn("⚠️ 找不到 public/index.html");
    
    // 檢查根目錄是否有 index.html (備案)
    if (fs.existsSync(path.join(rootPath, 'index.html'))) {
        console.log("✅ 在根目錄找到 index.html，切換為根目錄模式");
        app.use(express.static(rootPath));
        
        app.get('*', (req, res) => {
            res.sendFile(path.join(rootPath, 'index.html'));
        });
    } else {
        console.error("❌ 嚴重錯誤：到處都找不到 index.html！");
        // 列出目前目錄下的所有檔案，幫助除錯
        console.log("目前目錄下的檔案:", fs.readdirSync(rootPath));
        if (fs.existsSync(publicPath)) {
             console.log("public 資料夾內的檔案:", fs.readdirSync(publicPath));
        }
        
        app.get('*', (req, res) => {
            res.send("Error: index.html not found. Please check Render logs.");
        });
    }
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
        socket.to(roomId).emit('game_status_update', status);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});