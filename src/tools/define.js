/**
 * Build a DSH ToolDefinition with a JSON text rendering of the result.
 */
export function defineTool({ name, description, parameters, outputSchema, execute, meta }) {
  return {
    name,
    description,
    parameters: { type: 'object', additionalProperties: false, ...parameters },
    output: {
      schema: outputSchema ?? { type: 'object' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      // Structured payload for the conversation tool-view cards (F1).
      presentationMeta: meta ?? ((_args, value) => value),
    },
    isConcurrencySafe: () => false,
    execute,
  };
}

export function requireString(args, field) {
  const value = args?.[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`"${field}" must be a non-empty string`);
  }
  return value;
}

export const ERROR_CAUSE_ENUM = [
  'concept-confusion',
  'missing-prerequisite',
  'surface-memory',
  'transfer-failure',
  'expression-unclear',
];
