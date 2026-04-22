export const settingsSchema = {
  $id: 'Settings',
  type: 'object',
  required: [
    'llamaServerBinaryPath',
    'modelsDir',
    'llamaServerHost',
    'llamaServerPort',
    'sessionsPerProfileLimit',
    'uiNoiseFilterEnabledByDefault',
    'telemetryIntervalMs',
  ],
  additionalProperties: false,
  properties: {
    llamaServerBinaryPath: { type: 'string' },
    modelsDir: { type: 'string' },
    llamaServerHost: { type: 'string', minLength: 1 },
    llamaServerPort: { type: 'integer', minimum: 1, maximum: 65535 },
    sessionsPerProfileLimit: { type: 'integer', minimum: 1, maximum: 1000 },
    uiNoiseFilterEnabledByDefault: { type: 'boolean' },
    telemetryIntervalMs: { type: 'integer', minimum: 250, maximum: 60000 },
  },
} as const;
