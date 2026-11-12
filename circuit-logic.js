// Pure circuit validator, independent of the AR renderer.
// Each wire connects two named terminals; the physical wire color does not matter.
const neededPairs = [
  ['batteryPlus', 'switchIn'],
  ['switchOut', 'lampPlus'],
  ['lampMinus', 'batteryMinus'],
];
const signature = (a, b) => [a, b].sort().join(':');
const needed = new Set(neededPairs.map(([a, b]) => signature(a, b)));
export function assessCircuit(wires, switchClosed) {
  const pairs = wires.filter(w => w.ends.every(end => typeof end.port === 'string'))
    .map(w => signature(w.ends[0].port, w.ends[1].port));
  const unique = new Set(pairs);
  const correctCount = pairs.filter(p => needed.has(p)).length;
  const connected = pairs.length === 3 && unique.size === 3 && correctCount === 3;
  return {correctCount, connected, lit: connected && switchClosed};
}
export const requiredConnections = neededPairs.map(p => [...p]);
