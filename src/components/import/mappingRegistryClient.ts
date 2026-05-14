import { createLocalStorageMappingStore, createMemoryMappingRegistry, type MappingRegistry } from "@/lib/operations/adapters";

let clientRegistry: MappingRegistry | null = null;

export function getMappingRegistry(): MappingRegistry {
  if (typeof window === "undefined") return createMemoryMappingRegistry();
  if (!clientRegistry) clientRegistry = createLocalStorageMappingStore(localStorage);
  return clientRegistry;
}
