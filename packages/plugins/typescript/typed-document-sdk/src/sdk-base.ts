import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import type {
  ArgumentNode,
  DocumentNode,
  FieldNode,
  InlineFragmentNode,
  Kind,
  ListTypeNode,
  NamedTypeNode,
  NonNullTypeNode,
  OperationTypeNode,
  SelectionNode,
  SelectionSetNode,
  TypeNode,
  VariableDefinitionNode,
} from 'graphql';
// IMPORTS END

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

type Impossible<K extends keyof any> = {
  [P in K]: never;
};

/** Do not allow any other properties as the ones defined in the base type. */
type NoExtraProperties<T, U extends T = T> = U & Impossible<Exclude<keyof U, keyof T>>;

/** Require at least one property in the object defined. */
type AtLeastOnePropertyOf<T> = Exclude<
  {
    [K in keyof T]: { [L in K]-?: T[L] } & { [L in Exclude<keyof T, K>]?: T[L] };
  }[keyof T],
  void
>;

/**
 * @source https://stackoverflow.com/a/56874389/4202031
 */
type KeysMatching<T extends { [key: string]: any }, V> = {
  [K in keyof T]-?: T[K] extends V ? K : never;
}[keyof T];

type SDKSelection = { [key: string]: any };

type ResultType = { [key: string]: any };

type SDKInlineFragmentKey<T extends string> = `...${T}`;

export const SDKFieldArgumentSymbol: unique symbol = Symbol('sdk.arguments');
export const SDKUnionResultSymbol: unique symbol = Symbol('sdk.union');

type SDKExtractUnionTargets<TSelection extends Record<string, any>, TUnionMember extends string> = Exclude<
  TSelection,
  null | undefined | never | { [key in `...${TUnionMember}`]?: never | undefined | void }
>;

type SDKOperationTypeInner<TSelection extends SDKSelection, TResultType extends Record<any, any>> =
  // union narrowing
  typeof SDKUnionResultSymbol extends keyof TResultType
    ? {
        [TUnionMember in keyof TResultType]: TUnionMember extends string
          ? SDKInlineFragmentKey<TUnionMember> extends keyof SDKExtractUnionTargets<TSelection, TUnionMember> // check whether all union members are covered
            ? // all union members are covered
              SDKOperationType<
                SDKExtractUnionTargets<TSelection, TUnionMember>[SDKInlineFragmentKey<TUnionMember>],
                TResultType[TUnionMember]
              >
            : // not all union members are covered
              {}
          : never;
        // transform result into TypeScript union
      }[Exclude<keyof TResultType, typeof SDKUnionResultSymbol>]
    : // object with selection set
      SDKOperationType<TSelection, TResultType>;

type SDKNonNullable<T extends null> = Exclude<T, null>;

type SDKSelectionKeysWithoutArguments<TSelection extends SDKSelection> = Exclude<
  keyof TSelection,
  typeof SDKFieldArgumentSymbol
>;

type SDKOperationType<TSelection extends SDKSelection, TResultType extends ResultType> = {
  // check whether field in in result type
  [TSelectionField in SDKSelectionKeysWithoutArguments<TSelection>]: TSelectionField extends keyof TResultType
    ? TSelection[TSelectionField] extends boolean
      ? TResultType[TSelectionField]
      : null extends TResultType[TSelectionField]
      ? SDKOperationTypeInner<TSelection[TSelectionField], SDKNonNullable<TResultType[TSelectionField]>> | null
      : SDKOperationTypeInner<TSelection[TSelectionField], TResultType[TSelectionField]>
    : never;
};

export type SDKSelectionSet<TType> = AtLeastOnePropertyOf<NoExtraProperties<TType>>;

export type SDKUnionSelectionSet<TType extends Record<string, any> = any> = AtLeastOnePropertyOf<
  NoExtraProperties<TType>
>;

type SDKInputTypeMap = { [inputTypeName: string]: any };

type SDKArgumentType<
  T_SDKInputTypeMap extends SDKInputTypeMap,
  T_VariableDefinitions extends SDKVariableDefinitions<T_SDKInputTypeMap>
> = {
  [T_VariableName in keyof T_VariableDefinitions]: SDKInputContainerUnwrap<
    T_SDKInputTypeMap,
    T_VariableDefinitions[T_VariableName]
  >;
};

type SDKSelectionTypedDocumentNode<
  T_Selection,
  T_ResultType extends ResultType,
  T_SDKInputTypeMap extends SDKInputTypeMap | void,
  T_VariableDefinitions extends SDKVariableDefinitions<
    T_SDKInputTypeMap extends void ? never : T_SDKInputTypeMap
  > | void
