<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { identity } from '../stores/identity';
import { network, sendToPeer } from '../stores/network';
import { getOwnContent } from '../stores/identity';
import { getTemplate } from '../templates/registry';

const router = useRouter();
const pingStatus = ref('');

const own = getOwnContent();
const ownLabel = computed(() => (own ? getTemplate(own.content.type).label : null));
const ownUpdated = computed(() => (own ? new Date(own.updatedAt).toLocaleString() : null));

async function ping(peer: string) {
  pingStatus.value = '发送中…';
  for (let i = 0; i < 3; i++) {
    try {
      await sendToPeer(peer, 'ping', { from: identity.id, t: Date.now() });
      pingStatus.value = '已发送 ✓(看对方是否收到)';
      return;
    } catch (e) {
      if (i < 2) await new Promise((r) => setTimeout(r, 800));
      else pingStatus.value = '通道未就绪:' + (e as Error).message;
    }
  }
}
</script>

<template>
  <section class="card">
    <div class="label">本机 ID</div>
    <div class="id">{{ identity.id }}</div>
  </section>

  <section class="card">
    <div class="label">我的内容</div>
    <template v-if="own">
      <div class="own-row">
        <span class="own-type">{{ ownLabel }}</span>
        <span class="own-meta">{{ own.layout.orientation === 'landscape' ? '横向' : '纵向' }}<template v-if="own.layout.fold === 'half-long-edge'"> · 对折</template></span>
        <span class="own-time">{{ ownUpdated }}</span>
      </div>
      <div class="actions">
        <button type="button" class="btn" @click="router.push('/edit')">编辑</button>
        <button type="button" class="btn btn-primary" @click="router.push('/print')">预览 / 打印</button>
      </div>
    </template>
    <template v-else>
      <div class="empty">尚未编辑内容</div>
      <div class="actions">
        <button type="button" class="btn btn-primary" @click="router.push('/edit')">编辑我的内容</button>
      </div>
    </template>
  </section>

  <section class="card">
    <div class="label">
      在线设备({{ network.peers.length }})·
      信令:{{ network.signalingReady ? '已连接' : '连接中…' }}
    </div>
    <md-list v-if="network.peers.length">
      <md-list-item
        v-for="p in network.peers"
        :key="p"
        @click="router.push('/peer/' + p)"
      >
        <div slot="headline">{{ p }}</div>
        <div slot="supporting-text">通道:{{ network.peerStates[p] || '新建中' }}</div>
        <button slot="end" type="button" class="btn" @click.stop="ping(p)">发测试消息</button>
      </md-list-item>
    </md-list>
    <div v-else class="empty">暂无其他设备上线</div>
    <div v-if="pingStatus" class="hint">{{ pingStatus }}</div>
  </section>

  <section class="card" v-if="network.messages.length">
    <div class="label">收到的消息(实时)</div>
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
.id {
  font-size: 36px;
  font-weight: 700;
  letter-spacing: 2px;
  font-family: ui-monospace, monospace;
  color: #005ac1;
}
.own-row { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: baseline; }
.own-type { font-weight: 600; }
.own-meta { font-size: 13px; color: #444; }
.own-time { font-size: 12px; color: #999; }
.actions { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
.empty { color: #999; padding: 12px 0; }
.hint { font-size: 12px; color: #888; margin-top: 8px; }
pre { background: #f5f5f5; padding: 8px; border-radius: 6px; font-size: 12px; overflow: auto; margin: 0; }
</style>
