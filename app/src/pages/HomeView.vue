<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { identity, getOwnContent, formatId, shortId } from '../stores/identity';
import { network, pingPeer, reconnectSignaling, setRoom, getManualRoom } from '../stores/network';
import { getTemplate } from '../templates/registry';
import { useI18n } from 'vue-i18n';
import { peerStateLabel, setLocale, type Locale } from '../i18n';
import Tip from '../components/Tip.vue';

const router = useRouter();
const { t, locale } = useI18n();
const isDev = import.meta.env.DEV;

const own = getOwnContent();
const ownLabel = computed(() => (own ? getTemplate(own.content.type).label : null));
const ownUpdated = computed(() => (own ? new Date(own.updatedAt).toLocaleString() : null));
const idDisplay = computed(() => formatId(identity.id));

function ownOrientLabel(): string {
  if (!own) return '';
  return own.layout.orientation === 'landscape' ? t('home.landscape') : t('home.portrait')
    + (own.layout.fold === 'half-long-edge' ? ' · ' + t('home.fold') : '');
}

/** peer 卡片背景:按通道状态着色。 */
function peerBg(st: string | undefined): string {
  if (st === 'open') return '#e8f5e9'; // 绿
  if (st === 'connecting') return '#fff8e1'; // 琥珀
  if (st === 'closed') return '#ffebee'; // 红
  return '#fff';
}

function ping(p: string) {
  pingPeer(p);
}

function onLocaleChange(e: Event) {
  setLocale((e.target as HTMLSelectElement).value as Locale);
}

// 房间码切换:手动输入覆盖服务端自动分房;留空重置回自动。
const roomInput = ref(getManualRoom() ?? '');
const isManual = computed(() => !!network.myRoom && !!network.myAutoCode && network.myRoom !== network.myAutoCode);
function doSwitchRoom() {
  const code = roomInput.value.trim();
  if (!code) return;
  setRoom(code);
}
function doResetAuto() {
  roomInput.value = '';
  setRoom(null);
}

// 复制本机 ID(32 hex 较长,提供复制便于比对)
const copied = ref(false);
function copyId() {
  navigator.clipboard?.writeText(idDisplay.value)
    .then(() => { copied.value = true; setTimeout(() => (copied.value = false), 1500); })
    .catch(() => { /* 剪贴板不可用,忽略 */ });
}
</script>

<template>
  <section class="card">
    <div class="id-head">
      <div class="label">{{ t('home.ownId') }}</div>
      <div class="id-actions">
        <button type="button" class="mini-btn" @click="copyId">{{ copied ? t('common.copied') : t('common.copy') }}</button>
        <select class="locale-select" :value="locale" @change="onLocaleChange" aria-label="Language">
          <option value="zh-CN">中文</option>
          <option value="en">EN</option>
        </select>
      </div>
    </div>
    <Tip :text="idDisplay"><span class="id-long">{{ shortId(identity.id) }}</span></Tip>
  </section>

  <section class="card">
    <div class="label">{{ t('home.myContent') }}</div>
    <template v-if="own">
      <div class="own-row">
        <span class="own-type">{{ ownLabel }}</span>
        <span class="own-meta">{{ ownOrientLabel() }}</span>
        <span class="own-time">{{ ownUpdated }}</span>
      </div>
      <div class="actions">
        <button type="button" class="btn" @click="router.push('/edit')">{{ t('common.edit') }}</button>
        <button type="button" class="btn btn-primary" @click="router.push('/print')">{{ t('home.previewPrint') }}</button>
      </div>
    </template>
    <template v-else>
      <div class="empty">{{ t('home.noContent') }}</div>
      <div class="actions">
        <button type="button" class="btn btn-primary" @click="router.push('/edit')">{{ t('home.editMyContent') }}</button>
      </div>
    </template>
  </section>

  <!-- 信令状态:紧凑状态条 + 呼吸圆点 + 右侧重连 -->
  <section class="sig-bar" :class="network.signalingReady ? 'is-on' : 'is-off'">
    <span class="sig-dot"></span>
    <span class="sig-text">{{ t('home.signaling') }}:{{ network.signalingReady ? t('home.connected') : t('home.connecting') }}</span>
    <button type="button" class="sig-reconnect" @click="reconnectSignaling">{{ t('home.reconnect') }}</button>
  </section>

  <!-- 网络:公网 IP + 自动/当前房间码 + 手动切换 -->
  <section class="card net-card">
    <div class="label">{{ t('home.networkInfo') }}</div>
    <div class="net-row"><span class="net-k">{{ t('home.currentIp') }}</span><span class="net-v">{{ network.myIp ?? '—' }}</span></div>
    <div class="net-row"><span class="net-k">{{ t('home.autoRoom') }}</span><span class="net-v mono">{{ network.myAutoCode ?? '—' }}</span></div>
    <div class="net-row"><span class="net-k">{{ t('home.currentRoom') }}</span><span class="net-v mono" :class="{ changed: isManual }">{{ network.myRoom ?? '—' }}</span></div>
    <div class="net-switch">
      <input class="room-input" v-model="roomInput" :placeholder="t('home.roomInput')" maxlength="12" inputmode="numeric" @keyup.enter="doSwitchRoom" />
      <button type="button" class="btn btn-primary" @click="doSwitchRoom">{{ t('home.switchRoom') }}</button>
      <button type="button" class="btn" v-if="isManual" @click="doResetAuto">{{ t('home.resetAuto') }}</button>
    </div>
  </section>

  <section class="card">
    <div class="label">{{ t('home.onlineDevices', { count: network.peers.length }) }}</div>
    <div v-if="network.peers.length" class="peer-list">
      <div
        v-for="p in network.peers"
        :key="p"
        class="peer-card"
        :style="{ background: peerBg(network.peerStates[p]) }"
        @click="router.push('/peer/' + p)"
      >
        <div class="peer-head">
          <Tip :text="formatId(p)"><span class="peer-id">{{ shortId(p) }}</span></Tip>
          <span class="peer-state">{{ t('home.channel') }}:{{ peerStateLabel(network.peerStates[p]) }}</span>
        </div>
        <div class="peer-foot">
          <span class="peer-latency" v-if="network.peerLatencies[p] != null">
            {{ t('home.latencyValue', { ms: network.peerLatencies[p] }) }}
          </span>
          <span class="peer-latency placeholder" v-else>—</span>
          <button type="button" class="btn peer-ping" @click.stop="ping(p)">{{ t('home.ping') }}</button>
        </div>
      </div>
    </div>
    <div v-else class="empty">{{ t('home.noPeers') }}</div>
  </section>

  <!-- 调试面板:仅开发期 -->
  <section class="card" v-if="isDev && network.messages.length">
    <div class="label">{{ t('home.messagesDebug') }}</div>
    <pre>{{ network.messages.slice(-5).map(m => m.from + ': ' + JSON.stringify(m.payload)).join('\n') }}</pre>
  </section>
