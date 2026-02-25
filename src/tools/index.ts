import { tool as emailNormalizer } from './email-normalizer';
import { tool as regexTester } from './regex-tester';
import { tool as regexMemo } from './regex-memo';
import { tool as macAddressGenerator } from './mac-address-generator';
import { tool as jsonToCsv } from './json-to-csv';
import { tool as cameraRecorder } from './camera-recorder';
import { tool as ipv6UlaGenerator } from './ipv6-ula-generator';
import { tool as ipv4AddressConverter } from './ipv4-address-converter';
import { tool as ipv4SubnetCalculator } from './ipv4-subnet-calculator';
import { tool as ipv4RangeExpander } from './ipv4-range-expander';
import { tool as dockerRunToDockerComposeConverter } from './docker-run-to-docker-compose-converter';
import { tool as jsonMinify } from './json-minify';
import { tool as crontabGenerator } from './crontab-generator';
import { tool as gitMemo } from './git-memo';
import { tool as qrCodeGenerator } from './qr-code-generator';
import { tool as wifiQrCodeGenerator } from './wifi-qr-code-generator';
import { tool as randomPortGenerator } from './random-port-generator';
import { tool as sqlPrettify } from './sql-prettify';
import { tool as svgPlaceholderGenerator } from './svg-placeholder-generator';
import { tool as macAddressLookup } from './mac-address-lookup';
import { tool as xmlFormatter } from './xml-formatter';
import { tool as yamlViewer } from './yaml-viewer';
import { tool as jsonViewer } from './json-viewer';
import { tool as chmodCalculator } from './chmod-calculator';
import type { ToolCategory } from './tools.types';

export const toolsByCategory: ToolCategory[] = [
  {
    name: 'Images and videos',
    components: [qrCodeGenerator, wifiQrCodeGenerator, svgPlaceholderGenerator, cameraRecorder],
  },
  {
    name: 'Development',
    components: [
      gitMemo,
      randomPortGenerator,
      crontabGenerator,
      jsonViewer,
      jsonMinify,
      jsonToCsv,
      sqlPrettify,
      chmodCalculator,
      dockerRunToDockerComposeConverter,
      xmlFormatter,
      yamlViewer,
      emailNormalizer,
      regexTester,
      regexMemo,
    ],
  },
  {
    name: 'Network',
    components: [ipv4SubnetCalculator, ipv4AddressConverter, ipv4RangeExpander, macAddressLookup, macAddressGenerator, ipv6UlaGenerator],
  },
];

export const tools = toolsByCategory.flatMap(({ components }) => components);
export const toolsWithCategory = toolsByCategory.flatMap(({ components, name }) =>
  components.map(tool => ({ category: name, ...tool })),
);
