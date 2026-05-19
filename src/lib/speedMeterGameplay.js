export function createBallDropEvent({
  dropNumber,
  timestampMs,
  elapsedSeconds,
  responsibleSide = null,
  leftName = '',
  rightName = '',
}) {
  return {
    drop_number: dropNumber,
    timestampMs,
    elapsed_seconds: elapsedSeconds,
    responsible_side: responsibleSide,
    responsible_name: responsibleSide === 'left' ? leftName : responsibleSide === 'right' ? rightName : '',
  };
}

export function createPassOutcome({
  side,
  nowMs,
  lastPressTime,
  lastPressSide,
  distanceMeters,
  elapsedSeconds,
}) {
  const isValidPass = Boolean(lastPressTime && lastPressSide && lastPressSide !== side);
  if (!isValidPass) {
    return {
      hit: null,
      speedKmh: 0,
      shouldPlaySpeedSound: false,
      shouldPlayClickSound: true,
    };
  }

  const timeDiffSeconds = (nowMs - lastPressTime) / 1000;
  const speedKmh = (distanceMeters / timeDiffSeconds) * 3.6;
  return {
    hit: { speed: speedKmh, t: elapsedSeconds, timestampMs: nowMs },
    speedKmh,
    shouldPlaySpeedSound: true,
    shouldPlayClickSound: false,
  };
}
