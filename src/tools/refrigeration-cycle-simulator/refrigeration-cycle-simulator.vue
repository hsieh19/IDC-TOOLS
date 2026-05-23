<script setup lang="ts">
import { computed, ref, watch, h } from 'vue';
import type { VNode } from 'vue';
import { useThemeVars, NTooltip } from 'naive-ui';
import type { SelectOption } from 'naive-ui';
import {
  InfoCircle,
  Refresh,
} from '@vicons/tabler';

import {
  calculateCycleProperties,
  getSaturationEnvelope,
} from './refrigeration-cycle-simulator.service';
import type { CycleInputs, RefrigerantType } from './refrigeration-cycle-simulator.types';

const themeVars = useThemeVars();

// ==========================================
// 输入状态 (State)
// ==========================================
const refrigerant = ref<RefrigerantType>('R134a');
const evapTemp = ref(5.0); // 蒸发温度 (°C)
const condTemp = ref(40.0); // 冷凝温度 (°C)
const compressorSpeed = ref(50); // 压缩机频率 (Hz)
const displacement = ref(20.0); // 压缩机排量 (cm³)
const isentropicEfficiency = ref(0.80); // 等熵效率 (0.50 - 0.95)

// 制冷剂可选项 (展示简短英文，Hover 时展示中文解释)
const refrigerantOptions = [
  { label: 'R134a', value: 'R134a', desc: '数据中心大型离心/螺杆式冷水机组' },
  { label: 'R1234ze', value: 'R1234ze', desc: '数据中心绿色低碳冷机 HFO 新型工质' },
  { label: 'R410A', value: 'R410A', desc: '数据中心风冷直接蒸发机房空调/模块机' },
  { label: 'R22', value: 'R22', desc: '旧式家用空调/传统工业冷冻' },
];

// 下拉菜单列表 hover 自定义渲染 tooltip
const renderOption = ({ node, option }: { node: VNode; option: SelectOption & { desc?: string } }) => {
  return h(
    NTooltip,
    { trigger: 'hover', placement: 'right' },
    {
      trigger: () => node,
      default: () => option.desc || '',
    }
  );
};

// 当前选中工质的详细描述
const currentRefrigerantDesc = computed(() => {
  const opt = refrigerantOptions.find(o => o.value === refrigerant.value);
  return opt ? opt.desc : '';
});

// 当前高亮的设备阶段 ('compressor' | 'condenser' | 'valve' | 'evaporator')
const activeStage = ref<'compressor' | 'condenser' | 'valve' | 'evaporator'>('compressor');

// 监听温度交叉，蒸发温度必须低于冷凝温度至少 10°C 保证合理热力循环
watch(evapTemp, (newEvap) => {
  if (newEvap >= condTemp.value - 10) {
    condTemp.value = newEvap + 10;
  }
});
watch(condTemp, (newCond) => {
  if (newCond <= evapTemp.value + 10) {
    evapTemp.value = newCond - 10;
  }
});

// 计算循环热力学结果
const results = computed(() => {
  return calculateCycleProperties({
    refrigerant: refrigerant.value,
    evapTemp: evapTemp.value,
    condTemp: condTemp.value,
    compressorSpeed: compressorSpeed.value,
    displacement: displacement.value,
    isentropicEfficiency: isentropicEfficiency.value,
  });
});

// 重置参数
const handleReset = () => {
  refrigerant.value = 'R134a';
  evapTemp.value = 5.0;
  condTemp.value = 40.0;
  compressorSpeed.value = 50;
  displacement.value = 20.0;
  isentropicEfficiency.value = 0.80;
  activeStage.value = 'compressor';
};

// ==========================================
// 动态运行流图动画参数计算
// ==========================================
// 管路流动速度 (取决于压缩机频率，值越小流动越快)
const flowDuration = computed(() => {
  const speed = compressorSpeed.value;
  return `${Math.max(0.4, Math.min(3.0, 50 / speed))}s`;
});

// 压缩机轮旋转速度
const compSpinDuration = computed(() => {
  const speed = compressorSpeed.value;
  return `${Math.max(0.2, Math.min(2.0, 50 / speed))}s`;
});

// 冷凝器散热扇旋转速度
const fanSpinDuration = computed(() => {
  const speed = compressorSpeed.value;
  return `${Math.max(0.15, Math.min(1.5, 40 / speed))}s`;
});

// ==========================================
// 压焓图 (P-h Dome) SVG 坐标投影映射
// ==========================================
const width = 450;
const height = 280;
const paddingX = 40;
const paddingY = 30;

