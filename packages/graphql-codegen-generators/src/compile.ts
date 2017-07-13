import { GeneratorConfig, FileOutput, Settings, EInputType } from './types';
import { Document, Fragment, Operation, SchemaTemplateContext } from 'graphql-codegen-core';
import { compile, registerPartial } from 'handlebars';
import { initHelpers } from './handlebars-extensions';
import { flattenTypes } from './flatten-types';
import { generateMultipleFiles } from './generate-multiple-files';
import { generateSingleFile } from './generate-single-file';

export const DEFAULT_SETTINGS: Settings = {
  generateSchema: true,
  generateDocuments: true,
};

export function compileTemplate(config: GeneratorConfig, templateContext: SchemaTemplateContext, documents: Document[] = [], settings: Settings = DEFAULT_SETTINGS): FileOutput[] {
  initHelpers(config, templateContext);
  const executionSettings = Object.assign(DEFAULT_SETTINGS, settings);
  const templates = config.templates;

  Object.keys(templates).forEach((templateName: string) => {
    registerPartial(templateName, templates[templateName]);
  });

  let mergedDocuments: Document;

  if (!executionSettings.generateDocuments) {
    mergedDocuments = {
      fragments: [],
      operations: [],
      hasFragments: false,
      hasOperations: false,
    };
  } else {
    mergedDocuments = documents.reduce((previousValue: Document, item: Document): Document => {
      const opArr = [...previousValue.operations, ...item.operations] as Operation[];
      const frArr = [...previousValue.fragments, ...item.fragments] as Fragment[];

      return {
        operations: opArr,
        fragments: frArr,
        hasFragments: frArr.length > 0,
        hasOperations: opArr.length > 0,
      }
    }, { hasFragments: false, hasOperations: false, operations: [], fragments: [] } as Document);

    if (config.flattenTypes) {
      mergedDocuments = flattenTypes(mergedDocuments);
    }
  }

  if (config.inputType === EInputType.SINGLE_FILE) {
    if (!templates['index']) {
      throw new Error(`Template 'index' is required when using inputType = SINGLE_FILE!`);
    }

    if (!config.outFile) {
      throw new Error('Config outFile is required when using inputType = SINGLE_FILE!')
    }

    return generateSingleFile(
      compile(templates['index']),
      executionSettings,
      config,
      templateContext,
      mergedDocuments,
    );
  } else if (config.inputType === EInputType.MULTIPLE_FILES || config.inputType === EInputType.PROJECT) {
    if (config.inputType === EInputType.MULTIPLE_FILES) {
      if (!config.filesExtension) {
        throw new Error('Config filesExtension is required when using inputType = MULTIPLE_FILES!')
      }
    }

    const compiledTemplates = Object.keys(templates).map(templateName => {
      const compiledTemplate = compile(templates[templateName]);

      return {
        key: templateName,
        value: compiledTemplate,
      };
    }).reduce((prev, item) => {
      prev[item.key] = item.value;

      return prev;
    }, {}) as {[name: string]: Function[]};

    return generateMultipleFiles(
      compiledTemplates,
      executionSettings,
      config,
      templateContext,
      mergedDocuments,
    );
  } else {
    throw new Error(`Invalid inputType specified: ${config.inputType}!`);
  }
}
