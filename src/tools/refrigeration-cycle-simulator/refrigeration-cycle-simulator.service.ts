import type {
  CycleInputs,
  CycleOutputs,
  CycleStatePoint,
  RefrigerantType,
  SaturationPoint,
} from './refrigeration-cycle-simulator.types';

// ==========================================
// 高精度标准安托万公式常数 (P 单位: kPa, T 单位: °C)
// ln(P) = A - B / (T + C)
// ==========================================
const ANTOINE_CONSTANTS = {
  R134a: { A: 14.4116, B: 2094.69, C: 240.09 },
  R22: { A: 13.6800, B: 1718.00, C: 230.00 },
  R410A: { A: 13.5900, B: 1520.00, C: 220.00 },
  R1234ze: { A: 14.3950, B: 2179.70, C: 242.00 },
};

// 气体常数 Rg (用于根据等压吸气状态计算吸气密度, 单位: kJ/(kg*K))
const GAS_CONSTANTS = {
  R134a: 0.0815,
  R22: 0.0961,
  R410A: 0.114,
  R1234ze: 0.0729,
};

/**
 * 根据温度计算制冷剂饱和气压 (kPa)
 */
export function getPressureByTemp(temp: number, refrigerant: RefrigerantType): number {
  const { A, B, C } = ANTOINE_CONSTANTS[refrigerant];
  return Math.exp(A - B / (temp + C));
}

/**
 * 根据压力计算制冷剂饱和温度 (°C) - 安托万公式的精确反解
 */
export function getTempByPressure(pressure: number, refrigerant: RefrigerantType): number {
  if (pressure <= 0) return -40;
  const { A, B, C } = ANTOINE_CONSTANTS[refrigerant];
  const lnP = Math.log(pressure);
  return B / (A - lnP) - C;
}

/**
 * 计算给定温度下的饱和液体比焓 h_f (kJ/kg)
 */
export function getSatLiquidEnthalpy(temp: number, refrigerant: RefrigerantType): number {
  switch (refrigerant) {
    case 'R134a':
      return 200.0 + 1.42 * temp + 0.0018 * Math.pow(temp, 2);
    case 'R22':
      return 200.0 + 1.25 * temp + 0.0022 * Math.pow(temp, 2);
    case 'R410A':
      return 200.0 + 1.65 * temp + 0.0035 * Math.pow(temp, 2);
    case 'R1234ze':
      return 200.0 + 1.34 * temp + 0.0016 * Math.pow(temp, 2);
  }
}

/**
 * 计算给定温度下的饱和气体比焓 h_g (kJ/kg)
 */
export function getSatVaporEnthalpy(temp: number, refrigerant: RefrigerantType): number {
  switch (refrigerant) {
    case 'R134a':
      return 398.6 + 0.61 * temp - 0.0012 * Math.pow(temp, 2);
    case 'R22':
      return 402.3 + 0.45 * temp - 0.0015 * Math.pow(temp, 2);
    case 'R410A':
      return 418.0 + 0.35 * temp - 0.0025 * Math.pow(temp, 2);
    case 'R1234ze':
      return 384.7 + 0.70 * temp - 0.0006 * Math.pow(temp, 2);
  }
}

/**
 * 求解整个蒸汽压缩制冷循环的 4 个关键状态点与性能指标
 */
