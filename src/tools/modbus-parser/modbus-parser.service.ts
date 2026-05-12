/**
 * Modbus 协议解析服务层
 */

export interface ModbusParsedField {
  name: string // 字段名称
  hex: string // 字段十六进制表示
  value: string // 解析后的可读数值
  description: string // 详细含义描述
  startByte: number // 在纯字节数组中的起始索引
  endByte: number // 在纯字节数组中的结束索引 (不含)
}

export interface ModbusParseResult {
  isValid: boolean
  error?: string
  protocol: 'rtu' | 'tcp'
  direction: 'request' | 'response'
  slaveId: number
  functionCode: number
  isException: boolean
  exceptionCode?: number
  exceptionMeaning?: string
  fields: ModbusParsedField[]
  crcPassed?: boolean
  expectedCrc?: string
  actualCrc?: string
  dataBytes?: Uint8Array // 读寄存器响应的数据字节段，用于深度转换
  rawBytes: Uint8Array // 过滤清洗后的原始字节流
}

/**
 * 智能清洗并解析十六进制字符串为字节数组
 */
export function cleanAndParseHex(hexStr: string): Uint8Array {
  // 过滤非十六进制字符 (不区分大小写，保留 0-9, a-f, A-F)
  const cleaned = hexStr.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
  if (cleaned.length === 0) {
    return new Uint8Array(0);
  }

  // 如果长度为奇数，在末尾补0，或者在前面补0？工控中通常在前面补0或者末尾补0。这里我们在奇数长度时，将其看作最末尾多一个0，或提示错误。
  // 为了友好，我们对奇数长度在末尾补0
  let hex = cleaned;
  if (hex.length % 2 !== 0) {
    hex += '0';
  }

  const len = hex.length / 2;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = Number.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * 计算 Modbus CRC-16 校验码 (低字节在前，高字节在后)
 */
export function calculateCRC16(buf: Uint8Array): number {
  let crc = 0xFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      if ((crc & 1) !== 0) {
        crc = (crc >> 1) ^ 0xA001;
      }
      else {
        crc >>= 1;
      }
    }
  }
  return crc;
}

/**
 * 字节转十六进制字符串 (带前导0)
 */
export function byteToHex(b: number): string {
  return b.toString(16).padStart(2, '0').toUpperCase();
}

/**
 * 字节数组转十六进制字符串 (空格分隔)
 */
export function bytesToHexStr(buf: Uint8Array): string {
  return Array.from(buf).map(byteToHex).join(' ');
}

// 异常响应状态码含义映射
const EXCEPTION_MEANINGS: Record<number, string> = {
  1: '非法功能码 (Illegal Function): 接收到的功能码不被从机支持。',
  2: '非法数据地址 (Illegal Data Address): 请求的数据地址在从机中不存在或越界。',
  3: '非法数据值 (Illegal Data Value): 请求的数据值超出从机允许范围。',
  4: '从机设备故障 (Slave Device Failure): 从机执行请求时发生不可恢复的错误。',
  5: '确认响应 (Acknowledge): 从机已接收请求，但需要较长时间处理，先回复确认。',
  6: '从机忙 (Slave Device Busy): 从机正在处理其他长命令，请稍后重试。',
  8: '内存奇偶校验错误 (Memory Parity Error): 从机读取文件或记录时发现奇偶校验错。',
  10: '网关路径不可用 (Gateway Path Unavailable): 网关配置错误，无法转发请求。',
  11: '网关目标设备未响应 (Gateway Target Device Failed to Respond): 网关连接的设备无响应。',
};

// 功能码名称映射
const FUNCTION_CODE_NAMES: Record<number, string> = {
  1: '读线圈状态 (Read Coils)',
  2: '读离散输入状态 (Read Discrete Inputs)',
  3: '读保持寄存器 (Read Holding Registers)',
  4: '读输入寄存器 (Read Input Registers)',
  5: '写单个线圈 (Write Single Coil)',
  6: '写单个寄存器 (Write Single Register)',
  15: '写多个线圈 (Write Multiple Coils)',
  16: '写多个寄存器 (Write Multiple Registers)',
};

/**
 * 解析主入口
 */
