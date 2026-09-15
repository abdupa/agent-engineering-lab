import { Logger } from '@nestjs/common';
import { evaluateScenario } from './evaluate';
import { scenarios } from './scenarios';

describe('Deterministic agent trajectory evaluation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it.each(scenarios)('$name', evaluateScenario);
});
