import { describe, expect, it } from 'vitest';
import {
  bytesToHexStr,
  calculateCRC16,
  cleanAndParseHex,
  decodeRegisters,
  parseModbusPacket,
} from './modbus-parser.service';

describe('Modbus Parser Service', () => {
  describe('Hex Cleaner & Converter', () => {
    it('should clean and convert non-hex chars, spaces, 0x prefixes', () => {
      const input = ' 0x01, 0x03, 02 0A AB CD ';
      const bytes = cleanAndParseHex(input);
      expect(bytesToHexStr(bytes)).toBe('01 03 02 0A AB CD');
    });

    it('should append a 0 at the end for odd-length hex strings', () => {
      const input = '01030'; // odd length: 5 chars
      const bytes = cleanAndParseHex(input);
      expect(bytesToHexStr(bytes)).toBe('01 03 00');
    });

    it('should return empty Uint8Array for completely empty input', () => {
      const bytes = cleanAndParseHex('  \t \n ');
      expect(bytes.length).toBe(0);
    });
  });

  describe('CRC-16 Modbus Calculation', () => {
    it('should calculate correct CRC-16 for classic 01 03 00 00 00 0A', () => {
      // 01 03 00 00 00 0A has CRC low=C5, high=CD (stored as C5 CD)
      const data = new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x0A]);
      const crc = calculateCRC16(data);
      expect(crc & 0xFF).toBe(0xC5);
      expect((crc >> 8) & 0xFF).toBe(0xCD);
    });
  });

  describe('Modbus RTU Packet Parsing', () => {
    it('should parse Modbus RTU read holding registers request', () => {
      const packet = '01 03 00 02 00 04 E5 C9'; // RTU Read FC 03, starting address 2, qty 4
      const res = parseModbusPacket(packet, 'rtu', 'auto');

      expect(res.isValid).toBe(true);
      expect(res.protocol).toBe('rtu');
      expect(res.direction).toBe('request');
      expect(res.slaveId).toBe(1);
      expect(res.functionCode).toBe(3);
      expect(res.isException).toBe(false);
      expect(res.crcPassed).toBe(true);

      // Fields assertions
      expect(res.fields.some(f => f.name.includes('从机设备地址') && f.value === '1')).toBe(true);
      expect(res.fields.some(f => f.name.includes('功能码') && f.value.startsWith('3'))).toBe(true);
      expect(res.fields.some(f => f.name.includes('起始地址') && f.value.startsWith('2'))).toBe(true);
      expect(res.fields.some(f => f.name.includes('数量') && f.value.startsWith('4'))).toBe(true);
      expect(res.fields.some(f => f.name.includes('CRC-16 校验码') && f.description.includes('校验成功'))).toBe(true);
    });

    it('should detect CRC failure on corrupted RTU packet', () => {
      const packet = '01 03 00 02 00 04 E5 00'; // wrong CRC ending
      const res = parseModbusPacket(packet, 'rtu', 'auto');
      expect(res.crcPassed).toBe(false);
      expect(res.fields.some(f => f.name.includes('CRC-16') && f.description.includes('校验失败'))).toBe(true);
    });

    it('should parse Modbus RTU read holding registers response', () => {
      // RTU Response: Slave ID 1, FC 03, Byte Count 4, Registers: [00 0A], [00 14], CRC: DA 3E
      const packet = '01 03 04 00 0A 00 14 DA 3E';
      const res = parseModbusPacket(packet, 'rtu', 'auto');

      expect(res.isValid).toBe(true);
      expect(res.direction).toBe('response');
      expect(res.slaveId).toBe(1);
      expect(res.functionCode).toBe(3);
      expect(res.isException).toBe(false);
      expect(res.crcPassed).toBe(true);

      expect(res.dataBytes).toBeDefined();
      expect(bytesToHexStr(res.dataBytes!)).toBe('00 0A 00 14');
    });

    it('should parse Modbus RTU exception response', () => {
      // RTU Exception: Slave ID 1, FC 03 | 0x80 = 0x83, Exception Code 02 (Illegal Data Address), CRC: C0 F1
      const packet = '01 83 02 C0 F1';
      const res = parseModbusPacket(packet, 'rtu', 'auto');

      expect(res.isValid).toBe(true);
      expect(res.isException).toBe(true);
      expect(res.functionCode).toBe(0x83);
      expect(res.exceptionCode).toBe(2);
      expect(res.exceptionMeaning).toContain('非法数据地址');
      expect(res.crcPassed).toBe(true);
    });
  });

  describe('Modbus TCP Packet Parsing', () => {
    it('should parse Modbus TCP read registers request', () => {
      // TCP Request: Transaction ID 00 01, Protocol ID 00 00, Length 00 06, Unit ID 01, FC 03, Start Addr 00 00, Qty 00 05
      const packet = '00 01 00 00 00 06 01 03 00 00 00 05';
      const res = parseModbusPacket(packet, 'tcp', 'auto');

      expect(res.isValid).toBe(true);
      expect(res.protocol).toBe('tcp');
      expect(res.direction).toBe('request');
      expect(res.slaveId).toBe(1);
      expect(res.functionCode).toBe(3);

      // Fields assertions
      expect(res.fields.some(f => f.name.includes('事务标识符') && f.value === '1')).toBe(true);
      expect(res.fields.some(f => f.name.includes('协议标识符') && f.value === '0')).toBe(true);
      expect(res.fields.some(f => f.name.includes('后续长度') && f.value === '6 字节')).toBe(true);
      expect(res.fields.some(f => f.name.includes('单元标识符') && f.value === '1')).toBe(true);
    });
  });

  describe('Registers Bytes Decoding into values with multiple Endiannesses', () => {
    it('should decode registers with ABCD, DCBA, CDAB, BADC endianness correctly', () => {
      // Representing float value 12.34
      // In IEEE 754 float: 12.34 is 0x414570A4
      // Registers (2 words / 4 bytes): 41 45 70 A4
      const dataBytes = new Uint8Array([0x41, 0x45, 0x70, 0xA4]);

      // 1. ABCD (Big Endian)
      const rowsABCD = decodeRegisters(dataBytes, 'ABCD');
      expect(rowsABCD[0].uint16).toBe((0x41 << 8) | 0x45); // 16709
      expect(rowsABCD[0].ascii).toBe('AE');
      // For float: ABCD is 12.34
      const floatABCD = Number.parseFloat(rowsABCD[0].float32.replace(/,/g, ''));
      expect(floatABCD).toBeCloseTo(12.34, 2);

      // 2. CDAB (Big-Endian Byte Swap)
      // dataBytes CDAB representation of 12.34 would need the registers to be 70 A4 41 45 so that swapping CDAB -> ABCD is 41 45 70 A4.
      // Let's test decodeRegisters with CDAB endianness on 70 A4 41 45
      const dataCDAB = new Uint8Array([0x70, 0xA4, 0x41, 0x45]);
      const rowsCDAB = decodeRegisters(dataCDAB, 'CDAB');
      const floatCDAB = Number.parseFloat(rowsCDAB[0].float32.replace(/,/g, ''));
      expect(floatCDAB).toBeCloseTo(12.34, 2);

      // 3. DCBA (Little Endian)
      // dataBytes DCBA representation of 12.34 is A4 70 45 41
      const dataDCBA = new Uint8Array([0xA4, 0x70, 0x45, 0x41]);
      const rowsDCBA = decodeRegisters(dataDCBA, 'DCBA');
      const floatDCBA = Number.parseFloat(rowsDCBA[0].float32.replace(/,/g, ''));
      expect(floatDCBA).toBeCloseTo(12.34, 2);

      // 4. BADC (Little-Endian Byte Swap)
      // dataBytes BADC representation of 12.34 is 45 41 A4 70
      const dataBADC = new Uint8Array([0x45, 0x41, 0xA4, 0x70]);
      const rowsBADC = decodeRegisters(dataBADC, 'BADC');
      const floatBADC = Number.parseFloat(rowsBADC[0].float32.replace(/,/g, ''));
      expect(floatBADC).toBeCloseTo(12.34, 2);
    });
  });
});
