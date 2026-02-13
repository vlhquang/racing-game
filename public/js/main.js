// ============================================
// MAIN MODULE — Entry Point
// ============================================
(function () {
    'use strict';

    // Connect to server
    Network.connect();

    // Initialize UI
    UI.init();

    // Initialize Phaser renderer
    PhaserGame.init('phaser-container');

    // Game state
    let gameStarted = false;
    let laneCount = 3;
    let config = {};
    let lastInputTime = 0;
    let localHitObstacles = new Set(); // To prevent multiple hits on same box
    let obstacleInputLockUntil = 0;

    // Network event: countdown
    Network.on('onCountdown', (data) => {
        console.log('[Client] Game starting... showing game screen');
        laneCount = data.laneCount || 3;
        config = data.config || {};

        // New round: clear local hit cache to allow collisions again
        if (data.count === 3) {
            localHitObstacles.clear();
        }

        if (!gameStarted) {
            gameStarted = true;
            console.log('[Client] Initializing Phaser renderer and input');
            PhaserGame.start(UI.getPlayerId());

            // Initialize input controls with PREDICTION
            Input.init(
                () => handleInput('left'),
                () => handleInput('right')
            );

            // Register Client-Side Collision Handler
            PhaserGame.setOnHit(handleObstacleHit);
        }
    });

    function handleInput(direction) {
        if (!gameStarted) return;
        if (Date.now() < obstacleInputLockUntil) return;

        // Block input if game is not racing
        const state = PhaserGame.getGameState();
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
        PhaserGame.predictMove(direction, laneCount);
    }

    function handleObstacleHit(obstacle) {
        const obsId = obstacle.id || `obs_${obstacle.distance}_${obstacle.lane}`;
        if (localHitObstacles.has(obsId)) return;

        localHitObstacles.add(obsId);
        console.log('[Client] LOCAL HIT:', obsId, obstacle.type);

        // Instant feedback
        if (obstacle.type === 'stone') {
            PhaserGame.applyLocalObstacleHit('stone');
            PhaserGame.clearPredictionLane();
            obstacleInputLockUntil = Date.now() + Math.max(200, ((config && config.stoneStopTime) || 1) * 1000);
            PhaserGame.triggerShake(8, 0.5);
            PhaserGame.addNotification('💥 ĐÁ!', '#ff6644', 1.5);
            setTimeout(() => {
                Network.sendObstacleHit(UI.getRoomCode(), obstacle);
            }, 0);
        } else if (obstacle.type === 'oil') {
            PhaserGame.applyLocalObstacleHit('oil');
            PhaserGame.clearPredictionLane();
            obstacleInputLockUntil = Date.now() + Math.max(200, ((config && config.oilSpinTime) || 1.5) * 1000);
            PhaserGame.addNotification('🛢️ DẦU LOANG!', '#9b59b6', 1.5);
            setTimeout(() => {
                Network.sendObstacleHit(UI.getRoomCode(), obstacle);
            }, 0);
        } else if (obstacle.type === 'question') {
            Network.sendObstacleHit(UI.getRoomCode(), obstacle);
        }

        // Tell renderer to wait a bit before snapping back to server distance
        // because we just hit something and speed will drop
        lastInputTime = Date.now();
    }

    // Network event: game state update
    Network.on('onGameState', (data) => {
        PhaserGame.setGameState(data, lastInputTime, config);
        UI.ensureControlsVisible();
    });

    Network.on('onRacePlan', (data) => {
        PhaserGame.setRacePlan(data);
    });

    // Network event: obstacle hit (for effects)
    Network.on('onObstacleHit', (data) => {
        PhaserGame.applySyncedObstacleEffect(data.playerId, data.type, data.duration);
        if (data.playerId === UI.getPlayerId()) {
            if (data.type === 'stone') {
                PhaserGame.triggerShake(6, 0.4);
                PhaserGame.addNotification('💥 ĐÁ!', '#ff6644', 1.5);
            } else if (data.type === 'oil') {
                PhaserGame.addNotification('🛢️ DẦU LOANG!', '#9b59b6', 1.5);
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
        PhaserGame.stop();
        UI.showResults(data.rankings);
    });

    // Prevent context menu on long press (mobile)
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    // Hard-disable zoom and page pan on mobile
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('gesturechange', (e) => e.preventDefault());
    document.addEventListener('gestureend', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('dblclick', (e) => e.preventDefault());

    console.log('🏎️ Racing Game initialized!');
})();
