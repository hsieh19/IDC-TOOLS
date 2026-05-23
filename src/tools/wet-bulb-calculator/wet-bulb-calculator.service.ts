import type { CalculatorInputs, CalculatorOutputs, PressureUnit } from './wet-bulb-calculator.types';

// 气压单位换算比例 (以 Pa 为基准，1 Pa = 1)
export const PRESSURE_CONVERSION_RATES: Record<PressureUnit, number> = {
  Pa: 1.0,
  hPa: 100.0, // 1 hPa = 100 Pa (等于 1 mbar)
  kPa: 1000.0, // 1 kPa = 1000 Pa
  mmHg: 133.322387415, // 1 mmHg ≈ 133.322 Pa
  atm: 101325.0, // 1 atm = 101325 Pa
};

/**
 * 将气压值从一个单位转换到另一个单位
 */
export function convertPressure(value: number, fromUnit: PressureUnit, toUnit: PressureUnit): number {
  if (fromUnit === toUnit) return value;
  const valueInPa = value * PRESSURE_CONVERSION_RATES[fromUnit];
  return valueInPa / PRESSURE_CONVERSION_RATES[toUnit];
}

/**
 * 根据海拔高度 (m) 估算标准大气压 (单位：hPa)
 * 使用国际标准大气模型 (ISA)
 */
export function getPressureByAltitude(altitude: number): number {
  // P = P0 * (1 - L * h / T0) ^ (g * M / (R * L))
  // hPa 为单位：P0 = 1013.25, L = 0.0065, T0 = 288.15
  const basePressure = 1013.25;
  const standardTempLapseRate = 0.0065;
  const standardTempAtSeaLevel = 288.15;
  const exponent = 5.25588;

  const pressure = basePressure * Math.pow(1 - (standardTempLapseRate * altitude) / standardTempAtSeaLevel, exponent);
  return Math.max(0, pressure);
}

/**
 * Arden Buck 公式：计算饱和水蒸气分压力 (单位：Pa)
 * @param temp 温度 (°C)
 */
export function calculateSatVaporPressure(temp: number): number {
  if (temp >= 0) {
    // 水面饱和水蒸气压公式
    return 611.21 * Math.exp((17.502 * temp) / (240.97 + temp));
  } else {
    // 冰面饱和水蒸气压公式
    return 611.15 * Math.exp((22.452 * temp) / (272.55 + temp));
  }
}

/**
 * 反向 Arden Buck 公式：根据实际水蒸气分压力 (单位：Pa) 计算露点温度 (°C)
 */
export function calculateDewPoint(vaporPressure: number): number {
  if (vaporPressure <= 0.0) return -100.0; // 极干燥情况下的安全默认值

  if (vaporPressure >= 611.21) {
    const x = Math.log(vaporPressure / 611.21);
    return (240.97 * x) / (17.502 - x);
  } else {
    const x = Math.log(vaporPressure / 611.15);
    return (272.55 * x) / (22.452 - x);
  }
}

/**
 * 计算湿球温度及其他暖通参数
 */
export function calculateWetBulbProperties(inputs: CalculatorInputs): CalculatorOutputs {
  const { dryBulbTemp, relativeHumidity, pressure, pressureUnit } = inputs;

  // 1. 统一将大气压转换为 Pa
  const pPa = pressure * PRESSURE_CONVERSION_RATES[pressureUnit];

  // 2. 计算干球温度下的饱和水蒸气压 (Pa)
  const esTd = calculateSatVaporPressure(dryBulbTemp);

  // 3. 计算实际水蒸气分压 (Pa)
  // 相对湿度限制在 0 - 100% 之间
  const rhClamped = Math.max(0.0, Math.min(100.0, relativeHumidity));
  const e = esTd * (rhClamped / 100.0);

  // 4. 计算露点温度 (°C)
  const tdp = calculateDewPoint(e);

  // 5. 二分法迭代求解湿球温度 Tw
  // 湿球温度必然介于露点温度和干球温度之间: tdp <= Tw <= Td
  let wetBulbTemp = dryBulbTemp;

  if (rhClamped >= 99.9) {
    wetBulbTemp = dryBulbTemp;
  } else if (rhClamped <= 0.1) {
    // 极度干燥情况下，湿球温度接近理论极值，用二分法求解
    wetBulbTemp = solveWetBulbBisection(dryBulbTemp, tdp, e, pPa);
  } else {
    wetBulbTemp = solveWetBulbBisection(dryBulbTemp, tdp, e, pPa);
  }

  // 6. 计算含湿量 W (g/kg干空气)
  // 避免分母为0
  const denominator = Math.max(1.0, pPa - e);
  const humidityRatio = 621.98 * (e / denominator); // 克/千克干空气

  // 7. 计算空气比焓 h (kJ/kg干空气)
  // h = 1.006 * Td + W * (2501 + 1.86 * Td) / 1000
  const enthalpy = 1.006 * dryBulbTemp + (humidityRatio / 1000.0) * (2501.0 + 1.86 * dryBulbTemp);

  // 8. 转换输出压强指标为 hPa (mbar) 便于阅读
  const paToHpa = 1 / PRESSURE_CONVERSION_RATES.hPa;

  return {
    wetBulbTemp: Math.round(wetBulbTemp * 100) / 100, // 保留两位小数
    dewPointTemp: Math.round(tdp * 100) / 100,
    humidityRatio: Math.round(humidityRatio * 100) / 100,
    enthalpy: Math.round(enthalpy * 100) / 100,
    vaporPressure: Math.round(e * paToHpa * 100) / 100,
    satVaporPressure: Math.round(esTd * paToHpa * 100) / 100,
    vaporPressureDeficit: Math.round(Math.max(0, esTd - e) * paToHpa * 100) / 100,
  };
}

/**
 * 使用二分法求解湿球温度
 * @param td 干球温度 (°C)
 * @param tdp 露点温度 (°C)
 * @param e 实际蒸气压 (Pa)
 * @param pPa 大气压 (Pa)
 */
function solveWetBulbBisection(td: number, tdp: number, e: number, pPa: number): number {
  let low = tdp;
  let high = td;
  let mid = (low + high) / 2.0;

  // 24次迭代可使精度达到极其精确的水平: (td - tdp) / 2^24 < 0.00001
  for (let i = 0; i < 30; i++) {
    mid = (low + high) / 2.0;
    const esMid = calculateSatVaporPressure(mid);

    const A = mid >= 0.0 ? 6.62e-4 : 5.82e-4;

    // 湿球方程估算的水蒸气压
    const eEstimated = esMid - A * pPa * (td - mid);

    if (eEstimated > e) {
      high = mid; // 估算气压偏高，说明湿球温度设高了，向低温方向收敛
    } else {
      low = mid; // 估算气压偏低，说明湿球温度设低了，向高温方向收敛
    }

    if (Math.abs(high - low) < 0.0001) {
      break;
    }
  }

  return (low + high) / 2.0;
}