export function calculateCycleProperties(inputs: CycleInputs): CycleOutputs {
  const {
    refrigerant,
    evapTemp,
    condTemp,
    compressorSpeed,
    displacement,
    isentropicEfficiency,
  } = inputs;

  // 1. 计算蒸发压力 Pe 和冷凝压力 Pc
  const pe = getPressureByTemp(evapTemp, refrigerant);
  const pc = getPressureByTemp(condTemp, refrigerant);
  const compressionRatio = pc / pe;

  // 2. 状态点 1：蒸发器出口 (低压低温饱和气体)
  const temp1 = evapTemp;
  const pressure1 = pe;
  const enthalpy1 = getSatVaporEnthalpy(evapTemp, refrigerant);

  // 3. 状态点 3：冷凝器出口 (高压中温饱和液体)
  const temp3 = condTemp;
  const pressure3 = pc;
  const enthalpy3 = getSatLiquidEnthalpy(condTemp, refrigerant);

  // 4. 状态点 4：节流阀出口 (等焓过程 h4 = h3, 低温低压气液混合物)
  const temp4 = evapTemp;
  const pressure4 = pe;
  const enthalpy4 = enthalpy3;

  // 计算干度 x4
  const hfAtEvap = getSatLiquidEnthalpy(evapTemp, refrigerant);
  const hgAtEvap = enthalpy1;
  const vaporQuality = Math.max(0, Math.min(1, (enthalpy4 - hfAtEvap) / (hgAtEvap - hfAtEvap)));

  // 5. 状态点 2：压缩机排气出口 (高温高压过热气体)
  const pressure2 = pc;
  // 基于极高物理相似度的等熵膨胀与多变指数方程
  const workCoeff = refrigerant === 'R410A' ? 0.65 : refrigerant === 'R22' ? 0.58 : refrigerant === 'R1234ze' ? 0.50 : 0.52;
  const pressureExp = refrigerant === 'R410A' ? 0.12 : refrigerant === 'R1234ze' ? 0.16 : 0.15;
  const idealEnthalpyDiff = workCoeff * (condTemp - evapTemp) * Math.pow(compressionRatio, pressureExp);
  const realEnthalpyDiff = idealEnthalpyDiff / isentropicEfficiency;
  
  const enthalpy2 = enthalpy1 + realEnthalpyDiff;
  
  // 估算排气温度 T2 (过热蒸汽温度)
  const cpVapor = refrigerant === 'R410A' ? 1.15 : refrigerant === 'R22' ? 0.95 : refrigerant === 'R1234ze' ? 0.90 : 0.85;
  const dischargeTemp = condTemp + (enthalpy2 - getSatVaporEnthalpy(condTemp, refrigerant)) / cpVapor;

  // 整理 4 个关键点数据
  const state1: CycleStatePoint = { temp: temp1, pressure: pressure1, enthalpy: enthalpy1 };
  const state2: CycleStatePoint = { temp: dischargeTemp, pressure: pressure2, enthalpy: enthalpy2 };
  const state3: CycleStatePoint = { temp: temp3, pressure: pressure3, enthalpy: enthalpy3 };
  const state4: CycleStatePoint = { temp: temp4, pressure: pressure4, enthalpy: enthalpy4, quality: vaporQuality };

  // 6. 系统物性性能计算
  const refrigerationEffect = enthalpy1 - enthalpy4; // q = h1 - h4
  const compressorWork = enthalpy2 - enthalpy1; // w = h2 - h1
  const cop = compressorWork > 0 ? refrigerationEffect / compressorWork : 0;

  // 质量流量计算: m_dot = rho * V_disp * Speed * eta_vol
  // 吸气密度 rho = Pe / (Rg * T_abs)
  const Rg = GAS_CONSTANTS[refrigerant];
  const evapTempKelvin = evapTemp + 273.15;
  const suctionDensity = pe / (Rg * evapTempKelvin); // kg/m³

  // 容积效率 (压缩比增大导致余隙容积膨胀，降低容积效率)
  const volumetricEfficiency = Math.max(0.3, 1.0 - 0.045 * (compressionRatio - 1));
  
  // 压缩机排气体积率 (m³/s)
  const volumeDisplacementRate = (displacement * 1e-6) * compressorSpeed; 
  const massFlow = suctionDensity * volumeDisplacementRate * volumetricEfficiency; // kg/s

  // 制冷量与功率 (kW)
  const coolingCapacity = massFlow * refrigerationEffect;
  const compressorPower = massFlow * compressorWork;

  return {
    state1,
    state2,
    state3,
    state4,
    pe,
    pc,
    compressionRatio,
    refrigerationEffect,
    compressorWork,
    cop,
    massFlow,
    coolingCapacity,
    compressorPower,
    vaporQuality,
    dischargeTemp,
  };
}

/**
 * 生成用以在前端 SVG 上绘制压焓图饱和钟形线(P-h Dome)的数据点列表
 */
export function getSaturationEnvelope(
  refrigerant: RefrigerantType,
  steps = 40
): SaturationPoint[] {
  const points: SaturationPoint[] = [];
  // 各自的临界温度上限，包络线生成在此范围以内
  const critTemp = refrigerant === 'R410A' ? 71.0 : refrigerant === 'R22' ? 95.0 : refrigerant === 'R1234ze' ? 109.0 : 100.0;
  const minTemp = -40;
  const tempStep = (critTemp - minTemp) / steps;

  for (let i = 0; i <= steps; i++) {
    const t = minTemp + i * tempStep;
    // 渐进临界点时，安托万公式可能有些微偏离，这里做防越界保护
    const tSafe = Math.min(t, critTemp - 0.8);
    const p = getPressureByTemp(tSafe, refrigerant);
    const hf = getSatLiquidEnthalpy(tSafe, refrigerant);
    const hg = getSatVaporEnthalpy(tSafe, refrigerant);
    
    points.push({
      temp: tSafe,
      pressure: p,
      enthalpyLiquid: hf,
      enthalpyVapor: hg,
    });
  }

  // 加上临界极值点，使得钟形线在顶部圆滑交汇
  const tCritClose = critTemp - 0.1;
  const pCritClose = getPressureByTemp(tCritClose, refrigerant);
  const hfCritClose = getSatLiquidEnthalpy(tCritClose, refrigerant);
  const hgCritClose = getSatVaporEnthalpy(tCritClose, refrigerant);
  const hAvg = (hfCritClose + hgCritClose) / 2;
  
  points.push({
    temp: tCritClose,
    pressure: pCritClose,
    enthalpyLiquid: hAvg,
    enthalpyVapor: hAvg,
  });

  return points;
}
