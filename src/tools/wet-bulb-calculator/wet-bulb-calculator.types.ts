export type PressureUnit = 'hPa' | 'kPa' | 'Pa' | 'mmHg' | 'atm';

export interface CalculatorInputs {
  dryBulbTemp: number; // 干球温度 (°C)
  relativeHumidity: number; // 相对湿度 (%)
  pressure: number; // 气压值
  pressureUnit: PressureUnit; // 气压单位
  altitude: number; // 海拔高度 (m)
}

export interface CalculatorOutputs {
  wetBulbTemp: number; // 湿球温度 (°C)
  dewPointTemp: number; // 露点温度 (°C)
  humidityRatio: number; // 含湿量 (g/kg)
  enthalpy: number; // 比焓 (kJ/kg)
  vaporPressure: number; // 实际水蒸气分压力 (hPa)
  satVaporPressure: number; // 饱和水蒸气压 (hPa)
  vaporPressureDeficit: number; // 水蒸气压差/汽压赤字 (hPa)
}

export interface AltitudePreset {
  altitude: number; // 海拔 (m)
  pressure: number; // 默认气压 (hPa)
  label: string; // 标签
}
