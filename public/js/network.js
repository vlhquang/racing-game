// ============================================
// NETWORK MODULE — Socket.io Client
// ============================================
const Network = (() => {
    let socket = null;
    const callbacks = {};

    function connect() {
        socket = io();

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

    function createRoom(playerName) {
        socket.emit('create-room', { playerName });
    }

    function joinRoom(roomCode, playerName) {
        socket.emit('join-room', { roomCode: roomCode.toUpperCase(), playerName });
    }

    function startGame(roomCode) {
        socket.emit('start-game', { roomCode });
    }

    function sendInput(roomCode, direction) {
        socket.emit('player-input', { roomCode, direction });
    }

    function answerQuestion(roomCode, answerIndex) {
        socket.emit('answer-question', { roomCode, answerIndex });
    }

    function getSocketId() {
        return socket ? socket.id : null;
    }

    return { connect, on, createRoom, joinRoom, startGame, sendInput, answerQuestion, getSocketId };
})();
