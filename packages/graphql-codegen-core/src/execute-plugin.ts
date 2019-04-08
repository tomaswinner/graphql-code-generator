import { Types, CodegenPlugin } from '@graphql-codegen/plugin-helpers';
import { DocumentNode, GraphQLSchema, buildASTSchema } from 'graphql';
import { DetailedError } from './errors';
import { validateGraphQlDocuments, checkValidationErrors } from 'graphql-toolkit';

export interface ExecutePluginOptions {
  name: string;
  config: Types.PluginConfig;
  schema: DocumentNode;
  documents: Types.DocumentFile[];
  outputFilename: string;
  allPlugins: Types.ConfiguredPlugin[];
}

export async function executePlugin(options: ExecutePluginOptions, plugin: CodegenPlugin): Promise<string> {
  if (!plugin || !plugin.plugin || typeof plugin.plugin !== 'function') {
    throw new DetailedError(
      `Invalid Custom Plugin "${options.name}"`,
      `
        Plugin ${options.name} does not export a valid JS object with "plugin" function.
  
        Make sure your custom plugin is written in the following form:
  
        module.exports = {
          plugin: (schema, documents, config) => {
            return 'my-custom-plugin-content';
          },
        };
        `
    );
  }

  const outputSchema: GraphQLSchema = buildASTSchema(options.schema);

  if (outputSchema && options.documents.length > 0) {
    const errors = validateGraphQlDocuments(outputSchema, options.documents);
    checkValidationErrors(errors);
  }

  if (plugin.validate && typeof plugin.validate === 'function') {
    try {
      await plugin.validate(outputSchema, options.documents, options.config, options.outputFilename, options.allPlugins);
    } catch (e) {
      throw new DetailedError(
        `Plugin "${options.name}" validation failed:`,
        `
            ${e.message}
          `
      );
    }
  }

  return plugin.plugin(outputSchema, options.documents, options.config, {
    outputFile: options.outputFilename,
    allPlugins: options.allPlugins,
  });
}
