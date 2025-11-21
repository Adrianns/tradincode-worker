/**
 * Calculate investment opportunity score (0-100)
 * Conservative long-term investment approach
 *
 * Scoring breakdown:
 * - Price vs MA200: 30 points
 * - RSI Weekly: 20 points
 * - MACD Weekly: 20 points
 * - Volume: 15 points
 * - Bollinger Bands: 15 points
 */
export function calculateScore(indicators, previousAnalysis = null) {
  let score = 0;
  const details = {};

  const {
    price,
    ma50,
    ma200,
    rsiWeekly,
    macdWeekly,
    macdSignal,
    bbUpper,
    bbMiddle,
    bbLower,
    volumeIncreasing,
    volumeChangePercent
  } = indicators;

  // 1. Price vs MA200 (30 points) - Most important for long-term trend
  if (ma200) {
    const distanceFromMA200 = ((price - ma200) / ma200) * 100;

    if (price > ma200) {
      // Price above MA200 is bullish
      if (distanceFromMA200 <= 5) {
        score += 30; // Just above MA200, strong support
        details.ma200Status = 'Just above MA200 - strong support level';
      } else if (distanceFromMA200 <= 15) {
        score += 25; // Moderately above
        details.ma200Status = 'Above MA200 - uptrend confirmed';
      } else {
        score += 15; // Far above, potentially overextended
        details.ma200Status = 'Far above MA200 - overextended';
      }
    } else {
      // Price below MA200
      if (distanceFromMA200 >= -5) {
        score += 20; // Just below, potential bounce
        details.ma200Status = 'Just below MA200 - potential bounce';
      } else if (distanceFromMA200 >= -15) {
        score += 10; // Moderately below
        details.ma200Status = 'Below MA200 - downtrend';
      } else {
        score += 5; // Deep correction, very bearish
        details.ma200Status = 'Far below MA200 - deep correction';
      }
    }
    details.distanceFromMA200 = distanceFromMA200.toFixed(2) + '%';
  }

  // 2. RSI Weekly (20 points) - Look for accumulation zones
  if (rsiWeekly !== null) {
    if (rsiWeekly >= 30 && rsiWeekly <= 50) {
      // Ideal accumulation zone
      score += 20;
      details.rsiStatus = 'Optimal accumulation zone (30-50)';
    } else if (rsiWeekly < 30) {
      // Oversold - great buying opportunity
      score += 18;
      details.rsiStatus = 'Oversold - excellent opportunity';
    } else if (rsiWeekly > 50 && rsiWeekly <= 60) {
      score += 12;
      details.rsiStatus = 'Neutral to bullish';
    } else if (rsiWeekly > 60 && rsiWeekly <= 70) {
      score += 5;
      details.rsiStatus = 'Overbought territory - caution';
    } else {
      score += 0;
      details.rsiStatus = 'Very overbought - avoid buying';
    }
    details.rsiWeekly = rsiWeekly.toFixed(2);
  }

  // 3. MACD Weekly (20 points) - Momentum indicator
  if (macdWeekly !== null && macdSignal !== null) {
    const macdDiff = macdWeekly - macdSignal;

    if (macdWeekly > 0 && macdDiff > 0) {
      // Bullish momentum
      score += 20;
      details.macdStatus = 'Bullish momentum - MACD positive and rising';
    } else if (macdWeekly > 0 && macdDiff <= 0) {
      score += 12;
      details.macdStatus = 'Positive but weakening';
    } else if (macdWeekly <= 0 && macdDiff > 0) {
      score += 15;
      details.macdStatus = 'Negative but improving - potential reversal';
    } else {
      score += 5;
      details.macdStatus = 'Bearish momentum';
    }
    details.macdValue = macdWeekly.toFixed(2);
  }

  // 4. Volume (15 points) - Confirm trend strength
  if (volumeChangePercent !== undefined) {
    if (volumeIncreasing) {
      if (volumeChangePercent > 20) {
        score += 15;
        details.volumeStatus = 'Strong volume increase - trend confirmation';
      } else if (volumeChangePercent > 10) {
        score += 12;
        details.volumeStatus = 'Moderate volume increase';
      } else {
        score += 8;
        details.volumeStatus = 'Slight volume increase';
      }
    } else {
      if (volumeChangePercent < -20) {
        score += 3;
        details.volumeStatus = 'Sharp volume decline - weak trend';
      } else {
        score += 6;
        details.volumeStatus = 'Decreasing volume';
      }
    }
    details.volumeChange = volumeChangePercent.toFixed(2) + '%';
  }

  // 5. Bollinger Bands (15 points) - Volatility and price extremes
  if (bbUpper && bbMiddle && bbLower) {
    const bbPosition = ((price - bbLower) / (bbUpper - bbLower)) * 100;

    if (bbPosition <= 20) {
      // Near lower band - oversold
      score += 15;
      details.bbStatus = 'Near lower band - oversold condition';
    } else if (bbPosition <= 40) {
      score += 12;
      details.bbStatus = 'Below middle - accumulation zone';
    } else if (bbPosition >= 40 && bbPosition <= 60) {
      score += 10;
      details.bbStatus = 'Near middle band - neutral';
    } else if (bbPosition >= 80) {
      score += 3;
      details.bbStatus = 'Near upper band - overbought';
    } else {
      score += 6;
      details.bbStatus = 'Above middle - bullish but elevated';
    }
    details.bbPosition = bbPosition.toFixed(2) + '%';
  }

  // Check for Golden/Death Cross
  if (ma50 && ma200) {
    if (ma50 > ma200) {
      details.crossStatus = 'Golden Cross active - bullish';
    } else {
      details.crossStatus = 'Death Cross active - bearish';
    }
  }

  return {
    score: Math.min(100, Math.max(0, Math.round(score))),
    details
  };
}