// 自适应量程范围 (由当前制冷剂的焓值和压力范围决定)
const ranges = computed(() => {
  switch (refrigerant.value) {
    case 'R410A':
      return { minH: 150, maxH: 480, minP: 100, maxP: 4500 };
    case 'R22':
      return { minH: 150, maxH: 480, minP: 80, maxP: 3000 };
    case 'R1234ze':
      return { minH: 150, maxH: 450, minP: 30, maxP: 2000 };
    case 'R134a':
    default:
      return { minH: 150, maxH: 460, minP: 50, maxP: 2500 };
  }
});

// Enthalpy X-axis Scale (比焓投射到 X 坐标)
const scaleX = (h: number) => {
  const { minH, maxH } = ranges.value;
  return paddingX + ((h - minH) / (maxH - minH)) * (width - 2 * paddingX);
};

// Pressure Y-axis Scale (绝对压力的对数刻度投射到 Y 坐标)
const scaleY = (p: number) => {
  const { minP, maxP } = ranges.value;
  const logP = Math.log10(p);
  const logMin = Math.log10(minP);
  const logMax = Math.log10(maxP);
  return height - paddingY - ((logP - logMin) / (logMax - logMin)) * (height - 2 * paddingY);
};

// 动态生成饱和钟形包络线的 SVG 路径
const domePath = computed(() => {
  const envPoints = getSaturationEnvelope(refrigerant.value, 40);
  if (envPoints.length === 0) return '';
  
  // 1. 液体饱和线 (左侧)
  let dLiquid = `M ${scaleX(envPoints[0].enthalpyLiquid)} ${scaleY(envPoints[0].pressure)}`;
  for (let i = 1; i < envPoints.length; i++) {
    dLiquid += ` L ${scaleX(envPoints[i].enthalpyLiquid)} ${scaleY(envPoints[i].pressure)}`;
  }

  // 2. 气体饱和线 (右侧，倒序回退到基准点)
  let dVapor = '';
  for (let i = envPoints.length - 1; i >= 0; i--) {
    dVapor += ` L ${scaleX(envPoints[i].enthalpyVapor)} ${scaleY(envPoints[i].pressure)}`;
  }

  return dLiquid + dVapor;
});

// 四个循环状态点的坐标投影
const p1Coord = computed(() => ({ x: scaleX(results.value.state1.enthalpy), y: scaleY(results.value.state1.pressure) }));
const p2Coord = computed(() => ({ x: scaleX(results.value.state2.enthalpy), y: scaleY(results.value.state2.pressure) }));
const p3Coord = computed(() => ({ x: scaleX(results.value.state3.enthalpy), y: scaleY(results.value.state3.pressure) }));
const p4Coord = computed(() => ({ x: scaleX(results.value.state4.enthalpy), y: scaleY(results.value.state4.pressure) }));

// 压力网格横向刻度 (kPa)
const pressureTicks = computed(() => {
  switch (refrigerant.value) {
    case 'R410A': return [200, 500, 1000, 2000, 3500];
    case 'R22': return [100, 300, 800, 1500, 2500];
    case 'R1234ze': return [50, 100, 200, 500, 1000, 1500];
    case 'R134a':
    default: return [100, 200, 500, 1000, 2000];
  }
});

// 比焓网格纵向刻度 (kJ/kg)
const enthalpyTicks = computed(() => {
  const { minH, maxH } = ranges.value;
  const step = (maxH - minH) / 4;
  return Array.from({ length: 5 }, (_, i) => Math.round(minH + i * step));
});
</script>

