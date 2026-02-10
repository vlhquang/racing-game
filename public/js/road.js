// ============================================
// ROAD MODULE — Infinite Scrolling Road
// ============================================
const Road = (() => {
    let laneCount = 3;
    let laneWidth = 80;
    let roadWidth = 0;
    let roadX = 0;

    // Visual elements
    const grassColor1 = '#3a8c2e';
    const grassColor2 = '#2d7a22';
    const roadColor = '#505050';
    const roadEdgeColor = '#333333';
    const laneMarkColor = '#ffffff';
    const shoulderColor = '#d4a843';

    function init(lanes, lWidth, canvasWidth) {
        laneCount = lanes;
        laneWidth = lWidth;
        roadWidth = laneCount * laneWidth;
        roadX = (canvasWidth - roadWidth) / 2;
    }

    function updateRoadX(canvasWidth) {
        roadX = (canvasWidth - roadWidth) / 2;
    }

    function draw(ctx, distance, canvasWidth, canvasHeight) {
        const w = canvasWidth;
        const h = canvasHeight;
        const d = distance;

        // Grass background
        ctx.fillStyle = grassColor1;
        ctx.fillRect(0, 0, w, h);

        // Grass stripes (scrolling)
        const stripeH = 40;
        const offsetY = d % (stripeH * 2);
        ctx.fillStyle = grassColor2;
        for (let y = -stripeH * 2 + offsetY; y < h + stripeH; y += stripeH * 2) {
            ctx.fillRect(0, y, w, stripeH);
        }

        // Road shoulder
        const shoulderW = 8;
        ctx.fillStyle = shoulderColor;
        ctx.fillRect(roadX - shoulderW, 0, roadWidth + shoulderW * 2, h);

        // Road surface
        ctx.fillStyle = roadColor;
        ctx.fillRect(roadX, 0, roadWidth, h);

        // Road edges
        ctx.fillStyle = roadEdgeColor;
        ctx.fillRect(roadX, 0, 4, h);
        ctx.fillRect(roadX + roadWidth - 4, 0, 4, h);

        // White edge lines
        ctx.fillStyle = '#fff';
        ctx.fillRect(roadX, 0, 3, h);
        ctx.fillRect(roadX + roadWidth - 3, 0, 3, h);

        // Lane dashes
        const dashH = 40;
        const dashGap = 30;
        const dashW = 3;
        ctx.fillStyle = laneMarkColor;
        ctx.globalAlpha = 0.5;
        for (let i = 1; i < laneCount; i++) {
            const x = roadX + i * laneWidth - dashW / 2;
            const totalDash = dashH + dashGap;
            const startOffset = d % totalDash;
            for (let y = -totalDash + startOffset; y < h + totalDash; y += totalDash) {
                ctx.fillRect(x, y, dashW, dashH);
            }
        }
        ctx.globalAlpha = 1.0;

        // Decorative grass details (trees/bushes along road)
        drawRoadsideDecor(ctx, d, canvasWidth, canvasHeight);
    }

    function drawRoadsideDecor(ctx, d, w, h) {
        const spacing = 200;
        const offset = d % spacing;

        for (let y = -spacing + offset; y < h + spacing; y += spacing) {
            // Left side trees
            drawTree(ctx, roadX - 40, y, 0.8);
            // Right side trees
            drawTree(ctx, roadX + roadWidth + 40, y + spacing / 2, 0.8);
        }
    }

    function drawTree(ctx, x, y, scale) {
        const s = scale;
        // Trunk
        ctx.fillStyle = '#5a3a1a';
        ctx.fillRect(x - 4 * s, y, 8 * s, 16 * s);
        // Canopy
        ctx.fillStyle = '#1e7a1e';
        ctx.beginPath();
        ctx.arc(x, y - 4 * s, 18 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2a9a2a';
        ctx.beginPath();
        ctx.arc(x - 6 * s, y - 8 * s, 12 * s, 0, Math.PI * 2);
        ctx.fill();
    }

    function getLaneX(lane) {
        return roadX + lane * laneWidth + laneWidth / 2;
    }

    function getRoadX() { return roadX; }
    function getRoadWidth() { return roadWidth; }
    function getLaneWidth() { return laneWidth; }
    function getLaneCount() { return laneCount; }

    return { init, updateRoadX, draw, getLaneX, getRoadX, getRoadWidth, getLaneWidth, getLaneCount };
})();