/**
 * Determine if an alert should be sent
 */
export function shouldSendAlert(currentScore, previousScore, indicators, previousIndicators) {
  const alerts = [];

  // 1. Significant score change (±15 points)
  if (previousScore !== null) {
    const scoreDiff = currentScore - previousScore;
    if (Math.abs(scoreDiff) >= 15) {
      alerts.push({
        type: 'SCORE_CHANGE',
        severity: scoreDiff > 0 ? 'positive' : 'negative',
        message: `Score changed by ${scoreDiff > 0 ? '+' : ''}${scoreDiff} points`,
        details: { currentScore, previousScore, scoreDiff }
      });
    }
  }

  // 2. Price touches MA200
  if (indicators.ma200 && previousIndicators?.ma200) {
    const currentAboveMA200 = indicators.price > indicators.ma200;
    const previousAboveMA200 = previousIndicators.price > previousIndicators.ma200;
    const distancePercent = Math.abs((indicators.price - indicators.ma200) / indicators.ma200) * 100;

    if (distancePercent < 1) {
      alerts.push({
        type: 'MA200_TOUCH',
        severity: currentAboveMA200 ? 'positive' : 'neutral',
        message: `Price touching MA200 at $${indicators.ma200.toFixed(2)}`,
        details: { price: indicators.price, ma200: indicators.ma200 }
      });
    }

    // Golden/Death Cross detection
    if (indicators.ma50 && previousIndicators.ma50) {
      if (previousIndicators.ma50 <= previousIndicators.ma200 && indicators.ma50 > indicators.ma200) {
        alerts.push({
          type: 'GOLDEN_CROSS',
          severity: 'positive',
          message: 'Golden Cross detected! MA50 crossed above MA200',
          details: { ma50: indicators.ma50, ma200: indicators.ma200 }
        });
      } else if (previousIndicators.ma50 >= previousIndicators.ma200 && indicators.ma50 < indicators.ma200) {
        alerts.push({
          type: 'DEATH_CROSS',
          severity: 'negative',
          message: 'Death Cross detected! MA50 crossed below MA200',
          details: { ma50: indicators.ma50, ma200: indicators.ma200 }
        });
      }
    }
  }

  // 3. RSI weekly extreme zones
  if (indicators.rsiWeekly !== null) {
    if (indicators.rsiWeekly < 30 && (!previousIndicators?.rsiWeekly || previousIndicators.rsiWeekly >= 30)) {
      alerts.push({
        type: 'RSI_OVERSOLD',
        severity: 'positive',
        message: `RSI weekly entered oversold zone (${indicators.rsiWeekly.toFixed(2)})`,
        details: { rsi: indicators.rsiWeekly }
      });
    } else if (indicators.rsiWeekly > 70 && (!previousIndicators?.rsiWeekly || previousIndicators.rsiWeekly <= 70)) {
      alerts.push({
        type: 'RSI_OVERBOUGHT',
        severity: 'negative',
        message: `RSI weekly entered overbought zone (${indicators.rsiWeekly.toFixed(2)})`,
        details: { rsi: indicators.rsiWeekly }
      });
    }
  }

  return alerts;
}

/**
 * Get score interpretation
 */
export function getScoreInterpretation(score) {
  if (score >= 70) {
    return {
      zone: 'ACCUMULATION',
      emoji: '🟢',
      advice: 'Strong accumulation opportunity - favorable for DCA',
      color: 'green'
    };
  } else if (score >= 40) {
    return {
      zone: 'NEUTRAL',
      emoji: '🟡',
      advice: 'Neutral zone - wait for better opportunity',
      color: 'yellow'
    };
  } else {
    return {
      zone: 'CAUTION',
      emoji: '🔴',
      advice: 'Unfavorable conditions - patience recommended',
      color: 'red'
    };
  }
}

export default {
  calculateScore,
  shouldSendAlert,
  getScoreInterpretation
};
