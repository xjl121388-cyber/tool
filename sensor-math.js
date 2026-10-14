(function () {
  'use strict';

  function temperatureFactor(alpha, temperature) {
    return 1 + (alpha / 100) * (temperature - 25);
  }

  function conductivityAtTemperature(referenceConductivity, alpha, temperature) {
    var factor = temperatureFactor(alpha, temperature);
    return factor > 0 ? referenceConductivity * factor : NaN;
  }

  function referenceConductivity(conductivity, alpha, temperature) {
    var factor = temperatureFactor(alpha, temperature);
    return factor > 0 ? conductivity / factor : NaN;
  }

  function phIdealSlope(temperature) {
    return 59.16 * (temperature + 273.15) / 298.15;
  }

  function phSlopeAtTemperature(slopeFactor, temperature) {
    return slopeFactor * phIdealSlope(temperature);
  }

  function phSplit(calibration, testTemperature) {
    var slope1 = phSlopeAtTemperature(calibration.slope1, testTemperature);
    var slope2 = phSlopeAtTemperature(calibration.slope2, testTemperature);
    if (Math.abs(slope1 - slope2) < 1e-8) return 7;
    var split = 7 - (calibration.offset2 - calibration.offset1) / (slope1 - slope2);
    return split >= -2 && split <= 16 ? split : 7;
  }

  function phBranchForMv(millivolts, testTemperature, calibration) {
    var split = phSplit(calibration, testTemperature);
    var slope1 = phSlopeAtTemperature(calibration.slope1, testTemperature);
    var slope2 = phSlopeAtTemperature(calibration.slope2, testTemperature);
    var ph1 = 7 - (millivolts - calibration.offset1) / slope1;
    var ph2 = 7 - (millivolts - calibration.offset2) / slope2;
    var acidSide = ph1 <= split;
    var alkalineSide = ph2 > split;
    if (acidSide !== alkalineSide) return acidSide ? 1 : 2;
    if (acidSide) return 1;
    return Math.abs(ph1 - split) <= Math.abs(ph2 - split) ? 1 : 2;
  }

  function phFromMv(millivolts, testTemperature, calibration) {
    var branch = phBranchForMv(millivolts, testTemperature, calibration);
    var slope = phSlopeAtTemperature(calibration['slope' + branch], testTemperature);
    return 7 - (millivolts - calibration['offset' + branch]) / slope;
  }

  function mvFromPh(ph, testTemperature, calibration) {
    var branch = ph <= phSplit(calibration, testTemperature) ? 1 : 2;
    var slope = phSlopeAtTemperature(calibration['slope' + branch], testTemperature);
    return calibration['offset' + branch] + (7 - ph) * slope;
  }

  function fitPhCalibration(points, calibrationTemperature) {
    if (points.length !== 3) return null;
    var sorted = points.slice().sort(function (first, second) { return first.ph - second.ph; });
    if (sorted[0].ph >= sorted[1].ph || sorted[1].ph >= sorted[2].ph) return null;
    var slope1 = (sorted[0].mv - sorted[1].mv) / (sorted[1].ph - sorted[0].ph);
    var slope2 = (sorted[1].mv - sorted[2].mv) / (sorted[2].ph - sorted[1].ph);
    return {
      slope1:slope1 / phIdealSlope(calibrationTemperature),
      offset1:sorted[1].mv - (7 - sorted[1].ph) * slope1,
      slope2:slope2 / phIdealSlope(calibrationTemperature),
      offset2:sorted[1].mv - (7 - sorted[1].ph) * slope2
    };
  }

  globalThis.SensorMath = {
    temperatureFactor:temperatureFactor,
    conductivityAtTemperature:conductivityAtTemperature,
    referenceConductivity:referenceConductivity,
    phIdealSlope:phIdealSlope,
    phSlopeAtTemperature:phSlopeAtTemperature,
    phSplit:phSplit,
    phBranchForMv:phBranchForMv,
    phFromMv:phFromMv,
    mvFromPh:mvFromPh,
    fitPhCalibration:fitPhCalibration
  };
})();