> = TypedDocumentNode<
  SDKOperationType<T_Selection, T_ResultType>,
  T_SDKInputTypeMap extends SDKInputTypeMap
    ? T_VariableDefinitions extends SDKVariableDefinitions<T_SDKInputTypeMap>
      ? SDKArgumentType<T_SDKInputTypeMap, T_VariableDefinitions>
      : never
    : never
>;

type SDKInputNonNullType<T extends string> = `${T}!`;
type SDKInputListType<T extends string> = `[${T}]`;

/**
 * Poor mans implementation, this should actually be recursive as you could potentially indefinitely nest non nullable and list types...
 * Right now we only allow Type, [Type], [Type]!, [Type!] and [Type!]!
 */
type SDKInputContainerType<TTaxonomy extends string> =
  | TTaxonomy
  | SDKInputNonNullType<TTaxonomy>
  | SDKInputListType<TTaxonomy>
  | SDKInputNonNullType<SDKInputListType<TTaxonomy>>
  | SDKInputListType<SDKInputNonNullType<TTaxonomy>>
  | SDKInputNonNullType<SDKInputListType<SDKInputNonNullType<TTaxonomy>>>;

/**
 * Unwrap something like [Type!] to the actual runtime type.
 */
type SDKInputContainerUnwrap<
  T_SDKInputTypeMap extends SDKInputTypeMap,
  T_Typename extends keyof SDKVariableDefinitions<T_SDKInputTypeMap>
> = T_Typename extends keyof T_SDKInputTypeMap
  ? T_SDKInputTypeMap[T_Typename] | null | undefined
  : T_Typename extends SDKInputNonNullType<infer Inner>
  ? Exclude<SDKInputContainerUnwrap<T_SDKInputTypeMap, Inner>, null | undefined>
  : T_Typename extends SDKInputListType<infer Inner>
  ? Array<SDKInputContainerUnwrap<T_SDKInputTypeMap, Inner>>
  : never;

type SDKVariableDefinitions<TSDKInputTypeMap extends SDKInputTypeMap> = {
  [key: string]: SDKInputContainerType<Exclude<keyof TSDKInputTypeMap, number | symbol>>;
};

type SDKSelectionWithVariables<
  /** GraphQLTypeName -> TS type */
  T_SDKInputTypeMap extends SDKInputTypeMap,
  T_SDKPossibleSelectionSet extends SDKSelectionSet<any>,
  T_SDKUserSelectionSet extends SDKSelectionSet<any>,
  T_ArgumentType,
  /** variableName -> GraphQLTypeName */
  T_VariableDefinitions extends SDKVariableDefinitions<T_SDKInputTypeMap> | void
> =
  | {
      [U_FieldName in keyof T_SDKUserSelectionSet]: U_FieldName extends typeof SDKFieldArgumentSymbol
        ? T_VariableDefinitions extends SDKVariableDefinitions<T_SDKInputTypeMap>
          ? T_ArgumentType extends { [SDKFieldArgumentSymbol]: infer U_Arguments }
            ? {
                // From T_VariableDefinitions we want all keys whose value matches `U_Arguments[V_ArgumentName]`
                [V_ArgumentName in keyof T_SDKUserSelectionSet[U_FieldName] /* ArgumentType */]: KeysMatching<
                  T_VariableDefinitions,
                  // all legit argument values
                  V_ArgumentName extends keyof U_Arguments ? U_Arguments[V_ArgumentName] : never
                >;
              }
            : never
          : never
        : U_FieldName extends keyof T_SDKPossibleSelectionSet
        ? T_SDKUserSelectionSet[U_FieldName] extends SDKSelectionSet<any>
          ? SDKSelectionWithVariables<
              T_SDKInputTypeMap,
              T_SDKPossibleSelectionSet[U_FieldName],
              T_SDKUserSelectionSet[U_FieldName],
              U_FieldName extends keyof T_ArgumentType ? T_ArgumentType[U_FieldName] : never,
              T_VariableDefinitions
            >
          : T_SDKUserSelectionSet[U_FieldName]
        : never;
    };

type SDK<
  T_SDKInputTypeMap extends SDKInputTypeMap,
  T_SDKQuerySelectionSet extends SDKSelectionSet<any>,
  T_QueryArgumentType,
  T_QueryResultType extends ResultType,
  T_SDKMutationSelectionSet extends SDKSelectionSet<any> | void = void,
  T_SDKMutationArgumentType = void,
  T_MutationResultType extends ResultType | void = void,
  T_SDKSubscriptionSelectionSet extends SDKSelectionSet<any> | void = void,
  T_SDKSubscriptionArgumentType = void,
  T_SubscriptionResultType extends ResultType | void = void
