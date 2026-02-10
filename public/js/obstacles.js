// ============================================
// OBSTACLES MODULE — Cartoon Obstacle Drawing
// ============================================
const Obstacles = (() => {

    function draw(ctx, obstacle, x, y, time) {
        switch (obstacle.type) {
            case 'stone': drawStone(ctx, x, y); break;
            case 'oil': drawOil(ctx, x, y, time); break;
            case 'question': drawQuestionBox(ctx, x, y, time); break;
        }
    }

    function drawStone(ctx, x, y) {
        ctx.save();
        ctx.translate(x, y);

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(3, 5, 22, 14, 0, 0, Math.PI * 2);
        ctx.fill();

        // Main rock body
        ctx.fillStyle = '#8a8a8a';
        ctx.beginPath();
        ctx.moveTo(-18, 5);
        ctx.lineTo(-14, -12);
        ctx.lineTo(-4, -18);
        ctx.lineTo(10, -15);
        ctx.lineTo(18, -5);
        ctx.lineTo(16, 8);
        ctx.lineTo(4, 12);
        ctx.lineTo(-10, 10);
        ctx.closePath();
        ctx.fill();

        // Highlight
        ctx.fillStyle = '#a0a0a0';
        ctx.beginPath();
        ctx.moveTo(-12, -8);
        ctx.lineTo(-4, -16);
        ctx.lineTo(6, -13);
        ctx.lineTo(2, -4);
        ctx.closePath();
        ctx.fill();

        // Dark crack
        ctx.strokeStyle = '#5a5a5a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-6, -10);
        ctx.lineTo(0, 0);
        ctx.lineTo(6, 4);
        ctx.stroke();

        // Exclamation mark
        ctx.fillStyle = '#ff4444';
        ctx.font = '900 16px Outfit';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', 0, -26);

        ctx.restore();
    }

    function drawOil(ctx, x, y, time) {
        ctx.save();
        ctx.translate(x, y);

        // Oil puddle shape - animated wobble
        const wobble = Math.sin(time * 3) * 2;

        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath();
        ctx.ellipse(0, 0, 26 + wobble, 16, 0, 0, Math.PI * 2);
        ctx.fill();

        // Rainbow sheen
        const gradient = ctx.createRadialGradient(-5, -3, 2, 0, 0, 24);
        gradient.addColorStop(0, 'rgba(100, 200, 255, 0.3)');
        gradient.addColorStop(0.4, 'rgba(200, 100, 255, 0.2)');
        gradient.addColorStop(0.7, 'rgba(255, 200, 100, 0.15)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.ellipse(0, 0, 24, 14, 0, 0, Math.PI * 2);
        ctx.fill();

        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.ellipse(-8, -4, 8, 4, -0.3, 0, Math.PI * 2);
        ctx.fill();

        // Drip icon
        ctx.fillStyle = '#4488ff';
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(0, -24);
        ctx.quadraticCurveTo(8, -14, 0, -10);
        ctx.quadraticCurveTo(-8, -14, 0, -24);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    function drawQuestionBox(ctx, x, y, time) {
        ctx.save();
        ctx.translate(x, y);

        const bounce = Math.sin(time * 4) * 3;
        const glow = 0.5 + Math.sin(time * 3) * 0.3;

        // Glow
        ctx.shadowColor = '#f5c518';
        ctx.shadowBlur = 15 * glow;

        // Box body
        const size = 30;
        ctx.fillStyle = '#f5c518';
        ctx.beginPath();
        ctx.roundRect(-size / 2, -size / 2 + bounce, size, size, 6);
        ctx.fill();

        // Box darker top
        ctx.fillStyle = '#d4a810';
        ctx.beginPath();
        ctx.roundRect(-size / 2, -size / 2 + bounce, size, size / 3, [6, 6, 0, 0]);
        ctx.fill();

        // Question mark
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#1a1a2e';
        ctx.font = '900 22px Outfit';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', 0, bounce + 1);

        // Sparkles around
        ctx.fillStyle = '#fff';
        const sparkleAngle = time * 2;
        for (let i = 0; i < 4; i++) {
            const a = sparkleAngle + i * Math.PI / 2;
            const sx = Math.cos(a) * 24;
            const sy = Math.sin(a) * 24 + bounce;
            const ss = 2 + Math.sin(time * 5 + i) * 1;
            ctx.beginPath();
            ctx.arc(sx, sy, ss, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    return { draw };
})();
