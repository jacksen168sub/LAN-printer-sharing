import type { PeerId, DcEnvelope } from 'shared';

/** 传输层抽象:上层不关心底层是 WebRTC 还是 Relay,便于将来替换。 */
export interface Transport {
  readonly self: PeerId;
  connect(): Promise<void>;
  disconnect(): void;
  onPeersChange(cb: (peers: PeerId[]) => void): void;
  onMessage(cb: (env: DcEnvelope) => void): void;
  onSignalingState(cb: (ready: boolean) => void): void;
  onPeerState(cb: (peer: PeerId, state: 'connecting' | 'open' | 'closed') => void): void;
  send(to: PeerId, type: DcEnvelope['type'], payload: unknown): Promise<void>;
}
