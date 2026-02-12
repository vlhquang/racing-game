// ============================================
// NETWORK MODULE — Socket.io Client
// ============================================
const Network = (() => {
    let socket = null;
    const callbacks = {};

    function connect() {
        // Auto-detects protocol (http/https) and host
        socket = io({
            transports: ['websocket', 'polling']
        });

        socket.on('connect', () => {
            console.log('Connected:', socket.id);
            emitLocal('onConnect', socket.id);
        });

        socket.on('room-created', (data) => {
            emitLocal('onRoomCreated', data);
        });

        socket.on('room-joined', (data) => {
            emitLocal('onRoomJoined', data);
        });

        socket.on('player-joined', (data) => {
            emitLocal('onPlayerJoined', data);
        });

        socket.on('player-left', (data) => {
            emitLocal('onPlayerLeft', data);
        });

        socket.on('player-updated', (data) => {
            emitLocal('onPlayerUpdated', data);
        });

        socket.on('error-msg', (data) => {
            emitLocal('onError', data.message);
        });

        socket.on('countdown', (data) => {
            emitLocal('onCountdown', data);
        });

        socket.on('game-state', (data) => {
            emitLocal('onGameState', data);
        });

        socket.on('obstacle-hit', (data) => {
            emitLocal('onObstacleHit', data);
        });

        socket.on('question-start', (data) => {
            emitLocal('onQuestionStart', data);
        });

        socket.on('question-go', (data) => {
            emitLocal('onQuestionGo', data);
        });

        socket.on('question-result', (data) => {
            emitLocal('onQuestionResult', data);
        });

        socket.on('race-resume', () => {
            emitLocal('onRaceResume');
        });

        socket.on('game-over', (data) => {
            emitLocal('onGameOver', data);
        });
    }

    function on(event, cb) {
        if (!callbacks[event]) callbacks[event] = [];
        callbacks[event].push(cb);
    }

    function emitLocal(event, data) {
        if (callbacks[event]) {
            callbacks[event].forEach(cb => cb(data));
        }
    }

    function createRoom(playerName, vehicleType) {
        socket.emit('create-room', { playerName, vehicleType });
    }

    function joinRoom(roomCode, playerName, vehicleType) {
        socket.emit('join-room', { roomCode: roomCode.toUpperCase(), playerName, vehicleType });
    }

    function startGame(roomCode) {
        socket.emit('start-game', { roomCode });
    }

    function restartGame(roomCode, vehicleType) {
        socket.emit('restart-game', { roomCode, vehicleType });
    }

    function setVehicle(roomCode, vehicleType) {
        socket.emit('set-vehicle', { roomCode, vehicleType });
    }

    function sendInput(roomCode, direction) {
        socket.emit('player-input', { roomCode, direction });
    }

    function answerQuestion(roomCode, answerIndex) {
        socket.emit('answer-question', { roomCode, answerIndex });
    }

    function questionReady(roomCode, questionId) {
        socket.emit('question-ready', { roomCode, questionId });
    }

    function sendObstacleHit(roomCode, obstacle) {
        socket.emit('obstacle-hit', { roomCode, obstacle });
    }

    function getSocketId() {
        return socket ? socket.id : null;
    }

    async function getConfig() {
        const res = await fetch('/api/config');
        if (!res.ok) throw new Error('Không tải được cấu hình');
        const data = await res.json();
        return data.config;
    }

    async function saveConfig(config) {
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
            throw new Error((data && data.error) || 'Không lưu được cấu hình');
        }
        return data.config;
    }

    return {
        connect, on, createRoom, joinRoom, startGame, restartGame,
        setVehicle, sendInput, answerQuestion, questionReady, sendObstacleHit,
        getSocketId, getConfig, saveConfig
    };
})();
