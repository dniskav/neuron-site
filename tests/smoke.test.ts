import { describe, expect, it } from 'vitest';
import { NeuronN } from '@dniskav/neuron';

describe('@dniskav/neuron', () => {
  it('NeuronN devuelve una predicción entre 0 y 1', () => {
    const neuron = new NeuronN(3);
    const out = neuron.predict([0.5, 0.5, 0.5]);
    expect(typeof out).toBe('number');
    expect(out).toBeGreaterThan(0);
    expect(out).toBeLessThan(1);
  });
});
