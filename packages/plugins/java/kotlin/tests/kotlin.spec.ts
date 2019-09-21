import '@graphql-codegen/testing';
import { buildSchema } from 'graphql';
import { plugin } from '../src/index';

const OUTPUT_FILE = 'com/kotlin/generated/resolvers.kt';

describe('Kotlin', () => {
  // language=GraphQL
  const schema = buildSchema(`
    type Query {
      me: User!
      user(id: ID!): User!
      searchUser(searchFields: SearchUser!): [User!]!
    }

    input InputWithArray {
      f: [String]
      g: [SearchUser]
    }

    input SearchUser {
      username: String
      email: String
      name: String
      sort: ResultSort
      metadata: MetadataSearch
    }

    input MetadataSearch {
      something: Int
    }

    enum ResultSort {
      ASC
      DESC
    }

    interface Node {
      id: ID!
    }

    type User implements Node {
      id: ID!
      username: String!
      email: String!
      name: String
      friends(skip: Int, limit: Int): [User!]!
    }

    type Chat implements Node {
      id: ID!
      users: [User!]!
      title: String
    }

    enum UserRole {
      ADMIN
      USER
      EDITOR
    }

    union SearchResult = Chat | User
  `);

  // TODO need a parser
  // it('Should produce valid Kotlin code', async () => {
  //   const result = await plugin(schema, [], {}, { outputFile: OUTPUT_FILE }) as string;
  //
  //   validateJava(result);
  // });

  describe('Config', () => {
    it('Should use the correct package name by default', async () => {
      const result = await plugin(schema, [], {}, { outputFile: OUTPUT_FILE });

      expect(result).toContain(`package com.kotlin.generated\n`);
    });

    it('Should use the package name provided from the config', async () => {
      const result = await plugin(schema, [], { package: 'com.my.package' }, { outputFile: OUTPUT_FILE });

      expect(result).toContain(`package com.my.package\n`);
    });
  });

  describe('Enums', () => {
    it('Should generate basic enums correctly', async () => {
      const result = await plugin(schema, [], {}, { outputFile: OUTPUT_FILE });

      // language=kotlin
      expect(result).toBeSimilarStringTo(`    enum class UserRole(val label: String) {
        Admin("ADMIN"),
        User("USER"),
        Editor("EDITOR");
        
        companion object {
          @JvmStatic
          fun valueOfLabel(label: String): UserRole? {
            return values().find { it.label == label }
          }
        }
      }`);
    });

    it('Should allow to override enum values with custom values', async () => {
      const result = await plugin(
        schema,
        [],
        {
          enumValues: {
            UserRole: {
              ADMIN: 'AdminRoleValue',
            },
          },
        },
        { outputFile: OUTPUT_FILE }
      );

      expect(result).toContain(`Admin("AdminRoleValue"),`);
      expect(result).toContain(`User("USER"),`);
    });
  });

  describe('Input Types / Arguments', () => {
    it('Should generate arguments correctly when using Array', async () => {
      const result = await plugin(schema, [], {}, { outputFile: OUTPUT_FILE });

      // language=kotlin
      expect(result).toBeSimilarStringTo(`data class InputWithArrayInput(
        val f: Iterable<String>? = null,
        val g: Iterable<SearchUserInput>? = null
      ) {
        constructor(args: Map<String, Any>) : this(
          args.get("f") as Iterable<String>?,
          args.get("g")?.let { g -> (g as List<Map<String, Any>>).map { SearchUserInput(it) } }
        )
      }`);
    });

    it('Should generate input class per each type with field arguments', async () => {
      const result = await plugin(schema, [], {}, { outputFile: OUTPUT_FILE });

      // language=kotlin
      expect(result).toBeSimilarStringTo(`data class UserFriendsArgs(
        val skip: Int? = null,
        val limit: Int? = null
      ) {
        constructor(args: Map<String, Any>) : this(
          args.get("skip") as Int?,
          args.get("limit") as Int?
        )
      }`);
    });

    it('Should generate input class per each query with arguments', async () => {
      const result = await plugin(schema, [], {}, { outputFile: OUTPUT_FILE });

      // language=kotlin
      expect(result).toBeSimilarStringTo(`data class QueryUserArgs(
        val id: Any
      ) {
        constructor(args: Map<String, Any>) : this(
          args.get("id") as Any
        )
      }`);

      // language=kotlin
      expect(result).toBeSimilarStringTo(`data class QuerySearchUserArgs(
        val searchFields: SearchUserInput
      ) {
        constructor(args: Map<String, Any>) : this(
            args.get("searchFields")!!.let { SearchUserInput(it as Map<String, Any>) }
        )
      }`);
    });

    it('Should generate input class per each input, also with nested input types', async () => {
      const result = await plugin(schema, [], {}, { outputFile: OUTPUT_FILE });

      // language=kotlin
      expect(result).toBeSimilarStringTo(`data class MetadataSearchInput(
          val something: Int? = null
        ) {
          constructor(args: Map<String, Any>) : this(
              args.get("something") as Int?
          )
        }`);

      // language=kotlin
      expect(result).toBeSimilarStringTo(`data class SearchUserInput(
          val username: String? = null,
          val email: String? = null,
          val name: String? = null,
          val sort: ResultSort? = null,
          val metadata: MetadataSearchInput? = null
        ) {
          constructor(args: Map<String, Any>) : this(
              args.get("username") as String?,
              args.get("email") as String?,
              args.get("name") as String?,
              args.get("sort") as ResultSort?,
              args.get("metadata")?.let { MetadataSearchInput(it as Map<String, Any>) }
          )
        }`);
    });
  });
});
