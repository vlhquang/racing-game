const CONFIG = {
    // Game Settings
    maxPlayers: 4,
    raceDuration: 120,        // seconds
    baseSpeed: 300,           // pixels/sec
    laneWidth: 80,            // pixels

    // Obstacles
    stoneStopTime: 1.0,         // seconds
    oilSpinTime: 1.5,           // seconds
    obstacleSpawnInterval: 0.8, // default spawn interval
    minObstacleGap: 200,        // min distance between obstacles
    initialObstacleDelay: 3.0,  // seconds before first obstacles appear

    // Questions
    questionTime: 7,          // seconds to answer
    correctRewardTime: 2,     // seconds free movement (invincible)
    rewardSpeedMultiplier: 1.1, // 10% speed boost during reward
    questionIntervalMin: 10,  // min seconds between questions
    questionIntervalMax: 15,  // max seconds between questions
    maxQuestions: 5,           // per game

    // Penalty Configuration
    penalties: {
        // Shared penalty types
        types: {
            stop: {
                duration: 3.0,
                speedMultiplier: 0.0
            },
            slow: {
                duration: 3.0,
                speedMultiplier: 0.4 // Reduces speed to 40%
            },
            reverse: {
                duration: 4.0,
                speedMultiplier: 1.0 // Normal speed, just reversed controls
            },
            spin: {
                duration: 2.0,
                speedMultiplier: 0.1 // Reduces speed to 10%
            },
            blur: {
                duration: 5.0,
                speedMultiplier: 1.0, // Normal speed
                opacity: 0.8          // 80% blur opacity
            }
        },

        // Penalties for WRONG answer
        wrongAnswer: {
            durationMultiplier: 1.0, // Multiplier for base durations above
            availableTypes: ['stop', 'slow', 'reverse', 'spin', 'blur']
        },

        // Penalties for NO answer (timeout)
        noAnswer: {
            durationMultiplier: 1.5, // 50% longer duration for ignoring
            availableTypes: ['stop', 'slow', 'reverse', 'spin', 'blur']
        }
    }
};

module.exports = CONFIG;
