<script setup lang="ts">
import { computed, ref } from 'vue';
import { useMessage } from 'naive-ui';
import { AlertTriangle, Check, Copy, Refresh, Trash } from '@vicons/tabler';
import {
  byteToHex,
  bytesToHexStr,
  calculateCRC16,
  decodeRegisters,
  parseModbusPacket,
} from './modbus-parser.service';

const message = useMessage();

// 状态管理
const hexInput = ref('01 03 04 41 45 70 A4 DA 3E'); // 默认大精度浮点数12.34
const protocol = ref<'rtu' | 'tcp'>('rtu');
const directionMode = ref<'auto' | 'request' | 'response'>('auto');
const endian = ref<'ABCD' | 'DCBA' | 'CDAB' | 'BADC'>('ABCD');
const selectedFormat = ref<'uint16' | 'int16' | 'uint32' | 'int32' | 'float32' | 'ascii' | 'binary'>('float32');

const is32BitFormat = computed(() => {
  return ['float32', 'uint32', 'int32'].includes(selectedFormat.value);
});

const formatOptions = [
  { label: '32位浮点数 (Float32)', value: 'float32' },
  { label: '16位无符号整数 (Uint16)', value: 'uint16' },
  { label: '16位有符号整数 (Int16)', value: 'int16' },
  { label: '32位无符号整数 (Uint32)', value: 'uint32' },
  { label: '32位有符号整数 (Int32)', value: 'int32' },
  { label: 'ASCII 字符串', value: 'ascii' },
  { label: '16位二进制位 (Binary Bits)', value: 'binary' },
];

const endianOptions = [
  { label: 'ABCD (标准大端)', value: 'ABCD' },
  { label: 'CDAB (双字交换)', value: 'CDAB' },
  { label: 'BADC (单字交换)', value: 'BADC' },
  { label: 'DCBA (纯小端)', value: 'DCBA' },
];

const formatEnglishMap: Record<string, string> = {
  uint16: 'Uint16',
  int16: 'Int16',
  uint32: 'Uint32',
  int32: 'Int32',
  float32: 'Float32',
  ascii: 'ASCII',
  binary: 'Binary',
};

// 核心解析计算
const parseResult = computed(() => {
  return parseModbusPacket(hexInput.value, protocol.value, directionMode.value);
});

// 寄存器深度转译计算
const decodedRegistersList = computed(() => {
  if (parseResult.value.isValid && parseResult.value.dataBytes) {
    return decodeRegisters(parseResult.value.dataBytes, endian.value);
  }
  return [];
});

// CRC 一键修复
function repairCrc() {
  if (!parseResult.value.isValid || protocol.value !== 'rtu') {
    return;
  }
  const bytes = parseResult.value.rawBytes;
  if (bytes.length < 3) {
    return;
  }

  const payload = bytes.slice(0, bytes.length - 2);
  const correctCrc = calculateCRC16(payload);
  const low = correctCrc & 0xFF;
  const high = (correctCrc >> 8) & 0xFF;

  const cleanHexList = Array.from(payload).map(byteToHex);
  cleanHexList.push(byteToHex(low));
  cleanHexList.push(byteToHex(high));

  hexInput.value = cleanHexList.join(' ');
  message.success('CRC-16 校验码修复成功！');
}

// 清空输入
function clearInput() {
  hexInput.value = '';
}

// 复制文本
async function copyToClipboard(text: string, msg: string = '已复制到剪贴板') {
  try {
    await navigator.clipboard.writeText(text);
    message.success(msg);
  }
  catch (err) {
    message.error('复制失败，请手动选择复制');
  }
}

// 报文字段着色系统 (设计美学：彩色高对比渐变)
const fieldColors = [
  'var(--blue-color, #3b82f6)', // 0: MBAP 事务 / RTU 头
  'var(--purple-color, #a855f7)', // 1: MBAP 协议
  'var(--pink-color, #ec4899)', // 2: MBAP 长度
  'var(--amber-color, #f59e0b)', // 3: 设备地址 / 单元ID
  'var(--emerald-color, #10b981)', // 4: 功能码
  'var(--teal-color, #14b8a6)', // 5: 起始地址 / 字节数
  'var(--indigo-color, #6366f1)', // 6: 数量 / 写入值
  'var(--cyan-color, #06b6d4)', // 7: 写入原始数据 / 数据Payload
  'var(--red-color, #ef4444)', // 8: CRC
];

