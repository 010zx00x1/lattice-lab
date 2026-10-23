import { prepareMesh } from './mesh-quality.js';

self.onmessage = ({ data }) => {
  try {
    const result = prepareMesh(data.positions, { repair: true });
    self.postMessage({ type: 'done', ...result }, [result.positions.buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error.message || error) });
  }
};
