// Validate exactly the same initial route that the browser will draw.
import {readFileSync} from 'node:fs';
import {fitOval, stadiumLoop} from '../presets.js';

const records = JSON.parse(readFileSync(0, 'utf8'));
const paths = records.map(([, , lat, lon, exact, deltas]) => {
  const outline = [];
  for (let i = 0; i < deltas.length; i += 2) {
    outline.push([lat + deltas[i] / 1e6, lon + deltas[i + 1] / 1e6]);
  }
  return exact ? outline : stadiumLoop(fitOval([lat, lon], outline));
});
process.stdout.write(JSON.stringify(paths));
