<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useThemeVars } from 'naive-ui';
import {
  Droplet,
  Gauge,
  InfoCircle,
  Mountain,
  Refresh,
  Thermometer,
} from '@vicons/tabler';

import {
  calculateWetBulbProperties,
  convertPressure,
  getPressureByAltitude,
} from './wet-bulb-calculator.service';
import type { PressureUnit } from './wet-bulb-calculator.types';

const themeVars = useThemeVars();

// 输入参数
const dryBulbTemp = ref(25.0); // 干球温度 (°C)
const relativeHumidity = ref(50.0); // 相对湿度 (%)
const pressure = ref(1013.25); // 气压值
const pressureUnit = ref<PressureUnit>('hPa'); // 气压单位
const altitude = ref(0); // 海拔高度 (m)

// 气压单位选项
const unitOptions = [
  { label: 'hPa / mbar (百帕/毫巴)', value: 'hPa' },
  { label: 'kPa (千帕)', value: 'kPa' },
  { label: 'Pa (帕斯卡)', value: 'Pa' },
  { label: 'mmHg (毫米汞柱)', value: 'mmHg' },
  { label: 'atm (标准大气压)', value: 'atm' },
];

// 常见海拔高度快捷气压预设
const altitudePresets = [
  { label: '海平面 (0米)', altitude: 0 },
  { label: '丘陵 (500米)', altitude: 500 },
  { label: '高原边缘 (1000米)', altitude: 1000 },
  { label: '云贵高原 (1500米)', altitude: 1500 },
  { label: '青藏边缘 (2000米)', altitude: 2000 },
  { label: '高海拔 (3000米)', altitude: 3000 },
];

// 气压单位切换时，自动换算当前气压值
const prevUnit = ref<PressureUnit>('hPa');
watch(pressureUnit, (newUnit) => {
  if (prevUnit.value !== newUnit) {
    const converted = convertPressure(pressure.value, prevUnit.value, newUnit);
    const decimals = newUnit === 'Pa' ? 0 : newUnit === 'kPa' ? 4 : 2;
    pressure.value = Number(converted.toFixed(decimals));
    prevUnit.value = newUnit;
  }
});

// 监听海拔改变，动态更新气压
watch(altitude, (newAlt) => {
  if (newAlt === null || newAlt === undefined) return;
  const teoricalPressureHpa = getPressureByAltitude(newAlt);
  const convertedP = convertPressure(teoricalPressureHpa, 'hPa', pressureUnit.value);
  const decimals = pressureUnit.value === 'Pa' ? 0 : pressureUnit.value === 'kPa' ? 4 : 2;
  const convertedPFixed = Number(convertedP.toFixed(decimals));

  if (Math.abs(pressure.value - convertedPFixed) > 0.05) {
    pressure.value = convertedPFixed;
  }
});

// 监听气压改变，反向推算海拔高度
watch(pressure, (newP) => {
  if (newP === null || newP === undefined || newP <= 0) return;
  const pInHpa = convertPressure(newP, pressureUnit.value, 'hPa');
  if (pInHpa > 0) {
    const calculatedAlt = Math.round(44330.769 * (1 - Math.pow(pInHpa / 1013.25, 0.190263)));
    if (calculatedAlt >= 0 && calculatedAlt <= 9000 && Math.abs(altitude.value - calculatedAlt) > 2) {
      altitude.value = calculatedAlt;
    }
  }
});

// 快捷选择海拔预设
const applyAltitudePreset = (presetAlt: number) => {
  altitude.value = presetAlt;
  const teoricalPressureHpa = getPressureByAltitude(presetAlt);
  const convertedP = convertPressure(teoricalPressureHpa, 'hPa', pressureUnit.value);
  const decimals = pressureUnit.value === 'Pa' ? 0 : pressureUnit.value === 'kPa' ? 4 : 2;
  pressure.value = Number(convertedP.toFixed(decimals));
};

