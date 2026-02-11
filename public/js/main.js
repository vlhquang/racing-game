// ============================================
// MAIN MODULE — Entry Point
// ============================================
(function () {
    'use strict';

    // Connect to server
    Network.connect();

    // Initialize UI
    UI.init();

    // Initialize renderer
    const canvas = document.getElementById('game-canvas');
    Renderer.init(canvas);

    // Game state
    let gameStarted = false;
    let laneCount = 3;
    let config = {};
    let lastInputTime = 0;
    let localHitObstacles = new Set(); // To prevent multiple hits on same box
    let predictedLane = null;

    // Network event: countdown
    Network.on('onCountdown', (data) => {
        console.log('[Client] Game starting... showing game screen');
        laneCount = data.laneCount || 3;
        config = data.config || {};

        if (!gameStarted) {
            gameStarted = true;
            console.log('[Client] Initializing renderer and input');
            Road.init(laneCount, config.laneWidth || 80, canvas.width);
            Renderer.start(UI.getPlayerId());

            // Initialize input controls with PREDICTION
            Input.init(
                () => handleInput('left'),
                () => handleInput('right')
            );

            // Register Client-Side Collision Handler
            Renderer.setOnHit(handleObstacleHit);
        }
    });

    function handleInput(direction) {
        if (!gameStarted) return;

        // Block input if game is not racing
        const state = Renderer.getGameState();
        if (!state || state.state !== 'RACING') return;

        // Block input if paralyzed
        const myId = UI.getPlayerId();
        const me = state.players.find(p => p.id === myId);
        if (me && me.status === 'stopped') {
            return;
        }

        // Network send
        Network.sendInput(UI.getRoomCode(), direction);

        // Local prediction
        lastInputTime = Date.now();
        Renderer.predictMove(direction, laneCount);
    }

    function handleObstacleHit(obstacle) {
        const obsId = obstacle.id || `obs_${obstacle.distance}_${obstacle.lane}`;
        if (localHitObstacles.has(obsId)) return;

        localHitObstacles.add(obsId);
        console.log('[Client] LOCAL HIT:', obsId, obstacle.type);

        // Instant feedback
        if (obstacle.type === 'stone') {
            Effects.triggerShake(8, 0.5);
            Effects.addNotification('💥 ĐÁ!', '#ff6644', 1.5);
            // We can even locally set status if we want extreme snappiness
        } else if (obstacle.type === 'oil') {
            Effects.addNotification('🛢️ DẦU LOANG!', '#9b59b6', 1.5);
        }

        // Report to server
        Network.sendObstacleHit(UI.getRoomCode(), obstacle);

        // Tell renderer to wait a bit before snapping back to server distance
        // because we just hit something and speed will drop
        lastInputTime = Date.now();
    }

    // Network event: game state update
    Network.on('onGameState', (data) => {
        Renderer.setGameState(data, lastInputTime, config);
    });

    // Network event: obstacle hit (for effects)
    Network.on('onObstacleHit', (data) => {
        if (data.playerId === UI.getPlayerId()) {
            if (data.type === 'stone') {
                Effects.triggerShake(6, 0.4);
                Effects.addNotification('💥 ĐÁ!', '#ff6644', 1.5);
            } else if (data.type === 'oil') {
                Effects.addNotification('🛢️ DẦU LOANG!', '#9b59b6', 1.5);
            }
        }
    });

    // Network event: question start
    Network.on('onQuestionStart', (data) => {
        UI.showQuestion(data);
    });

    // Network event: question countdown starts (after image loaded)
    Network.on('onQuestionGo', (data) => {
        UI.startQuestionCountdown(data);
    });

    // Network event: question result
    Network.on('onQuestionResult', (data) => {
        UI.showQuestionResult(data.results, data.correctIndex);
    });

    // Network event: race resume
    Network.on('onRaceResume', () => {
        UI.hideQuestion();
    });

    // Network event: game over
    Network.on('onGameOver', (data) => {
        Renderer.stop();
        UI.showResults(data.rankings);
    });

    // Prevent context menu on long press (mobile)
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    console.log('🏎️ Racing Game initialized!');
})();
