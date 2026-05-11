/**
 * 模拟量信号线性换算核心算法
 */

export interface ConversionParams {
  electricalMin: number; // A: 电信号下限
  electricalMax: number; // B: 电信号上限
  physicalMin: number;   // C: 物理量下限
  physicalMax: number;   // D: 物理量上限
  digitalMin?: number;   // PLC数字化下限 (如 0)
  digitalMax?: number;   // PLC数字化上限 (如 27648)
}

/**
 * 电信号 (X) 转换为 物理量 (y)
 */
export function electricalToPhysical(x: number, params: ConversionParams): number {
  const { electricalMin: a, electricalMax: b, physicalMin: c, physicalMax: d } = params;
  if (b === a) return c;
  const result = c + ((x - a) / (b - a)) * (d - c);
  return Number(result.toFixed(4));
}

/**
 * 物理量 (y) 转换为 电信号 (X)
 */
export function physicalToElectrical(y: number, params: ConversionParams): number {
  const { electricalMin: a, electricalMax: b, physicalMin: c, physicalMax: d } = params;
  if (d === c) return a;
  const result = a + ((y - c) / (d - c)) * (b - a);
  return Number(result.toFixed(4));
}

/**
 * 电信号 (X) 转换为 PLC 数字化整数 (D_val)
 */
export function electricalToDigital(x: number, params: Required<Pick<ConversionParams, 'electricalMin' | 'electricalMax' | 'digitalMin' | 'digitalMax'>>): number {
  const { electricalMin: a, electricalMax: b, digitalMin: dMin, digitalMax: dMax } = params;
  if (b === a) return dMin;
  const result = dMin + ((x - a) / (b - a)) * (dMax - dMin);
  return Math.round(result);
}

/**
 * PLC 数字化整数 (D_val) 转换为 电信号 (X)
 */
export function digitalToElectrical(dVal: number, params: Required<Pick<ConversionParams, 'electricalMin' | 'electricalMax' | 'digitalMin' | 'digitalMax'>>): number {
  const { electricalMin: a, electricalMax: b, digitalMin: dMin, digitalMax: dMax } = params;
  if (dMax === dMin) return a;
  const result = a + ((dVal - dMin) / (dMax - dMin)) * (b - a);
  return Number(result.toFixed(4));
}

/**
 * PLC 数字化整数 (D_val) 转换为 物理量 (y)
 */
export function digitalToPhysical(dVal: number, params: Required<ConversionParams>): number {
  const { physicalMin: c, physicalMax: d, digitalMin: dMin, digitalMax: dMax } = params;
  if (dMax === dMin) return c;
  const result = c + ((dVal - dMin) / (dMax - dMin)) * (d - c);
  return Number(result.toFixed(4));
}

/**
 * 物理量 (y) 转换为 PLC 数字化整数 (D_val)
 */
export function physicalToDigital(y: number, params: Required<ConversionParams>): number {
  const { physicalMin: c, physicalMax: d, digitalMin: dMin, digitalMax: dMax } = params;
  if (d === c) return dMin;
  const result = dMin + ((y - c) / (d - c)) * (dMax - dMin);
  return Math.round(result);
}