<template>
  <div class="simulator-container">
    <div class="simulator-inner-vertical">
      
      <!-- 1. 运行工况与性能计算面板 (统一控制与计算中心) -->
      <n-card :bordered="false" class="card-input shadow-soft">
        <!-- 运行参数设定 -->
        <div class="section-sub-title">运行参数设定</div>
        <n-grid :x-gap="16" :y-gap="16" cols="1 s:2 m:3 l:3" responsive="screen">
          <!-- 制冷工质 -->
          <n-grid-item>
            <div class="input-label-wrapper">
              <span class="input-label">制冷工质</span>
            </div>
            <n-tooltip trigger="hover" placement="top">
              <template #trigger>
                <div>
                  <n-select
                    v-model:value="refrigerant"
                    :options="refrigerantOptions"
                    :render-option="renderOption"
                    size="medium"
                  />
                </div>
              </template>
              <span>{{ currentRefrigerantDesc }}</span>
            </n-tooltip>
          </n-grid-item>

          <!-- 蒸发温度 -->
          <n-grid-item>
            <div class="input-label-wrapper">
              <span class="input-label">蒸发温度</span>
            </div>
            <n-input-number
              v-model:value="evapTemp"
              :show-button="false"
              :min="-25"
              :max="15"
              :step="0.5"
              size="medium"
              style="width: 100%;"
            >
              <template #suffix>°C</template>
            </n-input-number>
          </n-grid-item>

          <!-- 冷凝温度 -->
          <n-grid-item>
            <div class="input-label-wrapper">
              <span class="input-label">冷凝温度</span>
            </div>
            <n-input-number
              v-model:value="condTemp"
              :show-button="false"
              :min="25"
              :max="60"
              :step="0.5"
              size="medium"
              style="width: 100%;"
            >
              <template #suffix>°C</template>
            </n-input-number>
          </n-grid-item>

          <!-- 压缩频率 -->
          <n-grid-item>
            <div class="input-label-wrapper">
              <span class="input-label">压缩频率</span>
            </div>
            <n-input-number
              v-model:value="compressorSpeed"
              :show-button="false"
              :min="20"
              :max="90"
              :step="1"
              size="medium"
              style="width: 100%;"
            >
              <template #suffix>Hz</template>
            </n-input-number>
          </n-grid-item>

          <!-- 气缸排量 -->
          <n-grid-item>
            <div class="input-label-wrapper">
              <span class="input-label">气缸排量</span>
            </div>
            <n-input-number
              v-model:value="displacement"
              :show-button="false"
              :min="5"
              :max="100"
              :step="0.5"
              size="medium"
              style="width: 100%;"
            >
              <template #suffix>cm³</template>
            </n-input-number>
          </n-grid-item>

          <!-- 等熵效率 -->
          <n-grid-item>
            <div class="input-label-wrapper">
              <span class="input-label">等熵效率</span>
            </div>
            <n-input-number
              v-model:value="isentropicEfficiency"
              :show-button="false"
              :min="0.5"
              :max="0.95"
              :step="0.01"
              size="medium"
              style="width: 100%;"
            >
              <template #suffix>%</template>
            </n-input-number>
          </n-grid-item>
        </n-grid>

        <div class="divider-line" style="margin: 20px 0;"></div>

        <!-- 系统性能计算结果 -->
        <div class="section-sub-title">系统性能计算结果</div>
        <n-grid :x-gap="16" :y-gap="16" cols="1 s:2 m:3 l:3" responsive="screen">
          <!-- COP -->
          <n-grid-item>
            <div class="metric-card-item highlighted-item">
              <span class="metric-dot bg-primary"></span>
              <div class="metric-title-sub">循环效率 (COP)</div>
              <div class="metric-value-main text-primary">{{ results.cop.toFixed(2) }}</div>
            </div>
          </n-grid-item>

          <!-- 制冷容量 -->
          <n-grid-item>
            <div class="metric-card-item">
              <span class="metric-dot bg-cool"></span>
              <div class="metric-title-sub">制冷容量</div>
              <div class="metric-value-main">
                {{ results.coolingCapacity.toFixed(2) }}
                <span class="metric-unit-sub">kW</span>
              </div>
            </div>
          </n-grid-item>

          <!-- 轴输入功率 -->
          <n-grid-item>
            <div class="metric-card-item">
              <span class="metric-dot bg-power"></span>
              <div class="metric-title-sub">轴输入功率</div>
              <div class="metric-value-main">
                {{ results.compressorPower.toFixed(2) }}
                <span class="metric-unit-sub">kW</span>
              </div>
            </div>
          </n-grid-item>

          <!-- 冷媒流量 -->
          <n-grid-item>
            <div class="metric-card-item">
              <span class="metric-dot bg-gray"></span>
              <div class="metric-title-sub">冷媒流量</div>
              <div class="metric-value-main">
                {{ (results.massFlow * 3600).toFixed(1) }}
                <span class="metric-unit-sub">kg/h</span>
              </div>
            </div>
          </n-grid-item>

          <!-- 系统压缩比 -->
          <n-grid-item>
            <div class="metric-card-item">
              <span class="metric-dot bg-gray"></span>
              <div class="metric-title-sub">系统压缩比</div>
              <div class="metric-value-main">{{ results.compressionRatio.toFixed(2) }}</div>
            </div>
          </n-grid-item>

          <!-- 闪蒸气化干度 -->
          <n-grid-item>
            <div class="metric-card-item">
              <span class="metric-dot bg-gray"></span>
              <div class="metric-title-sub">闪蒸气化干度</div>
              <div class="metric-value-main">
                {{ (results.vaporQuality * 100).toFixed(1) }}
                <span class="metric-unit-sub">%</span>
              </div>
            </div>
          </n-grid-item>
        </n-grid>

        <!-- 专家运行效率诊断建议 -->
        <div class="diagnose-box" :class="results.cop >= 4.0 ? 'diag-good' : results.cop >= 2.5 ? 'diag-normal' : 'diag-bad'">
          <div class="diag-title">💡 工况综合诊断意见</div>
          <p class="diag-p">
            <span v-if="results.cop >= 4.0">当前系统传热温差小、效率极佳！制冷能力强劲且非常省电。</span>
            <span v-else-if="results.cop >= 2.5">系统处于合理运行状态，建议冷凝温度保持在 45°C 以下以获得更好的节能效益。</span>
            <span v-else>系统温差过大导致压缩比偏高，COP 偏低！请检查外界散热是否恶化，或建议降低冷凝温度。</span>
          </p>
        </div>
      </n-card>

      <!-- 2. 制冷系统动态运行流图 (全宽大画幅展示) -->
      <n-card title="制冷系统动态运行流图" :bordered="false" class="card-visual shadow-soft">
        <template #header-extra>
          <span class="pulse-tip">点击部件可查看各热力学阶段解析</span>
        </template>

        <div class="svg-loop-wrapper">
          <svg viewBox="0 0 500 320" width="100%" height="100%" class="schematic-svg" :style="{'--flow-speed': flowDuration}">
            <defs>
              <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="glow-blue" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            <!-- 金属连接铜管线 (底色背景管道) -->
            <path d="M 70 140 L 70 40 L 210 40" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="6" stroke-linecap="round" />
            <path d="M 290 40 L 430 40 L 430 140" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="6" stroke-linecap="round" />
            <path d="M 430 180 L 430 280 L 290 280" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="6" stroke-linecap="round" />
            <path d="M 210 280 L 70 280 L 70 180" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="6" stroke-linecap="round" />

            <!-- 动态流动的冷媒彩色线条 (CSS Dashoffset 硬件加速流动) -->
            <!-- ① -> ②：低温低压气态 (浅蓝流动) -->
            <path d="M 70 140 L 70 40 L 210 40" fill="none" stroke="#93c5fd" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="10 14" class="flow-pipe-line" />
            <!-- ② -> ③：高温高压过热气态 (红色强流动) -->
            <path d="M 290 40 L 430 40 L 430 140" fill="none" stroke="#ef4444" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="10 14" class="flow-pipe-line" />
            <!-- ③ -> ④：高压中温液态 (橙色流动) -->
            <path d="M 430 180 L 430 280 L 290 280" fill="none" stroke="#fb923c" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="10 14" class="flow-pipe-line" />
            <!-- ④ -> ①：低温低压两相共存 (深蓝流动) -->
            <path d="M 210 280 L 70 280 L 70 180" fill="none" stroke="#3b82f6" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="10 14" class="flow-pipe-line" />

            <!-- 四大核心设备 -->
            <!-- 压缩机 -->
            <g class="device-group" :class="{ active: activeStage === 'compressor' }" transform="translate(210, 15)" @click="activeStage = 'compressor'">
              <rect width="80" height="50" rx="25" fill="#1e293b" stroke="#64748b" stroke-width="2" class="box-bg" />
              <circle cx="25" cy="25" r="16" fill="#0f172a" stroke="#475569" stroke-width="1.5" />
              <path d="M 25 15 L 25 35 M 15 25 L 35 25 M 18 18 L 32 32 M 18 32 L 32 18" stroke="#38bdf8" stroke-width="2" class="compressor-wheel" :style="{'animation-duration': compSpinDuration}" />
              <text x="56" y="30" fill="#f8fafc" font-size="10" font-weight="bold" text-anchor="middle">压缩机</text>
            </g>

            <!-- 冷凝器 -->
            <g class="device-group" :class="{ active: activeStage === 'condenser' }" transform="translate(390, 120)" @click="activeStage = 'condenser'">
              <rect width="80" height="70" rx="8" fill="#1e293b" stroke="#ef4444" stroke-width="2" class="box-bg" />
              <!-- 冷凝器内部底色管 -->
              <path d="M 15 15 L 65 15 L 65 27 L 15 27 L 15 39 L 65 39 L 65 51 L 15 51" fill="none" stroke="rgba(239, 68, 68, 0.15)" stroke-width="2.5" stroke-linecap="round" />
              <!-- 冷凝器内部流动的冷凝线条 -->
              <path d="M 15 15 L 65 15 L 65 27 L 15 27 L 15 39 L 65 39 L 65 51 L 15 51" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="6 8" class="flow-pipe-line" />
              <text x="40" y="63" fill="#f8fafc" font-size="10" font-weight="bold" text-anchor="middle">冷凝器</text>
              <circle cx="40" cy="33" r="10" fill="rgba(239, 68, 68, 0.15)" stroke="#ef4444" stroke-width="1" />
              <path d="M 40 25 L 40 41 M 32 33 L 48 33" stroke="#ef4444" stroke-width="1.5" class="condenser-fan" :style="{'animation-duration': fanSpinDuration}" />
            </g>

            <!-- 膨胀阀 -->
            <g class="device-group" :class="{ active: activeStage === 'valve' }" transform="translate(210, 255)" @click="activeStage = 'valve'">
              <rect width="80" height="50" rx="8" fill="#1e293b" stroke="#f97316" stroke-width="2" class="box-bg" />
              <path d="M 15 15 L 45 35 L 45 15 L 15 35 Z" fill="#fb923c" stroke="#ea580c" stroke-width="1" />
              <circle cx="30" cy="25" r="4" fill="#fff" class="valve-pulse-dot" />
              <text x="60" y="30" fill="#f8fafc" font-size="10" font-weight="bold" text-anchor="middle">膨胀阀</text>
            </g>

            <!-- 蒸发器 -->
            <g class="device-group" :class="{ active: activeStage === 'evaporator' }" transform="translate(30, 120)" @click="activeStage = 'evaporator'">
              <rect width="80" height="70" rx="8" fill="#1e293b" stroke="#3b82f6" stroke-width="2" class="box-bg" />
              <!-- 蒸发器内部底色管 -->
              <path d="M 15 15 L 65 15 L 65 27 L 15 27 L 15 39 L 65 39 L 65 51 L 15 51" fill="none" stroke="rgba(96, 165, 250, 0.15)" stroke-width="2.5" stroke-linecap="round" />
              <!-- 蒸发器内部流动的蒸发气化线条 -->
              <path d="M 15 15 L 65 15 L 65 27 L 15 27 L 15 39 L 65 39 L 65 51 L 15 51" fill="none" stroke="#60a5fa" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="6 8" class="flow-pipe-line" />
              <text x="40" y="63" fill="#f8fafc" font-size="10" font-weight="bold" text-anchor="middle">蒸发器</text>
              <path d="M 40 23 L 40 43 M 30 33 L 50 33 M 33 26 L 47 40 M 33 40 L 47 26" stroke="#38bdf8" stroke-width="1" class="evap-pulse-core" />
            </g>

            <!-- 四个交界点状态标识 -->
            <circle cx="210" cy="40" r="5" fill="#f8fafc" stroke="#1e293b" stroke-width="2" />
            <text x="195" y="52" fill="#64748b" font-size="10" font-weight="bold">①</text>
            
            <circle cx="290" cy="40" r="5" fill="#ef4444" stroke="#1e293b" stroke-width="2" />
            <text x="302" y="52" fill="#ef4444" font-size="10" font-weight="bold">②</text>
            
            <circle cx="430" cy="205" r="5" fill="#fb923c" stroke="#1e293b" stroke-width="2" />
            <text x="444" y="210" fill="#fb923c" font-size="10" font-weight="bold">③</text>
            
            <circle cx="70" cy="205" r="5" fill="#3b82f6" stroke="#1e293b" stroke-width="2" />
            <text x="56" y="210" fill="#3b82f6" font-size="10" font-weight="bold">④</text>
          </svg>
        </div>

        <!-- 四个阶段的动态折叠详细热力解析面板 -->
        <div class="stage-explanation-panel">
          <div v-if="activeStage === 'compressor'" class="desc-content flex-row">
            <div class="desc-bullet color-compressor"></div>
            <div class="desc-text-side">
              <div class="desc-header">阶段 ① → ②：等熵压缩过程</div>
              <p class="desc-para">
                低压低温的饱和冷媒蒸汽被吸入<strong>压缩机</strong>，在压缩机的做功驱动下，分子剧烈碰撞被急剧压缩为<strong>高温高压</strong>的过热蒸汽，随后排入排气管。
              </p>
              <div class="desc-kv-grid">
                <span>物态转换：低温饱和蒸汽 → 高温过热蒸汽</span>
                <span>能量消耗：轴功率 (排气温度估算: {{ Math.round(results.dischargeTemp) }} °C)</span>
              </div>
            </div>
          </div>

          <div v-if="activeStage === 'condenser'" class="desc-content flex-row">
            <div class="desc-bullet color-condenser"></div>
            <div class="desc-text-side">
              <div class="desc-header">阶段 ② → ③：等压放热冷凝</div>
              <p class="desc-para">
                高温高压的冷媒蒸汽进入<strong>冷凝器</strong>，向外部冷却介质释放大量冷凝热量。管路冷媒渐渐液化，最终在出口变为高压中温的饱和/过冷液体。
              </p>
              <div class="desc-kv-grid">
                <span>物态转换：过热蒸汽 → 气液两相 → 饱和液体</span>
                <span>能量释放：向外界放热 (冷凝压力: {{ Math.round(results.pc) }} kPa)</span>
              </div>
            </div>
          </div>

          <div v-if="activeStage === 'valve'" class="desc-content flex-row">
            <div class="desc-bullet color-valve"></div>
            <div class="desc-text-side">
              <div class="desc-header">阶段 ③ → ④：等焓膨胀节流</div>
              <p class="desc-para">
                高压冷媒液体流经<strong>膨胀阀 / 节流阀</strong>。由于狭小阀孔的突变阻力，冷媒压力瞬间暴跌，部分液体闪蒸为蒸汽吸热，温度剧烈下降，在出口化为极冷的气液两相共存物。
              </p>
              <div class="desc-kv-grid">
                <span>物态转换：高压中温液体 → 低温低压湿蒸汽</span>
                <span>能量性质：无热交换等焓节流 (闪蒸汽比例: {{ Math.round(results.vaporQuality * 100) }} %)</span>
              </div>
            </div>
          </div>

          <div v-if="activeStage === 'evaporator'" class="desc-content flex-row">
            <div class="desc-bullet color-evaporator"></div>
            <div class="desc-text-side">
              <div class="desc-header">阶段 ④ → ①：等压吸热蒸发</div>
              <p class="desc-para">
                低温低压的气液共存冷媒被送进<strong>蒸发器</strong>，从外界被冷却介质中贪婪地吸收热量以蒸发沸腾，气化为低温低压的气体重新回到吸气口，产生源源不断的制冷量。
              </p>
              <div class="desc-kv-grid">
                <span>物态转换：低温低压湿蒸汽 → 低温低压干饱和气体</span>
                <span>能量吸收：从外界吸热制冷 (蒸发压力: {{ Math.round(results.pe) }} kPa)</span>
              </div>
            </div>
          </div>
        </div>
      </n-card>

      <!-- 3. 工程压焓图 (全宽大画幅展示) -->
      <n-card title="工程压焓图" :bordered="false" class="card-ph">
        <div class="ph-chart-wrapper">
          <svg :viewBox="`0 0 ${width} ${height}`" width="100%" height="100%" class="ph-svg">
            <!-- 网格线: 压力横线 -->
            <g stroke="rgba(0,0,0,0.04)" stroke-width="1" class="grid-lines">
              <line v-for="tick in pressureTicks" :key="tick"
                x1="40" :y1="scaleY(tick)" :x2="410" :y2="scaleY(tick)" />
            </g>
            <!-- 网格线: 比焓竖线 -->
            <g stroke="rgba(0,0,0,0.04)" stroke-width="1" class="grid-lines">
              <line v-for="tick in enthalpyTicks" :key="tick"
                :x1="scaleX(tick)" y1="30" :x2="scaleX(tick)" y2="250" />
            </g>

            <!-- X 轴与 Y 轴刻度标签 -->
            <g fill="#94a3b8" font-size="8" text-anchor="end">
              <text v-for="tick in pressureTicks" :key="tick"
                x="34" :y="scaleY(tick) + 3">{{ Math.round(tick) }}</text>
            </g>
            <g fill="#94a3b8" font-size="8" text-anchor="middle">
              <text v-for="tick in enthalpyTicks" :key="tick"
                :x="scaleX(tick)" y="262">{{ tick }}</text>
            </g>

            <!-- 轴线命名 -->
            <text x="15" y="20" fill="#64748b" font-size="9" font-weight="bold">绝对压力 (kPa) [对数轴]</text>
            <text x="430" y="272" fill="#64748b" font-size="9" font-weight="bold" text-anchor="end">比焓 (kJ/kg)</text>

            <!-- 饱和气液钟形包络线 -->
            <path :d="domePath" fill="none" stroke="#94a3b8" stroke-width="2.5" stroke-dasharray="1 0" class="ph-dome-line" />

            <!-- 动态制冷循环四边形轨迹线 -->
            <path :d="`M ${p1Coord.x} ${p1Coord.y} 
                       L ${p2Coord.x} ${p2Coord.y} 
                       L ${p3Coord.x} ${p3Coord.y} 
                       L ${p4Coord.x} ${p4Coord.y} Z`"
                  fill="rgba(14, 165, 233, 0.08)" stroke="var(--n-primary-color)" stroke-width="3" stroke-linejoin="round" class="cycle-loop-path" />

            <!-- 四个状态交界点 -->
            <circle :cx="p1Coord.x" :cy="p1Coord.y" r="5" fill="#f8fafc" stroke="var(--n-primary-color)" stroke-width="2" />
            <text :x="p1Coord.x - 10" :y="p1Coord.y + 3" fill="#64748b" font-size="9" font-weight="bold" text-anchor="end">①</text>
            
            <circle :cx="p2Coord.x" :cy="p2Coord.y" r="5" fill="#ef4444" stroke="var(--n-primary-color)" stroke-width="2" />
            <text :x="p2Coord.x + 10" :y="p2Coord.y + 3" fill="#ef4444" font-size="9" font-weight="bold">②</text>
            
            <circle :cx="p3Coord.x" :cy="p3Coord.y" r="5" fill="#fb923c" stroke="var(--n-primary-color)" stroke-width="2" />
            <text :x="p3Coord.x - 8" :y="p3Coord.y - 6" fill="#fb923c" font-size="9" font-weight="bold">③</text>
            
            <circle :cx="p4Coord.x" :cy="p4Coord.y" r="5" fill="#3b82f6" stroke="var(--n-primary-color)" stroke-width="2" />
            <text :x="p4Coord.x - 8" :y="p4Coord.y + 11" fill="#3b82f6" font-size="9" font-weight="bold">④</text>
          </svg>
        </div>
      </n-card>


    </div>
  </div>
</template>

<style lang="less" scoped>
.simulator-container {
  padding: 16px;
  width: 100%;
}

.simulator-inner-vertical {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.shadow-soft {
  box-shadow: 0 4px 20px 0 rgba(0, 0, 0, 0.05);
  border-radius: 12px;
}

.card-input {
  border: 1px solid rgba(0, 0, 0, 0.04);
  background-color: var(--n-card-color);
}

.section-sub-title {
  font-size: 13px;
  font-weight: bold;
  color: var(--n-text-color);
  opacity: 0.8;
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  
  &::before {
    content: '';
    display: inline-block;
    width: 3px;
    height: 12px;
    background-color: var(--n-primary-color);
    border-radius: 2px;
  }
}

.divider-line {
  height: 1px;
  background-color: rgba(0, 0, 0, 0.06);
  margin: 16px 0;
  html.dark & {
    background-color: rgba(255, 255, 255, 0.08);
  }
}

.input-label-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.input-label {
  font-weight: 600;
  font-size: 14px;
  color: var(--n-text-color);
  white-space: nowrap;
  
  &.font-small {
    font-size: 13px;
    opacity: 0.8;
  }
}

// SVG Visual Flow Loops
.card-visual {
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.pulse-tip {
  font-size: 11px;
  opacity: 0.6;
  font-weight: bold;
}

.svg-loop-wrapper {
  width: 100%;
  height: auto;
  max-width: 720px;
  margin: 0 auto;
  padding: 16px;
  background-color: #0f172a; // 高对比暗背景，极具科技视觉
  border-radius: 12px;
  box-shadow: inset 0 2px 10px rgba(0,0,0,0.5);
}

.schematic-svg {
  display: block;
  
  text {
    font-family: system-ui, -apple-system, sans-serif !important;
    font-size: 10px !important;
    font-weight: bold !important;
    user-select: none !important;
  }
}

.device-group {
  cursor: pointer;
  user-select: none;
  
  .box-bg {
    transition: fill 0.2s, stroke 0.2s, filter 0.2s;
  }
  
  &:hover .box-bg {
    fill: #334155;
    stroke: #94a3b8;
  }
  
  &.active .box-bg {
    fill: #1e293b;
    stroke: var(--n-primary-color);
    filter: drop-shadow(0px 0px 8px rgba(14, 165, 233, 0.45));
  }
}

// 管道流动效果动画 (硬件加速)
@keyframes flow {
  to {
    stroke-dashoffset: -48;
  }
}
.flow-pipe-line {
  stroke-dashoffset: 0;
  animation: flow var(--flow-speed, 1.5s) linear infinite;
}

// 膨胀阀核心呼吸灯效果
@keyframes valve-pulse {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.25); }
}
.valve-pulse-dot {
  transform-origin: 30px 25px;
  animation: valve-pulse 2s ease-in-out infinite;
}

// 蒸发器核心呼吸脉冲
@keyframes evap-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
.evap-pulse-core {
  animation: evap-pulse 3s ease-in-out infinite;
}

// 压缩机轮旋转动画
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.compressor-wheel {
  transform-origin: 25px 25px;
  animation: spin 3s linear infinite;
}

// 冷凝器散热扇旋转动画
.condenser-fan {
  transform-origin: 40px 33px;
  animation: spin 1.5s linear infinite;
}

// 阶段解析卡片
.stage-explanation-panel {
  margin-top: 15px;
  padding: 16px;
  border-radius: 8px;
  background-color: rgba(0, 0, 0, 0.02);
  border: 1px solid rgba(0, 0, 0, 0.04);

  html.dark & {
    background-color: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.04);
  }
}

.desc-content {
  display: flex;
  gap: 12px;
  
  &.flex-row {
    flex-direction: row;
  }
}

.desc-bullet {
  width: 5px;
  height: auto;
  min-height: 40px;
  border-radius: 3px;
  flex-shrink: 0;
  
  &.color-compressor { background-color: #64748b; }
  &.color-condenser { background-color: #ef4444; }
  &.color-valve { background-color: #f97316; }
  &.color-evaporator { background-color: #3b82f6; }
}

.desc-text-side {
  flex-grow: 1;
}

.desc-header {
  font-size: 14px;
  font-weight: 700;
  color: var(--n-text-color);
  margin-bottom: 6px;
}

.desc-para {
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.85;
  margin: 0 0 10px 0;
}

.desc-kv-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 11px;
  font-weight: bold;
  opacity: 0.65;
}

// P-h chart styling
.card-ph {
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.ph-chart-wrapper {
  background-color: rgba(0,0,0,0.01);
  border-radius: 8px;
  padding: 16px;
  border: 1px solid rgba(0,0,0,0.02);
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  
  html.dark & {
    background-color: rgba(255,255,255,0.01);
    border: 1px solid rgba(255,255,255,0.02);
  }
}

.ph-svg {
  display: block;
  overflow: visible;
  max-width: 720px;
  margin: 0 auto;
  
  text {
    font-family: monospace, system-ui !important;
    font-size: 8px !important;
    font-weight: normal !important;
    user-select: none !important;
    
    &[font-size="9"] {
      font-size: 9px !important;
      font-weight: bold !important;
    }
  }
  
  .grid-lines line {
    html.dark & {
      stroke: rgba(255,255,255,0.04);
    }
  }
  
  .ph-dome-line {
    stroke: #94a3b8;
    stroke-dasharray: 4 3;
    html.dark & {
      stroke: #475569;
    }
  }
}

// Physics Metrics Grid
.card-metrics {
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.metric-info-trigger {
  font-size: 16px;
  opacity: 0.6;
  cursor: pointer;
  &:hover { opacity: 1; }
}

.metric-card-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px 8px;
  background-color: rgba(0, 0, 0, 0.015);
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.02);
  text-align: center;
  position: relative;
  min-height: 100px;
  
  html.dark & {
    background-color: rgba(255, 255, 255, 0.015);
    border: 1px solid rgba(255, 255, 255, 0.02);
  }
  
  &.highlighted-item {
    background-color: rgba(14, 165, 233, 0.05);
    border-color: rgba(14, 165, 233, 0.15);
    html.dark & {
      background-color: rgba(14, 165, 233, 0.08);
      border-color: rgba(14, 165, 233, 0.22);
    }
  }
}

.metric-dot {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  
  &.bg-primary { background-color: var(--n-primary-color); }
  &.bg-cool { background-color: #3b82f6; }
  &.bg-power { background-color: #ef4444; }
  &.bg-gray { background-color: #94a3b8; }
}

.metric-title-sub {
  font-size: 12px;
  font-weight: 700;
  opacity: 0.7;
  margin-bottom: 8px;
  white-space: nowrap;
}

.metric-value-main {
  font-size: 18px;
  font-weight: 900;
  font-family: monospace;
  white-space: nowrap;
  
  &.text-primary {
    color: var(--n-primary-color);
  }
}

.metric-unit-sub {
  font-size: 11px;
  font-weight: normal;
  opacity: 0.7;
}

// Diagnose Box
.diagnose-box {
  margin-top: 14px;
  padding: 12px;
  border-radius: 8px;
  border-width: 1px;
  border-style: solid;
  
  .diag-title {
    font-size: 12px;
    font-weight: bold;
    margin-bottom: 4px;
  }
  
  .diag-p {
    font-size: 11px;
    line-height: 1.4;
    margin: 0;
    opacity: 0.85;
  }
  
  &.diag-good {
    background-color: rgba(34, 197, 94, 0.06);
    border-color: rgba(34, 197, 94, 0.15);
    .diag-title { color: #16a34a; }
  }
  &.diag-normal {
    background-color: rgba(234, 179, 8, 0.06);
    border-color: rgba(234, 179, 8, 0.15);
    .diag-title { color: #ca8a04; }
  }
  &.diag-bad {
    background-color: rgba(239, 68, 68, 0.06);
    border-color: rgba(239, 68, 68, 0.15);
    .diag-title { color: #dc2626; }
  }
}
</style>