</template>

<style scoped>
.card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}
.label { font-size: 12px; color: #666; margin-bottom: 6px; }
.id-long {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 1px;
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  color: #005ac1;
  cursor: help;
}
.id-head { display: flex; justify-content: space-between; align-items: center; }
.id-actions { display: flex; gap: 6px; align-items: center; }
.mini-btn {
  font: inherit;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid rgba(127, 127, 127, 0.4);
  background: transparent;
  color: #005ac1;
  cursor: pointer;
}
.mini-btn:hover { background: rgba(0, 90, 193, 0.08); }
.locale-select {
  font: inherit;
  font-size: 12px;
  padding: 3px 6px;
  border-radius: 6px;
  border: 1px solid rgba(127, 127, 127, 0.4);
  background: transparent;
  color: #555;
  cursor: pointer;
}
.net-card { display: flex; flex-direction: column; gap: 6px; }
.net-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; font-size: 13px; }
.net-k { color: #666; flex: none; }
.net-v { color: #333; text-align: right; word-break: break-all; }
.net-v.mono { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 15px; font-weight: 600; }
.net-v.changed { color: #005ac1; }
.net-switch { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
.room-input {
  flex: 1 1 120px;
  min-width: 0;
  font: inherit;
  font-size: 14px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid rgba(127, 127, 127, 0.4);
  background: transparent;
  color: inherit;
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
}
.room-input:focus { outline: 2px solid #005ac1; border-color: #005ac1; }
.own-row { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: baseline; }
.own-type { font-weight: 600; }
.own-meta { font-size: 13px; color: #444; }
.own-time { font-size: 12px; color: #999; }
.actions { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
.empty { color: #999; padding: 12px 0; }

/* 信令状态条:紧凑、连接中圆点呼吸 */
.sig-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  margin-bottom: 12px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  font-size: 13px;
}
.sig-bar.is-on { background: #f6fbf7; }
.sig-bar.is-off { background: #fffbf2; }
.sig-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.is-on .sig-dot { background: #34a853; box-shadow: 0 0 0 3px rgba(52, 168, 83, 0.15); }
.is-off .sig-dot { background: #f5a623; box-shadow: 0 0 0 3px rgba(245, 166, 35, 0.15); animation: sig-pulse 1.2s ease-in-out infinite; }
@keyframes sig-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.sig-text { color: #333; }
.sig-reconnect {
  margin-left: auto;
  font: inherit;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(127, 127, 127, 0.35);
  background: transparent;
  color: #555;
  cursor: pointer;
  transition: background 0.12s;
}
.sig-reconnect:hover { background: rgba(0, 0, 0, 0.05); }

/* peer 列表 */
.peer-list { display: flex; flex-direction: column; gap: 8px; }
.peer-card {
  border-radius: 10px;
  padding: 12px;
  cursor: pointer;
  border: 1px solid rgba(0,0,0,0.06);
  transition: background 0.15s;
}
.peer-card:hover { filter: brightness(0.98); }
.peer-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.peer-id { font-family: ui-monospace, monospace; font-weight: 700; font-size: 16px; cursor: help; }
.peer-state { font-size: 12px; color: #555; }
.peer-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
.peer-latency { font-size: 12px; color: #444; }
.peer-latency.placeholder { color: #bbb; }
.peer-ping { padding: 4px 12px; font-size: 13px; }

pre { background: #f5f5f5; padding: 8px; border-radius: 6px; font-size: 12px; overflow: auto; margin: 0; }
</style>
