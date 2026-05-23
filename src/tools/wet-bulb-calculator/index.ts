import { Droplet } from '@vicons/tabler';
import { defineTool } from '../tool';
import { translate } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: translate('tools.wet-bulb-calculator.title'),
  path: '/wet-bulb-calculator',
  description: translate('tools.wet-bulb-calculator.description'),
  keywords: [
    'wet bulb',
    'temperature',
    'humidity',
    'hvac',
    'dew point',
    'enthalpy',
    'pressure',
    'altitude',
    'psychrometric',
    '暖通',
    '湿球',
    '露点',
    '比焓',
    '气压',
    '湿度',
  ],
  component: () => import('./wet-bulb-calculator.vue'),
  icon: Droplet,
});