export function parseModbusPacket(
  hexInput: string,
  protocol: 'rtu' | 'tcp',
  directionMode: 'auto' | 'request' | 'response',
): ModbusParseResult {
  const bytes = cleanAndParseHex(hexInput);

  if (bytes.length === 0) {
    return {
      isValid: false,
      error: '请输入有效的十六进制报文',
      protocol,
      direction: 'request',
      slaveId: 0,
      functionCode: 0,
      isException: false,
      fields: [],
      rawBytes: bytes,
    };
  }

  // 基础长度校验
  const minLen = protocol === 'rtu' ? 3 : 8; // RTU最少需要设备ID(1B) + 功能码(1B) + CRC/内容(1B)；TCP最少MBAP(7B) + FC(1B)
  if (bytes.length < minLen) {
    return {
      isValid: false,
      error: `报文长度太短，${protocol.toUpperCase()} 模式下至少需要 ${minLen} 字节`,
      protocol,
      direction: 'request',
      slaveId: 0,
      functionCode: 0,
      isException: false,
      fields: [],
      rawBytes: bytes,
    };
  }

  // 1. TCP 头部解析 (MBAP)
  let offset = 0;
  let transactionId = 0;
  let protocolId = 0;
  let tcpLength = 0;
  const fields: ModbusParsedField[] = [];

  if (protocol === 'tcp') {
    if (bytes.length < 7) {
      return {
        isValid: false,
        error: 'TCP报文长度少于MBAP头部的7字节',
        protocol,
        direction: 'request',
        slaveId: 0,
        functionCode: 0,
        isException: false,
        fields: [],
        rawBytes: bytes,
      };
    }

    transactionId = (bytes[0] << 8) | bytes[1];
    protocolId = (bytes[2] << 8) | bytes[3];
    tcpLength = (bytes[4] << 8) | bytes[5];

    fields.push({
      name: '事务标识符 (Transaction ID)',
      hex: bytesToHexStr(bytes.slice(0, 2)),
      value: transactionId.toString(),
      description: '用于TCP同步。客户端每次请求递增，服务器响应用相同ID回复。',
      startByte: 0,
      endByte: 2,
    });

    fields.push({
      name: '协议标识符 (Protocol ID)',
      hex: bytesToHexStr(bytes.slice(2, 4)),
      value: protocolId.toString(),
      description: protocolId === 0 ? '0 (标准 Modbus 协议)' : `${protocolId} (非标准协议)`,
      startByte: 2,
      endByte: 4,
    });

    fields.push({
      name: '后续长度 (Length)',
      hex: bytesToHexStr(bytes.slice(4, 6)),
      value: `${tcpLength} 字节`,
      description: '指示从单元标识符(第7字节)开始到报文结束的字节数。',
      startByte: 4,
      endByte: 6,
    });

    offset = 6;
  }

  // 2. 提取单元标识符 / 设备从机地址
  if (bytes.length <= offset) {
    return {
      isValid: false,
      error: '报文缺少设备地址字段',
      protocol,
      direction: 'request',
      slaveId: 0,
      functionCode: 0,
      isException: false,
      fields,
      rawBytes: bytes,
    };
  }

  const slaveId = bytes[offset];
  fields.push({
    name: protocol === 'rtu' ? '从机设备地址 (Slave ID)' : '单元标识符 (Unit ID)',
    hex: byteToHex(slaveId),
    value: slaveId.toString(),
    description: slaveId === 0 ? '0 (广播地址)' : `${slaveId} (设备站号)`,
    startByte: offset,
    endByte: offset + 1,
  });
  offset += 1;

  // 3. 提取功能码
  if (bytes.length <= offset) {
    return {
      isValid: false,
      error: '报文缺少功能码字段',
      protocol,
      direction: 'request',
      slaveId,
      functionCode: 0,
      isException: false,
      fields,
      rawBytes: bytes,
    };
  }

  const rawFc = bytes[offset];
  const isException = (rawFc & 0x80) !== 0;
  const functionCode = isException ? (rawFc & 0x7F) : rawFc;

  fields.push({
    name: isException ? '异常功能码 (Exception Function Code)' : '功能码 (Function Code)',
    hex: byteToHex(rawFc),
    value: `${rawFc} (0x${rawFc.toString(16).toUpperCase()})`,
    description: isException
      ? `差错标记。原功能码 ${functionCode} (0x${functionCode.toString(16).toUpperCase()}) 发生异常响应。`
      : (FUNCTION_CODE_NAMES[functionCode] || '未知功能码'),
    startByte: offset,
    endByte: offset + 1,
  });
  offset += 1;

  // 4. 异常相应报文特殊解析
  if (isException) {
    if (bytes.length <= offset) {
      return {
        isValid: false,
        error: '异常报文缺失异常码',
        protocol,
        direction: 'response',
        slaveId,
        functionCode: rawFc,
        isException: true,
        fields,
        rawBytes: bytes,
      };
    }

    const exceptionCode = bytes[offset];
    const meaning = EXCEPTION_MEANINGS[exceptionCode] || '未知异常类型';

    fields.push({
      name: '异常码 (Exception Code)',
      hex: byteToHex(exceptionCode),
      value: exceptionCode.toString(),
      description: meaning,
      startByte: offset,
      endByte: offset + 1,
    });
    offset += 1;

    // 针对 RTU 校验尾部的 CRC-16
    let rtuCrcResult = {};
    if (protocol === 'rtu') {
      rtuCrcResult = handleRtuCrc(bytes, offset, fields);
    }

    return {
      isValid: true,
      protocol,
      direction: 'response',
      slaveId,
      functionCode: rawFc,
      isException: true,
      exceptionCode,
      exceptionMeaning: meaning,
      fields,
      rawBytes: bytes,
      ...rtuCrcResult,
    };
  }

  // 5. 智能判断方向 (Request/Response)
  let direction: 'request' | 'response' = 'request';
  const remainingLen = bytes.length - offset - (protocol === 'rtu' ? 2 : 0);

  if (directionMode !== 'auto') {
    direction = directionMode;
  }
  else {
    // 自动判定方向逻辑
    if ([1, 2, 3, 4].includes(functionCode)) {
      // 读功能码
      // 请求：起始地址(2B) + 数量(2B) = 4B 载荷
      // 响应：字节数(1B) + 数据(NB) = 1 + N 字节载荷 (N >= 1)
      if (remainingLen === 4) {
        direction = 'request';
      }
      else if (remainingLen > 1 && bytes[offset] === (remainingLen - 1)) {
        direction = 'response';
      }
      else {
        // 如果无法确定，若报文总长度为 8 (RTU) 或者是 12 (TCP)，概率极高为请求
        const reqLen = protocol === 'rtu' ? 8 : 12;
        direction = bytes.length === reqLen ? 'request' : 'response';
      }
    }
    else if ([5, 6].includes(functionCode)) {
      // 写单线圈/写单寄存器：请求与响应格式完全一致
      direction = 'request'; // 默认视为请求，不影响解析，因为两者字段完全相同
    }
    else if ([15, 16].includes(functionCode)) {
      // 写多线圈/写多寄存器
      // 请求：起始地址(2B) + 数量(2B) + 字节数(1B) + 数据(N B) = 5 + N 字节
      // 响应：起始地址(2B) + 数量(2B) = 4 字节
      if (remainingLen === 4) {
        direction = 'response';
      }
      else {
        direction = 'request';
      }
    }
  }

  // 6. 根据方向和功能码解析数据载荷
  let dataBytes: Uint8Array | undefined;

  try {
    if (direction === 'request') {
      // 解析请求报文
      if ([1, 2, 3, 4, 5, 6, 15, 16].includes(functionCode)) {
        // 绝大多数请求都有起始地址
        if (remainingLen >= 2) {
          const startAddress = (bytes[offset] << 8) | bytes[offset + 1];
          fields.push({
            name: '起始地址 (Starting Address)',
            hex: bytesToHexStr(bytes.slice(offset, offset + 2)),
            value: `${startAddress} (0x${startAddress.toString(16).padStart(4, '0').toUpperCase()})`,
            description: '目标寄存器或线圈的物理起始地址。',
            startByte: offset,
            endByte: offset + 2,
          });
          offset += 2;
        }

        // 读指令/写多指令 请求有“寄存器/线圈数量”
        if ([1, 2, 3, 4, 15, 16].includes(functionCode) && remainingLen >= 4) {
          const quantity = (bytes[offset] << 8) | bytes[offset + 1];
          const unit = [1, 2, 15].includes(functionCode) ? '个线圈 (Bits)' : '个寄存器 (Words)';
          fields.push({
            name: '数量 (Quantity)',
            hex: bytesToHexStr(bytes.slice(offset, offset + 2)),
            value: `${quantity} ${unit}`,
            description: '请求读写的目标数据数量。',
            startByte: offset,
            endByte: offset + 2,
          });
          offset += 2;
        }

        // 写单个指令 (05, 06) 请求有“写入数值”
        if ([5, 6].includes(functionCode) && remainingLen >= 4) {
          const writeVal = (bytes[offset] << 8) | bytes[offset + 1];
          let desc = '';
          let readableVal = writeVal.toString();
          if (functionCode === 5) {
            if (writeVal === 0xFF00) {
              readableVal = 'ON (开启)';
              desc = '写单个线圈置位为导通状态。';
            }
            else if (writeVal === 0x0000) {
              readableVal = 'OFF (关闭)';
              desc = '写单个线圈置位为断开状态。';
            }
            else {
              readableVal = `未知 (0x${writeVal.toString(16).toUpperCase()})`;
              desc = '非标准写线圈值。标准只允许 0xFF00 或 0x0000。';
            }
          }
          else {
            desc = '写单个保持寄存器的整数值。';
          }

          fields.push({
            name: '写入值 (Write Value)',
            hex: bytesToHexStr(bytes.slice(offset, offset + 2)),
            value: readableVal,
            description: desc,
            startByte: offset,
            endByte: offset + 2,
          });
          offset += 2;
        }

        // 写多个指令 (15, 16) 请求有“字节数”和“写入数据流”
        if ([15, 16].includes(functionCode) && remainingLen >= 5) {
          const byteCount = bytes[offset];
          fields.push({
            name: '写入数据字节数 (Byte Count)',
            hex: byteToHex(byteCount),
            value: `${byteCount} 字节`,
            description: '指示后续携带的写入具体数值的数据总长度。',
            startByte: offset,
            endByte: offset + 1,
          });
          offset += 1;

          const dataLen = Math.min(byteCount, bytes.length - offset - (protocol === 'rtu' ? 2 : 0));
          if (dataLen > 0) {
            const payload = bytes.slice(offset, offset + dataLen);
            fields.push({
              name: '写入原始数据 (Write Data Payload)',
              hex: bytesToHexStr(payload),
              value: '[二进制数据块]',
              description: '具体的寄存器数值或线圈二进制位流。',
              startByte: offset,
              endByte: offset + dataLen,
            });
            offset += dataLen;
          }
        }
      }
    }
    else {
      // 解析响应报文
      if ([1, 2, 3, 4].includes(functionCode)) {
        // 读响应含有“字节数”和“数据区”
        if (remainingLen >= 1) {
          const byteCount = bytes[offset];
          fields.push({
            name: '返回字节数 (Byte Count)',
            hex: byteToHex(byteCount),
            value: `${byteCount} 字节`,
            description: `指示返回的数据区的字节总数。对应 ${[1, 2].includes(functionCode) ? byteCount * 8 : byteCount / 2} 个寄存器/线圈量。`,
            startByte: offset,
            endByte: offset + 1,
          });
          offset += 1;

          const dataLen = Math.min(byteCount, bytes.length - offset - (protocol === 'rtu' ? 2 : 0));
          if (dataLen > 0) {
            dataBytes = bytes.slice(offset, offset + dataLen);
            fields.push({
              name: '返回数据 (Read Data Payload)',
              hex: bytesToHexStr(dataBytes),
              value: '[返回数据流]',
              description: '从机返回的寄存器数值或线圈位流字节区。',
              startByte: offset,
              endByte: offset + dataLen,
            });
            offset += dataLen;
          }
        }
      }
      else if ([5, 6, 15, 16].includes(functionCode)) {
        // 写响应（5, 6, 15, 16的响应主要是原样返回地址和数量/值，以便确认）
        if (remainingLen >= 2) {
          const startAddress = (bytes[offset] << 8) | bytes[offset + 1];
          fields.push({
            name: '起始地址 (Starting Address)',
            hex: bytesToHexStr(bytes.slice(offset, offset + 2)),
            value: `${startAddress} (0x${startAddress.toString(16).padStart(4, '0').toUpperCase()})`,
            description: '确认响应：写成功的起始数据物理地址。',
            startByte: offset,
            endByte: offset + 2,
          });
          offset += 2;
        }

        if (remainingLen >= 4) {
          const quantityOrVal = (bytes[offset] << 8) | bytes[offset + 1];
          let name = '写入数量/确认值';
          let desc = '';
          let readableVal = quantityOrVal.toString();

          if (functionCode === 5) {
            name = '确认写入值';
            readableVal = quantityOrVal === 0xFF00 ? 'ON' : 'OFF';
            desc = '线圈写入状态确认。';
          }
          else if (functionCode === 6) {
            name = '确认写入值';
            desc = '保持寄存器写入数值确认。';
          }
          else {
            name = '确认写入数量';
            desc = `指示成功写入的${functionCode === 15 ? '线圈' : '寄存器'}数量。`;
          }

          fields.push({
            name,
            hex: bytesToHexStr(bytes.slice(offset, offset + 2)),
            value: readableVal,
            description: desc,
            startByte: offset,
            endByte: offset + 2,
          });
          offset += 2;
        }
      }
    }
  }
  catch (err) {
    // 容错捕获
  }

  // 7. 处理 RTU 尾部 CRC-16
  let rtuCrcResult = {};
  if (protocol === 'rtu') {
    rtuCrcResult = handleRtuCrc(bytes, offset, fields);

    // 如果有多余的未解析字节，并且不是因为CRC，将其作为“额外垃圾字节”处理
    const expectedCrcIdx = bytes.length - 2;
    if (offset < expectedCrcIdx && expectedCrcIdx > 0) {
      const extraBytes = bytes.slice(offset, expectedCrcIdx);
      fields.push({
        name: '未定义冗余数据 (Unparsed Redundant Bytes)',
        hex: bytesToHexStr(extraBytes),
        value: `共 ${extraBytes.length} 字节`,
        description: '报文尾部多余的无法根据当前功能码解析的数据。',
        startByte: offset,
        endByte: expectedCrcIdx,
      });
    }
  }
  else {
    // TCP 额外数据
    if (offset < bytes.length) {
      const extraBytes = bytes.slice(offset);
      fields.push({
        name: '未定义冗余数据 (Unparsed Redundant Bytes)',
        hex: bytesToHexStr(extraBytes),
        value: `共 ${extraBytes.length} 字节`,
        description: 'TCP 报文尾部超出长度的冗余内容。',
        startByte: offset,
        endByte: bytes.length,
      });
    }
  }

  return {
    isValid: true,
    protocol,
    direction,
    slaveId,
    functionCode,
    isException: false,
    fields,
    dataBytes,
    rawBytes: bytes,
    ...rtuCrcResult,
  };
}

