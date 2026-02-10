// ============================================
// RENDERER MODULE — Main Canvas Renderer
// ============================================
const Renderer = (() => {
    let canvas, ctx;
    let width, height;
    let gameState = null;
    let myId = '';
    let time = 0;
    let lastFrameTime = 0;
    let running = false;

    function init(canvasEl) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        resize();
        window.addEventListener('resize', resize);
    }

    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;

        // Update road position
        if (Road.getLaneCount() > 0) {
            Road.updateRoadX(width);
        }
    }

    function start(playerId) {
        console.log('[Renderer] Starting render loop for player:', playerId);
        myId = playerId;
        running = true;
        lastFrameTime = performance.now();
        requestAnimationFrame(loop);
    }

    function stop() {
        running = false;
    }

    function setGameState(state) {
        gameState = state;
    }

    function loop(timestamp) {
        if (!running) return;

        const dt = Math.min((timestamp - lastFrameTime) / 1000, 0.05);
        lastFrameTime = timestamp;
        time += dt;

        render(dt);

        requestAnimationFrame(loop);
    }

    function render(dt) {
        ctx.clearRect(0, 0, width, height);

        if (!gameState || !gameState.players) return;

        const myPlayer = gameState.players.find(p => p.id === myId);
        if (!myPlayer) return;

        // Camera follows current player
        const cameraY = myPlayer.distance % 200; // scrolling offset

        // Screen shake
        Effects.update(dt);
        const shake = Effects.getShakeOffset(dt);

        ctx.save();
        ctx.translate(shake.x, shake.y);

        // Draw road
        Road.draw(ctx, cameraY, width, height);

        // Draw obstacles
        for (const obs of gameState.obstacles) {
            const relDist = obs.distance - myPlayer.distance;
            const screenY = height * 0.75 - relDist * 0.7; // obstacles scroll down from top

            if (screenY < -50 || screenY > height + 50) continue;

            const obsX = Road.getLaneX(obs.lane);
            Obstacles.draw(ctx, obs, obsX, screenY, time);
        }

        // Draw all cars
        // Sort: draw other players first, then self on top
        const sortedPlayers = [...gameState.players].sort((a, b) => {
            if (a.id === myId) return 1;
            if (b.id === myId) return -1;
            return 0;
        });

        for (const p of sortedPlayers) {
            const smoothLane = Car.updateTransition(p.id, p.lane, dt);
            const carX = Road.getLaneX(smoothLane);

            let carY;
            if (p.id === myId) {
                carY = height * 0.75; // Current player fixed at bottom 25%
            } else {
                const relDist = p.distance - myPlayer.distance;
                carY = height * 0.75 - relDist * 0.7;
            }

            if (carY < -100 || carY > height + 100) continue;

            const scale = p.id === myId ? 1 : 0.9;
            Car.draw(ctx, carX, carY, p.color, scale, p.status, p.effectType, time);
            Car.drawNameTag(ctx, carX, carY, p.name, p.color);
        }

        // Draw particles
        Effects.drawParticles(ctx);

        ctx.restore();

        // Draw effect overlay (not affected by shake)
        if (myPlayer.status !== 'normal') {
            Effects.drawEffectOverlay(ctx, width, height, myPlayer.status, myPlayer.effectType, time);
        }

        // Draw HUD
        HUD.draw(ctx, width, height, gameState, myId);

        // Draw notifications
        Effects.drawNotifications(ctx, width, height);
    }

    function getTime() { return time; }

    return { init, start, stop, setGameState, resize, getTime };
})();
