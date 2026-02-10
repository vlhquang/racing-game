// ============================================
// INPUT MODULE — Touch + Keyboard Controls
// ============================================
const Input = (() => {
    let onLeft = null;
    let onRight = null;
    let leftPressed = false;
    let rightPressed = false;
    let leftInterval = null;
    let rightInterval = null;
    const HOLD_RATE = 180; // ms between repeated moves when holding

    function init(leftCb, rightCb) {
        onLeft = leftCb;
        onRight = rightCb;

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'a') {
                e.preventDefault();
                if (!leftPressed) {
                    leftPressed = true;
                    onLeft();
                    leftInterval = setInterval(onLeft, HOLD_RATE);
                }
            }
            if (e.key === 'ArrowRight' || e.key === 'd') {
                e.preventDefault();
                if (!rightPressed) {
                    rightPressed = true;
                    onRight();
                    rightInterval = setInterval(onRight, HOLD_RATE);
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'a') {
                leftPressed = false;
                clearInterval(leftInterval);
            }
            if (e.key === 'ArrowRight' || e.key === 'd') {
                rightPressed = false;
                clearInterval(rightInterval);
            }
        });

        // Mobile buttons
        const btnLeft = document.getElementById('btn-left');
        const btnRight = document.getElementById('btn-right');

        // Touch events for left button
        btnLeft.addEventListener('touchstart', (e) => {
            e.preventDefault();
            onLeft();
            leftInterval = setInterval(onLeft, HOLD_RATE);
        });
        btnLeft.addEventListener('touchend', (e) => {
            e.preventDefault();
            clearInterval(leftInterval);
        });
        btnLeft.addEventListener('touchcancel', () => clearInterval(leftInterval));

        // Touch events for right button
        btnRight.addEventListener('touchstart', (e) => {
            e.preventDefault();
            onRight();
            rightInterval = setInterval(onRight, HOLD_RATE);
        });
        btnRight.addEventListener('touchend', (e) => {
            e.preventDefault();
            clearInterval(rightInterval);
        });
        btnRight.addEventListener('touchcancel', () => clearInterval(rightInterval));

        // Mouse fallback for desktop
        btnLeft.addEventListener('mousedown', () => {
            onLeft();
            leftInterval = setInterval(onLeft, HOLD_RATE);
        });
        btnLeft.addEventListener('mouseup', () => clearInterval(leftInterval));
        btnLeft.addEventListener('mouseleave', () => clearInterval(leftInterval));

        btnRight.addEventListener('mousedown', () => {
            onRight();
            rightInterval = setInterval(onRight, HOLD_RATE);
        });
        btnRight.addEventListener('mouseup', () => clearInterval(rightInterval));
        btnRight.addEventListener('mouseleave', () => clearInterval(rightInterval));

        // Swipe detection on canvas
        let touchStartX = 0;
        let touchStartY = 0;
        const canvas = document.getElementById('game-canvas');

        canvas.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
        }, { passive: true });

        canvas.addEventListener('touchend', (e) => {
            const touch = e.changedTouches[0];
            const dx = touch.clientX - touchStartX;
            const dy = touch.clientY - touchStartY;
            if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {
                if (dx < 0) onLeft();
                else onRight();
            }
        }, { passive: true });
    }

    return { init };
})();
