<script lang="ts" setup>
import { NIcon, useThemeVars } from 'naive-ui';

import { RouterLink } from 'vue-router';
import { Home2, Menu2 } from '@vicons/tabler';
import { IconCoffee } from '@tabler/icons-vue';

import { storeToRefs } from 'pinia';
import HeroGradient from '../assets/hero-gradient.svg?component';
import MenuLayout from '../components/MenuLayout.vue';
import NavbarButtons from '../components/NavbarButtons.vue';
import { useStyleStore } from '@/stores/style.store';
import { config } from '@/config';
import type { ToolCategory } from '@/tools/tools.types';
import { useToolStore } from '@/tools/tools.store';
import CollapsibleToolMenu from '@/components/CollapsibleToolMenu.vue';

const themeVars = useThemeVars();
const styleStore = useStyleStore();
const showSponsorModal = ref(false);

const { t } = useI18n();

const toolStore = useToolStore();
const { favoriteTools, toolsByCategory } = storeToRefs(toolStore);

const tools = computed<ToolCategory[]>(() => [
  ...(favoriteTools.value.length > 0 ? [{ name: t('tools.categories.favorite-tools'), components: favoriteTools.value }] : []),
  ...toolsByCategory.value,
]);
</script>

<template>
  <MenuLayout class="menu-layout" :class="{ isSmallScreen: styleStore.isSmallScreen }">
    <template #sider>
      <RouterLink to="/" class="hero-wrapper">
        <HeroGradient class="gradient" />
        <div class="text-wrapper">
          <div class="title">
            IDC TOOLS
          </div>
          <div class="divider" />
          <div class="subtitle">
            {{ $t('home.subtitle') }}
          </div>
        </div>
      </RouterLink>

      <div class="sider-content">
        <div v-if="styleStore.isSmallScreen" flex flex-col items-center>
          <div flex justify-center>
            <NavbarButtons />
          </div>
        </div>

        <CollapsibleToolMenu :tools-by-category="tools" />
      </div>
    </template>

    <template #content>
      <div flex items-center justify-center gap-2>
        <c-button circle variant="text" :aria-label="$t('home.toggleMenu')" @click="styleStore.isMenuCollapsed = !styleStore.isMenuCollapsed">
          <NIcon size="25">
            <Menu2 />
          </NIcon>
        </c-button>

        <c-tooltip :tooltip="$t('home.home')" position="bottom">
          <c-button to="/" circle variant="text" :aria-label="$t('home.home')">
            <NIcon size="25">
              <Home2 />
            </NIcon>
          </c-button>
        </c-tooltip>

        <c-tooltip :tooltip="$t('home.uiLib')" position="bottom">
          <c-button v-if="config.app.env === 'development'" to="/c-lib" circle variant="text" :aria-label="$t('home.uiLib')">
            <icon-mdi:brush-variant text-20px />
          </c-button>
        </c-tooltip>

        <command-palette />

        <c-tooltip :tooltip="$t('sponsor.buttonTooltip')" position="bottom">
          <c-button circle variant="text" :aria-label="$t('sponsor.buttonTooltip')" @click="showSponsorModal = true">
            <n-icon size="25" :component="IconCoffee" />
          </c-button>
        </c-tooltip>

        <div>
          <NavbarButtons v-if="!styleStore.isSmallScreen" />
        </div>
      </div>
      <slot />

      <c-modal v-model:open="showSponsorModal">
        <div style="width: 100%;">

          <!-- Header：渐变图标徽章 + 分层文字 + 关闭按钮 -->
          <div style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 16px; border-bottom: 1px solid #f0f0f0; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, #6366f1, #8b5cf6); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(99,102,241,0.30); flex-shrink: 0;">
                <n-icon size="22" :component="IconCoffee" style="color: white;" />
              </div>
              <div>
                <div style="font-size: 17px; font-weight: 700; color: #111827; line-height: 1.2;">{{ $t('sponsor.title') }}</div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">{{ $t('sponsor.description') }}</div>
              </div>
            </div>
            <button
              style="border: none; background: #f9fafb; border-radius: 8px; cursor: pointer; color: #6b7280; padding: 8px; line-height: 1; flex-shrink: 0; display: flex; align-items: center;"
              @click="showSponsorModal = false"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <!-- QR 区域：浅紫渐变底板 + 白色悬浮卡片 -->
          <div style="background: linear-gradient(135deg, #eef2ff 0%, #faf5ff 100%); border-radius: 16px; padding: 20px;">
            <!--
              容器宽 = modal(576) - pa(48) - gray-padding(40) = 488px
              原图 1361×1131。QR占中央约50%宽=680px。
              显示宽度 = 488/(680/1361) ≈ 980px → QR正好填满488px容器
            -->
            <div style="background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(99,102,241,0.10), 0 1px 4px rgba(0,0,0,0.06); overflow: hidden; width: 100%; height: 360px; position: relative;">
              <img
                src="https://update.anyport.one/anyport/reward.png"
                alt="赞赏码"
                style="position: absolute; top: 47%; left: 50%; transform: translate(-50%, -50%); width: 450px; height: auto; image-rendering: -webkit-optimize-contrast;"
              />
            </div>
          </div>

          <!-- 底部寄语 -->
          <p style="text-align: center; font-size: 12px; color: #9ca3af; margin: 14px 0 0 0; letter-spacing: 0.01em;">{{ $t('sponsor.footerText') }}</p>
        </div>
      </c-modal>
    </template>
  </MenuLayout>
</template>

<style lang="less" scoped>
.sider-content {
  padding-top: 160px;
  padding-bottom: 200px;
}

.hero-wrapper {
  position: absolute;
  display: block;
  left: 0;
  width: 100%;
  z-index: 10;
  overflow: hidden;

  .gradient {
    margin-top: -65px;
  }

  .text-wrapper {
    position: absolute;
    left: 0;
    width: 100%;
    text-align: center;
    top: 16px;
    color: #fff;

    .title {
      font-size: 25px;
      font-weight: 600;
    }

    .divider {
      width: 50px;
      height: 2px;
      border-radius: 4px;
      background-color: v-bind('themeVars.primaryColor');
      margin: 0 auto 5px;
    }

    .subtitle {
      font-size: 16px;
    }
  }
}
</style>
