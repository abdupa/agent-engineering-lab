import { validateEnvironment } from './environment';

describe('environment configuration', () => {
  it('supplies local development defaults', () => {
    expect(validateEnvironment({})).toEqual({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
    });
  });

  it('accepts explicit configuration and converts the port', () => {
    expect(
      validateEnvironment({
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '8080',
      }),
    ).toEqual({ NODE_ENV: 'production', HOST: '0.0.0.0', PORT: 8080 });
  });

  it.each(['', 'abc', '0', '-1', '65536', '3.5', '1e3', 'Infinity'])(
    'rejects invalid PORT %j',
    (port) => {
      expect(() => validateEnvironment({ PORT: port })).toThrow('PORT');
    },
  );

  it('rejects unknown environments', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'invalid' })).toThrow(
      'NODE_ENV',
    );
  });

  it('rejects an empty host', () => {
    expect(() => validateEnvironment({ HOST: ' ' })).toThrow('HOST');
  });
});
