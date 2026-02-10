// ============================================
// EFFECTS MODULE — Visual Effects
// ============================================
const Effects = (() => {
    const particles = [];
    const notifications = [];

    function spawnHitParticles(x, y, color, count) {
        for (let i = 0; i < (count || 8); i++) {
            particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 200,
                vy: (Math.random() - 0.5) * 200,
                life: 0.5 + Math.random() * 0.3,
                maxLife: 0.5 + Math.random() * 0.3,
                color: color || '#ff6644',
                size: 3 + Math.random() * 4
            });
        }
    }

    function addNotification(text, color, duration) {
        // Only show the newest: clear existing notifications
        notifications.length = 0;

        notifications.push({
            text,
            color: color || '#fff',
            life: duration || 2,
            maxLife: duration || 2,
            y: 0
        });
    }

    function update(dt) {
        // Update particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 300 * dt; // gravity
            p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }

        // Update notifications
        for (let i = notifications.length - 1; i >= 0; i--) {
            const n = notifications[i];
            n.life -= dt;
            n.y -= 30 * dt;
            if (n.life <= 0) notifications.splice(i, 1);
        }
    }

    function drawParticles(ctx) {
        for (const p of particles) {
            const alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawNotifications(ctx, canvasWidth, canvasHeight) {
        for (const n of notifications) {
            const alpha = Math.min(1, n.life / (n.maxLife * 0.3));
            ctx.globalAlpha = alpha;
            ctx.font = '700 24px Outfit';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillText(n.text, canvasWidth / 2 + 2, canvasHeight * 0.35 + n.y + 2);

            ctx.fillStyle = n.color;
            ctx.fillText(n.text, canvasWidth / 2, canvasHeight * 0.35 + n.y);
        }
        ctx.globalAlpha = 1;
    }

    // Screen shake
    let shakeIntensity = 0;
    let shakeDuration = 0;

    function triggerShake(intensity, duration) {
        shakeIntensity = intensity || 5;
        shakeDuration = duration || 0.3;
    }

    function getShakeOffset(dt) {
        if (shakeDuration > 0) {
            shakeDuration -= dt;
            return {
                x: (Math.random() - 0.5) * shakeIntensity * 2,
                y: (Math.random() - 0.5) * shakeIntensity * 2
            };
        }
        return { x: 0, y: 0 };
    }

    // Effect overlays for local player
    function drawEffectOverlay(ctx, w, h, status, effectType, time, config) {
        if (status === 'rewarded') {
            // Golden border glow
            ctx.save();
            ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        } else if (status === 'penalized') {
            if (effectType === 'blur') {
                const opacity = (config && config.penalties && config.penalties.types.blur) ?
                    config.penalties.types.blur.opacity : 0.8;
                ctx.fillStyle = `rgba(0,0,0,${opacity})`;
                ctx.fillRect(0, 0, w, h);
            } else if (effectType === 'reverse') {
                // Red tint
                ctx.fillStyle = `rgba(233,69,96,${0.08 + Math.sin(time * 4) * 0.05})`;
                ctx.fillRect(0, 0, w, h);
            }
        } else if (status === 'stopped') {
            // Impact flash
            ctx.fillStyle = `rgba(255,100,50,${0.1 + Math.sin(time * 10) * 0.05})`;
            ctx.fillRect(0, 0, w, h);
        }
    }

    return {
        spawnHitParticles, addNotification, update,
        drawParticles, drawNotifications,
        triggerShake, getShakeOffset, drawEffectOverlay
    };
})();