// 计算物性指标结果
const results = computed(() => {
  return calculateWetBulbProperties({
    dryBulbTemp: dryBulbTemp.value || 0,
    relativeHumidity: relativeHumidity.value || 0,
    pressure: pressure.value || 1013.25,
    pressureUnit: pressureUnit.value,
    altitude: altitude.value || 0,
  });
});

// 重置参数
const handleReset = () => {
  dryBulbTemp.value = 25.0;
  relativeHumidity.value = 50.0;
  pressureUnit.value = 'hPa';
  prevUnit.value = 'hPa';
  pressure.value = 1013.25;
  altitude.value = 0;
};

// 湿球温度在露点和干球之间的占比百分比
const positionPercent = computed(() => {
  const tdp = results.value.dewPointTemp;
  const td = dryBulbTemp.value || 0;
  const tw = results.value.wetBulbTemp;
  
  if (Math.abs(td - tdp) < 0.1) return 100;
  const percent = ((tw - tdp) / (td - tdp)) * 100;
  return Math.max(0, Math.min(100, percent));
});
</script>

<template>
  <div class="wet-bulb-container">
    <n-grid :x-gap="20" :y-gap="20" cols="1 s:1 m:12 l:12" responsive="screen">
      <!-- 左侧输入表单 -->
      <n-grid-item span="1 s:1 m:5 l:5">
        <n-card title="计算输入" :bordered="false" class="card-input shadow-soft">
          <template #header-extra>
            <n-button quaternary circle size="small" @click="handleReset">
              <template #icon>
                <n-icon :component="Refresh" />
              </template>
            </n-button>
          </template>

          <n-space vertical size="large">
            <!-- 1. 干球温度 -->
            <div>
              <div class="input-label-wrapper">
                <span class="input-label">
                  <n-icon :component="Thermometer" class="icon-temp" />
                  干球温度
                </span>
              </div>
              <n-input-number
                v-model:value="dryBulbTemp"
                :show-button="false"
                :min="-30"
                :max="50"
                :step="0.1"
                placeholder="请输入干球温度"
                size="medium"
              >
                <template #suffix>°C</template>
              </n-input-number>
            </div>

            <!-- 2. 相对湿度 -->
            <div>
              <div class="input-label-wrapper">
                <span class="input-label">
                  <n-icon :component="Droplet" class="icon-humidity" />
                  相对湿度
                </span>
              </div>
              <n-input-number
                v-model:value="relativeHumidity"
                :show-button="false"
                :min="0"
                :max="100"
                :step="1"
                placeholder="请输入相对湿度"
                size="medium"
              >
                <template #suffix>%</template>
              </n-input-number>
            </div>

            <!-- 3. 大气气压与海拔 -->
            <div class="pressure-section">
              <div class="section-divider"></div>
              
              <n-space vertical size="medium">
                <!-- 气压单位 -->
                <div>
                  <div class="input-label-wrapper">
                    <span class="input-label">
                      <n-icon :component="Gauge" class="icon-pressure" />
                      气压单位
                    </span>
                  </div>
                  <n-select
                    v-model:value="pressureUnit"
                    :options="unitOptions"
                    size="medium"
                  />
                </div>

                <!-- 气压数值 -->
                <div>
                  <div class="input-label-wrapper">
                    <span class="input-label">
                      <n-icon :component="Gauge" class="icon-pressure" />
                      当地气压
                    </span>
                  </div>
                  <n-input-number
                    v-model:value="pressure"
                    :show-button="false"
                    :min="0.1"
                    placeholder="请输入气压值"
                    size="medium"
                  >
                    <template #suffix>{{ pressureUnit }}</template>
                  </n-input-number>
                </div>

                <!-- 关联海拔高度 -->
                <div>
                  <div class="input-label-wrapper">
                    <span class="input-label font-sub">
                      <n-icon :component="Mountain" class="icon-altitude" />
                      关联海拔
                    </span>
                  </div>
                  <n-input-number
                    v-model:value="altitude"
                    :show-button="false"
                    :min="0"
                    :max="9000"
                    placeholder="请输入海拔高度"
                    size="medium"
                  >
                    <template #suffix>米</template>
                  </n-input-number>
                </div>

                <!-- 快捷海拔气压预设 -->
                <div class="presets-container">
                  <div class="preset-title">快捷海拔填充</div>
                  <div class="presets-flex">
                    <n-button
                      v-for="preset in altitudePresets"
                      :key="preset.altitude"
                      size="small"
                      secondary
                      :type="altitude === preset.altitude ? 'primary' : 'default'"
                      class="preset-btn"
                      @click="applyAltitudePreset(preset.altitude)"
                    >
                      {{ preset.label }}
                    </n-button>
                  </div>
                </div>
              </n-space>
            </div>
          </n-space>
        </n-card>
      </n-grid-item>

      <!-- 右侧结果展示面板 -->
      <n-grid-item span="1 s:1 m:7 l:7">
        <n-space vertical size="large" class="h-full">
          <!-- 核心结果展示：湿球温度 -->
          <div class="wet-bulb-heroshadow">
            <div class="wet-bulb-hero">
              <div class="hero-bg-glow"></div>
              <div class="hero-content">
                <div class="hero-label-row">
                  <!-- 标题点击触发详细说明气压气泡 -->
                  <n-tooltip trigger="click" placement="top">
                    <template #trigger>
                      <span class="hero-title clickable">
                        核心计算结果
                        <n-icon :component="InfoCircle" class="hero-info-icon" />
                      </span>
                    </template>
                    空气通过水分蒸发达到稳定热平衡时的温度，是空调冷却塔效率与极限热伤害评估的核心指标。
                  </n-tooltip>
                </div>
                
                <div class="hero-main-value">
                  <span class="hero-num">{{ results.wetBulbTemp }}</span>
                  <span class="hero-unit">°C</span>
                </div>
                
                <div class="hero-sub-label">湿球温度</div>

                <!-- 湿球、干球、露点三者位置关系条 (纯图形示意，坚决不放重叠文字) -->
                <div class="psychrometric-bar-wrapper">
                  <div class="bar-track">
                    <div class="bar-dewpoint-wetbulb" :style="{ width: positionPercent + '%' }"></div>
                    
                    <!-- 露点位置点 -->
                    <div class="bar-dot tdp-dot" style="left: 0%;"></div>
                    <!-- 湿球位置圆环 -->
                    <div class="tw-indicator" :style="{ left: positionPercent + '%' }"></div>
                    <!-- 干球位置点 -->
                    <div class="bar-dot td-dot" style="left: 100%;"></div>
                  </div>

                  <!-- 垂直排列的大气感温指标列表，左标题右数值，绝不挤压折行！ -->
                  <div class="bar-values-column">
                    <div class="val-item val-tdp">
                      <div class="val-label-side">
                        <span class="legend-dot bg-tdp"></span>
                        <span class="lbl">露点温度</span>
                      </div>
                      <span class="val">{{ results.dewPointTemp }} °C</span>
                    </div>
                    <div class="val-item val-tw">
                      <div class="val-label-side">
                        <span class="legend-dot bg-tw"></span>
                        <span class="lbl font-bold">湿球温度</span>
                      </div>
                      <span class="val font-highlight">{{ results.wetBulbTemp }} °C</span>
                    </div>
                    <div class="val-item val-td">
                      <div class="val-label-side">
                        <span class="legend-dot bg-td"></span>
                        <span class="lbl">干球温度</span>
                      </div>
                      <span class="val">{{ dryBulbTemp || 0 }} °C</span>
                    </div>
                  </div>
                  
                  <!-- 点击触发温度关系说明气压气泡，保持界面完全干净 -->
                  <div class="bar-hint-click">
                    <n-tooltip trigger="click" placement="top">
                      <template #trigger>
                        <span class="hint-trigger-text">
                          <n-icon :component="InfoCircle" />
                          为什么这三者温度存在固定关系？
                        </span>
                      </template>
                      物理学上，湿球温度永远介于露点温度与干球温度之间。当相对湿度达到 100% 饱和状态时，三者完全重合。
                    </n-tooltip>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 次要指标展示 -->
          <n-card title="其它空气物理指标" :bordered="false" class="card-secondary shadow-soft">
            <div class="secondary-metrics-grid">
              <!-- 1. 露点温度 -->
              <div class="metric-card">
                <div class="metric-header">
                  <n-tooltip trigger="click" placement="top">
                    <template #trigger>
                      <span class="metric-label clickable">
                        露点温度
                        <n-icon :component="InfoCircle" class="info-icon" />
                      </span>
                    </template>
                    空气水分达到饱和结露时的温度。
                  </n-tooltip>
                </div>
                <div class="metric-value-row">
                  <span class="metric-val">{{ results.dewPointTemp }}</span>
                  <span class="metric-unit">°C</span>
                </div>
              </div>

              <!-- 2. 含湿量 -->
              <div class="metric-card">
                <div class="metric-header">
                  <n-tooltip trigger="click" placement="top">
                    <template #trigger>
                      <span class="metric-label clickable">
                        含湿量
                        <n-icon :component="InfoCircle" class="info-icon" />
                      </span>
                    </template>
                    每公斤干空气所含的实际水蒸气克数。
                  </n-tooltip>
                </div>
                <div class="metric-value-row">
                  <span class="metric-val">{{ results.humidityRatio }}</span>
                  <span class="metric-unit">g/kg</span>
                </div>
              </div>

              <!-- 3. 比焓 -->
              <div class="metric-card">
                <div class="metric-header">
                  <n-tooltip trigger="click" placement="top">
                    <template #trigger>
                      <span class="metric-label clickable">
                        比焓
                        <n-icon :component="InfoCircle" class="info-icon" />
                      </span>
                    </template>
                    空气所含的总热量 (包括显热与潜热)。
                  </n-tooltip>
                </div>
                <div class="metric-value-row">
                  <span class="metric-val">{{ results.enthalpy }}</span>
                  <span class="metric-unit">kJ/kg</span>
                </div>
              </div>

              <!-- 4. 汽压赤字 -->
              <div class="metric-card">
                <div class="metric-header">
                  <n-tooltip trigger="click" placement="top">
                    <template #trigger>
                      <span class="metric-label clickable">
                        汽压赤字
                        <n-icon :component="InfoCircle" class="info-icon" />
                      </span>
                    </template>
                    饱和蒸汽压与实际蒸汽分压之差。
                  </n-tooltip>
                </div>
                <div class="metric-value-row">
                  <span class="metric-val">{{ results.vaporPressureDeficit }}</span>
                  <span class="metric-unit">hPa</span>
                </div>
              </div>

              <!-- 5. 饱和水蒸气压 -->
              <div class="metric-card">
                <div class="metric-header">
                  <n-tooltip trigger="click" placement="top">
                    <template #trigger>
                      <span class="metric-label clickable">
                        饱和水蒸气压
                        <n-icon :component="InfoCircle" class="info-icon" />
                      </span>
                    </template>
                    当前干球温度下能容纳的最大蒸汽分压。
                  </n-tooltip>
                </div>
                <div class="metric-value-row">
                  <span class="metric-val">{{ results.satVaporPressure }}</span>
                  <span class="metric-unit">hPa</span>
                </div>
              </div>

              <!-- 6. 实际蒸气压 -->
              <div class="metric-card">
                <div class="metric-header">
                  <n-tooltip trigger="click" placement="top">
                    <template #trigger>
                      <span class="metric-label clickable">
                        实际蒸气压
                        <n-icon :component="InfoCircle" class="info-icon" />
                      </span>
                    </template>
                    当前湿度对应的实际蒸汽分压。
                  </n-tooltip>
                </div>
                <div class="metric-value-row">
                  <span class="metric-val">{{ results.vaporPressure }}</span>
                  <span class="metric-unit">hPa</span>
                </div>
              </div>
            </div>
          </n-card>
        </n-space>
      </n-grid-item>
    </n-grid>
  </div>
