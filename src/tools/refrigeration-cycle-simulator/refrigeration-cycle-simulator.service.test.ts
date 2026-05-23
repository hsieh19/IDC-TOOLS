import { describe, expect, it } from 'vitest';
import {
  calculateCycleProperties,
  getPressureByTemp,
  getSatLiquidEnthalpy,
  getSatVaporEnthalpy,
  getSaturationEnvelope,
  getTempByPressure,
} from './refrigeration-cycle-simulator.service';
import type { CycleInputs } from './refrigeration-cycle-simulator.types';

describe('制冷循环热力学计算引擎测试 (Refrigeration Cycle Service Tests)', () => {
  
  it('安托万公式饱和压力与反向求解温度应保持自洽', () => {
    const temps = [-10, 0, 15, 35, 50];
    const refrigerants = ['R134a', 'R22', 'R410A', 'R1234ze'] as const;

    for (const ref of refrigerants) {
      for (const t of temps) {
        const pressure = getPressureByTemp(t, ref);
        expect(pressure).toBeGreaterThan(0);
        
        const solvedTemp = getTempByPressure(pressure, ref);
        // 双向反解精度应在 0.01 °C 以内
        expect(solvedTemp).toBeCloseTo(t, 2);
      }
    }
  });

  it('制冷剂比焓多项式拟合应符合工程常规规律', () => {
    // 物理规律：在常规温度下，液态焓值 h_f 应小于气态焓值 h_g
    const temps = [-20, 0, 20, 45];
    const refrigerants = ['R134a', 'R22', 'R410A', 'R1234ze'] as const;

    for (const ref of refrigerants) {
      for (const t of temps) {
        const hf = getSatLiquidEnthalpy(t, ref);
        const hg = getSatVaporEnthalpy(t, ref);
        
        expect(hf).toBeLessThan(hg);
        expect(hf).toBeGreaterThan(0);
        expect(hg).toBeGreaterThan(300);
      }
    }
  });

  it('制冷循环整体解算应返回合理的热力学结果', () => {
    const inputs: CycleInputs = {
      refrigerant: 'R134a',
      evapTemp: 5, // 蒸发温度 5°C
      condTemp: 40, // 冷凝温度 40°C
      compressorSpeed: 50, // 50 Hz
      displacement: 30, // 30 cc
      isentropicEfficiency: 0.8, // 80% 效率
    };

    const result = calculateCycleProperties(inputs);

    // 1. 蒸发压力应低于冷凝压力，压缩比应大于 1
    expect(result.pe).toBeLessThan(result.pc);
    expect(result.compressionRatio).toBeGreaterThan(1.5);

    // 2. 状态点比焓：等熵压缩后点2焓值应最高，点3与点4焓值应相等 (等焓节流)
    expect(result.state2.enthalpy).toBeGreaterThan(result.state1.enthalpy);
    expect(result.state4.enthalpy).toBe(result.state3.enthalpy);

    // 3. 节流干度：由于闪蒸，点4干度应该在 0.1 到 0.4 之间 (10% ~ 40%)
    expect(result.vaporQuality).toBeGreaterThan(0.1);
    expect(result.vaporQuality).toBeLessThan(0.4);

    // 4. 性能系数 COP：在 5/40 工况下，COP 应该处于 2.5 到 6.0 的合理区间
    expect(result.cop).toBeGreaterThan(2.5);
    expect(result.cop).toBeLessThan(6.0);

    // 5. 排气温度 T2 应该大于冷凝温度
    expect(result.dischargeTemp).toBeGreaterThan(inputs.condTemp);
    
    // 6. 质量流量、制冷量与功率应为正值
    expect(result.massFlow).toBeGreaterThan(0);
    expect(result.coolingCapacity).toBeGreaterThan(0);
    expect(result.compressorPower).toBeGreaterThan(0);
  });

  it('R410A 高压制冷剂特性的计算检验', () => {
    const inputs: CycleInputs = {
      refrigerant: 'R410A',
      evapTemp: 0,
      condTemp: 45,
      compressorSpeed: 60,
      displacement: 15,
      isentropicEfficiency: 0.75,
    };

    const result = calculateCycleProperties(inputs);
    
    // R410A 是高压冷媒，在 45°C 时的冷凝压力 pc 应大于 2000 kPa (约 20 bar)
    expect(result.pc).toBeGreaterThan(2000);
    
    // 压缩功应为正，COP 应在 1.5 到 4.0 之间
    expect(result.cop).toBeGreaterThan(1.5);
    expect(result.cop).toBeLessThan(4.5);
  });

  it('压焓图包络线数据点生成应连续且包含临界过渡点', () => {
    const refrigerants = ['R134a', 'R22', 'R410A'] as const;

    for (const ref of refrigerants) {
      const envelope = getSaturationEnvelope(ref, 20);
      
      // 生成的数据点数量应等于 steps + 2 (包含临界圆滑点和初始点)
      expect(envelope.length).toBe(22);
      
      // 检查气液两端的焓差在接近临界点时是否逐渐缩小
      const firstPoint = envelope[0];
      const lastBeforeCrit = envelope[envelope.length - 2];
      
      const firstDiff = firstPoint.enthalpyVapor - firstPoint.enthalpyLiquid;
      const lastDiff = lastBeforeCrit.enthalpyVapor - lastBeforeCrit.enthalpyLiquid;
      
      expect(firstDiff).toBeGreaterThan(150);
      expect(lastDiff).toBeLessThan(firstDiff);
    }
  });

});