> = {
  arguments: typeof SDKFieldArgumentSymbol;
  /**
   * Build a query operation document node.
   */
  query<
    Q_VariableDefinitions extends SDKVariableDefinitions<T_SDKInputTypeMap> | void,
    Q_Selection extends T_SDKQuerySelectionSet
  >(
    args: (
      | {
          name: string;
          variables?: Q_VariableDefinitions;
        }
      | {
          name?: never;
          variables?: never;
        }
    ) & {
      selection: SDKSelectionWithVariables<
        T_SDKInputTypeMap,
        T_SDKQuerySelectionSet,
        Q_Selection,
        T_QueryArgumentType,
        Q_VariableDefinitions
      >;
    }
  ): SDKSelectionTypedDocumentNode<Q_Selection, T_QueryResultType, T_SDKInputTypeMap, Q_VariableDefinitions>;
} & (T_SDKMutationSelectionSet extends SDKSelectionSet<any>
  ? T_MutationResultType extends ResultType
    ? {
        /**
         * Build a mutation operation document node.
         */
        mutation<
          M_VariableDefinitions extends SDKVariableDefinitions<T_SDKInputTypeMap>,
          M_Selection extends T_SDKMutationSelectionSet
        >(
          args: (
            | {
                name: string;
                variables?: M_VariableDefinitions;
              }
            | {
                name?: never;
                variables?: never;
              }
          ) & {
            selection: SDKSelectionWithVariables<
              T_SDKInputTypeMap,
              T_SDKMutationSelectionSet,
              M_Selection,
              T_SDKMutationArgumentType,
              M_VariableDefinitions
            >;
          }
        ): SDKSelectionTypedDocumentNode<M_Selection, T_MutationResultType, T_SDKInputTypeMap, M_VariableDefinitions>;
      }
    : {}
  : {}) &
  (T_SDKSubscriptionSelectionSet extends SDKSelectionSet<any>
    ? T_SubscriptionResultType extends ResultType
      ? {
          /**
           * Build a subscription operation document node.
           */
          subscription<
            S_VariableDefinitions extends SDKVariableDefinitions<T_SDKInputTypeMap>,
            S_Selection extends T_SDKSubscriptionSelectionSet
          >(
            args: (
              | {
                  name: string;
                  variables?: S_VariableDefinitions;
                }
              | {
                  name?: never;
                  variables?: never;
                }
            ) & {
              selection: SDKSelectionWithVariables<
                T_SDKInputTypeMap,
                T_SDKSubscriptionSelectionSet,
                S_Selection,
                T_SDKSubscriptionArgumentType,
                S_VariableDefinitions
              >;
            }
          ): SDKSelectionTypedDocumentNode<
            S_Selection,
            T_SubscriptionResultType,
            T_SDKInputTypeMap,
            S_VariableDefinitions
          >;
        }
      : {}
    : {});

const getBaseDocument = (
  operation: 'query' | 'mutation' | 'subscription',
  name: string | undefined,
  variableDefinitions: Array<VariableDefinitionNode>,
  selectionSet: SelectionSetNode
): DocumentNode => ({
  kind: 'Document' as Kind.DOCUMENT,
  definitions: [
    {
      kind: 'OperationDefinition' as Kind.OPERATION_DEFINITION,
      name: name
        ? {
            kind: 'Name' as Kind.NAME,
            value: name,
          }
        : undefined,
      operation: operation as OperationTypeNode,
      variableDefinitions,
      selectionSet,
    },
  ],
});

const buildSelectionSet = (sdkSelectionSet: SDKSelectionSet<Record<string, any>>): SelectionSetNode => {
  const selections: Array<SelectionNode> = [];

  for (const [fieldName, selectionValue] of Object.entries(sdkSelectionSet)) {
    const fieldNode: Mutable<FieldNode> | Mutable<InlineFragmentNode> = fieldName.startsWith('...')
      ? {
          kind: 'InlineFragment' as Kind.INLINE_FRAGMENT,
          typeCondition: {
            kind: 'NamedType' as Kind.NAMED_TYPE,
            name: {
              kind: 'Name' as Kind.NAME,
              value: fieldName.replace('...', ''),
            },
          },
          // we lazily add this no need for adding a noop one here ok?
          selectionSet: null as any,
        }
      : {
          kind: 'Field' as Kind.FIELD,
          name: {
            kind: 'Name' as Kind.NAME,
            value: fieldName,
          },
        };

    if (typeof selectionValue === 'object') {
      fieldNode.selectionSet = buildSelectionSet(selectionValue);

      if (SDKFieldArgumentSymbol in selectionValue) {
        const args: Array<ArgumentNode> = [];
        for (const [argumentName, variableName] of Object.entries(selectionValue[SDKFieldArgumentSymbol])) {
          if (typeof variableName !== 'string') {
            continue;
          }
          args.push({
            kind: 'Argument' as Kind.ARGUMENT,
            name: {
              kind: 'Name' as Kind.NAME,
              value: argumentName,
            },
            value: {
              kind: 'Variable' as Kind.VARIABLE,
              name: {
                kind: 'Name' as Kind.NAME,
                value: variableName,
              },
            },
          });
        }
        if (args.length) {
          (fieldNode as Mutable<FieldNode>).arguments = args;
        }
      }
    }
    selections.push(fieldNode);
  }

  const selectionSet: SelectionSetNode = {
    kind: 'SelectionSet' as Kind.SELECTION_SET,
    selections,
  };

  return selectionSet;
};

