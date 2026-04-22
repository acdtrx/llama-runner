export const newProfileSchema = {
  $id: 'NewProfile',
  type: 'object',
  required: ['name', 'modelSource', 'argsLine'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 },
    description: { type: 'string', maxLength: 2000 },
    modelSource: { type: 'string', enum: ['file', 'hf'] },
    modelFile: { type: 'string', minLength: 1 },
    modelRepo: { type: 'string', minLength: 1 },
    argsLine: { type: 'string', maxLength: 8000 },
    clonedFromTemplateId: { type: 'string' },
  },
} as const;
