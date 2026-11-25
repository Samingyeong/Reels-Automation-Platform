/**
 * Mock 나레이션용 WAV 생성기. 실제 음성은 아니지만 단어 타이밍에 맞춘 짧은 톤을 만들어
 * 업로드·재생·렌더(오디오 트랙 포함) 경로를 유료 TTS 없이 검증한다.
 */
import type { Caption } from "../../domain/schemas";

const SAMPLE_RATE = 24_000;

export function synthesizeToneWav(captions: Caption[], durationMs: number, pitchSeed: number): Uint8Array {
  const total = Math.max(1, Math.round((durationMs / 1000) * SAMPLE_RATE));
  const pcm = new Int16Array(total);
  const base = 330 + (pitchSeed % 5) * 40;
  captions.forEach((c, i) => {
    const start = Math.round((c.startMs / 1000) * SAMPLE_RATE);
    const end = Math.min(total, Math.round(((c.startMs + (c.endMs - c.startMs) * 0.7) / 1000) * SAMPLE_RATE));
    const freq = base + (i % 3) * 30;
    for (let n = start; n < end; n++) {
      const t = (n - start) / SAMPLE_RATE;
      const len = (end - start) / SAMPLE_RATE;
      const env = Math.min(1, t / 0.02, (len - t) / 0.04); // 클릭 방지 페이드
      pcm[n] = Math.round(Math.sin(2 * Math.PI * freq * t) * 0.18 * 32767 * Math.max(0, env));
    }
  });
  return encodeWav(pcm, SAMPLE_RATE);
}

function encodeWav(pcm: Int16Array, sampleRate: number): Uint8Array {
  const dataBytes = pcm.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, dataBytes, true);
  new Int16Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}
