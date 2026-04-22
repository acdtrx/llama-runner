export const predefinedProfilesSchema = {
  $id: 'PredefinedProfiles',
  type: 'object',
  required: ['version', 'templates'],
  additionalProperties: false,
  properties: {
    version: { type: 'integer', minimum: 1 },
    templates: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name', 'modelFile', 'args'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,63}$' },
          name: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          modelFile: { type: 'string', minLength: 1 },
          args: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
} as const;

export const cloneBodySchema = {
  $id: 'CloneBody',
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 },
  },
} as const;