// 将解析出的字段结合着色系统
const parsedFieldsWithColors = computed(() => {
  if (!parseResult.value.isValid) {
    return [];
  }
  return parseResult.value.fields.map((field, idx) => {
    // 强制把 CRC 字段染成红色，以便在任何位置 CRC 都是红色的警告标志
    const isCrc = field.name.toLowerCase().includes('crc');
    return {
      ...field,
      color: isCrc ? '#ef4444' : fieldColors[idx % fieldColors.length],
    };
  });
});

// 获取每个字节对应属于哪个字段的颜色索引，用于顶部报文高亮切片
const byteToColorMap = computed(() => {
  const map: Record<number, string> = {};
  if (!parseResult.value.isValid) {
    return map;
  }

  parsedFieldsWithColors.value.forEach((field) => {
    for (let i = field.startByte; i < field.endByte; i++) {
      map[i] = field.color;
    }
  });
  return map;
});

// --- 混合寄存器映射解析 (Mixed Mapping Rules) ---
interface CustomMappingItem {
  id: string
  offset: number
  name: string
  format: 'uint16' | 'int16' | 'uint32' | 'int32' | 'float32' | 'ascii' | 'binary'
}

const customMappings = ref<CustomMappingItem[]>([
  { id: '1', offset: 0, name: '设备电压', format: 'float32' },
  { id: '2', offset: 2, name: '设备电流', format: 'float32' },
  { id: '3', offset: 4, name: '工作功率', format: 'uint16' },
  { id: '4', offset: 5, name: '开关状态', format: 'binary' },
]);

function addCustomMapping() {
  const nextOffset = customMappings.value.length > 0
    ? Math.max(...customMappings.value.map(m => m.offset)) + 1
    : 0;
  customMappings.value.push({
    id: Date.now().toString(),
    offset: nextOffset,
    name: `采集数据点_${customMappings.value.length + 1}`,
    format: 'uint16',
  });
  message.success('已新增解析项');
}

function deleteCustomMapping(id: string) {
  customMappings.value = customMappings.value.filter(m => m.id !== id);
  message.info('已移除解析项');
}

function restoreDefaultCustomMappings() {
  customMappings.value = [
    { id: '1', offset: 0, name: '设备电压', format: 'float32' },
    { id: '2', offset: 2, name: '设备电流', format: 'float32' },
    { id: '3', offset: 4, name: '工作功率', format: 'uint16' },
    { id: '4', offset: 5, name: '开关状态', format: 'binary' },
  ];
  message.success('已恢复经典配置模板');
}

// 混合格式数据流深度解析列表
const parsedCustomMappingList = computed(() => {
  const dataBytes = parseResult.value.dataBytes;
  if (!dataBytes) {
    return [];
  }

  return customMappings.value.map((item) => {
    const startByte = item.offset * 2;
    const is32 = ['float32', 'uint32', 'int32'].includes(item.format);
    const reqBytes = is32 ? 4 : 2;

    if (startByte + reqBytes > dataBytes.length) {
      return {
        ...item,
        hex: '-',
        value: '越界 (Out of bounds)',
        isOob: true,
      };
    }

    const slice = dataBytes.slice(startByte, startByte + reqBytes);
    const hexStr = Array.from(slice).map(byteToHex).join(' ');

    let parsedVal = '-';
    if (!is32) {
      // 16-bit
      const b0 = slice[0];
      const b1 = slice[1];
      const uint16 = (b0 << 8) | b1;
      if (item.format === 'uint16') {
        parsedVal = uint16.toString();
      }
      else if (item.format === 'int16') {
        parsedVal = (uint16 >= 0x8000 ? uint16 - 0x10000 : uint16).toString();
      }
      else if (item.format === 'binary') {
        parsedVal = uint16.toString(2).padStart(16, '0').replace(/(.{4})/g, '$1 ').trim();
      }
      else if (item.format === 'ascii') {
        const char0 = (b0 >= 32 && b0 <= 126) ? String.fromCharCode(b0) : '.';
        const char1 = (b1 >= 32 && b1 <= 126) ? String.fromCharCode(b1) : '.';
        parsedVal = char0 + char1;
      }
    }
    else {
      // 32-bit
      const b0 = slice[0];
      const b1 = slice[1];
      const b2 = slice[2];
      const b3 = slice[3];

      let reordered: [number, number, number, number];
      switch (endian.value) {
        case 'DCBA':
          reordered = [b3, b2, b1, b0];
          break;
        case 'CDAB':
          reordered = [b2, b3, b0, b1];
          break;
        case 'BADC':
          reordered = [b1, b0, b3, b2];
          break;
        case 'ABCD':
        default:
          reordered = [b0, b1, b2, b3];
          break;
      }

      const buf = new Uint8Array(reordered);
      const view = new DataView(buf.buffer);

      if (item.format === 'uint32') {
        parsedVal = view.getUint32(0, false).toString();
      }
      else if (item.format === 'int32') {
        parsedVal = view.getInt32(0, false).toString();
      }
      else if (item.format === 'float32') {
        const f32 = view.getFloat32(0, false);
        parsedVal = Number.isNaN(f32) ? 'NaN' : (f32 === 0 ? '0' : f32.toLocaleString('zh-CN', { maximumFractionDigits: 5 }));
      }
    }

    return {
      ...item,
      hex: hexStr,
      value: parsedVal,
      isOob: false,
    };
  });
});
</script>

