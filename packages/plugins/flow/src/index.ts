import { DocumentFile, GraphQLSchema, PluginFunction } from 'graphql-codegen-core';
import { parse, printSchema, visit } from 'graphql';
import { FlowPluginConfig, FlowVisitor } from './visitor';

export { DEFAULT_SCALARS } from './visitor';
export * from './utils';
export * from './variables-to-object';
export * from './visitor';

export type ScalarsMap = { [name: string]: string };
export type EnumValuesMap = { [key: string]: string };

export const plugin: PluginFunction<FlowPluginConfig> = (
  schema: GraphQLSchema,
  documents: DocumentFile[],
  config: FlowPluginConfig
) => {
  const result = `/* @flow */\n\n`;
  const printedSchema = printSchema(schema);
  const astNode = parse(printedSchema);

  const visitorResult = visit(astNode, {
    leave: new FlowVisitor(config)
  });

  return result + visitorResult.definitions.join('\n');
};
