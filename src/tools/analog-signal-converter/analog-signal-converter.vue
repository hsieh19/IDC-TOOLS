<script setup lang="ts">
import { useThemeVars } from 'naive-ui';

const themeVars = useThemeVars();

// 1. 核心电信号量程状态与当前值
const electricalMin = ref(4);
const electricalMax = ref(20);
const electricalUnit = ref('mA');
const electricalVal = ref(12);

// 2. 传感器实际物理量程状态与当前值
const physicalMin = ref(0);
const physicalMax = ref(50);
const physicalUnit = ref('Hz');
const physicalVal = ref(25);

// 3. PLC 模数转换寄存器范围与当前值
const enablePlc = ref(true);
const plcMin = ref(0);
const plcMax = ref(27648);
const plcVal = ref(13824);

// 4. 双向同步数值状态管理 (使用百分比作主轴，支持断线、过载等全范围外推)
const percentage = ref(50);
let isUpdating = false;

// 通过百分比同步所有轴上的数值
function updateFromPercentage(p: number) {
  if (isUpdating) return;
  isUpdating = true;
  percentage.value = p;

  const eSpan = electricalMax.value - electricalMin.value;
  electricalVal.value = Number((electricalMin.value + (p / 100) * eSpan).toFixed(4));

  const pSpan = physicalMax.value - physicalMin.value;
  physicalVal.value = Number((physicalMin.value + (p / 100) * pSpan).toFixed(4));

  const dSpan = plcMax.value - plcMin.value;
  plcVal.value = Math.round(plcMin.value + (p / 100) * dSpan);

  isUpdating = false;
}

// 各个轴手动输入时的更新反算逻辑
function onElectricalInput(val: number | null) {
  if (val === null || isUpdating) return;
  isUpdating = true;
  electricalVal.value = val;
  const span = electricalMax.value - electricalMin.value;
  let p = 0;
  if (span !== 0) {
    p = ((val - electricalMin.value) / span) * 100;
  }
  percentage.value = Number(p.toFixed(4));

  const pSpan = physicalMax.value - physicalMin.value;
  physicalVal.value = Number((physicalMin.value + (p / 100) * pSpan).toFixed(4));

  const dSpan = plcMax.value - plcMin.value;
  plcVal.value = Math.round(plcMin.value + (p / 100) * dSpan);
  isUpdating = false;
}

function onPhysicalInput(val: number | null) {
  if (val === null || isUpdating) return;
  isUpdating = true;
  physicalVal.value = val;
  const span = physicalMax.value - physicalMin.value;
  let p = 0;
  if (span !== 0) {
    p = ((val - physicalMin.value) / span) * 100;
  }
  percentage.value = Number(p.toFixed(4));

  const eSpan = electricalMax.value - electricalMin.value;
  electricalVal.value = Number((electricalMin.value + (p / 100) * eSpan).toFixed(4));

  const dSpan = plcMax.value - plcMin.value;
  plcVal.value = Math.round(plcMin.value + (p / 100) * dSpan);
  isUpdating = false;
}

function onPlcInput(val: number | null) {
  if (val === null || isUpdating) return;
  isUpdating = true;
  plcVal.value = Math.round(val);
  const span = plcMax.value - plcMin.value;
  let p = 0;
  if (span !== 0) {
    p = ((val - plcMin.value) / span) * 100;
  }
  percentage.value = Number(p.toFixed(4));

  const eSpan = electricalMax.value - electricalMin.value;
  electricalVal.value = Number((electricalMin.value + (p / 100) * eSpan).toFixed(4));

  const pSpan = physicalMax.value - physicalMin.value;
  physicalVal.value = Number((physicalMin.value + (p / 100) * pSpan).toFixed(4));
  isUpdating = false;
}

// 监听上下限的变更，重算当前轴上数值
watch([electricalMin, electricalMax, physicalMin, physicalMax, plcMin, plcMax], () => {
  updateFromPercentage(percentage.value);
});

// 初始化
onMounted(() => {
  updateFromPercentage(50);
});
</script>

