const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const GameRoom = require('./GameRoom');
const { getConfig, updateConfig } = require('./configCache');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});
app.use(express.json({ limit: '1mb' }));

app.get('/api/config', (req, res) => {
    res.json({ config: getConfig() });
});

app.post('/api/config', (req, res) => {
    try {
        const patch = req.body && req.body.config;
        const next = updateConfig(patch || {});
        res.json({ ok: true, config: next });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message || 'Invalid config payload' });
    }
});

// Serve static files
const publicPath = path.join(__dirname, '..', 'public');
console.log('Serving static files from:', publicPath);
const fs = require('fs');

// Check if directory exists
if (fs.existsSync(publicPath)) {
    console.log('Public directory exists. Contents:', fs.readdirSync(publicPath));
    const cssPath = path.join(publicPath, 'css');
    if (fs.existsSync(cssPath)) {
        console.log('CSS directory contents:', fs.readdirSync(cssPath));
    } else {
        console.log('CSS directory NOT found at:', cssPath);
    }
} else {
    console.log('Public directory NOT found at:', publicPath);
    // Fallback: try current directory?
    console.log('Current directory contents:', fs.readdirSync(process.cwd()));
}

app.use(express.static(publicPath));

// Serve Phaser runtime without copying into public/
const phaserDistPath = path.join(__dirname, '..', 'node_modules', 'phaser', 'dist');
app.use('/vendor/phaser', express.static(phaserDistPath));

// Store active rooms
const rooms = new Map();

// Generate 4-character room code
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return rooms.has(code) ? generateRoomCode() : code;
}

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    socket.on('create-room', ({ playerName, vehicleType }) => {
        const roomCode = generateRoomCode();
        const room = new GameRoom(roomCode, io);
        rooms.set(roomCode, room);
        room.addPlayer(socket, playerName, vehicleType);
        socket.join(roomCode);
        socket.emit('room-created', {
            roomCode,
            playerId: socket.id,
            players: room.getPlayersInfo()
        });
        console.log(`Room ${roomCode} created by ${playerName}`);
    });

    socket.on('join-room', ({ roomCode, playerName, vehicleType }) => {
        const room = rooms.get(roomCode);
        if (!room) {
            socket.emit('error-msg', { message: 'Phòng không tồn tại!' });
            return;
        }
        if (room.state !== 'WAITING' && room.state !== 'FINISHED') {
            socket.emit('error-msg', { message: 'Trận đấu đã bắt đầu!' });
            return;
        }
        if (room.getPlayerCount() >= room.config.maxPlayers) {
            socket.emit('error-msg', { message: 'Phòng đã đầy!' });
            return;
        }
        room.addPlayer(socket, playerName, vehicleType);
        socket.join(roomCode);
        socket.emit('room-joined', {
            roomCode,
            playerId: socket.id,
            players: room.getPlayersInfo()
        });
        socket.to(roomCode).emit('player-joined', {
            players: room.getPlayersInfo()
        });
        console.log(`${playerName} joined room ${roomCode}`);
    });

    socket.on('set-vehicle', ({ roomCode, vehicleType }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        if (room.state === 'RACING' || room.state === 'QUESTION' || room.state === 'COUNTDOWN') return;
        room.setPlayerVehicle(socket.id, vehicleType);
        io.to(roomCode).emit('player-updated', {
            players: room.getPlayersInfo()
        });
    });

    socket.on('start-game', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        if (!room) {
            console.log(`[Start] Room ${roomCode} not found`);
            return;
        }
        if (room.getPlayerCount() < 1) return;
        if (room.hostId !== socket.id) {
            console.log(`[Start] User ${socket.id} is not host of ${roomCode}`);
            return;
        }
        console.log(`[Start] Starting game in room ${roomCode}`);
        room.startGame();
    });

    socket.on('restart-game', ({ roomCode, vehicleType }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        if (room.hostId !== socket.id) return;
        if (vehicleType) {
            room.setPlayerVehicle(socket.id, vehicleType);
        }
        room.startGame();
    });

    socket.on('player-input', ({ roomCode, direction }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        room.handleInput(socket.id, direction);
    });

    socket.on('obstacle-hit', ({ roomCode, obstacle }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        room.onObstacleHit(socket.id, obstacle);
    });

    socket.on('answer-question', ({ roomCode, answerIndex }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        room.handleAnswer(socket.id, answerIndex);
    });

    socket.on('question-ready', ({ roomCode, questionId }) => {
        const room = rooms.get(roomCode);
        if (!room) return;
        room.handleQuestionReady(socket.id, questionId);
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        // Find and clean up rooms
        for (const [code, room] of rooms) {
            if (room.hasPlayer(socket.id)) {
                room.removePlayer(socket.id);
                if (room.getPlayerCount() === 0) {
                    room.stop();
                    rooms.delete(code);
                    console.log(`Room ${code} deleted (empty)`);
                } else {
                    io.to(code).emit('player-left', {
                        players: room.getPlayersInfo()
                    });
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🏎️  Racing Game server running on http://localhost:${PORT}`);
});