<template>
  <div class="modbus-parser-container py-12px">
    <n-grid cols="1 lg:12" :x-gap="16" :y-gap="16" item-responsive>
      <!-- 1. 左侧配置输入控制区 -->
      <n-grid-item span="1 lg:5">
        <div class="h-full flex flex-col gap-16px">
          <!-- 核心设置卡片 -->
          <n-card title="⚙️ 参数配置" size="medium" class="rounded-8px shadow-sm">
            <div class="flex flex-col gap-14px">
              <!-- 协议模式切换 -->
              <div>
                <span class="mb-6px block text-13px text-neutral-500 font-600">传输模式</span>
                <n-radio-group v-model:value="protocol" name="protocol-group">
                  <n-radio-button value="rtu">
                    Modbus RTU (串行总线)
                  </n-radio-button>
                  <n-radio-button value="tcp">
                    Modbus TCP (以太网/网关)
                  </n-radio-button>
                </n-radio-group>
              </div>

              <!-- 智能方向判定 -->
              <div>
                <span class="mb-6px block text-13px text-neutral-500 font-600">报文方向</span>
                <n-radio-group v-model:value="directionMode" name="direction-group">
                  <n-radio-button value="auto">
                    🤖 智能自动识别
                  </n-radio-button>
                  <n-radio-button value="request">
                    📤 发送请求 (Request)
                  </n-radio-button>
                  <n-radio-button value="response">
                    📥 接收响应 (Response)
                  </n-radio-button>
                </n-radio-group>
              </div>
            </div>
          </n-card>

          <!-- 报文输入卡片 -->
          <n-card size="medium" class="flex-1 rounded-8px shadow-sm">
            <template #header>
              <div class="flex items-center justify-between">
                <span>📝 报文输入 (Hex 十六进制)</span>
                <div class="flex items-center gap-8px">
                  <n-button size="tiny" quaternary type="warning" @click="clearInput">
                    <template #icon>
                      <n-icon :component="Trash" />
                    </template>
                    清空
                  </n-button>
                </div>
              </div>
            </template>

            <div class="h-full flex flex-col gap-12px">
              <n-input
                v-model:value="hexInput"
                type="textarea"
                placeholder="请输入十六进制报文，可包含空格、换行、逗号或 0x 前缀..."
                :autosize="{ minRows: 4, maxRows: 8 }"
                class="text-14px font-600 tracking-wide font-mono"
                style="background-color: rgba(120, 120, 120, 0.03);"
              />
            </div>
          </n-card>
        </div>
      </n-grid-item>

      <!-- 2. 右侧实时解析结果区 -->
      <n-grid-item span="1 lg:7">
        <div class="flex flex-col gap-16px">
          <!-- 解析看板卡片 -->
          <n-card title="🔍 实时解析结果" size="medium" class="rounded-8px shadow-sm">
            <!-- 2.1 报文合法状态 -->
            <div v-if="!parseResult.isValid" class="py-32px text-center text-neutral-400">
              <n-icon :component="AlertTriangle" size="40" class="mb-8px text-amber-500" />
              <p class="text-15px text-neutral-600 font-600 dark:text-neutral-400">
                {{ parseResult.error }}
              </p>
              <p class="mt-4px text-12px">
                请在左侧输入区内，粘贴规范的十六进制数据报文流。
              </p>
            </div>

            <div v-else class="flex flex-col gap-16px">
              <!-- 2.2 视觉高亮拆解分段区 (WOW Point) -->
              <div class="border border-neutral-200/40 rounded-8px bg-neutral-100/10 p-12px dark:bg-neutral-800/10">
                <span class="mb-8px block text-11px text-neutral-400 font-600 tracking-wider uppercase">📦 报文结构彩色拆解 (点击对应字节可对照字段)</span>

                <div class="flex flex-wrap gap-x-6px gap-y-8px text-16px font-bold leading-relaxed tracking-wider font-mono">
                  <div
                    v-for="(b, i) in parseResult.rawBytes"
                    :key="i"
                    class="byte-chip"
                    :style="{
                      backgroundColor: byteToColorMap[i] ? `${byteToColorMap[i]}15` : 'transparent',
                      borderColor: byteToColorMap[i] || 'rgba(120, 120, 120, 0.2)',
                      color: byteToColorMap[i] || 'inherit',
                    }"
                  >
                    {{ byteToHex(b) }}
                    <span class="byte-index">{{ i }}</span>
                  </div>
                </div>
              </div>

              <!-- 2.3 异常报警卡片 -->
              <div v-if="parseResult.isException" class="exception-banner">
                <div class="flex items-start gap-12px">
                  <n-icon :component="AlertTriangle" size="24" class="mt-2px text-red-500" />
                  <div>
                    <div class="text-red-500 font-bold">
                      Modbus 设备返回异常响应 (Exception Code {{ parseResult.exceptionCode }})
                    </div>
                    <div class="mt-4px text-13px text-neutral-600 leading-relaxed dark:text-neutral-300">
                      {{ parseResult.exceptionMeaning }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- 2.4 CRC 错误提示与快捷修复 -->
              <div v-if="protocol === 'rtu' && parseResult.crcPassed === false" class="crc-warning-banner">
                <div class="w-full flex flex-wrap items-center justify-between gap-12px">
                  <div class="flex items-center gap-10px">
                    <n-icon :component="AlertTriangle" size="22" class="text-red-500" />
                    <div>
                      <span class="text-red-500 font-bold">CRC-16 校验失败！</span>
                      <span class="text-12px text-neutral-500 dark:text-neutral-400">
                        实际报文末尾：<strong class="text-red-500 font-mono">[{{ parseResult.actualCrc }}]</strong>，而根据数据算出的校验码应为：<strong class="text-teal-500 font-mono">[{{ parseResult.expectedCrc }}]</strong>。
                      </span>
                    </div>
                  </div>
                  <n-button size="small" type="primary" secondary @click="repairCrc">
                    <template #icon>
                      <n-icon :component="Refresh" />
                    </template>
                    一键更正报文
                  </n-button>
                </div>
              </div>

              <!-- 2.5 CRC 校验成功轻反馈 -->
              <div v-if="protocol === 'rtu' && parseResult.crcPassed === true" class="crc-success-banner">
                <div class="flex items-center gap-10px text-emerald-600 dark:text-emerald-500">
                  <n-icon :component="Check" size="18" />
                  <span class="text-12px font-600">RTU 报文 CRC-16 (Modbus) 校验一致，报文完整。</span>
                </div>
              </div>

              <!-- 2.6 属性字段详情拆解列表 -->
              <div class="flex flex-col gap-10px">
                <div
                  v-for="field in parsedFieldsWithColors"
                  :key="field.name"
                  class="field-card"
                  :style="{ borderLeftColor: field.color }"
                >
                  <div class="flex items-start justify-between">
                    <div>
                      <div class="field-title flex items-center gap-6px">
                        <span class="field-dot" :style="{ backgroundColor: field.color }" />
                        {{ field.name }}
                      </div>
                      <div class="field-desc mt-2px text-12px text-neutral-400 leading-relaxed">
                        {{ field.description }}
                      </div>
                    </div>

                    <div class="flex flex-col items-end text-right">
                      <div class="field-bytes rounded bg-neutral-100 px-6px py-2px text-13px font-700 font-mono dark:bg-neutral-800" :style="{ color: field.color }">
                        {{ field.hex }}
                      </div>
                      <div class="field-val mt-4px text-14px text-neutral-700 font-600 dark:text-neutral-200">
                        {{ field.value }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </n-card>
        </div>
      </n-grid-item>
    </n-grid>

    <!-- 3. 数据区深度端序解析卡片 (当且仅当为读响应且包含有效数据区时，进行 WOW 展示) -->
    <div v-if="parseResult.isValid && parseResult.dataBytes" class="mt-16px">
      <n-card size="medium" class="rounded-8px shadow-sm">
        <template #header>
          <span class="flex items-center gap-8px">
            ⚙️ 响应报文解析
          </span>
        </template>

        <n-tabs type="line" animated class="mb-12px">
          <!-- 1. 全局格式解析 -->
          <n-tab-pane name="global" tab="⚖️ 全局格式解析">
            <div class="mb-14px mt-10px flex flex-wrap items-center gap-24px border-b border-neutral-200/5 pb-14px">
              <div class="flex items-center gap-8px">
                <span class="text-13px text-neutral-500 font-600">目标格式:</span>
                <n-select
                  v-model:value="selectedFormat"
                  :options="formatOptions"
                  size="small"
                  style="width: 220px"
                />
              </div>
              <div class="flex items-center gap-8px">
                <span class="text-13px text-neutral-500 font-600">32位端序:</span>
                <n-select
                  v-model:value="endian"
                  :options="endianOptions"
                  :disabled="!is32BitFormat"
                  size="small"
                  style="width: 180px"
                  placeholder="不适用"
                />
                <span v-if="!is32BitFormat" class="text-11px text-neutral-400 dark:text-neutral-500">
                  (当前16位格式无需端序转换)
                </span>
              </div>
            </div>

            <div class="overflow-x-auto">
              <table class="data-table">
                <thead>
                  <tr>
                    <th width="120">
                      寄存器偏移
                    </th>
                    <th width="160">
                      字节 Hex
                    </th>
                    <th class="highlight-th text-center">
                      {{ formatEnglishMap[selectedFormat] || selectedFormat }} 解析值
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in decodedRegistersList" :key="row.offset">
                    <td class="text-center text-neutral-400 font-bold font-mono dark:text-neutral-500">
                      {{ row.addressOffset }}
                    </td>
                    <td class="bg-teal-500/5 text-center text-teal-600 font-700 font-mono dark:text-teal-400">
                      {{ row.hex }}
                    </td>
                    <td class="bg-amber-500/5 py-10px text-center text-amber-500 font-bold font-mono">
                      <span v-if="row[selectedFormat] === 'N/A' || row[selectedFormat] === undefined" class="text-neutral-300 dark:text-neutral-700">-</span>
                      <span v-else class="flex items-center justify-center gap-10px whitespace-nowrap">
                        {{ row[selectedFormat] }}
                        <n-button
                          size="tiny"
                          quaternary
                          circle
                          type="warning"
                          style="width: 20px; height: 20px;"
                          @click="copyToClipboard(String(row[selectedFormat]), '已复制当前值')"
                        >
                          <template #icon><n-icon :component="Copy" size="12" /></template>
                        </n-button>
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="mt-14px flex items-center justify-between border-t border-neutral-200/5 pt-10px text-11px text-neutral-400">
              <div>💡 <strong>说明：</strong> 32位数据类型解析需要连续合并 2 个保持寄存器的数据（4字节）。当前行与下一行寄存器根据您选中的端序进行重排并反算。最后一项不满足4字节时自动留空。</div>
              <div class="flex items-center gap-12px font-serif">
                <span>ABCD: 施耐德 / 标准大端</span>
                <span>CDAB: 西门子 S7 (字节序交换)</span>
              </div>
            </div>
          </n-tab-pane>

          <!-- 2. 混合偏移映射解析 -->
          <n-tab-pane name="mixed" tab="🧩 混合偏移自定义">
            <!-- 规则配置编辑器 -->
            <div class="mb-16px mt-10px border border-neutral-200/10 rounded-8px bg-neutral-50/50 p-14px dark:bg-neutral-900/40">
              <!-- Header Row -->
              <div class="mb-14px flex flex-wrap items-center justify-between gap-12px border-b border-neutral-200/5 pb-10px">
                <div class="flex flex-wrap items-center gap-12px">
                  <span class="text-13px text-neutral-500 font-700">📋 解析规则配置</span>
                  <!-- Global Endianness Radio Group for Mixed Mode -->
                  <div class="flex items-center gap-6px rounded-4px bg-neutral-100/10 px-8px py-4px dark:bg-neutral-800/10">
                    <span class="text-11px text-neutral-400">全局端序:</span>
                    <n-radio-group v-model:value="endian" size="small" name="endian-mixed-group">
                      <n-radio-button value="ABCD">
                        ABCD
                      </n-radio-button>
                      <n-radio-button value="CDAB">
                        CDAB
                      </n-radio-button>
                      <n-radio-button value="BADC">
                        BADC
                      </n-radio-button>
                      <n-radio-button value="DCBA">
                        DCBA
                      </n-radio-button>
                    </n-radio-group>
                  </div>
                </div>
                <div class="flex items-center gap-10px">
                  <n-button size="tiny" secondary type="warning" @click="restoreDefaultCustomMappings">
                    🔄 重置模板
                  </n-button>
                  <n-button size="tiny" type="primary" @click="addCustomMapping">
                    ➕ 新增规则
                  </n-button>
                </div>
              </div>

              <!-- Column Titles for Grid -->
              <div v-if="customMappings.length > 0" class="grid grid-cols-12 mb-6px gap-8px px-8px text-11px text-neutral-400 font-600">
                <div class="col-span-1 text-center">
                  #
                </div>
                <div class="col-span-2 pl-4px">
                  寄存器偏移
                </div>
                <div class="col-span-4 pl-4px">
                  数据名称
                </div>
                <div class="col-span-4 pl-4px">
                  目标数据格式
                </div>
                <div class="col-span-1 text-center">
                  操作
                </div>
              </div>

              <!-- 解析项循环配置 (以极其精美紧凑的单行 Grid 呈现) -->
              <div class="max-h-320px flex flex-col gap-6px overflow-y-auto pr-4px">
                <div v-if="customMappings.length === 0" class="py-16px text-center text-12px text-neutral-400">
                  暂无解析规则，点击右上角 “新增规则” 开始配置。
                </div>
                <div
                  v-for="(item, index) in customMappings"
                  :key="item.id"
                  class="grid grid-cols-12 items-center gap-8px border border-neutral-200/5 rounded-6px bg-white p-6px shadow-sm transition-all duration-200 hover:border-neutral-300/20 dark:bg-neutral-800/60"
                >
                  <div class="col-span-1 text-center text-12px text-neutral-400 font-bold font-mono">
                    {{ index + 1 }}
                  </div>
                  <div class="col-span-2">
                    <n-input-number
                      v-model:value="item.offset"
                      size="small"
                      :min="0"
                      :max="99"
                      placeholder="偏移"
                      class="w-full"
                    />
                  </div>
                  <div class="col-span-4">
                    <n-input
                      v-model:value="item.name"
                      size="small"
                      placeholder="例如：设备温度"
                      class="w-full font-600"
                    />
                  </div>
                  <div class="col-span-4">
                    <n-select
                      v-model:value="item.format"
                      :options="formatOptions"
                      size="small"
                      class="w-full"
                    />
                  </div>
                  <div class="col-span-1 text-center">
                    <n-button
                      size="small"
                      circle
                      type="error"
                      quaternary
                      style="width: 24px; height: 24px;"
                      @click="deleteCustomMapping(item.id)"
                    >
                      <template #icon>
                        <n-icon :component="Trash" size="14" />
                      </template>
                    </n-button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 规则解析结果展示表格 -->
            <div class="overflow-x-auto">
              <table class="data-table">
                <thead>
                  <tr>
                    <th width="100">
                      寄存器偏移
                    </th>
                    <th width="110">
                      数据名称
                    </th>
                    <th width="90">
                      目标格式
                    </th>
                    <th width="120">
                      提取字节 Hex
                    </th>
                    <th class="highlight-th text-center">
                      解析后真实数值
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in parsedCustomMappingList" :key="item.id">
                    <td class="text-center text-neutral-400 font-bold font-mono dark:text-neutral-500">
                      +{{ item.offset }}
                    </td>
                    <td class="text-center text-neutral-700 font-600 dark:text-neutral-300">
                      {{ item.name }}
                    </td>
                    <td class="text-center text-12px text-neutral-500">
                      {{ formatEnglishMap[item.format] || item.format }}
                    </td>
                    <td class="bg-teal-500/5 text-center text-teal-600 font-700 font-mono dark:text-teal-400">
                      {{ item.hex }}
                    </td>
                    <td
                      class="py-10px text-center font-bold font-mono"
                      :class="item.isOob ? 'text-red-500 bg-red-500/5' : 'text-amber-500 bg-amber-500/5'"
                    >
                      <span v-if="item.value === '-'" class="text-neutral-300 dark:text-neutral-700">-</span>
                      <span v-else class="flex items-center justify-center gap-10px whitespace-nowrap">
                        {{ item.value }}
                        <n-button
                          v-if="!item.isOob"
                          size="tiny"
                          quaternary
                          circle
                          type="warning"
                          style="width: 20px; height: 20px;"
                          @click="copyToClipboard(String(item.value), '已复制当前值')"
                        >
                          <template #icon><n-icon :component="Copy" size="12" /></template>
                        </n-button>
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="mt-14px border-t border-neutral-200/5 pt-10px text-11px text-neutral-400">
              💡 <strong>混合模式解析技巧：</strong> 适合复杂的多设备或多传感器打包上传场景。您可以按传感器数据手册给出的偏移行（偏移1代表第2个寄存器，以此类推），独立配置其字节拆包规则与名称。
            </div>
          </n-tab-pane>
        </n-tabs>
      </n-card>
    </div>
  </div>
</template>

<style lang="less" scoped>
.modbus-parser-container {
  max-width: 100%;
}

:deep(.n-card) {
  border: 1px solid rgba(120, 120, 120, 0.1) !important;
}

// 字节切片样式
.byte-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 38px;
  border-radius: 6px;
  border: 1.5px solid;
  transition: all 0.2s;
  padding-bottom: 6px; // 为索引留空间

  .byte-index {
    position: absolute;
    bottom: 2px;
    font-size: 9px;
    font-weight: 500;
    color: #9ca3af;
    line-height: 1;
    letter-spacing: 0;
  }
}

// 校验横幅
.crc-warning-banner {
  background-color: rgba(239, 68, 68, 0.05);
  border: 1px solid rgba(239, 68, 68, 0.15);
  border-radius: 8px;
  padding: 10px 14px;
}

.crc-success-banner {
  background-color: rgba(16, 185, 129, 0.04);
  border: 1px solid rgba(16, 185, 129, 0.1);
  border-radius: 8px;
  padding: 8px 12px;
}

.exception-banner {
  background-color: rgba(239, 68, 68, 0.06);
  border: 1px dashed rgba(239, 68, 68, 0.25);
  border-radius: 8px;
  padding: 12px 16px;
}

// 属性卡片
.field-card {
  padding: 10px 14px;
  background-color: rgba(120, 120, 120, 0.02);
  border: 1px solid rgba(120, 120, 120, 0.08);
  border-left-width: 4px;
  border-left-style: solid;
  border-radius: 0 8px 8px 0;
  transition: all 0.15s;

  &:hover {
    background-color: rgba(120, 120, 120, 0.04);
    transform: translateX(2px);
  }

  .field-title {
    font-size: 13px;
    font-weight: 700;
  }

  .field-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
}

// 数据解析表格
.data-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
  font-size: 13px;

  th, td {
    padding: 8px 10px;
    border: 1px solid rgba(120, 120, 120, 0.1);
  }

  thead {
    background-color: rgba(120, 120, 120, 0.03);

    th {
      font-weight: 700;
      color: #6b7280;
      text-align: center;
      font-size: 12px;
    }

    .highlight-th {
      color: #f59e0b;
      background-color: rgba(245, 158, 11, 0.02);
    }
  }

  tbody {
    tr {
      transition: background-color 0.15s;

      &:hover {
        background-color: rgba(120, 120, 120, 0.03);
      }
    }
  }
}
</style>
