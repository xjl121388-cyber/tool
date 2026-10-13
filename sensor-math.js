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

  function phSlope(temperature, efficiency) {
    return 59.16 * (temperature + 273.15) / 298.15 * efficiency / 100;
  }

  function phFromMv(millivolts, temperature, offset, efficiency) {
    return 7 - (millivolts - offset) / phSlope(temperature, efficiency);
  }

  function mvFromPh(ph, temperature, offset, efficiency) {
    return offset + (7 - ph) * phSlope(temperature, efficiency);
  }

  function fitPhCalibration(points, temperature) {
    var meanPhDistance = points.reduce(function (sum, point) { return sum + 7 - point.ph; }, 0) / points.length;
    var meanMv = points.reduce(function (sum, point) { return sum + point.mv; }, 0) / points.length;
    var variance = points.reduce(function (sum, point) { return sum + Math.pow(7 - point.ph - meanPhDistance, 2); }, 0);
    if (variance < 1e-8) return null;
    var slope = points.reduce(function (sum, point) {
      return sum + (7 - point.ph - meanPhDistance) * (point.mv - meanMv);
    }, 0) / variance;
    var offset = meanMv - slope * meanPhDistance;
    var efficiency = 100 * slope / phSlope(temperature, 100);
    var residual = points.reduce(function (maximum, point) {
      return Math.max(maximum, Math.abs(point.mv - offset - slope * (7 - point.ph)));
    }, 0);
    return {offset:offset, efficiency:efficiency, residual:residual};
  }

  globalThis.SensorMath = {
    temperatureFactor:temperatureFactor,
    conductivityAtTemperature:conductivityAtTemperature,
    referenceConductivity:referenceConductivity,
    phSlope:phSlope,
    phFromMv:phFromMv,
    mvFromPh:mvFromPh,
    fitPhCalibration:fitPhCalibration
  };
})();