<template>
  <div class="analog-converter-container py-12px">
    <n-grid cols="1 md:3" :x-gap="16" :y-gap="16" item-responsive>
      <!-- 1. 电信号量程与当前值计算 -->
      <n-grid-item>
        <n-card title="🔌 电信号换算" size="medium" class="shadow-sm rounded-8px h-full">
          <div class="flex flex-col gap-12px">
            <!-- 量程上限与下限 -->
            <n-grid cols="2" :x-gap="12">
              <n-form-item-gi label="下限 (Min)">
                <n-input-number v-model:value="electricalMin" class="w-full" />
              </n-form-item-gi>
              <n-form-item-gi label="上限 (Max)">
                <n-input-number v-model:value="electricalMax" class="w-full" />
              </n-form-item-gi>
            </n-grid>
            <!-- 当前值与单位并排（当前值放左边，单位放右边） -->
            <n-grid cols="2" :x-gap="12">
              <n-form-item-gi>
                <template #label>
                  <span class="font-600" :style="{ color: themeVars.primaryColor }">当前电信号值</span>
                </template>
                <n-input-number
                  v-model:value="electricalVal"
                  :show-button="false"
                  placeholder="当前电信号值"
                  class="w-full font-mono font-600"
                  @update:value="onElectricalInput"
                />
              </n-form-item-gi>
              <n-form-item-gi label="电量单位">
                <c-input-text v-model:value="electricalUnit" placeholder="mA 或 V" />
              </n-form-item-gi>
            </n-grid>
          </div>
        </n-card>
      </n-grid-item>

      <!-- 2. 物理量程与当前值计算 -->
      <n-grid-item>
        <n-card title="🌡️ 物理量换算" size="medium" class="shadow-sm rounded-8px h-full">
          <div class="flex flex-col gap-12px">
            <!-- 物理量上下限 -->
            <n-grid cols="2" :x-gap="12">
              <n-form-item-gi label="物理下限 (Min)">
                <n-input-number v-model:value="physicalMin" class="w-full" />
              </n-form-item-gi>
              <n-form-item-gi label="物理上限 (Max)">
                <n-input-number v-model:value="physicalMax" class="w-full" />
              </n-form-item-gi>
            </n-grid>
            <!-- 当前值与单位并排（当前值放左边，单位放右边） -->
            <n-grid cols="2" :x-gap="12">
              <n-form-item-gi>
                <template #label>
                  <span class="font-600 text-amber-500">当前物理量值</span>
                </template>
                <n-input-number
                  v-model:value="physicalVal"
                  :show-button="false"
                  placeholder="当前物理值"
                  class="w-full font-mono font-600 text-amber-500"
                  @update:value="onPhysicalInput"
                />
              </n-form-item-gi>
              <n-form-item-gi label="物理单位">
                <c-input-text v-model:value="physicalUnit" placeholder="℃, Hz..." />
              </n-form-item-gi>
            </n-grid>
          </div>
        </n-card>
      </n-grid-item>

      <!-- 3. PLC 采集映射与当前值计算 -->
      <n-grid-item>
        <n-card size="medium" class="shadow-sm rounded-8px h-full">
          <template #header>
            <div class="flex items-center justify-between w-full">
              <span>🤖 PLC 模数映射</span>
              <n-switch v-model:value="enablePlc" />
            </div>
          </template>
          <div v-if="enablePlc" class="flex flex-col gap-12px pt-4px">
            <!-- AD 转换上下限 -->
            <n-grid cols="2" :x-gap="12">
              <n-form-item-gi label="AD 转换下限">
                <n-input-number v-model:value="plcMin" class="w-full" />
              </n-form-item-gi>
              <n-form-item-gi label="AD 转换上限">
                <n-input-number v-model:value="plcMax" class="w-full" />
              </n-form-item-gi>
            </n-grid>
            <!-- 当前值与单位并排（当前值放左边，单位放右边） -->
            <n-grid cols="2" :x-gap="12">
              <n-form-item-gi>
                <template #label>
                  <span class="font-600 text-teal-500">当前 AD 整数值</span>
                </template>
                <n-input-number
                  v-model:value="plcVal"
                  :show-button="false"
                  placeholder="PLC 整数值"
                  class="w-full font-mono font-600 text-teal-500"
                  @update:value="onPlcInput"
                />
              </n-form-item-gi>
              <n-form-item-gi label="数据寄存器">
                <c-input-text :disabled="true" value="RAW" />
              </n-form-item-gi>
            </n-grid>
          </div>
          <div v-else class="text-neutral-400 dark:text-neutral-500 text-center py-40px">
            PLC 整数映射已关闭
          </div>
        </n-card>
      </n-grid-item>
    </n-grid>

    <!-- 极简公式展示底栏 -->
    <div class="mt-24px flex justify-center">
      <div class="text-12px text-neutral-400 bg-neutral-100/3 dark:bg-neutral-800/10 px-24px py-14px rounded-8px border border-neutral-200/5 text-center max-w-600px shadow-sm">
        <span class="font-600 block mb-8px text-neutral-500 dark:text-neutral-400">⚡ 双向线性换算核心公式</span>
        <div class="inline-flex items-center gap-16px font-serif text-14px py-6px text-neutral-700 dark:text-neutral-300">
          <!-- 左侧：电量比例 -->
          <div class="flex flex-col items-center">
            <div class="pb-3px px-6px text-center" style="border-bottom: 1.5px solid currentColor; min-width: 45px;">X - A</div>
            <div class="pt-3px px-6px text-center" style="min-width: 45px;">B - A</div>
          </div>
          <!-- 中间等号 -->
          <span class="text-16px font-sans font-bold text-neutral-400 dark:text-neutral-500">=</span>
          <!-- 右侧：物理量比例 -->
          <div class="flex flex-col items-center">
            <div class="pb-3px px-6px text-center" style="border-bottom: 1.5px solid currentColor; min-width: 45px;">Y - C</div>
            <div class="pt-3px px-6px text-center" style="min-width: 45px;">D - C</div>
          </div>
        </div>
        <div class="text-11px text-neutral-400/80 mt-10px border-t border-neutral-200/5 pt-8px" style="line-height: 1.5;">
          <span class="text-primary font-bold">X</span> (当前电量) ，量程范围为 <span class="font-bold">[A, B]</span><br />
          <span class="text-amber-500 font-bold">Y</span> (当前物理量) ，量程范围为 <span class="font-bold">[C, D]</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="less" scoped>
.analog-converter-container {
  max-width: 100%;
}

:deep(.n-card) {
  border: 1px solid rgba(120, 120, 120, 0.1) !important;
}
</style>