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

  function fitConductivityCalibration(points) {
    if (!Array.isArray(points) || points.length < 2 || points.length > 10) return null;
    var sorted = points.map(function (point) {
      return {x:1 / point.resistance, y:point.conductivity};
    }).sort(function (first, second) { return first.x - second.x; });
    if (sorted.some(function (point) { return !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x <= 0 || point.y <= 0; })) return null;
    var widths = [], secants = [];
    for (var index = 0; index < sorted.length - 1; index++) {
      var width = sorted[index + 1].x - sorted[index].x;
      var rise = sorted[index + 1].y - sorted[index].y;
      if (width <= 0 || rise <= 0) return null;
      widths.push(width);
      secants.push(rise / width);
    }
    var derivatives = [];
    if (sorted.length === 2) {
      derivatives = [secants[0], secants[0]];
    } else {
      var firstEnd = ((2 * widths[0] + widths[1]) * secants[0] - widths[0] * secants[1]) / (widths[0] + widths[1]);
      derivatives.push(firstEnd <= 0 ? 0 : Math.min(firstEnd, 3 * secants[0]));
      for (var inner = 1; inner < sorted.length - 1; inner++) {
        var leftWeight = 2 * widths[inner] + widths[inner - 1];
        var rightWeight = widths[inner] + 2 * widths[inner - 1];
        derivatives.push((leftWeight + rightWeight) / (leftWeight / secants[inner - 1] + rightWeight / secants[inner]));
      }
      var last = widths.length - 1;
      var lastEnd = ((2 * widths[last] + widths[last - 1]) * secants[last] - widths[last] * secants[last - 1]) / (widths[last] + widths[last - 1]);
      derivatives.push(lastEnd <= 0 ? 0 : Math.min(lastEnd, 3 * secants[last]));
    }
    return {points:sorted, derivatives:derivatives};
  }

  function conductivityFromResistance(resistance, calibration) {
    if (!calibration || !Number.isFinite(resistance) || resistance <= 0) return null;
    var conductance = 1 / resistance;
    var points = calibration.points;
    if (Math.abs(conductance - points[0].x) <= points[0].x * 1e-12) return points[0].y;
    if (Math.abs(conductance - points[points.length - 1].x) <= points[points.length - 1].x * 1e-12) return points[points.length - 1].y;
    if (conductance < points[0].x || conductance > points[points.length - 1].x) return null;
    if (conductance === points[points.length - 1].x) return points[points.length - 1].y;
    var index = 0;
    while (conductance > points[index + 1].x) index++;
    var width = points[index + 1].x - points[index].x;
    var fraction = (conductance - points[index].x) / width;
    var square = fraction * fraction;
    var cube = square * fraction;
    return (2 * cube - 3 * square + 1) * points[index].y +
      (cube - 2 * square + fraction) * width * calibration.derivatives[index] +
      (-2 * cube + 3 * square) * points[index + 1].y +
      (cube - square) * width * calibration.derivatives[index + 1];
  }

  function resistanceFromConductivity(conductivity, calibration) {
    if (!calibration || !Number.isFinite(conductivity)) return null;
    var points = calibration.points;
    if (Math.abs(conductivity - points[0].y) <= points[0].y * 1e-12) return 1 / points[0].x;
    if (Math.abs(conductivity - points[points.length - 1].y) <= points[points.length - 1].y * 1e-12) return 1 / points[points.length - 1].x;
    if (conductivity < points[0].y || conductivity > points[points.length - 1].y) return null;
    if (conductivity === points[0].y) return 1 / points[0].x;
    if (conductivity === points[points.length - 1].y) return 1 / points[points.length - 1].x;
    var lower = 1 / points[points.length - 1].x;
    var upper = 1 / points[0].x;
    for (var iteration = 0; iteration < 60; iteration++) {
      var middle = lower + (upper - lower) / 2;
      if (conductivityFromResistance(middle, calibration) > conductivity) lower = middle;
      else upper = middle;
    }
    return lower + (upper - lower) / 2;
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
    fitConductivityCalibration:fitConductivityCalibration,
    conductivityFromResistance:conductivityFromResistance,
    resistanceFromConductivity:resistanceFromConductivity,
    phIdealSlope:phIdealSlope,
    phSlopeAtTemperature:phSlopeAtTemperature,
    phSplit:phSplit,
    phBranchForMv:phBranchForMv,
    phFromMv:phFromMv,
    mvFromPh:mvFromPh,
    fitPhCalibration:fitPhCalibration
  };
})();