/**
 * Poor mans GraphQL `parseType` (https://github.com/graphql/graphql-js/blob/a91fdc600f2012a60e44356c373e51c5dd20ba81/src/language/parser.ts#L157-L166)
 * But in a more compact way :)
 */
const buildTypeNode = (name: string): TypeNode => {
  let entry: Mutable<ListTypeNode | NonNullTypeNode>;
  let previous: Mutable<ListTypeNode | NonNullTypeNode>;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (name.endsWith('!')) {
      name = name.substring(0, name.length - 1);
      const current: NonNullTypeNode = {
        kind: 'NonNullType' as Kind.NON_NULL_TYPE,
        // Yeah... this is illegal - but we assign it in the next loop run
        type: null,
      };
      if (previous) {
        previous.type = current;
        previous = current;
      } else if (!entry) {
        entry = previous = current;
      }
      continue;
    }
    if (name.endsWith(']')) {
      name = name.substring(1, name.length - 1);
      const current: ListTypeNode = {
        kind: 'ListType' as Kind.LIST_TYPE,
        // Yeah... this is illegal - but we assign it in the next loop run
        type: null,
      };
      if (previous) {
        previous.type = current;
        previous = current;
      } else if (!entry) {
        entry = previous = current;
      }
      continue;
    }
    break;
  }

  const last: NamedTypeNode = {
    kind: 'NamedType' as Kind.NAMED_TYPE,
    name: {
      kind: 'Name' as Kind.NAME,
      value: name,
    },
  };

  if (entry === undefined) {
    return last;
  }

  previous.type = last;
  return entry;
};

const buildVariableDefinitions = (args: Record<string, string>): Array<VariableDefinitionNode> => {
  const variableDefinitions: Array<VariableDefinitionNode> = [];
  for (const [variableName, inputType] of Object.entries(args)) {
    variableDefinitions.push({
      kind: 'VariableDefinition' as Kind.VARIABLE_DEFINITION,
      variable: {
        kind: 'Variable' as Kind.VARIABLE,
        name: {
          kind: 'Name' as Kind.NAME,
          value: variableName,
        },
      },
      type: buildTypeNode(inputType),
    });
  }

  return variableDefinitions;
};

const sdkHandler =
  (operationType: 'query' | 'mutation' | 'subscription') =>
  (args: { name?: string; variables?: Record<string, string>; selection: SDKSelection }) => {
    const variableDefinitions = buildVariableDefinitions(args.variables ?? {});
    const selectionSet = buildSelectionSet(args.selection);

    const document = getBaseDocument(operationType, args.name, variableDefinitions, selectionSet);

    // type as any so the TypeScript compiler has less work to do :)
    return document as any;
  };

export function createSDK<
  T_SDKInputTypeMap extends SDKInputTypeMap,
  T_SDKQuerySelectionSet extends SDKSelectionSet<any>,
  T_SDKQueryArguments,
  T_QueryResultType extends ResultType,
  T_SDKMutationSelectionSet extends SDKSelectionSet<any> | void = void,
  T_SDKMutationArguments = void,
  T_MutationResultType extends ResultType | void = void,
  T_SDKSubscriptionSelectionSet extends SDKSelectionSet<any> | void = void,
  T_SDKSubscriptionArguments = void,
  T_SubscriptionResultType extends ResultType | void = void
>(): SDK<
  T_SDKInputTypeMap,
  T_SDKQuerySelectionSet,
  T_SDKQueryArguments,
  T_QueryResultType,
  T_SDKMutationSelectionSet,
  T_SDKMutationArguments,
  T_MutationResultType,
  T_SDKSubscriptionSelectionSet,
  T_SDKSubscriptionArguments,
  T_SubscriptionResultType
> {
  return {
    query: sdkHandler('query'),
    mutation: sdkHandler('mutation'),
    subscription: sdkHandler('subscription'),
    arguments: SDKFieldArgumentSymbol,
  } as any;
}
