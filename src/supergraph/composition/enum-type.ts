import { Deprecated, Description, EnumType } from '../../subgraph/state.js';
import { createEnumTypeNode } from './ast.js';
import type { MapByGraph, TypeBuilder } from './common.js';

export function enumTypeBuilder(): TypeBuilder<EnumType, EnumTypeState> {
  return {
    visitSubgraphState(graph, state, typeName, type) {
      const enumTypeState = getOrCreateEnumType(state, typeName);

      type.tags.forEach(tag => enumTypeState.tags.add(tag));

      if (type.inaccessible) {
        enumTypeState.inaccessible = true;
      }

      if (type.isDefinition) {
        enumTypeState.hasDefinition = true;
      }

      // First description wins
      if (type.description && !enumTypeState.description) {
        enumTypeState.description = type.description;
      }

      if (type.referencedByInputType) {
        enumTypeState.referencedByInputType = true;

        type.inputTypeReferences.forEach(ref => {
          enumTypeState.inputTypeReferences.add(ref);
        });
      }

      if (type.referencedByOutputType) {
        enumTypeState.referencedByOutputType = true;

        type.outputTypeReferences.forEach(ref => {
          enumTypeState.outputTypeReferences.add(ref);
        });
      }

      enumTypeState.byGraph.set(graph.id, {
        inaccessible: type.inaccessible,
      });

      for (const value of type.values.values()) {
        const valueState = getOrCreateEnumValue(enumTypeState, value.name);

        value.tags.forEach(tag => valueState.tags.add(tag));

        if (value.inaccessible) {
          valueState.inaccessible = true;
        }

        // First deprecation wins
        if (value.deprecated && !valueState.deprecated) {
          valueState.deprecated = value.deprecated;
        }

        // First description wins
        if (value.description && !valueState.description) {
          valueState.description = value.description;
        }

        valueState.byGraph.set(graph.id, {
          inaccessible: value.inaccessible,
        });
      }
    },
    composeSupergraphNode(enumType: EnumTypeState) {
      const mergeMethod = decideOnEnumMergeStrategy(
        enumType.referencedByInputType,
        enumType.referencedByOutputType,
      );

      const values =
        mergeMethod === 'intersection'
          ? intersectionOfEnumValues(enumType)
          : Array.from(enumType.values);

      // intersection -> get values defined in all graphs
      // union -> get values defined in any graph
      // equal -> values are equal across all graphs

      return createEnumTypeNode({
        name: enumType.name,
        values: values.map(([_, value]) => ({
          name: value.name,
          join: {
            enumValue: Array.from(value.byGraph.keys()).map(graph => ({
              graph: graph.toUpperCase(),
            })),
          },
          tags: Array.from(value.tags),
          inaccessible: value.inaccessible,
          description: value.description,
          deprecated: value.deprecated,
        })),
        tags: Array.from(enumType.tags),
        inaccessible: enumType.inaccessible,
        description: enumType.description,
        join: {
          type: Array.from(enumType.byGraph.keys()).map(graphName => ({
            graph: graphName.toUpperCase(),
          })),
        },
      });
    },
  };
}

function decideOnEnumMergeStrategy(
  referencedByInputType: boolean,
  referencedByOutputType: boolean,
) {
  if (referencedByInputType === referencedByOutputType) {
    return 'equal';
  }

  if (referencedByInputType) {
    return 'intersection';
  }

  if (referencedByOutputType) {
    return 'union';
  }

  return 'equal';
}

function intersectionOfEnumValues(enumType: EnumTypeState) {
  const numberOfGraphs = enumType.byGraph.size;
  return Array.from(enumType.values).filter(([_, value]) => value.byGraph.size === numberOfGraphs);
}

export type EnumTypeState = {
  name: string;
  tags: Set<string>;
  inaccessible: boolean;
  hasDefinition: boolean;
  description?: Description;
  byGraph: MapByGraph<EnumTypeStateInGraph>;
  referencedByInputType: boolean; // used only by input types - intersection of values from subgraphs
  referencedByOutputType: boolean; // used only by output types - union of values from subgraphs
  inputTypeReferences: Set<string>;
  outputTypeReferences: Set<string>;
  values: Map<string, EnumValueState>;
};

type EnumValueState = {
  name: string;
  tags: Set<string>;
  inaccessible: boolean;
  deprecated?: Deprecated;
  description?: Description;
  byGraph: MapByGraph<EnumValueStateInGraph>;
};

type EnumTypeStateInGraph = {
  inaccessible: boolean;
};

type EnumValueStateInGraph = {
  inaccessible: boolean;
};

function getOrCreateEnumType(state: Map<string, EnumTypeState>, typeName: string) {
  const existing = state.get(typeName);

  if (existing) {
    return existing;
  }

  const def: EnumTypeState = {
    name: typeName,
    values: new Map(),
    tags: new Set(),
    hasDefinition: false,
    inaccessible: false,
    referencedByInputType: false,
    referencedByOutputType: false,
    inputTypeReferences: new Set(),
    outputTypeReferences: new Set(),
    byGraph: new Map(),
  };

  state.set(typeName, def);

  return def;
}

function getOrCreateEnumValue(enumTypeState: EnumTypeState, enumValueName: string) {
  const existing = enumTypeState.values.get(enumValueName);

  if (existing) {
    return existing;
  }

  const def: EnumValueState = {
    name: enumValueName,
    tags: new Set(),
    inaccessible: false,
    byGraph: new Map(),
  };

  enumTypeState.values.set(enumValueName, def);

  return def;
}
