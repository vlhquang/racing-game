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
        }
    });

    function handleInput(direction) {
        const myId = UI.getPlayerId();
        // Network send
        Network.sendInput(UI.getRoomCode(), direction);

        // Local prediction
        if (predictedLane === null) {
            // Simplified: Assume we track it or get it from latest server state.
        }

        lastInputTime = Date.now();

        // Pass prediction intent to Renderer
        Renderer.predictMove(direction, laneCount);
    }

    // Network event: game state update
    Network.on('onGameState', (data) => {
        // Reconciliation logic moved to Renderer for simpler state management
        Renderer.setGameState(data, lastInputTime);
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
