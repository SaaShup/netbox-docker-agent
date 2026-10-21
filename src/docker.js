import Dockerode from 'dockerode';
export function dockerClient() {
  const host = process.env.DOCKER_HOST;
  if (!host || host.startsWith('unix://')) return new Dockerode({ socketPath: host?.slice(7) || '/var/run/docker.sock' });
  const url = new URL(host.replace(/^tcp:/, 'http:'));
  return new Dockerode({ host: url.hostname, port: Number(url.port) || 2375, protocol: url.protocol.slice(0, -1) });
}
export async function collect(stream, limit = 16 * 1024 * 1024) {
  if (Buffer.isBuffer(stream)) return stream;
  const chunks = []; let size = 0;
  for await (const chunk of stream) { size += chunk.length; if (size > limit) { stream.destroy(); throw Object.assign(new Error('Docker output too large'), { statusCode: 413 }); } chunks.push(Buffer.from(chunk)); }
  return Buffer.concat(chunks);
}
export function demux(buffer) {
  const chunks = []; let offset = 0;
  while (offset + 8 <= buffer.length && buffer[offset] <= 2 && buffer.readUIntBE(offset + 1, 3) === 0) {
    const size = buffer.readUInt32BE(offset + 4);
    if (offset + 8 + size > buffer.length) break;
    chunks.push(buffer.subarray(offset + 8, offset + 8 + size)); offset += size + 8;
  }
  return chunks.length && offset === buffer.length ? Buffer.concat(chunks) : buffer;
}
export function usage(data) {
  const sum = (list, fn) => (list || []).reduce((a, x) => a + (fn(x) || 0), 0);
  return { layers_size: data.LayersSize, images: { shared_size: sum(data.Images, x => x.SharedSize), size: sum(data.Images, x => x.Size), virtual_size: sum(data.Images, x => x.VirtualSize) }, containers: { size_rootfs: sum(data.Containers, x => x.SizeRootFs) }, volumes: sum(data.Volumes, x => x.UsageData?.Size), build_cache: sum(data.BuildCache, x => x.Size) };
}
// Dockerode does not expose system/df in all supported releases.
export function diskUsage(docker) { return new Promise((resolve, reject) => docker.modem.dial({ path: '/system/df', method: 'GET', statusCodes: { 200: true } }, (e, data) => e ? reject(e) : resolve(data))); }