/**
 * RTU 报文的 CRC 校验处理函数
 */
function handleRtuCrc(bytes: Uint8Array, offset: number, fields: ModbusParsedField[]) {
  if (bytes.length < 2) {
    return {
      crcPassed: false,
      expectedCrc: 'N/A',
      actualCrc: 'N/A',
    };
  }

  const payloadForCrc = bytes.slice(0, bytes.length - 2);
  const calculated = calculateCRC16(payloadForCrc);
  const expectedCrcLow = calculated & 0xFF;
  const expectedCrcHigh = (calculated >> 8) & 0xFF;

  const actualCrcLow = bytes[bytes.length - 2];
  const actualCrcHigh = bytes[bytes.length - 1];

  const actualCrcStr = `${byteToHex(actualCrcLow)} ${byteToHex(actualCrcHigh)}`;
  const expectedCrcStr = `${byteToHex(expectedCrcLow)} ${byteToHex(expectedCrcHigh)}`;

  const crcPassed = (actualCrcLow === expectedCrcLow) && (actualCrcHigh === expectedCrcHigh);

  fields.push({
    name: 'CRC-16 校验码 (CRC-16 Modbus)',
    hex: bytesToHexStr(bytes.slice(bytes.length - 2)),
    value: `0x${((actualCrcHigh << 8) | actualCrcLow).toString(16).toUpperCase().padStart(4, '0')}`,
    description: crcPassed
      ? `校验成功。基于前 ${payloadForCrc.length} 字节算出的 CRC 符合报文末尾值。`
      : `校验失败！报文中为 [${actualCrcStr}]，但根据内容算出的校验码应为 [${expectedCrcStr}]。`,
    startByte: bytes.length - 2,
    endByte: bytes.length,
  });

  return {
    crcPassed,
    expectedCrc: expectedCrcStr,
    actualCrc: actualCrcStr,
  };
}

