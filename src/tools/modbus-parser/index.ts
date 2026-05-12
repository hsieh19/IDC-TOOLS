import { Cpu } from '@vicons/tabler';
import { defineTool } from '../tool';
import { translate } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: translate('tools.modbus-parser.title'),
  path: '/modbus-parser',
  description: translate('tools.modbus-parser.description'),
  keywords: ['modbus', 'parser', 'rtu', 'tcp', 'crc16', 'plc', '工控', '协议', '解析器', '弱电'],
  component: () => import('./modbus-parser.vue'),
  icon: Cpu,
  createdAt: new Date('2026-05-12'),
});
