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

    function drawMinimap(ctx, w, h, players, myId) {
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

        // Label
        ctx.font = '600 8px Inter';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('MAP', mapX + mapW / 2, mapY + 12);

        // Find distance range
        let minDist = Infinity, maxDist = -Infinity;
        for (const p of players) {
            if (p.distance < minDist) minDist = p.distance;
            if (p.distance > maxDist) maxDist = p.distance;
        }
        const range = Math.max(maxDist - minDist, 500);

        // Draw player dots
        for (const p of players) {
            const norm = (p.distance - minDist) / range;
            const dotY = mapY + mapH - 20 - norm * (mapH - 40);
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
        ctx.fillText(label, w / 2, bgY + bgH / 2);

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
            default: return '⚠️ PHẠT!';
        }
    }

    function getMaxTime(status, effectType) {
        // Approximate max times for timer bar
        if (status === 'stopped') return 1;
        if (status === 'spinning') return 1.5;
        if (status === 'rewarded') return 2;
        return 3; // penalized default
    }

    return { draw };
})();
