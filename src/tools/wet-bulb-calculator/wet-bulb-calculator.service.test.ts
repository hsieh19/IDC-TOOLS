import { describe, expect, it } from 'vitest';
import {
  calculateDewPoint,
  calculateSatVaporPressure,
  calculateWetBulbProperties,
  convertPressure,
  getPressureByAltitude,
} from './wet-bulb-calculator.service';

describe('wet-bulb-calculator service tests', () => {
  describe('convertPressure', () => {
    it('should correctly convert pressure between units', () => {
      // 1 atm = 1013.25 hPa
      expect(convertPressure(1, 'atm', 'hPa')).toBeCloseTo(1013.25, 2);
      // 1013.25 hPa = 101.325 kPa
      expect(convertPressure(1013.25, 'hPa', 'kPa')).toBeCloseTo(101.325, 3);
      // 101325 Pa = 760 mmHg
      expect(convertPressure(101325, 'Pa', 'mmHg')).toBeCloseTo(760, 0);
      // Same unit
      expect(convertPressure(50, 'kPa', 'kPa')).toBe(50);
    });
  });

  describe('getPressureByAltitude', () => {
    it('should estimate atmospheric pressure based on altitude', () => {
      // Sea level
      expect(getPressureByAltitude(0)).toBeCloseTo(1013.25, 1);
      // 1000m
      expect(getPressureByAltitude(1000)).toBeCloseTo(898.76, 1);
      // 2000m
      expect(getPressureByAltitude(2000)).toBeCloseTo(794.98, 1);
    });
  });

  describe('calculateSatVaporPressure', () => {
    it('should calculate saturation vapor pressure accurately', () => {
      // At 0 °C
      expect(calculateSatVaporPressure(0)).toBeCloseTo(611.21, 1);
      // At 25 °C (approx 3167.0 Pa)
      expect(calculateSatVaporPressure(25)).toBeCloseTo(3167.0, 1);
    });
  });

  describe('calculateDewPoint', () => {
    it('should calculate dew point based on vapor pressure', () => {
      // At 0 °C saturation pressure (611.21 Pa), dew point is 0 °C
      expect(calculateDewPoint(611.21)).toBeCloseTo(0.0, 1);
      // Let's test a higher vapor pressure
      expect(calculateDewPoint(3167.0)).toBeCloseTo(25.0, 1);
    });
  });

  describe('calculateWetBulbProperties', () => {
    it('should calculate wet bulb temperature and other parameters correctly', () => {
      // Td = 25 °C, RH = 50%, P = 1013.25 hPa (standard sea level)
      const inputs = {
        dryBulbTemp: 25.0,
        relativeHumidity: 50.0,
        pressure: 1013.25,
        pressureUnit: 'hPa' as const,
        altitude: 0,
      };

      const outputs = calculateWetBulbProperties(inputs);

      // Expected values for 25 °C, 50% RH at standard sea level:
      // Wet bulb ≈ 17.85 °C
      // Dew point ≈ 13.86 °C
      // Sat Vapor Pressure ≈ 31.70 hPa
      // Vapor Pressure ≈ 15.85 hPa
      expect(outputs.wetBulbTemp).toBeCloseTo(17.85, 0.5);
      expect(outputs.dewPointTemp).toBeCloseTo(13.86, 0.5);
      expect(outputs.satVaporPressure).toBeCloseTo(31.7, 0.5);
      expect(outputs.vaporPressure).toBeCloseTo(15.85, 0.5);
      expect(outputs.humidityRatio).toBeGreaterThan(0);
      expect(outputs.enthalpy).toBeGreaterThan(0);
    });

    it('should handle 100% relative humidity where Td == Tw == Tdp', () => {
      const inputs = {
        dryBulbTemp: 20.0,
        relativeHumidity: 100.0,
        pressure: 1013.25,
        pressureUnit: 'hPa' as const,
        altitude: 0,
      };

      const outputs = calculateWetBulbProperties(inputs);

      expect(outputs.wetBulbTemp).toBeCloseTo(20.0, 0.1);
      expect(outputs.dewPointTemp).toBeCloseTo(20.0, 0.1);
    });

    it('should handle high altitude pressure variations correctly', () => {
      // Lower pressure at altitude means higher evaporation cooling, so lower wet bulb temperature for same humidity ratio
      const inputsLowP = {
        dryBulbTemp: 25.0,
        relativeHumidity: 50.0,
        pressure: 800.0, // approx 2000m altitude
        pressureUnit: 'hPa' as const,
        altitude: 2000,
      };

      const outputsLowP = calculateWetBulbProperties(inputsLowP);
      
      // With lower pressure, evaporative cooling is enhanced, so wet bulb temperature should be lower!
      expect(outputsLowP.wetBulbTemp).toBeLessThan(17.85);
    });
  });
});
