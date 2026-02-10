// ============================================
// CAR MODULE — Cartoon Car Drawing
// ============================================
const Car = (() => {
    // Smooth lane transition
    const laneTransitions = {};

    function updateTransition(playerId, targetLane, dt, speedMultiplier) {
        if (!laneTransitions[playerId]) {
            laneTransitions[playerId] = { current: targetLane };
        }
        const t = laneTransitions[playerId];
        const speed = speedMultiplier || 12; // lerp speed
        t.current += (targetLane - t.current) * Math.min(speed * dt, 1);
        return t.current;
    }

    function getCurrentLane(playerId) {
        return laneTransitions[playerId] ? laneTransitions[playerId].current : 0;
    }

    function draw(ctx, x, y, color, scale, status, effectType, time) {
        const s = scale || 1;
        ctx.save();
        ctx.translate(x, y);

        // Apply effects
        if (status === 'spinning') {
            ctx.rotate(time * 8);
            ctx.globalAlpha = 0.8;
        } else if (status === 'stopped') {
            // Shake effect
            ctx.translate(Math.sin(time * 30) * 3, 0);
        } else if (status === 'rewarded') {
            // Golden glow
            ctx.shadowColor = '#f5c518';
            ctx.shadowBlur = 20;

            // Draw Shield
            ctx.save();
            ctx.strokeStyle = '#f5c518';
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.6 + Math.sin(time * 10) * 0.2; // Pulsing opacity
            ctx.beginPath();
            ctx.arc(0, 0, 45, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
            ctx.fill();
            ctx.stroke();
            ctx.restore();

        } else if (status === 'penalized') {
            if (effectType === 'blur') {
                ctx.globalAlpha = 0.5;
            } else if (effectType === 'spin') {
                ctx.rotate(time * 6);
            }
        }

        ctx.scale(s, s);

        // Car body (cartoon style)
        const w = 36;
        const h = 60;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(2, 4, w / 2 + 2, h / 2 + 2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Main body
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2, w, h, 8);
        ctx.fill();

        // Darker shade on body
        ctx.fillStyle = darkenColor(color, 0.2);
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2, w, h / 2 + 5, [8, 8, 0, 0]);
        ctx.fill();

        // Windshield
        ctx.fillStyle = '#87ceeb';
        ctx.beginPath();
        ctx.roundRect(-w / 2 + 5, -h / 2 + 8, w - 10, 18, 4);
        ctx.fill();
        // Windshield reflection
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.roundRect(-w / 2 + 7, -h / 2 + 10, 10, 14, 3);
        ctx.fill();

        // Rear window
        ctx.fillStyle = '#87ceeb';
        ctx.beginPath();
        ctx.roundRect(-w / 2 + 6, h / 2 - 20, w - 12, 12, 3);
        ctx.fill();

        // Wheels
        ctx.fillStyle = '#222';
        // Front left
        ctx.fillRect(-w / 2 - 4, -h / 2 + 6, 6, 14);
        // Front right
        ctx.fillRect(w / 2 - 2, -h / 2 + 6, 6, 14);
        // Rear left
        ctx.fillRect(-w / 2 - 4, h / 2 - 20, 6, 14);
        // Rear right
        ctx.fillRect(w / 2 - 2, h / 2 - 20, 6, 14);

        // Headlights
        ctx.fillStyle = '#fff3b0';
        ctx.beginPath();
        ctx.arc(-w / 2 + 8, -h / 2 + 2, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(w / 2 - 8, -h / 2 + 2, 4, 0, Math.PI * 2);
        ctx.fill();

        // Tail lights
        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.arc(-w / 2 + 7, h / 2 - 3, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(w / 2 - 7, h / 2 - 3, 3, 0, Math.PI * 2);
        ctx.fill();

        // Racing stripe
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(-3, -h / 2, 6, h);

        ctx.restore();
    }

    function darkenColor(hex, amount) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.max(0, (num >> 16) - Math.floor(255 * amount));
        const g = Math.max(0, ((num >> 8) & 0xff) - Math.floor(255 * amount));
        const b = Math.max(0, (num & 0xff) - Math.floor(255 * amount));
        return `rgb(${r},${g},${b})`;
    }

    function lightenColor(color, amount) {
        // Simple heuristic for lightening hex/rgb
        // If hex
        if (color.startsWith('#')) {
            const num = parseInt(color.replace('#', ''), 16);
            const r = Math.min(255, (num >> 16) + Math.floor(255 * amount));
            const g = Math.min(255, ((num >> 8) & 0xff) + Math.floor(255 * amount));
            const b = Math.min(255, (num & 0xff) + Math.floor(255 * amount));
            return `rgb(${r},${g},${b})`;
        }
        return color; // fallback
    }

    function drawNameTag(ctx, x, y, name, color) {
        ctx.font = '600 12px Inter';
        const metrics = ctx.measureText(name);
        const tw = metrics.width + 12;
        const th = 20;

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.roundRect(x - tw / 2, y - 50, tw, th, 4);
        ctx.fill();

        ctx.fillStyle = color;
        ctx.fillRect(x - tw / 2 + 2, y - 50, 3, th);

        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, x, y - 40);
    }

    return { draw, drawNameTag, updateTransition, getCurrentLane };
})();
