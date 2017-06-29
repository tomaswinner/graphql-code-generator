import * as fs from 'fs';
import gql from 'graphql-tag';
import { introspectionToGraphQLSchema } from '../src/utils/introspection-to-schema';
import { GraphQLSchema } from 'graphql';
import { transformDocument } from '../src/operations/transform-document'; import {
  SelectionSetFieldNode, SelectionSetFragmentSpread,
  SelectionSetInlineFragment
} from '../src/types';

describe('transformDocument', () => {
  let schema: GraphQLSchema;

  beforeAll(() => {
    schema = introspectionToGraphQLSchema(JSON.parse(fs.readFileSync('../graphql-codegen-generators/dev-test/githunt/schema.json').toString()));
  });

  it('should return correct result when using simple fragment', () => {
    const fragment = gql`
      fragment MyFragment on User {
        login
        avatar_url
      }`;

    const document = transformDocument(schema, fragment);

    expect(document.operations.length).toBe(0);
    expect(document.fragments.length).toBe(1);
    expect(document.fragments[0].name).toBe('MyFragment');
    expect(document.fragments[0].onType).toBe('User');
    expect(document.fragments[0].selectionSet.length).toBe(2);
    const first = document.fragments[0].selectionSet[0] as SelectionSetFieldNode;
    const second = document.fragments[0].selectionSet[1] as SelectionSetFieldNode;
    expect(first.name).toBe('login');
    expect(second.name).toBe('avatar_url');
    expect(first.type).toBe('String');
    expect(second.type).toBe('String');
    expect(first.isRequired).toBeTruthy();
    expect(second.isRequired).toBeTruthy();
    expect(first.isArray).toBeFalsy();
    expect(second.isArray).toBeFalsy();
    expect(first.selectionSet.length).toBe(0);
    expect(second.selectionSet.length).toBe(0);
    expect(first.arguments.length).toBe(0);
    expect(second.arguments.length).toBe(0);
  });

  it('should return correct result when using 2 levels fragment', () => {
    const fragment = gql`
      fragment RepoInfo on Entry {
        createdAt
        repository {
          description
          stargazers_count
          open_issues_count
        }
        postedBy {
          html_url
          login
        }
      }
    `;

    const document = transformDocument(schema, fragment);

    expect(document.operations.length).toBe(0);
    expect(document.fragments.length).toBe(1);
    expect(document.fragments[0].name).toBe('RepoInfo');
    expect(document.fragments[0].onType).toBe('Entry');
    expect(document.fragments[0].selectionSet.length).toBe(3);
    expect((document.fragments[0].selectionSet[0] as SelectionSetFieldNode).selectionSet.length).toBe(0);
    expect((document.fragments[0].selectionSet[1] as SelectionSetFieldNode).selectionSet.length).toBe(3);
    expect((document.fragments[0].selectionSet[2] as SelectionSetFieldNode).selectionSet.length).toBe(2);
  });

  it('should return correct result when using fragment with inline fragment', () => {
    const fragment = gql`
      fragment MyFragment on Entry {
        createdAt
        repository {
          ... on Repository {
            description
            stargazers_count
            open_issues_count
          }
        }
      }
    `;

    const document = transformDocument(schema, fragment);

    expect(document.operations.length).toBe(0);
    expect(document.fragments.length).toBe(1);
    expect(document.fragments[0].name).toBe('MyFragment');
    expect(document.fragments[0].onType).toBe('Entry');
    expect(document.fragments[0].selectionSet.length).toBe(2);
    expect((document.fragments[0].selectionSet[1] as SelectionSetFieldNode).selectionSet.length).toBe(1);
    expect(((document.fragments[0].selectionSet[1] as SelectionSetFieldNode).selectionSet[0] as SelectionSetInlineFragment).selectionSet.length).toBe(3);
    expect(((document.fragments[0].selectionSet[1] as SelectionSetFieldNode).selectionSet[0] as SelectionSetInlineFragment).onType).toBe('Repository');
  });

  it('should return correct result when using 2 fragments with fragment spread', () => {
    const fragment = gql`
      fragment MyFragment on Entry {
        createdAt
        repository {
          ...RepoFragment
        }
      }

      fragment RepoFragment on Repository {
        description
        stargazers_count
        open_issues_count
      }
    `;

    const document = transformDocument(schema, fragment);

    expect(document.operations.length).toBe(0);
    expect(document.fragments.length).toBe(2);
    expect(document.fragments[0].name).toBe('MyFragment');
    expect(document.fragments[0].onType).toBe('Entry');
    expect(document.fragments[1].name).toBe('RepoFragment');
    expect(document.fragments[1].onType).toBe('Repository');
    expect(document.fragments[0].selectionSet.length).toBe(2);
    expect((document.fragments[0].selectionSet[1] as SelectionSetFieldNode).selectionSet.length).toBe(1);
    expect(((document.fragments[0].selectionSet[1] as SelectionSetFieldNode).selectionSet[0] as SelectionSetFragmentSpread).fragmentName).toBe('RepoFragment');
  });
});
