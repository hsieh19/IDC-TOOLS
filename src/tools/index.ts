import { tool as modbusParser } from './modbus-parser';
import { tool as analogSignalConverter } from './analog-signal-converter';
import { tool as cameraRecorder } from './camera-recorder';
import { tool as qrCodeGenerator } from './qr-code-generator';
import { tool as wifiQrCodeGenerator } from './wifi-qr-code-generator';
import { tool as wetBulbCalculator } from './wet-bulb-calculator';
import { tool as refrigerationCycleSimulator } from './refrigeration-cycle-simulator';
import type { ToolCategory } from './tools.types';

export const toolsByCategory: ToolCategory[] = [
  {
    name: 'electrical',
    children: [],
  },
  {
    name: 'hvac',
    components: [wetBulbCalculator, refrigerationCycleSimulator],
  },
  {
    name: 'low-voltage',
    components: [analogSignalConverter, modbusParser],
  },
  {
    name: 'fire-fighting',
    children: [],
  },
  {
    name: 'public',
    children: [
      {
        name: 'images and videos',
        components: [qrCodeGenerator, wifiQrCodeGenerator, cameraRecorder],
      },
    ],
  },
];

const flattenTools = (categories: ToolCategory[]): any[] => {
  const tools: any[] = [];
  categories.forEach((category) => {
    if (category.components) {
      tools.push(...category.components.map(tool => ({ ...tool, category: category.name })));
    }
    if (category.children) {
      tools.push(...flattenTools(category.children));
    }
  });
  return tools;
};

export const tools = flattenTools(toolsByCategory);
export const toolsWithCategory = tools;
