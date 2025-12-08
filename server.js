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

// --- 除錯工具：列出所有檔案 ---
// 這會幫助我們確認 Render 到底抓到了什麼檔案
function listFiles(dir, fileList = []) {
    try {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                if (file !== 'node_modules' && file !== '.git') { // 忽略系統資料夾
                    listFiles(filePath, fileList);
                }
            } else {
                fileList.push(filePath.replace(__dirname, '.')); // 顯示相對路徑
            }
        });
    } catch (e) {
        console.error("讀取目錄失敗:", e);
    }
    return fileList;
}

console.log("=== 伺服器啟動診斷開始 ===");
console.log("Current Directory:", __dirname);
console.log("File Structure Check:");
const allFiles = listFiles(__dirname);
console.log(allFiles.join('\n'));
console.log("=== 伺服器啟動診斷結束 ===");

// --- 關鍵修正：智慧路徑偵測 ---
const rootPath = __dirname;
const publicPath = path.join(__dirname, 'public');

let finalPath = null;

// 檢查 public/index.html
if (fs.existsSync(path.join(publicPath, 'index.html'))) {
    console.log("✅ 成功: 在 public/index.html 找到檔案");
    finalPath = publicPath;
} 
// 檢查根目錄 index.html (備案)
else if (fs.existsSync(path.join(rootPath, 'index.html'))) {
    console.log("⚠️ 注意: 在根目錄找到 index.html (建議移動到 public 資料夾)");
    finalPath = rootPath;
} 
else {
    console.error("❌ 嚴重錯誤: 到處都找不到 index.html！請檢查 GitHub 檔案結構。");
}

if (finalPath) {
    app.use(express.static(finalPath));
    app.get('*', (req, res) => {
        res.sendFile(path.join(finalPath, 'index.html'));
    });
} else {
    // 找不到檔案時顯示錯誤頁面，而不是讓伺服器崩潰
    app.get('*', (req, res) => {
        res.status(404).send(`
            <h1>Deployment Error</h1>
            <p>Could not find index.html.</p>
            <p>Please check the Render logs for the file structure dump.</p>
        `);
    });
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
