export type RefrigerantType = 'R134a' | 'R22' | 'R410A' | 'R1234ze';

export interface CycleInputs {
  refrigerant: RefrigerantType;
  evapTemp: number; // 蒸发温度 (°C)
  condTemp: number; // 冷凝温度 (°C)
  compressorSpeed: number; // 压缩机频率 (Hz)
  displacement: number; // 压缩机排量 (cm³)
  isentropicEfficiency: number; // 等熵效率 (0-1)
}

export interface CycleStatePoint {
  temp: number; // 温度 (°C)
  pressure: number; // 压力 (kPa)
  enthalpy: number; // 比焓 (kJ/kg)
  quality?: number; // 干度 (0-1，只对低压低温混合态有意义)
}

export interface CycleOutputs {
  state1: CycleStatePoint; // 状态1：蒸发器出口/压缩机入口 (低压低温饱和气体)
  state2: CycleStatePoint; // 状态2：压缩机出口/冷凝器入口 (高压高温过热蒸汽)
  state3: CycleStatePoint; // 状态3：冷凝器出口/节流阀入口 (高压中温饱和/过冷液体)
  state4: CycleStatePoint; // 状态4：节流阀出口/蒸发器入口 (低压低温气液混合物)
  pe: number; // 蒸发压力 (kPa)
  pc: number; // 冷凝压力 (kPa)
  compressionRatio: number; // 压缩比
  refrigerationEffect: number; // 单位质量制冷量 (kJ/kg)
  compressorWork: number; // 单位压缩功 (kJ/kg)
  cop: number; // 性能系数 COP
  massFlow: number; // 质量流量 (kg/s)
  coolingCapacity: number; // 制冷量 (kW)
  compressorPower: number; // 压缩机轴功率 (kW)
  vaporQuality: number; // 节流阀后干度
  dischargeTemp: number; // 排气温度 (°C)
}

// 压焓图上用来画饱和钟形包络线的数据点结构
export interface SaturationPoint {
  enthalpyLiquid: number;
  enthalpyVapor: number;
  pressure: number;
  temp: number;
}