</template>

<style lang="less" scoped>
.wet-bulb-container {
  padding: 12px;
  width: 100%;
}

.shadow-soft {
  box-shadow: 0 4px 20px 0 rgba(0, 0, 0, 0.05);
  border-radius: 12px;
}

.card-input {
  border: 1px solid rgba(0, 0, 0, 0.04);
  background-color: var(--n-card-color);
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
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--n-text-color);

  .icon-temp { color: #f87171; }
  .icon-humidity { color: #60a5fa; }
  .icon-pressure { color: #34d399; }
  .icon-altitude { color: #fbbf24; }
}

.font-sub {
  font-weight: 600;
  font-size: 14px;
}

.pressure-section {
  margin-top: 15px;
}

.section-divider {
  height: 1px;
  background-color: rgba(0, 0, 0, 0.06);
  margin-bottom: 20px;
  
  html.dark & {
    background-color: rgba(255, 255, 255, 0.08);
  }
}

.presets-container {
  margin-top: 10px;
}

.preset-title {
  font-size: 12px;
  opacity: 0.7;
  margin-bottom: 8px;
  font-weight: 600;
}

.presets-flex {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  .preset-btn {
    flex: 1 1 calc(50% - 8px); // 响应式按钮
    min-width: 100px;
    font-size: 12px;
    text-align: center;
  }
}

// Right panel styles
.wet-bulb-heroshadow {
  border-radius: 16px;
  padding: 1px;
  background: linear-gradient(135deg, v-bind('themeVars.primaryColor') 0%, #38bdf8 100%);
  box-shadow: 0 10px 30px -10px rgba(14, 165, 233, 0.35);
}

.wet-bulb-hero {
  position: relative;
  border-radius: 15px;
  background: radial-gradient(circle at top right, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0) 60%), 
              v-bind('themeVars.cardColor');
  padding: 30px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.hero-bg-glow {
  position: absolute;
  top: -80px;
  right: -80px;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(14, 165, 233, 0.2) 0%, rgba(14, 165, 233, 0) 70%);
  filter: blur(20px);
  pointer-events: none;
}

.hero-content {
  position: relative;
  z-index: 1;
}

.hero-label-row {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  margin-bottom: 8px;
}

.hero-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
  opacity: 0.6;
  display: flex;
  align-items: center;
  gap: 4px;
}

.clickable {
  cursor: pointer;
  transition: opacity 0.2s;
  &:hover {
    opacity: 0.85;
  }
}

.hero-info-icon {
  font-size: 14px;
  opacity: 0.8;
}

.hero-main-value {
  display: flex;
  align-items: baseline;
  margin: 10px 0;

  .hero-num {
    font-size: 56px;
    font-weight: 900;
    line-height: 1;
    font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: linear-gradient(135deg, v-bind('themeVars.primaryColor') 0%, #0284c7 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .hero-unit {
    font-size: 24px;
    font-weight: 700;
    margin-left: 6px;
    color: v-bind('themeVars.primaryColor');
  }
}

.hero-sub-label {
  font-size: 14px;
  font-weight: 600;
  opacity: 0.85;
  margin-bottom: 24px;
}

// Visual scale bar with fixed non-overlapping labels
.psychrometric-bar-wrapper {
  margin-top: 15px;
  padding: 18px;
  border-radius: 12px;
  background-color: rgba(0, 0, 0, 0.02);
  border: 1px solid rgba(0, 0, 0, 0.03);

  html.dark & {
    background-color: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.03);
  }
}

.bar-track {
  position: relative;
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(to right, #22c55e 0%, #fbbf24 50%, #ef4444 100%);
  overflow: visible;
  margin: 16px 0;
}

.bar-dewpoint-wetbulb {
  position: absolute;
  left: 0;
  height: 100%;
  background-color: rgba(255, 255, 255, 0.35);
  border-radius: 4px 0 0 4px;
  transition: width 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.bar-dot {
  position: absolute;
  top: 50%;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  border: 1px solid #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
  
  &.tdp-dot {
    background-color: #22c55e;
  }
  &.td-dot {
    background-color: #ef4444;
  }
}

.tw-indicator {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  background-color: #fff;
  border: 3px solid v-bind('themeVars.primaryColor');
  border-radius: 50%;
  transform: translate(-50%, -50%);
  transition: left 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
  z-index: 1;
}

// 垂直高质感纵向列表，完全充满卡片宽度，物理上绝对绝不挤压变形
.bar-values-column {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 14px 0 12px 0;
}

.val-item {
  display: flex;
  align-items: center;
  justify-content: space-between; // 完美左右分立对齐，绝不换行
  padding: 10px 14px;
  background-color: rgba(0, 0, 0, 0.015);
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.02);
  font-size: 13px;
  font-weight: 700;
  transition: background-color 0.2s;

  html.dark & {
    background-color: rgba(255, 255, 255, 0.015);
    border: 1px solid rgba(255, 255, 255, 0.02);
  }

  .val-label-side {
    display: flex;
    align-items: center;
  }

  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 8px;
    display: inline-block;
  }

  .lbl {
    opacity: 0.8;
    font-weight: 600;
  }

  .font-bold {
    font-weight: 700;
  }

  .val {
    font-family: monospace;
    font-size: 14px;
  }

  &.val-tdp {
    .bg-tdp { background-color: #22c55e; }
    .val { color: #16a34a; }
  }

  &.val-tw {
    background-color: rgba(14, 165, 233, 0.05);
    border-color: rgba(14, 165, 233, 0.12);
    
    html.dark & {
      background-color: rgba(14, 165, 233, 0.08);
      border-color: rgba(14, 165, 233, 0.18);
    }

    .bg-tw { background-color: v-bind('themeVars.primaryColor'); }
    .lbl { color: v-bind('themeVars.primaryColor'); }
    
    .font-highlight {
      font-size: 15px;
      font-weight: 900;
      color: v-bind('themeVars.primaryColor');
    }
  }

  &.val-td {
    .bg-td { background-color: #ef4444; }
    .val { color: #dc2626; }
  }
}

.bar-hint-click {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 12px;

  .hint-trigger-text {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    opacity: 0.6;
    cursor: pointer;
    font-weight: 600;
    transition: opacity 0.2s, color 0.2s;
    user-select: none;

    &:hover {
      opacity: 0.95;
      color: v-bind('themeVars.primaryColor');
    }
  }
}

// Grid layout for secondary physical metrics
.card-secondary {
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.secondary-metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 15px;

  @media screen and (max-width: 500px) {
    grid-template-columns: 1fr;
  }
}

.metric-card {
  padding: 16px;
  border-radius: 10px;
  background-color: rgba(0, 0, 0, 0.015);
  border: 1px solid rgba(0, 0, 0, 0.02);
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;

  html.dark & {
    background-color: rgba(255, 255, 255, 0.01);
    border: 1px solid rgba(255, 255, 255, 0.02);
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
    border-color: rgba(0, 0, 0, 0.06);

    html.dark & {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      border-color: rgba(255, 255, 255, 0.06);
    }
  }
}

.metric-header {
  margin-bottom: 8px;
}

.metric-label {
  font-size: 12px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--n-text-color);
  opacity: 0.8;
  
  &.clickable {
    cursor: pointer;
    user-select: none;
    transition: opacity 0.2s, color 0.2s;
    &:hover {
      opacity: 1;
      color: v-bind('themeVars.primaryColor');
    }
  }

  .info-icon {
    font-size: 13px;
    opacity: 0.6;
  }
}

.metric-value-row {
  display: flex;
  align-items: baseline;
  margin-bottom: 2px;

  .metric-val {
    font-size: 20px;
    font-weight: 800;
    font-family: monospace;
    color: var(--n-text-color);
  }

  .metric-unit {
    font-size: 12px;
    font-weight: 600;
    margin-left: 4px;
    opacity: 0.8;
  }
}
</style>
