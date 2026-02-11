// ============================================
// HUD MODULE — Timer, Distance, Minimap
// ============================================
const HUD = (() => {

    function draw(ctx, w, h, gameState, myId) {
        if (!gameState || !gameState.players) return;

        const myPlayer = gameState.players.find(p => p.id === myId);
        if (!myPlayer) return;

        drawTimer(ctx, w, gameState.timeRemaining);
        drawDistance(ctx, w, myPlayer.distance);
        drawMinimap(ctx, w, h, gameState.players, myId);
        drawStatusEffect(ctx, w, h, myPlayer);
        drawNextQuestionTimer(ctx, w, h, gameState);
    }

    function drawTimer(ctx, w, timeRemaining) {
        const time = Math.max(0, Math.ceil(timeRemaining));
        const isUrgent = time <= 10;

        ctx.save();

        // Timer background
        const tw = 120;
        const th = 44;
        const tx = w / 2 - tw / 2;
        const ty = 12;

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.roundRect(tx, ty, tw, th, 12);
        ctx.fill();

        // Timer text
        const min = Math.floor(time / 60);
        const sec = time % 60;
        const timeStr = `${min}:${sec.toString().padStart(2, '0')}`;

        ctx.font = '700 22px Outfit';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isUrgent ? '#ff4444' : '#ffffff';
        ctx.fillText(`⏱ ${timeStr}`, w / 2, ty + th / 2);

        ctx.restore();
    }

    function drawDistance(ctx, w, distance) {
        const dist = Math.floor(distance / 10); // Convert to meters
        ctx.save();

        const dw = 100;
        const dh = 34;

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.roundRect(w / 2 - dw / 2, 60, dw, dh, 10);
        ctx.fill();

        ctx.font = '600 16px Outfit';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f5c518';
        ctx.fillText(`${dist}m`, w / 2, 77);

        ctx.restore();
    }

    function drawMinimap(ctx, w, h, players, myId, config) {
        ctx.save();

        const mapW = 36;
        const mapH = h * 0.35;
        const mapX = w - mapW - 12;
        const mapY = 12;

        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.roundRect(mapX, mapY, mapW, mapH, 8);
        ctx.fill();

        // Border
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(mapX, mapY, mapW, mapH, 8);
        ctx.stroke();

        // Start/Finish Lines (Visualization)
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.setLineDash([2, 2]);
        // Finish Line (Top)
        ctx.beginPath();
        ctx.moveTo(mapX + 5, mapY + 25);
        ctx.lineTo(mapX + mapW - 5, mapY + 25);
        ctx.stroke();
        // Start Line (Bottom)
        ctx.beginPath();
        ctx.moveTo(mapX + 5, mapY + mapH - 10);
        ctx.lineTo(mapX + mapW - 5, mapY + mapH - 10);
        ctx.stroke();
        ctx.setLineDash([]);

        // Labels
        ctx.font = '700 8px Inter';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f5c518';
        ctx.fillText('FINISH', mapX + mapW / 2, mapY + 20);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('START', mapX + mapW / 2, mapY + mapH - 2);

        // Fixed Scale Calculation
        // Total distance is estimated based on base speed and race duration
        // We add a small buffer for those who might go over (speed boosts)
        const totalDist = (config ? (config.baseSpeed * config.raceDuration) : 36000) * 1.05;
        const usableHeight = mapH - 45; // Subtract space for labels/lines

        // Draw player dots
        for (const p of players) {
            // Clamp progress between 0 and 1
            const progress = Math.min(1, Math.max(0, p.distance / totalDist));

            // dotY goes from mapY + mapH - 10 (START) to mapY + 25 (FINISH)
            const dotY = (mapY + mapH - 10) - progress * usableHeight;
            const dotX = mapX + mapW / 2;

            // Dot
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(dotX, dotY, p.id === myId ? 5 : 4, 0, Math.PI * 2);
            ctx.fill();

            // Outline for current player
            if (p.id === myId) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(dotX, dotY, 6, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    function drawStatusEffect(ctx, w, h, player) {
        if (player.status === 'normal') return;

        ctx.save();
        const labels = {
            stopped: '💥 DỪNG!',
            spinning: '🌀 LOANG DẦU!',
            rewarded: '⭐ MIỄN NHIỄM!',
            penalized: getPenaltyLabel(player.effectType)
        };

        const label = labels[player.status] || '';
        if (!label) { ctx.restore(); return; }

        const bgW = 200;
        const bgH = 36;
        const bgX = w / 2 - bgW / 2;
        const bgY = h - 130;

        const colors = {
            stopped: 'rgba(233,69,96,0.8)',
            spinning: 'rgba(100,50,200,0.8)',
            rewarded: 'rgba(245,197,24,0.8)',
            penalized: 'rgba(233,69,96,0.8)'
        };

        ctx.fillStyle = colors[player.status] || 'rgba(0,0,0,0.7)';
        ctx.beginPath();
        ctx.roundRect(bgX, bgY, bgW, bgH, 8);
        ctx.fill();

        ctx.font = '700 16px Outfit';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        // Initial draw (will be overridden if there's a timer)
        // Just prepare basic alignment
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';

        // Timer bar
        if (player.effectTimer > 0) {
            // Adjust label position to left
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText(label, bgX + 12, bgY + bgH / 2);

            // Timer bar
            const maxTime = getMaxTime(player.status, player.effectType);
            const ratio = Math.min(1, player.effectTimer / maxTime);
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fillRect(bgX + 4, bgY + bgH - 6, (bgW - 8) * ratio, 3);

            // Draw numerical timer
            const timeLeft = Math.ceil(player.effectTimer * 10) / 10;
            ctx.font = '600 14px Outfit';
            ctx.textAlign = 'right';
            ctx.fillStyle = '#fff';
            ctx.fillText(`${timeLeft}s`, bgX + bgW - 8, bgY + bgH / 2);
        } else {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText(label, w / 2, bgY + bgH / 2);
        }

        ctx.restore();
    }

    function getPenaltyLabel(effectType) {
        switch (effectType) {
            case 'stop': return '🛑 DỪNG LẠI!';
            case 'slow': return '🐌 CHẬM LẠI!';
            case 'reverse': return '🔄 ĐẢO ĐIỀU KHIỂN!';
            case 'blur': return '👻 MỜ MÀN HÌNH!';
            case 'spin': return '🌀 QUAY VÒNG!';
            case 'rocket': return '🚀 BAY VÒNG!';
            case 'bubble': return '🫧 BÓNG BÓNG!';
            default: return '⚠️ PHẠT!';
        }
    }

    function getMaxTime(status, effectType) {
        // Approximate max times for timer bar
        if (status === 'stopped') return 1;
        if (status === 'spinning') return 1.5;
        if (status === 'rewarded') return 2;
        if (status === 'penalized' && (effectType === 'rocket' || effectType === 'bubble')) return 3;
        return 3; // penalized default
    }

    function drawNextQuestionTimer(ctx, w, h, gameState) {
        if (gameState.state !== 'RACING') return;
        if (gameState.questionsUsed >= gameState.maxQuestions) return;

        ctx.save();

        const qx = 20;
        const qy = 120;
        const qw = 40;
        const qh = 40;

        // Background circle
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.arc(qx + qw / 2, qy + qh / 2, 22, 0, Math.PI * 2);
        ctx.fill();

        // Icon "?"
        ctx.font = '700 18px Outfit';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = gameState.nextQuestionIn <= 0 ? '#f5c518' : 'rgba(255,255,255,0.4)';
        ctx.fillText('?', qx + qw / 2, qy + qh / 2);

        // Circular progress / Timer text
        if (gameState.nextQuestionIn > 0) {
            ctx.font = '600 12px Inter';
            ctx.fillStyle = '#fff';
            ctx.fillText(`${Math.ceil(gameState.nextQuestionIn)}s`, qx + qw / 2, qy + qh + 8);
        } else {
            ctx.font = '700 11px Inter';
            ctx.fillStyle = '#f5c518';
            ctx.fillText('READY', qx + qw / 2, qy + qh + 8);
        }

        ctx.restore();
    }

    return { draw };
})();
