import { describe, expect, it } from 'vitest';
import {
  electricalToDigital,
  electricalToPhysical,
  physicalToElectrical,
  physicalToDigital,
  digitalToElectrical,
  digitalToPhysical,
} from './analog-signal-converter.service';

describe('Analog Signal Converter Service', () => {
  const standardParams = {
    electricalMin: 4,   // 4mA
    electricalMax: 20,  // 20mA
    physicalMin: -50,   // -50℃
    physicalMax: 100,   // 100℃
    digitalMin: 0,      // PLC 0
    digitalMax: 27648,  // PLC 27648 (西门子)
  };

  describe('电信号与物理信号的双向线性转换', () => {
    it('电信号 -> 物理量 (4-20mA 对应 -50~100℃)', () => {
      // 4mA 应当对应下限 -50℃
      expect(electricalToPhysical(4, standardParams)).toBe(-50);
      // 20mA 应当对应上限 100℃
      expect(electricalToPhysical(20, standardParams)).toBe(100);
      // 12mA 居中，应当对应 25℃
      expect(electricalToPhysical(12, standardParams)).toBe(25);
      // 10mA，对应量程 3/8，(-50) + 150 * 0.375 = 6.25℃
      expect(electricalToPhysical(10, standardParams)).toBe(6.25);
    });

    it('物理量 -> 电信号 (-50~100℃ 对应 4-20mA)', () => {
      // -50℃ 对应下限 4mA
      expect(physicalToElectrical(-50, standardParams)).toBe(4);
      // 100℃ 对应上限 20mA
      expect(physicalToElectrical(100, standardParams)).toBe(20);
      // 25℃ 对应居中 12mA
      expect(physicalToElectrical(25, standardParams)).toBe(12);
    });

    it('防除以零边界处理', () => {
      const zeroParams = {
        electricalMin: 10,
        electricalMax: 10,
        physicalMin: 20,
        physicalMax: 20,
      };
      // 应该安全返回下限值而不报错或生成 NaN/Infinity
      expect(electricalToPhysical(10, zeroParams)).toBe(20);
      expect(physicalToElectrical(20, zeroParams)).toBe(10);
    });
  });

  describe('与 PLC 数字化整数的换算精度', () => {
    it('电信号 -> PLC 整数 (4-20mA 对应 0-27648)', () => {
      expect(electricalToDigital(4, standardParams)).toBe(0);
      expect(electricalToDigital(20, standardParams)).toBe(27648);
      expect(electricalToDigital(12, standardParams)).toBe(13824); // 50%
    });

    it('PLC 整数 -> 电信号 (0-27648 对应 4-20mA)', () => {
      expect(digitalToElectrical(0, standardParams)).toBe(4);
      expect(digitalToElectrical(27648, standardParams)).toBe(20);
      expect(digitalToElectrical(13824, standardParams)).toBe(12);
    });

    it('PLC 整数 -> 物理量 (0-27648 对应 -50~100℃)', () => {
      expect(digitalToPhysical(0, standardParams)).toBe(-50);
      expect(digitalToPhysical(27648, standardParams)).toBe(100);
      expect(digitalToPhysical(13824, standardParams)).toBe(25);
    });

    it('物理量 -> PLC 整数 (-50~100℃ 对应 0-27648)', () => {
      expect(physicalToDigital(-50, standardParams)).toBe(0);
      expect(physicalToDigital(100, standardParams)).toBe(27648);
      expect(physicalToDigital(25, standardParams)).toBe(13824);
    });
  });
});