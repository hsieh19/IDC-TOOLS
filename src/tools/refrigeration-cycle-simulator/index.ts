import { Gauge } from '@vicons/tabler';
import { defineTool } from '../tool';
import { translate } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: translate('tools.refrigeration-cycle-simulator.title'),
  path: '/refrigeration-cycle-simulator',
  description: translate('tools.refrigeration-cycle-simulator.description'),
  keywords: [
    'refrigeration',
    'cycle',
    'thermodynamics',
    'hvac',
    'cop',
    'compressor',
    'condenser',
    'evaporator',
    'pressure',
    'enthalpy',
    '制冷',
    '循环',
    '暖通',
    '压焓图',
    '压缩机',
    '冷凝器',
    '蒸发器',
    '膨胀阀',
    '效率',
  ],
  component: () => import('./refrigeration-cycle-simulator.vue'),
  icon: Gauge,
});
