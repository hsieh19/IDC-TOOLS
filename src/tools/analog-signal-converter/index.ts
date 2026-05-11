import { ArrowsShuffle } from '@vicons/tabler';
import { defineTool } from '../tool';
import { translate } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: translate('tools.analog-signal-converter.title'),
  path: '/analog-signal-converter',
  description: translate('tools.analog-signal-converter.description'),
  keywords: ['analog', 'signal', 'converter', 'PLC', 'sensor', '电流', '电压', '传感器', '变送器', '模拟量', '弱电'],
  component: () => import('./analog-signal-converter.vue'),
  icon: ArrowsShuffle,
  createdAt: new Date('2026-05-11'),
});