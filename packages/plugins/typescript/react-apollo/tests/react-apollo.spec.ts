import { compileTs, validateTs } from '@graphql-codegen/testing';
import { plugin } from '../src/index';
import { ReactApolloRawPluginConfig } from '../src/config';
import { parse, GraphQLSchema, buildClientSchema, buildASTSchema, buildSchema } from 'graphql';
import gql from 'graphql-tag';
import { Types, mergeOutputs } from '@graphql-codegen/plugin-helpers';
import { plugin as tsPlugin } from '../../typescript/src/index';
import { plugin as tsDocumentsPlugin } from '../../operations/src/index';
import { readFileSync } from 'fs';
import { DocumentMode } from '@graphql-codegen/visitor-plugin-common';
import { extract } from 'jest-docblock';

describe('React Apollo', () => {
  const schema = buildClientSchema(JSON.parse(readFileSync('../../../../dev-test/githunt/schema.json').toString()));
  const basicDoc = parse(/* GraphQL */ `
    query test {
      feed {
        id
        commentCount
        repository {
          full_name
          html_url
          owner {
            avatar_url
          }
        }
      }
    }
  `);
  const mutationDoc = parse(/* GraphQL */ `
    mutation test($name: String) {
      submitRepository(repoFullName: $name) {
        id
      }
    }
  `);

  const subscriptionDoc = parse(/* GraphQL */ `
    subscription test($name: String) {
      commentAdded(repoFullName: $name) {
        id
      }
    }
  `);

  const validateTypeScript = async (
    output: Types.PluginOutput,
    testSchema: GraphQLSchema,
    documents: Types.DocumentFile[],
    config: any,
    playground = false
  ) => {
    const tsOutput = await tsPlugin(testSchema, documents, config, { outputFile: '' });
    const tsDocumentsOutput = await tsDocumentsPlugin(testSchema, documents, config, { outputFile: '' });
    const merged = mergeOutputs([tsOutput, tsDocumentsOutput, output]);
    validateTs(merged, undefined, true, false, playground);

    return merged;
  };

  const validateAndCompile = async (
    content: Types.PluginOutput,
    config: any = {},
    pluginSchema: GraphQLSchema,
    documents: Types.DocumentFile[],
    usage = '',
    playground = false
  ) => {
    const tsOutput = await tsPlugin(pluginSchema, documents, config, { outputFile: '' });
    const tsDocumentsOutput = await tsDocumentsPlugin(pluginSchema, documents, config, { outputFile: '' });
    const merged = mergeOutputs([tsOutput, tsDocumentsOutput, content]);

    await compileTs(merged, {}, true, playground);

    return merged;
  };

  describe('Issues', () => {
    it('Issue #3612 - Missing fragments spread when fragment name is same as operation?', async () => {
      const docs = [
        {
          location: '',
          document: parse(/* GraphQL */ `
            query Feed {
              feed {
                ...Feed
              }
            }

            fragment Feed on Feed {
              id
              commentCount
              repository {
                ...RepoFields
              }
            }

            fragment RepoFields on Repository {
              full_name
              html_url
              owner {
                avatar_url
              }
            }
          `),
        },
      ];
      const result = (await plugin(
        schema,
        docs,
        {},
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(result.content).toBeSimilarStringTo(`    export const FeedDocument = gql\`
      query Feed {
    feed {
      ...Feed
    }
  }
      \${FeedFragmentDoc}\`;`);
    });

    it('Issue #2742 - Incorrect import prefix', async () => {
      const docs = [
        {
          location: '',
          document: parse(/* GraphQL */ `
            query GET_SOMETHING {
              feed {
                id
              }
            }
          `),
        },
      ];
      const config = {
        addDocBlocks: false,
        withHooks: true,
        withComponent: false,
        withHOC: false,
        skipTypename: true,
        importOperationTypesFrom: 'Types',
      };

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      const output = await validateAndCompile(content, config, schema, docs, '');
      expect(output).toContain(
        `export type Get_SomethingQueryResult = ApolloReactCommon.QueryResult<Types.Get_SomethingQuery, Types.Get_SomethingQueryVariables>;`
      );
    });

    it('Issue #2826 - Incorrect prefix', async () => {
      const docs = [
        {
          location: '',
          document: parse(/* GraphQL */ `
            query GET_SOMETHING {
              feed {
                id
              }
            }
          `),
        },
      ];
      const config = {
        addDocBlocks: false,
        withHooks: true,
        withComponent: false,
        withHOC: false,
        skipTypename: true,
        typesPrefix: 'GQL',
      };

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      const output = await validateAndCompile(content, config, schema, docs, '');
      expect(output).toContain(
        `export type Get_SomethingQueryResult = ApolloReactCommon.QueryResult<GQLGet_SomethingQuery, GQLGet_SomethingQueryVariables>;`
      );
    });

    it('PR #2725 - transformUnderscore: true causes invalid output', async () => {
      const docs = [
        {
          location: '',
          document: parse(/* GraphQL */ `
            query GET_SOMETHING {
              feed {
                id
              }
            }
          `),
        },
      ];
      const config = {
        addDocBlocks: false,
        withHooks: true,
        withComponent: false,
        withHOC: false,
        skipTypename: true,
        namingConvention: {
          typeNames: 'pascal-case#pascalCase',
          enumValues: 'keep',
          transformUnderscore: true,
        },
      };
      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      const output = await validateAndCompile(content, config, schema, docs, '');
      expect(output).toMatchSnapshot();
    });

    it('Issue #2080 - noGraphQLTag does not work with fragments correctly', async () => {
      const docs = [
        {
          location: '',
          document: parse(/* GraphQL */ `
            query test {
              feed {
                id
                commentCount
                repository {
                  ...RepositoryFields
                }
              }
            }

            fragment RepositoryFields on Repository {
              full_name
              html_url
              owner {
                avatar_url
              }
            }
          `),
        },
      ];
      const content = (await plugin(
        schema,
        docs,
        {
          noGraphQLTag: true,
        },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;
      expect(
        content.content.split('{"kind":"FragmentDefinition","name":{"kind":"Name","value":"RepositoryFields"}').length
      ).toBe(3);
    });
  });

  describe('Imports', () => {
    it('should import React and ReactApollo dependencies', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        {},
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as ApolloReactCommon from '@apollo/react-common';`);
      expect(content.prepend).toContain(`import * as ApolloReactComponents from '@apollo/react-components';`);
      expect(content.prepend).toContain(`import * as React from 'react';`);
      expect(content.prepend).toContain(`import gql from 'graphql-tag';`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should import DocumentNode when using noGraphQLTag', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        {
          noGraphQLTag: true,
        },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import { DocumentNode } from 'graphql';`);
      expect(content.prepend).not.toContain(`import gql from 'graphql-tag';`);
      await validateTypeScript(content, schema, docs, {});
    });

    it(`should use gql import from gqlImport config option`, async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        { gqlImport: 'graphql.macro#gql' },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import { gql } from 'graphql.macro';`);
      await validateTypeScript(content, schema, docs, {});
    });

    it(`tests for dedupeOperationSuffix`, async () => {
      const ast = parse(/* GraphQL */ `
        query notificationsQuery {
          notifications {
            id
          }
        }
      `);
      const ast2 = parse(/* GraphQL */ `
        query notifications {
          notifications {
            id
          }
        }
      `);

      expect(
        ((await plugin(schema, [{ location: 'test-file.ts', document: ast }], {}, { outputFile: '' })) as any).content
      ).toContain('ApolloReactCommon.QueryResult<NotificationsQueryQuery, NotificationsQueryQueryVariables>;');
      expect(
        ((await plugin(
          schema,
          [{ location: 'test-file.ts', document: ast }],
          { dedupeOperationSuffix: false },
          { outputFile: '' }
        )) as any).content
      ).toContain('ApolloReactCommon.QueryResult<NotificationsQueryQuery, NotificationsQueryQueryVariables>');
      expect(
        ((await plugin(
          schema,
          [{ location: 'test-file.ts', document: ast }],
          { dedupeOperationSuffix: true },
          { outputFile: '' }
        )) as any).content
      ).toContain('ApolloReactCommon.QueryResult<NotificationsQuery, NotificationsQueryVariables>');
      expect(
        ((await plugin(
          schema,
          [{ location: 'test-file.ts', document: ast2 }],
          { dedupeOperationSuffix: true },
          { outputFile: '' }
        )) as any).content
      ).toContain('ApolloReactCommon.QueryResult<NotificationsQuery, NotificationsQueryVariables>');
      expect(
        ((await plugin(
          schema,
          [{ location: 'test-file.ts', document: ast2 }],
          { dedupeOperationSuffix: false },
          { outputFile: '' }
        )) as any).content
      ).toContain('ApolloReactCommon.QueryResult<NotificationsQuery, NotificationsQueryVariables>');
    });

    it(`tests for omitOperationSuffix`, async () => {
      const ast = parse(/* GraphQL */ `
        query notificationsQuery {
          notifications {
            id
          }
        }
      `);
      const ast2 = parse(/* GraphQL */ `
        query notifications {
          notifications {
            id
          }
        }
      `);

      expect(
        ((await plugin(schema, [{ location: 'test-file.ts', document: ast }], {}, { outputFile: '' })) as any).content
      ).toContain('ApolloReactCommon.QueryResult<NotificationsQueryQuery, NotificationsQueryQueryVariables>;');
      expect(
        ((await plugin(
          schema,
          [{ location: 'test-file.ts', document: ast }],
          { omitOperationSuffix: false },
          { outputFile: '' }
        )) as any).content
      ).toContain('ApolloReactCommon.QueryResult<NotificationsQueryQuery, NotificationsQueryQueryVariables>');
      expect(
        ((await plugin(
          schema,
          [{ location: 'test-file.ts', document: ast }],
          { omitOperationSuffix: true },
          { outputFile: '' }
        )) as any).content
      ).toContain('ApolloReactCommon.QueryResult<NotificationsQuery, NotificationsQueryVariables>');
      expect(
        ((await plugin(
          schema,
          [{ location: 'test-file.ts', document: ast2 }],
          { omitOperationSuffix: true },
          { outputFile: '' }
        )) as any).content
      ).toContain('ApolloReactCommon.QueryResult<Notifications, NotificationsVariables>');
      expect(
        ((await plugin(
          schema,
          [{ location: 'test-file.ts', document: ast2 }],
          { omitOperationSuffix: false },
          { outputFile: '' }
        )) as any).content
      ).toContain('ApolloReactCommon.QueryResult<NotificationsQuery, NotificationsQueryVariables>');
    });

    it('should import ApolloReactHooks dependencies', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        { withHooks: true },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as ApolloReactHooks from '@apollo/react-hooks';`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should import ApolloReactHooks from apolloReactHooksImportFrom config option', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        { withHooks: true, apolloReactHooksImportFrom: 'react-apollo-hooks' },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as ApolloReactHooks from 'react-apollo-hooks';`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should import ApolloReactCommon from apolloReactCommonImportFrom config option', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        { withHooks: true, apolloReactCommonImportFrom: 'custom-apollo-react-common' },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as ApolloReactCommon from 'custom-apollo-react-common';`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should skip import React and ApolloReactComponents if only hooks are used', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        {
          withHooks: true,
          withHOC: false,
          withComponent: false,
          withMutationFn: false,
          withResultType: false,
        },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.prepend).not.toContain(`import * as ApolloReactComponents from '@apollo/react-components';`);
      expect(content.prepend).not.toContain(`import * as React from 'react';`);
      await validateTypeScript(content, schema, docs, {});
    });
  });

  describe('Fragments', () => {
    it('Should generate basic fragments documents correctly', async () => {
      const docs = [
        {
          location: 'a.graphql',
          document: parse(/* GraphQL */ `
            fragment MyFragment on Repository {
              full_name
            }

            query {
              feed {
                id
              }
            }
          `),
        },
      ];
      const result = (await plugin(schema, docs, {}, { outputFile: '' })) as Types.ComplexPluginOutput;

      expect(result.content).toBeSimilarStringTo(`
      export const MyFragmentFragmentDoc = gql\`
      fragment MyFragment on Repository {
        full_name
      }
      \`;`);
      await validateTypeScript(result, schema, docs, {});
    });

    it('should generate Document variables for inline fragments', async () => {
      const repositoryWithOwner = gql`
        fragment RepositoryWithOwner on Repository {
          full_name
          html_url
          owner {
            avatar_url
          }
        }
      `;
      const feedWithRepository = gql`
        fragment FeedWithRepository on Entry {
          id
          commentCount
          repository(search: "phrase") {
            ...RepositoryWithOwner
          }
        }

        ${repositoryWithOwner}
      `;
      const myFeed = gql`
        query MyFeed {
          feed {
            ...FeedWithRepository
          }
        }

        ${feedWithRepository}
      `;

      const docs = [{ location: '', document: myFeed }];

      const content = (await plugin(
        schema,
        docs,
        {},
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).toBeSimilarStringTo(`export const FeedWithRepositoryFragmentDoc = gql\`
fragment FeedWithRepository on Entry {
  id
  commentCount
  repository(search: "phrase") {
    ...RepositoryWithOwner
  }
}
\${RepositoryWithOwnerFragmentDoc}\`;`);
      expect(content.content).toBeSimilarStringTo(`export const RepositoryWithOwnerFragmentDoc = gql\`
fragment RepositoryWithOwner on Repository {
  full_name
  html_url
  owner {
    avatar_url
  }
}
\`;`);

      expect(content.content).toBeSimilarStringTo(`export const MyFeedDocument = gql\`
query MyFeed {
  feed {
    ...FeedWithRepository
  }
}
\${FeedWithRepositoryFragmentDoc}\`;`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should avoid generating duplicate fragments', async () => {
      const simpleFeed = gql`
        fragment Item on Entry {
          id
        }
      `;
      const myFeed = gql`
        query MyFeed {
          feed {
            ...Item
          }
          allFeeds: feed {
            ...Item
          }
        }
      `;
      const documents = [simpleFeed, myFeed];
      const docs = documents.map(document => ({ document, location: '' }));
      const content = (await plugin(
        schema,
        docs,
        {},
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).toBeSimilarStringTo(`
        export const MyFeedDocument = gql\`
        query MyFeed {
            feed {
              ...Item
            }
            allFeeds: feed {
              ...Item
            }
          }
          \${ItemFragmentDoc}\``);
      expect(content.content).toBeSimilarStringTo(`
        export const ItemFragmentDoc = gql\`
        fragment Item on Entry {
          id
        }
\`;`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('Should generate fragments in proper order (when one depends on other)', async () => {
      const myFeed = gql`
        fragment FeedWithRepository on Entry {
          id
          repository {
            ...RepositoryWithOwner
          }
        }

        fragment RepositoryWithOwner on Repository {
          full_name
        }

        query MyFeed {
          feed {
            ...FeedWithRepository
          }
        }
      `;
      const documents = [myFeed];
      const docs = documents.map(document => ({ document, location: '' }));
      const content = (await plugin(
        schema,
        docs,
        {},
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      const feedWithRepositoryPos = content.content.indexOf('fragment FeedWithRepository');
      const repositoryWithOwnerPos = content.content.indexOf('fragment RepositoryWithOwner');
      expect(repositoryWithOwnerPos).toBeLessThan(feedWithRepositoryPos);
      await validateTypeScript(content, schema, docs, {});
    });
  });

  describe('Component', () => {
    it('should generate Document variable', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        {},
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).toBeSimilarStringTo(`
          export const TestDocument =  gql\`
          query test {
            feed {
              id
              commentCount
              repository {
                full_name
                html_url
                owner {
                  avatar_url
                }
              }
            }
          }
          \`;
        `);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should generate Document variable with noGraphQlTag', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        {
          noGraphQLTag: true,
        },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).toBeSimilarStringTo(
        `export const TestDocument: DocumentNode = {"kind":"Document","defin`
      );

      // For issue #1599 - make sure there are not `loc` properties
      expect(content.content).not.toContain(`loc":`);
      expect(content.content).not.toContain(`loc':`);

      await validateTypeScript(content, schema, docs, {});
    });

    it('should generate correct Document variable with escaped values', async () => {
      const docs = [
        {
          location: '',
          document: parse(/* GraphQL */ `
            mutation Test {
              submitRepository(repoFullName: "\\"REPONAME\\"") {
                createdAt
              }
            }
          `),
        },
      ];
      const content = (await plugin(
        schema,
        docs,
        {},
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).toBeSimilarStringTo(`
          export const TestDocument =  gql\`
            mutation Test {
              submitRepository(repoFullName: "\\\\"REPONAME\\\\"") {
                createdAt
              }
            }
          \`;
        `);

      await validateTypeScript(content, schema, docs, {});
    });

    it('should generate Component', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        {},
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).toBeSimilarStringTo(`
      export type TestComponentProps = Omit<ApolloReactComponents.QueryComponentOptions<TestQuery, TestQueryVariables>, 'query'>;
      `);

      expect(content.content).toBeSimilarStringTo(`
      export const TestComponent = (props: TestComponentProps) =>
      (
          <ApolloReactComponents.Query<TestQuery, TestQueryVariables> query={TestDocument} {...props} />
      );
      `);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should generate a component with a custom suffix when specified', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        { componentSuffix: 'Element' },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).toBeSimilarStringTo(`
      export type TestElementProps = Omit<ApolloReactComponents.QueryComponentOptions<TestQuery, TestQueryVariables>, 'query'>;
      `);
      expect(content.content).toBeSimilarStringTo(`
      export const TestElement = (props: TestElementProps) =>
      (
          <ApolloReactComponents.Query<TestQuery, TestQueryVariables> query={TestDocument} {...props} />
      );
      `);
      await validateTypeScript(content, schema, docs, { componentSuffix: 'Element' });
    });

    it('should not generate Component', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        { withComponent: false },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).not.toContain(`export class TestComponent`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should make variables property required if any of variable definitions is non-null', async () => {
      const docs = [
        {
          location: '',
          document: gql`
            query Test($foo: String!) {
              test(foo: $foo)
            }
          `,
        },
      ];
      const schema = buildASTSchema(gql`
        type Query {
          test(foo: String!): Boolean
        }
      `);
      const content = (await plugin(
        schema,
        docs,
        {},
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).toBeSimilarStringTo(`
      export type TestComponentProps = Omit<ApolloReactComponents.QueryComponentOptions<TestQuery, TestQueryVariables>, 'query'> & ({ variables: TestQueryVariables; skip?: boolean; } | { skip: boolean; });
      `);

      expect(content.content).toBeSimilarStringTo(`
      export const TestComponent = (props: TestComponentProps) =>
      (
          <ApolloReactComponents.Query<TestQuery, TestQueryVariables> query={TestDocument} {...props} />
      );
      `);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should make variables property optional if operationType is mutation', async () => {
      const docs = [
        {
          location: '',
          document: gql`
            mutation Test($foo: String!) {
              test(foo: $foo)
            }
          `,
        },
      ];
      const schema = buildASTSchema(gql`
        type Mutation {
          test(foo: String!): Boolean
        }
      `);
      const content = (await plugin(
        schema,
        docs,
        {},
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).toBeSimilarStringTo(`
      export type TestComponentProps = Omit<ApolloReactComponents.MutationComponentOptions<TestMutation, TestMutationVariables>, 'mutation'>;
      `);
      expect(content.content).toBeSimilarStringTo(`
      export const TestComponent = (props: TestComponentProps) => (
        <ApolloReactComponents.Mutation<TestMutation, TestMutationVariables> mutation={TestDocument} {...props} />
      );`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should not add typesPrefix to Component', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        { typesPrefix: 'I' },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).not.toContain(`export class ITestComponent`);
    });
  });

  describe('HOC', () => {
    it('should generate HOCs', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        {},
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).toBeSimilarStringTo(
        `export type TestProps<TChildProps = {}> = ApolloReactHoc.DataProps<TestQuery, TestQueryVariables> & TChildProps;`
      );

      expect(content.content)
        .toBeSimilarStringTo(`export function withTest<TProps, TChildProps = {}>(operationOptions?: ApolloReactHoc.OperationOption<
  TProps,
  TestQuery,
  TestQueryVariables,
  TestProps<TChildProps>>) {
    return ApolloReactHoc.withQuery<TProps, TestQuery, TestQueryVariables, TestProps<TChildProps>>(TestDocument, {
      alias: 'test',
      ...operationOptions
    });
}`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should generate HOC props with correct operation result type name', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        { operationResultSuffix: 'Response' },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).toBeSimilarStringTo(
        `export type TestProps<TChildProps = {}> = ApolloReactHoc.DataProps<TestQueryResponse, TestQueryVariables> & TChildProps;`
      );

      await validateTypeScript(content, schema, docs, {});
    });

    it('should not generate HOCs', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        { withHOC: false },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).not.toContain(`export type TestProps`);
      expect(content.content).not.toContain(`export function withTest`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should not add typesPrefix to HOCs', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        { typesPrefix: 'I' },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).toContain(`export type ITestProps`);
      expect(content.content).toContain(`export function withTest`);
    });
    it('should generate mutation function signature correctly', async () => {
      const docs = [
        {
          location: '',
          document: parse(/* GraphQL */ `
            mutation submitComment($repoFullName: String!, $commentContent: String!) {
              submitComment(repoFullName: $repoFullName, commentContent: $commentContent) {
                id
              }
            }
          `),
        },
      ];
      const content = (await plugin(
        schema,
        docs,
        { withMutationFn: true },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).toContain(
        `export type SubmitCommentMutationFn = ApolloReactCommon.MutationFunction<SubmitCommentMutation, SubmitCommentMutationVariables>;`
      );
      await validateTypeScript(content, schema, docs, {});
    });
  });

  describe('Hooks', () => {
    it('Should generate hooks for query and mutation', async () => {
      const documents = parse(/* GraphQL */ `
        query feed {
          feed {
            id
            commentCount
            repository {
              full_name
              html_url
              owner {
                avatar_url
              }
            }
          }
        }

        mutation submitRepository($name: String) {
          submitRepository(repoFullName: $name) {
            id
          }
        }
      `);
      const docs = [{ location: '', document: documents }];

      const content = (await plugin(
        schema,
        docs,
        { withHooks: true, withComponent: false, withHOC: false },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).toBeSimilarStringTo(`
export function useFeedQuery(baseOptions?: ApolloReactHooks.QueryHookOptions<FeedQuery, FeedQueryVariables>) {
  return ApolloReactHooks.useQuery<FeedQuery, FeedQueryVariables>(FeedDocument, baseOptions);
}`);

      expect(content.content).toBeSimilarStringTo(`
export function useSubmitRepositoryMutation(baseOptions?: ApolloReactHooks.MutationHookOptions<SubmitRepositoryMutation, SubmitRepositoryMutationVariables>) {
  return ApolloReactHooks.useMutation<SubmitRepositoryMutation, SubmitRepositoryMutationVariables>(SubmitRepositoryDocument, baseOptions);
}`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('Should generate deduped hooks for query and mutation', async () => {
      const documents = parse(/* GraphQL */ `
        query FeedQuery {
          feed {
            id
            commentCount
            repository {
              full_name
              html_url
              owner {
                avatar_url
              }
            }
          }
        }

        mutation SubmitRepositoryMutation($name: String) {
          submitRepository(repoFullName: $name) {
            id
          }
        }
      `);
      const docs = [{ location: '', document: documents }];

      const content = (await plugin(
        schema,
        docs,
        { withHooks: true, withComponent: false, withHOC: false, dedupeOperationSuffix: true },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).toBeSimilarStringTo(`
export function useFeedQuery(baseOptions?: ApolloReactHooks.QueryHookOptions<FeedQuery, FeedQueryVariables>) {
  return ApolloReactHooks.useQuery<FeedQuery, FeedQueryVariables>(FeedQueryDocument, baseOptions);
}`);

      expect(content.content).toBeSimilarStringTo(`
export function useSubmitRepositoryMutation(baseOptions?: ApolloReactHooks.MutationHookOptions<SubmitRepositoryMutation, SubmitRepositoryMutationVariables>) {
  return ApolloReactHooks.useMutation<SubmitRepositoryMutation, SubmitRepositoryMutationVariables>(SubmitRepositoryMutationDocument, baseOptions);
}`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('Should not generate hooks for query and mutation', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        { withHooks: false },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).not.toContain(`export function useTestQuery`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('Should generate subscription hooks', async () => {
      const documents = parse(/* GraphQL */ `
        subscription ListenToComments($name: String) {
          commentAdded(repoFullName: $name) {
            id
          }
        }
      `);

      const docs = [{ location: '', document: documents }];

      const content = (await plugin(
        schema,
        docs,
        {
          withHooks: true,
          withComponent: false,
          withHOC: false,
        },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).toBeSimilarStringTo(`
export function useListenToCommentsSubscription(baseOptions?: ApolloReactHooks.SubscriptionHookOptions<ListenToCommentsSubscription, ListenToCommentsSubscriptionVariables>) {
  return ApolloReactHooks.useSubscription<ListenToCommentsSubscription, ListenToCommentsSubscriptionVariables>(ListenToCommentsDocument, baseOptions);
}`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('Should not add typesPrefix to hooks', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        { withHooks: true, typesPrefix: 'I' },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).toContain(`export function useTestQuery`);
    });

    it('should generate hook result', async () => {
      const documents = parse(/* GraphQL */ `
        query feed {
          feed {
            id
            commentCount
            repository {
              full_name
              html_url
              owner {
                avatar_url
              }
            }
          }
        }

        mutation submitRepository($name: String) {
          submitRepository(repoFullName: $name) {
            id
          }
        }
      `);
      const docs = [{ location: '', document: documents }];

      const content = (await plugin(
        schema,
        docs,
        { withHooks: true, withComponent: false, withHOC: false },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).toBeSimilarStringTo(`
      export type FeedQueryHookResult = ReturnType<typeof useFeedQuery>;
      `);

      expect(content.content).toBeSimilarStringTo(`
      export type FeedLazyQueryHookResult = ReturnType<typeof useFeedLazyQuery>;
      `);

      expect(content.content).toBeSimilarStringTo(`
      export type SubmitRepositoryMutationHookResult = ReturnType<typeof useSubmitRepositoryMutation>;
      `);
      await validateTypeScript(content, schema, docs, {});
    });

    const queryDocBlockSnapshot = `/**
 * __useFeedQuery__
 *
 * To run a query within a React component, call \`useFeedQuery\` and pass it any options that fit your needs.
 * When your component renders, \`useFeedQuery\` returns an object from Apollo Client that contains loading, error, and data properties 
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useFeedQuery({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */`;

    const mutationDocBlockSnapshot = `/**
 * __useSubmitRepositoryMutation__
 *
 * To run a mutation, you first call \`useSubmitRepositoryMutation\` within a React component and pass it any options that fit your needs.
 * When your component renders, \`useSubmitRepositoryMutation\` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [submitRepositoryMutation, { data, loading, error }] = useSubmitRepositoryMutation({
 *   variables: {
 *      name: // value for 'name'
 *   },
 * });
 */`;

    it('Should generate JSDoc docblocks for hooks', async () => {
      const documents = parse(/* GraphQL */ `
        query feed($id: ID!) {
          feed(id: $id) {
            id
          }
        }
        mutation submitRepository($name: String) {
          submitRepository(repoFullName: $name) {
            id
          }
        }
      `);

      const docs = [{ location: '', document: documents }];

      const content = (await plugin(
        schema,
        docs,
        { withHooks: true, withComponent: false, withHOC: false },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      const queryDocBlock = extract(content.content.substr(content.content.indexOf('/**')));

      expect(queryDocBlock).toEqual(queryDocBlockSnapshot);

      const mutationDocBlock = extract(content.content.substr(content.content.lastIndexOf('/**')));

      expect(mutationDocBlock).toEqual(mutationDocBlockSnapshot);
    });

    it('Should NOT generate JSDoc docblocks for hooks if addDocBlocks is false', async () => {
      const documents = parse(/* GraphQL */ `
        query feed($id: ID!) {
          feed(id: $id) {
            id
          }
        }
        mutation submitRepository($name: String) {
          submitRepository(repoFullName: $name) {
            id
          }
        }
      `);

      const docs = [{ location: '', document: documents }];

      const content = (await plugin(
        schema,
        docs,
        { withHooks: true, withComponent: false, withHOC: false, addDocBlocks: false },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      const queryDocBlock = extract(content.content.substr(content.content.indexOf('/**')));

      expect(queryDocBlock).not.toEqual(queryDocBlockSnapshot);

      const mutationDocBlock = extract(content.content.substr(content.content.lastIndexOf('/**')));

      expect(mutationDocBlock).not.toEqual(mutationDocBlockSnapshot);
    });
  });

  describe('ResultType', () => {
    const config: ReactApolloRawPluginConfig = {
      withHOC: false,
      withComponent: false,
      withHooks: false,
      withMutationFn: false,
      withResultType: true,
      withMutationOptionsType: false,
    };

    const mutationDoc = parse(/* GraphQL */ `
      mutation test($name: String) {
        submitRepository(repoFullName: $name) {
          id
        }
      }
    `);

    const subscriptionDoc = parse(/* GraphQL */ `
      subscription test($name: String) {
        commentAdded(repoFullName: $name) {
          id
        }
      }
    `);

    it('should generate ResultType for Query if withResultType is true', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        { ...config },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as ApolloReactCommon from '@apollo/react-common';`);
      expect(content.content).toContain(
        `export type TestQueryResult = ApolloReactCommon.QueryResult<TestQuery, TestQueryVariables>;`
      );
      await validateTypeScript(content, schema, docs, {});
    });

    it('should NOT generate ResultType for Query if withResultType is false', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        { ...config, withResultType: false },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.prepend).not.toContain(`import * as ApolloReactCommon from '@apollo/react-common';`);
      expect(content.content).not.toContain(
        `export type TestQueryResult = ApolloReactCommon.QueryResult<TestQuery, TestQueryVariables>;`
      );
      await validateTypeScript(content, schema, docs, {});
    });

    it('should generate ResultType for Mutation if withResultType is true', async () => {
      const docs = [{ location: '', document: mutationDoc }];

      const content = (await plugin(
        schema,
        docs,
        { ...config },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as ApolloReactCommon from '@apollo/react-common';`);
      expect(content.content).toContain(
        `export type TestMutationResult = ApolloReactCommon.MutationResult<TestMutation>;`
      );
      await validateTypeScript(content, schema, docs, {});
    });

    it('should NOT generate ResultType for Mutation if withResultType is false', async () => {
      const docs = [{ location: '', document: mutationDoc }];

      const content = (await plugin(
        schema,
        docs,
        { ...config, withResultType: false },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.prepend).not.toContain(`import * as ApolloReactCommon from '@apollo/react-common';`);
      expect(content.content).not.toContain(
        `export type TestMutationResult = ApolloReactCommon.MutationResult<TestMutation>;`
      );
      await validateTypeScript(content, schema, docs, {});
    });

    it('should generate ResultType for Subscription if withResultType is true', async () => {
      const docs = [{ location: '', document: subscriptionDoc }];

      const content = (await plugin(
        schema,
        docs,
        { ...config },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as ApolloReactCommon from '@apollo/react-common';`);
      expect(content.content).toContain(
        `export type TestSubscriptionResult = ApolloReactCommon.SubscriptionResult<TestSubscription>;`
      );
      await validateTypeScript(content, schema, docs, {});
    });

    it('should NOT generate ResultType for Subscription if withResultType is false', async () => {
      const docs = [{ location: '', document: subscriptionDoc }];

      const content = (await plugin(
        schema,
        docs,
        { ...config, withResultType: false },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.prepend).not.toContain(`import * as ApolloReactCommon from '@apollo/react-common';`);
      expect(content.content).not.toContain(
        `export type TestSubscriptionResult = ApolloReactCommon.SubscriptionResult<TestSubscription>;`
      );
      await validateTypeScript(content, schema, docs, {});
    });
    it('should generate lazy query hooks', async () => {
      const documents = parse(/* GraphQL */ `
        query feed {
          feed {
            id
            commentCount
            repository {
              full_name
              html_url
              owner {
                avatar_url
              }
            }
          }
        }
      `);
      const docs = [{ location: '', document: documents }];

      const content = (await plugin(
        schema,
        docs,
        { withHooks: true, withComponent: false, withHOC: false },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).toBeSimilarStringTo(`
  export function useFeedLazyQuery(baseOptions?: ApolloReactHooks.LazyQueryHookOptions<FeedQuery, FeedQueryVariables>) {
    return ApolloReactHooks.useLazyQuery<FeedQuery, FeedQueryVariables>(FeedDocument, baseOptions);
  }`);
      await validateTypeScript(content, schema, docs, {});
    });
  });

  describe('MutationOptions', () => {
    const config: ReactApolloRawPluginConfig = {
      withHOC: false,
      withComponent: false,
      withHooks: false,
      withMutationFn: false,
      withResultType: false,
      withMutationOptionsType: true,
    };

    it('should generate MutationOptions for Mutation if withMutationOptionsType is true', async () => {
      const docs = [{ location: '', document: mutationDoc }];

      const content = (await plugin(
        schema,
        docs,
        { ...config },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as ApolloReactCommon from '@apollo/react-common';`);
      expect(content.content).toContain(
        `export type TestMutationOptions = ApolloReactCommon.BaseMutationOptions<TestMutation, TestMutationVariables>;`
      );
      await validateTypeScript(content, schema, docs, {});
    });

    it('should NOT generate MutationOptions for Mutation if withMutationOptionsType is false', async () => {
      const docs = [{ location: '', document: mutationDoc }];

      const content = (await plugin(
        schema,
        docs,
        { ...config, withMutationOptionsType: false },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.prepend).not.toContain(`import * as ApolloReactCommon from '@apollo/react-common';`);
      expect(content.content).not.toContain(
        `export type TestMutationOptions = ApolloReactCommon.BaseMutationOptions<TestMutation, TestMutationVariables>;`
      );
      await validateTypeScript(content, schema, docs, {});
    });

    it('should NOT generate MutationOptions for Query if withMutationOptionsType is true', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        { ...config },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.prepend).not.toContain(`import * as ApolloReactCommon from 'react-apollo';`);
      expect(content.content).not.toContain(`ApolloReactCommon.BaseMutationOptions`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should NOT generate MutationOptions for Query if withMutationOptionsType is false', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        { ...config, withMutationOptionsType: false },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.prepend).not.toContain(`import * as ApolloReactCommon from 'react-apollo';`);
      expect(content.content).not.toContain(`ApolloReactCommon.BaseMutationOptions`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should NOT generate MutationOptions for Subscription if withMutationOptionsType is true', async () => {
      const docs = [{ location: '', document: subscriptionDoc }];

      const content = (await plugin(
        schema,
        docs,
        { ...config },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.prepend).not.toContain(`import * as ApolloReactCommon from 'react-apollo';`);
      expect(content.content).not.toContain(`ApolloReactCommon.BaseMutationOptions`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should NOT generate MutationOptions for Subscription if withMutationOptionsType is false', async () => {
      const docs = [{ location: '', document: subscriptionDoc }];

      const content = (await plugin(
        schema,
        docs,
        { ...config, withMutationOptionsType: false },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.prepend).not.toContain(`import * as ApolloReactCommon from 'react-apollo';`);
      expect(content.content).not.toContain(`ApolloReactCommon.BaseMutationOptions`);
      await validateTypeScript(content, schema, docs, {});
    });
  });

  describe('withRefetchFn', () => {
    it('should generate a function for use with refetchQueries', async () => {
      const docs = [{ location: '', document: basicDoc }];

      const content = (await plugin(
        schema,
        docs,
        {
          withHooks: true,
          withRefetchFn: true,
        },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).toContain(
        `export function refetchTestQuery(variables?: TestQueryVariables) {
      return { query: TestDocument, variables: variables }
    }`
      );
      await validateTypeScript(content, schema, docs, {});
    });
  });

  describe('documentMode and importDocumentNodeExternallyFrom', () => {
    const multipleOperationDoc = parse(/* GraphQL */ `
      query testOne {
        feed {
          id
          commentCount
          repository {
            full_name
            html_url
            owner {
              avatar_url
            }
          }
        }
      }
      mutation testTwo($name: String) {
        submitRepository(repoFullName: $name) {
          id
        }
      }

      subscription testThree($name: String) {
        commentAdded(repoFullName: $name) {
          id
        }
      }
    `);

    it('should import DocumentNode when documentMode is "documentNode"', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        {
          documentMode: DocumentMode.documentNode,
        },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import { DocumentNode } from 'graphql';`);
      expect(content.prepend).not.toContain(`import gql from 'graphql-tag';`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should generate Document variable when documentMode is "documentNode"', async () => {
      const docs = [{ location: '', document: basicDoc }];
      const content = (await plugin(
        schema,
        docs,
        {
          documentMode: DocumentMode.documentNode,
        },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).toBeSimilarStringTo(
        `export const TestDocument: DocumentNode = {"kind":"Document","defin`
      );

      // For issue #1599 - make sure there are not `loc` properties
      expect(content.content).not.toContain(`loc":`);
      expect(content.content).not.toContain(`loc':`);

      await validateTypeScript(content, schema, docs, {});
    });

    it('should generate definitions Document variable when documentMode is "documentNode" and nested fragments', async () => {
      const testSchema = buildSchema(/* GraphQL */ `
        type Query {
          a: A
        }

        type A {
          bs: [B!]!
        }

        type B {
          cs: [C!]!
        }

        type C {
          greeting: String!
        }
      `);
      const testDoc = parse(/* GraphQL */ `
        query Test {
          a {
            ...AFields
          }
        }

        fragment AFields on A {
          bs {
            ...BFields
          }
        }

        fragment BFields on B {
          cs {
            ...CFields
          }
        }

        fragment CFields on C {
          greeting
        }
      `);
      const docs = [{ location: '', document: testDoc }];
      const content = (await plugin(
        testSchema,
        docs,
        {
          withComponent: false,
          withHOC: false,
          withHooks: false,
          documentMode: DocumentMode.documentNode,
        },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).toMatchSnapshot();

      await validateTypeScript(content, testSchema, docs, {});
    });

    it('should NOT generate inline fragment docs for external mode: file with operation using inline fragment', async () => {
      const docs = [
        {
          location: '',
          document: parse(/* GraphQL */ `
            fragment feedFragment on Entry {
              id
              commentCount
            }
            query testOne {
              feed {
                ...feedFragment
              }
            }
          `),
        },
      ];
      const config = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'path/to/documents.tsx',
      };
      const content = (await plugin(
        schema,
        docs,
        { ...config },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).not.toBeSimilarStringTo(`export const FeedFragmentFragmentDoc = gql`);

      await validateTypeScript(content, schema, docs, {});
    });

    it('should NOT generate inline fragment docs for external mode: file with operation NOT using inline fragment', async () => {
      const docs = [
        {
          location: '',
          document: parse(/* GraphQL */ `
            fragment feedFragment on Entry {
              id
              commentCount
            }
            query testOne {
              feed {
                id
              }
            }
          `),
        },
      ];
      const config = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'path/to/documents.tsx',
      };
      const content = (await plugin(
        schema,
        docs,
        {
          ...config,
        },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).not.toBeSimilarStringTo(`export const FeedFragmentFragmentDoc = gql`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should NOT generate inline fragment docs for external mode: file with just fragment', async () => {
      const docs = [
        {
          location: '',
          document: parse(/* GraphQL */ `
            fragment feedFragment on Entry {
              id
              commentCount
            }
          `),
        },
      ];
      const config = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'path/to/documents.tsx',
      };
      const content = (await plugin(
        schema,
        docs,
        {
          ...config,
        },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.content).not.toBeSimilarStringTo(`export const FeedFragmentFragmentDoc = gql`);

      await validateTypeScript(content, schema, docs, { ...config });
    });

    it('should import Operations from one external file and use it in Query component', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'path/to/documents.tsx',
        withComponent: true,
        withHooks: false,
        withHOC: false,
      };

      const docs = [{ location: '', document: basicDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from 'path/to/documents';`);
      expect(content.content).toBeSimilarStringTo(`
        export const TestComponent = (props: TestComponentProps) => (
          <ApolloReactComponents.Query<TestQuery, TestQueryVariables> query={Operations.test} {...props} />
        );`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should import Operations from one external file and use it in useQuery and useLazyQuery', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'path/to/documents',
        withComponent: false,
        withHooks: true,
        withHOC: false,
      };

      const docs = [{ location: '', document: basicDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from 'path/to/documents';`);
      expect(content.content).toBeSimilarStringTo(`
      export function useTestQuery(baseOptions?: ApolloReactHooks.QueryHookOptions<TestQuery, TestQueryVariables>) {
        return ApolloReactHooks.useQuery<TestQuery, TestQueryVariables>(Operations.test, baseOptions);
      }
      `);
      expect(content.content).toBeSimilarStringTo(`
      export function useTestLazyQuery(baseOptions?: ApolloReactHooks.LazyQueryHookOptions<TestQuery, TestQueryVariables>) {
        return ApolloReactHooks.useLazyQuery<TestQuery, TestQueryVariables>(Operations.test, baseOptions);
      }
      `);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should import Operations from one external file and use it in withQuery', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'path/to/documents',
        withComponent: false,
        withHooks: false,
        withHOC: true,
      };

      const docs = [{ location: '', document: basicDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from 'path/to/documents';`);
      expect(content.content).toBeSimilarStringTo(`
      export function withTest<TProps, TChildProps = {}>(operationOptions?: ApolloReactHoc.OperationOption<
        TProps,
        TestQuery,
        TestQueryVariables,
        TestProps<TChildProps>>) {
          return ApolloReactHoc.withQuery<TProps, TestQuery, TestQueryVariables, TestProps<TChildProps>>(Operations.test, {
            alias: 'test',
            ...operationOptions
          });
      }
      `);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should import Operations from one external file and use it in Mutation component', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'path/to/documents.tsx',
        withComponent: true,
        withHooks: false,
        withHOC: false,
      };

      const docs = [{ location: '', document: mutationDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from 'path/to/documents';`);
      expect(content.content).toBeSimilarStringTo(`
        export const TestComponent = (props: TestComponentProps) => (
          <ApolloReactComponents.Mutation<TestMutation, TestMutationVariables> mutation={Operations.test} {...props} />
        );`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should import Operations from one external file and use it in useMutation', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'path/to/documents.tsx',
        withComponent: false,
        withHooks: true,
        withHOC: false,
      };

      const docs = [{ location: '', document: mutationDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from 'path/to/documents';`);
      expect(content.content).toBeSimilarStringTo(`
      export function useTestMutation(baseOptions?: ApolloReactHooks.MutationHookOptions<TestMutation, TestMutationVariables>) {
        return ApolloReactHooks.useMutation<TestMutation, TestMutationVariables>(Operations.test, baseOptions);
      }
      `);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should import Operations from one external file and use it in withMutation', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'path/to/documents.tsx',
        withComponent: false,
        withHooks: false,
        withHOC: true,
      };

      const docs = [{ location: '', document: mutationDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from 'path/to/documents';`);
      expect(content.content).toBeSimilarStringTo(`
      export function withTest<TProps, TChildProps = {}>(operationOptions?: ApolloReactHoc.OperationOption<
        TProps,
        TestMutation,
        TestMutationVariables,
        TestProps<TChildProps>>) {
          return ApolloReactHoc.withMutation<TProps, TestMutation, TestMutationVariables, TestProps<TChildProps>>(Operations.test, {
            alias: 'test',
            ...operationOptions
          });
      }
      `);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should import Operations from one external file and use it in Subscription component', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'path/to/documents.tsx',
        withComponent: true,
        withHooks: false,
        withHOC: false,
      };

      const docs = [{ location: '', document: subscriptionDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from 'path/to/documents';`);
      expect(content.content).toBeSimilarStringTo(`
        export const TestComponent = (props: TestComponentProps) => (
          <ApolloReactComponents.Subscription<TestSubscription, TestSubscriptionVariables> subscription={Operations.test} {...props} />
        );`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should import Operations from one external file and use it in useSubscription', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'path/to/documents.tsx',
        withComponent: false,
        withHooks: true,
        withHOC: false,
      };

      const docs = [{ location: '', document: subscriptionDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from 'path/to/documents';`);
      expect(content.content).toBeSimilarStringTo(`
      export function useTestSubscription(baseOptions?: ApolloReactHooks.SubscriptionHookOptions<TestSubscription, TestSubscriptionVariables>) {
        return ApolloReactHooks.useSubscription<TestSubscription, TestSubscriptionVariables>(Operations.test, baseOptions);
      }
      `);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should import Operations from one external file and use it in withSubscription', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'path/to/documents.tsx',
        withComponent: false,
        withHooks: false,
        withHOC: true,
      };

      const docs = [{ location: '', document: subscriptionDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from 'path/to/documents';`);
      expect(content.content).toBeSimilarStringTo(`
      export function withTest<TProps, TChildProps = {}>(operationOptions?: ApolloReactHoc.OperationOption<
        TProps,
        TestSubscription,
        TestSubscriptionVariables,
        TestProps<TChildProps>>) {
          return ApolloReactHoc.withSubscription<TProps, TestSubscription, TestSubscriptionVariables, TestProps<TChildProps>>(Operations.test, {
            alias: 'test',
            ...operationOptions
          });
      }
      `);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should import Operations from one external file and use it in multiple components', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'path/to/documents.tsx',
        withComponent: true,
        withHooks: false,
        withHOC: false,
      };

      const docs = [{ location: '', document: multipleOperationDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from 'path/to/documents';`);
      expect(content.content).toBeSimilarStringTo(`
      export const TestOneComponent = (props: TestOneComponentProps) => (
        <ApolloReactComponents.Query<TestOneQuery, TestOneQueryVariables> query={Operations.testOne} {...props} />
      );`);
      expect(content.content).toBeSimilarStringTo(`
        export const TestTwoComponent = (props: TestTwoComponentProps) => (
          <ApolloReactComponents.Mutation<TestTwoMutation, TestTwoMutationVariables> mutation={Operations.testTwo} {...props} />
        );`);
      expect(content.content).toBeSimilarStringTo(`
        export const TestThreeComponent = (props: TestThreeComponentProps) => (
          <ApolloReactComponents.Subscription<TestThreeSubscription, TestThreeSubscriptionVariables> subscription={Operations.testThree} {...props} />
        );`);

      await validateTypeScript(content, schema, docs, {});
    });

    it('should import Operations from one external file and use it in multiple hooks', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'path/to/documents.tsx',
        withComponent: false,
        withHooks: true,
        withHOC: false,
      };

      const docs = [{ location: '', document: multipleOperationDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from 'path/to/documents';`);
      expect(content.content).toBeSimilarStringTo(`
      export function useTestOneQuery(baseOptions?: ApolloReactHooks.QueryHookOptions<TestOneQuery, TestOneQueryVariables>) {
        return ApolloReactHooks.useQuery<TestOneQuery, TestOneQueryVariables>(Operations.testOne, baseOptions);
      }
      `);
      expect(content.content).toBeSimilarStringTo(`
      export function useTestOneLazyQuery(baseOptions?: ApolloReactHooks.LazyQueryHookOptions<TestOneQuery, TestOneQueryVariables>) {
        return ApolloReactHooks.useLazyQuery<TestOneQuery, TestOneQueryVariables>(Operations.testOne, baseOptions);
      }
      `);
      expect(content.content).toBeSimilarStringTo(`
      export function useTestTwoMutation(baseOptions?: ApolloReactHooks.MutationHookOptions<TestTwoMutation, TestTwoMutationVariables>) {
        return ApolloReactHooks.useMutation<TestTwoMutation, TestTwoMutationVariables>(Operations.testTwo, baseOptions);
      }
      `);

      expect(content.content).toBeSimilarStringTo(`
      export function useTestThreeSubscription(baseOptions?: ApolloReactHooks.SubscriptionHookOptions<TestThreeSubscription, TestThreeSubscriptionVariables>) {
        return ApolloReactHooks.useSubscription<TestThreeSubscription, TestThreeSubscriptionVariables>(Operations.testThree, baseOptions);
      }`);

      await validateTypeScript(content, schema, docs, {});
    });

    it('should import Operations from one external file and use it in multiple HOCs', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'path/to/documents.tsx',
        withComponent: false,
        withHooks: false,
        withHOC: true,
      };

      const docs = [{ location: '', document: multipleOperationDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from 'path/to/documents';`);
      expect(content.content).toBeSimilarStringTo(`
      export function withTestOne<TProps, TChildProps = {}>(operationOptions?: ApolloReactHoc.OperationOption<
        TProps,
        TestOneQuery,
        TestOneQueryVariables,
        TestOneProps<TChildProps>>) {
          return ApolloReactHoc.withQuery<TProps, TestOneQuery, TestOneQueryVariables, TestOneProps<TChildProps>>(Operations.testOne, {
            alias: 'testOne',
            ...operationOptions
          });
      }
      `);
      expect(content.content).toBeSimilarStringTo(`
      export function withTestTwo<TProps, TChildProps = {}>(operationOptions?: ApolloReactHoc.OperationOption<
        TProps,
        TestTwoMutation,
        TestTwoMutationVariables,
        TestTwoProps<TChildProps>>) {
          return ApolloReactHoc.withMutation<TProps, TestTwoMutation, TestTwoMutationVariables, TestTwoProps<TChildProps>>(Operations.testTwo, {
            alias: 'testTwo',
            ...operationOptions
          });
      }
      `);
      expect(content.content).toBeSimilarStringTo(`
      export function withTestThree<TProps, TChildProps = {}>(operationOptions?: ApolloReactHoc.OperationOption<
        TProps,
        TestThreeSubscription,
        TestThreeSubscriptionVariables,
        TestThreeProps<TChildProps>>) {
          return ApolloReactHoc.withSubscription<TProps, TestThreeSubscription, TestThreeSubscriptionVariables, TestThreeProps<TChildProps>>(Operations.testThree, {
            alias: 'testThree',
            ...operationOptions
          });
      }
      `);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should import Operations from near operation file for Query component', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'near-operation-file',
        withComponent: true,
        withHooks: false,
        withHOC: false,
      };

      const docs = [{ location: 'path/to/document.graphql', document: basicDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from './document.graphql';`);
      expect(content.content).toBeSimilarStringTo(`
        export const TestComponent = (props: TestComponentProps) => (
          <ApolloReactComponents.Query<TestQuery, TestQueryVariables> query={Operations.test} {...props} />
        );`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should import Operations from near operation file for useQuery and useLazyQuery', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'near-operation-file',
        withComponent: false,
        withHooks: true,
        withHOC: false,
      };

      const docs = [{ location: 'path/to/document.graphql', document: basicDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from './document.graphql';`);
      expect(content.content).toBeSimilarStringTo(`
      export function useTestQuery(baseOptions?: ApolloReactHooks.QueryHookOptions<TestQuery, TestQueryVariables>) {
        return ApolloReactHooks.useQuery<TestQuery, TestQueryVariables>(Operations.test, baseOptions);
      }
      `);
      expect(content.content).toBeSimilarStringTo(`
      export function useTestLazyQuery(baseOptions?: ApolloReactHooks.LazyQueryHookOptions<TestQuery, TestQueryVariables>) {
        return ApolloReactHooks.useLazyQuery<TestQuery, TestQueryVariables>(Operations.test, baseOptions);
      }
      `);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should import Operations from near operation file for withQuery', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'near-operation-file',
        withComponent: false,
        withHooks: false,
        withHOC: true,
      };

      const docs = [{ location: 'path/to/document.graphql', document: basicDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from './document.graphql';`);
      expect(content.content).toBeSimilarStringTo(`
      export function withTest<TProps, TChildProps = {}>(operationOptions?: ApolloReactHoc.OperationOption<
        TProps,
        TestQuery,
        TestQueryVariables,
        TestProps<TChildProps>>) {
          return ApolloReactHoc.withQuery<TProps, TestQuery, TestQueryVariables, TestProps<TChildProps>>(Operations.test, {
            alias: 'test',
            ...operationOptions
          });
      }
      `);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should import Operations from near operation file for Mutation component', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'near-operation-file',
        withComponent: true,
        withHooks: false,
        withHOC: false,
      };

      const docs = [{ location: 'path/to/document.graphql', document: mutationDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from './document.graphql';`);
      expect(content.content).toBeSimilarStringTo(`
      export const TestComponent = (props: TestComponentProps) => (
        <ApolloReactComponents.Mutation<TestMutation, TestMutationVariables> mutation={Operations.test} {...props} />
      );`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should import Operations from near operation file for useMutation', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'near-operation-file',
        withComponent: false,
        withHooks: true,
        withHOC: false,
      };

      const docs = [{ location: 'path/to/document.graphql', document: mutationDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from './document.graphql';`);
      expect(content.content).toBeSimilarStringTo(`
      export function useTestMutation(baseOptions?: ApolloReactHooks.MutationHookOptions<TestMutation, TestMutationVariables>) {
        return ApolloReactHooks.useMutation<TestMutation, TestMutationVariables>(Operations.test, baseOptions);
      }`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should import Operations from near operation file for withMutation', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'near-operation-file',
        withComponent: false,
        withHooks: false,
        withHOC: true,
      };

      const docs = [{ location: 'path/to/document.graphql', document: mutationDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from './document.graphql';`);
      expect(content.content).toBeSimilarStringTo(`
      export function withTest<TProps, TChildProps = {}>(operationOptions?: ApolloReactHoc.OperationOption<
        TProps,
        TestMutation,
        TestMutationVariables,
        TestProps<TChildProps>>) {
          return ApolloReactHoc.withMutation<TProps, TestMutation, TestMutationVariables, TestProps<TChildProps>>(Operations.test, {
            alias: 'test',
            ...operationOptions
          });
      }
      `);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should import Operations from near operation file for Subscription component', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'near-operation-file',
        withComponent: true,
        withHooks: false,
        withHOC: false,
      };

      const docs = [{ location: 'path/to/document.graphql', document: subscriptionDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from './document.graphql';`);
      expect(content.content).toBeSimilarStringTo(`
      export const TestComponent = (props: TestComponentProps) => (
        <ApolloReactComponents.Subscription<TestSubscription, TestSubscriptionVariables> subscription={Operations.test} {...props} />
      );`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should import Operations from near operation file for useSubscription', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'near-operation-file',
        withComponent: false,
        withHooks: true,
        withHOC: false,
      };

      const docs = [{ location: 'path/to/document.graphql', document: subscriptionDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from './document.graphql';`);
      expect(content.content).toBeSimilarStringTo(`
      export function useTestSubscription(baseOptions?: ApolloReactHooks.SubscriptionHookOptions<TestSubscription, TestSubscriptionVariables>) {
        return ApolloReactHooks.useSubscription<TestSubscription, TestSubscriptionVariables>(Operations.test, baseOptions);
      }`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should import Operations from near operation file for withSubscription', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'near-operation-file',
        withComponent: false,
        withHooks: false,
        withHOC: true,
      };

      const docs = [{ location: 'path/to/document.graphql', document: subscriptionDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from './document.graphql';`);
      expect(content.content).toBeSimilarStringTo(`
      export function withTest<TProps, TChildProps = {}>(operationOptions?: ApolloReactHoc.OperationOption<
        TProps,
        TestSubscription,
        TestSubscriptionVariables,
        TestProps<TChildProps>>) {
          return ApolloReactHoc.withSubscription<TProps, TestSubscription, TestSubscriptionVariables, TestProps<TChildProps>>(Operations.test, {
            alias: 'test',
            ...operationOptions
          });
      }`);
      await validateTypeScript(content, schema, docs, {});
    });

    it('should import Operations from near operation file and use it in multiple components', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'near-operation-file',
        withComponent: true,
        withHooks: false,
        withHOC: false,
      };

      const docs = [{ location: 'path/to/document.graphql', document: multipleOperationDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from './document.graphql';`);
      expect(content.content).toBeSimilarStringTo(`
      export const TestOneComponent = (props: TestOneComponentProps) => (
        <ApolloReactComponents.Query<TestOneQuery, TestOneQueryVariables> query={Operations.testOne} {...props} />
      );`);
      expect(content.content).toBeSimilarStringTo(`
        export const TestTwoComponent = (props: TestTwoComponentProps) => (
          <ApolloReactComponents.Mutation<TestTwoMutation, TestTwoMutationVariables> mutation={Operations.testTwo} {...props} />
        );`);
      expect(content.content).toBeSimilarStringTo(`
        export const TestThreeComponent = (props: TestThreeComponentProps) => (
          <ApolloReactComponents.Subscription<TestThreeSubscription, TestThreeSubscriptionVariables> subscription={Operations.testThree} {...props} />
        );`);

      await validateTypeScript(content, schema, docs, {});
    });

    it('should import Operations from near operation file and use it in multiple hooks', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'near-operation-file',
        withComponent: false,
        withHooks: true,
        withHOC: false,
      };

      const docs = [{ location: 'path/to/document.graphql', document: multipleOperationDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from './document.graphql';`);
      expect(content.content).toBeSimilarStringTo(`
      export function useTestOneQuery(baseOptions?: ApolloReactHooks.QueryHookOptions<TestOneQuery, TestOneQueryVariables>) {
        return ApolloReactHooks.useQuery<TestOneQuery, TestOneQueryVariables>(Operations.testOne, baseOptions);
      }
      `);
      expect(content.content).toBeSimilarStringTo(`
      export function useTestOneLazyQuery(baseOptions?: ApolloReactHooks.LazyQueryHookOptions<TestOneQuery, TestOneQueryVariables>) {
        return ApolloReactHooks.useLazyQuery<TestOneQuery, TestOneQueryVariables>(Operations.testOne, baseOptions);
      }
      `);
      expect(content.content).toBeSimilarStringTo(`
      export function useTestTwoMutation(baseOptions?: ApolloReactHooks.MutationHookOptions<TestTwoMutation, TestTwoMutationVariables>) {
        return ApolloReactHooks.useMutation<TestTwoMutation, TestTwoMutationVariables>(Operations.testTwo, baseOptions);
      }
      `);
      expect(content.content).toBeSimilarStringTo(`
      export function useTestThreeSubscription(baseOptions?: ApolloReactHooks.SubscriptionHookOptions<TestThreeSubscription, TestThreeSubscriptionVariables>) {
        return ApolloReactHooks.useSubscription<TestThreeSubscription, TestThreeSubscriptionVariables>(Operations.testThree, baseOptions);
      }`);

      await validateTypeScript(content, schema, docs, {});
    });

    it('should import Operations from near operation file and use it in multiple HOCs', async () => {
      const config: ReactApolloRawPluginConfig = {
        documentMode: DocumentMode.external,
        importDocumentNodeExternallyFrom: 'near-operation-file',
        withComponent: false,
        withHooks: false,
        withHOC: true,
      };

      const docs = [{ location: 'path/to/document.graphql', document: multipleOperationDoc }];

      const content = (await plugin(schema, docs, config, {
        outputFile: 'graphql.tsx',
      })) as Types.ComplexPluginOutput;

      expect(content.prepend).toContain(`import * as Operations from './document.graphql';`);
      expect(content.content).toBeSimilarStringTo(`
      export function withTestOne<TProps, TChildProps = {}>(operationOptions?: ApolloReactHoc.OperationOption<
        TProps,
        TestOneQuery,
        TestOneQueryVariables,
        TestOneProps<TChildProps>>) {
          return ApolloReactHoc.withQuery<TProps, TestOneQuery, TestOneQueryVariables, TestOneProps<TChildProps>>(Operations.testOne, {
            alias: 'testOne',
            ...operationOptions
          });
      }
      `);
      expect(content.content).toBeSimilarStringTo(`
      export function withTestTwo<TProps, TChildProps = {}>(operationOptions?: ApolloReactHoc.OperationOption<
        TProps,
        TestTwoMutation,
        TestTwoMutationVariables,
        TestTwoProps<TChildProps>>) {
          return ApolloReactHoc.withMutation<TProps, TestTwoMutation, TestTwoMutationVariables, TestTwoProps<TChildProps>>(Operations.testTwo, {
            alias: 'testTwo',
            ...operationOptions
          });
      }
      `);
      expect(content.content).toBeSimilarStringTo(`
      export function withTestThree<TProps, TChildProps = {}>(operationOptions?: ApolloReactHoc.OperationOption<
        TProps,
        TestThreeSubscription,
        TestThreeSubscriptionVariables,
        TestThreeProps<TChildProps>>) {
          return ApolloReactHoc.withSubscription<TProps, TestThreeSubscription, TestThreeSubscriptionVariables, TestThreeProps<TChildProps>>(Operations.testThree, {
            alias: 'testThree',
            ...operationOptions
          });
      }
      `);

      await validateTypeScript(content, schema, docs, {});
    });

    it(`should NOT import Operations if no operation collected: external mode and one file`, async () => {
      const docs = [
        {
          location: 'path/to/document.graphql',
          document: parse(/* GraphQL */ `
            fragment feedFragment on Entry {
              id
              commentCount
            }
          `),
        },
      ];
      const content = (await plugin(
        schema,
        docs,
        {
          documentMode: DocumentMode.external,
          importDocumentNodeExternallyFrom: 'near-operation-file',
        },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.prepend).not.toBeSimilarStringTo(`import * as Operations`);
      await validateTypeScript(content, schema, docs, {});
    });

    it(`should NOT import Operations if no operation collected: external mode and multiple files`, async () => {
      const docs = [
        {
          location: 'a.graphql',
          document: parse(/* GraphQL */ `
            fragment feedFragment1 on Entry {
              id
              commentCount
            }
          `),
        },
        {
          location: 'b.graphql',
          document: parse(/* GraphQL */ `
            fragment feedFragment2 on Entry {
              id
              commentCount
            }
          `),
        },
      ];
      const content = (await plugin(
        schema,
        docs,
        {
          documentMode: DocumentMode.external,
          importDocumentNodeExternallyFrom: 'path/to/documents.tsx',
        },
        {
          outputFile: 'graphql.tsx',
        }
      )) as Types.ComplexPluginOutput;

      expect(content.prepend).not.toBeSimilarStringTo(`import * as Operations`);
      await validateTypeScript(content, schema, docs, {});
    });
  });
});