/**
 * 将寄存器字节数据区深度转换
 */
export interface DecodedRegisterRow {
  offset: number // 寄存器偏移 (如 0, 1, 2...)
  addressOffset: string // 地址相对偏移 (如 +0, +1, +2...)
  hex: string // 字节十六进制
  uint16: number // 16位无符号
  int16: number // 16位有符号
  uint32: string // 32位无符号
  int32: string // 32位有符号
  float32: string // 32位浮点数 (IEEE 754)
  ascii: string // ASCII 文本
  binary: string // 16位二进制表示
}

/**
 * 深度解析读保持/读输入寄存器响应的字节流
 * @param dataBytes 纯数据字节区 (N字节，偶数)
 * @param endian 32位端序 'ABCD' | 'DCBA' | 'CDAB' | 'BADC'
 */
export function decodeRegisters(dataBytes: Uint8Array, endian: 'ABCD' | 'DCBA' | 'CDAB' | 'BADC'): DecodedRegisterRow[] {
  const rows: DecodedRegisterRow[] = [];
  const wordCount = Math.floor(dataBytes.length / 2);

  for (let i = 0; i < wordCount; i++) {
    const idx = i * 2;
    const b0 = dataBytes[idx];
    const b1 = dataBytes[idx + 1];

    // 16-bit 无符号与有符号
    const uint16 = (b0 << 8) | b1;
    const int16 = uint16 >= 0x8000 ? uint16 - 0x10000 : uint16;

    // 二进制位
    const binary = uint16.toString(2).padStart(16, '0').replace(/(.{4})/g, '$1 ').trim();

    // ASCII
    const char0 = (b0 >= 32 && b0 <= 126) ? String.fromCharCode(b0) : '.';
    const char1 = (b1 >= 32 && b1 <= 126) ? String.fromCharCode(b1) : '.';
    const ascii = char0 + char1;

    // 32-bit 类型需要组合当前寄存器和下一个寄存器
    let uint32Str = 'N/A';
    let int32Str = 'N/A';
    let float32Str = 'N/A';

    if (i < wordCount - 1) {
      const idxNext = idx + 2;
      const b2 = dataBytes[idxNext];
      const b3 = dataBytes[idxNext + 1];

      // 端序字节重排
      let reordered: [number, number, number, number];
      switch (endian) {
        case 'DCBA': // 纯小端
          reordered = [b3, b2, b1, b0];
          break;
        case 'CDAB': // 字节交换，大端双字
          reordered = [b2, b3, b0, b1];
          break;
        case 'BADC': // 字节交换，小端双字
          reordered = [b1, b0, b3, b2];
          break;
        case 'ABCD': // 纯大端 (标准)
        default:
          reordered = [b0, b1, b2, b3];
          break;
      }

      const buf = new Uint8Array(reordered);
      const view = new DataView(buf.buffer);

      const u32 = view.getUint32(0, false);
      uint32Str = u32.toString();

      const i32 = view.getInt32(0, false);
      int32Str = i32.toString();

      const f32 = view.getFloat32(0, false);
      // 对浮点数进行美化输出，防止长尾，最大保留6位有效数字，或在无效时处理为 NaN
      float32Str = Number.isNaN(f32) ? 'NaN' : (f32 === 0 ? '0' : f32.toLocaleString('zh-CN', { maximumFractionDigits: 5 }));
    }

    rows.push({
      offset: i,
      addressOffset: `+${i}`,
      hex: `${byteToHex(b0)} ${byteToHex(b1)}`,
      uint16,
      int16,
      uint32: uint32Str,
      int32: int32Str,
      float32: float32Str,
      ascii,
      binary,
    });
  }

  return rows;
}
