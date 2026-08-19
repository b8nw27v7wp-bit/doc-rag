import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAnnIndex, annCandidateIndices, recommendedAnnParams } from '../lib/ann';

function v(a: number, b: number, c: number): Float32Array {
  return new Float32Array([a, b, c]);
}

function cluster(center: Float32Array, count: number, noise = 0.05): Float32Array[] {
  const out: Float32Array[] = [];
  for (let i = 0; i < count; i++) {
    const n = new Float32Array(3);
    let norm = 0;
    for (let d = 0; d < 3; d++) {
      n[d] = center[d] + (Math.sin(i * 31 + d * 17) * noise);
      norm += n[d] * n[d];
    }
    norm = Math.sqrt(norm) || 1;
    for (let d = 0; d < 3; d++) n[d] /= norm;
    out.push(n);
  }
  return out;
}

test('buildAnnIndex：确定性（同种子两次构建质心一致）', () => {
  const vectors = [...cluster(v(1, 0, 0), 20), ...cluster(v(0, 1, 0), 20)];
  const a = buildAnnIndex(vectors, { nlist: 2, seed: 7 });
  const b = buildAnnIndex(vectors, { nlist: 2, seed: 7 });
  assert.deepEqual(a.centroids, b.centroids);
  assert.deepEqual(a.buckets, b.buckets);
});

test('buildAnnIndex：三簇分离，探测最近桶可覆盖整个簇', () => {
  const vectors = [...cluster(v(1, 0, 0), 25), ...cluster(v(0, 1, 0), 25), ...cluster(v(0, 0, 1), 25)];
  const ann = buildAnnIndex(vectors, { nlist: 3, iterations: 20 });
  const q = v(1, 0, 0);
  const candidates = new Set(annCandidateIndices(ann, q, 1));
  for (let i = 0; i < 25; i++) {
    assert.ok(candidates.has(i), '簇 0 的全部向量应在最近桶中（第 ' + i + ' 个）');
  }
});

test('annCandidateIndices：nprobe=nlist 时返回全部下标', () => {
  const vectors = [...cluster(v(1, 0, 0), 10), ...cluster(v(0, 1, 0), 10)];
  const ann = buildAnnIndex(vectors, { nlist: 2 });
  const all = annCandidateIndices(ann, v(0, 0, 1), 2).sort((a, b) => a - b);
  assert.equal(all.length, 20);
});

test('buildAnnIndex：空输入返回空索引', () => {
  const ann = buildAnnIndex([]);
  assert.equal(ann.nlist, 0);
  assert.deepEqual(annCandidateIndices(ann, v(1, 0, 0), 2), []);
});

test('recommendedAnnParams：nlist=sqrt(N) 且有界', () => {
  assert.deepEqual(recommendedAnnParams(10_000), { nlist: 100, nprobe: 13 });
  const small = recommendedAnnParams(10);
  assert.ok(small.nlist >= 2);
  assert.ok(small.nprobe >= 2 && small.nprobe <= small.nlist);
});